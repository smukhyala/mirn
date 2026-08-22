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
