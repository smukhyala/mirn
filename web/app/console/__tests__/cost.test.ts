import { describe, expect, it } from "vitest";
import { BASE_SEED, SEED_STRIDE, makeSweepJob } from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS } from "../../../engine/job/columns.js";
import { describeCost, estimateCostMs, perRunMs, runsFor } from "../cost.js";

/**
 * The operator is told what a press costs before they make it, so the button never means
 * "wait, and then lose it".
 *
 * The per-run curve is fitted to three measurements on this machine — 38 ms at 18 people, 92 at
 * 44, 210 at 80 — and is deliberately an over-estimate for the band, whose replicates run a
 * little cheaper than a full paired run.
 *
 * The task-27 brief's own version of this file omits `baseSeed` / `seedStride` from every
 * `makeSweepJob` call. `SweepJobInit` (web/engine/job/spec.ts) requires both — there is no
 * default — so the brief's fixture does not compile against the committed Task 14 contract.
 * Both are supplied here from the same constants `state.ts` and `pump.test.ts` already use.
 */

const MEASUREMENT = {
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.1,
  recoveryDwellSteps: 20,
};

function job(overrides: Omit<Parameters<typeof makeSweepJob>[0], "baseSeed" | "seedStride">) {
  return makeSweepJob({ ...overrides, baseSeed: BASE_SEED, seedStride: SEED_STRIDE });
}

const SINGLE = job({
  base: { crowd: { nPedestrians: 18 } },
  axis: null,
  axisValues: [0],
  seedIndices: [0],
  measurement: MEASUREMENT,
  columns: [...HEADLINE_COLUMNS],
  bandReplicates: null,
  floor: null,
  zeroReferenceRun: false,
  frechet: false,
});

describe("what a press of Run costs", () => {
  it("tracks the three runs that were actually timed", () => {
    expect(perRunMs(18)).toBeCloseTo(38, 0);
    expect(perRunMs(44)).toBeCloseTo(92, 0);
    expect(perRunMs(80)).toBeCloseTo(210, 0);
  });

  it("counts a single run as one run", () => {
    expect(runsFor(SINGLE)).toBe(1);
    expect(estimateCostMs(SINGLE)).toBeLessThan(100);
  });

  it("charges the band per cell, at the replicate count actually asked for", () => {
    const withBand = job({
      base: { crowd: { nPedestrians: 18 } },
      axis: null,
      axisValues: [0],
      seedIndices: [0],
      measurement: MEASUREMENT,
      columns: [...HEADLINE_COLUMNS],
      bandReplicates: { n: 8, scope: "perCell" },
      floor: null,
      zeroReferenceRun: false,
      frechet: false,
    });
    const marginal = estimateCostMs(withBand) - estimateCostMs(SINGLE);
    expect(marginal).toBeCloseTo(8 * perRunMs(18), 0);
  });

  it("does not charge a measurement-axis sweep for simulations it will not run", () => {
    const world = job({
      base: { crowd: { nPedestrians: 18 } },
      axis: "robotSpeed",
      axisValues: [0.6, 0.8, 1.0, 1.2, 1.4],
      seedIndices: [0, 1, 2, 3],
      measurement: MEASUREMENT,
      columns: [...HEADLINE_COLUMNS],
      bandReplicates: null,
      floor: null,
      zeroReferenceRun: false,
      frechet: false,
    });
    const measurementAxis = job({
      base: { crowd: { nPedestrians: 18 } },
      axis: "forecastHorizon",
      // forecastHorizon is catalogued in seconds, range 0.2 to 3 (web/engine/job/axes.ts) — the
      // brief's own values here (20..60) were step counts, not seconds, and every one of them was
      // out of range; makeSweepJob rejects the whole job before this test could run.
      axisValues: [0.5, 1.0, 1.5, 2.0, 2.5],
      seedIndices: [0, 1, 2, 3],
      measurement: MEASUREMENT,
      columns: [...HEADLINE_COLUMNS],
      bandReplicates: null,
      floor: null,
      zeroReferenceRun: false,
      frechet: false,
    });
    expect(estimateCostMs(measurementAxis)).toBeLessThan(estimateCostMs(world) / 3);
  });

  it("says both how many runs and how long, in words", () => {
    const sweep = job({
      base: { crowd: { nPedestrians: 18 } },
      axis: "crowdSize",
      axisValues: [4, 8, 12, 18, 24, 32, 44],
      seedIndices: [0, 1, 2, 3, 4, 5, 6, 7],
      measurement: MEASUREMENT,
      columns: [...HEADLINE_COLUMNS],
      bandReplicates: null,
      floor: null,
      zeroReferenceRun: false,
      frechet: false,
    });
    expect(runsFor(sweep)).toBe(56);
    expect(describeCost(sweep)).toMatch(/^56 runs — about \d+(\.\d)? s$/);
  });
});
