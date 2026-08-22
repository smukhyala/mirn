import { makeRunConfig } from "../contracts/config.js";
import { pairedAgents } from "../contracts/pairedRun.js";
import { frechet } from "../measure/divergence/index.js";
import { replicateBand, type RunToRunBand } from "../measure/null/band.js";
import { seededPermutations, splitHalfNull, type SplitHalfNull } from "../measure/null/splitHalf.js";
import { runPair, type RunResult } from "../sim/run.js";
import type { ColumnKey, Reading } from "./columns.js";
import { planSweep } from "./plan.js";
import { buildContext, runReport } from "./report.js";
import { configForCell, paramsForCell, type SweepJob } from "./spec.js";
import { aggregate, type Aggregate, type RunRow } from "./stats.js";

/**
 * What one finished unit hands back.
 *
 * Numbers only. A seventy-two-run sweep of trajectories is about 33 MB and its readings are about
 * 90 KB, and playback re-simulates the selected run from its key instead. That substitution is
 * legal only because the rebuild is bitwise identical, which `determinism.test.ts` asserts rather
 * than assumes.
 */
export interface BandReading {
  readonly axisIndex: number;
  readonly meanM: number;
  readonly peakM: number;
  readonly nReplicates: number;
}

export interface UnitOutput {
  readonly kind: "unitOutput";
  readonly row: RunRow;
  readonly band: BandReading | null;
}

export function* sweepUnits(job: SweepJob): Generator<UnitOutput, void, undefined> {
  const plan = planSweep(job);
  for (const unit of plan.units) {
    const config = configForCell(job, unit.cellIndex, unit.key.seedIndex);
    const params = paramsForCell(job, unit.cellIndex);
    const run = runPair(config);

    let band: RunToRunBand | null = null;
    let bandReading: BandReading | null = null;
    if (unit.needsBand && job.bandReplicates !== null) {
      band = replicateBand(config, job.bandReplicates.n);
      bandReading = {
        axisIndex: unit.key.axisIndex,
        meanM: band.value,
        peakM: band.peakValue,
        nReplicates: band.nReplicates,
      };
    }

    let floor: SplitHalfNull | null = null;
    if (unit.needsFloor && job.floor !== null) {
      floor = splitHalfNull(
        run.control.positions,
        job.floor.nSplits,
        seededPermutations(job.floor.permutationSeed),
        job.floor.alpha,
        job.floor.strideSteps,
      );
    }

    let zeroRun: RunResult | null = null;
    if (unit.needsZeroRun) {
      // The zero-effect reference is measured at THIS cell's own settings. The forecaster's zero
      // reading moves more than threefold from an empty room to a full one, so quoting one cell's
      // zero beside another cell's number is the same error already caught for the band.
      zeroRun = runPair(makeRunConfig({ ...config, pedestriansSeeRobot: false }));
    }

    let frechetMeanM: number | null = null;
    if (unit.needsFrechet) {
      frechetMeanM = meanFrechet(run);
    }

    const context = buildContext({
      config,
      params,
      run,
      band,
      floor,
      zeroRun,
      frechetMeanM,
    });
    const readings = runReport(context, job.columns);

    yield {
      kind: "unitOutput" as const,
      row: Object.freeze({ kind: "runRow" as const, key: unit.key, readings }),
      band: bandReading,
    };
  }
}

function meanFrechet(run: RunResult): number {
  const agents = pairedAgents(run.pair);
  let total = 0;
  for (const entry of agents) {
    total += frechet(entry[0].positions, entry[1].positions);
  }
  if (agents.length === 0) {
    return Number.NaN;
  }
  return total / agents.length;
}

/**
 * Cells from runs, on whichever thread is asking.
 *
 * The worker returns per-seed readings and the main thread aggregates them with this same
 * function, so the table and the export cannot disagree and a per-run export costs nothing.
 */
export function accumulate(
  rows: readonly RunRow[],
  columns: readonly ColumnKey[],
): ReadonlyMap<number, Readonly<Partial<Record<ColumnKey, Aggregate>>>> {
  const byCell = new Map<number, RunRow[]>();
  for (const row of rows) {
    const existing = byCell.get(row.key.axisIndex);
    if (existing === undefined) {
      byCell.set(row.key.axisIndex, [row]);
    } else {
      existing.push(row);
    }
  }

  const out = new Map<number, Readonly<Partial<Record<ColumnKey, Aggregate>>>>();
  for (const [axisIndex, cellRows] of byCell) {
    const cell: Partial<Record<ColumnKey, Aggregate>> = {};
    for (const column of columns) {
      const readings: Reading[] = [];
      for (const row of cellRows) {
        const reading = row.readings[column];
        if (reading !== undefined) {
          readings.push(reading);
        }
      }
      if (readings.length > 0) {
        cell[column] = aggregate(readings);
      }
    }
    out.set(axisIndex, Object.freeze(cell));
  }
  return out;
}
