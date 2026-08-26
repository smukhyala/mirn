import { makeRunConfig, type RunConfig } from "../contracts/config.js";

/**
 * The eight cards, closed.
 *
 * Five are worlds where a reader who trusts the number a corridor could give them calls the
 * direction wrong, in both directions. Three are worlds where that number happens to land on the
 * right side, and those three are not a weakness of the set — they are what stops the drill being
 * gameable. If all eight fooled, a reader could score eight out of eight by inverting whatever the
 * corridor number says, and would leave believing it is SYSTEMATICALLY wrong. It is not: measured
 * over sixty seeds it correlates 0.167 with the true effect and 0.605 with its own zero-effect
 * reading. It is uninformative, not inverted, and a set where it is sometimes right is the only
 * honest way to show that.
 *
 * The settings come from the census in docs/superpowers/notes/2026-08-25-drill-card-census.md,
 * which measured them against the real engine, and from an extended sweep run for this task that
 * re-pointed the second four at the console's own default ruler (forecast horizon 3 s, checked at
 * 10 s) rather than the census's minimum-horizon candidate. No card may be added without re-running
 * it: `shape` below is a measurement, not a label, and a card carrying the wrong one looks
 * identical on screen.
 *
 * All eight sit at the SAME ruler setting — the one the console opens on. That is not a
 * coincidence of what was easiest to find; it is the strongest form of the lesson available: at
 * the settings a reader arrives on with no dial touched, this number already misses, in both
 * directions, across three different crowd sizes.
 */

/**
 * What this card does to a reader who trusts the number a corridor could give them.
 *
 * Measured against the RUN-TO-RUN BAND, because that is what the card asks about — "bigger than
 * two runs of this room differ by". An earlier version of this field was classified against the
 * split-half detection floor instead, which is a different null, and three cards were labelled as
 * fooling that do not. The two nulls are not interchangeable and cross as the room fills; see
 * web/engine/measure/null/splitHalf.ts.
 *
 *   "reads high" — the corridor number clears the band while the true effect does not. A reader
 *                  who trusts it says bigger and is wrong.
 *   "reads low"  — the true effect clears the band while the corridor number does not. A reader
 *                  who trusts it says smaller and is wrong.
 *   "agrees"     — both fall the same side. The reader is right for the wrong reason, and these
 *                  are the cards that stop the drill being gameable.
 *
 * `web/engine/job/__tests__/cards.slow.test.ts` runs every card and fails on a mislabelled one, so
 * this field cannot drift from what the rooms do.
 */
export type CardShape = "reads high" | "reads low" | "agrees";

export interface DrillCard {
  readonly kind: "drillCard";
  readonly key: string;
  /** Plain English, shown above the arena. Never a number, never a setting name. */
  readonly name: string;
  readonly shape: CardShape;
  readonly seed: number;
  /** Axis key to value. Every value must sit on that axis's own step grid. */
  readonly settings: Readonly<Record<string, number>>;
  readonly horizonSteps: number;
  readonly windowEndStep: number;
}

// The console's own default ruler: forecast horizon 3 s, checked at 10 s. dt = 0.05 s, so that is
// 60 steps of horizon and 200 steps to the checked instant. Every card below is measured at this
// exact setting, deliberately: see the module comment.
const DEFAULT_HORIZON_STEPS = 60;
const DEFAULT_WINDOW_END_STEP = 200;

function makeCard(
  key: string,
  name: string,
  shape: CardShape,
  seed: number,
  settings: Readonly<Record<string, number>>,
): DrillCard {
  return Object.freeze({
    kind: "drillCard" as const,
    key,
    name,
    shape,
    seed,
    settings: Object.freeze({ ...settings }),
    horizonSteps: DEFAULT_HORIZON_STEPS,
    windowEndStep: DEFAULT_WINDOW_END_STEP,
  });
}

/**
 * A literal object, not a table built from `Object.fromEntries` over a list: `noUncheckedIndexedAccess`
 * turns any `Record<string, DrillCard>` built from an index signature into `DrillCard | undefined`
 * at every read, which is correct for a table a caller could hand an arbitrary string but wrong
 * here — the eight keys are fixed at this file's own literals below, so every consumer that reads
 * `DRILL_CARDS[key]` for a `key` drawn from `CARD_ORDER` gets a `DrillCard` back, never an
 * optional one it has to re-check. An object literal's property names stay a literal type through
 * `Object.freeze`; building the same object by iterating a list would have widened them to
 * `string` and reintroduced exactly the problem this comment is about.
 *
 * The first four were drawn from the census's non-degenerate combinations, where wobble and robot
 * pushiness are both nonzero (ruling 1); the second four were re-pointed at the default ruler
 * (ruling 2) — see the note above `unhurriedFullerRoom` and its neighbours below. Their `shape`
 * values are NOT that split: the census classified against the split-half floor and the card asks
 * about the run-to-run band, and on three of the eight those two nulls disagree. Every value below
 * is re-derived against the band and measured by `cards.slow.test.ts`.
 */
export const DRILL_CARDS = Object.freeze({
  fastModestRoom: makeCard(
    "fastModestRoom",
    "A modest room walking briskly, a moderately pushy robot",
    "agrees",
    20260816,
    { crowdSize: 24, walkingPace: 1.8, crowdFidget: 1.1, pushStrength: 2 },
  ),
  fastPackedInsistentRobot: makeCard(
    "fastPackedInsistentRobot",
    "A packed, jittery room walking briskly, an insistent robot",
    "reads high",
    20260816,
    { crowdSize: 44, walkingPace: 1.8, crowdFidget: 3, pushStrength: 3 },
  ),
  fastPackedGentleRobot: makeCard(
    "fastPackedGentleRobot",
    "The same packed, jittery room, but a barely pushy robot",
    "reads high",
    424242,
    { crowdSize: 44, walkingPace: 1.8, crowdFidget: 3, pushStrength: 1 },
  ),
  fastFullerRoom: makeCard(
    "fastFullerRoom",
    "A fuller room walking briskly, a moderately pushy robot",
    "reads high",
    20260816,
    { crowdSize: 34, walkingPace: 1.8, crowdFidget: 1.1, pushStrength: 2 },
  ),
  // Every card below holds at the console's own default ruler — none of them needs an extreme
  // slider position. The census's own shortest-horizon candidate (this same crowd/robot setting as
  // `amblingFullerRoom`, minimum forecast horizon) turned out to sit on the same side at the
  // default ruler too, so it appears here at the default instead of the extreme it was originally
  // found at (ruling 2 of this task). Two of these four read low and two agree: against the band,
  // this is not a block of four cards that all fool.
  unhurriedModestRoom: makeCard(
    "unhurriedModestRoom",
    "A modest, jittery room in no hurry, an insistent robot",
    "reads low",
    20260816,
    { crowdSize: 24, walkingPace: 0.9, crowdFidget: 3, pushStrength: 3 },
  ),
  amblingFullerRoom: makeCard(
    "amblingFullerRoom",
    "A fuller room ambling along, an insistent robot",
    "reads low",
    20260816,
    { crowdSize: 34, walkingPace: 0.4, crowdFidget: 1.1, pushStrength: 3 },
  ),
  amblingPackedRoom: makeCard(
    "amblingPackedRoom",
    "A packed, jittery room ambling along, an insistent robot",
    "agrees",
    20260816,
    { crowdSize: 44, walkingPace: 0.4, crowdFidget: 3, pushStrength: 3 },
  ),
  unhurriedFullerRoom: makeCard(
    "unhurriedFullerRoom",
    "A fuller, jittery room in no hurry, an insistent robot",
    "agrees",
    20260816,
    { crowdSize: 34, walkingPace: 0.9, crowdFidget: 3, pushStrength: 3 },
  ),
});

export type CardKey = keyof typeof DRILL_CARDS;

export const CARD_ORDER: readonly CardKey[] = Object.freeze([
  "fastModestRoom",
  "fastPackedInsistentRobot",
  "fastPackedGentleRobot",
  "fastFullerRoom",
  "unhurriedModestRoom",
  "amblingFullerRoom",
  "amblingPackedRoom",
  "unhurriedFullerRoom",
]);

export function cardConfig(card: DrillCard): RunConfig {
  const s = card.settings;
  return makeRunConfig({
    seed: card.seed,
    crowd: {
      nPedestrians: s["crowdSize"] ?? 18,
      desiredSpeed: s["walkingPace"] ?? 1.34,
      noiseAmplitude: s["crowdFidget"] ?? 1.1,
    },
    robot: { repulsionScale: s["pushStrength"] ?? 1 },
  });
}

export function cardRulerParams(card: DrillCard): {
  readonly horizonSteps: number;
  readonly windowEndStep: number;
} {
  return { horizonSteps: card.horizonSteps, windowEndStep: card.windowEndStep };
}
