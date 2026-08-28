import { describe, expect, it } from "vitest";
import { ContractError } from "../../core/errors.js";
import { QUANTILE_LADDER, speedDistance } from "../distance.js";

/**
 * The fit statistic: what it must be, and the one thing it must never become.
 *
 * It is a distance between two DISTRIBUTIONS of speed, in metres per second. It is not a difference
 * between two arms, it cannot be turned into one, and nothing it is given carries which person or
 * which moment a speed came from. That is what keeps guardrail 11's line: a recording may say
 * whether the invented crowd walks like this one, and may never say how much a robot moved anybody.
 */

function sample(values: readonly number[]): Float64Array {
  return new Float64Array(values);
}

describe("the distance between two sets of speeds", () => {
  it("is nought when the two are the same", () => {
    const speeds = sample([1, 1.2, 1.4, 0.9, 1.1]);
    expect(speedDistance(speeds, speeds)).toBe(0);
    expect(speedDistance(speeds, sample([1, 1.2, 1.4, 0.9, 1.1]))).toBe(0);
  });

  it("does not care what order the speeds arrived in", () => {
    // A crowd is being compared to a crowd. Nothing here lines one walker up against another, and
    // an order-sensitive statistic would be quietly claiming it could.
    const a = sample([1, 1.2, 1.4, 0.9]);
    const b = sample([1.4, 0.9, 1, 1.2]);
    expect(speedDistance(a, b)).toBe(0);
  });

  it("is symmetric", () => {
    const a = sample([1, 1.2, 1.4, 0.9]);
    const b = sample([1.6, 1.8, 2, 1.5]);
    expect(speedDistance(a, b)).toBe(speedDistance(b, a));
  });

  it("comes back in metres per second, which is what makes it readable", () => {
    // Shift every speed by exactly 0.5 m/s and the distance is 0.5. A statistic in its own units
    // could not be read as a sentence about walking, and would invite being read as a p-value.
    const a = sample([1, 1.1, 1.2, 1.3, 1.4]);
    const b = sample([1.5, 1.6, 1.7, 1.8, 1.9]);
    expect(speedDistance(a, b)).toBeCloseTo(0.5, 10);
  });

  it("grows as the two move apart", () => {
    const base = sample([1, 1.1, 1.2, 1.3]);
    const near = sample([1.1, 1.2, 1.3, 1.4]);
    const far = sample([2, 2.1, 2.2, 2.3]);
    expect(speedDistance(base, near)).toBeLessThan(speedDistance(base, far));
  });

  it("bounds what one wild value can do, and the bound tightens as the sample grows", () => {
    // The ladder stops at 0.05 and 0.95 because the fastest speed in a tracked sample is usually a
    // tracking error rather than a sprint. A first draft of this test asserted such a value was
    // ignored ENTIRELY and went red: at twenty samples the top rung still interpolates a twentieth
    // of the way into the gap below the maximum, so a little of it leaks in. What is true is the
    // useful thing — the leak is bounded, and it shrinks as the sample grows, so on a recording
    // with thousands of steps in it a lone glitch is outside the ladder altogether.
    const flat = (n: number): Float64Array => new Float64Array(n).fill(1);

    const small = flat(20);
    const smallGlitched = new Float64Array(small);
    smallGlitched[19] = 40;
    const smallEffect = speedDistance(small, smallGlitched);
    // A fortieth of the outlier reaches the statistic, not the outlier itself.
    expect(smallEffect).toBeGreaterThan(0);
    expect(smallEffect).toBeLessThan(0.2);

    const large = flat(400);
    const largeGlitched = new Float64Array(large);
    largeGlitched[399] = 40;
    // At the size a real recording comes in, it does not reach the statistic at all.
    expect(speedDistance(large, largeGlitched)).toBe(0);
  });

  it("refuses a comparison against nothing", () => {
    // A distance to an empty sample is not large, it is undefined. Returning a number would put a
    // figure on the page describing no comparison at all.
    expect(() => speedDistance(sample([1, 2]), sample([]))).toThrow(ContractError);
    expect(() => speedDistance(sample([]), sample([1, 2]))).toThrow(ContractError);
  });

  it("leaves its inputs alone", () => {
    // It sorts internally, and the caller keeps their samples for the next candidate.
    const a = sample([3, 1, 2]);
    speedDistance(a, sample([1, 2, 3]));
    expect([...a]).toEqual([3, 1, 2]);
  });

  it("reads the two distributions at the same rungs, ends excluded", () => {
    expect(QUANTILE_LADDER[0]).toBe(0.05);
    expect(QUANTILE_LADDER[QUANTILE_LADDER.length - 1]).toBe(0.95);
    for (let i = 1; i < QUANTILE_LADDER.length; i++) {
      expect(QUANTILE_LADDER[i] ?? 0).toBeGreaterThan(QUANTILE_LADDER[i - 1] ?? 0);
    }
  });
});
