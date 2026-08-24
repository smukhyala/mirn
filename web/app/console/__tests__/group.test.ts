import { describe, expect, it } from "vitest";
import { ContractError } from "../../../engine/core/errors.js";
import { BASE_SEED, SEED_STRIDE, makeSweepJob } from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS } from "../../../engine/job/columns.js";
import type { RunRow } from "../../../engine/job/stats.js";
import { labelForCell, labelForJob, makeGroupBuilder, makeRunGroup } from "../group.js";

/**
 * The task-27 brief's `JOB` fixture omits `baseSeed` / `seedStride`, which `SweepJobInit`
 * requires — see cost.test.ts's own note. Supplied here the same way.
 */
const MEASUREMENT = {
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.1,
  recoveryDwellSteps: 20,
};

const JOB = makeSweepJob({
  base: { crowd: { nPedestrians: 18 } },
  axis: "crowdSize",
  axisValues: [4, 18],
  seedIndices: [0, 1],
  baseSeed: BASE_SEED,
  seedStride: SEED_STRIDE,
  measurement: MEASUREMENT,
  columns: [...HEADLINE_COLUMNS],
  bandReplicates: { n: 8, scope: "perCell" },
  floor: null,
  zeroReferenceRun: true,
  frechet: false,
});

function row(axisIndex: number, axisValue: number, seedIndex: number, value: number): RunRow {
  return {
    kind: "runRow",
    key: { axisIndex, axisValue, seedIndex },
    readings: { trueEffectM: { kind: "reading", value, availability: { kind: "measured" } } },
  };
}

describe("a completed group of runs", () => {
  it("collects rows and bands as the worker sends them", () => {
    const builder = makeGroupBuilder(JOB);
    builder.addRow(row(0, 4, 0, 0.151));
    builder.addRow(row(0, 4, 1, 0.155));
    builder.addBand({ kind: "bandReading", axisIndex: 0, meanM: 0.172, peakM: 0.34, nReplicates: 8 });
    expect(builder.count()).toBe(2);

    const group = builder.finish({ id: "group-1", completedAtMs: 1000 });
    expect(group.kind).toBe("runGroup");
    expect(group.rows.length).toBe(2);
    expect(group.bands.length).toBe(1);
    // Field values, not just a count: a builder that dropped, zeroed or reordered a band's fields
    // on the way to `finish()` would still pass a length-only check.
    expect(group.bands[0]).toEqual({
      kind: "bandReading",
      axisIndex: 0,
      meanM: 0.172,
      peakM: 0.34,
      nReplicates: 8,
    });
    expect(group.job).toBe(JOB);
    expect(Object.isFrozen(group)).toBe(true);
  });

  it("names the group and its cells in plain English", () => {
    // AXES.crowdSize.label is "How many people are in the room" — Title Case, because it is also
    // used as a control heading. Embedded here after nothing (the group label opens the phrase),
    // the reader-facing convention this codebase already uses (web/app/console/csv.ts's own
    // lowerFirst, for the same reason on the CSV comment lines) is to read as flowing prose, not
    // a second heading. The brief's own expected strings are already lower-case, which only a
    // lowerFirst produces; its own sample implementation printed AXES[...].label verbatim and
    // would have shipped "How many..." — this test is what catches that.
    expect(labelForJob(JOB)).toBe("how many people are in the room — sweep");
    expect(labelForCell(JOB, 1)).toBe("how many people are in the room 18");
  });

  it("refuses a group whose rows do not belong to its job", () => {
    const builder = makeGroupBuilder(JOB);
    builder.addRow(row(7, 99, 0, 0.2));
    expect(() => builder.finish({ id: "group-2", completedAtMs: 1 })).toThrow(ContractError);
  });

  it("refuses a group with no identity", () => {
    expect(() =>
      makeRunGroup({ id: "", label: "x", job: JOB, rows: [], bands: [], completedAtMs: 0 }),
    ).toThrow(ContractError);
  });
});
