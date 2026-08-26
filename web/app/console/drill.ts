import { fail } from "../../engine/core/errors.js";
import { CARD_ORDER, DRILL_CARDS, type CardKey } from "../../engine/job/cards.js";

/**
 * The drill's pure state: which card is up, whether it has been answered and revealed yet, and
 * every call made so far.
 *
 * No DOM, no storage, no clock. The tally lives in memory and dies on reload (guardrail 10) — a
 * later task wires this against the panel and a countdown-free `<details>` reveal, but nothing
 * here knows either exists.
 */

/**
 * The reader's call on a withheld card: did the robot's effect on this room clear the run-to-run
 * band ("bigger"), sit under it ("smaller"), or is there not enough on screen to say
 * ("cannot tell")?
 */
export type DrillCall = "bigger" | "smaller" | "cannot tell";

/**
 * One scored call against one card.
 *
 * `correct` is decided against the card's own fixed `shape` (see `cards.ts`'s module comment for
 * why the eight cards are safe to score this way — every one was measured in advance so its
 * confounded direction is known, not computed live). On a **false positive** card the
 * corridor-readable number clears the band while the true effect sits under the floor, so
 * "smaller" is the honest call and "bigger" is wrong. On a **false negative** card the truth is
 * above the floor while the number sits under the band, so "bigger" is honest and "smaller" is
 * wrong. `"cannot tell"` is never marked correct: it is an honest answer to a card built to be
 * unanswerable from what is shown, so the verdict counts it in its own bucket (`tally`'s
 * `cannotTell`) rather than scoring it either way.
 */
export interface DrillCallRecord {
  readonly kind: "drillCallRecord";
  readonly cardKey: CardKey;
  readonly call: DrillCall;
  readonly correct: boolean;
}

export interface DrillState {
  readonly kind: "drillState";
  readonly index: number;
  readonly revealed: boolean;
  readonly calls: readonly DrillCallRecord[];
}

export interface DrillTally {
  readonly kind: "drillTally";
  readonly total: number;
  readonly right: number;
  readonly wrong: number;
  readonly cannotTell: number;
}

function scoreCall(cardKey: CardKey, call: DrillCall): boolean {
  if (call === "cannot tell") {
    return false;
  }
  const shape = DRILL_CARDS[cardKey].shape;
  if (shape === "false positive") {
    return call === "smaller";
  }
  return call === "bigger";
}

export function makeDrillState(): DrillState {
  return Object.freeze({
    kind: "drillState" as const,
    index: 0,
    revealed: false,
    calls: Object.freeze([]),
  });
}

export function isComplete(state: DrillState): boolean {
  return state.index >= CARD_ORDER.length;
}

/**
 * Records one call against the current card and reveals it. Throws rather than accepting a second
 * call on the same card — otherwise a reader could change their mind after seeing the answer, and
 * the tally would be a record of nothing — and throws once the drill is already complete, since
 * there is no current card left to call.
 */
export function answer(state: DrillState, call: DrillCall): DrillState {
  if (isComplete(state)) {
    fail("the drill is already complete; there is no current card left to answer");
  }
  if (state.revealed) {
    fail(
      "this card has already been answered and revealed; the drill does not take a second call " +
        "on the same card",
    );
  }
  const cardKey = CARD_ORDER[state.index];
  if (cardKey === undefined) {
    fail(`the drill has no card at index ${String(state.index)}`);
    return state;
  }
  const record: DrillCallRecord = Object.freeze({
    kind: "drillCallRecord" as const,
    cardKey,
    call,
    correct: scoreCall(cardKey, call),
  });
  return Object.freeze({
    kind: "drillState" as const,
    index: state.index,
    revealed: true,
    calls: Object.freeze([...state.calls, record]),
  });
}

/**
 * Moves to the next card and clears the reveal. Throws if the current card has not been answered
 * yet (nothing to reveal) — this is also what stops the drill from advancing past the last card,
 * since the last `reveal` already moved `index` to `CARD_ORDER.length` and reset `revealed` to
 * `false`, so a second call here has nothing revealed to advance from.
 */
export function reveal(state: DrillState): DrillState {
  if (!state.revealed) {
    fail("this card has not been answered yet; there is nothing to reveal");
  }
  return Object.freeze({
    kind: "drillState" as const,
    index: state.index + 1,
    revealed: false,
    calls: state.calls,
  });
}

/** How many calls were right, wrong, or an honest "cannot tell" — never all three summed against
 *  a call marked correct, since "cannot tell" is excluded from `right` by construction. */
export function tally(state: DrillState): DrillTally {
  let right = 0;
  let wrong = 0;
  let cannotTell = 0;
  for (const record of state.calls) {
    if (record.call === "cannot tell") {
      cannotTell = cannotTell + 1;
    } else if (record.correct) {
      right = right + 1;
    } else {
      wrong = wrong + 1;
    }
  }
  return Object.freeze({
    kind: "drillTally" as const,
    total: state.calls.length,
    right,
    wrong,
    cannotTell,
  });
}
