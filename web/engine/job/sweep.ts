import type { RunConfig } from "../contracts/config.js";
import { fail } from "../core/errors.js";
import { runPair, type RunResult } from "../sim/run.js";

/**
 * One press of Run is (N axis values x M seeds), and a single run is the degenerate 1x1 case of
 * the same mechanism. This file is that grid and nothing else: it owns no measurement, no config
 * and no axis. The caller supplies a config builder and a measurement function, exactly as
 * scripts/measure-experiments.ts supplied them to its own private loop before this was extracted.
 */

/** What one run measured, by name. Values may be NaN: a censored measurement is still a result. */
export type MetricPoint = Readonly<Record<string, number>>;

/** One cell, one seed, one set of numbers. The addressable unit underneath every average. */
export interface SweepPoint {
  readonly kind: "sweepPoint";
  readonly axisValue: number;
  readonly seedIndex: number;
  readonly metrics: MetricPoint;
}

export function runSweep(opts: {
  readonly values: readonly number[];
  readonly seedIndices: readonly number[];
  readonly config: (value: number, seedIndex: number) => RunConfig;
  readonly measure: (run: RunResult, value: number, seedIndex: number) => MetricPoint;
}): readonly SweepPoint[] {
  // Everything is checked before the first simulation. The alternative is discovering an illegal
  // grid forty seconds into a sweep, which teaches the operator that Run means "wait, then lose it".
  if (opts.values.length === 0) {
    fail("runSweep needs at least one axis value; a sweep over nothing has no cells to average");
  }
  if (opts.seedIndices.length === 0) {
    fail("runSweep needs at least one seed index; every point here is a mean over seeds");
  }
  const seenValues = new Set<number>();
  for (const value of opts.values) {
    if (!Number.isFinite(value)) {
      fail(`runSweep axis values must be finite, got ${value}`);
    }
    if (seenValues.has(value)) {
      fail(
        `runSweep axis value ${value} appears twice; the two cells would merge into one average ` +
          `and the row would report more runs than it swept`,
      );
    }
    seenValues.add(value);
  }
  const seenSeeds = new Set<number>();
  for (const seedIndex of opts.seedIndices) {
    if (!Number.isInteger(seedIndex) || seedIndex < 0) {
      fail(`runSweep seed indices must be non-negative integers, got ${seedIndex}`);
    }
    if (seenSeeds.has(seedIndex)) {
      fail(`runSweep seed index ${seedIndex} appears twice; that run would be counted twice`);
    }
    seenSeeds.add(seedIndex);
  }

  const points: SweepPoint[] = [];
  for (const value of opts.values) {
    for (const seedIndex of opts.seedIndices) {
      const config = opts.config(value, seedIndex);
      const run = runPair(config);
      const measured = opts.measure(run, value, seedIndex);
      // Copied key by key rather than aliased, so a caller reusing one scratch object cannot
      // rewrite a result it already returned. The copy walks Object.keys, which preserves the
      // insertion order the aggregate later writes rows in.
      //
      // Note what is NOT done here: nothing is filtered for finiteness. A NaN is a censored
      // measurement, and it has to reach the aggregate for `finiteCount` to report it.
      const metrics: Record<string, number> = {};
      for (const key of Object.keys(measured)) {
        metrics[key] = measured[key] as number;
      }
      const point: SweepPoint = Object.freeze({
        kind: "sweepPoint" as const,
        axisValue: value,
        seedIndex,
        metrics: Object.freeze(metrics),
      });
      points.push(point);
    }
  }
  return Object.freeze(points);
}
