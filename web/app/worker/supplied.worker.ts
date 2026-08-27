import { pumpSupplied } from "./supplied.pump.js";
import type { FromSuppliedWorker, ToSuppliedWorker } from "./supplied.protocol.js";

/**
 * Fifteen lines of glue and no arithmetic. Everything numeric is behind `pumpSupplied`, and the one
 * place a reader's text becomes a function is behind that again, in `supplied.sandbox.ts`. No test
 * imports this file: it registers a listener at module scope, so importing it under Node would be a
 * ReferenceError on `self`.
 *
 * `self` is typed by hand rather than by referencing lib="webworker", which collides with the DOM
 * lib this project already compiles against.
 *
 * The `running` guard is the probe worker's, for the probe worker's reason: two measurements would
 * land in the same verdict with no way to tell which one's numbers were on screen. It does NOT
 * survive a runaway method — a second message cannot be delivered while the first one's method is
 * still spinning, because a worker has one thread and the loop that would read the message queue is
 * the loop that is stuck. That case is the client's, which terminates this worker from outside.
 */

interface WorkerScope {
  postMessage(message: FromSuppliedWorker): void;
  addEventListener(type: "message", handler: (event: MessageEvent<ToSuppliedWorker>) => void): void;
}

const scope = self as unknown as WorkerScope;

let running = false;

scope.addEventListener("message", (event: MessageEvent<ToSuppliedWorker>) => {
  if (running) {
    scope.postMessage({
      kind: "failed",
      message: "a measurement was already running when another was asked for",
    });
    return;
  }
  running = true;
  pumpSupplied(event.data.source, event.data.settings, {
    postMessage: (out: FromSuppliedWorker): void => {
      scope.postMessage(out);
    },
  });
  running = false;
});
