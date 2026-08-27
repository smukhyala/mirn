import { describe, expect, it } from "vitest";
import { ContractError } from "../../core/errors.js";
import { supportedConfidences, wilsonInterval } from "../interval.js";

/**
 * The number the page prints, and the reason it is not the easy one.
 *
 * Every count this bench produces most often sits at an endpoint — 8 of 8, 0 of 8 — and those are
 * exactly the counts where the textbook Wald interval has no width at all. So the first two cases
 * here are the motivating ones, the loop in the middle is the property that actually matters, and
 * the last one computes Wald inline so that "we chose Wilson because Wald collapses" is a failing
 * test rather than a comment somebody deletes while simplifying.
 */

const Z95 = 1.959963984540054;

describe("wilsonInterval at the endpoints", () => {
  it("does not collapse at 8 of 8, and reaches about two-thirds down", () => {
    // n = 8, k = 8, p = 1, z = 1.959963984540054, z^2 = 3.8414588206941245.
    //   z^2/n      = 0.48018235258676556
    //   d          = 1 + z^2/n = 1.4801823525867656
    //   centre     = (1 + z^2/(2n)) / d = 1.2400911762933828 / 1.4801823525867656
    //   halfWidth  = (z/d) * sqrt( 0 + z^2/(4n^2) ) = z^2/(2n) / d
    //              = 0.24009117629338278 / 1.4801823525867656
    // The two shift terms cancel in the lower bound, so low is exactly 1/d:
    //   low  = 1 / 1.4801823525867656 = 0.6755924351161198  -> 0.6756
    //   high = (1 + z^2/n) / d = d/d  = 1                   -> 1.0000
    const interval = wilsonInterval(8, 8);

    expect(interval.kind).toBe("rateInterval");
    expect(interval.point).toBe(1);
    expect(interval.low).toBeCloseTo(0.6756, 4);
    expect(interval.high).toBe(1);

    // The whole point: eight of eight is consistent with a true rate a third of the way down.
    expect(interval.high - interval.low).toBeGreaterThan(0.3);
    expect(interval.low).toBeLessThan(0.7);
  });

  it("does not collapse at 0 of 8 either, and reaches about a third up", () => {
    // Same n and z, with p = 0. The arithmetic is the mirror of the case above:
    //   centre    = (0 + z^2/(2n)) / d = 0.24009117629338278 / 1.4801823525867656
    //   halfWidth = the same quantity, so low = 0 exactly and
    //   high      = 2 * 0.24009117629338278 / 1.4801823525867656 = 0.32440756488388023 -> 0.3244
    const interval = wilsonInterval(0, 8);

    expect(interval.point).toBe(0);
    expect(interval.low).toBe(0);
    expect(interval.high).toBeCloseTo(0.3244, 4);
    expect(interval.high).toBeGreaterThan(0.3);
  });

  it("is centred on a half and symmetric at 4 of 8", () => {
    // p = 1/2: centre is exactly 1/2 because the shift term z^2/(2n) equals half of z^2/n.
    //   low = 0.21521606219277253, high = 0.7847839378072275
    const interval = wilsonInterval(4, 8);

    expect(interval.point).toBe(0.5);
    expect(interval.low).toBeCloseTo(0.2152, 4);
    expect(interval.high).toBeCloseTo(0.7848, 4);

    const centre = (interval.low + interval.high) / 2;
    expect(centre).toBeCloseTo(0.5, 12);
  });
});

describe("wilsonInterval over every count it can be asked for", () => {
  it("contains the point estimate, with low no greater than high", () => {
    // This is the property that matters, and it is checked at every (k, n) the bench can reach
    // rather than at three hand-picked counts.
    let checked = 0;
    for (let n = 1; n <= 40; n += 1) {
      for (let k = 0; k <= n; k += 1) {
        const interval = wilsonInterval(k, n);
        const point = k / n;

        expect(interval.point).toBe(point);
        expect(interval.low).toBeLessThanOrEqual(interval.high);
        expect(interval.low).toBeLessThanOrEqual(point);
        expect(interval.high).toBeGreaterThanOrEqual(point);
        checked += 1;
      }
    }
    expect(checked).toBe(860);
  });

  it("keeps both bounds inside nought and one", () => {
    for (let n = 1; n <= 40; n += 1) {
      for (let k = 0; k <= n; k += 1) {
        const interval = wilsonInterval(k, n);

        expect(interval.low).toBeGreaterThanOrEqual(0);
        expect(interval.low).toBeLessThanOrEqual(1);
        expect(interval.high).toBeGreaterThanOrEqual(0);
        expect(interval.high).toBeLessThanOrEqual(1);
      }
    }
  });

  it("puts the endpoint bound exactly on nought and one, not an ulp off it", () => {
    // The closed form makes these exact in real arithmetic and misses by one or two ulps in
    // floating point, in the direction that puts the bound on the wrong side of the point
    // estimate: 0 of 7 once came back with a lower bound of 2.78e-17. Pinned as `toBe`, because
    // a tolerance here would hide exactly the drift it is meant to catch.
    for (let n = 1; n <= 40; n += 1) {
      expect(wilsonInterval(0, n).low).toBe(0);
      expect(wilsonInterval(n, n).high).toBe(1);
    }
  });

  it("has no width at all only where a count cannot be resolved, which is nowhere", () => {
    for (let n = 1; n <= 40; n += 1) {
      for (let k = 0; k <= n; k += 1) {
        const interval = wilsonInterval(k, n);
        const width = interval.high - interval.low;

        expect(width).toBeGreaterThan(0);
      }
    }
  });
});

describe("what the room-count control buys", () => {
  it("narrows the interval as the rooms grow at a fixed rate", () => {
    // The same rate, measured on more rooms. This is the whole argument for letting a reader
    // turn the count up: the number does not jump, the interval closes around it.
    const quarter = wilsonInterval(2, 4);
    const eighth = wilsonInterval(4, 8);
    const sixteenth = wilsonInterval(8, 16);

    const wideWidth = quarter.high - quarter.low;
    const middleWidth = eighth.high - eighth.low;
    const narrowWidth = sixteenth.high - sixteenth.low;

    expect(middleWidth).toBeLessThan(wideWidth);
    expect(narrowWidth).toBeLessThan(middleWidth);
  });

  it("widens the interval when more confidence is asked of the same count", () => {
    const ninety = wilsonInterval(6, 8, 0.9);
    const ninetyFive = wilsonInterval(6, 8, 0.95);
    const ninetyNine = wilsonInterval(6, 8, 0.99);

    const ninetyWidth = ninety.high - ninety.low;
    const ninetyFiveWidth = ninetyFive.high - ninetyFive.low;
    const ninetyNineWidth = ninetyNine.high - ninetyNine.low;

    expect(ninetyFiveWidth).toBeGreaterThan(ninetyWidth);
    expect(ninetyNineWidth).toBeGreaterThan(ninetyFiveWidth);
  });

  it("offers the three levels the table holds, and defaults to 0.95", () => {
    expect(supportedConfidences()).toEqual([0.9, 0.95, 0.99]);
    expect(wilsonInterval(6, 8).confidence).toBe(0.95);
    expect(wilsonInterval(6, 8)).toEqual(wilsonInterval(6, 8, 0.95));
  });
});

describe("wilsonInterval refuses what it cannot answer", () => {
  it("throws ContractError on a count that is not a whole number of rooms", () => {
    expect(() => wilsonInterval(1.5, 8)).toThrow(ContractError);
    expect(() => wilsonInterval(4, 8.5)).toThrow(ContractError);
    expect(() => wilsonInterval(Number.NaN, 8)).toThrow(ContractError);
    expect(() => wilsonInterval(4, Number.NaN)).toThrow(ContractError);
    expect(() => wilsonInterval(4, Number.POSITIVE_INFINITY)).toThrow(ContractError);
  });

  it("throws ContractError on a count of no rooms at all", () => {
    expect(() => wilsonInterval(0, 0)).toThrow(ContractError);
    expect(() => wilsonInterval(0, -1)).toThrow(ContractError);
  });

  it("throws ContractError when the successes are negative or exceed the attempts", () => {
    expect(() => wilsonInterval(-1, 8)).toThrow(ContractError);
    expect(() => wilsonInterval(9, 8)).toThrow(ContractError);
  });

  it("throws ContractError on a confidence the closed table does not hold", () => {
    // No inverse normal CDF: an approximation would be a second formula nobody checks, so a
    // level that is not in the table is refused rather than guessed at.
    expect(() => wilsonInterval(4, 8, 0.975)).toThrow(ContractError);
    expect(() => wilsonInterval(4, 8, 0.5)).toThrow(ContractError);
    expect(() => wilsonInterval(4, 8, 1)).toThrow(ContractError);
    expect(() => wilsonInterval(4, 8, 0)).toThrow(ContractError);
  });

  it("returns a frozen plain record, because it crosses a Worker boundary", () => {
    const interval = wilsonInterval(8, 8);
    expect(Object.isFrozen(interval)).toBe(true);
    expect(structuredClone(interval)).toEqual(interval);
  });
});

describe("the meta-test that stops somebody simplifying this to Wald", () => {
  it("shows Wald giving a zero-width interval at 8 of 8, where Wilson gives a third of the scale", () => {
    // Wald: p +/- z * sqrt(p(1-p)/n). At p = 1 the variance term is exactly 0, so both bounds
    // are exactly p and the interval has no width — on the very count this bench produces most
    // often, and on only eight observations.
    const nCleared = 8;
    const nAttempted = 8;
    const p = nCleared / nAttempted;
    const waldHalfWidth = Z95 * Math.sqrt((p * (1 - p)) / nAttempted);
    const waldLow = p - waldHalfWidth;
    const waldHigh = p + waldHalfWidth;

    expect(waldHalfWidth).toBe(0);
    expect(waldLow).toBe(1);
    expect(waldHigh).toBe(1);
    expect(waldHigh - waldLow).toBe(0);

    // Wilson, on the identical inputs, keeps a width of about a third.
    const wilson = wilsonInterval(nCleared, nAttempted);
    expect(wilson.high - wilson.low).toBeGreaterThan(0.3);
    expect(wilson.low).toBeLessThan(waldLow);
  });

  it("shows Wald collapsing at 0 of 8 as well", () => {
    const p = 0 / 8;
    const waldHalfWidth = Z95 * Math.sqrt((p * (1 - p)) / 8);

    expect(waldHalfWidth).toBe(0);

    const wilson = wilsonInterval(0, 8);
    expect(wilson.high).toBeGreaterThan(p + waldHalfWidth);
  });
});
