import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../contracts/config.js";
import { runPair } from "./run.js";

/**
 * Both of these were found by opening the page and looking, not by a failing test — which is why
 * they are now tests. The first run of the Phase 1 gate showed people strolling out through the
 * end wall and "arrived" pedestrians drifting metres away from the goal they had supposedly
 * stopped at.
 */
describe("the room contains people", () => {
  it("keeps every pedestrian inside the walls for the whole episode", () => {
    // The demo carried a disabled x-wall term (multiplied by zero) because its agents were meant
    // to walk out of the ends and be respawned. This roster is fixed, so they must stay in.
    const config = makeRunConfig({ nTicks: 800 });
    const result = runPair(config);
    for (const arm of [result.treated, result.control]) {
      for (const buffer of arm.positions) {
        for (let s = 0; s < buffer.length; s += 2) {
          expect(buffer[s] as number).toBeGreaterThanOrEqual(0.2);
          expect(buffer[s] as number).toBeLessThanOrEqual(config.widthM - 0.2);
          expect(buffer[s + 1] as number).toBeGreaterThanOrEqual(0.2);
          expect(buffer[s + 1] as number).toBeLessThanOrEqual(config.heightM - 0.2);
        }
      }
    }
  });

  it("makes an arrived pedestrian hold position instead of drifting", () => {
    // Replacing the goal force with damping is the obvious fix and it does not work: the
    // exogenous noise keeps pushing and damping only bounds the drift rate. Over a 40 s episode
    // that walked people metres away from the goal they had stopped at.
    const config = makeRunConfig({ nTicks: 800 });
    const result = runPair(config);
    let checked = 0;
    for (const buffer of result.treated.positions) {
      const nSamples = buffer.length / 2;
      // Find the first sample after which the agent never moves more than a millimetre per tick.
      let stoppedFrom = -1;
      for (let s = 1; s < nSamples; s++) {
        const dx = (buffer[2 * s] as number) - (buffer[2 * s - 2] as number);
        const dy = (buffer[2 * s + 1] as number) - (buffer[2 * s - 1] as number);
        if (Math.sqrt(dx * dx + dy * dy) < 1e-9) {
          stoppedFrom = s;
          break;
        }
      }
      if (stoppedFrom < 0 || stoppedFrom >= nSamples - 10) {
        continue;
      }
      checked++;
      const restX = buffer[2 * stoppedFrom] as number;
      const restY = buffer[2 * stoppedFrom + 1] as number;
      for (let s = stoppedFrom; s < nSamples; s++) {
        expect(buffer[2 * s] as number).toBe(restX);
        expect(buffer[2 * s + 1] as number).toBe(restY);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("lets everyone finish a 40 s crossing, so time-to-goal is measurable", () => {
    // Time lost is defined as a difference of arrival times. If nobody arrives it is censored for
    // everyone and the metric has nothing to say, so this is a precondition for the metrics phase.
    const config = makeRunConfig({ nTicks: 800 });
    const result = runPair(config);
    let stopped = 0;
    for (const buffer of result.treated.positions) {
      const last = buffer.length / 2 - 1;
      const dx = (buffer[2 * last] as number) - (buffer[2 * last - 40] as number);
      const dy = (buffer[2 * last + 1] as number) - (buffer[2 * last - 39] as number);
      if (Math.sqrt(dx * dx + dy * dy) < 1e-9) {
        stopped++;
      }
    }
    expect(stopped).toBe(result.treated.positions.length);
  });
});
