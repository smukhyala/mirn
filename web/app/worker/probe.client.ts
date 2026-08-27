import { fail } from "../../engine/core/errors.js";
import type { FamilyKey } from "../../engine/job/families.js";
import type { FamilyProbe, FamilyProbeSettings } from "../../engine/job/familyProbe.js";
import type { PowerCurve } from "../../engine/job/powerCurve.js";
import type { FromProbeWorker, ToProbeWorker } from "./probe.protocol.js";

/**
 * The main thread's whole view of the method card's worker.
 *
 * Smaller than the sweep's client because the job is smaller: one family, one answer, no ledger to
 * keep in order and no cancellation window worth building a state machine for. What it does keep
 * is the sweep client's one hard rule — a second job cannot start while the first is running,
 * because two probes would land in the same verdict with no way to tell which family's numbers
 * were on screen.
 *
 * A failure always surfaces with the worker's own message. There is no log a reader can check
 * afterwards, and this page's whole subject is measurement honesty, so a substituted "something
 * went wrong" would be the page failing at the thing it is teaching.
 */

export interface ProbePort {
  postMessage(message: ToProbeWorker): void;
  addEventListener(
    type: "message",
    handler: (event: { readonly data: FromProbeWorker }) => void,
  ): void;
}

export interface ProbeHandlers {
  readonly onProgress: (seedsDone: number, seedsTotal: number, phase: string) => void;
  readonly onProbed: (probe: FamilyProbe) => void;
  readonly onCurved: (curve: PowerCurve) => void;
  readonly onFailed: (message: string) => void;
}

export interface ProbeClient {
  readonly kind: "probeClient";
  readonly start: (family: FamilyKey, settings: FamilyProbeSettings) => void;
  readonly startCurve: (family: FamilyKey, settings: FamilyProbeSettings) => void;
  readonly isRunning: () => boolean;
}

export function makeProbeClient(port: ProbePort, handlers: ProbeHandlers): ProbeClient {
  let running = false;

  port.addEventListener("message", (event: { readonly data: FromProbeWorker }) => {
    const message = event.data;
    if (!running) {
      return;
    }
    if (message.kind === "progress") {
      handlers.onProgress(message.seedsDone, message.seedsTotal, message.phase);
      return;
    }
    if (message.kind === "probed") {
      running = false;
      handlers.onProbed(message.probe);
      return;
    }
    if (message.kind === "curved") {
      running = false;
      handlers.onCurved(message.curve);
      return;
    }
    running = false;
    handlers.onFailed(message.message);
  });

  const start = (family: FamilyKey, settings: FamilyProbeSettings): void => {
    if (running) {
      fail(
        "a measurement is already running; two of them would land in the same verdict with no " +
          "way to tell which family's numbers were on screen",
      );
    }
    running = true;
    port.postMessage({ kind: "probe", family, settings });
  };

  // The same one-job-at-a-time rule, and for a sharper reason than the probe's: a curve and a
  // count landing in one verdict would put the sweep's numbers under the single world's heading.
  const startCurve = (family: FamilyKey, settings: FamilyProbeSettings): void => {
    if (running) {
      fail(
        "a measurement is already running; two of them would land in the same verdict with no " +
          "way to tell which family's numbers were on screen",
      );
    }
    running = true;
    port.postMessage({ kind: "curve", family, settings });
  };

  return Object.freeze({
    kind: "probeClient" as const,
    start,
    startCurve,
    isRunning: (): boolean => running,
  });
}

/** A real `Worker` narrowed to the two methods the client uses, so nothing else can be reached. */
export function probePortFor(worker: Worker): ProbePort {
  return {
    postMessage: (message: ToProbeWorker): void => {
      worker.postMessage(message);
    },
    addEventListener: (
      type: "message",
      handler: (event: { readonly data: FromProbeWorker }) => void,
    ): void => {
      worker.addEventListener(type, (event: MessageEvent<FromProbeWorker>) => {
        handler({ data: event.data });
      });
    },
  };
}

/**
 * The one construction Vite can analyse. Keep it written exactly this way — a string path builds
 * green and 404s in production, and `probe-client.test.ts` pins the literal for that reason.
 */
export function spawnProbeWorker(): Worker {
  return new Worker(new URL("./probe.worker.ts", import.meta.url), { type: "module" });
}
