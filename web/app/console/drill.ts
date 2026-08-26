import { fail } from "../../engine/core/errors.js";
import { CARD_ORDER, type CardKey } from "../../engine/job/cards.js";

/**
 * The drill's pure state: which card is up, whether it has been answered and revealed yet, and
 * every call made so far.
 *
 * No DOM, no storage, no clock. The tally lives in memory and dies on reload (guardrail 10), and
 * the card page says so in its own markup. `web/drill.ts` drives this: it runs the room, works out
 * what the room actually did, and hands that in — nothing in this file runs anything or knows what
 * a card looks like.
 */

/**
 * The reader's call on a withheld card: did the robot's effect on this room clear the run-to-run
 * band ("bigger"), sit under it ("smaller"), or is there not enough on screen to say
 * ("cannot tell")?
 */
export type DrillCall = "bigger" | "smaller" | "cannot tell";

/**
 * The call the room actually supports: what the card would have been answered by somebody who
 * could see both runs.
 *
 * Two values, never three. `"cannot tell"` is a thing a reader can say and not a thing a room can
 * be, which is why it can never be scored right — see `DrillCallRecord` below.
 */
export type HonestCall = "bigger" | "smaller";

/**
 * One scored call against one card.
 *
 * `honest` is handed in by whoever ran the room rather than read off the card's catalogue entry,
 * and that is a correction rather than a preference. The card screen asks exactly one question —
 * did the robot move this crowd by more than two runs of the same room differ by on their own? —
 * and the only thing that answers it is the paired reading measured against the run-to-run band.
 * Both of those exist only once the second run has been run, which is to say at the reveal, which
 * is to say in the page rather than here.
 *
 * `cards.ts`'s `shape` field is now measured against the same band, so it no longer disagrees —
 * but it still must not be used for this, and the reason is worth keeping. `shape` says what a
 * card does to a reader who trusts the corridor number; it does not say what THIS reader called or
 * what the room in front of them did. Deriving a score from it would be scoring a call against a
 * label rather than against a room, which is how it went wrong before: `shape` used to be
 * classified against the split-half detection floor, a different null, and on three of the eight
 * cards that disagreed with the band. Scoring from it printed "your call did not match" underneath
 * two numbers on the same screen that said it did. The measured table is in the header of
 * `web/engine/job/__tests__/cards.slow.test.ts`, which pins every one of these comparisons and
 * fails on a card whose declared shape is not what its room does.
 *
 * `"cannot tell"` can never equal an `HonestCall`, so it is never correct by construction rather
 * than by a special case in a scoring function. It is an honest answer to a card built to be
 * unanswerable from what is shown, so `tally` counts it in its own bucket rather than as a wrong
 * guess.
 */
export interface DrillCallRecord {
  readonly kind: "drillCallRecord";
  readonly cardKey: CardKey;
  readonly call: DrillCall;
  readonly honest: HonestCall;
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
 *
 * `honest` is what the room did, measured. The caller has to have run the second run before it
 * can pass one, which is the point: nothing here can score a call from a label written before the
 * room was run.
 */
export function answer(state: DrillState, call: DrillCall, honest: HonestCall): DrillState {
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
  if (honest !== "bigger" && honest !== "smaller") {
    fail(`the honest call must be either bigger or smaller, got '${String(honest)}'`);
  }
  const record: DrillCallRecord = Object.freeze({
    kind: "drillCallRecord" as const,
    cardKey,
    call,
    honest,
    correct: call === honest,
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
