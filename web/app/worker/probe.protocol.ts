import type { FamilyKey } from "../../engine/job/families.js";
import type { FamilyProbe, FamilyProbeSettings } from "../../engine/job/familyProbe.js";

/**
 * The two message unions the method card's worker sends and receives, and nothing else.
 *
 * Types only, for the same reason `protocol.ts` is: a function on a message throws
 * `DataCloneError` at `postMessage`. So the job carries a family KEY and the worker looks the
 * entry up in its own copy of `web/engine/job/families.ts`. `FamilyProbeSettings` is already frozen
 * plain data with no function on it — `makeFamilyProbeSettings` guarantees that — and
 * `probe-clone.test.ts` is what keeps both halves true rather than a comment.
 *
 * Separate from the sweep's protocol on purpose. A sweep produces a stream of rows into a ledger;
 * a probe produces one answer about one family. Folding them into one union would mean every
 * consumer of either had to handle the other's messages, and the two workers would share a
 * cancellation story neither needs.
 *
 * `phase` is a sentence a reader sees, so it is written in plain English by `probe.pump.ts` and
 * never carries a code identifier.
 */

export type ToProbeWorker = {
  readonly kind: "probe";
  readonly family: FamilyKey;
  readonly settings: FamilyProbeSettings;
};

export type FromProbeWorker =
  | {
      readonly kind: "progress";
      readonly seedsDone: number;
      readonly seedsTotal: number;
      readonly phase: string;
    }
  | { readonly kind: "probed"; readonly probe: FamilyProbe }
  | { readonly kind: "failed"; readonly message: string };
