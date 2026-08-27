import type { FamilyProbeSettings } from "../../engine/job/familyProbe.js";
import type { SuppliedOutcome } from "../../engine/job/supplied.js";

/**
 * The two message unions the supplied-method worker sends and receives, and nothing else.
 *
 * Types only, for the same reason `probe.protocol.ts` is: a function on a message throws
 * `DataCloneError` at `postMessage`, which `probe.test.ts` proves by planting a function member and
 * asserting the error name. The probe protocol solves that for the four families by sending a KEY
 * and letting the worker look the entry up in its own copy of the catalogue — the function never
 * travels because it was already at the far end.
 *
 * **A supplied method has no key.** It is not in any catalogue, it did not exist when the worker was
 * bundled, and there is nothing on the worker side to look it up in. So the thing that travels is
 * the method's SOURCE, as a string — a string clones without complaint — and it is turned back into
 * a function at the far end, by `supplied.sandbox.ts`, which is the only module in this repository
 * allowed to do that. That is the whole difference between this protocol and the probe's, and it is
 * the reason the sandbox exists at all.
 *
 * The settings are the probe's own `FamilyProbeSettings`: the same eight rooms, the same seeds and
 * the same run-to-run band as the four built-in rulers, because a supplied ruler measured on a
 * different world could not be set beside them. They are already frozen plain data with no function
 * on them — `makeFamilyProbeSettings` guarantees that.
 *
 * Separate from the probe's protocol on purpose, for the reason the probe's is separate from the
 * sweep's: folding two unions into one makes every consumer of either handle the other's messages.
 *
 * `phase` is a sentence a reader sees, so it is written in plain English and never carries a code
 * identifier.
 */

export type ToSuppliedWorker = {
  readonly kind: "supplied";
  /**
   * The body of the reader's function, exactly as they typed it. One argument, returning a number
   * in metres. It is text until the sandbox compiles it, and it is compiled nowhere else.
   */
  readonly source: string;
  readonly settings: FamilyProbeSettings;
};

export type FromSuppliedWorker =
  | {
      readonly kind: "progress";
      readonly seedsDone: number;
      readonly seedsTotal: number;
      readonly phase: string;
    }
  | {
      readonly kind: "done";
      /**
       * One outcome per room, in the order the seeds were listed in the request. The seeds
       * themselves are not repeated here: the sender already has them, and a second copy is a
       * second thing to keep in step.
       */
      readonly perSeed: readonly SuppliedOutcome[];
    }
  | { readonly kind: "failed"; readonly message: string };
