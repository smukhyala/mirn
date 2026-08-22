import { describe, expect, it } from "vitest";
import { runPair } from "../../sim/run.js";
import { accumulate, sweepUnits } from "../runner.js";
import { planSweep } from "../plan.js";
import {
  BASE_SEED,
  SEED_STRIDE,
  configForCell,
  makeMeasurementParams,
  makeSweepJob,
  type SweepJob,
} from "../spec.js";
import type { RunRow } from "../stats.js";

const PARAMS = makeMeasurementParams({
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.25,
  recoveryDwellSteps: 20,
});

function job(): SweepJob {
  return makeSweepJob({
    base: {},
    axis: "crowdSize",
    axisValues: [6, 12],
    seedIndices: [0, 1],
    baseSeed: BASE_SEED,
    seedStride: SEED_STRIDE,
    measurement: PARAMS,
    columns: ["trueEffectM", "worstMomentM", "robotPathM", "robotArrivalS", "minClearanceM"],
    bandReplicates: { n: 4, scope: "perCell" },
    floor: null,
    zeroReferenceRun: false,
    frechet: false,
  });
}

function collect(source: SweepJob): RunRow[] {
  const rows: RunRow[] = [];
  for (const output of sweepUnits(source)) {
    rows.push(output.row);
  }
  return rows;
}

/** First differing byte between two Float64Arrays, or -1. Determinism is compared as bytes. */
function firstDifferingByte(a: Float64Array, b: Float64Array): number {
  const left = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const right = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  if (left.length !== right.length) {
    return 0;
  }
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return i;
    }
  }
  return -1;
}

describe("planSweep", () => {
  it("counts one unit per cell per seed and buys one band per cell", () => {
    const plan = planSweep(job());
    expect(plan.units.length).toBe(4);
    expect(plan.unitsTotal).toBe(4);
    let bandUnits = 0;
    for (const unit of plan.units) {
      if (unit.needsBand) {
        bandUnits++;
      }
    }
    expect(bandUnits).toBe(2);
  });

  it("buys a band for every seed when the scope says so", () => {
    const perSeed = makeSweepJob({
      ...job(),
      bandReplicates: { n: 4, scope: "perSeed" },
    });
    let bandUnits = 0;
    for (const unit of planSweep(perSeed).units) {
      if (unit.needsBand) {
        bandUnits++;
      }
    }
    expect(bandUnits).toBe(4);
  });
});

describe("determinism", () => {
  it("gives byte-identical readings for the same job twice", () => {
    const first = collect(job());
    const second = collect(job());
    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i++) {
      const a = first[i] as RunRow;
      const b = second[i] as RunRow;
      expect(b.key).toEqual(a.key);
      for (const key of Object.keys(a.readings) as (keyof typeof a.readings)[]) {
        // toBe is Object.is, so NaN matches NaN and a value off by one bit does not.
        expect(b.readings[key]?.value).toBe(a.readings[key]?.value);
        expect(b.readings[key]?.availability.kind).toBe(a.readings[key]?.availability.kind);
      }
    }
  });

  it("rebuilds a run from its key as the same bytes the sweep measured", () => {
    // The worker returns numbers, never trajectories: a 72-run sweep of paths is about 33 MB and
    // its readings are about 90 KB. Playback re-simulates instead, which is only legal because
    // the rebuild is the same run down to the last bit. So it is asserted, not assumed.
    const source = job();
    const rows = collect(source);
    const row = rows[3] as RunRow;

    const duringTheSweep = runPair(configForCell(source, row.key.axisIndex, row.key.seedIndex));
    const rebuiltFromTheKey = runPair(
      configForCell(source, row.key.axisIndex, row.key.seedIndex),
    );

    expect(rebuiltFromTheKey.treated.positions.length).toBe(
      duringTheSweep.treated.positions.length,
    );
    for (let i = 0; i < duringTheSweep.treated.positions.length; i++) {
      const a = duringTheSweep.treated.positions[i] as Float64Array;
      const b = rebuiltFromTheKey.treated.positions[i] as Float64Array;
      expect(firstDifferingByte(a, b)).toBe(-1);
    }
    const robotA = duringTheSweep.treated.robotPositions as Float64Array;
    const robotB = rebuiltFromTheKey.treated.robotPositions as Float64Array;
    expect(firstDifferingByte(robotA, robotB)).toBe(-1);
    expect(rebuiltFromTheKey.treated.arrivedTick).toBe(duringTheSweep.treated.arrivedTick);
  });

  it("keys every row to the cell it came from", () => {
    const rows = collect(job());
    expect(rows[0]?.key).toEqual({ axisIndex: 0, axisValue: 6, seedIndex: 0 });
    expect(rows[3]?.key).toEqual({ axisIndex: 1, axisValue: 12, seedIndex: 1 });
  });
});

describe("accumulate", () => {
  it("aggregates a cell from its runs and counts what stood behind it", () => {
    const source = job();
    const rows = collect(source);
    const cells = accumulate(rows, source.columns);
    expect(cells.size).toBe(2);
    const firstCell = cells.get(0);
    expect(firstCell?.trueEffectM?.nAttempted).toBe(2);
    expect(firstCell?.trueEffectM?.nUsed).toBe(2);
    expect(firstCell?.trueEffectM?.reason.kind).toBe("measured");
    expect(Number.isFinite(firstCell?.trueEffectM?.value as number)).toBe(true);
  });
});
