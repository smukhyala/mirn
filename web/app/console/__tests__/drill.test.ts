import { describe, expect, it } from "vitest";
import { answer, isComplete, makeDrillState, reveal, tally, type DrillState } from "../drill.js";
import { CARD_ORDER } from "../../../engine/job/cards.js";

/** Answers and reveals `target` cards from a fresh state, without asserting on the calls made
 *  along the way, so a test can land on a specific card index cleanly. */
function advanceToIndex(target: number): DrillState {
  let s = makeDrillState();
  for (let i = 0; i < target; i++) {
    s = answer(s, "bigger", "bigger");
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
    s = answer(s, "bigger", "bigger");
    expect(s.calls).toHaveLength(1);
    expect(s.revealed).toBe(true);
    expect(s.index).toBe(0);
  });

  it("refuses a second call on the same card", () => {
    let s = makeDrillState();
    s = answer(s, "bigger", "bigger");
    // Otherwise a reader could change their mind after seeing the answer, and the tally would
    // be a record of nothing.
    expect(() => answer(s, "smaller", "smaller")).toThrow();
  });

  it("advances to the next card and clears the reveal", () => {
    let s = makeDrillState();
    s = answer(s, "bigger", "bigger");
    s = reveal(s);
    expect(s.index).toBe(1);
    expect(s.revealed).toBe(false);
  });

  it("is complete after the last card is answered", () => {
    let s = makeDrillState();
    for (let i = 0; i < CARD_ORDER.length; i++) {
      s = answer(s, "bigger", "bigger");
      s = reveal(s);
    }
    expect(isComplete(s)).toBe(true);
    expect(s.calls).toHaveLength(CARD_ORDER.length);
  });

  it("refuses to advance past the last card", () => {
    let s = makeDrillState();
    for (let i = 0; i < CARD_ORDER.length; i++) {
      s = answer(s, "bigger", "bigger");
      s = reveal(s);
    }
    expect(() => reveal(s)).toThrow();
  });

  /**
   * Replaces a vacuous version of this test that asserted `typeof shape.correct === "boolean"`
   * and `first.length > 0` — true of every implementation, including one that marks every call
   * correct. This asserts the scoring rule itself, the one piece of arithmetic the verdict rests
   * on.
   *
   * It no longer draws its expectation from `cards.ts`'s `shape` field, and that is a correction.
   * `shape` was classified against the split-half detection floor; the card screen asks about the
   * run-to-run band, and on three of the eight cards the two nulls disagree. `shape` has since been
   * re-derived against the band, but scoring still does not read it: it says what a card does to a
   * reader who trusts the corridor number, not what a given room did. So the honest call comes in
   * from the caller, which has run the room, and this test hands in both values explicitly rather
   * than looking one up.
   */
  it("counts a call wrong when it disagrees with what the room did", () => {
    // The room came out under the band: "smaller" is the honest call, and both other answers miss.
    let s = advanceToIndex(0);
    s = answer(s, "smaller", "smaller");
    expect(s.calls[0]?.correct).toBe(true);

    s = advanceToIndex(0);
    s = answer(s, "bigger", "smaller");
    expect(s.calls[0]?.correct).toBe(false);

    s = advanceToIndex(0);
    s = answer(s, "cannot tell", "smaller");
    expect(s.calls[0]?.correct).toBe(false);

    // And the other way round, on a later card, so nothing here depends on which card is which.
    s = advanceToIndex(4);
    s = answer(s, "bigger", "bigger");
    expect(s.calls[4]?.correct).toBe(true);

    s = advanceToIndex(4);
    s = answer(s, "smaller", "bigger");
    expect(s.calls[4]?.correct).toBe(false);

    s = advanceToIndex(4);
    s = answer(s, "cannot tell", "bigger");
    expect(s.calls[4]?.correct).toBe(false);
  });

  it("keeps what the room did beside the call, so a verdict cannot invent it later", () => {
    let s = makeDrillState();
    s = answer(s, "bigger", "smaller");
    expect(s.calls[0]?.honest).toBe("smaller");
    expect(s.calls[0]?.call).toBe("bigger");
  });

  it("refuses an honest call that is not one of the two things a room can be", () => {
    // "cannot tell" is a thing a reader can say and not a thing a room can be. Accepting it here
    // would make a card unanswerable-by-construction and score a reader's honest decline as right.
    const s = makeDrillState();
    expect(() => answer(s, "bigger", "cannot tell" as unknown as "bigger")).toThrow();
  });

  it("tallies how many were called wrong", () => {
    let s = makeDrillState();
    for (let i = 0; i < CARD_ORDER.length; i++) {
      s = answer(s, "bigger", "bigger");
      s = reveal(s);
    }
    const t = tally(s);
    expect(t.total).toBe(CARD_ORDER.length);
    expect(t.wrong + t.right).toBe(t.total);
  });

  it("never scores 'cannot tell' as right, and counts it separately from wrong", () => {
    let s = makeDrillState();
    s = answer(s, "cannot tell", "bigger");
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
