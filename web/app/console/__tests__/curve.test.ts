import { describe, expect, it } from "vitest";
import { BASE_SEED, SEED_STRIDE, makeSweepJob } from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS } from "../../../engine/job/columns.js";
import type { RunRow } from "../../../engine/job/stats.js";
import { makeRunGroup } from "../group.js";
import { sweepPlotView } from "../curve.js";

/**
 * Two corrections to the brief this file was drafted against.
 *
 * 1. `SweepJobInit` requires `baseSeed`/`seedStride` — the same omission `group.test.ts` and
 *    `cost.test.ts` already found and fixed in earlier tasks. Supplied here the same way.
 * 2. The forecaster's column key is `forecastReportM`, not `forecastM` — there is no `forecastM`
 *    in `ColumnKey` at all, so the brief's version would fail to typecheck as an object-literal
 *    property before a test ever ran.
 */
const MEASUREMENT = {
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.1,
  recoveryDwellSteps: 20,
};

function sweepJob(axis: "crowdSize" | null) {
  return makeSweepJob({
    base: { crowd: { nPedestrians: 18 } },
    axis,
    axisValues: axis === null ? [0] : [4, 18, 44],
    seedIndices: [0],
    baseSeed: BASE_SEED,
    seedStride: SEED_STRIDE,
    measurement: MEASUREMENT,
    columns: [...HEADLINE_COLUMNS],
    bandReplicates: { n: 8, scope: "perCell" },
    floor: null,
    zeroReferenceRun: true,
    frechet: false,
  });
}

function row(axisIndex: number, axisValue: number, trueEffect: number, forecast: number): RunRow {
  return {
    kind: "runRow",
    key: { axisIndex, axisValue, seedIndex: 0 },
    readings: {
      trueEffectM: { kind: "reading", value: trueEffect, availability: { kind: "measured" } },
      forecastReportM: { kind: "reading", value: forecast, availability: { kind: "measured" } },
    },
  };
}

const JOB = sweepJob("crowdSize");
const GROUP = makeRunGroup({
  id: "group-1",
  label: "how many people are in the room — sweep",
  job: JOB,
  rows: [row(0, 4, 0.153, 0.201), row(1, 18, 0.352, 0.286), row(2, 44, 0.383, 0.331)],
  bands: [
    { kind: "bandReading", axisIndex: 0, meanM: 0.172, peakM: 0.33, nReplicates: 8 },
    { kind: "bandReading", axisIndex: 1, meanM: 0.311, peakM: 0.6, nReplicates: 8 },
    { kind: "bandReading", axisIndex: 2, meanM: 0.462, peakM: 0.88, nReplicates: 8 },
  ],
  completedAtMs: 1000,
});

describe("the sweep curve", () => {
  it("has nothing to draw for a single run", () => {
    const single = makeRunGroup({
      id: "group-2",
      label: "single run",
      job: sweepJob(null),
      rows: [row(0, 0, 0.352, 0.286)],
      bands: [],
      completedAtMs: 1,
    });
    expect(sweepPlotView(single)).toBeNull();
  });

  it("plots the axis on x, in plain English, with metres on y", () => {
    // AXES.crowdSize.label is "How many people are in the room" — Title Case, the standalone
    // phrasing an axis title reads under a chart. group.ts's own labelForJob/labelForCell
    // lower-case the first letter, but only because THOSE embed the label mid-sentence ("how many
    // people are in the room — sweep"); a chart's own axis title is not embedded in anything.
    const view = sweepPlotView(GROUP);
    expect(view?.x).toEqual([4, 18, 44]);
    expect(view?.xLabel).toBe("How many people are in the room");
    expect(view?.yLabel).toBe("metres");
  });

  it("draws the true effect in the accent and the forecast alongside it", () => {
    const view = sweepPlotView(GROUP);
    const series = view?.series ?? [];
    expect(series.map((s) => s.key)).toEqual(["trueEffectM", "forecastReportM"]);
    expect(series[0]?.accent).toBe(true);
    expect(series[0]?.values).toEqual([0.153, 0.352, 0.383]);
    expect(series[1]?.accent).toBeUndefined();
    expect(series[1]?.values).toEqual([0.201, 0.286, 0.331]);
  });

  it("draws the run-to-run band as its own region from zero, not a third line", () => {
    // plot.ts already carries a `PlotRegion` primitive purpose-built for exactly this — a filled
    // floor from zero to a per-axis-value height, added by the task that made the polyline break
    // rather than bridge a censored point (its own commit message: "PlotRegion fills from zero to
    // a per-axis-value height, because the run-to-run band is measured separately at every axis
    // value"). Reusing it here rather than inventing a second, competing "shade to zero" mechanism
    // on PlotSeries is the point of this test.
    const view = sweepPlotView(GROUP);
    const regions = view?.regions ?? [];
    expect(regions.length).toBe(1);
    expect(regions[0]?.key).toBe("runToRunBandM");
    expect(regions[0]?.lower).toBeNull();
    // The band moves with crowd size — 0.172 m at 4 people to 0.462 m at 44 — so one line drawn
    // across a people-sweep would be a false floor.
    expect(regions[0]?.upper).toEqual([0.172, 0.311, 0.462]);
    // Never a third series: the region primitive exists precisely so the band is never mistaken
    // for a measured line with markers of its own.
    const series = view?.series ?? [];
    expect(series.some((s) => s.key === "runToRunBandM")).toBe(false);
  });

  it("omits the band entirely when it was never measured, rather than drawing a false floor", () => {
    // If bandReplicates was off for the whole press of Run, every axis cell is missing its band —
    // uniformly, because the band pass either runs for the whole job or not at all. Feeding a
    // missing band's placeholder into a region as though it read zero is exactly the "a censored
    // point ... dives to the axis" error the project's guardrails exist to forbid, so the curve
    // must leave the region out rather than draw one from an unmeasured number.
    const noBand = makeRunGroup({
      id: "group-3",
      label: "how many people are in the room — sweep",
      job: JOB,
      rows: [row(0, 4, 0.153, 0.201), row(1, 18, 0.352, 0.286), row(2, 44, 0.383, 0.331)],
      bands: [],
      completedAtMs: 1000,
    });
    const view = sweepPlotView(noBand);
    expect(view?.regions).toBeUndefined();
    // The two real lines are unaffected by the band's absence.
    expect(view?.series.map((s) => s.key)).toEqual(["trueEffectM", "forecastReportM"]);
  });
});
