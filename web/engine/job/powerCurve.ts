import { makeRunConfig, type RunConfig, type RunConfigOverrides } from "../contracts/config.js";
import { fail } from "../core/errors.js";
import { paired } from "../measure/estimator/index.js";
import { replicateBand } from "../measure/null/band.js";
import { runPair } from "../sim/run.js";
import type { Reading, UnitKey } from "./columns.js";
import type { FamilyKey, MethodFamily } from "./families.js";
import { readFamily, type FamilyProbeSettings } from "./familyProbe.js";
import { meanOf } from "./stats.js";

/**
 * What a family of method reads when there IS something to read, swept from nothing upwards.
 *
 * ## The half of the question `familyProbe.ts` cannot ask
 *
 * That file runs one world, in which the robot's true effect is exactly nothing, and counts how
 * often a ruler claims otherwise. It is a false-positive rate and it is worth having. It is also
 * only half of what characterises a measurement, and the missing half is the one that decides
 * whether a ruler is any use: **when the robot really did move the crowd, did the ruler notice?**
 *
 * Without it a method that always answers "nothing happened" scores perfectly. `() => 0` never
 * clears the line on a world where nothing happened, so its false-positive rate is nought out of
 * however many rooms ran, and nothing in that number distinguishes it from a ruler that works.
 * `suppliedVerdict.ts` catches that one shape by noticing the answers never move, which is the best
 * a single world allows. This file catches it by construction: a ruler that cannot tell the
 * strongest world here from the emptiest one has a flat curve, and a flat curve is the finding.
 *
 * ## The dial, and why the left end of the sweep is the world the other file runs
 *
 * `pushStrength` — `robot.repulsionScale` — is how much space the robot demands. `AXES` records
 * that at zero the robot is socially invisible and the effect is exactly nothing, which makes the
 * left end of this sweep the same world `familyProbe.ts` builds with `pedestriansSeeRobot: false`.
 *
 * That is not an argument from two comments agreeing. It is measured, bitwise, in
 * `powerCurve.test.ts`: at push zero the truth is exactly 0, and the reading and the band are
 * `toBe`-equal to `probeSeed`'s on every seed of every family. So the first point of every curve
 * here IS the false-positive count the method card already prints, rather than a second number
 * about a similar world that a reader would have to be told to trust.
 *
 * ## Why one band serves the whole sweep
 *
 * `replicateBand` pairs the CONTROL arms, which have no robot in them, so nothing about the robot
 * reaches the band — the same argument `familyProbe.ts`'s header makes about the zero-effect
 * switch, now carrying more weight because the sweep would be meaningless if the line moved under
 * it. Also measured rather than assumed: the band at push 3 is `toBe`-equal to the band at push 0.
 * A curve drawn against a line that moved with the effect would be two changes plotted as one.
 *
 * ## What a count here means, and the distinction that makes it honest
 *
 * A room where the true effect is itself beneath the band is a room with nothing to notice, and a
 * ruler clearing the line there is raising a false alarm rather than making a detection — even at a
 * push strength where OTHER rooms had plenty to notice. Whether there was something to find varies
 * room by room at the same setting, so the counts are kept apart rather than pooled into one rate:
 * `nHit` and `nMissed` are over rooms where the truth cleared the line, `nFalseAlarm` is over rooms
 * where it did not. Pooling them would report a ruler that fires constantly as a good detector at
 * exactly the settings where most rooms happen to have a real effect in them.
 *
 * ## What this cannot say
 *
 * Guardrail 2, unmoved. A curve here says which rulers this invented crowd confounds and at what
 * sizes of invented effect. It does not say what any method's power is in a corridor, what effect
 * size a real study should design for, or that a published method is wrong. The effect sizes on the
 * x-axis are what a made-up dial did to a made-up crowd; they are not effect sizes anybody has
 * observed.
 */

/**
 * The dial positions the sweep visits.
 *
 * A closed table, like `ROOM_COUNTS` and every other catalogue here — not a slider, because each
 * entry costs a full set of rooms and their bands in real seconds. `0` is first and is not
 * optional: it is the point that ties this curve to the false-positive count, and a sweep that
 * started at 0.25 would have no anchor to the number already on the page.
 *
 * The upper end is 3 because that is `AXES.pushStrength.max`. Going past it would run the console's
 * own control off its end and produce a curve a reader could not reproduce by turning the dial.
 */
export const PUSH_LEVELS: readonly number[] = Object.freeze([0, 0.25, 0.5, 1, 2, 3]);

/** The override set for one dial position. The crowd sees the robot; how hard it pushes is swept. */
export function effectWorld(pushStrength: number): RunConfigOverrides {
  if (!Number.isFinite(pushStrength) || pushStrength < 0) {
    fail(`a push strength must be a finite length of at least nought, got ${pushStrength}`);
  }
  return Object.freeze({
    pedestriansSeeRobot: true,
    robot: Object.freeze({ repulsionScale: pushStrength }),
  });
}

/** The caller's room, at one dial position, at one seed. */
export function effectConfig(
  settings: FamilyProbeSettings,
  seed: number,
  pushStrength: number,
): RunConfig {
  return makeRunConfig({ ...settings.base, ...effectWorld(pushStrength), seed });
}

/**
 * One room at one dial position: what was really there, what the ruler said, and the line for both.
 *
 * Deliberately NOT `FamilyProbeSeed`. That type carries `truthUnderBand`, which on the zero-effect
 * world is an invariant asserted on every seed; here the same fact is a measurement that varies
 * room by room and is the thing a hit is counted against. Reusing the shape would have let a
 * reader of either file assume the field means what it means in the other.
 */
export interface PowerSeed {
  readonly kind: "powerSeed";
  readonly seed: number;
  readonly pushStrength: number;
  readonly reading: Reading;
  readonly bandM: number;
  readonly peakBandM: number;
  /** What the robot actually did to this room, from the paired construction. Exactly 0 at push 0. */
  readonly truthM: number;
  /** Whether there was anything here to notice: the true effect itself cleared the drift line. */
  readonly truthOverBand: boolean;
  /** Whether the ruler said there was. */
  readonly clearedBand: boolean;
}

export interface PowerLevel {
  readonly kind: "powerLevel";
  readonly pushStrength: number;
  readonly perSeed: readonly PowerSeed[];
  readonly nAttempted: number;
  /** Rooms where the true effect cleared the line: the rooms a detection is even available in. */
  readonly nTruthOverBand: number;
  /** Rooms the ruler called, whether or not there was anything in them. */
  readonly nCleared: number;
  /** Called it, and there was something there. */
  readonly nHit: number;
  /** There was something there and the ruler did not call it. */
  readonly nMissed: number;
  /** Called it, and there was nothing there. A false alarm at a non-zero dial position. */
  readonly nFalseAlarm: number;
  readonly meanTruthM: number;
  readonly meanReading: number;
  readonly meanBandM: number;
}

export interface PowerCurve {
  readonly kind: "powerCurve";
  readonly familyKey: FamilyKey;
  readonly unit: UnitKey;
  readonly levels: readonly PowerLevel[];
}

/**
 * One room, one dial position, one reading.
 *
 * The seam the worker and the test suite share, for `probeSeed`'s reason: the page runs these one
 * at a time so it can say which room it is on, and the pinned measurements run them in one call. If
 * the arithmetic lived in either loop the two routes would be two implementations of one count.
 */
export function probePowerSeed(
  family: MethodFamily,
  settings: FamilyProbeSettings,
  seed: number,
  pushStrength: number,
): PowerSeed {
  const world = effectWorld(pushStrength);
  const config = effectConfig(settings, seed, pushStrength);
  const run = runPair(config);
  const truthM = paired(run.pair).value;
  const band = replicateBand(config, settings.bandReplicates);
  const reading = readFamily(family, settings, config, run, world);

  let clearedBand = false;
  if (reading.availability.kind === "measured") {
    clearedBand = reading.value > band.value;
  }

  return Object.freeze({
    kind: "powerSeed" as const,
    seed,
    pushStrength,
    reading,
    bandM: band.value,
    peakBandM: band.peakValue,
    truthM,
    truthOverBand: truthM > band.value,
    clearedBand,
  });
}

/**
 * The counting, over rooms already run at one dial position.
 *
 * A room the family could not measure contributes to the denominator and to no other tally. It is
 * neither a hit nor a miss nor a false alarm: counting an unmeasured room as a miss would report a
 * ruler that was never asked as a ruler that failed, and those are opposite findings.
 */
export function aggregatePowerLevel(
  pushStrength: number,
  perSeed: readonly PowerSeed[],
): PowerLevel {
  if (perSeed.length < 1) {
    fail("a level of the sweep needs at least one room, and was given none");
  }

  const truths: number[] = [];
  const readings: number[] = [];
  const bands: number[] = [];
  let nTruthOverBand = 0;
  let nCleared = 0;
  let nHit = 0;
  let nMissed = 0;
  let nFalseAlarm = 0;

  for (const room of perSeed) {
    if (room.pushStrength !== pushStrength) {
      fail(
        `a level of the sweep holds rooms from one dial position, and was given a room at ` +
          `${room.pushStrength} among rooms at ${pushStrength}`,
      );
    }
    truths.push(room.truthM);
    bands.push(room.bandM);
    const measured = room.reading.availability.kind === "measured";
    if (measured) {
      readings.push(room.reading.value);
    }
    if (room.truthOverBand) {
      nTruthOverBand = nTruthOverBand + 1;
    }
    if (room.clearedBand) {
      nCleared = nCleared + 1;
    }
    if (!measured) {
      continue;
    }
    if (room.truthOverBand) {
      if (room.clearedBand) {
        nHit = nHit + 1;
      } else {
        nMissed = nMissed + 1;
      }
    } else if (room.clearedBand) {
      nFalseAlarm = nFalseAlarm + 1;
    }
  }

  return Object.freeze({
    kind: "powerLevel" as const,
    pushStrength,
    perSeed: Object.freeze([...perSeed]),
    nAttempted: perSeed.length,
    nTruthOverBand,
    nCleared,
    nHit,
    nMissed,
    nFalseAlarm,
    meanTruthM: meanOf(truths),
    meanReading: meanOf(readings),
    meanBandM: meanOf(bands),
  });
}

/** The whole sweep for one family: every dial position, on the same rooms, against the same line. */
export function powerCurveFor(
  family: MethodFamily,
  settings: FamilyProbeSettings,
  levels: readonly number[] = PUSH_LEVELS,
): PowerCurve {
  if (levels.length < 2) {
    fail("a sweep needs at least two dial positions; one position is a point and not a curve");
  }

  const built: PowerLevel[] = [];
  for (const pushStrength of levels) {
    const rooms: PowerSeed[] = [];
    for (const seed of settings.seeds) {
      rooms.push(probePowerSeed(family, settings, seed, pushStrength));
    }
    built.push(aggregatePowerLevel(pushStrength, rooms));
  }

  return Object.freeze({
    kind: "powerCurve" as const,
    familyKey: family.key,
    unit: "metres" as UnitKey,
    levels: Object.freeze(built),
  });
}
