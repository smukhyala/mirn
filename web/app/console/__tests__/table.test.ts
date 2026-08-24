import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { BASE_SEED, SEED_STRIDE, makeSweepJob } from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS, type ColumnKey } from "../../../engine/job/columns.js";
import type { RunRow } from "../../../engine/job/stats.js";
import { DEFAULT_SETTINGS, makeConsoleSettings } from "../state.js";
import { makeRunGroup } from "../group.js";
import {
  compareRows,
  ledgerRows,
  makeCellRef,
  makeLedgerView,
  renderLedger,
  settingsMatchJob,
} from "../table.js";

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
  axisValues: [4, 18, 44],
  seedIndices: [0, 1],
  baseSeed: BASE_SEED,
  seedStride: SEED_STRIDE,
  measurement: MEASUREMENT,
  columns: [...HEADLINE_COLUMNS],
  bandReplicates: null,
  floor: null,
  zeroReferenceRun: true,
  frechet: false,
});

// robotArrivalS is measured only at cell 1 (18 people) — every other cell is censored. A sort
// test that leaves every cell of a column unmeasured cannot tell "unmeasured sorts last" from
// "the comparator returns 0 for every pair and Array.sort happens to be stable", since both
// produce the same order here; one measured cell among censored ones is what actually exercises
// the aFinite/bFinite branch in ledgerRows' comparator.
function row(axisIndex: number, axisValue: number, seedIndex: number, value: number): RunRow {
  const arrival =
    axisIndex === 1
      ? { kind: "reading" as const, value: 12 + seedIndex, availability: { kind: "measured" as const } }
      : {
          kind: "reading" as const,
          value: Number.NaN,
          availability: { kind: "censored" as const, why: "the robot never reached its goal" },
        };
  return {
    kind: "runRow",
    key: { axisIndex, axisValue, seedIndex },
    readings: {
      trueEffectM: { kind: "reading", value, availability: { kind: "measured" } },
      robotArrivalS: arrival,
    },
  };
}

const GROUP = makeRunGroup({
  id: "group-1",
  label: "how many people are in the room — sweep",
  job: JOB,
  rows: [
    row(0, 4, 0, 0.150),
    row(0, 4, 1, 0.156),
    row(1, 18, 0, 0.350),
    row(1, 18, 1, 0.354),
    row(2, 44, 0, 0.380),
    row(2, 44, 1, 0.386),
  ],
  bands: [],
  completedAtMs: 1000,
});

const COLUMNS: readonly ColumnKey[] = ["trueEffectM", "robotArrivalS"];

function view(overrides: {
  readonly selected?: ReturnType<typeof makeCellRef> | null;
  readonly pinned?: readonly ReturnType<typeof makeCellRef>[];
  readonly sort?: { readonly kind: "byAxis" } | { readonly kind: "byColumn"; readonly column: ColumnKey };
  readonly direction?: "ascending" | "descending";
  readonly staleMessage?: string | null;
}) {
  return makeLedgerView({
    groups: [GROUP],
    columns: COLUMNS,
    selected: overrides.selected ?? null,
    pinned: overrides.pinned ?? [],
    sort: overrides.sort ?? { kind: "byAxis" },
    direction: overrides.direction ?? "ascending",
    staleMessage: overrides.staleMessage ?? null,
  });
}

describe("the ledger", () => {
  it("makes one row per cell, aggregated over that cell's seeds", () => {
    const rows = ledgerRows(view({}));
    expect(rows.length).toBe(3);
    const first = rows[0];
    expect(first?.axisValue).toBe(4);
    expect(first?.nUsed).toBe(2);
    expect(first?.nAttempted).toBe(2);
    expect(first?.cells["trueEffectM"]?.value).toBeCloseTo(0.153, 6);
  });

  it("carries a censored cell through as its reason, never as a number", () => {
    // Every seed in cell 0 came back censored on this column, so `aggregate()` in stats.ts reports
    // `reason.kind === "allCensored"` (nUsed === 0, at least one censored reading) — the fourth
    // AggregateReason variant, `"partiallyCensored"`, is for a cell where SOME seeds survived.
    const rows = ledgerRows(view({}));
    const crossing = rows[0]?.cells["robotArrivalS"];
    expect(crossing?.reason.kind).toBe("allCensored");
    expect(Number.isNaN(crossing?.value ?? 0)).toBe(true);
  });

  it("sorts by a column, with unmeasured cells last in both directions", () => {
    const descendingEffect = ledgerRows(
      view({ sort: { kind: "byColumn", column: "trueEffectM" }, direction: "descending" }),
    );
    expect(descendingEffect.map((r) => r.axisValue)).toEqual([44, 18, 4]);

    // robotArrivalS is measured at exactly one cell (18 people, see `row` above) and censored at
    // the other two — the one column shape that actually distinguishes "unmeasured sorts last"
    // from "the comparator returned 0 for every pair and the sort happened to be stable", which a
    // column that is unmeasured EVERYWHERE (the old fixture) cannot: both directions put the
    // single measured cell first regardless, and only reorder among the finite values, of which
    // there is only one here.
    const ascendingArrival = ledgerRows(
      view({ sort: { kind: "byColumn", column: "robotArrivalS" }, direction: "ascending" }),
    );
    expect(ascendingArrival.map((r) => r.axisValue)).toEqual([18, 4, 44]);
    const descendingArrival = ledgerRows(
      view({ sort: { kind: "byColumn", column: "robotArrivalS" }, direction: "descending" }),
    );
    expect(descendingArrival.map((r) => r.axisValue)).toEqual([18, 4, 44]);
  });

  it("keeps pinned rows at the top whatever the sort", () => {
    const pin = makeCellRef({ groupId: "group-1", axisIndex: 2 });
    const rows = ledgerRows(view({ pinned: [pin], sort: { kind: "byAxis" }, direction: "ascending" }));
    expect(rows[0]?.axisValue).toBe(44);
    expect(rows[0]?.pinned).toBe(true);
    expect(rows[1]?.pinned).toBe(false);
  });

  it("compares exactly two pinned rows, and otherwise compares nothing", () => {
    const a = makeCellRef({ groupId: "group-1", axisIndex: 0 });
    const b = makeCellRef({ groupId: "group-1", axisIndex: 1 });
    const deltas = compareRows(view({ pinned: [a, b] }));
    const trueEffect = deltas.find((d) => d.column === "trueEffectM");
    expect(trueEffect?.deltaM).toBeCloseTo(0.199, 6);
    expect(compareRows(view({ pinned: [a] })).length).toBe(0);
  });

  it("knows when the panel has moved away from what was measured", () => {
    // `ConsoleSettings` (state.ts) has no `.base`/`.measurement`/`.axis`/`.axisValues`(sweep
    // list)/`.seedIndices`/`.columns`/`.bandReplicates`(object)/`want*` fields — that shape belongs
    // to `SweepJob`, not the panel. The panel's own shape is `axisValues: Record<AxisKey, number>`
    // (every knob, including the one being swept, at its slider position) plus `sweepAxis` /
    // `sweepValues` / `seedCount` / `bandReplicates: number` / `withFloor` / `withFrechet` /
    // `withZeroReference`. `settingsMatchJob` has to agree on ALL of it, not only the world config
    // and the ruler: `index.html`'s own note promises pressing Run reproduces a kept result
    // exactly, and none of the sweep-shape fields above touch a base-config or measurement value,
    // so a comparison that skipped them would leave that promise unchecked whenever an operator
    // switched the swept axis, changed the seed count, or toggled band/floor/Frechet/zero-run.
    // `same` below is built to match JOB on every one of those fields, not only the two that used
    // to be checked.
    const same = makeConsoleSettings({
      ...DEFAULT_SETTINGS,
      sweepAxis: "crowdSize",
      sweepValues: [4, 18, 44],
      seedCount: 2,
      // JOB was built directly via makeSweepJob with bandReplicates: null; DEFAULT_SETTINGS.
      // bandReplicates is 8 (a band bought by default), which would itself now read as a
      // moved-away-from-JOB sweep shape if left unset here.
      bandReplicates: 0,
    });
    expect(settingsMatchJob(same, JOB)).toBe(true);

    const moved = makeConsoleSettings({
      ...same,
      axisValues: { ...same.axisValues, crowdSize: 19 },
    });
    expect(settingsMatchJob(moved, JOB)).toBe(false);

    const differentHorizon = makeConsoleSettings({
      ...same,
      axisValues: { ...same.axisValues, forecastHorizon: 1 },
    });
    expect(settingsMatchJob(differentHorizon, JOB)).toBe(false);

    // The base config and the ruler are untouched by every one of these — only the shape of the
    // sweep itself moved, which is exactly what the fix above adds coverage for.
    const differentSeedCount = makeConsoleSettings({ ...same, seedCount: 3 });
    expect(settingsMatchJob(differentSeedCount, JOB)).toBe(false);

    const differentSweepValues = makeConsoleSettings({ ...same, sweepValues: [4, 18, 40] });
    expect(settingsMatchJob(differentSweepValues, JOB)).toBe(false);

    const differentAxis = makeConsoleSettings({
      ...same,
      sweepAxis: "robotSpeed",
      sweepValues: [0.5, 1.1],
    });
    expect(settingsMatchJob(differentAxis, JOB)).toBe(false);

    const boughtBand = makeConsoleSettings({ ...same, bandReplicates: 8 });
    expect(settingsMatchJob(boughtBand, JOB)).toBe(false);

    const boughtFrechet = makeConsoleSettings({ ...same, withFrechet: true });
    expect(settingsMatchJob(boughtFrechet, JOB)).toBe(false);
  });

  it("never lets a mean borrow its denominator from a different column", () => {
    // The bug this guards: the row's own "seeds" figure used to be picked from whichever column
    // had the most MEASURED readings, then reused as if it applied to every column in the row.
    // Two seeds both ran here, so trueEffectM is fully measured (2/2) — but robotArrivalS is
    // measured on only one of them, the other censored (1/2). The old code would have shown "2/2"
    // in the row's own seeds column and then rendered robotArrivalS's one-seed mean with no count
    // of its own beside it at all, silently borrowing trueEffectM's denominator for a mean that
    // never earned it.
    const mixedJob = makeSweepJob({
      base: {},
      axis: null,
      axisValues: [0],
      seedIndices: [0, 1],
      baseSeed: BASE_SEED,
      seedStride: SEED_STRIDE,
      measurement: MEASUREMENT,
      columns: ["trueEffectM", "robotArrivalS"],
      bandReplicates: null,
      floor: null,
      zeroReferenceRun: true,
      frechet: false,
    });

    function mixedRow(seedIndex: number, arrivalMeasured: boolean): RunRow {
      return {
        kind: "runRow",
        key: { axisIndex: 0, axisValue: 0, seedIndex },
        readings: {
          trueEffectM: {
            kind: "reading",
            value: 0.35 + seedIndex * 0.001,
            availability: { kind: "measured" },
          },
          robotArrivalS: arrivalMeasured
            ? { kind: "reading", value: 12 + seedIndex, availability: { kind: "measured" } }
            : {
                kind: "reading",
                value: Number.NaN,
                availability: { kind: "censored", why: "the robot never reached its goal" },
              },
        },
      };
    }

    const mixedGroup = makeRunGroup({
      id: "group-mixed",
      label: "single run",
      job: mixedJob,
      rows: [mixedRow(0, true), mixedRow(1, false)],
      bands: [],
      completedAtMs: 1000,
    });

    const mixedView = makeLedgerView({
      groups: [mixedGroup],
      columns: ["trueEffectM", "robotArrivalS"],
      selected: null,
      pinned: [],
      sort: { kind: "byAxis" },
      direction: "ascending",
      staleMessage: null,
    });

    const rows = ledgerRows(mixedView);
    const trueEffect = rows[0]?.cells["trueEffectM"];
    const arrival = rows[0]?.cells["robotArrivalS"];
    expect(trueEffect?.nUsed).toBe(2);
    expect(trueEffect?.nAttempted).toBe(2);
    expect(arrival?.nUsed).toBe(1);
    expect(arrival?.nAttempted).toBe(2);

    // Both seeds arrived — the row's own count describes THAT, not which column happened to
    // measure best. It is not, and must not be, robotArrivalS's 1/2 wearing trueEffectM's number.
    expect(rows[0]?.nUsed).toBe(2);
    expect(rows[0]?.nAttempted).toBe(2);

    const doc = new JSDOM("<!doctype html><body></body>", { url: "https://example.test/" }).window
      .document;
    const table = renderLedger(doc, mixedView);
    const cells = Array.from(table.querySelectorAll("td.ledger-cell"));
    expect(cells.length).toBe(2);
    // trueEffectM is fully measured, so it agrees with the row's own count and prints no count of
    // its own — repeating "(2/2)" on a cell that already matches the row would be noise.
    expect(cells[0]?.querySelector(".cell-count")).toBeNull();
    // robotArrivalS disagrees with the row's own "2/2", so its own count is printed on the cell it
    // describes, not implied by a number that lives somewhere else in the row.
    expect(cells[1]?.querySelector(".cell-count")?.textContent).toBe("(1/2)");
  });
});
