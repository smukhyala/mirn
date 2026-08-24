import { describe, expect, it } from "vitest";
import { runPair, type ArmResult } from "../../sim/run.js";
import { accumulate, sweepUnits, type BandReading } from "../runner.js";
import { planSweep } from "../plan.js";
import {
  BASE_SEED,
  SEED_STRIDE,
  configForCell,
  makeFloorParams,
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

/** Every `BandReading` a sweep bought, in the order its units were visited. */
function collectBands(source: SweepJob): BandReading[] {
  const bands: BandReading[] = [];
  for (const output of sweepUnits(source)) {
    if (output.band !== null) {
      bands.push(output.band);
    }
  }
  return bands;
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

/**
 * Every position buffer, the robot buffer (present or not), and `arrivedTick` match byte for
 * byte between two arms.
 *
 * Takes whichever arm the caller hands it — treated or control — rather than assuming a robot is
 * present. Under the default `robot-presence` treatment the control arm carries no robot at all,
 * which is a genuinely different code path through `stepWorld` (no perception, no `planRobot`, no
 * robot-repulsion term), not the same branch running on different data. `robotPositions` being
 * `null` for both arms is asserted explicitly rather than skipped, so the check says what it means
 * even on the arm where the field happens to be empty today.
 */
function expectArmBytesMatch(a: ArmResult, b: ArmResult): void {
  expect(b.positions.length).toBe(a.positions.length);
  for (let i = 0; i < a.positions.length; i++) {
    const pathA = a.positions[i] as Float64Array;
    const pathB = b.positions[i] as Float64Array;
    expect(firstDifferingByte(pathA, pathB)).toBe(-1);
  }
  if (a.robotPositions === null || b.robotPositions === null) {
    expect(b.robotPositions).toBe(a.robotPositions);
  } else {
    expect(firstDifferingByte(a.robotPositions, b.robotPositions)).toBe(-1);
  }
  expect(b.arrivedTick).toBe(a.arrivedTick);
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

    // The treated arm carries the robot under this job's default `robot-presence` treatment.
    expectArmBytesMatch(duringTheSweep.treated, rebuiltFromTheKey.treated);
    // The control arm does not, under the same treatment: it runs a genuinely different branch
    // of `stepWorld` (no perception, no `planRobot`, no robot-repulsion term). `runner.ts` builds
    // the detection floor from exactly these positions, so a drift here would be silent there too.
    expectArmBytesMatch(duringTheSweep.control, rebuiltFromTheKey.control);
  });

  it("keys every row to the cell it came from", () => {
    const rows = collect(job());
    expect(rows[0]?.key).toEqual({ axisIndex: 0, axisValue: 6, seedIndex: 0 });
    expect(rows[3]?.key).toEqual({ axisIndex: 1, axisValue: 12, seedIndex: 1 });
  });

  it("reproduces its band readings byte-identically across two runs of the same job", () => {
    // planSweep buys a band for 2 of this job's 4 units (§ "counts one unit per cell per seed
    // and buys one band per cell" above). Nothing else in this file ever inspects what
    // `replicateBand` actually returned, so a regression in its determinism — or in how
    // `sweepUnits` wires the config into it — would otherwise pass this gate in silence.
    const first = collectBands(job());
    const second = collectBands(job());
    expect(first.length).toBe(2);
    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i++) {
      const a = first[i] as BandReading;
      const b = second[i] as BandReading;
      expect(b.axisIndex).toBe(a.axisIndex);
      expect(b.meanM).toBe(a.meanM);
      expect(b.peakM).toBe(a.peakM);
      expect(b.nReplicates).toBe(a.nReplicates);
    }
  });

  it("runs the floor, zero-run and frechet branches when the job asks for them", () => {
    // job() sets floor: null, zeroReferenceRun: false, frechet: false in every other test in this
    // file, so runner.ts's three optional-context branches are otherwise never exercised here.
    // report.test.ts's fullContext() covers buildContext/runReport with those inputs present, but
    // not sweepUnits's own wiring around them.
    const withExtras = makeSweepJob({
      ...job(),
      seedIndices: [0],
      floor: makeFloorParams({ nSplits: 4, alpha: 0.05, strideSteps: 20, permutationSeed: 0 }),
      zeroReferenceRun: true,
      frechet: true,
      columns: ["trueEffectM", "detectionFloorM", "forecastZeroM", "frechetMeanM"],
    });
    const rows = collect(withExtras);
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.readings.detectionFloorM?.availability.kind).toBe("measured");
      expect(row.readings.forecastZeroM?.availability.kind).toBe("measured");
      expect(row.readings.frechetMeanM?.availability.kind).toBe("measured");
    }
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
