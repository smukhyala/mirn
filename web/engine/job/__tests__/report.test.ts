import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, makeRunConfig, SIM_CONSTANTS } from "../../contracts/config.js";
import { pairedAgents } from "../../contracts/pairedRun.js";
import { frechet } from "../../measure/divergence/index.js";
import { replicateBand } from "../../measure/null/band.js";
import { seededPermutations, splitHalfNull } from "../../measure/null/splitHalf.js";
import { runPair, type RunResult } from "../../sim/run.js";
import { COLUMN_ORDER, type ColumnKey } from "../columns.js";
import { buildContext, runReport, type MeasurementParams } from "../report.js";
import { contextInitFromConfig } from "../simContext.js";

describe("the report layer consumes data, not the simulator", () => {
  it("carries the body sizes the clearance columns measure with", () => {
    const init = contextInitFromConfig(DEFAULT_CONFIG);
    expect(init.bodies.robotRadiusM).toBe(SIM_CONSTANTS.robotRadiusM);
    expect(init.bodies.pedRadiusM).toBe(SIM_CONSTANTS.pedRadiusM);
  });

  it("carries the time step without carrying the whole configuration", () => {
    const init = contextInitFromConfig(DEFAULT_CONFIG);
    expect(init.dt).toBe(DEFAULT_CONFIG.dt);
  });

  it("reduces the room's geometry to the shortest crossing that counts as arriving", () => {
    const init = contextInitFromConfig(DEFAULT_CONFIG);
    // 18.00 m apart, minus the 1.1 m goal radius the robot stops inside.
    expect(init.straightLineM).toBeCloseTo(16.9, 10);
  });
});

const PARAMS: MeasurementParams = Object.freeze({
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.25,
  recoveryDwellSteps: 20,
});

function defaultContext() {
  const config = makeRunConfig();
  const run = runPair(config);
  const zeroConfig = makeRunConfig({ pedestriansSeeRobot: false });
  return buildContext({
    ...contextInitFromConfig(config),
    params: PARAMS,
    run,
    band: null,
    floor: null,
    zeroRun: runPair(zeroConfig),
    frechetMeanM: null,
  });
}

describe("runReport", () => {
  it("reports exactly the keys it was asked for", () => {
    const context = defaultContext();
    const keys: readonly ColumnKey[] = ["trueEffectM", "minClearanceM"];
    const report = runReport(context, keys);
    expect(Object.keys(report).sort()).toEqual(["minClearanceM", "trueEffectM"]);
  });

  it("reads the values the simulator produced at the default settings", () => {
    const report = runReport(defaultContext(), COLUMN_ORDER);
    expect(report.trueEffectM?.value).toBe(0.35157013372697155);
    expect(report.worstMomentM?.value).toBe(0.7611531942454374);
    expect(report.forecastReportM?.value).toBe(0.2854565210301339);
    expect(report.robotPathM?.value).toBe(17.780036918665008);
    expect(report.robotArrivalS?.value).toBe(328 * 0.05);
    expect(report.minClearanceM?.value).toBe(-0.04979741026062734);
    expect(report.nearMissEpisodes?.value).toBe(2);
    expect(report.pedestrianTimeLostS?.value).toBe(-0.08333333333333333);
  });

  it("shows the forecaster reporting a third of a metre on a run whose true effect is zero", () => {
    // The console's central argument, made from the two numbers the console actually prints.
    const report = runReport(defaultContext(), COLUMN_ORDER);
    expect(report.forecastZeroM?.availability.kind).toBe("measured");
    expect(report.forecastZeroM?.value).toBe(0.3341109929554126);
  });

  it("declines every column whose input was absent", () => {
    const report = runReport(defaultContext(), COLUMN_ORDER);
    expect(report.runToRunBandM?.availability.kind).toBe("notApplicable");
    expect(report.worstMomentNullM?.availability.kind).toBe("notApplicable");
    expect(report.detectionFloorM?.availability.kind).toBe("notApplicable");
    expect(report.frechetMeanM?.availability.kind).toBe("notApplicable");
  });

  it("returns the same numbers when the same run is reported twice", () => {
    // Determinism is compared as bytes. `toBe` is Object.is, so a NaN matches a NaN and a value
    // that has drifted by one bit does not.
    const a = runReport(defaultContext(), COLUMN_ORDER);
    const b = runReport(defaultContext(), COLUMN_ORDER);
    for (const key of COLUMN_ORDER) {
      expect(b[key]?.value).toBe(a[key]?.value);
      expect(b[key]?.availability.kind).toBe(a[key]?.availability.kind);
    }
  });

  it("refuses a key that is not in the catalogue", () => {
    const context = defaultContext();
    const bogus = ["notAColumn"] as unknown as readonly ColumnKey[];
    expect(() => runReport(context, bogus)).toThrow(/'notAColumn' is not a column/);
  });
});

/**
 * The mean per-agent Frechet distance for one run.
 *
 * Not exported anywhere yet: Task 16's `runner.ts` is the only planned caller of a Frechet-mean
 * reading and it does not exist in this codebase yet, so there is nothing to import here. This is
 * a verbatim copy of the loop Task 16's own brief specifies for `meanFrechet`, kept local to this
 * test so `fullContext()` below can hand `frechetMeanM` a real, measured number instead of null.
 */
function meanFrechetOf(run: RunResult): number {
  const agents = pairedAgents(run.pair);
  let total = 0;
  for (const entry of agents) {
    total += frechet(entry[0].positions, entry[1].positions);
  }
  if (agents.length === 0) {
    return Number.NaN;
  }
  return total / agents.length;
}

/**
 * The default config and seed, with every optional input present, so no column in the catalogue
 * reports `notApplicable` for want of an input.
 *
 * The task brief for this file describes this helper as one Step 1 already defines, but Step 1's
 * `defaultContext()` passes `band: null, floor: null, frechetMeanM: null` on purpose — that is
 * exactly what its own "declines every column whose input was absent" test above relies on. There
 * is no helper anywhere in this codebase, before this file, that builds a context with all four
 * optional inputs present; Task 16 (`runner.ts`) is the only place that ever will, and it does not
 * exist yet. This reproduces that not-yet-built wiring verbatim from its brief: `replicateBand`
 * for the band, `splitHalfNull` with a seeded permutation source for the floor, a
 * `pedestriansSeeRobot: false` run at the same config for the zero reference, and the Frechet mean
 * above. The band and floor read the same config as the run so the comparison is at the same
 * settings, matching `runner.ts`'s own stated reason for measuring the zero reference at the
 * cell's own settings rather than a shared one.
 */
function fullContext() {
  const config = makeRunConfig();
  const run = runPair(config);
  const zeroConfig = makeRunConfig({ ...config, pedestriansSeeRobot: false });
  const band = replicateBand(config, 8);
  const floor = splitHalfNull(run.control.positions, 20, seededPermutations(0));
  return buildContext({
    ...contextInitFromConfig(config),
    params: PARAMS,
    run,
    band,
    floor,
    zeroRun: runPair(zeroConfig),
    frechetMeanM: meanFrechetOf(run),
  });
}

/**
 * Every column at one fixed config and seed.
 *
 * The hand-pinned expectations above cover the columns whose behaviour the lesson turns on. This
 * covers the rest, so that a formula change anywhere in the catalogue is a red test rather than a
 * number nobody was watching. It stores the availability KIND alongside the value because a column
 * silently flipping from "measured" to "notApplicable" keeps a NaN in the value slot either way.
 *
 * Regenerate deliberately, never reflexively: `MIRN_UPDATE_GOLDEN=1 npx vitest run
 * web/engine/job/__tests__/report.test.ts`. If you cannot say in the commit message which formula
 * changed and why, do not regenerate it.
 */
const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), "report.golden.json");

describe("the whole column catalogue", () => {
  it("matches the committed golden report", () => {
    const context = fullContext();
    const report = runReport(context, COLUMN_ORDER);
    const actual: Record<string, { value: number; availability: string }> = {};
    for (const key of COLUMN_ORDER) {
      const reading = report[key];
      if (reading === undefined) {
        throw new Error(`runReport returned nothing for '${key}', which COLUMN_ORDER names`);
      }
      actual[key] = { value: reading.value, availability: reading.availability.kind };
    }

    if (process.env["MIRN_UPDATE_GOLDEN"] === "1") {
      writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
    }

    const expected = JSON.parse(readFileSync(GOLDEN, "utf8")) as typeof actual;
    // Bytes, not approximations: this run is deterministic, so any drift at all is a real change.
    expect(JSON.stringify(actual, null, 2)).toBe(JSON.stringify(expected, null, 2));
  });
});
