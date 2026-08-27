import { describe, expect, it } from "vitest";
import { ContractError } from "../../core/errors.js";
import { PROBE_SEEDS, ROOM_COUNTS, probeSeedsFor } from "../familyProbe.js";

/**
 * Turning the precision up must REFINE an answer, not replace it.
 *
 * The whole argument for letting a reader choose the room count is that the interval narrows around
 * a number that stays put. That only holds because the seeds are a prefix of one sequence — if they
 * were drawn afresh per count, "more rooms" and "different rooms" would be the same button, and a
 * reader whose answer moved could not tell which of the two moved it.
 *
 * That property is load-bearing and invisible in the code, which is exactly the kind this repo
 * writes a test for rather than a comment.
 */
describe("more rooms are the same rooms, plus more", () => {
  it("opens at the count the card has always run", () => {
    expect(probeSeedsFor(8)).toEqual([...PROBE_SEEDS]);
  });

  it("makes every smaller count a prefix of every larger one", () => {
    let comparisons = 0;
    for (const smaller of ROOM_COUNTS) {
      for (const larger of ROOM_COUNTS) {
        if (larger <= smaller) {
          continue;
        }
        const few = probeSeedsFor(smaller);
        const many = probeSeedsFor(larger);
        expect(many.slice(0, smaller), `${smaller} rooms are not the first of ${larger}`).toEqual([
          ...few,
        ]);
        comparisons = comparisons + 1;
      }
    }
    expect(comparisons, "no pair of counts was compared").toBeGreaterThan(0);
  });

  it("would notice a count that reshuffled instead of extending", () => {
    // The test that tests the test. If `probeSeedsFor` drew fresh seeds per count, the prefix check
    // above would fail — this pins that a reshuffle IS detectable rather than assuming it.
    const many = [...probeSeedsFor(16)];
    const reshuffled = [...many].reverse();
    expect(reshuffled.slice(0, 8)).not.toEqual([...probeSeedsFor(8)]);
  });

  it("gives every room its own seed at every offered count", () => {
    for (const count of ROOM_COUNTS) {
      const seeds = probeSeedsFor(count);
      expect(seeds).toHaveLength(count);
      expect(new Set(seeds).size, `${count} rooms share a seed`).toBe(count);
    }
  });

  it("refuses a count the table does not offer, rather than running one nobody chose", () => {
    // A denominator that came from somewhere other than the control is a denominator no reader can
    // account for.
    for (const bad of [0, -8, 12, 7.5, Number.NaN]) {
      expect(() => probeSeedsFor(bad), `${bad} was accepted`).toThrow(ContractError);
    }
  });

  it("offers counts that actually differ, so the control is not decoration", () => {
    expect(ROOM_COUNTS.length).toBeGreaterThan(1);
    expect(new Set(ROOM_COUNTS).size).toBe(ROOM_COUNTS.length);
    for (const count of ROOM_COUNTS) {
      expect(Number.isInteger(count) && count > 0).toBe(true);
    }
  });
});
