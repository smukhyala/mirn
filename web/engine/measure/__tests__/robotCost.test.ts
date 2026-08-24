import { describe, expect, it } from "vitest";
import { robotCost } from "../metrics.js";
import type { RunResult } from "../../sim/run.js";

/**
 * The robot's own bill, and the one thing it is allowed to know.
 *
 * This function used to return four more fields — a time lost, a censoring flag and both arrival
 * times — every one of them derived from a "first step after which the path stops moving"
 * heuristic. Nothing read them, and the heuristic is wrong in a way that matters: a robot pinned
 * against a crowd stops moving without having arrived, which is how it once reported a 1.1 m/s
 * robot arriving at 2.26 m/s. The console asks the simulator when the robot came inside its goal
 * radius instead. There was no test here at all while all of that was true.
 */

function arm(positions: readonly number[] | null): RunResult["treated"] {
  const robotPositions = positions === null ? null : new Float64Array(positions);
  return { robotPositions } as unknown as RunResult["treated"];
}

/** Straight along x: (0,0) -> (1,0) -> (3,0). Three metres walked. */
const LONG = [0, 0, 1, 0, 3, 0];
/** The same start and end in one fewer turn: two metres walked. */
const SHORT = [0, 0, 1, 0, 2, 0];

describe("robotCost", () => {
  it("reports both path lengths and the signed difference between them", () => {
    const cost = robotCost(arm(LONG), arm(SHORT));
    expect(cost.treatedPathM).toBeCloseTo(3, 12);
    expect(cost.controlPathM).toBeCloseTo(2, 12);
    expect(cost.extraPathM).toBeCloseTo(1, 12);
  });

  it("keeps the sign when the treatment shortened the route", () => {
    // A shove toward the goal genuinely saves distance. Clipping this to zero would be a lie, and
    // is why this does not go through the divergences' non-negative estimate type.
    const cost = robotCost(arm(SHORT), arm(LONG));
    expect(cost.extraPathM).toBeCloseTo(-1, 12);
  });

  it("still measures the treated route when the control arm has no robot at all", () => {
    // The ordinary robot-presence pair: there is no second route to subtract, but the first one is
    // perfectly well defined and is what the distance-travelled column reads.
    const cost = robotCost(arm(LONG), arm(null));
    expect(cost.treatedPathM).toBeCloseTo(3, 12);
    expect(Number.isNaN(cost.controlPathM)).toBe(true);
    expect(Number.isNaN(cost.extraPathM)).toBe(true);
  });

  it("reports nothing measurable when the treated arm has no robot", () => {
    const cost = robotCost(arm(null), arm(SHORT));
    expect(Number.isNaN(cost.treatedPathM)).toBe(true);
    expect(Number.isNaN(cost.extraPathM)).toBe(true);
    expect(cost.controlPathM).toBeCloseTo(2, 12);
  });

  it("carries no arrival time, so nothing can read one from the shape of a path", () => {
    const cost = robotCost(arm(LONG), arm(SHORT)) as unknown as Record<string, unknown>;
    for (const field of ["timeLostS", "censored", "treatedArrivalS", "controlArrivalS"]) {
      expect(Object.hasOwn(cost, field), `robotCost is reporting ${field} again`).toBe(false);
    }
  });
});
