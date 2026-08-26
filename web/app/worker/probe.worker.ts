import { pumpProbe } from "./probe.pump.js";
import type { FromProbeWorker, ToProbeWorker } from "./probe.protocol.js";

/**
 * Fifteen lines of glue and no arithmetic. Everything numeric is behind `pumpProbe`, which is
 * behind `web/engine/job/familyProbe.ts`. No test imports this file: it registers a listener at
 * module scope, so importing it under Node would be a ReferenceError on `self`.
 *
 * `self` is typed by hand rather than by referencing lib="webworker", which collides with the DOM
 * lib this project already compiles against.
 */

interface WorkerScope {
  postMessage(message: FromProbeWorker): void;
  addEventListener(type: "message", handler: (event: MessageEvent<ToProbeWorker>) => void): void;
}

const scope = self as unknown as WorkerScope;

let running = false;

scope.addEventListener("message", (event: MessageEvent<ToProbeWorker>) => {
  if (running) {
    scope.postMessage({
      kind: "failed",
      message: "a measurement was already running when another was asked for",
    });
    return;
  }
  running = true;
  pumpProbe(event.data.family, event.data.settings, {
    postMessage: (out: FromProbeWorker): void => {
      scope.postMessage(out);
    },
  });
  running = false;
});
