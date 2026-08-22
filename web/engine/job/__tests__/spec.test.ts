import { describe, expect, it } from "vitest";
import { ContractError } from "../../core/errors.js";
import {
  BASE_SEED,
  SEED_STRIDE,
  configForCell,
  makeMeasurementParams,
  makeSweepJob,
  paramsForCell,
  seedFor,
  type SweepJobInit,
} from "../spec.js";

const PARAMS = makeMeasurementParams({
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.25,
  recoveryDwellSteps: 20,
});

function init(overrides: Partial<SweepJobInit> = {}): SweepJobInit {
  return {
    base: {},
    axis: "crowdSize",
    axisValues: [4, 18, 44],
    seedIndices: [0, 1],
    baseSeed: BASE_SEED,
    seedStride: SEED_STRIDE,
    measurement: PARAMS,
    columns: ["trueEffectM", "minClearanceM"],
    bandReplicates: { n: 8, scope: "perCell" },
    floor: null,
    zeroReferenceRun: true,
    frechet: false,
    ...overrides,
  };
}

describe("makeMeasurementParams", () => {
  it("refuses an end step that leaves no room to fit a velocity", () => {
    expect(() => makeMeasurementParams({ ...PARAMS, forecastEndStep: 60 })).toThrow(ContractError);
    expect(() => makeMeasurementParams({ ...PARAMS, forecastEndStep: 60 })).toThrow(
      /forecastEndStep must be greater than forecastHorizonSteps/,
    );
  });

  it("never defaults the end step", () => {
    // With no end step the forecaster is evaluated at the last tick, by which time everyone has
    // arrived and parked, a straight-line guess about a stationary person is exactly right, and
    // the console's second headline is a permanent zero.
    const missing = { ...PARAMS } as Record<string, unknown>;
    delete missing.forecastEndStep;
    expect(() => makeMeasurementParams(missing as never)).toThrow(/forecastEndStep/);
  });
});

describe("makeSweepJob", () => {
  it("freezes a job that survives structuredClone", () => {
    const job = makeSweepJob(init());
    const copy = structuredClone(job);
    expect(copy.kind).toBe("sweepJob");
    expect(copy.axisValues).toEqual([4, 18, 44]);
    expect(copy.seedIndices).toEqual([0, 1]);
    expect(Object.isFrozen(job)).toBe(true);
  });

  it("derives a seed from the index and never anywhere else", () => {
    const job = makeSweepJob(init());
    expect(seedFor(job, 0)).toBe(20260816);
    expect(seedFor(job, 3)).toBe(20260816 + 3 * 7919);
  });

  it("applies a world axis to the cell and leaves the ruler alone", () => {
    const job = makeSweepJob(init());
    expect(configForCell(job, 2, 1).crowd.nPedestrians).toBe(44);
    expect(configForCell(job, 2, 1).seed).toBe(seedFor(job, 1));
    expect(paramsForCell(job, 2).forecastHorizonSteps).toBe(60);
  });

  it("applies a measurement axis to the ruler and leaves the room alone", () => {
    const job = makeSweepJob(
      init({ axis: "forecastHorizon", axisValues: [0.2, 3] }),
    );
    expect(paramsForCell(job, 0).forecastHorizonSteps).toBe(4);
    expect(paramsForCell(job, 1).forecastHorizonSteps).toBe(60);
    expect(configForCell(job, 0, 0).crowd.nPedestrians).toBe(
      configForCell(job, 1, 0).crowd.nPedestrians,
    );
  });

  it("accepts the degenerate single run as one cell with one value", () => {
    const job = makeSweepJob(init({ axis: null, axisValues: [0], seedIndices: [0] }));
    expect(job.axis).toBeNull();
    expect(configForCell(job, 0, 0).crowd.nPedestrians).toBe(18);
  });

  it("refuses an axis value outside the axis's own range", () => {
    expect(() => makeSweepJob(init({ axisValues: [4, 400] }))).toThrow(
      /axis 'crowdSize' value 400 is outside its range of 4 to 44/,
    );
  });

  it("refuses a repeated seed index, because the denominator is read off the list", () => {
    expect(() => makeSweepJob(init({ seedIndices: [0, 0, 1] }))).toThrow(/repeated seed index 0/);
  });

  it("refuses a band of one replicate", () => {
    expect(() => makeSweepJob(init({ bandReplicates: { n: 1, scope: "perCell" } }))).toThrow(
      /at least 2 replicates/,
    );
  });

  it("names the cell when a config in the grid is illegal", () => {
    // A room 15 m wide leaves the default goal at x = 20 outside the wall.
    expect(() => makeSweepJob(init({ base: { widthM: 15 } }))).toThrow(
      /sweep cell 0 \(crowdSize = 4\), seed index 0: /,
    );
    expect(() => makeSweepJob(init({ base: { widthM: 15 } }))).toThrow(/must be inside the room/);
  });

  it("validates the whole grid before running anything", () => {
    // A 20 x 8 grid is 160 paired runs and about six seconds of simulation. Construction that
    // stays under a fifth of a second cannot have simulated any of them. Discovering an illegal
    // value forty seconds into a sweep teaches the operator that Run means "wait, then lose it".
    const values: number[] = [];
    for (let i = 0; i < 20; i++) {
      values.push(4 + i * 2);
    }
    const started = performance.now();
    expect(() =>
      makeSweepJob(
        init({ base: { widthM: 15 }, axisValues: values, seedIndices: [0, 1, 2, 3, 4, 5, 6, 7] }),
      ),
    ).toThrow(ContractError);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("refuses a column that is not in the catalogue", () => {
    const bogus = ["madeUpColumn"] as unknown as SweepJobInit["columns"];
    expect(() => makeSweepJob(init({ columns: bogus }))).toThrow(/'madeUpColumn' is not a column/);
  });
});
