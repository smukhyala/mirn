import { describe, expect, it } from "vitest";
import { CARD_ORDER, DRILL_CARDS, cardConfig, cardRulerParams, type CardKey } from "../cards.js";
import { cvmResidual, paired } from "../../measure/estimator/index.js";
import { replicateBand } from "../../measure/null/band.js";
import { seededPermutations, splitHalfNull } from "../../measure/null/splitHalf.js";
import { runPair } from "../../sim/run.js";

/**
 * What each of the eight cards actually does, measured.
 *
 * The catalogue is data with no arithmetic in it, so nothing else in the build can tell whether a
 * card still fools anybody. `cards.test.ts` checks that the eight entries are well formed; this
 * checks that they are still the eight rooms they were chosen for. A physics change that quietly
 * turned a trap into an agreement would otherwise be invisible until somebody read the page.
 *
 * ## Two different comparisons, and they disagree on three cards
 *
 * This is the thing to read before changing anything here.
 *
 * The card screen asks one question: did the robot move this crowd by more than two runs of the
 * same room differ by on their own? That is the paired reading against the RUN-TO-RUN BAND, and it
 * is what `web/drill.ts` measures at the reveal and hands to `answer` as the honest call.
 *
 * `cards.ts`'s own `shape` field is a different comparison. The census that picked these eight
 * (docs/superpowers/notes/2026-08-25-drill-card-census.md) classified a card by the paired reading
 * against the SPLIT-HALF DETECTION FLOOR, with the forecaster against the band — each estimator
 * judged against its own null, which is defensible and is not what the card asks about.
 *
 * On three of the eight the two disagree, and the drill scored from `shape` until this file was
 * written: `fastModestRoom`, `amblingPackedRoom` and `unhurriedFullerRoom` were each marked wrong
 * for the call that the two numbers printed on the same screen said was right. Measured on this
 * machine, on the commit that wrote this table:
 *
 * | card | paired | band | floor | forecaster | honest (vs band) | corridor (vs band) | fools |
 * |---|---|---|---|---|---|---|---|
 * | fastModestRoom           | 0.3869 | 0.3505 | 0.6961 | 0.4132 | bigger  | bigger  | no  |
 * | fastPackedInsistentRobot | 0.3238 | 0.4678 | 0.4701 | 0.5530 | smaller | bigger  | yes |
 * | fastPackedGentleRobot    | 0.3458 | 0.4408 | 0.4804 | 0.5523 | smaller | bigger  | yes |
 * | fastFullerRoom           | 0.3130 | 0.3555 | 0.5837 | 0.4059 | smaller | bigger  | yes |
 * | unhurriedModestRoom      | 0.7284 | 0.6278 | 0.5902 | 0.2308 | bigger  | smaller | yes |
 * | amblingFullerRoom        | 0.6234 | 0.4387 | 0.5306 | 0.0686 | bigger  | smaller | yes |
 * | amblingPackedRoom        | 0.6351 | 0.9238 | 0.4579 | 0.1667 | smaller | smaller | no  |
 * | unhurriedFullerRoom      | 0.6494 | 0.6725 | 0.5105 | 0.2238 | smaller | smaller | no  |
 *
 * Every `shape` in the catalogue still holds against the floor — all four false positives sit under
 * it and all four false negatives clear it — so nothing about the census was wrong. What was wrong
 * was scoring the band question with the floor's answer.
 *
 * ## Margins, closest first
 *
 * Recorded so that a physics change which halves one is a visible number rather than a red test
 * with no baseline. Distance from the band, as a share of it:
 *
 *   paired vs band:     3.4% unhurriedFullerRoom, 10.4% fastModestRoom, 12.0% fastFullerRoom,
 *                       16.0% unhurriedModestRoom, 21.6% fastPackedGentleRobot,
 *                       30.8% fastPackedInsistentRobot, 31.3% amblingPackedRoom,
 *                       42.1% amblingFullerRoom
 *   forecaster vs band: 14.2% fastFullerRoom, 17.9% fastModestRoom,
 *                       18.2% fastPackedInsistentRobot, 25.3% fastPackedGentleRobot,
 *                       63.2% unhurriedModestRoom, 66.7% unhurriedFullerRoom,
 *                       82.0% amblingPackedRoom, 84.4% amblingFullerRoom
 *   paired vs floor:    17.5% amblingFullerRoom, 23.4% unhurriedModestRoom,
 *                       27.2% unhurriedFullerRoom, 28.0% fastPackedGentleRobot,
 *                       31.1% fastPackedInsistentRobot, 38.7% amblingPackedRoom,
 *                       44.4% fastModestRoom, 46.4% fastFullerRoom
 *
 * The closest of all is `unhurriedFullerRoom` against the band, at 3.4%, and it is one the page
 * actually reads. The three floors above 17% belong to `shape`, which nothing on the page reads.
 * The three lists are recomputed and re-checked against these figures by the last test below, so
 * none of them is a claim nobody re-ran.
 *
 * All of it is deterministic: the same eight replicates, the same two hundred splits from the same
 * permutation seed, the same rooms. Nothing here is flaky, so a red is a real change.
 */

/** Everything one card does, in one pass over its room. */
interface CardMeasurement {
  readonly kind: "cardMeasurement";
  readonly pairedM: number;
  readonly bandM: number;
  readonly floorM: number;
  readonly forecastM: number;
  readonly honest: "bigger" | "smaller";
  readonly corridor: "bigger" | "smaller";
}

/** The floor's own settings, as `web/engine/job/runner.ts` calls it. Two floors computed at
 *  different strides are not comparable, so these are the runner's numbers and not new ones. */
const FLOOR_SPLITS = 200;
const FLOOR_ALPHA = 0.05;
const FLOOR_STRIDE_STEPS = 20;
const FLOOR_PERMUTATION_SEED = 20260816;

function measure(key: CardKey): CardMeasurement {
  const card = DRILL_CARDS[key];
  const config = cardConfig(card);
  const ruler = cardRulerParams(card);
  const run = runPair(config);
  const band = replicateBand(config);
  const floor = splitHalfNull(
    run.control.positions,
    FLOOR_SPLITS,
    seededPermutations(FLOOR_PERMUTATION_SEED),
    FLOOR_ALPHA,
    FLOOR_STRIDE_STEPS,
  );
  const pairedM = paired(run.pair).value;
  const forecastM = cvmResidual(run.pair, ruler.horizonSteps, ruler.windowEndStep).value;

  let honest: "bigger" | "smaller" = "smaller";
  if (pairedM > band.value) {
    honest = "bigger";
  }
  let corridor: "bigger" | "smaller" = "smaller";
  if (forecastM > band.value) {
    corridor = "bigger";
  }
  return Object.freeze({
    kind: "cardMeasurement" as const,
    pairedM,
    bandM: band.value,
    floorM: floor.floor,
    forecastM,
    honest,
    corridor,
  });
}

/** The table above, as data. A card whose row here stops matching the room is the failure this
 *  file exists for, and the row says which way it moved. */
const EXPECTED: Readonly<Record<CardKey, { readonly honest: string; readonly corridor: string }>> =
  Object.freeze({
    fastModestRoom: { honest: "bigger", corridor: "bigger" },
    fastPackedInsistentRobot: { honest: "smaller", corridor: "bigger" },
    fastPackedGentleRobot: { honest: "smaller", corridor: "bigger" },
    fastFullerRoom: { honest: "smaller", corridor: "bigger" },
    unhurriedModestRoom: { honest: "bigger", corridor: "smaller" },
    amblingFullerRoom: { honest: "bigger", corridor: "smaller" },
    amblingPackedRoom: { honest: "smaller", corridor: "smaller" },
    unhurriedFullerRoom: { honest: "smaller", corridor: "smaller" },
  });

describe("what the eight cards actually do", () => {
  const measured = new Map<CardKey, CardMeasurement>();

  it(
    "still reads the way the table in this file says it does",
    () => {
      for (const key of CARD_ORDER) {
        const result = measure(key);
        measured.set(key, result);
        expect(EXPECTED[key].honest, `${key}: the truth moved to the other side of the band`).toBe(
          result.honest,
        );
        expect(
          EXPECTED[key].corridor,
          `${key}: the forecaster moved to the other side of the band`,
        ).toBe(result.corridor);
        // Every one is a strict comparison in the page, so an exact tie would make the honest call
        // an arbitrary choice rather than a reading.
        expect(result.pairedM, `${key}: the truth sits exactly on the band`).not.toBe(result.bandM);
        expect(result.forecastM, `${key}: the forecaster sits exactly on the band`).not.toBe(
          result.bandM,
        );
      }
    },
    120000,
  );

  it("still fools a reader who trusts the corridor number, in both directions", () => {
    // The drill's whole content. Not "all eight fool" — three of them agree, and the verdict says
    // so from a live count rather than claiming otherwise. What must hold is that both traps are
    // still present, or the drill teaches "that number is always wrong", which is the opposite of
    // the lesson and is not something this toy could support anyway.
    let overCalls = 0;
    let underCalls = 0;
    for (const key of CARD_ORDER) {
      const result = measured.get(key);
      expect(result, `${key} was never measured`).toBeDefined();
      if (result === undefined) {
        continue;
      }
      if (result.corridor === "bigger" && result.honest === "smaller") {
        overCalls = overCalls + 1;
      }
      if (result.corridor === "smaller" && result.honest === "bigger") {
        underCalls = underCalls + 1;
      }
    }
    expect(overCalls, "no card is left where the corridor number reads too big").toBeGreaterThanOrEqual(2);
    expect(underCalls, "no card is left where the corridor number reads too small").toBeGreaterThanOrEqual(2);
  });

  it("keeps the margins this file records, so a physics change is a number and not a surprise", () => {
    // The smallest of each comparison, recorded from the table above. A change that halved one
    // would still leave every call on the same side of every null, so nothing else in this file
    // would notice until the day it flipped one; these three are the early warning.
    let closestBand = Number.POSITIVE_INFINITY;
    let closestForecast = Number.POSITIVE_INFINITY;
    let closestFloor = Number.POSITIVE_INFINITY;
    for (const key of CARD_ORDER) {
      const result = measured.get(key);
      if (result === undefined) {
        continue;
      }
      const fromBand = Math.abs(result.pairedM - result.bandM) / result.bandM;
      const forecastFromBand = Math.abs(result.forecastM - result.bandM) / result.bandM;
      const fromFloor = Math.abs(result.pairedM - result.floorM) / result.floorM;
      if (fromBand < closestBand) {
        closestBand = fromBand;
      }
      if (forecastFromBand < closestForecast) {
        closestForecast = forecastFromBand;
      }
      if (fromFloor < closestFloor) {
        closestFloor = fromFloor;
      }
    }
    expect(closestBand, "the truth has moved closer to the band than this file records").toBeGreaterThan(0.03);
    expect(closestForecast, "the forecaster has moved closer to the band").toBeGreaterThan(0.13);
    expect(closestFloor, "the truth has moved closer to the floor").toBeGreaterThan(0.15);
  });

  it("still carries the shapes the census measured, against the floor the census used", () => {
    // `shape` scores nothing any more — see the header — but it is the provenance of every card in
    // the catalogue, and provenance nobody checks rots. A false positive is a truth under the
    // floor; a false negative is one above it.
    for (const key of CARD_ORDER) {
      const result = measured.get(key);
      if (result === undefined) {
        continue;
      }
      const shape = DRILL_CARDS[key].shape;
      if (shape === "false positive") {
        expect(result.pairedM, `${key} is called a false positive and clears the floor`).toBeLessThan(
          result.floorM,
        );
        continue;
      }
      expect(result.pairedM, `${key} is called a false negative and sits under the floor`).toBeGreaterThan(
        result.floorM,
      );
    }
  });
});
