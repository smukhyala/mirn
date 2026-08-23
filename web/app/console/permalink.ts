import { AXES, AXIS_ORDER, type AxisKey } from "../../engine/job/axes.js";
import { DEFAULT_SETTINGS, makeConsoleSettings, type ConsoleSettings } from "./state.js";

/**
 * The link carries the recipe, never the results.
 *
 * Encoding a number would forge it: a URL saying the true effect was 0.352 m asserts a value the
 * current code did not produce, and after a formula changes the old link quotes the old answer
 * with the new page's authority. Determinism is what makes the recipe sufficient — reloading a
 * permalink shows an empty ledger and a primed Run that reproduces the sweep exactly.
 *
 * Decoding never throws. A hand-edited query string is a reader poking at a URL bar, not a
 * programming error, so an unknown key is ignored with a notice and an out-of-range value is
 * brought back into range with a notice. `makeConsoleSettings` still throws if this file ever
 * hands it something illegal, which would be a bug here rather than in the link.
 *
 * Numbers are written with `String`, which produces the shortest text that reads back as the
 * identical double, so the round trip is exact rather than approximately exact.
 */

export const AXIS_QUERY_KEY: Readonly<Record<AxisKey, string>> = Object.freeze({
  pushStrength: "space",
  crowdSize: "people",
  holdingLine: "hold_line",
  crowdFidget: "fidget",
  walkingPace: "pace",
  robotSpeed: "robot_speed",
  reactionTime: "reaction",
  politeness: "berth",
  perceptionError: "mis_sees",
  passingOffset: "offset",
  episodeSeconds: "episode",
  forecastHorizon: "horizon",
  forecastWindowEnd: "window_end",
});

const NOTICE_ROBOT = "notice";
const NEAR_MISS = "near_miss";
const RECOVERY_TOLERANCE = "recovery_tol";
const RECOVERY_DWELL = "recovery_dwell";
const VARY = "vary";
const VALUES = "values";
const SEEDS = "seeds";
const BAND = "band";
const FLOOR = "floor";
const FRECHET = "frechet";
const ZERO = "zero";

export const SETTING_QUERY_KEYS: readonly string[] = Object.freeze([
  NOTICE_ROBOT,
  NEAR_MISS,
  RECOVERY_TOLERANCE,
  RECOVERY_DWELL,
  VARY,
  VALUES,
  SEEDS,
  BAND,
  FLOOR,
  FRECHET,
  ZERO,
]);

export function encodeSettings(settings: ConsoleSettings): string {
  const parts: string[] = [];
  for (const key of AXIS_ORDER) {
    parts.push(`${AXIS_QUERY_KEY[key]}=${String(settings.axisValues[key])}`);
  }
  parts.push(`${NOTICE_ROBOT}=${settings.pedestriansSeeRobot ? "1" : "0"}`);
  parts.push(`${NEAR_MISS}=${String(settings.nearMissThresholdM)}`);
  parts.push(`${RECOVERY_TOLERANCE}=${String(settings.recoveryToleranceFraction)}`);
  parts.push(`${RECOVERY_DWELL}=${String(settings.recoveryDwellSteps)}`);

  if (settings.sweepAxis !== null) {
    parts.push(`${VARY}=${AXIS_QUERY_KEY[settings.sweepAxis]}`);
    const values: string[] = [];
    for (const value of settings.sweepValues) {
      values.push(String(value));
    }
    // A comma is legal unencoded in a query string, and a readable link is worth keeping.
    parts.push(`${VALUES}=${values.join(",")}`);
  }

  parts.push(`${SEEDS}=${String(settings.seedCount)}`);
  parts.push(`${BAND}=${String(settings.bandReplicates)}`);
  parts.push(`${FLOOR}=${settings.withFloor ? "1" : "0"}`);
  parts.push(`${FRECHET}=${settings.withFrechet ? "1" : "0"}`);
  parts.push(`${ZERO}=${settings.withZeroReference ? "1" : "0"}`);
  return parts.join("&");
}

export interface DecodeResult {
  readonly kind: "decodeResult";
  readonly settings: ConsoleSettings;
  readonly notices: readonly string[];
}

function readFlag(
  params: URLSearchParams,
  name: string,
  fallback: boolean,
  label: string,
  notices: string[],
): boolean {
  const raw = params.get(name);
  if (raw === null) {
    return fallback;
  }
  if (raw === "1") {
    return true;
  }
  if (raw === "0") {
    return false;
  }
  notices.push(
    `${label} was written in the link as something that is neither on nor off, so it was left ` +
      `as it was.`,
  );
  return fallback;
}

/**
 * `readBounded`'s field description, gathered into one record rather than six positional
 * parameters. Several of those (`low`, `high`, `fallback`) share a type, and a review flagged the
 * positional form as an invitation to transpose two of them on a future edit; no call site had
 * actually done so, but there was nothing stopping one.
 */
interface BoundedFieldSpec {
  readonly name: string;
  readonly fallback: number;
  readonly low: number;
  readonly high: number;
  readonly wholeNumber: boolean;
  readonly label: string;
}

function readBounded(params: URLSearchParams, spec: BoundedFieldSpec, notices: string[]): number {
  const raw = params.get(spec.name);
  if (raw === null) {
    return spec.fallback;
  }
  const parsed = Number(raw);
  if (raw.length === 0 || !Number.isFinite(parsed)) {
    notices.push(
      `${spec.label} was not a number in the link, so it was left at ${String(spec.fallback)}.`,
    );
    return spec.fallback;
  }
  let value = parsed;
  if (spec.wholeNumber) {
    value = Math.round(value);
  }
  if (value < spec.low) {
    notices.push(
      `${spec.label} was ${String(parsed)} in the link, below the lowest this bench allows, so ` +
        `it was brought up to ${String(spec.low)}.`,
    );
    return spec.low;
  }
  if (value > spec.high) {
    notices.push(
      `${spec.label} was ${String(parsed)} in the link, above the highest this bench allows, so ` +
        `it was brought down to ${String(spec.high)}.`,
    );
    return spec.high;
  }
  return value;
}

export function decodeSettings(query: string): DecodeResult {
  const trimmed = query.startsWith("?") ? query.slice(1) : query;
  const params = new URLSearchParams(trimmed);
  const notices: string[] = [];

  const known = new Set<string>();
  for (const key of AXIS_ORDER) {
    known.add(AXIS_QUERY_KEY[key]);
  }
  for (const name of SETTING_QUERY_KEYS) {
    known.add(name);
  }
  const alreadyReported = new Set<string>();
  for (const name of params.keys()) {
    if (!known.has(name) && !alreadyReported.has(name)) {
      alreadyReported.add(name);
      notices.push(
        `The link carried a setting this bench does not have, written as "${name}". It was ignored.`,
      );
    }
  }

  const axisValues: Record<AxisKey, number> = { ...DEFAULT_SETTINGS.axisValues };
  for (const key of AXIS_ORDER) {
    const entry = AXES[key];
    const raw = params.get(AXIS_QUERY_KEY[key]);
    if (raw === null) {
      continue;
    }
    const parsed = Number(raw);
    if (raw.length === 0 || !Number.isFinite(parsed)) {
      notices.push(
        `${entry.label} was not a number in the link, so it was left at ` +
          `${String(entry.defaultValue)}.`,
      );
      continue;
    }
    if (parsed < entry.min) {
      notices.push(
        `${entry.label} was ${String(parsed)} in the link, below the lowest this bench allows, ` +
          `so it was brought up to ${String(entry.min)}.`,
      );
      axisValues[key] = entry.min;
      continue;
    }
    if (parsed > entry.max) {
      notices.push(
        `${entry.label} was ${String(parsed)} in the link, above the highest this bench allows, ` +
          `so it was brought down to ${String(entry.max)}.`,
      );
      axisValues[key] = entry.max;
      continue;
    }
    axisValues[key] = parsed;
  }

  let sweepAxis: AxisKey | null = null;
  const varyRaw = params.get(VARY);
  if (varyRaw !== null) {
    for (const key of AXIS_ORDER) {
      if (AXIS_QUERY_KEY[key] === varyRaw) {
        sweepAxis = key;
      }
    }
    if (sweepAxis === null) {
      notices.push(
        `The link asked to vary something this bench cannot vary, written as "${varyRaw}". ` +
          `Nothing is being varied.`,
      );
    }
  }

  const sweepValues: number[] = [];
  if (sweepAxis !== null) {
    const entry = AXES[sweepAxis];
    const valuesRaw = params.get(VALUES);
    const gathered: number[] = [];
    if (valuesRaw !== null) {
      for (const piece of valuesRaw.split(",")) {
        const parsed = Number(piece);
        if (piece.length === 0 || !Number.isFinite(parsed)) {
          notices.push(
            `One of the values to vary ${entry.label.toLowerCase()} over was not a number, so ` +
              `it was dropped.`,
          );
          continue;
        }
        let value = parsed;
        if (value < entry.min) {
          notices.push(
            `One of the values to vary ${entry.label.toLowerCase()} over was ${String(parsed)}, ` +
              `below the lowest this bench allows, so it was brought up to ${String(entry.min)}.`,
          );
          value = entry.min;
        }
        if (value > entry.max) {
          notices.push(
            `One of the values to vary ${entry.label.toLowerCase()} over was ${String(parsed)}, ` +
              `above the highest this bench allows, so it was brought down to ` +
              `${String(entry.max)}.`,
          );
          value = entry.max;
        }
        gathered.push(value);
      }
    }
    gathered.sort((a, b) => a - b);
    for (const value of gathered) {
      const last = sweepValues[sweepValues.length - 1];
      if (last !== undefined && last === value) {
        notices.push(
          `Two of the values to vary ${entry.label.toLowerCase()} over ended up the same once ` +
            `they were brought into range, so one was dropped.`,
        );
        continue;
      }
      sweepValues.push(value);
    }
    if (sweepValues.length === 0) {
      notices.push(
        `The link asked to vary ${entry.label.toLowerCase()} but gave no usable values, so ` +
          `nothing is being varied.`,
      );
      sweepAxis = null;
    }
  }

  const pedestriansSeeRobot = readFlag(
    params,
    NOTICE_ROBOT,
    DEFAULT_SETTINGS.pedestriansSeeRobot,
    "Whether the people notice the robot",
    notices,
  );
  const nearMissThresholdM = readBounded(
    params,
    {
      name: NEAR_MISS,
      fallback: DEFAULT_SETTINGS.nearMissThresholdM,
      low: 0.05,
      high: 5,
      wholeNumber: false,
      label: "The near-miss line",
    },
    notices,
  );
  const recoveryToleranceFraction = readBounded(
    params,
    {
      name: RECOVERY_TOLERANCE,
      fallback: DEFAULT_SETTINGS.recoveryToleranceFraction,
      low: 0.01,
      high: 1,
      wholeNumber: false,
      label: "The recovery tolerance",
    },
    notices,
  );
  const recoveryDwellSteps = readBounded(
    params,
    {
      name: RECOVERY_DWELL,
      fallback: DEFAULT_SETTINGS.recoveryDwellSteps,
      low: 1,
      high: 400,
      wholeNumber: true,
      label: "The recovery dwell",
    },
    notices,
  );
  const seedCount = readBounded(
    params,
    {
      name: SEEDS,
      fallback: DEFAULT_SETTINGS.seedCount,
      low: 1,
      high: 32,
      wholeNumber: true,
      label: "The number of seeds",
    },
    notices,
  );

  let bandReplicates = readBounded(
    params,
    {
      name: BAND,
      fallback: DEFAULT_SETTINGS.bandReplicates,
      low: 0,
      high: 32,
      wholeNumber: true,
      label: "The number of band replicates",
    },
    notices,
  );
  if (bandReplicates === 1) {
    notices.push(
      `The link asked for a single band replicate, which has nothing to compare against, so the ` +
        `ordinary difference between two runs is not being measured.`,
    );
    bandReplicates = 0;
  }

  const withFloor = readFlag(params, FLOOR, DEFAULT_SETTINGS.withFloor, "The detection floor", notices);
  const withFrechet = readFlag(params, FRECHET, DEFAULT_SETTINGS.withFrechet, "The Frechet ruler", notices);
  const withZeroReference = readFlag(
    params,
    ZERO,
    DEFAULT_SETTINGS.withZeroReference,
    "The zero-effect reference run",
    notices,
  );

  const settings = makeConsoleSettings({
    axisValues,
    pedestriansSeeRobot,
    nearMissThresholdM,
    recoveryToleranceFraction,
    recoveryDwellSteps,
    sweepAxis,
    sweepValues,
    seedCount,
    bandReplicates,
    withFloor,
    withFrechet,
    withZeroReference,
  });

  return Object.freeze({
    kind: "decodeResult" as const,
    settings,
    notices: Object.freeze(notices),
  });
}
