import { AXES, AXIS_ORDER, type AxisKey } from "../../engine/job/axes.js";
import { CARD_ORDER, type CardKey } from "../../engine/job/cards.js";
import type { UnitKey } from "../../engine/job/columns.js";
import { unitLabel } from "../../ui/labels.js";
import type { DrillState } from "./drill.js";
import { DEFAULT_SETTINGS, makeConsoleSettings, type ConsoleSettings } from "./state.js";

/**
 * The link carries the recipe, never the results.
 *
 * Encoding a number would forge it: a URL saying the true effect was 0.352 m asserts a value the
 * current code did not produce, and after a formula changes the old link quotes the old answer
 * with the new page's authority. Determinism is what makes the recipe sufficient — reloading a
 * permalink shows an empty ledger and a primed Run that reproduces the sweep exactly.
 *
 * Both halves are wired. `encodeSettings` is what the Copy-link button writes into the address
 * bar; `decodeSettings` is what `web/console.ts` reads out of `window.location.search` before it
 * mounts the panel, so a link opens at its own settings rather than at the defaults. A link whose
 * settings the panel cannot actually take is not silently rounded off either: `settingsNotHonoured`
 * below compares what was asked for against what the mounted panel reads back, and the console
 * prints the difference.
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

interface SettingDescriptor {
  readonly label: string;
  readonly unit: UnitKey;
}

/**
 * One spelling, and one unit, per setting, for every sentence this file writes about one.
 *
 * The decoder's own notices and `settingsNotHonoured`'s both name these things to a reader, and
 * two hand-written spellings of "the recovery dwell" would eventually disagree. Guardrail 12
 * forbids the query key itself reaching a reader, so `recovery_dwell` is never what is printed.
 *
 * `unit` exists so a number this file prints never stands alone — `describeQuantity` reads it the
 * same way `panel.ts` reads an axis's `unit` for its own readout. A setting with nothing physical
 * to say (a fraction, a flag, a count of things with no further noun) is `"none"` or `"count"`,
 * which `unitLabel` renders as nothing rather than as an invented word.
 */
const SETTING = Object.freeze({
  pedestriansSeeRobot: Object.freeze({
    label: "Whether the people notice the robot",
    unit: "none" as const,
  }),
  nearMissThresholdM: Object.freeze({ label: "The near-miss line", unit: "metres" as const }),
  recoveryToleranceFraction: Object.freeze({
    label: "The recovery tolerance",
    unit: "none" as const,
  }),
  recoveryDwellSteps: Object.freeze({ label: "The recovery dwell", unit: "count" as const }),
  seedCount: Object.freeze({ label: "The number of crowds", unit: "count" as const }),
  bandReplicates: Object.freeze({
    label: "The number of band replicates",
    unit: "count" as const,
  }),
  withFloor: Object.freeze({ label: "The detection floor", unit: "none" as const }),
  withFrechet: Object.freeze({ label: "The walked-together ruler", unit: "none" as const }),
  withZeroReference: Object.freeze({
    label: "The zero-effect reference run",
    unit: "none" as const,
  }),
  sweepAxis: Object.freeze({ label: "The setting being varied", unit: "none" as const }),
  sweepValues: Object.freeze({ label: "The values it is varied over", unit: "none" as const }),
}) satisfies Readonly<Record<string, SettingDescriptor>>;

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
 * A label written for the START of a sentence ("The near-miss line"), read into the MIDDLE of one
 * ("asked for the near-miss line to be…").
 *
 * Every label in this file is written once, for standalone display, so it opens with a capital.
 * Splicing it into running prose unchanged capitalises a word mid-sentence; lower-casing the whole
 * string is the wrong fix, because a future label is free to carry a genuine proper noun or
 * acronym after its first word, and `"the GPS antenna".toLowerCase()` would quietly wreck it. Only
 * the first character is ever a sentence-position artefact, so only the first character moves.
 */
function midSentence(label: string): string {
  if (label.length === 0) {
    return label;
  }
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * A number with its unit, the way `panel.ts` prints one beside a slider — never a bare number.
 *
 * `unitLabel` returns `""` for a setting with nothing physical to say (a fraction, a count of
 * things with no further noun), and this omits the trailing space in exactly that case rather than
 * leaving one dangling.
 */
function describeQuantity(value: number, unit: UnitKey): string {
  const suffix = unitLabel(unit);
  if (suffix.length === 0) {
    return String(value);
  }
  return `${String(value)} ${suffix}`;
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
  readonly unit: UnitKey;
}

function readBounded(params: URLSearchParams, spec: BoundedFieldSpec, notices: string[]): number {
  const raw = params.get(spec.name);
  if (raw === null) {
    return spec.fallback;
  }
  const parsed = Number(raw);
  if (raw.length === 0 || !Number.isFinite(parsed)) {
    notices.push(
      `${spec.label} was not a number in the link, so it was left at ` +
        `${describeQuantity(spec.fallback, spec.unit)}.`,
    );
    return spec.fallback;
  }
  let value = parsed;
  if (spec.wholeNumber) {
    value = Math.round(value);
  }
  if (value < spec.low) {
    notices.push(
      `${spec.label} was ${describeQuantity(parsed, spec.unit)} in the link, below the lowest ` +
        `this bench allows, so it was brought up to ${describeQuantity(spec.low, spec.unit)}.`,
    );
    return spec.low;
  }
  if (value > spec.high) {
    notices.push(
      `${spec.label} was ${describeQuantity(parsed, spec.unit)} in the link, above the highest ` +
        `this bench allows, so it was brought down to ${describeQuantity(spec.high, spec.unit)}.`,
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
          `${describeQuantity(entry.defaultValue, entry.unit)}.`,
      );
      continue;
    }
    if (parsed < entry.min) {
      notices.push(
        `${entry.label} was ${describeQuantity(parsed, entry.unit)} in the link, below the ` +
          `lowest this bench allows, so it was brought up to ` +
          `${describeQuantity(entry.min, entry.unit)}.`,
      );
      axisValues[key] = entry.min;
      continue;
    }
    if (parsed > entry.max) {
      notices.push(
        `${entry.label} was ${describeQuantity(parsed, entry.unit)} in the link, above the ` +
          `highest this bench allows, so it was brought down to ` +
          `${describeQuantity(entry.max, entry.unit)}.`,
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
            `One of the values to vary ${midSentence(entry.label)} over was not a number, so ` +
              `it was dropped.`,
          );
          continue;
        }
        let value = parsed;
        if (value < entry.min) {
          notices.push(
            `One of the values to vary ${midSentence(entry.label)} over was ` +
              `${describeQuantity(parsed, entry.unit)}, below the lowest this bench allows, so ` +
              `it was brought up to ${describeQuantity(entry.min, entry.unit)}.`,
          );
          value = entry.min;
        }
        if (value > entry.max) {
          notices.push(
            `One of the values to vary ${midSentence(entry.label)} over was ` +
              `${describeQuantity(parsed, entry.unit)}, above the highest this bench allows, so ` +
              `it was brought down to ${describeQuantity(entry.max, entry.unit)}.`,
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
          `Two of the values to vary ${midSentence(entry.label)} over ended up the same once ` +
            `they were brought into range, so one was dropped.`,
        );
        continue;
      }
      sweepValues.push(value);
    }
    if (sweepValues.length === 0) {
      notices.push(
        `The link asked to vary ${midSentence(entry.label)} but gave no usable values, so ` +
          `nothing is being varied.`,
      );
      sweepAxis = null;
    }
  }

  const pedestriansSeeRobot = readFlag(
    params,
    NOTICE_ROBOT,
    DEFAULT_SETTINGS.pedestriansSeeRobot,
    SETTING.pedestriansSeeRobot.label,
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
      label: SETTING.nearMissThresholdM.label,
      unit: SETTING.nearMissThresholdM.unit,
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
      label: SETTING.recoveryToleranceFraction.label,
      unit: SETTING.recoveryToleranceFraction.unit,
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
      label: SETTING.recoveryDwellSteps.label,
      unit: SETTING.recoveryDwellSteps.unit,
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
      label: SETTING.seedCount.label,
      unit: SETTING.seedCount.unit,
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
      label: SETTING.bandReplicates.label,
      unit: SETTING.bandReplicates.unit,
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

  const withFloor = readFlag(
    params,
    FLOOR,
    DEFAULT_SETTINGS.withFloor,
    SETTING.withFloor.label,
    notices,
  );
  const withFrechet = readFlag(
    params,
    FRECHET,
    DEFAULT_SETTINGS.withFrechet,
    SETTING.withFrechet.label,
    notices,
  );
  const withZeroReference = readFlag(
    params,
    ZERO,
    DEFAULT_SETTINGS.withZeroReference,
    SETTING.withZeroReference.label,
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

/**
 * Two numbers are the same setting.
 *
 * `String` writes the shortest text that reads back as the identical double, so a value that
 * survives a control untouched comes back bit for bit. What does not is a value the browser
 * snapped: a range input rounds to its own notches, and the rounding arithmetic can land a
 * fraction of a last bit away from the notch it aimed at. Exact equality would then report a
 * setting as lost that is in fact exactly where the operator can see it, so the comparison is
 * made at the scale of the numbers rather than at the scale of a double.
 */
function sameSetting(asked: number, applied: number): boolean {
  let scale = 1;
  if (Math.abs(asked) > scale) {
    scale = Math.abs(asked);
  }
  if (Math.abs(applied) > scale) {
    scale = Math.abs(applied);
  }
  return Math.abs(asked - applied) <= 1e-9 * scale;
}

function describeFlag(value: boolean): string {
  return value ? "on" : "off";
}

function sameValues(asked: readonly number[], applied: readonly number[]): boolean {
  if (asked.length !== applied.length) {
    return false;
  }
  for (let i = 0; i < asked.length; i++) {
    const askedValue = asked[i];
    const appliedValue = applied[i];
    if (askedValue === undefined || appliedValue === undefined) {
      return false;
    }
    if (!sameSetting(askedValue, appliedValue)) {
      return false;
    }
  }
  return true;
}

/** A whole sweep, with its axis's unit named once at the end rather than after every value —
 *  "4, 8, 12 people", not "4 people, 8 people, 12 people". */
function describeList(values: readonly number[], unit: UnitKey): string {
  if (values.length === 0) {
    return "nothing";
  }
  const written: string[] = [];
  for (const value of values) {
    written.push(String(value));
  }
  const suffix = unitLabel(unit);
  if (suffix.length === 0) {
    return written.join(", ");
  }
  return `${written.join(", ")} ${suffix}`;
}

/** `label` is written for standalone display and is spliced into running prose here, so it goes
 *  through `midSentence` in exactly one place rather than at every call site. */
function notHonoured(label: string, asked: string, applied: string): string {
  return (
    `The link asked for ${midSentence(label)} to be ${asked}, which no control here can be set ` +
    `to, so it is ${applied}.`
  );
}

/**
 * What the link asked for and the panel could not take.
 *
 * A permalink is a hand-editable string and the panel is a fixed set of controls, so the two can
 * disagree in three ways: a setting with no control at all (the near-miss line, the recovery
 * tolerance and the recovery dwell are decoded and validated but have no slider yet), a control
 * that offers a fixed list (the crowd count), and a slider that snaps to its own notches. Every
 * one of them silently changes a number the operator is about to read, so every one of them is
 * said out loud instead. The comparison is made against what the mounted panel actually reads
 * back, not against a list of fields believed to be uncontrolled, so a control added later stops
 * producing its sentence without anybody having to remember this function exists.
 */
export function settingsNotHonoured(
  asked: ConsoleSettings,
  applied: ConsoleSettings,
): readonly string[] {
  const lines: string[] = [];

  for (const key of AXIS_ORDER) {
    const entry = AXES[key];
    const askedValue = asked.axisValues[key];
    const appliedValue = applied.axisValues[key];
    if (!sameSetting(askedValue, appliedValue)) {
      lines.push(
        notHonoured(
          entry.label,
          describeQuantity(askedValue, entry.unit),
          describeQuantity(appliedValue, entry.unit),
        ),
      );
    }
  }

  if (asked.pedestriansSeeRobot !== applied.pedestriansSeeRobot) {
    lines.push(
      notHonoured(
        SETTING.pedestriansSeeRobot.label,
        describeFlag(asked.pedestriansSeeRobot),
        describeFlag(applied.pedestriansSeeRobot),
      ),
    );
  }
  if (!sameSetting(asked.nearMissThresholdM, applied.nearMissThresholdM)) {
    lines.push(
      notHonoured(
        SETTING.nearMissThresholdM.label,
        describeQuantity(asked.nearMissThresholdM, SETTING.nearMissThresholdM.unit),
        describeQuantity(applied.nearMissThresholdM, SETTING.nearMissThresholdM.unit),
      ),
    );
  }
  if (!sameSetting(asked.recoveryToleranceFraction, applied.recoveryToleranceFraction)) {
    lines.push(
      notHonoured(
        SETTING.recoveryToleranceFraction.label,
        describeQuantity(asked.recoveryToleranceFraction, SETTING.recoveryToleranceFraction.unit),
        describeQuantity(
          applied.recoveryToleranceFraction,
          SETTING.recoveryToleranceFraction.unit,
        ),
      ),
    );
  }
  if (!sameSetting(asked.recoveryDwellSteps, applied.recoveryDwellSteps)) {
    lines.push(
      notHonoured(
        SETTING.recoveryDwellSteps.label,
        describeQuantity(asked.recoveryDwellSteps, SETTING.recoveryDwellSteps.unit),
        describeQuantity(applied.recoveryDwellSteps, SETTING.recoveryDwellSteps.unit),
      ),
    );
  }
  if (asked.sweepAxis !== applied.sweepAxis) {
    const askedName = asked.sweepAxis === null ? "nothing" : AXES[asked.sweepAxis].label;
    const appliedName = applied.sweepAxis === null ? "nothing" : AXES[applied.sweepAxis].label;
    lines.push(notHonoured(SETTING.sweepAxis.label, askedName, appliedName));
  } else if (!sameValues(asked.sweepValues, applied.sweepValues)) {
    // Both sides share `sweepAxis` here (the branch above returns otherwise), and a shared,
    // non-null axis is the only way `sweepValues` can be non-empty — `makeConsoleSettings`
    // forbids values with no axis to vary them over.
    const sweepUnit: UnitKey = asked.sweepAxis === null ? "none" : AXES[asked.sweepAxis].unit;
    lines.push(
      notHonoured(
        SETTING.sweepValues.label,
        describeList(asked.sweepValues, sweepUnit),
        describeList(applied.sweepValues, sweepUnit),
      ),
    );
  }
  if (!sameSetting(asked.seedCount, applied.seedCount)) {
    lines.push(
      notHonoured(
        SETTING.seedCount.label,
        describeQuantity(asked.seedCount, SETTING.seedCount.unit),
        describeQuantity(applied.seedCount, SETTING.seedCount.unit),
      ),
    );
  }
  if (!sameSetting(asked.bandReplicates, applied.bandReplicates)) {
    lines.push(
      notHonoured(
        SETTING.bandReplicates.label,
        describeQuantity(asked.bandReplicates, SETTING.bandReplicates.unit),
        describeQuantity(applied.bandReplicates, SETTING.bandReplicates.unit),
      ),
    );
  }
  if (asked.withFloor !== applied.withFloor) {
    lines.push(
      notHonoured(
        SETTING.withFloor.label,
        describeFlag(asked.withFloor),
        describeFlag(applied.withFloor),
      ),
    );
  }
  if (asked.withFrechet !== applied.withFrechet) {
    lines.push(
      notHonoured(
        SETTING.withFrechet.label,
        describeFlag(asked.withFrechet),
        describeFlag(applied.withFrechet),
      ),
    );
  }
  if (asked.withZeroReference !== applied.withZeroReference) {
    lines.push(
      notHonoured(
        SETTING.withZeroReference.label,
        describeFlag(asked.withZeroReference),
        describeFlag(applied.withZeroReference),
      ),
    );
  }

  return Object.freeze(lines);
}

/**
 * The drill's own permalink, and a narrower recipe than the console's.
 *
 * The console's link carries thirteen axes and eleven settings because a room has that many knobs.
 * The drill has none: every card is a fixed entry in `DRILL_CARDS`, so the only thing worth naming
 * in a link is *which* cards this drill was — the eight keys, in the order they were called. That
 * is still a recipe rather than a result: a key resolves to a card's settings and seed through
 * `DRILL_CARDS`, which reproduces the room exactly, and reproduces nothing about how it was called.
 *
 * `DrillCallRecord` also carries `call`, `honest` and `correct`, and none of the three is read here.
 * A link that carried `correct=false` would be exactly the failure guardrail 10 exists to name: a
 * score quoted with the new page's authority, on a page whose whole point is that the score is not
 * the thing worth carrying.
 *
 * Both halves are wired, and that is the other half of guardrail 10. The verdict's Copy-link button
 * calls `encodeDrill` and puts the query in the address bar; `web/drill.ts` calls `decodeDrill` on
 * `window.location.search` before it builds the first card and runs exactly the cards it names, in
 * the order it names them. A page that wrote this payload and then ignored it on the way back in
 * would be the write-only permalink the guardrail calls worse than no link at all.
 *
 * `decodeDrill` follows `decodeSettings`'s own convention: an unknown card key is ignored, with a
 * notice a reader can read, never silently and never by throwing.
 */

const DRILL_CARDS_KEY = "cards";

export interface DrillLinkResult {
  readonly kind: "drillLinkResult";
  readonly cards: readonly CardKey[];
  readonly notices: readonly string[];
}

/** The cards called so far, in the order they were called — never the call, the honest answer, or
 *  whether the two agreed. */
export function encodeDrill(state: DrillState): string {
  const keys: string[] = [];
  for (const record of state.calls) {
    keys.push(record.cardKey);
  }
  return `${DRILL_CARDS_KEY}=${keys.join(",")}`;
}

export function decodeDrill(query: string): DrillLinkResult {
  const trimmed = query.startsWith("?") ? query.slice(1) : query;
  const params = new URLSearchParams(trimmed);
  const notices: string[] = [];
  const cards: CardKey[] = [];

  const raw = params.get(DRILL_CARDS_KEY);
  if (raw !== null && raw.length > 0) {
    const known = new Set<string>(CARD_ORDER);
    const alreadyReported = new Set<string>();
    for (const piece of raw.split(",")) {
      if (known.has(piece)) {
        cards.push(piece as CardKey);
        continue;
      }
      if (!alreadyReported.has(piece)) {
        alreadyReported.add(piece);
        notices.push(
          `The link named a card this drill does not have, written as "${piece}". It was ignored.`,
        );
      }
    }
  }

  return Object.freeze({
    kind: "drillLinkResult" as const,
    cards: Object.freeze(cards),
    notices: Object.freeze(notices),
  });
}
