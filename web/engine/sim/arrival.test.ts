import { describe, expect, it } from "vitest";
import { makeRunConfig, SIM_CONSTANTS } from "../contracts/config.js";
import { pathLength } from "../measure/kernels.js";
import { runPair } from "./run.js";

/**
 * The old arrival number was a path-freeze heuristic: the first sample after which the robot's
 * position stops changing. It answers "when did the robot stop", which is only the same question
 * as "when did it arrive" when the robot stops at its goal.
 *
 * Under `deflectionWeight: 3` it does not. The robot dithers, holds still for a sample while it
 * re-plans, and the heuristic calls that arrival at 8.0 s — for a journey of 18.06 m, which is
 * 2.26 m/s from a robot whose speed cap is 1.1 m/s. The simulator has always known better:
 * `RobotState.arrivedTick` is set from the distance to the goal and was thrown away at the
 * `ArmResult` boundary.
 */
function frozenStep(path: Float64Array): number {
  const nSteps = path.length / 2;
  for (let s = 1; s < nSteps; s++) {
    const dx = (path[2 * s] as number) - (path[2 * s - 2] as number);
    const dy = (path[2 * s + 1] as number) - (path[2 * s - 1] as number);
    if (Math.sqrt(dx * dx + dy * dy) < 1e-4) {
      return s;
    }
  }
  return -1;
}

describe("ArmResult.arrivedTick", () => {
  it("reports the tick the default robot first came inside the goal radius", () => {
    const result = runPair(makeRunConfig());
    expect(result.treated.arrivedTick).toBe(327);
    const arrivalSample = result.treated.arrivedTick + 1;
    const path = result.treated.robotPositions as Float64Array;
    const dx = result.config.robot.goalXY[0] - (path[2 * arrivalSample] as number);
    const dy = result.config.robot.goalXY[1] - (path[2 * arrivalSample + 1] as number);
    expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThan(SIM_CONSTANTS.goalReachedM);
  });

  it("is -1 in an arm with no robot at all", () => {
    const result = runPair(makeRunConfig());
    expect(result.control.robotPositions).toBeNull();
    expect(result.control.arrivedTick).toBe(-1);
  });

  it("censors a polite robot that never arrives, where the old heuristic invented a speed", () => {
    const config = makeRunConfig({ robot: { deflectionWeight: 3 } });
    const result = runPair(config);
    const path = result.treated.robotPositions as Float64Array;

    expect(result.treated.arrivedTick).toBe(-1);

    // The heuristic this replaces does answer, and its answer is impossible.
    const frozen = frozenStep(path);
    expect(frozen).toBe(160);
    const impliedSpeed = pathLength(path) / (frozen * config.dt);
    expect(impliedSpeed).toBeGreaterThan(config.robot.maxSpeed * 2);
  });
});
