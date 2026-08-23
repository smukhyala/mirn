import { describe, expect, it } from "vitest";
import { BASE_SEED, SEED_STRIDE, makeSweepJob } from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS } from "../../../engine/job/columns.js";
import { describeSeed, recomputeForPlayback, stepSeed } from "../playback.js";

/**
 * The Worker returns numbers, never trajectories — a 72-run sweep of paths is about 33 MB. So
 * selecting a row for playback rebuilds that run's config and re-simulates it, 38 ms at 18 people.
 *
 * That substitution is only legal because of guardrail 4, and this file asserts it rather than
 * assuming it: two rebuilds of the same run are compared as BYTES, not approximations. Inexactness
 * would mean the picture on screen is not the run whose number is printed beside it.
 *
 * The brief's own `JOB` fixture omitted `baseSeed`/`seedStride`, which `SweepJobInit` requires —
 * the same defect `cost.test.ts` and `group.test.ts` already found and fixed in earlier tasks.
 * Supplied here the same way, from the real constants rather than an invented literal.
 */

const JOB = makeSweepJob({
  base: { crowd: { nPedestrians: 8 }, nTicks: 200 },
  axis: "crowdSize",
  axisValues: [8, 12],
  seedIndices: [0, 1, 2, 3],
  baseSeed: BASE_SEED,
  seedStride: SEED_STRIDE,
  measurement: {
    kind: "measurementParams",
    forecastHorizonSteps: 60,
    forecastEndStep: 150,
    nearMissThresholdM: 0.5,
    recoveryToleranceFraction: 0.1,
    recoveryDwellSteps: 20,
  },
  columns: [...HEADLINE_COLUMNS],
  bandReplicates: null,
  floor: null,
  zeroReferenceRun: false,
  frechet: false,
});

function bytesOf(paths: readonly Float64Array[]): string {
  const parts: string[] = [];
  for (const path of paths) {
    parts.push(Buffer.from(path.buffer, path.byteOffset, path.byteLength).toString("hex"));
  }
  return parts.join("|");
}

describe("rebuilding a run for playback", () => {
  it("is bitwise identical every time", () => {
    const first = recomputeForPlayback(JOB, 1, 2);
    const second = recomputeForPlayback(JOB, 1, 2);
    expect(bytesOf(second.treated.positions)).toBe(bytesOf(first.treated.positions));
    expect(bytesOf(second.control.positions)).toBe(bytesOf(first.control.positions));
  });

  it("actually plumbs the seed index through", () => {
    const a = recomputeForPlayback(JOB, 1, 0);
    const b = recomputeForPlayback(JOB, 1, 3);
    expect(a.config.seed).not.toBe(b.config.seed);
    expect(bytesOf(a.treated.positions)).not.toBe(bytesOf(b.treated.positions));
  });

  it("rebuilds the cell that was asked for", () => {
    expect(recomputeForPlayback(JOB, 0, 0).config.crowd.nPedestrians).toBe(8);
    expect(recomputeForPlayback(JOB, 1, 0).config.crowd.nPedestrians).toBe(12);
  });

  it("steps through the seeds inside a cell without falling off either end", () => {
    expect(stepSeed(0, -1, JOB.seedIndices)).toBe(0);
    expect(stepSeed(0, 1, JOB.seedIndices)).toBe(1);
    expect(stepSeed(3, 1, JOB.seedIndices)).toBe(3);
  });

  it("says which run of the cell is playing", () => {
    expect(describeSeed(JOB.seedIndices, 0)).toBe("seed 1 of 4");
    expect(describeSeed(JOB.seedIndices, 3)).toBe("seed 4 of 4");
  });
});
