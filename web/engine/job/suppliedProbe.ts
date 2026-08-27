import { fail } from "../core/errors.js";
import { paired } from "../measure/estimator/index.js";
import { replicateBand } from "../measure/null/band.js";
import { runPair, type RunResult } from "../sim/run.js";
import type { UnitKey } from "./columns.js";
import { zeroEffectConfig, type FamilyProbeSettings } from "./familyProbe.js";
import { finiteCount, meanOf, sdOf } from "./stats.js";
import { judgeSuppliedResult, suppliedRunFrom, type SuppliedOutcome } from "./supplied.js";

/**
 * What a method somebody else wrote reads on a world whose true effect is exactly nothing.
 *
 * This is the family probe's shape applied to a function instead of a catalogue entry, and it is
 * deliberately a separate module rather than a fifth branch of `readFamily`. A family declares its
 * ruler as data and the probe can therefore say in advance what it will compute. A supplied method
 * declares nothing, so everything here is written to survive a function that returns rubbish,
 * throws, mutates what it was handed, or answers differently on two identical questions.
 *
 * The method is never given the run without the robot. `suppliedRunFrom` takes ONE arm and there is
 * no parameter through which a comparison arm could arrive, so the restriction is a property of the
 * signature rather than of anybody remembering it. `readSupplied` exists as a seam so the test can
 * hand this pipeline a pair whose comparison arm belongs to a different room entirely and prove the
 * reading does not move — the same technique `unpaired.test.ts` uses on the column catalogue.
 */

/** What the reader's method is, once it can be called. Anything at all may come back out. */
export type SuppliedMethodRunner = (run: ReturnType<typeof suppliedRunFrom>) => unknown;

export interface SuppliedProbeSeed {
  readonly kind: "suppliedProbeSeed";
  readonly seed: number;
  readonly outcome: SuppliedOutcome;
  readonly bandM: number;
  readonly peakBandM: number;
  readonly truthM: number;
  readonly truthUnderBand: boolean;
  readonly clearedBand: boolean;
}

export interface SuppliedProbe {
  readonly kind: "suppliedProbe";
  readonly unit: UnitKey;
  readonly perSeed: readonly SuppliedProbeSeed[];
  readonly nAttempted: number;
  readonly nUsed: number;
  readonly nClearedBand: number;
  readonly nTruthsExactlyZero: number;
  readonly nTruthsUnderBand: number;
  readonly nFailed: number;
  readonly nNondeterministic: number;
  readonly meanReading: number;
  readonly sdReading: number;
  readonly meanBandM: number;
}

/**
 * Ask the method the same question twice, and judge the pair of answers.
 *
 * Two independent views are built rather than one reused, and that is not defensive tidiness: a
 * method that writes into the arrays it was handed would otherwise be asked a different question
 * the second time, and would then be reported as nondeterministic when what it actually did was
 * mutate its input. The copies make "identical input" true rather than intended.
 *
 * The seam is here, taking a whole `RunResult`, so a caller can hand it a pair whose comparison arm
 * is a stranger's. Only `run.treated` is ever read.
 */
export function readSupplied(runMethod: SuppliedMethodRunner, run: RunResult): SuppliedOutcome {
  const dt = run.config.dt;
  const firstView = suppliedRunFrom(run.treated, dt);
  const secondView = suppliedRunFrom(run.treated, dt);

  let first: unknown;
  try {
    first = runMethod(firstView);
  } catch (error) {
    return { kind: "failed", message: sentenceFor(error) };
  }

  let second: unknown;
  try {
    second = runMethod(secondView);
  } catch (error) {
    return { kind: "failed", message: sentenceFor(error) };
  }

  return judgeSuppliedResult(first, second);
}

/**
 * What a method's own failure says on the page.
 *
 * The method's message is kept when it has one, because a reader debugging their own metric is
 * owed what it actually said. A substituted apology would throw away the only useful sentence in
 * the whole failure.
 */
function sentenceFor(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "the method stopped part way through and gave no reason";
}

/** One room: the zero-effect world, its band, and what the supplied method read on it. */
export function probeSuppliedSeed(
  runMethod: SuppliedMethodRunner,
  settings: FamilyProbeSettings,
  seed: number,
): SuppliedProbeSeed {
  const config = zeroEffectConfig(settings, seed);
  const run = runPair(config);
  const truthM = paired(run.pair).value;
  const band = replicateBand(config, settings.bandReplicates);
  const outcome = readSupplied(runMethod, run);

  const truthUnderBand = truthM < band.value;
  let clearedBand = false;
  if (outcome.kind === "read") {
    clearedBand = outcome.valueM > band.value;
  }

  return Object.freeze({
    kind: "suppliedProbeSeed" as const,
    seed,
    outcome,
    bandM: band.value,
    peakBandM: band.peakValue,
    truthM,
    truthUnderBand,
    clearedBand,
  });
}

/**
 * The counting and the averaging, over seeds already run.
 *
 * Split out for the reason `aggregateProbe` is: the page runs seeds one at a time so it can report
 * which room it is on, and the pinned measurements run them in one call. If the arithmetic lived
 * inside either loop the two routes would be two implementations of the same counts.
 *
 * A seed the method failed or answered inconsistently contributes to its own tally and to nothing
 * else. Averaging a failure in as a zero would report a method that never ran as a method that read
 * nothing, and those are opposite findings.
 */
export function aggregateSuppliedProbe(perSeed: readonly SuppliedProbeSeed[]): SuppliedProbe {
  if (perSeed.length < 1) {
    fail("a supplied probe needs at least one room, and was given none");
  }

  const readings: number[] = [];
  const bands: number[] = [];
  let nClearedBand = 0;
  let nTruthsExactlyZero = 0;
  let nTruthsUnderBand = 0;
  let nFailed = 0;
  let nNondeterministic = 0;

  for (const seed of perSeed) {
    bands.push(seed.bandM);
    if (seed.truthM === 0) {
      nTruthsExactlyZero = nTruthsExactlyZero + 1;
    }
    if (seed.truthUnderBand) {
      nTruthsUnderBand = nTruthsUnderBand + 1;
    }
    if (seed.clearedBand) {
      nClearedBand = nClearedBand + 1;
    }
    if (seed.outcome.kind === "read") {
      readings.push(seed.outcome.valueM);
    } else if (seed.outcome.kind === "nondeterministic") {
      nNondeterministic = nNondeterministic + 1;
    } else {
      nFailed = nFailed + 1;
    }
  }

  return Object.freeze({
    kind: "suppliedProbe" as const,
    unit: "metres" as UnitKey,
    perSeed: Object.freeze([...perSeed]),
    nAttempted: perSeed.length,
    nUsed: finiteCount(readings),
    nClearedBand,
    nTruthsExactlyZero,
    nTruthsUnderBand,
    nFailed,
    nNondeterministic,
    meanReading: meanOf(readings),
    sdReading: sdOf(readings),
    meanBandM: meanOf(bands),
  });
}
