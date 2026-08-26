import { makeRunConfig, type RunConfig } from "../contracts/config.js";

/**
 * The eight cards, closed.
 *
 * Each is a world where a reader who trusts the number a corridor could give them calls the
 * direction wrong. Both shapes are present, because a drill where the confounded number is always
 * too big teaches "that number is too big" rather than "that number is not telling you".
 *
 * The settings come from the census in docs/superpowers/notes/2026-08-25-drill-card-census.md,
 * which measured them against the real engine, and from an extended sweep run for this task that
 * re-pointed the false-negative side at the console's own default ruler (forecast horizon 3 s,
 * checked at 10 s) rather than the census's minimum-horizon candidate. No card may be added
 * without re-running it: a card whose confounded number happens to agree with the truth looks
 * identical on screen and teaches the opposite of the lesson.
 *
 * All eight sit at the SAME ruler setting — the one the console opens on. That is not a
 * coincidence of what was easiest to find; it is the strongest form of the lesson available: at
 * the settings a reader arrives on with no dial touched, this number is already wrong, in both
 * directions, across three different crowd sizes.
 */
export type CardShape = "false positive" | "false negative";

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
 * The first four are the false positives (ruling 1: drawn only from the census's non-degenerate
 * combinations, where wobble and robot pushiness are both nonzero). The second four are the false
 * negatives, re-pointed at the default ruler per ruling 2 — see the note above `unhurriedFullerRoom`
 * and its neighbours below.
 */
export const DRILL_CARDS = Object.freeze({
  fastModestRoom: makeCard(
    "fastModestRoom",
    "A modest room walking briskly, a moderately pushy robot",
    "false positive",
    20260816,
    { crowdSize: 24, walkingPace: 1.8, crowdFidget: 1.1, pushStrength: 2 },
  ),
  fastPackedInsistentRobot: makeCard(
    "fastPackedInsistentRobot",
    "A packed, jittery room walking briskly, an insistent robot",
    "false positive",
    20260816,
    { crowdSize: 44, walkingPace: 1.8, crowdFidget: 3, pushStrength: 3 },
  ),
  fastPackedGentleRobot: makeCard(
    "fastPackedGentleRobot",
    "The same packed, jittery room, but a barely pushy robot",
    "false positive",
    424242,
    { crowdSize: 44, walkingPace: 1.8, crowdFidget: 3, pushStrength: 1 },
  ),
  fastFullerRoom: makeCard(
    "fastFullerRoom",
    "A fuller room walking briskly, a moderately pushy robot",
    "false positive",
    20260816,
    { crowdSize: 34, walkingPace: 1.8, crowdFidget: 1.1, pushStrength: 2 },
  ),
  // Every false-negative card below holds at the console's own default ruler — none of them needs
  // an extreme slider position to fool. The census's own shortest-horizon candidate (this same
  // crowd/robot setting as `amblingFullerRoom`, minimum forecast horizon) turned out to be false
  // negative at the default ruler too, so it appears here at the default instead of the extreme it
  // was originally found at (ruling 2 of this task).
  unhurriedModestRoom: makeCard(
    "unhurriedModestRoom",
    "A modest, jittery room in no hurry, an insistent robot",
    "false negative",
    20260816,
    { crowdSize: 24, walkingPace: 0.9, crowdFidget: 3, pushStrength: 3 },
  ),
  amblingFullerRoom: makeCard(
    "amblingFullerRoom",
    "A fuller room ambling along, an insistent robot",
    "false negative",
    20260816,
    { crowdSize: 34, walkingPace: 0.4, crowdFidget: 1.1, pushStrength: 3 },
  ),
  amblingPackedRoom: makeCard(
    "amblingPackedRoom",
    "A packed, jittery room ambling along, an insistent robot",
    "false negative",
    20260816,
    { crowdSize: 44, walkingPace: 0.4, crowdFidget: 3, pushStrength: 3 },
  ),
  unhurriedFullerRoom: makeCard(
    "unhurriedFullerRoom",
    "A fuller, jittery room in no hurry, an insistent robot",
    "false negative",
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
