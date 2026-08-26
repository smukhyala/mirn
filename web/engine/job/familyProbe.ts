import {
  makeRunConfig,
  type RunConfig,
  type RunConfigOverrides,
} from "../contracts/config.js";
import { fail } from "../core/errors.js";
import { cvmResidual, paired } from "../measure/estimator/index.js";
import { replicateBand } from "../measure/null/band.js";
import { runPair, type RunResult } from "../sim/run.js";
import { COLUMNS, makeReading, type Reading, type UnitKey } from "./columns.js";
import { FAMILIES, FAMILY_ORDER, type FamilyKey, type MethodFamily } from "./families.js";
import { buildContext, type MeasurementParams } from "./report.js";
import { BASE_SEED, SEED_STRIDE, makeMeasurementParams } from "./spec.js";
import { finiteCount, meanOf, sdOf } from "./stats.js";

/**
 * What each family of method reads when the answer is nothing at all.
 *
 * The world here is one where the true effect is EXACTLY zero, not nearly zero. The crowd is told
 * not to notice the robot, so both arms of the pair are driven by the same forces from the same
 * tape, every pedestrian's two paths are bit-identical, and the paired estimator returns a hard
 * 0 rather than something small. That is verified per seed rather than assumed — `truthM` is
 * checked against exact zero in `familyProbe.slow.test.ts`, with `toBe`, never `toBeCloseTo`.
 *
 * ## Which null this is judged against, and which it is not
 *
 * Every comparison in this file is against the RUN-TO-RUN BAND: how far apart two runs of the
 * same robot-free room drift on their own. It is never against the split-half detection floor,
 * and the two are never divided by one another or set side by side as though one were a stricter
 * version of the other. They are different quantities and they CROSS as the room fills — at four
 * people the floor is twenty-two times the band, at forty-four the band is the larger. The long
 * comment at the top of `web/engine/measure/null/splitHalf.ts` is the record of that, and of the
 * two occasions this project got it wrong: a set of drill cards was labelled against the floor
 * while the screen asked the band's question, and a floor was quoted from a pool of both arms
 * while the product pools one.
 *
 * The false-positive count below is therefore defined exactly one way: on how many seeds does the
 * family's reading clear the band while the truth sits beneath it. Nothing here computes a floor,
 * and nothing here should acquire one without saying in the same breath what changed.
 *
 * ## Why the band does not move when the crowd stops noticing the robot
 *
 * `replicateBand` re-runs the configuration under a robot-presence treatment and pairs the
 * CONTROL arms, which have no robot in them at all. Whether the crowd was told to ignore a robot
 * is invisible to a room with no robot in it, so the band measured on the zero-effect world is
 * the same line as the band on the ordinary one. It describes the room, not the treatment. That
 * is a convenience and not a coincidence, and it is why the reading and its line can be read off
 * the same eight seeds without either one being borrowed from a different world.
 */

/** The switch that makes the truth exactly zero: the crowd walks as if the robot were not there. */
const ZERO_EFFECT: RunConfigOverrides = Object.freeze({ pedestriansSeeRobot: false });

/**
 * The eight seeds, the console's own.
 *
 * Written out as a list rather than a count, the same way a sweep job carries `seedIndices`: every
 * denominator on the card is read off this array and recomputed nowhere.
 */
export const PROBE_SEEDS: readonly number[] = Object.freeze([
  BASE_SEED + 0 * SEED_STRIDE,
  BASE_SEED + 1 * SEED_STRIDE,
  BASE_SEED + 2 * SEED_STRIDE,
  BASE_SEED + 3 * SEED_STRIDE,
  BASE_SEED + 4 * SEED_STRIDE,
  BASE_SEED + 5 * SEED_STRIDE,
  BASE_SEED + 6 * SEED_STRIDE,
  BASE_SEED + 7 * SEED_STRIDE,
]);

/** Eight replicates give 28 pairs; six gave 15 and the band visibly jittered. See `band.ts`. */
const DEFAULT_BAND_REPLICATES = 8;

export interface FamilyProbeSettings {
  readonly kind: "familyProbeSettings";
  /** The world before the zero-effect switch is applied. The switch is not negotiable. */
  readonly base: RunConfigOverrides;
  readonly seeds: readonly number[];
  readonly bandReplicates: number;
  /**
   * How the absolute readout is taken. The forecast family carries its own horizon and checked
   * instant on its ruler instead, because those two numbers are part of what the family IS.
   */
  readonly params: MeasurementParams;
}

export function makeFamilyProbeSettings(init: {
  readonly base?: RunConfigOverrides;
  readonly seeds?: readonly number[];
  readonly bandReplicates?: number;
  readonly params?: MeasurementParams;
}): FamilyProbeSettings {
  const seeds = init.seeds ?? PROBE_SEEDS;
  if (seeds.length === 0) {
    fail("a family probe needs at least one seed; a probe over no seeds measures nothing");
  }
  const seen = new Set<number>();
  for (const seed of seeds) {
    if (!Number.isInteger(seed)) {
      fail(`every probe seed must be an integer, got ${seed}`);
    }
    if (seen.has(seed)) {
      fail(
        `repeated probe seed ${seed}; the false-positive count is a count of seeds, so a repeat ` +
          `would inflate it while measuring the same room twice`,
      );
    }
    seen.add(seed);
  }
  const bandReplicates = init.bandReplicates ?? DEFAULT_BAND_REPLICATES;
  if (!Number.isInteger(bandReplicates) || bandReplicates < 2) {
    fail(`a run-to-run band needs at least 2 replicates, got ${bandReplicates}`);
  }
  return Object.freeze({
    kind: "familyProbeSettings" as const,
    base: Object.freeze({ ...(init.base ?? {}) }),
    seeds: Object.freeze([...seeds]),
    bandReplicates,
    params:
      init.params ??
      makeMeasurementParams({
        forecastHorizonSteps: 60,
        forecastEndStep: 200,
        nearMissThresholdM: 0.5,
        recoveryToleranceFraction: 0.25,
        recoveryDwellSteps: 20,
      }),
  });
}

/** One seed's worth: what the family read, what it was judged against, and what the truth was. */
export interface FamilyProbeSeed {
  readonly kind: "familyProbeSeed";
  readonly seed: number;
  /** Carries its own availability, so a family that could not read this room says why. */
  readonly reading: Reading;
  /** 95th percentile of the pairwise mean gap between robot-free replicates of this room. */
  readonly bandM: number;
  /** The same replicates reduced by their widest instant. Carried, never compared against here. */
  readonly peakBandM: number;
  /** The paired truth on this seed. Exactly 0 on the zero-effect world, and checked, not assumed. */
  readonly truthM: number;
  /**
   * The truth sat beneath the band on this seed. An asserted invariant of the zero-effect world,
   * not a condition anything here branches on -- see the note beside where it is computed.
   */
  readonly truthUnderBand: boolean;
  /**
   * The reading cleared the band. On a world whose true effect is exactly zero this IS the false
   * positive, with nothing else to qualify it.
   */
  readonly clearedBand: boolean;
}

export interface FamilyProbe {
  readonly kind: "familyProbe";
  readonly family: FamilyKey;
  readonly unit: UnitKey;
  readonly perSeed: readonly FamilyProbeSeed[];
  /** How many seeds were run. Never derived from anything but the seed list. */
  readonly nAttempted: number;
  /** How many produced a number. The denominator a mean must never be quoted without. */
  readonly nUsed: number;
  /** The false-positive count: readings that cleared the band while the truth sat beneath it. */
  readonly nClearedBand: number;
  /** How many seeds gave a truth of exactly zero. Anything but `nAttempted` breaks the premise. */
  readonly nTruthsExactlyZero: number;
  /**
   * How many seeds had their truth beneath the band.
   *
   * An invariant rather than a filter: on the zero-effect world this is every seed, and a probe
   * where it is not has stopped running the world it says it runs. Carried in the aggregate as
   * well as per seed so a consumer can check it without walking the list.
   */
  readonly nTruthsUnderBand: number;
  /** NaN with no survivors, never 0: a 0 there reads as a measurement rather than an absence. */
  readonly meanReading: number;
  /** NaN below two survivors. A 0 there would read as "no spread", which is a claim. */
  readonly sdReading: number;
  readonly meanBandM: number;
}

/** The world this family is probed on, at one seed: the caller's room, told to ignore the robot. */
export function zeroEffectConfig(settings: FamilyProbeSettings, seed: number): RunConfig {
  return makeRunConfig({ ...settings.base, ...ZERO_EFFECT, seed });
}

/**
 * A run whose comparison arm belongs to a different room entirely.
 *
 * `RunResult.control` is the raw arm result that the cost and safety readouts read directly;
 * `RunResult.pair.control` is the validated scene that everything built on paired agents reads
 * instead. They are two views of one arm, not two arms, so BOTH come from the decoy — swapping
 * one would leave half the readouts looking at the real comparison run and half at the decoy,
 * which is not an honest unpairing. `unpaired.test.ts` builds the same thing for the same reason.
 *
 * The pair is assembled as a plain object literal and never re-validated. `makePairedRun` rejects
 * a comparison arm from a different seed, which is correct — it is the guarantee that makes the
 * paired family mean anything — and this family exists precisely to show what a method that
 * cannot offer that guarantee reads.
 */
function withStrangerControl(real: RunResult, decoy: RunResult): RunResult {
  return {
    ...real,
    control: decoy.control,
    pair: { ...real.pair, control: decoy.pair.control },
  };
}

const MEASURED = Object.freeze({ kind: "measured" as const });

/** What one family reads off one room. Every branch returns a `Reading`, availability included. */
function readFamily(
  family: MethodFamily,
  settings: FamilyProbeSettings,
  config: RunConfig,
  run: RunResult,
): Reading {
  const ruler = family.ruler;
  if (ruler.kind === "sharedNoiseTwin") {
    return makeReading(paired(run.pair).value, MEASURED);
  }
  if (ruler.kind === "separateRunTwin") {
    const decoyConfig = makeRunConfig({
      ...settings.base,
      ...ZERO_EFFECT,
      seed: config.seed + ruler.controlSeedOffset,
    });
    const decoy = runPair(decoyConfig);
    return makeReading(paired(withStrangerControl(run, decoy).pair).value, MEASURED);
  }
  if (ruler.kind === "straightLineForecast") {
    return makeReading(cvmResidual(run.pair, ruler.horizonSteps, ruler.endStep).value, MEASURED);
  }
  const context = buildContext({
    config,
    params: settings.params,
    run,
    band: null,
    floor: null,
    zeroRun: null,
    frechetMeanM: null,
  });
  return COLUMNS[ruler.column].extract(context);
}

/**
 * Run one family across the seeds and report what it read where the answer was nothing.
 *
 * The return is frozen and made of plain records and numbers, so it survives a structured clone
 * out of a worker. Nothing in it is a function.
 */
export function probeFamily(family: MethodFamily, settings: FamilyProbeSettings): FamilyProbe {
  const perSeed: FamilyProbeSeed[] = [];
  const readings: number[] = [];
  const bands: number[] = [];
  let nClearedBand = 0;
  let nTruthsExactlyZero = 0;
  let nTruthsUnderBand = 0;

  for (const seed of settings.seeds) {
    const config = zeroEffectConfig(settings, seed);
    const run = runPair(config);
    const truthM = paired(run.pair).value;
    const band = replicateBand(config, settings.bandReplicates);
    const reading = readFamily(family, settings, config, run);

    // Exact, not approximate. The two arms of this pair are driven by the same forces from the
    // same tape, so every path is bit-identical and the estimator returns a hard zero. Anything
    // else means the arms have drifted, and a probe run on a world whose truth is merely small
    // would be reporting a false-positive count against an unstated non-zero effect.
    if (truthM === 0) {
      nTruthsExactlyZero = nTruthsExactlyZero + 1;
    }
    // `truthUnderBand` is recorded and asserted, never branched on. It used to gate the line
    // below, and that gate could not fail: the truth here is exactly 0 and a band is a positive
    // length, so the condition was true on every seed of every family and the conjunct did no
    // work. Dropping it is not a loosening -- on a world whose true effect is exactly zero, "the
    // reading cleared the band" IS the false positive and there is no second condition to check.
    // What the conjunct expressed is worth keeping, so it is checked directly instead: a seed
    // whose truth is not beneath the band means this is not the zero-effect world the probe
    // claims to run, which is a failure to shout about rather than a seed to quietly skip.
    const truthUnderBand = truthM < band.value;
    if (truthUnderBand) {
      nTruthsUnderBand = nTruthsUnderBand + 1;
    }
    let clearedBand = false;
    if (reading.availability.kind === "measured") {
      clearedBand = reading.value > band.value;
    }
    if (clearedBand) {
      nClearedBand = nClearedBand + 1;
    }

    readings.push(reading.value);
    bands.push(band.value);
    perSeed.push(
      Object.freeze({
        kind: "familyProbeSeed" as const,
        seed,
        reading,
        bandM: band.value,
        peakBandM: band.peakValue,
        truthM,
        truthUnderBand,
        clearedBand,
      }),
    );
  }

  return Object.freeze({
    kind: "familyProbe" as const,
    family: family.key,
    unit: family.unit,
    perSeed: Object.freeze(perSeed),
    nAttempted: settings.seeds.length,
    nUsed: finiteCount(readings),
    nClearedBand,
    nTruthsExactlyZero,
    nTruthsUnderBand,
    meanReading: meanOf(readings),
    sdReading: sdOf(readings),
    meanBandM: meanOf(bands),
  });
}

/** Every family, in the catalogue's own order, on the same seeds and the same rooms. */
export function probeAllFamilies(
  settings: FamilyProbeSettings,
): ReadonlyMap<FamilyKey, FamilyProbe> {
  const out = new Map<FamilyKey, FamilyProbe>();
  for (const key of FAMILY_ORDER) {
    out.set(key, probeFamily(FAMILIES[key], settings));
  }
  return out;
}
