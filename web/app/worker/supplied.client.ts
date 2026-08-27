import { fail } from "../../engine/core/errors.js";
import type { SuppliedProbe } from "../../engine/job/suppliedProbe.js";
import type { FamilyProbeSettings } from "../../engine/job/familyProbe.js";
import type { SuppliedOutcome } from "../../engine/job/supplied.js";
import type { FromSuppliedWorker, ToSuppliedWorker } from "./supplied.protocol.js";

/**
 * The main thread's whole view of the supplied-method worker.
 *
 * It is `probe.client.ts` plus one thing, and that one thing is the reason this file exists rather
 * than a second argument on the other one.
 *
 * ## The wall clock, which is the point
 *
 * A family cannot run away. A method somebody typed into the page can, and a loop that never ends
 * inside a worker is not interruptible from inside that worker: there is one thread, and the loop
 * that would notice a cancel flag is the loop that is stuck. `postMessage` reaches a queue nobody is
 * reading. So the limit cannot live in the pump, and it cannot live in the worker shell either.
 *
 * It lives here, outside, holding the only lever that still works — `terminate()`, which stops the
 * thread rather than asking it to stop. The client that owns the clock is therefore the thing that
 * produces a `timedOut` outcome, which is why `web/engine/job/supplied.ts` says so in the union's
 * own comment rather than deciding it there.
 *
 * ## Why the clock is a parameter
 *
 * A limit measured by a bare `setTimeout` is a limit no test can reach: proving that a method which
 * never finishes IS stopped means not letting it finish, and a test that waits out a real limit
 * either takes the limit's worth of seconds or proves nothing. So the alarm arrives as a function,
 * and a test hands in one it drives by hand.
 *
 * ## What the limit is for
 *
 * The WHOLE measurement, not each room. Progress messages reset nothing, deliberately: a method
 * that takes a little too long on every one of eight rooms is exactly as unusable as one that hangs
 * on the first, and a per-room limit would let the total grow without bound while every individual
 * room came in under the line. The alarm is set once, in `start`, and the only things that stop it
 * are an answer, a failure, or its own expiry.
 *
 * A failure always surfaces with the worker's own message. There is no log a reader can check
 * afterwards, and this page's whole subject is measurement honesty, so a substituted "something
 * went wrong" would be the page failing at the thing it is teaching.
 */

export interface SuppliedPort {
  postMessage(message: ToSuppliedWorker): void;
  addEventListener(
    type: "message",
    handler: (event: { readonly data: FromSuppliedWorker }) => void,
  ): void;
}

/**
 * `onFailed` carries both the sentence and the outcome it came from.
 *
 * The sentence is what a reader is shown. The outcome is how a caller tells a method that STOPPED
 * from one that was STOPPED BY US, and those are different findings about the reader's ruler: the
 * first is theirs and the second is ours. Collapsing them into a string would leave the page
 * guessing which had happened by reading its own prose back.
 */
export interface SuppliedHandlers {
  readonly onProgress: (seedsDone: number, seedsTotal: number, phase: string) => void;
  readonly onDone: (probe: SuppliedProbe) => void;
  readonly onFailed: (message: string, outcome: SuppliedOutcome) => void;
}

/**
 * Set a one-shot alarm, and hand back the way to call it off.
 *
 * Deliberately not a timer id: an id is a number whose meaning belongs to whichever host issued it,
 * and a caller holding one has to know which host that was. A function to cancel with is the whole
 * of what this client needs.
 */
export type SuppliedAlarm = (afterMs: number, fire: () => void) => () => void;

export interface SuppliedLimit {
  readonly kind: "suppliedLimit";
  /** How long the whole measurement may take, in milliseconds. Never per room. */
  readonly limitMs: number;
  /** Stops the worker's thread. The only lever that still works on a method that will not stop. */
  readonly terminate: () => void;
  readonly setAlarm: SuppliedAlarm;
}

export function makeSuppliedLimit(init: {
  readonly limitMs: number;
  readonly terminate: () => void;
  readonly setAlarm: SuppliedAlarm;
}): SuppliedLimit {
  if (!Number.isFinite(init.limitMs) || init.limitMs <= 0) {
    fail(
      `a supplied method's limit must be a positive number of milliseconds, got ${init.limitMs}; ` +
        `a limit of nothing is no limit, and no limit is a page that can be hung by one typo`,
    );
  }
  return Object.freeze({
    kind: "suppliedLimit" as const,
    limitMs: init.limitMs,
    terminate: init.terminate,
    setAlarm: init.setAlarm,
  });
}

/** The browser's own clock, in the shape above. The one place this module names a timer at all. */
export const wallClockAlarm: SuppliedAlarm = (afterMs: number, fire: () => void): (() => void) => {
  const handle = setTimeout(fire, afterMs);
  return (): void => {
    clearTimeout(handle);
  };
};

/**
 * What a reader is told when their method was still running at the limit.
 *
 * Plain English, and the limit is named in seconds because milliseconds are a unit for a program
 * rather than for a person. It says what was lost as well as what happened: a measurement cut off
 * part way is not a short measurement, it is no measurement, and reporting the rooms that had
 * already finished would be quoting a mean over however many rooms the machine happened to reach.
 */
export function suppliedTimeoutPhrase(limitMs: number): string {
  const seconds = limitMs / 1000;
  const unit = seconds === 1 ? "second" : "seconds";
  return (
    `Your method was still running after ${String(seconds)} ${unit}, so it was stopped. ` +
    `The limit is for the whole measurement rather than for each room, and nothing it had ` +
    `read is reported, because a measurement that was cut off part way is not a reading.`
  );
}

export interface SuppliedClient {
  readonly kind: "suppliedClient";
  readonly start: (source: string, settings: FamilyProbeSettings) => void;
  readonly isRunning: () => boolean;
  /** True once the limit expired and the worker was stopped. This client cannot be used again. */
  readonly isStopped: () => boolean;
}

export function makeSuppliedClient(
  port: SuppliedPort,
  handlers: SuppliedHandlers,
  spec: SuppliedLimit,
): SuppliedClient {
  let running = false;
  let stopped = false;
  let callOffAlarm: (() => void) | null = null;

  const disarm = (): void => {
    if (callOffAlarm === null) {
      return;
    }
    const callOff = callOffAlarm;
    callOffAlarm = null;
    callOff();
  };

  const expire = (): void => {
    if (!running) {
      return;
    }
    running = false;
    stopped = true;
    callOffAlarm = null;
    // Terminate FIRST, then report. The thread is still burning until it is stopped, and a handler
    // that painted the page before the stop would be running beside a method that is still going.
    spec.terminate();
    const outcome: SuppliedOutcome = Object.freeze({
      kind: "timedOut" as const,
      limitMs: spec.limitMs,
    });
    handlers.onFailed(suppliedTimeoutPhrase(spec.limitMs), outcome);
  };

  port.addEventListener("message", (event: { readonly data: FromSuppliedWorker }) => {
    const message = event.data;
    if (!running) {
      return;
    }
    if (message.kind === "progress") {
      // The alarm is NOT touched here, and that is the whole design. The limit covers the whole
      // measurement, so eight rooms that each come in just under it still add up to a run that has
      // to be stopped.
      handlers.onProgress(message.seedsDone, message.seedsTotal, message.phase);
      return;
    }
    if (message.kind === "done") {
      running = false;
      disarm();
      handlers.onDone(message.probe);
      return;
    }
    running = false;
    disarm();
    const outcome: SuppliedOutcome = Object.freeze({
      kind: "failed" as const,
      message: message.message,
    });
    handlers.onFailed(message.message, outcome);
  });

  const start = (source: string, settings: FamilyProbeSettings): void => {
    if (stopped) {
      fail(
        "the last method had to be stopped part way through, so this measurement has nowhere to " +
          "run; a fresh one has to be started before another method can be read",
      );
    }
    if (running) {
      fail(
        "a measurement is already running; two of them would land in the same verdict with no " +
          "way to tell which method's numbers were on screen",
      );
    }
    running = true;
    port.postMessage({ kind: "supplied", source, settings });
    callOffAlarm = spec.setAlarm(spec.limitMs, expire);
  };

  return Object.freeze({
    kind: "suppliedClient" as const,
    start,
    isRunning: (): boolean => running,
    isStopped: (): boolean => stopped,
  });
}

/**
 * A real `Worker` narrowed to the two methods the client uses, so nothing else can be reached.
 *
 * `terminate` is deliberately not on this port. It is not something the client does to a message
 * channel, it is something the owner of the worker does to the worker, and it arrives instead on
 * the limit record beside the number of milliseconds it is the enforcement of.
 */
export function suppliedPortFor(worker: Worker): SuppliedPort {
  return {
    postMessage: (message: ToSuppliedWorker): void => {
      worker.postMessage(message);
    },
    addEventListener: (
      type: "message",
      handler: (event: { readonly data: FromSuppliedWorker }) => void,
    ): void => {
      worker.addEventListener(type, (event: MessageEvent<FromSuppliedWorker>) => {
        handler({ data: event.data });
      });
    },
  };
}

/**
 * The one construction Vite can analyse. Keep it written exactly this way — a string path builds
 * green and 404s in production, and `supplied-worker.test.ts` pins the literal for that reason.
 */
export function spawnSuppliedWorker(): Worker {
  return new Worker(new URL("./supplied.worker.ts", import.meta.url), { type: "module" });
}
