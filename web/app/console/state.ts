import { fail } from "../../engine/core/errors.js";
import type { RunConfigOverrides } from "../../engine/contracts/config.js";
import { AXES, AXIS_ORDER, type AxisKey } from "../../engine/job/axes.js";
import { COLUMNS, COLUMN_ORDER, type ColumnKey } from "../../engine/job/columns.js";
import {
  BASE_SEED,
  SEED_STRIDE,
  makeSweepJob,
  type MeasurementParams,
  type SweepJob,
} from "../../engine/job/spec.js";

/**
 * Everything the console knows, as frozen records with no behaviour in them.
 *
 * This file is where a slider's clamp becomes a contract check. The panel will clamp on the way
 * in, but a permalink is a hand-editable string and nobody has to go through the panel at all, so
 * `makeConsoleSettings` is the last line of defence and it throws rather than coerces.
 *
 * It is deliberately NOT the last line of defence for everything. Whether 18.3 people is a legal
 * crowd is `makeRunConfig`'s question, and it is asked before the first simulation because
 * `makeSweepJob` walks the whole grid. Duplicating that here would give the two checks somewhere
 * to disagree.
 *
 * `ConsoleSettings` carries no room width or height. The axis catalogue in `axes.ts` (13 axes,
 * `AXIS_ORDER`) has no entry that writes `widthM` or `heightM` — the wireframe's "Room width"
 * slider is not a catalogued axis yet — so there is no settings field here for a bad value to
 * hide in, and nothing in this file constructs a `RunConfigOverrides` that touches room
 * dimensions. `baseOverridesFor` only ever changes `pedestriansSeeRobot` and whatever the world
 * axes in the catalogue write, and the default room (22 m by 13 m, goal at (20, 6.5)) is never
 * altered by anything built here, so the goal-in-room check in `makeRunConfig` cannot fire from
 * this file's own output today. Wiring an actual width control is Task 24's control panel; when
 * it lands, either the catalogue grows a `roomWidth` axis (validated the same way every other
 * axis is, above) or the control panel becomes the place that catches the combination before it
 * reaches `makeRunConfig` — but that decision belongs to whichever task adds the slider, not to
 * this one, which has nothing to clamp.
 *
 * Validation messages below quote the axis's human `label` ("How many people are in the room"),
 * not a dotted code path (`crowd.nPedestrians`) the way `config.ts` does. That is a deliberate
 * departure from `config.ts`'s house voice, not an oversight: `config.ts`'s messages are
 * engine-facing, read by whoever is debugging a `RunConfig`, while these are reader-facing —
 * guardrail 12 forbids a bare code identifier on any surface a reader sees, and a permalink
 * validation error is exactly such a surface.
 */

/** Only used when an axis catalogue somehow omits the forecast axes; the axes overwrite both. */
const SEED_FORECAST_HORIZON_STEPS = 60;
const SEED_FORECAST_END_STEP = 200;

/** Not panel controls. Two floors computed at different strides are not comparable, so the
 *  numbers are named here once rather than typed at each call. */
const FLOOR_SPLITS = 200;
const FLOOR_ALPHA = 0.05;
const FLOOR_STRIDE_STEPS = 20;

export interface ConsoleSettings {
  readonly kind: "consoleSettings";
  /** Every knob in the catalogue, at its panel position. One table, so the panel and the sweep
   *  picker cannot drift. */
  readonly axisValues: Readonly<Record<AxisKey, number>>;
  readonly pedestriansSeeRobot: boolean;
  readonly nearMissThresholdM: number;
  readonly recoveryToleranceFraction: number;
  readonly recoveryDwellSteps: number;
  readonly sweepAxis: AxisKey | null;
  readonly sweepValues: readonly number[];
  readonly seedCount: number;
  /** 0 means the band was not bought. Otherwise the replicate count, which rides on the cell. */
  readonly bandReplicates: number;
  readonly withFloor: boolean;
  readonly withFrechet: boolean;
  readonly withZeroReference: boolean;
}

export interface ConsoleSettingsInit {
  kind?: "consoleSettings";
  axisValues: Readonly<Record<AxisKey, number>>;
  pedestriansSeeRobot: boolean;
  nearMissThresholdM: number;
  recoveryToleranceFraction: number;
  recoveryDwellSteps: number;
  sweepAxis: AxisKey | null;
  sweepValues: readonly number[];
  seedCount: number;
  bandReplicates: number;
  withFloor: boolean;
  withFrechet: boolean;
  withZeroReference: boolean;
}

export function makeConsoleSettings(init: ConsoleSettingsInit): ConsoleSettings {
  const axisValues: Record<AxisKey, number> = { ...init.axisValues };
  for (const key of AXIS_ORDER) {
    const entry = AXES[key];
    const value = axisValues[key];
    if (!Number.isFinite(value)) {
      fail(`${entry.label} must be a number, got ${String(value)}`);
    }
    if (value < entry.min) {
      fail(
        `${entry.label} must be at least ${String(entry.min)}, got ${String(value)}`,
      );
    }
    if (value > entry.max) {
      fail(`${entry.label} must be at most ${String(entry.max)}, got ${String(value)}`);
    }
  }

  if (!Number.isFinite(init.nearMissThresholdM) || init.nearMissThresholdM <= 0) {
    fail(
      `The near-miss line must be a distance greater than zero, got ` +
        `${String(init.nearMissThresholdM)}`,
    );
  }
  if (init.nearMissThresholdM > 5) {
    fail(
      `The near-miss line must be at most 5 metres, because a wider line counts the whole room ` +
        `as a near miss, got ${String(init.nearMissThresholdM)}`,
    );
  }
  if (
    !Number.isFinite(init.recoveryToleranceFraction) ||
    init.recoveryToleranceFraction <= 0 ||
    init.recoveryToleranceFraction > 1
  ) {
    fail(
      `The recovery tolerance must be a fraction above zero and at most one, got ` +
        `${String(init.recoveryToleranceFraction)}`,
    );
  }
  if (!Number.isInteger(init.recoveryDwellSteps) || init.recoveryDwellSteps < 1) {
    fail(
      `The recovery dwell must be a whole number of steps, at least one, got ` +
        `${String(init.recoveryDwellSteps)}`,
    );
  }
  if (init.recoveryDwellSteps > 400) {
    fail(
      `The recovery dwell must be at most 400 steps, which is half the longest episode, got ` +
        `${String(init.recoveryDwellSteps)}`,
    );
  }

  const sweepValues: number[] = [];
  for (const value of init.sweepValues) {
    sweepValues.push(value);
  }

  if (init.sweepAxis === null) {
    if (sweepValues.length > 0) {
      fail(
        `Nothing is being varied, so there is nothing for ${String(sweepValues.length)} values ` +
          `to be values of`,
      );
    }
  } else {
    // `init.sweepAxis` is typed `AxisKey`, but a permalink is decoded from a stranger's query
    // string, so a caller can hand this a string that is not actually a member of `AXES`. Without
    // this guard, the lookup below silently returns `undefined` (`AXES` is a finite Record, not an
    // index signature, so `noUncheckedIndexedAccess` does not add `| undefined` to its type) and
    // `entry.label` throws a raw `TypeError` — a crash wearing a different name, not the
    // `ContractError` this whole file promises to throw instead of coercing or crashing.
    let sweepAxisIsKnown = false;
    for (const key of AXIS_ORDER) {
      if (key === init.sweepAxis) {
        sweepAxisIsKnown = true;
      }
    }
    if (!sweepAxisIsKnown) {
      fail(
        `The sweep axis must be one of the catalogue's knobs (${AXIS_ORDER.join(", ")}), got ` +
          `'${String(init.sweepAxis)}'`,
      );
    }
    const entry = AXES[init.sweepAxis];
    if (sweepValues.length < 1) {
      fail(`${entry.label} is being varied, so it needs at least one value to vary over`);
    }
    let previous: number | null = null;
    for (const value of sweepValues) {
      if (!Number.isFinite(value)) {
        fail(`Every value ${entry.label} is varied over must be a number, got ${String(value)}`);
      }
      if (value < entry.min || value > entry.max) {
        fail(
          `${entry.label} is varied over ${String(value)}, which is outside the range ` +
            `${String(entry.min)} to ${String(entry.max)}`,
        );
      }
      if (previous !== null && value <= previous) {
        fail(
          `The values ${entry.label} is varied over must climb, so the curve reads left to ` +
            `right, got ${String(previous)} then ${String(value)}`,
        );
      }
      previous = value;
    }
  }

  if (!Number.isInteger(init.seedCount) || init.seedCount < 1) {
    fail(`The number of seeds must be a whole number, at least one, got ${String(init.seedCount)}`);
  }
  if (init.seedCount > 32) {
    fail(`The number of seeds is capped at 32, got ${String(init.seedCount)}`);
  }

  if (!Number.isInteger(init.bandReplicates) || init.bandReplicates < 0) {
    fail(
      `The number of band replicates must be a whole number, or zero for no band, got ` +
        `${String(init.bandReplicates)}`,
    );
  }
  if (init.bandReplicates === 1) {
    fail(
      `A band is a percentile over comparisons between pairs of runs, so one replicate has ` +
        `nothing to compare against; use zero for no band, or two or more`,
    );
  }
  if (init.bandReplicates > 32) {
    fail(`The number of band replicates is capped at 32, got ${String(init.bandReplicates)}`);
  }

  return Object.freeze({
    kind: "consoleSettings" as const,
    axisValues: Object.freeze(axisValues),
    pedestriansSeeRobot: init.pedestriansSeeRobot,
    nearMissThresholdM: init.nearMissThresholdM,
    recoveryToleranceFraction: init.recoveryToleranceFraction,
    recoveryDwellSteps: init.recoveryDwellSteps,
    sweepAxis: init.sweepAxis,
    sweepValues: Object.freeze(sweepValues),
    seedCount: init.seedCount,
    bandReplicates: init.bandReplicates,
    withFloor: init.withFloor,
    withFrechet: init.withFrechet,
    withZeroReference: init.withZeroReference,
  });
}

function defaultAxisValues(): Record<AxisKey, number> {
  const values: Partial<Record<AxisKey, number>> = {};
  for (const key of AXIS_ORDER) {
    values[key] = AXES[key].defaultValue;
  }
  return values as Record<AxisKey, number>;
}

export const DEFAULT_SETTINGS: ConsoleSettings = makeConsoleSettings({
  axisValues: defaultAxisValues(),
  pedestriansSeeRobot: true,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.1,
  recoveryDwellSteps: 20,
  sweepAxis: null,
  sweepValues: [],
  seedCount: 1,
  bandReplicates: 8,
  withFloor: false,
  withFrechet: false,
  withZeroReference: true,
});

export function baseOverridesFor(settings: ConsoleSettings): RunConfigOverrides {
  let overrides: RunConfigOverrides = { pedestriansSeeRobot: settings.pedestriansSeeRobot };
  for (const key of AXIS_ORDER) {
    const entry = AXES[key];
    if (entry.kind !== "worldAxis") {
      continue;
    }
    overrides = entry.apply(overrides, settings.axisValues[key]);
  }
  return Object.freeze(overrides);
}

export function measurementParamsFor(settings: ConsoleSettings): MeasurementParams {
  // `forecastHorizon` and `forecastWindowEnd` are catalogued as measurement axes in seconds
  // (Task 14): `forecastHorizon` defaults to 3 s, `forecastWindowEnd` to 10 s. Both axes' own
  // `apply` converts seconds to ticks by dividing by `DEFAULT_CONFIG.dt` (0.05 s), which is where
  // 3 s becomes `forecastHorizonSteps: 60` and 10 s becomes `forecastEndStep: 200` below — the
  // seconds-at-the-panel, ticks-in-`MeasurementParams` conversion happens once, inside those two
  // `apply` functions, and nowhere else in this file. The seed constants below exist only so this
  // function still returns a valid ruler if the catalogue ever stopped carrying one of those two
  // axes; today it carries both, so the loop always overwrites them and the seeds are dead code
  // in the common case by design, not by accident.
  let params: MeasurementParams = {
    kind: "measurementParams",
    forecastHorizonSteps: SEED_FORECAST_HORIZON_STEPS,
    forecastEndStep: SEED_FORECAST_END_STEP,
    nearMissThresholdM: settings.nearMissThresholdM,
    recoveryToleranceFraction: settings.recoveryToleranceFraction,
    recoveryDwellSteps: settings.recoveryDwellSteps,
  };
  for (const key of AXIS_ORDER) {
    const entry = AXES[key];
    if (entry.kind !== "measurementAxis") {
      continue;
    }
    params = entry.apply(params, settings.axisValues[key]);
  }
  return Object.freeze(params);
}

/**
 * Every boolean here names a run this job is actually buying, never a settings flag read on the
 * side. `hasZeroRun` in particular must be the caller's own `zeroReferenceRun` decision, not
 * `settings.withZeroReference` read directly: `jobForPreview` always buys the zero-effect
 * reference run regardless of the panel's toggle (see its own doc comment), and reading the
 * settings flag here instead once meant the preview paid for that run and then silently omitted
 * `forecastZeroM` from what it reported — it paid and did not deliver. Threading the same boolean
 * both places is what keeps `zeroReferenceRun` and "does `forecastZeroM` appear in `columns`"
 * unable to disagree.
 */
function columnsFor(
  hasBand: boolean,
  hasFloor: boolean,
  hasFrechet: boolean,
  hasZeroRun: boolean,
): readonly ColumnKey[] {
  const chosen: ColumnKey[] = [];
  for (const key of COLUMN_ORDER) {
    const descriptor = COLUMNS[key];
    if (descriptor.needs === "run") {
      // Cheap columns are always reported: all six composers together are 3.4 ms against a 38 ms
      // paired run, so the picker hides a column rather than gating it, and ticking one after a
      // Run fills it in without re-running.
      chosen.push(key);
      continue;
    }
    if (descriptor.needs === "zeroRun" && hasZeroRun) {
      chosen.push(key);
      continue;
    }
    if (descriptor.needs === "band" && hasBand) {
      chosen.push(key);
      continue;
    }
    if (descriptor.needs === "floor" && hasFloor) {
      chosen.push(key);
      continue;
    }
    if (descriptor.needs === "frechet" && hasFrechet) {
      chosen.push(key);
    }
  }
  return Object.freeze(chosen);
}

/**
 * One run, at the settings now in the panel.
 *
 * Never cell zero of the configured sweep. With a people sweep set up, cell zero is four people
 * while the slider reads eighteen, and every tile would describe a room the operator is not
 * looking at. The zero-effect reference run is bought here — one extra paired run, 38 ms — because
 * without it the forecaster's tile reads "not applicable" on first load and the console's central
 * argument is dead before anything is touched. The band is not bought: 267 ms cannot be live, and
 * its gauge reads "not yet measured" rather than showing a floor from other settings.
 */
export function jobForPreview(settings: ConsoleSettings): SweepJob {
  return makeSweepJob({
    base: baseOverridesFor(settings),
    axis: null,
    axisValues: [0],
    seedIndices: [0],
    baseSeed: BASE_SEED,
    seedStride: SEED_STRIDE,
    measurement: measurementParamsFor(settings),
    columns: columnsFor(false, false, false, true),
    bandReplicates: null,
    floor: null,
    zeroReferenceRun: true,
    frechet: false,
  });
}

export function jobForRun(settings: ConsoleSettings): SweepJob {
  const hasBand = settings.bandReplicates > 0;
  const seedIndices: number[] = [];
  for (let index = 0; index < settings.seedCount; index++) {
    seedIndices.push(index);
  }

  const axisValues: number[] = [];
  if (settings.sweepAxis === null) {
    axisValues.push(0);
  } else {
    for (const value of settings.sweepValues) {
      axisValues.push(value);
    }
  }

  return makeSweepJob({
    base: baseOverridesFor(settings),
    axis: settings.sweepAxis,
    axisValues,
    seedIndices,
    baseSeed: BASE_SEED,
    seedStride: SEED_STRIDE,
    measurement: measurementParamsFor(settings),
    columns: columnsFor(hasBand, settings.withFloor, settings.withFrechet, settings.withZeroReference),
    bandReplicates: hasBand ? { n: settings.bandReplicates, scope: "perCell" } : null,
    floor: settings.withFloor
      ? {
          kind: "floorParams",
          nSplits: FLOOR_SPLITS,
          alpha: FLOOR_ALPHA,
          strideSteps: FLOOR_STRIDE_STEPS,
          permutationSeed: BASE_SEED,
        }
      : null,
    zeroReferenceRun: settings.withZeroReference,
    frechet: settings.withFrechet,
  });
}

/*
 * `CellRef`, `BandReading`, `RunGroup`, `ConsoleUi`, `ConsoleState`, `sameSettings`,
 * `STALE_LEDGER_NOTICE` and `ledgerIsStale` used to live here: an earlier, differently-shaped
 * scaffolding for the ledger, built before Task 27 wired `keptGroups` against `web/app/console/
 * group.ts`'s own `RunGroup` (rows, not a stored `settings`/`ConsoleUi` pair) and Task 28 built
 * `web/app/console/table.ts`'s `CellRef`/`settingsMatchJob`/`STALE_MESSAGE` against that. Nothing
 * outside this file's own test ever imported any of the eight names — `group.ts`'s own header
 * comment already flagged this file's `BandReading` as dead when it added `runner.ts`'s `kind`
 * field — so they were deleted rather than kept as a second, disagreeing shape for the same
 * concept sitting unused beside the one the console actually runs on.
 */
