// web/app/worker/__tests__/pump.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  BASE_SEED,
  SEED_STRIDE,
  makeSweepJob,
  type SweepJob,
} from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS, type ColumnKey } from "../../../engine/job/columns.js";
import type { FromWorker } from "../protocol.js";

/**
 * The pump is the only place that decides what a reader is told while they wait, and the only
 * place a cancel can land. Both are asserted here against a fake runner, so the test costs
 * milliseconds rather than the real cost of a sweep.
 *
 * The task-18 brief assumed `web/engine/job/plan.ts`'s `Unit` carries `axisIndex` / `seedIndex` /
 * `phase` / `costMs`, and that `sweepUnits(job, plan)` yields a union of separate `"row"` and
 * `"band"` outcomes. Neither is true of the committed Task 15/16 code: `Unit` carries a `RunKey`
 * plus boolean `needsBand` / `needsFloor` / `needsZeroRun` / `needsFrechet` flags, and
 * `sweepUnits(job)` (no plan argument — it calls `planSweep` itself) yields one `UnitOutput` per
 * unit that always carries a `row` and, when that unit needed one, ALSO carries a `band` on the
 * SAME output. This file's mocks and assertions follow the real shapes, not the brief's.
 */

const { plannedUnits, outcomes, thrower } = vi.hoisted(() => ({
  plannedUnits: [] as {
    kind: "unit";
    key: { axisIndex: number; axisValue: number; seedIndex: number };
    cellIndex: number;
    needsBand: boolean;
    needsFloor: boolean;
    needsZeroRun: boolean;
    needsFrechet: boolean;
  }[],
  outcomes: [] as unknown[],
  thrower: { message: null as string | null },
}));

vi.mock("../../../engine/job/plan.js", () => ({
  planSweep: () => ({ kind: "workPlan", units: plannedUnits, unitsTotal: plannedUnits.length }),
}));

vi.mock("../../../engine/job/runner.js", () => ({
  sweepUnits: function* () {
    for (const outcome of outcomes) {
      if (thrower.message !== null) {
        throw new Error(thrower.message);
      }
      yield outcome;
    }
    if (thrower.message !== null) {
      throw new Error(thrower.message);
    }
  },
}));

import { phraseFor, pumpSweep, type PumpDeps, type PumpPort } from "../pump.js";

const headline: ColumnKey[] = [];
for (const key of HEADLINE_COLUMNS) {
  headline.push(key);
}

function jobWithAxis(axis: "crowdSize" | null): SweepJob {
  return makeSweepJob({
    base: {},
    axis,
    axisValues: axis === null ? [0] : [4, 18, 44],
    seedIndices: [0, 1],
    baseSeed: BASE_SEED,
    seedStride: SEED_STRIDE,
    measurement: {
      kind: "measurementParams",
      forecastHorizonSteps: 60,
      forecastEndStep: 200,
      nearMissThresholdM: 0.5,
      recoveryToleranceFraction: 0.1,
      recoveryDwellSteps: 20,
    },
    columns: headline,
    bandReplicates: null,
    floor: null,
    zeroReferenceRun: true,
    frechet: false,
  });
}

function reset(): void {
  plannedUnits.length = 0;
  outcomes.length = 0;
  thrower.message = null;
}

function recorder(): { readonly port: PumpPort; readonly sent: FromWorker[] } {
  const sent: FromWorker[] = [];
  const port: PumpPort = {
    postMessage: (message: FromWorker): void => {
      sent.push(message);
    },
  };
  return { port, sent };
}

function deps(overrides: Partial<PumpDeps>): PumpDeps {
  const base: PumpDeps = {
    nowMs: () => 0,
    yieldToHost: () => Promise.resolve(),
    isCancelled: () => false,
    sliceBudgetMs: 50,
  };
  return { ...base, ...overrides };
}

describe("the slice pump", () => {
  it("posts a row and a progress message for every unit, then done", async () => {
    reset();
    for (let index = 0; index < 3; index++) {
      plannedUnits.push({
        kind: "unit",
        key: { axisIndex: 0, axisValue: 0, seedIndex: index },
        cellIndex: 0,
        needsBand: false,
        needsFloor: false,
        needsZeroRun: true,
        needsFrechet: false,
      });
      outcomes.push({
        kind: "unitOutput",
        row: { kind: "runRow", key: { axisIndex: 0, axisValue: 0, seedIndex: index }, readings: {} },
        band: null,
      });
    }
    const { port, sent } = recorder();
    await pumpSweep(jobWithAxis(null), port, deps({}));

    const kinds: string[] = [];
    for (const message of sent) {
      kinds.push(message.kind);
    }
    expect(kinds).toEqual(["row", "progress", "row", "progress", "row", "progress", "done"]);

    const done: number[] = [];
    for (const message of sent) {
      if (message.kind === "progress") {
        done.push(message.unitsDone);
        expect(message.unitsTotal).toBe(3);
      }
    }
    expect(done).toEqual([1, 2, 3]);
  });

  it("posts a band message alongside the row of the unit that needed one, and only that one", async () => {
    reset();
    // Three units, and only the middle one needs a band. A bug that leaked the band onto a
    // neighbouring unit, or dropped it, would slip past a single-unit fixture; this one would
    // catch it.
    const axisValues = [4, 44, 18];
    for (let index = 0; index < 3; index++) {
      const needsBand = index === 1;
      plannedUnits.push({
        kind: "unit",
        key: { axisIndex: index, axisValue: axisValues[index] as number, seedIndex: 0 },
        cellIndex: index,
        needsBand,
        needsFloor: false,
        needsZeroRun: true,
        needsFrechet: false,
      });
      outcomes.push({
        kind: "unitOutput",
        row: {
          kind: "runRow",
          key: { axisIndex: index, axisValue: axisValues[index] as number, seedIndex: 0 },
          readings: {},
        },
        band: needsBand ? { axisIndex: index, meanM: 0.29304, peakM: 0.51201, nReplicates: 8 } : null,
      });
    }
    const { port, sent } = recorder();
    await pumpSweep(jobWithAxis("crowdSize"), port, deps({}));

    const kinds: string[] = [];
    for (const message of sent) {
      kinds.push(message.kind);
    }
    expect(kinds).toEqual([
      "row",
      "progress",
      "row",
      "band",
      "progress",
      "row",
      "progress",
      "done",
    ]);

    let bandCount = 0;
    for (const message of sent) {
      if (message.kind === "band") {
        bandCount++;
        expect(message.axisIndex).toBe(1);
        expect(message.meanM).toBe(0.29304);
        expect(message.peakM).toBe(0.51201);
        expect(message.nReplicates).toBe(8);
      }
    }
    expect(bandCount).toBe(1);
  });

  it("stops between units when cancelled, and says so", async () => {
    reset();
    for (let index = 0; index < 4; index++) {
      plannedUnits.push({
        kind: "unit",
        key: { axisIndex: 0, axisValue: 0, seedIndex: index },
        cellIndex: 0,
        needsBand: false,
        needsFloor: false,
        needsZeroRun: true,
        needsFrechet: false,
      });
      outcomes.push({
        kind: "unitOutput",
        row: { kind: "runRow", key: { axisIndex: 0, axisValue: 0, seedIndex: index }, readings: {} },
        band: null,
      });
    }
    const { port, sent } = recorder();
    // Budget 0 forces a yield after every unit, which is where a cancel can land.
    await pumpSweep(jobWithAxis(null), port, deps({ sliceBudgetMs: 0, isCancelled: () => true }));

    let rows = 0;
    for (const message of sent) {
      if (message.kind === "row") {
        rows++;
      }
    }
    expect(rows).toBe(1);
    expect(sent[sent.length - 1]?.kind).toBe("cancelled");
    for (const message of sent) {
      expect(message.kind).not.toBe("done");
    }
  });

  it("reports a failure instead of dying silently", async () => {
    reset();
    plannedUnits.push({
      kind: "unit",
      key: { axisIndex: 0, axisValue: 0, seedIndex: 0 },
      cellIndex: 0,
      needsBand: false,
      needsFloor: false,
      needsZeroRun: true,
      needsFrechet: false,
    });
    thrower.message = "the robot's goal is outside the room";
    const { port, sent } = recorder();
    await pumpSweep(jobWithAxis(null), port, deps({}));

    const last = sent[sent.length - 1];
    expect(last?.kind).toBe("failed");
    if (last?.kind === "failed") {
      expect(last.message).toBe("the robot's goal is outside the room");
    }
  });

  it("describes what it is doing in plain English", () => {
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    const phrases: string[] = [
      phraseFor(jobWithAxis(null), {
        kind: "unit",
        key: { axisIndex: 0, axisValue: 0, seedIndex: 0 },
        cellIndex: 0,
        needsBand: false,
        needsFloor: false,
        needsZeroRun: true,
        needsFrechet: false,
      }),
      phraseFor(jobWithAxis("crowdSize"), {
        kind: "unit",
        key: { axisIndex: 1, axisValue: 18, seedIndex: 1 },
        cellIndex: 1,
        needsBand: false,
        needsFloor: false,
        needsZeroRun: true,
        needsFrechet: false,
      }),
      phraseFor(jobWithAxis("crowdSize"), {
        kind: "unit",
        key: { axisIndex: 2, axisValue: 44, seedIndex: 0 },
        cellIndex: 2,
        needsBand: true,
        needsFloor: false,
        needsZeroRun: true,
        needsFrechet: false,
      }),
      phraseFor(jobWithAxis("crowdSize"), {
        kind: "unit",
        key: { axisIndex: 0, axisValue: 4, seedIndex: 0 },
        cellIndex: 0,
        needsBand: false,
        needsFloor: true,
        needsZeroRun: true,
        needsFrechet: false,
      }),
    ];
    for (const phrase of phrases) {
      expect(phrase.length).toBeGreaterThan(10);
      expect(identifier.test(phrase), `"${phrase}" carries a code identifier`).toBe(false);
    }
  });
});

describe("the progress line describes the unit about to run", () => {
  it("names the next unit, and says finishing only when there is none", async () => {
    reset();
    const axisValues = [4, 18, 44];
    for (let index = 0; index < 3; index++) {
      const key = { axisIndex: index, axisValue: axisValues[index] as number, seedIndex: 0 };
      plannedUnits.push({
        kind: "unit",
        key,
        cellIndex: index,
        needsBand: false,
        needsFloor: false,
        needsZeroRun: true,
        needsFrechet: false,
      });
      outcomes.push({
        kind: "unitOutput",
        row: { kind: "runRow", key, readings: {} },
        band: null,
      });
    }
    const { port, sent } = recorder();
    await pumpSweep(jobWithAxis("crowdSize"), port, deps({}));

    const phases: string[] = [];
    for (const message of sent) {
      if (message.kind === "progress") {
        phases.push(message.phase);
      }
    }
    expect(phases.length).toBeGreaterThan(1);
    // Every one but the last describes a unit still to come; the last has nothing left to name.
    for (let i = 0; i < phases.length - 1; i++) {
      expect(phases[i], "a mid-sweep progress line must name a unit").not.toBe("finishing");
    }
    expect(phases[phases.length - 1]).toBe("finishing");
  });
});
