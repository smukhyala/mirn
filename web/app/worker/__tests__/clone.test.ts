// web/app/worker/__tests__/clone.test.ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BASE_SEED,
  SEED_STRIDE,
  makeSweepJob,
  type SweepJob,
} from "../../../engine/job/spec.js";
import { COLUMN_ORDER, type ColumnKey } from "../../../engine/job/columns.js";

/**
 * The Worker boundary is a structural clone, not a function call.
 *
 * Section 4.2 of the design turns on this: `apply` is a function, functions throw
 * `DataCloneError` across `postMessage`, so the job carries an axis KEY and the worker looks the
 * entry up in its own copy of the table. This file is the thing that keeps that true. It asserts
 * both halves — every job we actually build survives the crossing, and a job that grew a function
 * member does not survive it quietly.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PROTOCOL_SOURCE = join(HERE, "..", "protocol.ts");

const MEASUREMENT = {
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.1,
  recoveryDwellSteps: 20,
};

// The brief called for `HEADLINE_COLUMNS`, which does not exist anywhere in columns.ts (verified
// by a repo-wide grep) — Task 11 never added it. `COLUMN_ORDER`, the real closed-catalogue export
// of every ColumnKey, stands in: this test only needs a legal, real column list to build
// representative jobs, and the full catalogue is a strictly more thorough stand-in than a
// headline subset would have been.
const allColumns: ColumnKey[] = [];
for (const key of COLUMN_ORDER) {
  allColumns.push(key);
}

const preview: SweepJob = makeSweepJob({
  base: { crowd: { nPedestrians: 18 } },
  axis: null,
  axisValues: [0],
  seedIndices: [0],
  baseSeed: BASE_SEED,
  seedStride: SEED_STRIDE,
  measurement: MEASUREMENT,
  columns: allColumns,
  bandReplicates: null,
  floor: null,
  zeroReferenceRun: true,
  frechet: false,
});

const worldSweep: SweepJob = makeSweepJob({
  base: { crowd: { noiseAmplitude: 1.1 }, robot: { maxSpeed: 1.1 } },
  axis: "crowdSize",
  axisValues: [4, 8, 12, 18, 24, 32, 44],
  seedIndices: [0, 1, 2, 3, 4, 5, 6, 7],
  baseSeed: BASE_SEED,
  seedStride: SEED_STRIDE,
  measurement: MEASUREMENT,
  columns: allColumns,
  bandReplicates: { n: 8, scope: "perCell" },
  floor: { kind: "floorParams", nSplits: 200, alpha: 0.05, strideSteps: 20, permutationSeed: BASE_SEED },
  zeroReferenceRun: true,
  frechet: true,
});

const measurementSweep: SweepJob = makeSweepJob({
  base: {},
  axis: "forecastHorizon",
  // The brief's axisValues (20, 40, 60, 80) are outside forecastHorizon's actual range of 0.2 to
  // 3 seconds (web/engine/job/axes.ts) and made makeSweepJob throw a ContractError. This axis is
  // seconds, not steps, so these are legal in-range replacements.
  axisValues: [0.5, 1, 1.5, 2],
  seedIndices: [0, 1],
  baseSeed: BASE_SEED,
  seedStride: SEED_STRIDE,
  measurement: MEASUREMENT,
  columns: allColumns,
  bandReplicates: null,
  floor: null,
  zeroReferenceRun: false,
  frechet: false,
});

const jobs: readonly (readonly [string, SweepJob])[] = [
  ["the 1x1 preview", preview],
  ["a world-axis sweep with band, floor and Frechet", worldSweep],
  ["a measurement-axis sweep", measurementSweep],
];

describe("the worker boundary", () => {
  for (const [name, job] of jobs) {
    it(`carries ${name} across structuredClone unchanged`, () => {
      const clone = structuredClone(job);
      expect(clone).not.toBe(job);
      expect(clone).toEqual(job);
      // Bytes, not approximations. structuredClone preserves own-property insertion order, so a
      // field silently reordered or dropped shows up here as a string difference.
      expect(JSON.stringify(clone)).toBe(JSON.stringify(job));
    });
  }

  it("refuses a job that grew a function member, loudly", () => {
    const illegal = { ...structuredClone(worldSweep), apply: (value: number): number => value };
    let name = "nothing was thrown";
    try {
      structuredClone(illegal);
    } catch (error) {
      name = (error as { name?: string }).name ?? "an error with no name";
    }
    expect(name).toBe("DataCloneError");
  });

  it("holds message types and nothing else", () => {
    const source = readFileSync(PROTOCOL_SOURCE, "utf8");
    const valueExport = /^export (?!type |interface )/m;
    expect(valueExport.test(source)).toBe(false);
  });

  it("does not import the measurement layer", () => {
    const source = readFileSync(PROTOCOL_SOURCE, "utf8");
    const reachesIntoMeasure = /from\s+["'][^"']*engine\/measure/;
    expect(reachesIntoMeasure.test(source)).toBe(false);
  });
});
