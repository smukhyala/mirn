import { describe, expect, it } from "vitest";
import { replicateBand } from "../../measure/null/band.js";
import { FAMILIES } from "../families.js";
import { makeFamilyProbeSettings, probeSeed, probeSeedsFor } from "../familyProbe.js";
import { effectConfig, powerCurveFor, probePowerSeed, PUSH_LEVELS } from "../powerCurve.js";

/**
 * The sweep against the real engine: the two invariants it rests on, and the finding it exists for.
 *
 * `powerCurve.test.ts` types its rooms out by hand and tests the counting. Everything here runs the
 * simulator, because all three claims below are claims about what the world actually does and a
 * hand-built fixture could assert any of them into being true.
 */

const SETTINGS = makeFamilyProbeSettings({ seeds: probeSeedsFor(8) });
const SEEDS = SETTINGS.seeds;

describe("the two things the whole sweep rests on", () => {
  /**
   * The anchor. If this is ever false, the curve's left-hand point stops being the number the
   * method card prints, and the two surfaces are quietly reporting two different worlds.
   *
   * `toBe`, never `toBeCloseTo`. Both routes reach the same configuration by different arguments —
   * one turns the push down to nothing, the other tells the crowd not to look — and "the same
   * world" is a bitwise claim or it is a hope.
   */
  it("is bitwise the zero-effect world at push nought, on every seed of every family", () => {
    let checked = 0;
    for (const key of ["pairedShared", "unpairedSeparate", "forecastCounterfactual"] as const) {
      for (const seed of SEEDS) {
        const swept = probePowerSeed(FAMILIES[key], SETTINGS, seed, 0);
        const zero = probeSeed(FAMILIES[key], SETTINGS, seed);

        expect(swept.truthM, `${key} seed ${seed}: truth is not exactly nothing`).toBe(0);
        expect(swept.reading.value, `${key} seed ${seed}: reading differs`).toBe(zero.reading.value);
        expect(swept.bandM, `${key} seed ${seed}: band differs`).toBe(zero.bandM);
        // The false-positive count is built from this flag, so the two files have to agree about it
        // and not merely about the numbers underneath it.
        expect(swept.clearedBand, `${key} seed ${seed}: verdict differs`).toBe(zero.clearedBand);
        checked = checked + 1;
      }
    }
    expect(checked, "no seed was checked").toBe(3 * SEEDS.length);
  }, 900000);

  /**
   * The line the whole curve is drawn against has to be the same line at every point of it, or the
   * plot shows two things moving and attributes both to one.
   */
  it("measures one drift line for the whole sweep, because the band ignores the robot", () => {
    const seed = SEEDS[0] ?? 0;
    const atZero = replicateBand(effectConfig(SETTINGS, seed, 0), SETTINGS.bandReplicates).value;
    let checked = 0;
    for (const push of PUSH_LEVELS) {
      const here = replicateBand(effectConfig(SETTINGS, seed, push), SETTINGS.bandReplicates).value;
      expect(here, `the drift line moved at push ${push}`).toBe(atZero);
      checked = checked + 1;
    }
    expect(checked).toBe(PUSH_LEVELS.length);
  }, 900000);
});

describe("what the sweep finds", () => {
  /**
   * The paired construction is the ruler that works, and this is what working looks like: it reads
   * the truth, and the rooms it calls are exactly the rooms with something in them to call.
   */
  it("has the paired ruler notice exactly the rooms where there was something to notice", () => {
    const curve = powerCurveFor(FAMILIES.pairedShared, SETTINGS);
    for (const level of curve.levels) {
      // It IS the paired estimator, so its reading is the truth rather than an estimate of it.
      expect(level.meanReading, `push ${level.pushStrength}`).toBe(level.meanTruthM);
      expect(level.nMissed, `push ${level.pushStrength}: missed a real effect`).toBe(0);
      expect(level.nFalseAlarm, `push ${level.pushStrength}: called an empty room`).toBe(0);
      expect(level.nHit, `push ${level.pushStrength}`).toBe(level.nTruthOverBand);
    }

    const first = curve.levels[0];
    const last = curve.levels[curve.levels.length - 1];
    if (first === undefined || last === undefined) {
      throw new Error("the sweep produced no levels");
    }
    // A curve, not a line: nothing to find at the bottom, everything found at the top.
    expect(first.nHit).toBe(0);
    expect(last.nHit).toBe(last.nAttempted);
    expect(last.meanTruthM).toBeGreaterThan(first.meanTruthM);
  }, 900000);

  /**
   * The finding this file was built for, and the one the false-positive rate alone cannot state.
   *
   * The forecast ruler's rate of calling a room barely moves between the emptiest world here and
   * the strongest. That is worse than a high false-positive rate and it is a different fault: a
   * ruler that fires at about the same rate whatever happened is not reporting on what happened, so
   * neither its alarms nor its silences carry information.
   *
   * The bound is deliberately loose — this asserts the SHAPE is flat, not a particular flatness.
   * A tight bound here would be a pinned measurement of an invented crowd wearing the clothes of a
   * finding, and the first physics change would turn it red for no reason worth acting on.
   */
  it("has the forecast ruler call rooms at about the same rate whatever the robot did", () => {
    const curve = powerCurveFor(FAMILIES.forecastCounterfactual, SETTINGS);
    const first = curve.levels[0];
    const last = curve.levels[curve.levels.length - 1];
    if (first === undefined || last === undefined) {
      throw new Error("the sweep produced no levels");
    }

    // At the bottom of the sweep the truth is exactly nothing, so every room it called is an alarm
    // over an empty room. It calls most of them anyway.
    expect(first.meanTruthM).toBe(0);
    expect(first.nFalseAlarm).toBeGreaterThan(first.nAttempted / 2);

    // And the reading it reports barely knows the difference between the two ends, while the truth
    // underneath it went from nothing to something a body can feel.
    expect(last.meanTruthM).toBeGreaterThan(0.3);
    const readingGrowth = last.meanReading - first.meanReading;
    expect(Math.abs(readingGrowth)).toBeLessThan(0.5 * last.meanTruthM);

    // The rate of calling a room is flat across the whole sweep: never fewer than half the rooms,
    // at any dial position, including the one where there is nothing at all to find.
    for (const level of curve.levels) {
      expect(level.nCleared, `push ${level.pushStrength} fell below half`).toBeGreaterThan(
        level.nAttempted / 2,
      );
    }
  }, 900000);

  /**
   * The absolute quantity is not a detector and this is what that looks like on a curve: it clears
   * the line in every room at every setting, so the curve is not merely flat, it is pinned to the
   * ceiling and carries no information at all.
   */
  it("has the ruler that compares nothing call every room at every setting", () => {
    const curve = powerCurveFor(FAMILIES.noCounterfactual, SETTINGS);
    for (const level of curve.levels) {
      expect(level.nCleared, `push ${level.pushStrength}`).toBe(level.nAttempted);
    }
  }, 900000);
});
