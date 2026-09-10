import { makeRunConfig, type RunConfig } from "../../engine/contracts/config.js";
import { nPedestrians } from "../../engine/contracts/scene.js";
import { fail } from "../../engine/core/errors.js";
import { COLUMNS, type ColumnKey, type Reading } from "../../engine/job/columns.js";
import { buildContext, runReport, type ReportContext } from "../../engine/job/report.js";
import { contextInitFromConfig } from "../../engine/job/simContext.js";
import { configForCell, paramsForCell } from "../../engine/job/spec.js";
import { runPair, type RunResult } from "../../engine/sim/run.js";
import { makePanelValues, PREVIEW_DEBOUNCE_PEOPLE, type PanelValues } from "./panel.js";
import { DEFAULT_SETTINGS, jobForPreview, makeConsoleSettings, type ConsoleSettings } from "./state.js";
import type { SettingStamp } from "./tile.js";

/**
 * The 1x1 run behind the arena and the live headline tiles.
 *
 * Two things about it are load-bearing.
 *
 * It is built through `jobForPreview`, never `jobForRun`. `jobForPreview` fixes `axis: null,
 * axisValues: [0]`, so `configForCell(job, 0, 0)` always reads the settings now in the panel — not
 * cell 0 of whatever sweep happens to be configured. With a people-sweep set up, that cell is 4
 * people while the slider reads 18, and every tile would then describe a room the operator is not
 * looking at. `state.test.ts` already guards `jobForPreview` itself against this; this file's own
 * test guards that `runPreview` does not quietly swap in the other job.
 *
 * It computes the zero-effect reference run as well — the same settings, one extra 38 ms paired
 * run, with `pedestriansSeeRobot` off. `jobForPreview` always sets `zeroReferenceRun: true`
 * regardless of the panel's own toggle, for the same reason: without it the forecaster's tile
 * reads "not applicable" and the console's central argument is missing on first load.
 *
 * What it does NOT compute is the run-to-run band: `jobForPreview` never buys it (267 ms is not a
 * keystroke budget), so `runToRunBandM` never appears in `readings` here. That also takes
 * `worstMomentM` off the board even though its own reading needs only "run" and is always
 * measured: its zero-reference is the companion column `worstMomentNullM`, which needs the band
 * too, so `isRenderable` below refuses it the same way. The gauge under every OTHER tile says so
 * as well — `web/console.ts` hands every tile a `bandNotMeasured` gauge, always, rather than
 * showing a floor measured at other settings.
 */

export const DEBOUNCE_PEOPLE = PREVIEW_DEBOUNCE_PEOPLE;
export const DEBOUNCE_MS = 180;

export interface Preview {
  readonly kind: "preview";
  readonly config: RunConfig;
  readonly run: RunResult;
  readonly zeroRun: RunResult;
  readonly context: ReportContext;
  readonly readings: Readonly<Partial<Record<ColumnKey, Reading>>>;
}

export function peopleIn(settings: ConsoleSettings): number {
  return settings.axisValues["crowdSize"];
}

export function shouldDebounce(settings: ConsoleSettings): boolean {
  // >= rather than >: crowdSize's own max (44) is exactly DEBOUNCE_PEOPLE, and a range input
  // clamps to its max on assignment, so a strict > can never be reached through that slider. See
  // panel.ts's PREVIEW_DEBOUNCE_PEOPLE, which this constant is aliased to, for the measurement.
  return peopleIn(settings) >= DEBOUNCE_PEOPLE;
}

/**
 * The panel has no controls yet for the near-miss line, the recovery tolerance or the recovery
 * dwell — `AXES` (13 axes) writes only `RunConfigOverrides` and `MeasurementParams.forecast*`
 * fields, none of them. Until a later task adds those sliders, a settings object built from the
 * panel's own `PanelValues` seeds those three fields from `DEFAULT_SETTINGS`, the same defaults
 * `state.ts` ships, rather than inventing a second set of magic numbers here.
 */
export function settingsFromPanel(values: PanelValues): ConsoleSettings {
  return makeConsoleSettings({
    axisValues: values.axisValues,
    pedestriansSeeRobot: values.pedestriansSeeRobot,
    crowdModel: values.crowdModel,
    nearMissThresholdM: DEFAULT_SETTINGS.nearMissThresholdM,
    recoveryToleranceFraction: DEFAULT_SETTINGS.recoveryToleranceFraction,
    recoveryDwellSteps: DEFAULT_SETTINGS.recoveryDwellSteps,
    sweepAxis: values.sweepAxis,
    sweepValues: values.sweepValues,
    seedCount: values.seedCount,
    // 0 means the band was not bought, matching ConsoleSettings' own convention; the panel's
    // null means the same thing.
    bandReplicates: values.bandReplicates ?? 0,
    withFloor: values.detectionFloor,
    withFrechet: values.frechet,
    withZeroReference: values.zeroReferenceRun,
  });
}

/**
 * The other direction, for the one caller that needs it: a decoded permalink, on its way into the
 * controls.
 *
 * It lives beside `settingsFromPanel` rather than in `panel.ts` or `permalink.ts` because the two
 * shapes disagree — `bandReplicates` is `number` with 0 meaning off on one side and `number | null`
 * with `null` meaning off on the other — and one file translating both ways is one place for that
 * disagreement to be resolved rather than two.
 *
 * The three fields `PanelValues` does not carry (the near-miss line, the recovery tolerance, the
 * recovery dwell) are dropped here, not defaulted: `settingsFromPanel` will fill them from
 * `DEFAULT_SETTINGS` on the way back, and `settingsNotHonoured` is what tells the operator a link
 * asked for something else.
 */
export function panelValuesFromSettings(settings: ConsoleSettings): PanelValues {
  return makePanelValues({
    axisValues: settings.axisValues,
    pedestriansSeeRobot: settings.pedestriansSeeRobot,
    crowdModel: settings.crowdModel,
    sweepAxis: settings.sweepAxis,
    sweepValues: settings.sweepValues,
    seedCount: settings.seedCount,
    bandReplicates: settings.bandReplicates === 0 ? null : settings.bandReplicates,
    detectionFloor: settings.withFloor,
    frechet: settings.withFrechet,
    zeroReferenceRun: settings.withZeroReference,
  });
}

export function runPreview(settings: ConsoleSettings): Preview {
  const job = jobForPreview(settings);
  const config = configForCell(job, 0, 0);
  const params = paramsForCell(job, 0);
  const zeroConfig = makeRunConfig({ ...config, pedestriansSeeRobot: false });

  const run = runPair(config);
  const zeroRun = runPair(zeroConfig);

  const context = buildContext({
    ...contextInitFromConfig(config),
    params,
    run,
    zeroRun,
    band: null,
    floor: null,
    frechetMeanM: null,
  });

  // Only the columns the preview actually bought: `job.columns` already excludes anything needing
  // a band, a floor or the Frechet ruler, because `jobForPreview` never buys them. Reporting
  // COLUMN_ORDER instead would put a "not applicable, press Run" reading under runToRunBandM's
  // tile — noise beside the live numbers, and the wrong way to say what guardrail 2 already says
  // once through every other tile's gauge.
  const readings = runReport(context, job.columns);

  return Object.freeze({ kind: "preview" as const, config, run, zeroRun, context, readings });
}

/**
 * What a tile was measured at, printed under every reading.
 *
 * Takes the report context rather than a whole `Preview`, because the context is all it ever read
 * — the room and the ruler — and because the drill's card has no `Preview` to hand it. A card
 * builds its context straight from the catalogue in `web/engine/job/cards.ts` and never runs the
 * zero-effect reference arm, so a second copy of these three stamps is the only alternative, and
 * three reader-facing labels living in two files is exactly the drift this project spends its
 * comments arguing against.
 */
export function stampsFor(ctx: ReportContext): readonly SettingStamp[] {
  const dt = ctx.dt;
  return Object.freeze([
    Object.freeze({
      // Not "people". The label and the unit are printed either side of the value, so a stamp
      // labelled with its own unit reads "people 18 people".
      //
      // Read off the treated scene rather than a config's `crowd.nPedestrians`, which `ctx` no
      // longer carries: the report layer knows only data, not settings, and the paired invariant
      // guarantees both arms hold the same crowd, so `nPedestrians` here is exactly the count the
      // config asked for, under any treatment kind actually used.
      kind: "settingStamp" as const,
      label: "crowd",
      value: nPedestrians(ctx.run.pair.treated),
      unit: "people" as const,
    }),
    Object.freeze({
      kind: "settingStamp" as const,
      label: "forecast horizon",
      value: ctx.params.forecastHorizonSteps * dt,
      unit: "seconds" as const,
    }),
    Object.freeze({
      kind: "settingStamp" as const,
      label: "measured at",
      value: ctx.params.forecastEndStep * dt,
      unit: "seconds" as const,
    }),
  ]);
}

/**
 * Every `geometricBound` headline column's formula. `robotPathM` and `robotArrivalS` are both
 * bounded by the straight line from the robot's start to the edge of its goal — a distance for
 * one, that distance walked flat out at the robot's own speed limit for the other. `minClearanceM`
 * is also a `geometricBound`, but its zero really is the coordinate zero (two outlines touching),
 * so its formula is a constant rather than a function of the run.
 */
const GEOMETRIC_BOUND: Partial<Record<ColumnKey, (ctx: ReportContext) => number>> = Object.freeze({
  robotPathM: (ctx: ReportContext): number => ctx.straightLineM,
  robotArrivalS: (ctx: ReportContext): number => ctx.straightLineArrivalS,
  minClearanceM: (): number => 0,
});

/**
 * The number a headline column's zero-reference resolves to, at this context.
 *
 * `ZeroReference` (columns.ts) carries only the phrase a reader sees, never a value or a formula
 * — a `how` string cannot compute anything, and the column key is what tells this function which
 * formula applies. `exactZero` is genuinely generic: every `exactZero` column's own "how" text
 * promises a literal 0 in that column's unit, so no column-specific arithmetic is needed there.
 * `geometricBound` is not: `robotPathM` and `minClearanceM` share the same `zero.kind` but resolve
 * to different numbers (a ~17 m straight line for one, a literal 0 for the other), so this
 * dispatches on the column itself rather than only on `reference.kind`.
 *
 * Repeated by name in a future ledger table, which will resolve a companion column out of a row's
 * aggregates rather than out of a single run's readings — the two will read the same but will not
 * share a body, the same way the band gauge and a headline reading are both "the same number,
 * read two ways" without being one function.
 */
export function resolveZero(
  column: ColumnKey,
  ctx: ReportContext,
  readings: Readonly<Partial<Record<ColumnKey, Reading>>>,
): number {
  const reference = COLUMNS[column].zero;
  if (reference.kind === "exactZero") {
    return 0;
  }
  if (reference.kind === "geometricBound") {
    const bound = GEOMETRIC_BOUND[column];
    if (bound === undefined) {
      fail(`no geometric-bound formula is registered for column '${String(column)}'`);
    }
    return bound(ctx);
  }
  if (reference.kind === "companionColumn") {
    const companion = readings[reference.column];
    if (companion === undefined) {
      return Number.NaN;
    }
    return companion.value;
  }
  if (reference.kind === "notAPerturbation") {
    return Number.NaN;
  }
  return fail(`unhandled zero-reference kind for column '${String(column)}'`);
}

/**
 * Whether a headline column can honestly become a tile from a preview alone.
 *
 * A defined reading is not sufficient by itself. `worstMomentM` needs only "run" and its own
 * reading is always measured in a preview, but its zero-reference is a companion column,
 * `worstMomentNullM`, which needs the run-to-run band — never bought by a preview. Rendering
 * `worstMomentM`'s tile from `resolveZero` would then hand `zeroRenderingFor` a NaN for a
 * reference that is not `notAPerturbation`, which is exactly the contract `zeroRenderingFor`
 * exists to refuse: it throws rather than show a number with no zero beside it. Checking only
 * `readings[column] !== undefined`, as `runToRunBandM` needs, is not enough to catch this one —
 * the two must be checked together, which is what left this uncaught until `boot.test.ts` first
 * booted the real page and threw.
 */
export function isRenderable(
  column: ColumnKey,
  ctx: ReportContext,
  readings: Readonly<Partial<Record<ColumnKey, Reading>>>,
): boolean {
  if (readings[column] === undefined) {
    return false;
  }
  const reference = COLUMNS[column].zero;
  if (reference.kind === "notAPerturbation") {
    return true;
  }
  return Number.isFinite(resolveZero(column, ctx, readings));
}
