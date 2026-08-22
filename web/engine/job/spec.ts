import { makeRunConfig, type RunConfig, type RunConfigOverrides } from "../contracts/config.js";
import { ContractError, fail } from "../core/errors.js";
import { AXES, type AxisKey } from "./axes.js";
import { COLUMNS, type ColumnKey } from "./columns.js";
import type { MeasurementParams } from "./report.js";

export type { MeasurementParams } from "./report.js";

/** Seeds are derived, never stored per run: base + index * stride, and nowhere else. */
export const BASE_SEED = 20260816;
export const SEED_STRIDE = 7919;

export function makeMeasurementParams(init: {
  readonly forecastHorizonSteps: number;
  readonly forecastEndStep: number;
  readonly nearMissThresholdM: number;
  readonly recoveryToleranceFraction: number;
  readonly recoveryDwellSteps: number;
}): MeasurementParams {
  if (!Number.isInteger(init.forecastHorizonSteps) || init.forecastHorizonSteps < 1) {
    fail(
      `MeasurementParams.forecastHorizonSteps must be a positive whole number of steps, got ` +
        `${init.forecastHorizonSteps}`,
    );
  }
  // Required and never defaulted. Left to default, the forecaster is checked at the last tick,
  // where everyone has arrived and stopped and a straight-line guess about a stationary person is
  // exactly right, so it reads 0.0000 however bad it actually is.
  if (!Number.isInteger(init.forecastEndStep) || init.forecastEndStep < 1) {
    fail(
      `MeasurementParams.forecastEndStep must be a positive whole number of steps and is never ` +
        `defaulted, got ${init.forecastEndStep}`,
    );
  }
  if (init.forecastEndStep <= init.forecastHorizonSteps) {
    fail(
      `MeasurementParams.forecastEndStep must be greater than forecastHorizonSteps, or there is ` +
        `no room before it to fit a velocity; got ${init.forecastEndStep} against a horizon of ` +
        `${init.forecastHorizonSteps}`,
    );
  }
  if (!(init.nearMissThresholdM > 0)) {
    fail(`MeasurementParams.nearMissThresholdM must be > 0, got ${init.nearMissThresholdM}`);
  }
  if (!(init.recoveryToleranceFraction > 0) || init.recoveryToleranceFraction >= 1) {
    fail(
      `MeasurementParams.recoveryToleranceFraction must be between 0 and 1, got ` +
        `${init.recoveryToleranceFraction}`,
    );
  }
  if (!Number.isInteger(init.recoveryDwellSteps) || init.recoveryDwellSteps < 1) {
    fail(`MeasurementParams.recoveryDwellSteps must be a positive integer, got ${init.recoveryDwellSteps}`);
  }
  return Object.freeze({
    kind: "measurementParams" as const,
    forecastHorizonSteps: init.forecastHorizonSteps,
    forecastEndStep: init.forecastEndStep,
    nearMissThresholdM: init.nearMissThresholdM,
    recoveryToleranceFraction: init.recoveryToleranceFraction,
    recoveryDwellSteps: init.recoveryDwellSteps,
  });
}

export interface FloorParams {
  readonly kind: "floorParams";
  readonly nSplits: number;
  readonly alpha: number;
  readonly strideSteps: number;
  readonly permutationSeed: number;
}

export function makeFloorParams(init: {
  readonly nSplits: number;
  readonly alpha: number;
  readonly strideSteps: number;
  readonly permutationSeed: number;
}): FloorParams {
  if (!Number.isInteger(init.nSplits) || init.nSplits < 1) {
    fail(`FloorParams.nSplits must be a positive integer, got ${init.nSplits}`);
  }
  if (!(init.alpha > 0) || init.alpha >= 1) {
    fail(`FloorParams.alpha must be between 0 and 1, got ${init.alpha}`);
  }
  if (!Number.isInteger(init.strideSteps) || init.strideSteps < 1) {
    fail(`FloorParams.strideSteps must be a positive integer, got ${init.strideSteps}`);
  }
  if (!Number.isInteger(init.permutationSeed)) {
    fail(`FloorParams.permutationSeed must be an integer, got ${init.permutationSeed}`);
  }
  return Object.freeze({
    kind: "floorParams" as const,
    nSplits: init.nSplits,
    alpha: init.alpha,
    strideSteps: init.strideSteps,
    permutationSeed: init.permutationSeed,
  });
}

export interface BandReplicates {
  readonly n: number;
  /**
   * `perSeed` measures a band for every seed and averages them, which is what the research script
   * did. `perCell` measures one band per axis value. They differ by about six per cent, so the
   * count and the scope ride on the cell and into the export rather than being assumed.
   */
  readonly scope: "perSeed" | "perCell";
}

export interface SweepJob {
  readonly kind: "sweepJob";
  readonly base: RunConfigOverrides;
  /** null is the degenerate single run. */
  readonly axis: AxisKey | null;
  readonly axisValues: readonly number[];
  /** An explicit list, never a count. Every denominator is read off this and recomputed nowhere. */
  readonly seedIndices: readonly number[];
  readonly baseSeed: number;
  readonly seedStride: number;
  readonly measurement: MeasurementParams;
  readonly columns: readonly ColumnKey[];
  readonly bandReplicates: BandReplicates | null;
  readonly floor: FloorParams | null;
  readonly zeroReferenceRun: boolean;
  readonly frechet: boolean;
}

export interface SweepJobInit {
  readonly base: RunConfigOverrides;
  readonly axis: AxisKey | null;
  readonly axisValues: readonly number[];
  readonly seedIndices: readonly number[];
  readonly baseSeed: number;
  readonly seedStride: number;
  readonly measurement: MeasurementParams;
  readonly columns: readonly ColumnKey[];
  readonly bandReplicates: BandReplicates | null;
  readonly floor: FloorParams | null;
  readonly zeroReferenceRun: boolean;
  readonly frechet: boolean;
}

export function seedFor(job: SweepJob, seedIndex: number): number {
  return job.baseSeed + seedIndex * job.seedStride;
}

export function configForCell(job: SweepJob, cellIndex: number, seedIndex: number): RunConfig {
  const value = job.axisValues[cellIndex];
  if (value === undefined) {
    fail(`sweep cell ${cellIndex} does not exist; this job has ${job.axisValues.length} cells`);
  }
  let overrides: RunConfigOverrides = job.base;
  if (job.axis !== null) {
    const axis = AXES[job.axis];
    if (axis.kind === "worldAxis") {
      overrides = axis.apply(job.base, value);
    }
  }
  return makeRunConfig({ ...overrides, seed: seedFor(job, seedIndex) });
}

export function paramsForCell(job: SweepJob, cellIndex: number): MeasurementParams {
  const value = job.axisValues[cellIndex];
  if (value === undefined) {
    fail(`sweep cell ${cellIndex} does not exist; this job has ${job.axisValues.length} cells`);
  }
  if (job.axis === null) {
    return job.measurement;
  }
  const axis = AXES[job.axis];
  if (axis.kind !== "measurementAxis") {
    return job.measurement;
  }
  return makeMeasurementParams(axis.apply(job.measurement, value));
}

/**
 * Every cell and every seed is validated here, before a single tick is simulated.
 *
 * Building a config is microseconds, so a twenty-by-eight grid validates in well under a
 * millisecond. Discovering an illegal axis value forty seconds into a sweep teaches the operator
 * that pressing Run means "wait, then lose it".
 */
export function makeSweepJob(init: SweepJobInit): SweepJob {
  if (init.axisValues.length === 0) {
    fail("a sweep needs at least one axis value");
  }
  if (init.axis === null && init.axisValues.length !== 1) {
    fail(
      `a job with no axis is the single-run case and must carry exactly one axis value, got ` +
        `${init.axisValues.length}`,
    );
  }
  if (init.axis !== null) {
    const axis = AXES[init.axis];
    for (const value of init.axisValues) {
      if (!Number.isFinite(value)) {
        fail(`axis '${init.axis}' was given a value of ${value}, which is not a number`);
      }
      if (value < axis.min || value > axis.max) {
        fail(
          `axis '${axis.key}' value ${value} is outside its range of ${axis.min} to ${axis.max}`,
        );
      }
    }
  }

  if (init.seedIndices.length === 0) {
    fail("a sweep needs at least one seed index");
  }
  const seenSeeds = new Set<number>();
  for (const seedIndex of init.seedIndices) {
    if (!Number.isInteger(seedIndex) || seedIndex < 0) {
      fail(`seed index must be a non-negative integer, got ${seedIndex}`);
    }
    if (seenSeeds.has(seedIndex)) {
      fail(
        `repeated seed index ${seedIndex}; every count on screen is read off this list, so a ` +
          `duplicate would report more runs than were made`,
      );
    }
    seenSeeds.add(seedIndex);
  }

  if (!Number.isInteger(init.baseSeed)) {
    fail(`baseSeed must be an integer, got ${init.baseSeed}`);
  }
  if (!Number.isInteger(init.seedStride) || init.seedStride < 1) {
    fail(`seedStride must be a positive integer, got ${init.seedStride}`);
  }

  if (init.columns.length === 0) {
    fail("a sweep needs at least one column to report");
  }
  for (const column of init.columns) {
    if (COLUMNS[column] === undefined) {
      fail(`'${String(column)}' is not a column; the catalogue in columns.ts is closed`);
    }
  }

  if (init.bandReplicates !== null) {
    if (!Number.isInteger(init.bandReplicates.n) || init.bandReplicates.n < 2) {
      fail(
        `the run-to-run band needs at least 2 replicates to have a pair to compare, got ` +
          `${init.bandReplicates.n}`,
      );
    }
    if (init.bandReplicates.scope !== "perSeed" && init.bandReplicates.scope !== "perCell") {
      fail(`band scope must be 'perSeed' or 'perCell', got '${String(init.bandReplicates.scope)}'`);
    }
  }

  // The ruler is validated here unconditionally, not left to `paramsForCell`: that function
  // returns `job.measurement` untouched whenever the axis is null or a world axis, which is 11 of
  // the 13 axes plus the single-run case. Without this, an illegal `forecastEndStep` on any of
  // those paths would freeze straight into the job.
  const measurement = makeMeasurementParams(init.measurement);

  let floor: FloorParams | null = null;
  if (init.floor !== null) {
    floor = makeFloorParams(init.floor);
  }

  const job: SweepJob = Object.freeze({
    kind: "sweepJob" as const,
    base: Object.freeze({ ...init.base }),
    axis: init.axis,
    axisValues: Object.freeze([...init.axisValues]),
    seedIndices: Object.freeze([...init.seedIndices]),
    baseSeed: init.baseSeed,
    seedStride: init.seedStride,
    measurement,
    columns: Object.freeze([...init.columns]),
    bandReplicates: init.bandReplicates === null ? null : Object.freeze({ ...init.bandReplicates }),
    floor,
    zeroReferenceRun: init.zeroReferenceRun,
    frechet: init.frechet,
  });

  for (let cellIndex = 0; cellIndex < job.axisValues.length; cellIndex++) {
    const axisValue = job.axisValues[cellIndex] as number;
    const label = job.axis === null ? "single run" : `${job.axis} = ${axisValue}`;
    try {
      paramsForCell(job, cellIndex);
    } catch (error) {
      throw wrapCell(cellIndex, label, -1, error);
    }
    for (const seedIndex of job.seedIndices) {
      try {
        configForCell(job, cellIndex, seedIndex);
      } catch (error) {
        throw wrapCell(cellIndex, label, seedIndex, error);
      }
    }
  }

  return job;
}

function wrapCell(cellIndex: number, label: string, seedIndex: number, error: unknown): Error {
  let detail = String(error);
  if (error instanceof Error) {
    detail = error.message;
  }
  const where = seedIndex < 0 ? "the ruler" : `seed index ${seedIndex}`;
  return new ContractError(`sweep cell ${cellIndex} (${label}), ${where}: ${detail}`);
}
