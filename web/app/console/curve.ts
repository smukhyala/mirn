import { AXES } from "../../engine/job/axes.js";
import { accumulate } from "../../engine/job/runner.js";
import type { ColumnKey } from "../../engine/job/columns.js";
import type { PlotRegion, PlotSeries, PlotView } from "../../ui/plot.js";
import type { RunGroup } from "./group.js";

/**
 * The sweep curve: the true effect, what a forecaster reports, and the run-to-run band underneath
 * them as a shaded region from zero.
 *
 * `plot.ts` already carries `PlotRegion` for exactly this shape — added by the task that made the
 * polyline break rather than bridge a censored point, whose own commit message reads "PlotRegion
 * fills from zero to a per-axis-value height, because the run-to-run band is measured separately
 * at every axis value". That is this file's task, so the band is returned as a region, not as a
 * third series with a duplicate "shade to zero" mechanism invented alongside it.
 *
 * The band is read per axis value, never once. Crowd size genuinely moves it — 0.172 m at 4 people
 * to 0.462 m at 44 — so a single line drawn across a people-sweep is a false floor, and the same
 * error was already caught once on the tiles.
 *
 * A group's band is uniform: `bandReplicates` is a single job-level flag (`web/app/console/
 * state.ts`), so a finished sweep either measured the band at every cell it swept or at none of
 * them. When it measured none, the region is left out of the returned view entirely rather than
 * drawn from a placeholder — feeding an unmeasured number into a region that clamps a missing
 * point to zero would be the exact "a censored point ... dives to the axis" error the project's
 * guardrails exist to forbid.
 */

const TRUE_EFFECT: ColumnKey = "trueEffectM";
const FORECAST: ColumnKey = "forecastReportM";
const BAND: ColumnKey = "runToRunBandM";

export function sweepPlotView(group: RunGroup): PlotView | null {
  if (group.job.axis === null) {
    return null;
  }
  const axis = AXES[group.job.axis];
  const byCell = accumulate(group.rows, [TRUE_EFFECT, FORECAST]);

  const trueValues: number[] = [];
  const forecastValues: number[] = [];

  for (let axisIndex = 0; axisIndex < group.job.axisValues.length; axisIndex++) {
    const cells = byCell.get(axisIndex);
    const trueEffect = cells === undefined ? undefined : cells[TRUE_EFFECT];
    const forecast = cells === undefined ? undefined : cells[FORECAST];
    trueValues.push(trueEffect === undefined ? Number.NaN : trueEffect.value);
    forecastValues.push(forecast === undefined ? Number.NaN : forecast.value);
  }

  const series: PlotSeries[] = [
    { key: TRUE_EFFECT, label: "how far the crowd was moved", values: trueValues, accent: true },
    { key: FORECAST, label: "what a forecaster would report", values: forecastValues },
  ];

  // Keyed on axisIndex alone, which is only safe because `BandReading` carries no seed and every
  // caller in this codebase today runs with `bandReplicates.scope: "perCell"` (one band reading
  // per axis index, hardcoded — see `web/app/console/state.ts`'s `jobForRun`). A `"perSeed"` band
  // would emit several `BandReading`s per axis index, one per seed, and this `Map.set` would
  // silently keep only the last one `set` overwrote the rest with. Unreached today; if `"perSeed"`
  // ever becomes reachable from the console, this has to average or otherwise combine the readings
  // for that axis index rather than pick one arbitrarily.
  const bandByAxis = new Map<number, number>();
  for (const reading of group.bands) {
    bandByAxis.set(reading.axisIndex, reading.meanM);
  }
  const bandValues: number[] = [];
  let bandComplete = bandByAxis.size > 0;
  for (let axisIndex = 0; axisIndex < group.job.axisValues.length; axisIndex++) {
    const meanM = bandByAxis.get(axisIndex);
    if (meanM === undefined) {
      bandComplete = false;
      bandValues.push(Number.NaN);
    } else {
      bandValues.push(meanM);
    }
  }

  const view = {
    x: [...group.job.axisValues],
    xLabel: axis.label,
    yLabel: "metres",
    series,
  };

  if (!bandComplete) {
    return view;
  }

  const regions: PlotRegion[] = [
    {
      kind: "plotRegion",
      key: BAND,
      label: "ordinary difference between two runs of this room",
      upper: bandValues,
      lower: null,
    },
  ];
  return { ...view, regions };
}
