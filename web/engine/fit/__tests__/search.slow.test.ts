import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import { ContractError } from "../../core/errors.js";
import { runPair } from "../../sim/run.js";
import { makeRecording } from "../recording.js";
import { fitCrowd, PACE_LADDER, WOBBLE_LADDER } from "../search.js";

/**
 * Does the fit find an answer it is known to be looking for, and does it decline the one it cannot?
 *
 * A fitting routine can only be tested against a truth somebody knows, and there is exactly one
 * source of those here: the simulator itself. So a "recording" is written out of a control arm at
 * chosen parameters, in the file format a reader's own recording arrives in, and the fit is asked
 * to find them again. That is not a claim that this validates fitting REAL data — no toy can show
 * that — it is the weaker and checkable claim that the machinery recovers what it is given.
 *
 * The second test is the one that matters more, and it is the reason the `identified` flag exists.
 */

/** A control arm, written out as a recording file at a known pace and wobble. */
function syntheticRecording(desiredSpeed: number, noiseAmplitude: number, seed: number) {
  const config = makeRunConfig({ crowd: { desiredSpeed, noiseAmplitude }, seed });
  const arm = runPair(config).control;
  const lines: string[] = ["# written out of the simulator, at a pace and wobble this test knows"];
  for (let p = 0; p < arm.positions.length; p++) {
    const path = arm.positions[p] as Float64Array;
    for (let i = 0; i < path.length / 2; i++) {
      lines.push(
        `${String(i)} p${String(p)} ${(path[i * 2] as number).toFixed(4)} ` +
          `${(path[i * 2 + 1] as number).toFixed(4)}`,
      );
    }
  }
  return makeRecording(lines.join("\n"), 1 / config.dt);
}

describe("fitting the crowd to a recording", () => {
  it("finds the walking pace it was given, exactly, at three different paces", () => {
    let checked = 0;
    for (const pace of [0.95, 1.4, 1.7]) {
      const recording = syntheticRecording(pace, 1.5, 4242);
      const result = fitCrowd({ recording, baseSeed: 77 });
      expect(result.best.desiredSpeed, `a recording made at ${String(pace)} m/s`).toBe(pace);
      expect(result.pace.value).toBe(pace);
      checked = checked + 1;
    }
    expect(checked).toBe(3);
  }, 900000);

  /**
   * The finding this feature would have shipped a false number without.
   *
   * A distribution of walking speeds locates where the distribution sits and says almost nothing
   * about how wide it is, once the pace is free to absorb the width. Recordings written at a wobble
   * of 1.5 and of 2.5 both come back fitted near nought — and the grid still has a winner, because a
   * grid always does. Reporting that winner as a fitted parameter would be exactly the failure this
   * whole site argues against: a number that looks measured and is not.
   */
  it("says the pace is pinned by the recording and the wobble is not", () => {
    const result = fitCrowd({ recording: syntheticRecording(1.4, 1.5, 4242), baseSeed: 77 });

    expect(result.pace.identified, "the pace should be pinned").toBe(true);
    expect(result.wobble.identified, "the wobble should not be").toBe(false);

    // And the reason, rather than the verdict alone: moving the pace across its ladder moves the
    // distance by far more than the crowd's own noise; moving the wobble moves it by less.
    expect(result.pace.spread).toBeGreaterThan(result.selfDistance * 5);
    expect(result.wobble.spread).toBeLessThan(result.selfDistance);
  }, 900000);

  it("gives the same answer twice, because a fit nobody can quote is not a fit", () => {
    const recording = syntheticRecording(1.25, 1, 4242);
    const first = fitCrowd({ recording, baseSeed: 77 });
    const second = fitCrowd({ recording, baseSeed: 77 });
    // Guardrail 4 reaches here like everywhere else. Bytes, not approximations.
    expect(second.best.desiredSpeed).toBe(first.best.desiredSpeed);
    expect(second.best.noiseAmplitude).toBe(first.best.noiseAmplitude);
    expect(second.best.distance).toBe(first.best.distance);
    expect(second.selfDistance).toBe(first.selfDistance);
  }, 900000);

  it("runs every rung of both ladders and reports the smallest", () => {
    const result = fitCrowd({ recording: syntheticRecording(1.4, 1, 4242), baseSeed: 77 });
    expect(result.candidates.length).toBe(PACE_LADDER.length * WOBBLE_LADDER.length);
    for (const candidate of result.candidates) {
      expect(candidate.distance).toBeGreaterThanOrEqual(result.best.distance);
    }
  }, 900000);

  it("measures the crowd against itself, and that is a real number rather than nought", () => {
    // The reference the fit is read against. If it were nought the comparison would be vacuous and
    // every fit would look infinitely far away.
    const result = fitCrowd({ recording: syntheticRecording(1.4, 1, 4242), baseSeed: 77 });
    expect(result.selfDistance).toBeGreaterThan(0);
    expect(Number.isFinite(result.selfDistance)).toBe(true);
  }, 900000);

  it("refuses a seed it cannot repeat from", () => {
    const recording = syntheticRecording(1.4, 1, 4242);
    expect(() => fitCrowd({ recording, baseSeed: 1.5 })).toThrow(ContractError);
  }, 900000);
});
