import { describe, expect, it } from "vitest";
import { makeReading, type Reading } from "../columns.js";
import { aggregate } from "../stats.js";

const measuredReading = (value: number): Reading => makeReading(value, { kind: "measured" });
const censoredReading = (why: string): Reading =>
  makeReading(Number.NaN, { kind: "censored", why });
const notApplicableReading = (why: string): Reading =>
  makeReading(Number.NaN, { kind: "notApplicable", why });

/**
 * A mean never exists without its count.
 *
 * Recovery time was once averaged over as few as two of eight runs and presented as a property of
 * the eight, with nothing anywhere saying so. Dropping a censored value is right; dropping it
 * silently is not, so `nUsed` and `nAttempted` are separate fields and the reason is carried, not
 * inferred from whether the value happens to be NaN.
 */
describe("aggregate", () => {
  it("averages the survivors and reports both counts", () => {
    const result = aggregate([measuredReading(1), measuredReading(2), measuredReading(3)]);
    expect(result.value).toBe(2);
    expect(result.nUsed).toBe(3);
    expect(result.nAttempted).toBe(3);
    expect(result.reason.kind).toBe("measured");
    expect(result.sd).toBe(1);
  });

  it("leaves the spread NaN below two survivors, never zero", () => {
    // A zero there would read as "no spread", which is a claim, and one run makes no claim.
    const result = aggregate([measuredReading(4), censoredReading("ran out of episode")]);
    expect(result.value).toBe(4);
    expect(result.nUsed).toBe(1);
    expect(result.nAttempted).toBe(2);
    expect(Number.isNaN(result.sd)).toBe(true);
    expect(result.reason.kind).toBe("partiallyCensored");
    if (result.reason.kind === "partiallyCensored") {
      expect(result.reason.why).toMatch(/1 of 2/);
      expect(result.reason.why).toMatch(/ran out of episode/);
    }
  });

  it("reports the reason, not a number, when nothing survived", () => {
    const result = aggregate([
      censoredReading("the robot never arrived"),
      censoredReading("the robot never arrived"),
    ]);
    expect(Number.isNaN(result.value)).toBe(true);
    expect(Number.isNaN(result.sd)).toBe(true);
    expect(result.nUsed).toBe(0);
    expect(result.nAttempted).toBe(2);
    expect(result.reason.kind).toBe("allCensored");
    if (result.reason.kind === "allCensored") {
      expect(result.reason.why).toMatch(/the robot never arrived/);
    }
  });

  it("keeps not-applicable distinct from censored", () => {
    // Censored means the measurement was attempted and ran out. Not applicable means the quantity
    // does not exist under this design. Averaging them together would erase the difference.
    const result = aggregate([
      notApplicableReading("the comparison run has no robot in it at all"),
      notApplicableReading("the comparison run has no robot in it at all"),
    ]);
    expect(result.reason.kind).toBe("notApplicable");
    expect(result.nUsed).toBe(0);
  });

  it("calls a mix of censored and not-applicable censored, because something was attempted", () => {
    const result = aggregate([
      notApplicableReading("no robot"),
      censoredReading("never arrived"),
    ]);
    expect(result.reason.kind).toBe("allCensored");
  });

  it("refuses an empty cell", () => {
    expect(() => aggregate([])).toThrow(/aggregate needs at least one reading/);
  });
});
