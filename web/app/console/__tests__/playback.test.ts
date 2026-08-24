import { describe, expect, it } from "vitest";
import { BASE_SEED, SEED_STRIDE, makeSweepJob } from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS } from "../../../engine/job/columns.js";
import { ContractError } from "../../../engine/core/errors.js";
import { describeSeed, makePlaybackSelection, recomputeForPlayback, stepSeed } from "../playback.js";

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

  // Split rather than one `it` with two assertions: `expect(...).not.toBe(...)` on `.config.seed`
  // would halt the block on failure before the byte comparison below it ever ran, so a mutation
  // that ignores `seedIndex` could pass the byte check by never reaching it. Each assertion here
  // has to be able to go red completely on its own, in the COMMITTED suite, for either one to be
  // real evidence rather than a report claiming a check that was actually shadowed.
  it("gives two different seed indices two different configs", () => {
    const a = recomputeForPlayback(JOB, 1, 0);
    const b = recomputeForPlayback(JOB, 1, 3);
    expect(a.config.seed).not.toBe(b.config.seed);
  });

  it("gives two different seed indices two different crowds, in bytes", () => {
    const a = recomputeForPlayback(JOB, 1, 0);
    const b = recomputeForPlayback(JOB, 1, 3);
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

/**
 * `makePlaybackSelection` was built per the brief but, until now, never imported by `console.ts`
 * or exercised by any test — dead validation code, caught in review. `console.ts` now builds its
 * `playback` state through this factory instead of a raw `{ groupId, axisIndex, seedIndex }`, so
 * these three `ContractError` branches are load-bearing: a malformed `data-axis-index` attribute
 * on a ledger row (the one place these numbers arrive from a DOM string rather than from
 * `stepSeed`'s own already-valid output) now fails loudly here instead of quietly reaching
 * `recomputeForPlayback` with a negative index.
 */
describe("naming a run to play back", () => {
  it("freezes a valid selection with a real kind", () => {
    const selection = makePlaybackSelection({ groupId: "group-1", axisIndex: 1, seedIndex: 2 });
    expect(selection).toEqual({
      kind: "playbackSelection",
      groupId: "group-1",
      axisIndex: 1,
      seedIndex: 2,
    });
    expect(Object.isFrozen(selection)).toBe(true);
  });

  it("refuses a playback selection with no kept result to play from", () => {
    expect(() => makePlaybackSelection({ groupId: "", axisIndex: 0, seedIndex: 0 })).toThrow(
      ContractError,
    );
  });

  it("refuses a cell that does not exist", () => {
    expect(() =>
      makePlaybackSelection({ groupId: "group-1", axisIndex: -1, seedIndex: 0 }),
    ).toThrow(ContractError);
    expect(() =>
      makePlaybackSelection({ groupId: "group-1", axisIndex: 1.5, seedIndex: 0 }),
    ).toThrow(ContractError);
  });

  it("refuses a run that does not exist", () => {
    expect(() =>
      makePlaybackSelection({ groupId: "group-1", axisIndex: 0, seedIndex: -1 }),
    ).toThrow(ContractError);
    expect(() =>
      makePlaybackSelection({ groupId: "group-1", axisIndex: 0, seedIndex: 2.5 }),
    ).toThrow(ContractError);
  });
});
