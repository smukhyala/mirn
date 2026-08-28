import { fail } from "../../engine/core/errors.js";
import type { RunConfigOverrides } from "../../engine/contracts/config.js";
import type { Recording } from "../../engine/fit/recording.js";
import type { FitResult } from "../../engine/fit/search.js";
import type { FromFitWorker, ToFitWorker } from "./fit.protocol.js";

/**
 * The main thread's whole view of the fit page's worker.
 *
 * `probe.client.ts`'s shape and its one hard rule: a second job cannot start while the first runs,
 * because two fits would land in the same verdict with no way to tell which recording's numbers
 * were on screen. A failure always surfaces with the worker's own message — this page's subject is
 * measurement honesty, and a substituted apology would be it failing at the thing it teaches.
 */

export interface FitPort {
  postMessage(message: ToFitWorker): void;
  addEventListener(
    type: "message",
    handler: (event: { readonly data: FromFitWorker }) => void,
  ): void;
}

export interface FitHandlers {
  readonly onProgress: (done: number, total: number, phase: string) => void;
  readonly onFitted: (result: FitResult) => void;
  readonly onFailed: (message: string) => void;
}

export interface FitClient {
  readonly kind: "fitClient";
  readonly start: (
    recording: Recording,
    base: RunConfigOverrides,
    baseSeed: number,
  ) => void;
  readonly isRunning: () => boolean;
}

export function makeFitClient(port: FitPort, handlers: FitHandlers): FitClient {
  let running = false;

  port.addEventListener("message", (event: { readonly data: FromFitWorker }) => {
    const message = event.data;
    if (!running) {
      return;
    }
    if (message.kind === "progress") {
      handlers.onProgress(message.done, message.total, message.phase);
      return;
    }
    if (message.kind === "fitted") {
      running = false;
      handlers.onFitted(message.result);
      return;
    }
    running = false;
    handlers.onFailed(message.message);
  });

  const start = (
    recording: Recording,
    base: RunConfigOverrides,
    baseSeed: number,
  ): void => {
    if (running) {
      fail(
        "a fit is already running; two of them would land in the same verdict with no way to " +
          "tell which recording's numbers were on screen",
      );
    }
    running = true;
    port.postMessage({ kind: "fit", recording, base, baseSeed });
  };

  return Object.freeze({
    kind: "fitClient" as const,
    start,
    isRunning: (): boolean => running,
  });
}

/** A real `Worker` narrowed to the two methods the client uses, so nothing else can be reached. */
export function fitPortFor(worker: Worker): FitPort {
  return {
    postMessage: (message: ToFitWorker): void => {
      worker.postMessage(message);
    },
    addEventListener: (
      type: "message",
      handler: (event: { readonly data: FromFitWorker }) => void,
    ): void => {
      worker.addEventListener(type, (event: MessageEvent<FromFitWorker>) => {
        handler({ data: event.data });
      });
    },
  };
}

/**
 * The one construction Vite can analyse. Keep it written exactly this way — a string path builds
 * green and 404s in production, which is why `fit-client.test.ts` pins the literal.
 */
export function spawnFitWorker(): Worker {
  return new Worker(new URL("./fit.worker.ts", import.meta.url), { type: "module" });
}
