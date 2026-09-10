import type { Provenance } from "./schema.js";

/**
 * The third kind of number, and why the two sentences this bench already has will not do.
 *
 * Guardrail 1 keeps two kinds apart. A reading about this bench's own crowd carries
 * `INVENTED_CROWD_DISCLOSURE` (in `web/app/console/csv.ts`): the crowd is invented, and no number
 * is a measurement of real pedestrians. A goodness-of-fit figure has real people on one side and
 * carries `FIT_DISCLOSURE` (in `web/app/console/fitVerdict.ts`), which says so in three clauses.
 *
 * A reading off another simulator, read in from a file, is NEITHER of those. Reusing the
 * invented-crowd sentence would be almost right and wrong in the direction that matters: it says
 * the crowd is invented, which is true, and it implies this bench invented it and therefore knows
 * what it is. It does not. It has not read that simulator's physics, cannot reproduce it, and has
 * run no property test against it — everything this file's own crowd earns from `web/engine/sim/`
 * and its property tests, an adapted crowd arrives with none of.
 *
 * The third clause below is the load-bearing one, for the reason guardrail 1 already gives about
 * fitting: a reader shown output from a real robotics simulator is exactly the reader most likely
 * to believe the next number they see. A toy that looks like an instrument is the hazard, and
 * somebody else's engine looks a great deal more like an instrument than a sketch of a crowd does.
 *
 * ## The closing sentence is not the invented-crowd one, and a review caught it the first time it
 * ## nearly was
 *
 * The first draft of this sentence closed with a near-copy of `INVENTED_CROWD_DISCLOSURE`'s own
 * ending: that the same room is run twice, from the same starting positions and "the same random
 * wobble", so the difference between a person's two paths is the robot's effect on them. For this
 * bench's OWN runs that is true by construction — `runArm` draws both arms from one shared noise
 * tape, so there is nothing left to differ except the robot. None of that holds the same way for a
 * run set that arrived from someone else's simulator:
 *
 *   - MIRN did not run anything. The producer ran both arms, off-camera.
 *   - "the same starting positions" is not a fact this bench receives — it is a claim `reconcile.ts`
 *     checks to within `INITIAL_TOLERANCE_M` and then SNAPS into exact agreement, so the numbers
 *     agree because this bench edited them to, not because the file proved they already did.
 *   - **there is no tape and no seed this bench controls, so it cannot check that the two runs
 *     shared their exogenous noise at all.** That the arms differ only in the robot is the
 *     producer's claim. It is not something this bench measured.
 *
 * So the closing sentence says what was actually checked — names, clock, length, starting
 * positions to a whisker, snapped into exact agreement — and then says plainly that everything else
 * is taken on the file's word. It ends on that limitation rather than on a reassurance, because
 * ending on the reassurance is exactly the overclaim guardrail 1 exists to refuse.
 *
 * This module has no production caller yet, on purpose — the reader-facing page for adapted
 * results is out of scope for this plan. `EXTERNAL_CROWD_DISCLOSURE` and `producedByLine` are the
 * whole deliverable, each directly tested, waiting for the surface that will render them.
 */
export const EXTERNAL_CROWD_DISCLOSURE =
  "This crowd was simulated by a simulator this bench did not write. It has not checked that " +
  "simulator's physics and cannot vouch for it, so what appears here is a reading about that " +
  "simulator and not a measurement of real people or of any real robot. What this bench checked: " +
  "that the two runs name the same people, share a clock and a length, and start in the same " +
  "places to within a whisker, which it then closes by nudging them into exact agreement. What it " +
  "did not check, and cannot: whether anything else agreed between the two runs, including " +
  "whether they shared the same underlying randomness. That the two arms differ only in the robot " +
  "is the file's claim, not a finding of this bench's, and the comparison is only as good as that " +
  "claim.";

/**
 * The parts that carry the obligation, checked one at a time rather than as a whole sentence — the
 * way `fitVerdict.test.ts` checks `FIT_DISCLOSURE` by content rather than by counting paragraphs.
 */
export const EXTERNAL_DISCLOSURE_CLAUSES: readonly string[] = Object.freeze([
  "simulated by a simulator this bench did not write",
  "has not checked that simulator's physics",
  "not a measurement of real people or of any real robot",
  "is the file's claim, not a finding of this bench's",
]);

/**
 * The line a results file carries naming what produced its rows.
 *
 * Follows the precedent of `crowdModelLine` in `web/app/console/csv.ts`: anything carrying results
 * names the model that produced them, because a file outlives the page it came from. The values it
 * interpolates come from the run-set file itself and could in principle be anything a producer
 * chose to write there — the identifier check in this module's test guards the prose this function
 * supplies around them, not those values, which are data rather than copy.
 */
export function producedByLine(provenance: Provenance): string {
  return (
    `produced by ${provenance.producer} (version ${provenance.producerVersion}, build ` +
    `${provenance.build}), running ${provenance.simulator} with the crowd it calls ` +
    `${provenance.crowdModel}`
  );
}
