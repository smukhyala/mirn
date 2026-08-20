import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../contracts/config.js";
import { runPair } from "../sim/run.js";
import { cvmResidual, paired } from "./estimator/index.js";
import { replicateBand } from "./null/band.js";

const ACTIVE_STEP = 200;

describe("the paired estimator", () => {
  it("reports exactly zero when the robot provably did nothing", () => {
    // Not "close to zero". The two arms are bitwise identical when nobody responds to the robot,
    // so every per-agent divergence is a sum of sqrt(0). Anything other than 0 here would mean
    // the arms have drifted, which is the single worst bug available in this codebase.
    const result = runPair(makeRunConfig({ nTicks: 400, pedestriansSeeRobot: false }));
    expect(paired(result.pair).value).toBe(0);
  });

  it("reports a real effect when people do respond", () => {
    const result = runPair(makeRunConfig({ nTicks: 400, pedestriansSeeRobot: true }));
    expect(paired(result.pair).value).toBeGreaterThan(0.05);
  });

  it("always states its identifying assumption", () => {
    const result = runPair(makeRunConfig({ nTicks: 200 }));
    expect(paired(result.pair).identification.length).toBeGreaterThan(40);
  });
});

describe("the constant-velocity residual — the method being critiqued", () => {
  it("reports a non-zero disturbance from a robot that provably did nothing", () => {
    // The whole argument, as a test. The true effect here is exactly zero, verified above by the
    // paired estimator on the same run. The forecaster still finds something.
    const result = runPair(makeRunConfig({ nTicks: 400, pedestriansSeeRobot: false }));
    expect(paired(result.pair).value).toBe(0);
    expect(cvmResidual(result.pair, 40, ACTIVE_STEP).value).toBeGreaterThan(0.01);
  });

  it("grows with the forecast horizon while the true effect does not move at all", () => {
    const result = runPair(makeRunConfig({ nTicks: 400, pedestriansSeeRobot: false }));
    const short = cvmResidual(result.pair, 6, ACTIVE_STEP).value;
    const medium = cvmResidual(result.pair, 16, ACTIVE_STEP).value;
    const long = cvmResidual(result.pair, 40, ACTIVE_STEP).value;
    expect(medium).toBeGreaterThan(short);
    expect(long).toBeGreaterThan(medium);
    expect(paired(result.pair).value).toBe(0);
  });

  it("declares its assumption UNMET rather than dressing itself up", () => {
    const result = runPair(makeRunConfig({ nTicks: 200 }));
    expect(cvmResidual(result.pair, 16, 100).identification.startsWith("UNMET")).toBe(true);
  });

  it("reads exactly zero at the end of the episode, which is why endStep exists", () => {
    // Everyone has arrived and parked by then, so a constant-velocity forecast of a stationary
    // person is exactly right. Anchoring there measures nothing and reports success.
    const result = runPair(makeRunConfig({ nTicks: 800 }));
    expect(cvmResidual(result.pair, 16).value).toBe(0);
    expect(cvmResidual(result.pair, 16, ACTIVE_STEP).value).toBeGreaterThan(0);
  });

  it("refuses a window too short to fit a velocity and roll it forward", () => {
    const result = runPair(makeRunConfig({ nTicks: 200 }));
    expect(() => cvmResidual(result.pair, 16, 10)).toThrow(/at least horizonSteps \+ 2/);
  });
});

describe("the run-to-run band", () => {
  it("is small, because replicates are the same world with a different roll of the dice", () => {
    // Regression guard on a bug that produced 11 m. Seeding the initial placement from the
    // replicate as well made every replicate a different crowd in different places, so the band
    // measured strangers rather than noise — and every effect on the site would have looked
    // undetectable against it.
    const band = replicateBand(makeRunConfig({ nTicks: 400 }), 4);
    expect(band.value).toBeGreaterThan(0);
    expect(band.value).toBeLessThan(1.0);
  });

  it("puts a real robot effect above the band and a blind crowd's below it", () => {
    const config = makeRunConfig({ nTicks: 400 });
    const band = replicateBand(config, 4);
    const seen = paired(runPair(config).pair).value;
    const blind = paired(runPair(makeRunConfig({ ...config, pedestriansSeeRobot: false })).pair).value;
    expect(seen).toBeGreaterThan(band.value);
    expect(blind).toBe(0);
  });

  it("pairs every replicate against every other", () => {
    const band = replicateBand(makeRunConfig({ nTicks: 120 }), 5);
    expect(band.nPairs).toBe((5 * 4) / 2);
    expect(band.samples.length).toBe(band.nPairs);
  });

  it("is deterministic", () => {
    const config = makeRunConfig({ nTicks: 120 });
    expect(replicateBand(config, 4).value).toBe(replicateBand(config, 4).value);
  });
});
