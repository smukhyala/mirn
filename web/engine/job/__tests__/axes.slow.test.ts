import { describe, expect, it } from "vitest";
import { makeRunConfig, type RunConfigOverrides } from "../../contracts/config.js";
import { runPair } from "../../sim/run.js";
import { COLUMNS, type ColumnKey } from "../columns.js";
import { AXES, AXIS_ORDER, type AxisEntry } from "../axes.js";
import { buildContext, runReport, type MeasurementParams } from "../report.js";

/**
 * SLOW ON PURPOSE: about 200 paired runs, roughly ten to twenty seconds.
 *
 * Do not speed this up by lowering `nTicks`. A shorter episode gives the crowd less room to
 * respond, so a genuinely real axis moves its readout less; the difference stops clearing the
 * seed noise, the test goes red for an entirely good reason, and the natural repair is to loosen
 * the threshold until it passes again. That is exactly the move that would have destroyed the
 * placebo gate. If this is too slow, cut the number of AXES you are checking in a local run, not
 * the length of the episode.
 *
 * The comparison is PAIRED and the threshold is the standard error of the paired difference, not
 * the run-to-run band. The band is the unpaired spread between two runs of the same room; both
 * endpoints here share their seeds, so that spread is exactly the thing the pairing removes.
 * Judging a paired difference against an unpaired floor is the confounded comparison this whole
 * console exists to teach against.
 *
 * Measured provenance, this commit: 800 ticks (dt=0.05s, a 40 s episode -- the default episode
 * length, unmoved by any axis except `episodeSeconds` itself), 8 seeds per axis/column pair,
 * margin = |mean paired difference| / (2 * standard error), smallest first: politeness on
 * distance travelled at 1.73x, reaction time on closest approach at 1.91x, passing offset on
 * worst moment at 2.04x, perception error on closest approach at 2.06x, crowd fidget on the
 * forecaster at 2.07x. Everything else clears 3x or more, up to robot speed on distance
 * travelled at 78.71x. If any of these falls to or below 1.0x after a physics change, that is a
 * real finding about the room -- write it down before touching this threshold.
 */

const SEED_INDICES = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const BASE_SEED = 20260816;
const SEED_STRIDE = 7919;

const BASE_PARAMS: MeasurementParams = Object.freeze({
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.25,
  recoveryDwellSteps: 20,
});

/** A term the operator has never met, spelled the way a program spells it. Same pattern Task 11
 * re-homed guardrail 12's only mechanical enforcement onto in columns.test.ts, since the file
 * that used to own it (web/app/__tests__/render.test.ts) is deleted in this pivot's third commit.
 * Both `label` and `note` are reader-facing prose per the AxisCommon contract, so both are checked. */
const CODE_IDENTIFIER = /\b(?:[a-z]+[A-Z][A-Za-z]*|[a-z_]+_[a-z_]+)\b|[()[\]{}]|=>/;

/** Every dotted leaf of a config, so a diff can name the fields an axis actually wrote. */
function flatten(value: unknown, prefix: string, out: Map<string, string>): void {
  if (value === null || typeof value !== "object") {
    out.set(prefix, JSON.stringify(value));
    return;
  }
  if (Array.isArray(value)) {
    out.set(prefix, JSON.stringify(value));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = prefix === "" ? key : `${prefix}.${key}`;
    flatten(child, next, out);
  }
}

function changedPaths(before: RunConfigOverrides, after: RunConfigOverrides): string[] {
  const a = new Map<string, string>();
  const b = new Map<string, string>();
  flatten(makeRunConfig(before), "", a);
  flatten(makeRunConfig(after), "", b);
  const changed: string[] = [];
  for (const [path, value] of b) {
    if (a.get(path) !== value) {
      changed.push(path);
    }
  }
  return changed.sort();
}

function stepsOf(axis: AxisEntry): number[] {
  const values: number[] = [];
  let index = 0;
  for (;;) {
    const value = axis.min + index * axis.step;
    if (value > axis.max + 1e-9) {
      break;
    }
    values.push(value);
    index++;
    if (index > 5000) {
      throw new Error(`axis '${axis.key}' has an implausible number of steps`);
    }
  }
  if (values[values.length - 1] !== axis.max) {
    values.push(axis.max);
  }
  return values;
}

function columnAt(
  axis: AxisEntry,
  value: number,
  seedIndex: number,
  key: ColumnKey,
): number {
  let overrides: RunConfigOverrides = {};
  let params = BASE_PARAMS;
  if (axis.kind === "worldAxis") {
    overrides = axis.apply({}, value);
  } else {
    params = axis.apply(BASE_PARAMS, value);
  }
  const config = makeRunConfig({ ...overrides, seed: BASE_SEED + seedIndex * SEED_STRIDE });
  const run = runPair(config);
  const context = buildContext({
    config,
    params,
    run,
    band: null,
    floor: null,
    zeroRun: null,
    frechetMeanM: null,
  });
  const reading = runReport(context, [key])[key];
  if (reading === undefined || reading.availability.kind !== "measured") {
    throw new Error(`axis '${axis.key}' produced no measured '${key}' at value ${value}`);
  }
  return reading.value;
}

describe("the axis catalogue", () => {
  it("orders every key exactly once and names each one in English", () => {
    const keys = Object.keys(AXES);
    expect([...AXIS_ORDER].sort()).toEqual([...keys].sort());
    for (const key of AXIS_ORDER) {
      const axis = AXES[key];
      expect(axis.key).toBe(key);
      expect(axis.label.length).toBeGreaterThan(3);
      expect(axis.label).not.toMatch(CODE_IDENTIFIER);
      expect(axis.note.length).toBeGreaterThan(20);
      expect(axis.note).not.toMatch(CODE_IDENTIFIER);
      expect(axis.unit.length).toBeGreaterThan(0);
      expect(axis.movesColumns.length).toBeGreaterThan(0);
      expect(axis.min).toBeLessThan(axis.max);
      expect(axis.step).toBeGreaterThan(0);
      expect(axis.defaultValue).toBeGreaterThanOrEqual(axis.min);
      expect(axis.defaultValue).toBeLessThanOrEqual(axis.max);
      for (const column of axis.movesColumns) {
        expect(COLUMNS[column]).toBeDefined();
      }
    }
  });

  it("puts its default, its bottom and its top on its own notches", () => {
    // A range input snaps whatever it is given to `min + n * step`, so a default that is not on
    // that grid is a default the operator can never select and the console never runs. `jsdom`
    // does not sanitise range values, so no test that mounts the panel can see this — only the
    // catalogue itself can. Found in a browser: walkingPace's default of 1.34 was not a multiple
    // of a 0.05 step above 0.4, and the console quietly ran a crowd at 1.35 while every test here
    // ran it at 1.34.
    for (const key of AXIS_ORDER) {
      const axis = AXES[key];
      for (const value of [axis.min, axis.max, axis.defaultValue]) {
        const notches = (value - axis.min) / axis.step;
        const nearest = Math.round(notches);
        expect(
          Math.abs(notches - nearest),
          `${key} cannot be set to ${value}: it is ${notches} notches of ${axis.step} above ${axis.min}`,
        ).toBeLessThan(1e-6);
      }
    }
  });

  it("produces a legal setting at the bottom, the top and every notch between", () => {
    for (const key of AXIS_ORDER) {
      const axis = AXES[key];
      for (const value of stepsOf(axis)) {
        if (axis.kind === "worldAxis") {
          expect(() => makeRunConfig(axis.apply({}, value))).not.toThrow();
        } else {
          const params = axis.apply(BASE_PARAMS, value);
          expect(Number.isInteger(params.forecastHorizonSteps)).toBe(true);
          expect(Number.isInteger(params.forecastEndStep)).toBe(true);
          expect(params.forecastHorizonSteps).toBeGreaterThan(0);
          expect(params.forecastEndStep).toBeGreaterThan(params.forecastHorizonSteps);
          expect(params.forecastEndStep).toBeLessThanOrEqual(makeRunConfig().nTicks);
        }
      }
    }
  });

  it("writes exactly the fields it says it writes", () => {
    for (const key of AXIS_ORDER) {
      const axis = AXES[key];
      if (axis.kind !== "worldAxis") {
        continue;
      }
      // At the top of its range, so an axis whose default IS its minimum still shows a diff.
      const changed = changedPaths({}, axis.apply({}, axis.max));
      expect(changed).toEqual([...axis.writes].sort());
    }
  });

  it("moves each declared readout by more than the paired seed noise", { timeout: 180_000 }, () => {
    for (const key of AXIS_ORDER) {
      const axis = AXES[key];
      for (const column of axis.movesColumns) {
        const differences: number[] = [];
        for (const seedIndex of SEED_INDICES) {
          const low = columnAt(axis, axis.min, seedIndex, column);
          const high = columnAt(axis, axis.max, seedIndex, column);
          differences.push(high - low);
        }
        let total = 0;
        for (const difference of differences) {
          total += difference;
        }
        const meanDifference = total / differences.length;
        let squared = 0;
        for (const difference of differences) {
          squared += (difference - meanDifference) ** 2;
        }
        const sd = Math.sqrt(squared / (differences.length - 1));
        const standardError = sd / Math.sqrt(differences.length);
        expect(Math.abs(meanDifference)).toBeGreaterThan(2 * standardError);
      }
    }
  });
});
