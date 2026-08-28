import { describe, expect, it } from "vitest";
import { ContractError } from "../../core/errors.js";
import { makeReading } from "../columns.js";
import {
  aggregatePowerLevel,
  effectWorld,
  PUSH_LEVELS,
  type PowerSeed,
} from "../powerCurve.js";

/**
 * The counting, on rooms typed out by hand.
 *
 * The arithmetic here is the whole reason this file exists separately from the sweep itself. What a
 * count means depends on a room-by-room fact — whether the true effect in THAT room cleared the
 * drift line — and the interesting combinations do not come out of the simulator on demand. You
 * cannot ask it for a room where the truth was over the line and the ruler missed it; you can only
 * run rooms until one turns up. So the outcomes are literals and only the tallying is under test.
 *
 * The world itself is measured in `powerCurve.slow.test.ts`, against the real engine, including the
 * two invariants the whole sweep rests on.
 */

const BAND_M = 0.29;

function room(init: {
  readonly seed: number;
  readonly push?: number;
  readonly truthM: number;
  readonly readingM: number | null;
}): PowerSeed {
  const push = init.push ?? 1;
  const reading =
    init.readingM === null
      ? makeReading(Number.NaN, { kind: "censored", why: "the episode ended first" })
      : makeReading(init.readingM, { kind: "measured" });
  return Object.freeze({
    kind: "powerSeed" as const,
    seed: init.seed,
    pushStrength: push,
    reading,
    bandM: BAND_M,
    peakBandM: 0.44,
    truthM: init.truthM,
    truthOverBand: init.truthM > BAND_M,
    clearedBand: init.readingM === null ? false : init.readingM > BAND_M,
  });
}

describe("the dial positions the sweep visits", () => {
  it("starts at nothing, because that is the point tying it to the false-positive count", () => {
    // Not cosmetic ordering. The left end of every curve is the world the method card already
    // reports a count on, and a sweep starting anywhere else would have no anchor to it.
    expect(PUSH_LEVELS[0]).toBe(0);
  });

  it("stops where the console's own dial stops", () => {
    // Past this a reader could not reproduce the curve by turning the control on the page.
    expect(PUSH_LEVELS[PUSH_LEVELS.length - 1]).toBe(3);
  });

  it("rises, so a curve read left to right is read in one direction", () => {
    for (let i = 1; i < PUSH_LEVELS.length; i++) {
      expect(PUSH_LEVELS[i] ?? 0).toBeGreaterThan(PUSH_LEVELS[i - 1] ?? 0);
    }
  });
});

describe("the world at one dial position", () => {
  it("lets the crowd see the robot, which is the difference from the zero-effect world", () => {
    const world = effectWorld(1) as { pedestriansSeeRobot: boolean; robot: { repulsionScale: number } };
    expect(world.pedestriansSeeRobot).toBe(true);
    expect(world.robot.repulsionScale).toBe(1);
  });

  it("still lets the crowd see a robot that pushes with no strength at all", () => {
    // The zero end is reached by turning the push down, NOT by blindfolding the crowd. That those
    // two produce bit-identical rooms is the claim `powerCurve.slow.test.ts` measures; if this
    // were written the other way the claim would be true by construction and worth nothing.
    const world = effectWorld(0) as { pedestriansSeeRobot: boolean; robot: { repulsionScale: number } };
    expect(world.pedestriansSeeRobot).toBe(true);
    expect(world.robot.repulsionScale).toBe(0);
  });

  it("refuses a push that is not a length", () => {
    expect(() => effectWorld(-1)).toThrow(ContractError);
    expect(() => effectWorld(Number.NaN)).toThrow(ContractError);
  });
});

describe("counting one dial position", () => {
  it("keeps a false alarm apart from a miss, because they are opposite failures", () => {
    // Four rooms at one setting. Two had a real effect over the line, two did not — which is what
    // the same dial position does to different rooms, and is the reason these cannot be pooled.
    const level = aggregatePowerLevel(1, [
      room({ seed: 1, truthM: 0.4, readingM: 0.5 }), // something there, called    -> hit
      room({ seed: 2, truthM: 0.4, readingM: 0.1 }), // something there, not called -> miss
      room({ seed: 3, truthM: 0.1, readingM: 0.5 }), // nothing there, called       -> false alarm
      room({ seed: 4, truthM: 0.1, readingM: 0.1 }), // nothing there, not called   -> correct pass
    ]);

    expect(level.nAttempted).toBe(4);
    expect(level.nTruthOverBand).toBe(2);
    expect(level.nHit).toBe(1);
    expect(level.nMissed).toBe(1);
    expect(level.nFalseAlarm).toBe(1);
    // The plain count of rooms it called, which is a hit and a false alarm together and is exactly
    // the number that would mislead if it were the only one reported.
    expect(level.nCleared).toBe(2);
  });

  it("counts a room it could not measure in the denominator and nowhere else", () => {
    // A ruler that was never asked is not a ruler that failed. Counting an unmeasured room as a
    // miss would report the opposite of what happened.
    const level = aggregatePowerLevel(1, [
      room({ seed: 1, truthM: 0.4, readingM: 0.5 }),
      room({ seed: 2, truthM: 0.4, readingM: null }),
    ]);
    expect(level.nAttempted).toBe(2);
    expect(level.nTruthOverBand).toBe(2);
    expect(level.nHit).toBe(1);
    expect(level.nMissed).toBe(0);
    expect(level.nFalseAlarm).toBe(0);
  });

  it("averages the reading over rooms it read and the truth over all of them", () => {
    // The truth is a fact about the room and exists whether or not the ruler managed to answer, so
    // it averages over every room. The reading does not, and folding an absence in as a nought
    // would report a ruler that stayed silent as a ruler that read nothing.
    const level = aggregatePowerLevel(1, [
      room({ seed: 1, truthM: 0.4, readingM: 0.6 }),
      room({ seed: 2, truthM: 0.2, readingM: null }),
    ]);
    expect(level.meanTruthM).toBeCloseTo(0.3, 12);
    expect(level.meanReading).toBeCloseTo(0.6, 12);
  });

  it("refuses rooms from a different dial position", () => {
    // Every count on a level is quoted against one setting. A room from another one would put a
    // different world into the same denominator, and the curve would have two x values at one point.
    expect(() =>
      aggregatePowerLevel(1, [
        room({ seed: 1, truthM: 0.4, readingM: 0.5 }),
        room({ seed: 2, push: 2, truthM: 0.4, readingM: 0.5 }),
      ]),
    ).toThrow(ContractError);
  });

  it("refuses a level with no rooms in it", () => {
    expect(() => aggregatePowerLevel(1, [])).toThrow(ContractError);
  });
});
