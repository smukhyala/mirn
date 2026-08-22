import { describe, expect, it } from "vitest";
import { finiteCount, meanOf, sdOf } from "../stats.js";

/**
 * These three functions decide what a censored run does to a published average, so their
 * non-finite behaviour is the whole point and is pinned here rather than assumed.
 */
describe("meanOf", () => {
  it("averages the finite values and silently drops the rest", () => {
    expect(meanOf([1, 2, 3])).toBe(2);
    expect(meanOf([1, Number.NaN, 3])).toBe(2);
    expect(meanOf([1, Number.POSITIVE_INFINITY, 3])).toBe(2);
    expect(meanOf([1, Number.NEGATIVE_INFINITY, 3])).toBe(2);
  });

  it("is NaN when nothing survives, never 0", () => {
    // A 0 here would render as a real measurement of "no effect" on a page that cannot tell the
    // difference. NaN is the only honest answer to an average of nothing.
    expect(Number.isNaN(meanOf([]))).toBe(true);
    expect(Number.isNaN(meanOf([Number.NaN, Number.NaN]))).toBe(true);
  });

  it("computes mean as sum of finite values divided by count", () => {
    expect(meanOf([0.1, 0.2, 0.3])).toBe((0.1 + 0.2 + 0.3) / 3);
  });
});

describe("sdOf", () => {
  it("uses the n-1 denominator", () => {
    // mean 5; squared deviations 9+1+1+1+0+0+4+16 = 32; 32/(8-1).
    expect(sdOf([2, 4, 4, 4, 5, 5, 7, 9])).toBe(Math.sqrt(32 / 7));
  });

  it("is NaN below two finite values, because a 0 there would read as no spread", () => {
    expect(Number.isNaN(sdOf([]))).toBe(true);
    expect(Number.isNaN(sdOf([5]))).toBe(true);
    expect(Number.isNaN(sdOf([5, Number.NaN]))).toBe(true);
  });

  it("drops the non-finite values before it counts them", () => {
    expect(sdOf([2, Number.NaN, 4, Number.POSITIVE_INFINITY])).toBe(sdOf([2, 4]));
  });
});

describe("finiteCount", () => {
  it("counts the survivors, so no average can be quoted without its denominator", () => {
    expect(finiteCount([1, Number.NaN, 3, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]))
      .toBe(2);
    expect(finiteCount([])).toBe(0);
    expect(finiteCount([Number.NaN])).toBe(0);
  });

  it("is the pair that makes a fully censored column readable: NaN over 0, not 0 over 8", () => {
    const allCensored = [Number.NaN, Number.NaN, Number.NaN];
    expect(Number.isNaN(meanOf(allCensored))).toBe(true);
    expect(finiteCount(allCensored)).toBe(0);
  });
});
