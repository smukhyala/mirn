/**
 * The placebo gate. If this file is red, nothing on the site can be trusted and no other work
 * proceeds — CLAUDE.md names it and `tests/test_placebo.py` as the two first-class gates.
 *
 * WHAT IT GUARDS. CausalAgents (arXiv:2207.03586) found that standard trajectory forecasters move
 * their minADE by 25-38% relative when agents that provably could not have influenced the scene
 * are deleted from it. That is the signature of an estimator whose agents are coupled through
 * shared model context — attention, social pooling, a scene encoding — so that removing one person
 * changes what the estimator concludes about everybody else. The paired estimator is built to be
 * incapable of that: each person's divergence is computed from their own two paths and nothing
 * else. This gate is what keeps it that way, because the coupling would be introduced by a
 * refactor that looked like a tidy-up.
 *
 * WHY IT DOES NOT RUN ON THE SIMULATOR, and this is the part that must not be "fixed". Delete a
 * bystander from the social-force crowd — someone who never came within 5 m of the robot — and the
 * estimate moves by up to 37%. That is the crowd being a crowd: removing anybody rewires the
 * interaction chain, the robot then plans a different path, and everyone's counterfactual changes.
 * It is correct behaviour, it is taught on page 9, and it means the sim can never pass a placebo
 * test. Pointing this gate at it would make the gate permanently red for a good reason, and the
 * obvious repair — loosening the tolerance until it goes green — leaves a test that asserts
 * nothing. So the gate runs on `analyticPair.ts`, a world whose pedestrians do not interact with
 * each other at all, where the only coupling that can possibly exist is coupling the estimator
 * invented.
 *
 * WHY THE INFLUENCE IS ABSURDLY SMALL. This is the one number here that looks like a mistake and
 * is not. The paired estimate is the arithmetic mean of the per-person divergences, so deleting
 * person k moves it by exactly
 *
 *     delta = (mean - divergence_k) / (n - 1)
 *
 * — an identity, present in any mean-based aggregate, with or without cross-agent coupling. Even a
 * perfectly uncoupled estimator cannot return literally the same number after losing a term. That
 * dilution is proportional to the estimate itself, so the only way to put it below an absolute
 * 1e-9 gate is to run at an influence small enough that the whole estimate is tiny. Python's
 * `tests/test_placebo.py` does the same thing for the same reason and calls it "the ordinary
 * dilution of an arithmetic mean losing one term". Raising the influence to something visible does
 * not make the test more realistic, it makes it fail on arithmetic. The realistic-influence
 * behaviour is measured on the pages, not here.
 *
 * WHAT THE ABSOLUTE GATE CANNOT SEE, and how case 2 covers it. The 1e-9 threshold is absolute
 * while coupling is relative, and the paragraph above forces the estimate itself down to about
 * 3.4e-8 m — so the gate alone only resolves a deletion-induced shift larger than roughly 3%.
 * CausalAgents' 25-38% clears that by an order of magnitude, but a subtler coupling bug would
 * slip through: injecting a 0.01%-per-agent coupling into the estimator was measured to leave the
 * threshold assertion green. Case 2 therefore also asserts the exact identity below, which has no
 * resolution limit, and which caught that injected bug. Both assertions stay: the threshold is
 * the stated contract shared with `tests/test_placebo.py`, and the identity is what gives it
 * teeth.
 *
 * WHY THE ROBOT'S REACH IS 15 cm. `data/synthetic.py` uses a 3 m reach in a 12 m box and admits in
 * its own docstring that the resulting "non-interacting" pedestrian is nothing of the sort — at
 * best 6.6 m out, which is barely two reach lengths, so it keeps around 11% of the push. A gate
 * whose bystander is 11% treated is a gate measuring the wrong thing. Shortening the reach is the
 * cheapest way to make "never came near the robot" mean "carries no robot effect": at the selected
 * bystander's 3.06 m the residual push is `exp(-20.4)`, about 4e-14 m, which is zero in every
 * sense this test cares about. Case 2 asserts that rather than trusting it.
 */

import { describe, expect, it } from "vitest";
import { pairedAgents } from "../../contracts/pairedRun.js";
import type { PairedRun } from "../../contracts/pairedRun.js";
import { paired } from "../estimator/index.js";
import {
  analyticPair,
  closestApproachM,
  dropAgent,
  keepOnlyAgent,
  makeAnalyticSpec,
  selectClosestAgent,
  selectNonInteractingAgent,
} from "./analyticPair.js";
import type { AnalyticSpecOverrides } from "./analyticPair.js";

/** The gate itself: a deletion that carries no signal may not move the estimate by this much. */
const GATE_M = 1e-9;

/** A pedestrian is a bystander if they never came this close to the robot. Twenty reach lengths. */
const EXCLUSION_RADIUS_M = 3.0;

/**
 * The world both placebo cases run in. Every field is load-bearing:
 *
 *  - `nPedestrians: 128` — the mean-dilution term goes as 1/(n-1), so a small crowd would put the
 *    irreducible arithmetic below the gate only at a still sillier influence.
 *  - `nSteps: 120` — 12 s at dt = 0.1 and about 1.2 m/s, which carries everyone past the robot at
 *    x = 10. A shorter run and nobody ever passes it, so there is no close passer for case 3.
 *  - `displacementDecayLengthM: 0.15` — see the file docstring.
 */
const PLACEBO_WORLD: AnalyticSpecOverrides = {
  seed: 20260816,
  nPedestrians: 128,
  nSteps: 120,
  displacementDecayLengthM: 0.15,
};

/**
 * Small but real. At this influence the bystander deletion lands 3.7x under the gate and the
 * close-passer deletion 3.9x over it — deliberately centred, so neither case is one rounding away
 * from flipping. Both scale linearly with this number, so moving it moves both.
 */
const PLACEBO_INFLUENCE = 2e-5;

/**
 * Golden values for case 4, measured from this fixture at this seed on 2026-08-20.
 *
 * Relative rather than bitwise, because the fixture's noise passes through `Math.log`, `Math.cos`
 * and `Math.exp`, and `rng/tape.ts` records that those are not bit-portable between JS engines. A
 * 1e-12 relative window is many orders tighter than any real fixture change and many orders looser
 * than a last-bit difference in a transcendental.
 */
const GOLDEN = {
  bystanderId: "ped0",
  bystanderApproachM: 3.0637874671652656,
  closePasserId: "ped17",
  closePasserApproachM: 0.036793014626231774,
  estimateM: 3.4070251706044363e-8,
} as const;
const GOLDEN_RELATIVE_TOLERANCE = 1e-12;

function placeboPair(influence: number): PairedRun {
  return analyticPair(makeAnalyticSpec({ ...PLACEBO_WORLD, influence }));
}

function bytesOf(values: Float64Array): Uint8Array {
  return new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
}

function sameBytes(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const left = bytesOf(a);
  const right = bytesOf(b);
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

/** How far a value sits from its golden, as a fraction of the golden. */
function relativeDrift(actual: number, golden: number): number {
  return Math.abs(actual / golden - 1);
}

describe("the placebo gate", () => {
  it("reports exactly zero, not nearly zero, when the robot did nothing at all", () => {
    // At influence 0 the push is multiplied by 0, so the treated arm is the control arm plus 0.0
    // at every step — bitwise identical, not merely close. Every per-step distance is therefore
    // sqrt(0) and the mean of those is 0 with no rounding anywhere in the chain. `toBe` rather
    // than `toBeCloseTo` for exactly that reason: exactness is available here, so a value that is
    // merely small would mean the two arms have drifted apart somewhere, which is the worst bug
    // this codebase can have. A tolerance would hide it.
    const pair = placeboPair(0);

    // Assert the premise as well as the conclusion. If the arms ever stopped being bitwise
    // identical, `toBe(0)` alone would report "expected 0, got 3e-17" and the reader would have to
    // guess why; this says which of the two things broke.
    let armsIdentical = true;
    for (const [treated, control] of pairedAgents(pair)) {
      if (!sameBytes(treated.positions, control.positions)) {
        armsIdentical = false;
      }
    }
    expect(armsIdentical).toBe(true);

    expect(paired(pair).value).toBe(0);
  });

  it("does not move when a pedestrian the robot never came near is deleted", () => {
    // The gate proper. The deleted pedestrian carries no robot effect, so removing them removes no
    // signal, so the estimate must stay put — that is the property CausalAgents found real
    // forecasters do not have.
    const pair = placeboPair(PLACEBO_INFLUENCE);

    const bystanderId = selectNonInteractingAgent(pair, EXCLUSION_RADIUS_M);
    expect(bystanderId).not.toBeNull();
    const removedId = bystanderId as string;

    // Eligibility is judged on the CONTROL arm, and re-checking it here on the control arm is the
    // point, not a formality. The push always moves a pedestrian AWAY from the robot, so their
    // treated-arm closest approach is always at least their control-arm one. Choosing the
    // bystander off the treated arm would be choosing partly on the displacement being measured —
    // selection on the outcome, the exact error the rest of this project exists to avoid. See the
    // module docstring of src/mirn/experiments/placebo.py, which is where this argument is made in
    // full.
    const approachM = closestApproachM(pair, removedId);
    expect(approachM).toBeGreaterThan(EXCLUSION_RADIUS_M);

    // And guard the assumption behind the choice, so that a future edit to the fixture's reach
    // fails here with a legible message instead of showing up as an unexplained delta. At a 0.15 m
    // reach and 3.06 m of clearance the push still applied to this pedestrian is about 4e-14 m —
    // four orders below the gate, so essentially all of the delta below is mean dilution rather
    // than deleted signal.
    const decayLengthM = 0.15;
    const residualPushM = PLACEBO_INFLUENCE * 1.5 * Math.exp(-approachM / decayLengthM);
    expect(residualPushM).toBeLessThan(GATE_M / 1000);

    const before = paired(pair).value;
    const after = paired(dropAgent(pair, removedId)).value;

    expect(Math.abs(after - before)).toBeLessThan(GATE_M);

    // The sharp form of the same claim, and the one that actually has teeth — see the file
    // docstring for the mutation that motivated it. Run the estimator on a pair containing only
    // the bystander and it returns that one person's divergence, so if no agent's number depends
    // on who else is in the room, the whole-crowd estimate must lose exactly that term and nothing
    // else. This is the arithmetic-mean dilution written out rather than tolerated, and it holds
    // to machine precision at any influence, so it sees coupling far below what an absolute
    // threshold on a 3.4e-8 m estimate ever could. Note that it deliberately does NOT catch an
    // estimator that ignores its input and returns a constant — a constant satisfies the identity
    // perfectly. That is case 3's job, and the two are complementary rather than redundant.
    const nBefore = pairedAgents(pair).length;
    const bystanderAlone = paired(keepOnlyAgent(pair, removedId)).value;
    const predicted = (before * nBefore - bystanderAlone) / (nBefore - 1);
    expect(relativeDrift(after, predicted)).toBeLessThan(1e-12);
  });

  it("does move when a pedestrian that walked right past the robot is deleted", () => {
    // The negative control, and the reason the case above is worth running. An estimator that
    // ignored its input and returned a constant would sail through a "deleting a bystander changes
    // nothing" assertion. This is the same assertion pointed at somebody who carries most of the
    // signal, and it must fail — deleting them has to move the estimate.
    //
    // The victim is chosen on the CONTROL arm too, for the same selection-on-the-outcome reason as
    // above: picking the closest passer off the treated arm would pick partly on the push itself.
    const pair = placeboPair(PLACEBO_INFLUENCE);

    const bystanderId = selectNonInteractingAgent(pair, EXCLUSION_RADIUS_M) as string;
    const closePasserId = selectClosestAgent(pair);
    expect(closePasserId).not.toBe(bystanderId);
    expect(closestApproachM(pair, closePasserId)).toBeLessThan(EXCLUSION_RADIUS_M);

    const before = paired(pair).value;
    const bystanderDelta = Math.abs(paired(dropAgent(pair, bystanderId)).value - before);
    const closePasserDelta = Math.abs(paired(dropAgent(pair, closePasserId)).value - before);

    // Stated against the gate the bystander has to pass, so there is no second magic number: the
    // same threshold that the bystander clears by 3.7x, the close passer breaks by 3.9x. That is
    // what makes the gate a gate rather than a formality.
    expect(closePasserDelta).toBeGreaterThan(GATE_M);

    // And in the ordinary sense of "appreciably": deleting the close passer changes the reported
    // perturbation by more than a twentieth of itself, where deleting the bystander changes it by
    // 1/(n-1) = 0.79%, which is the pure mean-dilution floor and nothing else.
    expect(closePasserDelta / before).toBeGreaterThan(0.05);
    expect(closePasserDelta).toBeGreaterThan(10 * bystanderDelta);
  });

  it("is reproducible from the seed alone, so a fixture edit fails here and not somewhere subtle", () => {
    // Without this case, changing the fixture — a different noise channel, a reordered draw, a
    // tweaked speed — would surface as one of the cases above going mysteriously red, and the
    // reader would start hunting for a bug in the estimator that is not there. This case fails
    // first, and says what actually happened.
    const first = placeboPair(PLACEBO_INFLUENCE);
    const second = placeboPair(PLACEBO_INFLUENCE);

    // Byte-for-byte within a run: the fixture is a pure function of its spec, so two builds of the
    // same spec must be indistinguishable, not approximately equal.
    let reproducible = true;
    for (let i = 0; i < first.treated.pedestrians.length; i++) {
      const a = first.treated.pedestrians[i];
      const b = second.treated.pedestrians[i];
      if (a === undefined || b === undefined || !sameBytes(a.positions, b.positions)) {
        reproducible = false;
      }
    }
    expect(reproducible).toBe(true);

    // The seed has to be wired to something. Without this, a fixture that quietly ignored its seed
    // would pass the check above perfectly.
    const otherSeed = analyticPair(
      makeAnalyticSpec({ ...PLACEBO_WORLD, seed: 20260817, influence: PLACEBO_INFLUENCE }),
    );
    const firstPed = first.control.pedestrians[0];
    const otherPed = otherSeed.control.pedestrians[0];
    expect(firstPed).toBeDefined();
    expect(otherPed).toBeDefined();
    expect(sameBytes((firstPed as { positions: Float64Array }).positions,
      (otherPed as { positions: Float64Array }).positions)).toBe(false);

    // The fixture forces the first step's push to exactly zero, so both arms start each pedestrian
    // at the identical position and `makePairedRun` can check that exactly instead of growing a
    // tolerance. That forcing has to be exercised at the fixture's DEFAULT 3 m reach and full
    // influence, because at the placebo world's 15 cm reach it is invisible: a pedestrian standing
    // 11 m away gets `exp(-73)` of the push at t = 0, which is far below the last bit of a 6 m
    // coordinate and would be swallowed whether it were forced to zero or not. Deleting the
    // forcing was measured to leave every other assertion in this file green while making the line
    // below throw 'identical first position exactly'.
    expect(() => analyticPair(makeAnalyticSpec({ influence: 1 }))).not.toThrow();

    // The golden pin. These are the four facts the two placebo cases above actually stand on: who
    // the bystander is, who the close passer is, how far each of them got from the robot, and what
    // the estimator reads on the full crowd. Change the fixture and this is the assertion that
    // moves, which is the whole point of it being here.
    expect(selectNonInteractingAgent(first, EXCLUSION_RADIUS_M)).toBe(GOLDEN.bystanderId);
    expect(selectClosestAgent(first)).toBe(GOLDEN.closePasserId);
    expect(
      relativeDrift(closestApproachM(first, GOLDEN.bystanderId), GOLDEN.bystanderApproachM),
    ).toBeLessThan(GOLDEN_RELATIVE_TOLERANCE);
    expect(
      relativeDrift(closestApproachM(first, GOLDEN.closePasserId), GOLDEN.closePasserApproachM),
    ).toBeLessThan(GOLDEN_RELATIVE_TOLERANCE);
    expect(relativeDrift(paired(first).value, GOLDEN.estimateM)).toBeLessThan(
      GOLDEN_RELATIVE_TOLERANCE,
    );
  });
});
