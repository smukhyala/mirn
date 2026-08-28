import { pumpFit } from "./fit.pump.js";
import type { FromFitWorker, ToFitWorker } from "./fit.protocol.js";

/**
 * Glue, and no arithmetic. `probe.worker.ts`'s shape, for its reasons: no test imports this file,
 * because it registers a listener at module scope and importing it under Node is a ReferenceError
 * on `self`, and `self` is typed by hand rather than by pulling in the webworker lib that collides
 * with the DOM lib this project compiles against.
 */

interface WorkerScope {
  postMessage(message: FromFitWorker): void;
  addEventListener(type: "message", handler: (event: MessageEvent<ToFitWorker>) => void): void;
}

const scope = self as unknown as WorkerScope;

let running = false;

scope.addEventListener("message", (event: MessageEvent<ToFitWorker>) => {
  if (running) {
    scope.postMessage({
      kind: "failed",
      message: "a fit was already running when another was asked for",
    });
    return;
  }
  running = true;
  pumpFit(event.data, {
    postMessage: (out: FromFitWorker): void => {
      scope.postMessage(out);
    },
  });
  running = false;
});
