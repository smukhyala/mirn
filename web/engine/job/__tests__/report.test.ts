import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import { runPair } from "../../sim/run.js";
import { COLUMN_ORDER, type ColumnKey } from "../columns.js";
import { buildContext, runReport, type MeasurementParams } from "../report.js";

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
    config,
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
