import { fail } from "../../engine/core/errors.js";
import type { SweepJob } from "../../engine/job/spec.js";
import type { RunRow } from "../../engine/job/stats.js";
import type { FromWorker, ToWorker } from "./protocol.js";

/**
 * The main thread's whole view of the worker.
 *
 * The worker returns numbers and never trajectories: a 72-run sweep of paths is about 33 MB and
 * the readings are about 90 KB. Playback rebuilds the selected run instead of storing it —
 * `web/app/console/playback.ts`'s `recomputeForPlayback` is the one place that happens, not this
 * file; an earlier draft of this client also carried its own byte-identical copy of that rebuild,
 * unused by any real caller, which is exactly the kind of drift surface guardrail 4 exists to
 * forbid. `playback.test.ts` asserts the rebuild is bitwise.
 *
 * Cancelling is not instant and is not pretended to be. `cancel()` posts a flag the worker reads
 * between units and then ignores everything until `cancelled` comes back, so a row
 * still in flight from an abandoned sweep never reaches the ledger. A genuine failure arriving
 * during that window is never relabelled as a cancellation: this console's whole subject is
 * measurement honesty, and there is no log an operator can check afterwards, so `failed` always
 * surfaces with its real message, whichever phase it lands in.
 *
 * `RunRow` is imported from `web/engine/job/stats.ts`, not `web/engine/job/runner.ts`:
 * `runner.ts` imports `RunRow` for its own `UnitOutput` field but never re-exports the name, so
 * `web/engine/job/runner.js` has no exported member `RunRow` for this file to import (the same
 * fact `protocol.ts` already documents about itself).
 */

export interface SweepPort {
  postMessage(message: ToWorker): void;
  addEventListener(
    type: "message",
    handler: (event: { readonly data: FromWorker }) => void,
  ): void;
}

export interface SweepHandlers {
  readonly onProgress: (unitsDone: number, unitsTotal: number, phase: string) => void;
  readonly onRow: (row: RunRow) => void;
  readonly onBand: (
    axisIndex: number,
    meanM: number,
    peakM: number,
    nReplicates: number,
  ) => void;
  readonly onDone: () => void;
  readonly onCancelled: () => void;
  readonly onFailed: (message: string) => void;
}

export interface SweepClient {
  readonly kind: "sweepClient";
  readonly start: (job: SweepJob) => void;
  readonly cancel: () => void;
  readonly isRunning: () => boolean;
}

type ClientPhase = "idle" | "running" | "cancelling";

export function makeSweepClient(port: SweepPort, handlers: SweepHandlers): SweepClient {
  let phase: ClientPhase = "idle";

  port.addEventListener("message", (event: { readonly data: FromWorker }) => {
    const message = event.data;
    if (phase === "idle") {
      return;
    }
    if (phase === "cancelling") {
      // A cancel in flight does not license swallowing a real failure. If the unit failed for
      // its own reason — not because it was cancelled — the operator is told that, with the
      // worker's actual message, never a substituted "cancelled".
      if (message.kind === "failed") {
        phase = "idle";
        handlers.onFailed(message.message);
        return;
      }
      if (message.kind === "cancelled" || message.kind === "done") {
        phase = "idle";
        handlers.onCancelled();
      }
      return;
    }
    if (message.kind === "progress") {
      handlers.onProgress(message.unitsDone, message.unitsTotal, message.phase);
      return;
    }
    if (message.kind === "row") {
      handlers.onRow(message.row);
      return;
    }
    if (message.kind === "band") {
      handlers.onBand(message.axisIndex, message.meanM, message.peakM, message.nReplicates);
      return;
    }
    if (message.kind === "done") {
      phase = "idle";
      handlers.onDone();
      return;
    }
    if (message.kind === "cancelled") {
      phase = "idle";
      handlers.onCancelled();
      return;
    }
    phase = "idle";
    handlers.onFailed(message.message);
  });

  const start = (job: SweepJob): void => {
    if (phase !== "idle") {
      fail(
        "a sweep is already running; press the button that stops it before starting another, " +
          "because two sweeps would land in the same ledger with no way to tell them apart",
      );
    }
    phase = "running";
    port.postMessage({ kind: "start", job });
  };

  const cancel = (): void => {
    if (phase !== "running") {
      return;
    }
    phase = "cancelling";
    port.postMessage({ kind: "cancel" });
  };

  const isRunning = (): boolean => phase !== "idle";

  return Object.freeze({
    kind: "sweepClient" as const,
    start,
    cancel,
    isRunning,
  });
}

/** A real `Worker` narrowed to the two methods the client uses, so nothing else can be reached. */
export function sweepPortFor(worker: Worker): SweepPort {
  return {
    postMessage: (message: ToWorker): void => {
      worker.postMessage(message);
    },
    addEventListener: (
      type: "message",
      handler: (event: { readonly data: FromWorker }) => void,
    ): void => {
      worker.addEventListener(type, (event: MessageEvent<FromWorker>) => {
        handler({ data: event.data });
      });
    },
  };
}

/**
 * The one construction Vite can analyse. Keep it written exactly this way — a string path builds
 * green and 404s in production, and `client.test.ts` pins the literal for that reason.
 */
export function spawnSweepWorker(): Worker {
  return new Worker(new URL("./sweep.worker.ts", import.meta.url), { type: "module" });
}
