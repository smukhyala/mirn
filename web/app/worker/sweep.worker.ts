import { pumpSweep } from "./pump.js";
import type { FromWorker, ToWorker } from "./protocol.js";

/**
 * Twenty lines of glue and no arithmetic. Everything numeric is behind `pumpSweep`, which is
 * behind `web/engine/job/runner.ts`. No test imports this file: it registers a listener at module
 * scope, so importing it under Node would be a ReferenceError on `self`.
 *
 * `self` is typed by hand rather than by referencing lib="webworker", which collides with the DOM
 * lib this project already compiles against.
 */

interface WorkerScope {
  postMessage(message: FromWorker): void;
  addEventListener(type: "message", handler: (event: MessageEvent<ToWorker>) => void): void;
}

const scope = self as unknown as WorkerScope;

let cancelled = false;
let running = false;

scope.addEventListener("message", (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  if (message.kind === "cancel") {
    cancelled = true;
    return;
  }
  if (running) {
    scope.postMessage({
      kind: "failed",
      message: "a sweep was already running when another was asked for",
    });
    return;
  }
  running = true;
  cancelled = false;
  void pumpSweep(
    message.job,
    { postMessage: (out: FromWorker): void => scope.postMessage(out) },
    {
      nowMs: () => performance.now(),
      // A macrotask, not a microtask: only a macrotask lets the pending cancel message be
      // delivered, and a pump that never yields can never be stopped.
      yieldToHost: () => new Promise<void>((resolve) => { setTimeout(resolve, 0); }),
      isCancelled: () => cancelled,
      sliceBudgetMs: 50,
    },
  ).then(() => {
    running = false;
  });
});
