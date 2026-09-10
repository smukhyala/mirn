import { describe, expect, it } from "vitest";
import { buildAdapted } from "../build.js";
import { parseRunSet } from "../parse.js";
import { fixtureText } from "./fixtures/makeFixture.js";
import { buildContext, runReport, type MeasurementParams } from "../../job/report.js";
import { makeRunConfig } from "../../contracts/config.js";
import { runPair } from "../../sim/run.js";
import { paired } from "../../measure/estimator/index.js";
import { contextInitFromConfig } from "../../job/simContext.js";
import { bandFrom } from "../../measure/null/band.js";

const PARAMS: MeasurementParams = Object.freeze({
  kind: "measurementParams" as const,
  forecastHorizonSteps: 30,
  forecastEndStep: 100,
  nearMissThresholdM: 0.75,
  recoveryToleranceFraction: 0.2,
  recoveryDwellSteps: 10,
});

describe("a run set read back in measures what it measured before", () => {
  // 500 ticks (25 s), not the brief's original 120: at 120 ticks the robot cannot cover the
  // ~16.9 m crossing at its 1.1 m/s limit, so `arrivedTick` is always -1 and the Ruling A
  // round-trip assertion below would pass trivially (-1 equals -1) whether or not the `atSample`
  // conversion was implemented correctly. 500 ticks gives the robot room to actually arrive, so
  // that assertion is checking something.
  const config = makeRunConfig({ nTicks: 500, crowd: { nPedestrians: 8 } });
  const built = buildAdapted(parseRunSet(fixtureText(config)));

  // This is the test that would catch precision lost on the way through the file — a value that
  // survived `JSON.stringify`/`JSON.parse` with a bit shaved off would show up here as a real pair
  // reading a slightly different number from the one the simulator itself reports. The zero gate
  // below cannot catch that: both arms of the zero pair carry identical inputs, so any precision
  // loss would apply to both alike and cancel, leaving the pair at 0 regardless.
  it("reads the same effect as running it here", () => {
    const direct = runPair(config);
    expect(paired(built.run.pair).value).toBe(paired(direct.pair).value);
  });

  // Ruling A. Confirms the `atSample = arrivedTick + 1` / `arrivedTick = atSample - 1` round trip
  // is not off by one: the robot's arrival tick, read back through the adapter, must equal the
  // simulator's own. Only `treated` carries a robot in a robot-presence pair (see the comment on
  // `replicateBand` in `band.ts`), so that is the arm this checks.
  it("agrees with the simulator about which tick the robot arrived on", () => {
    const direct = runPair(config);
    expect(direct.treated.arrivedTick).toBeGreaterThanOrEqual(0);
    expect(built.run.treated.arrivedTick).toBe(direct.treated.arrivedTick);
  });

  // THE GATE. A world in which nobody responds to the robot has a true effect of exactly nothing,
  // and two arms that differ nowhere give exactly nothing back. Any other value means an identity
  // was mis-mapped or a sample was misaligned — NOT precision lost in transit: both arms of this
  // pair carry identical inputs, so any precision lost on the way through the file would be lost
  // identically on both sides and cancel, leaving this reading at 0 either way. The test above is
  // the one precision loss would show up in. `toBe`, never `toBeCloseTo`: the exactness is
  // available here, so inexactness is a defect.
  it("reads EXACTLY nothing on the pair in which nobody responded to the robot", () => {
    expect(built.zeroRun).not.toBeNull();
    expect(paired((built.zeroRun as NonNullable<typeof built.zeroRun>).pair).value).toBe(0);
  });

  it("reads something on the pair in which they did, so the gate is not passed by reading nought", () => {
    expect(paired(built.run.pair).value).toBeGreaterThan(0);
  });

  it("reports through the ordinary column machinery, with the producer's bodies", () => {
    const context = buildContext({
      dt: built.dt,
      bodies: built.bodies,
      straightLineM: built.straightLineM,
      straightLineArrivalS: built.straightLineArrivalS,
      params: PARAMS,
      run: built.run,
      band: null,
      floor: null,
      zeroRun: built.zeroRun,
      frechetMeanM: null,
    });
    const report = runReport(context, [
      "trueEffectM", "worstMomentM", "forecastReportM", "forecastZeroM",
      "robotPathM", "robotArrivalS", "minClearanceM", "nearMissEpisodes", "runToRunBandM",
    ]);

    expect(report.trueEffectM?.availability.kind).toBe("measured");
    expect(report.worstMomentM?.availability.kind).toBe("measured");
    expect(report.forecastReportM?.availability.kind).toBe("measured");
    expect(report.forecastZeroM?.availability.kind).toBe("measured");
    expect(report.robotPathM?.availability.kind).toBe("measured");
    expect(report.robotArrivalS?.availability.kind).toBe("measured");
    expect(report.minClearanceM?.availability.kind).toBe("measured");
    expect(report.nearMissEpisodes?.availability.kind).toBe("measured");
  });

  it("says the run-to-run band was not measured rather than inventing a floor", () => {
    const context = buildContext({
      dt: built.dt, bodies: built.bodies, straightLineM: built.straightLineM,
      straightLineArrivalS: built.straightLineArrivalS,
      params: PARAMS, run: built.run, band: null, floor: null,
      zeroRun: built.zeroRun, frechetMeanM: null,
    });
    const report = runReport(context, ["runToRunBandM"]);
    expect(report.runToRunBandM?.availability.kind).toBe("notApplicable");
    expect(Number.isNaN(report.runToRunBandM?.value ?? 0)).toBe(true);
  });

  // Ruling C. The fixture's `replicate` runs (robot-absent, differing only in exogenous noise)
  // exist so `bandFrom` and `AdaptedRunSet.replicates` have a caller: a band built from them and
  // handed to `buildContext` must come back MEASURED, with a finite, positive floor — the
  // opposite of the "no replicates supplied" test just above.
  it("measures a run-to-run band from the file's own replicates", () => {
    expect(built.replicates.length).toBeGreaterThanOrEqual(2);
    const band = bandFrom(built.replicates);
    const context = buildContext({
      dt: built.dt, bodies: built.bodies, straightLineM: built.straightLineM,
      straightLineArrivalS: built.straightLineArrivalS,
      params: PARAMS, run: built.run, band, floor: null,
      zeroRun: built.zeroRun, frechetMeanM: null,
    });
    const report = runReport(context, ["runToRunBandM"]);
    expect(report.runToRunBandM?.availability.kind).toBe("measured");
    const value = report.runToRunBandM?.value ?? Number.NaN;
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  });

  it("agrees with the simulator about how far the robot travelled", () => {
    const direct = runPair(config);
    const context = buildContext({
      dt: built.dt, bodies: built.bodies, straightLineM: built.straightLineM,
      straightLineArrivalS: built.straightLineArrivalS,
      params: PARAMS, run: built.run, band: null, floor: null,
      zeroRun: built.zeroRun, frechetMeanM: null,
    });
    const here = runReport(context, ["robotPathM"]).robotPathM?.value;

    const there = runReport(
      buildContext({
        ...contextInitFromConfig(config),
        params: PARAMS, run: direct, band: null, floor: null,
        zeroRun: null, frechetMeanM: null,
      }),
      ["robotPathM"],
    ).robotPathM?.value;

    expect(here).toBe(there);
  });
});
