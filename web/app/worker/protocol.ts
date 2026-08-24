import type { SweepJob } from "../../engine/job/spec.js";
import type { RunRow } from "../../engine/job/stats.js";

/**
 * The two message unions that cross the Worker boundary, and nothing else.
 *
 * Types only, on purpose. A function on a message throws `DataCloneError` at `postMessage`, and
 * the design's answer (section 4.2) is that behaviour never crosses: the job carries an axis key
 * and the worker looks the entry up in its own copy of `web/engine/job/axes.ts`. A helper defined
 * here would be a place for that rule to start leaking, so there is no helper.
 *
 * This file must not import `web/engine/measure/`. The worker's arithmetic lives behind
 * `web/engine/job/runner.ts`; a protocol that could measure something would invite a second
 * implementation of the numbers.
 *
 * `RunRow` is imported from `web/engine/job/stats.ts`, not `web/engine/job/runner.ts`: `runner.ts`
 * imports `RunRow` for its own `UnitOutput` field but never re-exports the name, so
 * `web/engine/job/runner.js` has no exported member `RunRow` for this file to import.
 *
 * `progress.phase` is a sentence a reader sees, so it is written in plain English by
 * `web/app/worker/pump.ts` and never carries a code identifier.
 */

export type ToWorker =
  | { readonly kind: "start"; readonly job: SweepJob }
  | { readonly kind: "cancel" };

export type FromWorker =
  | {
      readonly kind: "progress";
      readonly unitsDone: number;
      readonly unitsTotal: number;
      readonly phase: string;
    }
  | { readonly kind: "row"; readonly row: RunRow }
  | {
      readonly kind: "band";
      readonly axisIndex: number;
      readonly meanM: number;
      readonly peakM: number;
      readonly nReplicates: number;
    }
  | { readonly kind: "done" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly message: string };
