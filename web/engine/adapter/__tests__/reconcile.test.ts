import { describe, expect, it } from "vitest";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";
import { INITIAL_TOLERANCE_M, reconcileInitial, requireSameLength } from "../reconcile.js";

function path(values: number[]): Float64Array {
  return new Float64Array(values);
}

describe("making two arms start in exactly the same place", () => {
  it("leaves arms that already agree exactly alone, and says they agreed exactly", () => {
    const treated = path([1, 2, 3, 4]);
    const control = path([1, 2, 9, 9]);
    const result = reconcileInitial([treated], [control]);
    expect(result.maxDisagreementM).toBe(0);
    expect(result.snapped).toBe(false);
    expect(control[0]).toBe(1);
  });

  it("snaps a disagreement inside the tolerance onto the treated arm", () => {
    const treated = path([1, 2, 3, 4]);
    const control = path([1 + 1e-12, 2, 9, 9]);
    const result = reconcileInitial([treated], [control]);
    expect(result.snapped).toBe(true);
    expect(result.maxDisagreementM).toBeGreaterThan(0);
    // The point of snapping: the contract's bitwise check now passes honestly.
    expect(control[0]).toBe(treated[0]);
    expect(control[1]).toBe(treated[1]);
  });

  it("refuses a disagreement outside the tolerance rather than papering over it", () => {
    const treated = path([1, 2, 3, 4]);
    const control = path([1.5, 2, 9, 9]);
    expect(() => reconcileInitial([treated], [control])).toThrow(/started in different places/i);
  });

  it("has a tolerance matching the one the oracle allows third parties", () => {
    expect(INITIAL_TOLERANCE_M).toBe(1e-9);
  });

  it("passes and snaps a disagreement of exactly the tolerance, matching the Python oracle's '>'", () => {
    // sqrt((1e-9)^2 + 0^2) round-trips to exactly 1e-9 in IEEE double arithmetic (verified), so
    // this pins the boundary bit-exactly rather than by an approximation that could hide the '>'
    // silently becoming '>=' or vice versa.
    const treated = path([INITIAL_TOLERANCE_M, 0, 3, 4]);
    const control = path([0, 0, 9, 9]);
    const result = reconcileInitial([treated], [control]);
    expect(result.maxDisagreementM).toBe(INITIAL_TOLERANCE_M);
    expect(result.snapped).toBe(true);
    expect(control[0]).toBe(treated[0]);
  });

  it("refuses a disagreement comfortably above the tolerance", () => {
    const treated = path([10 * INITIAL_TOLERANCE_M, 0, 3, 4]);
    const control = path([0, 0, 9, 9]);
    expect(() => reconcileInitial([treated], [control])).toThrow(/started in different places/i);
  });

  it("refuses a zero-length path rather than reporting it as agreement", () => {
    const treated = path([]);
    const control = path([1, 2, 9, 9]);
    expect(() => reconcileInitial([treated], [control])).toThrow(/no first sample/i);
  });

  it("refuses a control path with no first sample even when the treated path is fine", () => {
    const treated = path([1, 2, 3, 4]);
    const control = path([]);
    expect(() => reconcileInitial([treated], [control])).toThrow(/no first sample/i);
  });

  it("refuses a non-finite coordinate rather than letting it compare as NaN and pass", () => {
    const treated = path([Number.NaN, 2, 3, 4]);
    const control = path([1, 2, 9, 9]);
    expect(() => reconcileInitial([treated], [control])).toThrow(/finite/i);
  });

  it("refuses an infinite coordinate the same way", () => {
    const treated = path([1, 2, 3, 4]);
    const control = path([Number.POSITIVE_INFINITY, 2, 9, 9]);
    expect(() => reconcileInitial([treated], [control])).toThrow(/finite/i);
  });

  it("mutates the caller's control buffer in place rather than returning a new one", () => {
    const treated = path([1, 2, 3, 4]);
    const control = path([1 + 1e-12, 2, 9, 9]);
    const controlBeforeCall = control;
    reconcileInitial([treated], [control]);
    // Same identity, not a copy: the surprise this needs to be documented against is exactly that
    // the object the caller already holds a reference to changed underneath them.
    expect(control).toBe(controlBeforeCall);
    expect(control[0]).toBe(1);
    expect(control[1]).toBe(2);
  });

  it("leaves every buffer untouched when the whole set already agrees exactly", () => {
    const treatedA = path([1, 2, 3, 4]);
    const controlA = path([1, 2, 9, 9]);
    const treatedB = path([5, 6, 7, 8]);
    const controlB = path([5, 6, 1, 1]);
    reconcileInitial([treatedA, treatedB], [controlA, controlB]);
    expect(controlA[0]).toBe(1);
    expect(controlA[1]).toBe(2);
    expect(controlB[0]).toBe(5);
    expect(controlB[1]).toBe(6);
  });

  it("snaps every disagreeing person in a multi-person set, not just the first", () => {
    const treatedA = path([1, 2, 3, 4]);
    const controlA = path([1, 2, 9, 9]);
    const treatedB = path([5, 6, 7, 8]);
    const controlB = path([5 + 1e-12, 6, 1, 1]);
    const result = reconcileInitial([treatedA, treatedB], [controlA, controlB]);
    expect(result.snapped).toBe(true);
    expect(controlA[0]).toBe(1);
    expect(controlB[0]).toBe(treatedB[0]);
    expect(controlB[1]).toBe(treatedB[1]);
  });
});

describe("two arms of different lengths", () => {
  it("is refused, naming both lengths", () => {
    expect(() => requireSameLength(4, 5)).toThrow(/4[\s\S]*5|5[\s\S]*4/);
  });

  it("passes when they agree", () => {
    expect(() => requireSameLength(4, 4)).not.toThrow();
  });
});

describe("no error message names a bare code identifier", () => {
  // Guardrail 12, same reasoning as identity.test.ts: this is read by somebody holding a file
  // another team produced, and it must never be handed a wire-level name like `maxDisagreementM`.

  function messageOf(run: () => unknown): string {
    try {
      run();
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      }
      throw error;
    }
    throw new Error("expected the call to throw, and it did not");
  }

  const cases: readonly { readonly name: string; readonly run: () => unknown }[] = [
    {
      name: "unequal numbers of people between the two runs",
      run: () => reconcileInitial([path([1, 2])], []),
    },
    {
      name: "a disagreement outside the tolerance",
      run: () => reconcileInitial([path([1, 2, 3, 4])], [path([1.5, 2, 9, 9])]),
    },
    {
      name: "two runs of unequal sample length",
      run: () => requireSameLength(4, 5),
    },
    {
      name: "a zero-length path with no first sample",
      run: () => reconcileInitial([path([])], [path([1, 2])]),
    },
    {
      name: "a non-finite coordinate",
      run: () => reconcileInitial([path([Number.NaN, 2])], [path([1, 2])]),
    },
  ];

  for (const testCase of cases) {
    it(`for: ${testCase.name}`, () => {
      const message = messageOf(testCase.run);
      expect(CODE_IDENTIFIER.test(message)).toBe(false);
    });
  }
});
