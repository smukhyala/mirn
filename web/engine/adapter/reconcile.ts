import { fail } from "../core/errors.js";

/**
 * Where a third party's arithmetic is met, so that the contracts never have to bend.
 *
 * `makePairedRun` asserts the two arms' first positions are BIT-IDENTICAL, and that assertion is
 * correct and stays. Its own comment gives the reason: both arms come out of one function against
 * one noise tape, so any difference at all means the tape leaked arm state. A run set written by
 * somebody else has no such guarantee — a value that went through decimal text, or through a
 * thirty-two-bit float, will not come back bit-identical however carefully it was produced.
 *
 * So the tolerance lives HERE, in the thing accommodating a third party, and not in the contract.
 * The alternative — a second, laxer `PairedRun` constructor — was considered and rejected: it makes
 * the strict guarantee conditional on which constructor a caller reached for, and the whole value of
 * that assertion is that it admits no exceptions.
 *
 * What this does is verify agreement within a bound and then SNAP: the control arm's first sample is
 * set to the treated arm's. The contract's check then passes because the values genuinely are
 * identical, not because it was weakened. That edits data, which deserves saying out loud rather
 * than burying, so the residual is returned and a caller can report it.
 *
 * **This mutates the caller's buffers.** `reconcileInitial` writes into the `Float64Array`s it is
 * handed — it does not copy them and hand back a new control path. A reader skimming the return type
 * could reasonably expect a pure function; it is not one, and the surprise is worth naming plainly
 * rather than discovering by watching a buffer change out from under you. Call it once, on the
 * buffers you intend to keep, before they are handed to `makePairedRun`.
 */

/**
 * The bound, matching `src/mirn/contracts.py`'s, whose comment says it is there because third-party
 * adapters have to be accommodated. This is that adapter, so it takes that number rather than
 * inventing one.
 */
export const INITIAL_TOLERANCE_M = 1e-9;

export interface Reconciliation {
  readonly kind: "reconciliation";
  /** The largest first-sample gap seen, before snapping. Nought when they already agreed. */
  readonly maxDisagreementM: number;
  readonly snapped: boolean;
}

export function reconcileInitial(
  treatedPaths: readonly Float64Array[],
  controlPaths: readonly Float64Array[],
): Reconciliation {
  if (treatedPaths.length !== controlPaths.length) {
    fail(
      `the two runs hold ${treatedPaths.length} and ${controlPaths.length} people, and a pair ` +
        `compares the same room twice`,
    );
  }

  let maxDisagreementM = 0;
  for (let i = 0; i < treatedPaths.length; i++) {
    const treated = treatedPaths[i] as Float64Array;
    const control = controlPaths[i] as Float64Array;
    const dx = (treated[0] as number) - (control[0] as number);
    const dy = (treated[1] as number) - (control[1] as number);
    const gap = Math.sqrt(dx * dx + dy * dy);
    if (gap > maxDisagreementM) {
      maxDisagreementM = gap;
    }
  }

  if (maxDisagreementM > INITIAL_TOLERANCE_M) {
    fail(
      `the two runs started in different places: the person who moved furthest between them ` +
        `began ${maxDisagreementM} m away from where the other run put them, and a pair only ` +
        `measures one thing if both runs begin identically`,
    );
  }

  let snapped = false;
  if (maxDisagreementM > 0) {
    for (let i = 0; i < treatedPaths.length; i++) {
      const treated = treatedPaths[i] as Float64Array;
      const control = controlPaths[i] as Float64Array;
      control[0] = treated[0] as number;
      control[1] = treated[1] as number;
    }
    snapped = true;
  }

  return Object.freeze({ kind: "reconciliation" as const, maxDisagreementM, snapped });
}

/**
 * Two arms of unequal length are refused rather than trimmed.
 *
 * Trimming to the shorter would move every maximum-style reading — the worst moment, the closest the
 * robot came, the number of near misses — by an amount nobody looking at the answer could see. A run
 * set whose arms ran for different times is a run set with a problem in it, and the right place to
 * fix that is the scenario that produced it.
 */
export function requireSameLength(treatedSteps: number, controlSteps: number): void {
  if (treatedSteps !== controlSteps) {
    fail(
      `one run is ${treatedSteps} samples long and the other is ${controlSteps}; this bench ` +
        `compares them sample by sample, and it will not trim one to fit the other because doing ` +
        `so would quietly change every reading that reports a worst moment`,
    );
  }
}
