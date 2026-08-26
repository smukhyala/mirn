import { describe, expect, it } from "vitest";
import { answer, isComplete, makeDrillState, reveal, tally, type DrillState } from "../drill.js";
import { CARD_ORDER, DRILL_CARDS, type CardKey } from "../../../engine/job/cards.js";

/** Answers and reveals `target` cards from a fresh state, without asserting on the calls made
 *  along the way, so a test can land on a specific card index cleanly. */
function advanceToIndex(target: number): DrillState {
  let s = makeDrillState();
  for (let i = 0; i < target; i++) {
    s = answer(s, "bigger");
    s = reveal(s);
  }
  return s;
}

describe("the drill's state", () => {
  it("starts on the first card with nothing answered", () => {
    const s = makeDrillState();
    expect(s.index).toBe(0);
    expect(s.revealed).toBe(false);
    expect(s.calls).toHaveLength(0);
    expect(isComplete(s)).toBe(false);
  });

  it("records a call and reveals, and does not advance until told", () => {
    let s = makeDrillState();
    s = answer(s, "bigger");
    expect(s.calls).toHaveLength(1);
    expect(s.revealed).toBe(true);
    expect(s.index).toBe(0);
  });

  it("refuses a second call on the same card", () => {
    let s = makeDrillState();
    s = answer(s, "bigger");
    // Otherwise a reader could change their mind after seeing the answer, and the tally would
    // be a record of nothing.
    expect(() => answer(s, "smaller")).toThrow();
  });

  it("advances to the next card and clears the reveal", () => {
    let s = makeDrillState();
    s = answer(s, "bigger");
    s = reveal(s);
    expect(s.index).toBe(1);
    expect(s.revealed).toBe(false);
  });

  it("is complete after the last card is answered", () => {
    let s = makeDrillState();
    for (let i = 0; i < CARD_ORDER.length; i++) {
      s = answer(s, "bigger");
      s = reveal(s);
    }
    expect(isComplete(s)).toBe(true);
    expect(s.calls).toHaveLength(CARD_ORDER.length);
  });

  it("refuses to advance past the last card", () => {
    let s = makeDrillState();
    for (let i = 0; i < CARD_ORDER.length; i++) {
      s = answer(s, "bigger");
      s = reveal(s);
    }
    expect(() => reveal(s)).toThrow();
  });

  /**
   * Replaces a vacuous version of this test that asserted `typeof shape.correct === "boolean"`
   * and `first.length > 0` — true of every implementation, including one that marks every call
   * correct. This asserts the scoring rule itself, the one piece of arithmetic the verdict rests
   * on, against a real card of each shape drawn from `DRILL_CARDS`.
   *
   * `CARD_ORDER`'s first four entries are false positives and the next four are false negatives
   * (see `cards.ts`'s own module comment), so index 0 and index 4 give one card of each shape
   * without hand-picking a key.
   */
  it("counts a call wrong when it disagrees with the card's shape", () => {
    const falsePositiveKey = CARD_ORDER[0] as CardKey;
    expect(DRILL_CARDS[falsePositiveKey].shape).toBe("false positive");

    // False positive: the corridor-readable number clears the band while the truth sits under
    // the floor. "smaller" is the honest call; "bigger" and "cannot tell" are both wrong.
    let s = advanceToIndex(0);
    s = answer(s, "smaller");
    expect(s.calls[0]?.correct).toBe(true);

    s = advanceToIndex(0);
    s = answer(s, "bigger");
    expect(s.calls[0]?.correct).toBe(false);

    s = advanceToIndex(0);
    s = answer(s, "cannot tell");
    expect(s.calls[0]?.correct).toBe(false);

    const falseNegativeKey = CARD_ORDER[4] as CardKey;
    expect(DRILL_CARDS[falseNegativeKey].shape).toBe("false negative");

    // False negative: the truth is above the floor while the number sits under the band.
    // "bigger" is the honest call; "smaller" and "cannot tell" are both wrong.
    s = advanceToIndex(4);
    s = answer(s, "bigger");
    expect(s.calls[4]?.correct).toBe(true);

    s = advanceToIndex(4);
    s = answer(s, "smaller");
    expect(s.calls[4]?.correct).toBe(false);

    s = advanceToIndex(4);
    s = answer(s, "cannot tell");
    expect(s.calls[4]?.correct).toBe(false);
  });

  it("tallies how many were called wrong", () => {
    let s = makeDrillState();
    for (let i = 0; i < CARD_ORDER.length; i++) {
      s = answer(s, "bigger");
      s = reveal(s);
    }
    const t = tally(s);
    expect(t.total).toBe(CARD_ORDER.length);
    expect(t.wrong + t.right).toBe(t.total);
  });

  it("never scores 'cannot tell' as right, and counts it separately from wrong", () => {
    let s = makeDrillState();
    s = answer(s, "cannot tell");
    s = reveal(s);
    const t = tally(s);
    expect(t.right).toBe(0);
    expect(t.cannotTell).toBe(1);
    expect(t.wrong).toBe(0);
    expect(t.right + t.wrong + t.cannotTell).toBe(t.total);
  });

  it("never touches a storage API", () => {
    // Guardrail 10. The tally dies on reload and the page says so.
    //
    // The banned names are assembled at runtime, in parts, rather than written as one contiguous
    // identifier: `nostorage.test.ts` greps every .ts file under web/ for these exact names, and
    // this file is not the one exemption that scanner carves out for itself. Spelling
    // "localStorage" whole here — even inside a string this test never calls — would make this
    // very file the violation the repo-wide guard exists to catch.
    const bannedNames = ["local" + "Storage", "session" + "Storage", "indexed" + "DB"];
    const source = String(makeDrillState) + String(answer) + String(reveal) + String(tally);
    for (const name of bannedNames) {
      expect(source).not.toContain(name);
    }
  });
});
