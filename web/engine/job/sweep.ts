import type { RunConfig } from "../contracts/config.js";
import { fail } from "../core/errors.js";
import { runPair, type RunResult } from "../sim/run.js";
import { finiteCount, meanOf, sdOf } from "./stats.js";

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

/**
 * Collapse the per-seed points into one row per axis value.
 *
 * The row shape is `{ [axisName]: value, k: mean, k_sd: sd, k_n: survivors, ... }`, and the KEY
 * ORDER is part of the contract: `JSON.stringify` writes keys in insertion order, and
 * web/data/experiment-facts.json is committed and diffed byte for byte. The axis key goes first;
 * metrics follow in the order they were first seen in this cell.
 *
 * Metric names are identifiers, never digit strings — an integer-like key would be reordered
 * ahead of everything else by the language's own property-order rules.
 *
 * A mean never appears without its count. `k_n` is how many runs the cell actually averaged, and
 * it is below the seed count whenever a measurement was censored, which anything quoting the cell
 * has to be able to say.
 */
export function aggregateSweep(
  points: readonly SweepPoint[],
  axisName: string,
): readonly Readonly<Record<string, number>>[] {
  const cellOrder: number[] = [];
  const cells = new Map<number, Record<string, number[]>>();
  for (const point of points) {
    let collected = cells.get(point.axisValue);
    if (collected === undefined) {
      collected = {};
      cells.set(point.axisValue, collected);
      cellOrder.push(point.axisValue);
    }
    for (const key of Object.keys(point.metrics)) {
      const value = point.metrics[key] as number;
      const bucket = collected[key];
      if (bucket === undefined) {
        collected[key] = [value];
      } else {
        bucket.push(value);
      }
    }
  }

  const rows: Readonly<Record<string, number>>[] = [];
  for (const axisValue of cellOrder) {
    const collected = cells.get(axisValue) as Record<string, number[]>;
    const row: Record<string, number> = {};
    row[axisName] = axisValue;
    for (const key of Object.keys(collected)) {
      const values = collected[key] as number[];
      row[key] = meanOf(values);
      row[`${key}_sd`] = sdOf(values);
      row[`${key}_n`] = finiteCount(values);
    }
    rows.push(Object.freeze(row));
  }
  return Object.freeze(rows);
}
