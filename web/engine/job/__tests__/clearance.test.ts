import { describe, expect, it } from "vitest";
import { makeRunConfig, SIM_CONSTANTS } from "../../contracts/config.js";
import { clearance } from "../../measure/metrics.js";
import { runPair } from "../../sim/run.js";
import { arrivalSecondsOf, clearanceAfterBothMove, startedMovingStep } from "../report.js";

/**
 * Pedestrians spawn from a strip 0.8 to 2.4 m in from whichever wall they start at, and the robot
 * starts at x = 2. So somebody is standing on the robot at step 0 about as often as not: at the
 * default settings the nearest person is 0.0099 m away before anybody has taken a step, and the
 * ungated minimum clearance is -0.5501 m at step 0 under nine of the eleven world sliders.
 *
 * That is a spawn artifact, not a near miss. Moving the spawn would move every published number
 * and invalidate the Python parity fixtures, so the spawn stays and the RULER changes: the gap
 * between the robot and one person is measured only from the moment both of them have left where
 * they were standing, and the tile says so.
 */
describe("clearanceAfterBothMove", () => {
  const config = makeRunConfig();
  const result = runPair(config);
  const robotPath = result.treated.robotPositions as Float64Array;

  it("finds the step each body left its starting position", () => {
    expect(startedMovingStep(robotPath, SIM_CONSTANTS.robotRadiusM)).toBe(8);
    expect(startedMovingStep(new Float64Array([0, 0, 0, 0]), 0.1)).toBe(-1);
  });

  it("reports a real brush instead of the spawn overlap", () => {
    const gated = clearanceAfterBothMove(
      robotPath,
      result.treated.positions,
      SIM_CONSTANTS.robotRadiusM,
      SIM_CONSTANTS.pedRadiusM,
      0.5,
    );
    expect(gated.minM).toBe(-0.04979741026062734);
    expect(gated.minAtStep).toBe(182);
    expect(gated.nearMissEpisodes).toBe(2);
    expect(gated.firstMeasuredStep).toBe(8);
    expect(gated.nStepsMeasured).toBe(793);
  });

  it("is measuring something different from the ungated ruler, and better", () => {
    const ungated = clearance(
      robotPath,
      result.treated.positions,
      SIM_CONSTANTS.robotRadiusM,
      SIM_CONSTANTS.pedRadiusM,
      0.5,
    );
    expect(ungated.minM).toBe(-0.5500943960256908);
    expect(ungated.minAtStep).toBe(0);
  });

  it("reports nothing measured when there is no robot", () => {
    const gated = clearanceAfterBothMove(
      null,
      result.control.positions,
      SIM_CONSTANTS.robotRadiusM,
      SIM_CONSTANTS.pedRadiusM,
      0.5,
    );
    expect(Number.isNaN(gated.minM)).toBe(true);
    expect(gated.minAtStep).toBe(-1);
    expect(gated.nStepsMeasured).toBe(0);
    expect(gated.nearMissEpisodes).toBe(0);
  });

  it("reports nothing measured when the robot itself never leaves its spawn tile", () => {
    // A synthetic robot path that never moves, distinct from the "no robot at all" case above:
    // this exercises clearanceAfterBothMove's own robotStart < 0 early return rather than its
    // robotPath === null one. No pedestrians are needed to reach that branch.
    const stationaryRobot = new Float64Array([2, 2, 2, 2, 2, 2]);
    const gated = clearanceAfterBothMove(
      stationaryRobot,
      [],
      SIM_CONSTANTS.robotRadiusM,
      SIM_CONSTANTS.pedRadiusM,
      0.5,
    );
    expect(Number.isNaN(gated.minM)).toBe(true);
    expect(gated.minAtStep).toBe(-1);
    expect(gated.nStepsMeasured).toBe(0);
    expect(gated.nearMissEpisodes).toBe(0);
  });
});

/**
 * The property the whole task exists for, pinned directly rather than left to an uncommitted
 * script: two crowd sizes the OLD ruler cannot tell apart at all become distinguishable under the
 * new one. 18 and 30 pedestrians were measured (outside this suite) to put the same nearest person
 * on the robot's start tile at step 0, so `clearance()` reports the identical spawn artifact for
 * both -- exactly the "no knob moves it" failure this task fixes. Deliberately does not pin the
 * four underlying magnitudes as literals: the simulator is allowed to change what those numbers
 * are, but this property -- indistinguishable to the old ruler, distinguishable to the new one --
 * is what must survive that change.
 */
describe("clearanceAfterBothMove distinguishes settings the old ruler cannot", () => {
  it("gates two crowd sizes the ungated ruler reports identically into two different readings", () => {
    const small = runPair(makeRunConfig());
    const big = runPair(makeRunConfig({ crowd: { nPedestrians: 30 } }));

    const ungatedSmall = clearance(
      small.treated.robotPositions as Float64Array,
      small.treated.positions,
      SIM_CONSTANTS.robotRadiusM,
      SIM_CONSTANTS.pedRadiusM,
      0.5,
    );
    const ungatedBig = clearance(
      big.treated.robotPositions as Float64Array,
      big.treated.positions,
      SIM_CONSTANTS.robotRadiusM,
      SIM_CONSTANTS.pedRadiusM,
      0.5,
    );

    // The premise, asserted rather than assumed: if a future change to spawn placement or crowd
    // size ever breaks this coincidence, THIS assertion is the one that fails and says so --
    // without it, the rest of the test could pass for the wrong reason (or vacuously).
    expect(ungatedSmall.minM).toBe(ungatedBig.minM);
    expect(ungatedSmall.minAtStep).toBe(0);
    expect(ungatedBig.minAtStep).toBe(0);

    const gatedSmall = clearanceAfterBothMove(
      small.treated.robotPositions as Float64Array,
      small.treated.positions,
      SIM_CONSTANTS.robotRadiusM,
      SIM_CONSTANTS.pedRadiusM,
      0.5,
    );
    const gatedBig = clearanceAfterBothMove(
      big.treated.robotPositions as Float64Array,
      big.treated.positions,
      SIM_CONSTANTS.robotRadiusM,
      SIM_CONSTANTS.pedRadiusM,
      0.5,
    );

    // Measured spread between these two settings is ~0.163 m. 0.05 m is two orders of magnitude
    // above any floating-point noise, while staying well under the measured spread, so this still
    // catches a regression that shrinks the gate's effect without eliminating it outright.
    const MIN_DISTINGUISHABLE_M = 0.05;
    expect(Math.abs(gatedSmall.minM - gatedBig.minM)).toBeGreaterThan(MIN_DISTINGUISHABLE_M);
  });
});

describe("arrivalSecondsOf", () => {
  it("converts the arrival tick to the second of the sample that recorded it", () => {
    const config = makeRunConfig();
    const result = runPair(config);
    expect(arrivalSecondsOf(result.treated, config.dt)).toBe(328 * 0.05);
  });

  it("is NaN when the robot never arrived", () => {
    const config = makeRunConfig({ robot: { deflectionWeight: 3 } });
    const result = runPair(config);
    expect(Number.isNaN(arrivalSecondsOf(result.treated, config.dt))).toBe(true);
  });
});
