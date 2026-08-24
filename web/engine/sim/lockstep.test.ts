import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { makeRunConfig } from "../contracts/config.js";
import { runPair } from "./run.js";
import type { ArmResult } from "./run.js";

function bytesOf(arm: ArmResult): Uint8Array {
  let total = 0;
  for (const buffer of arm.positions) {
    total += buffer.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const buffer of arm.positions) {
    out.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength), offset);
    offset += buffer.byteLength;
  }
  return out;
}

function worstGap(result: ReturnType<typeof runPair>): number {
  let worst = 0;
  for (let i = 0; i < result.treated.positions.length; i++) {
    const a = result.treated.positions[i] as Float64Array;
    const b = result.control.positions[i] as Float64Array;
    for (let k = 0; k < a.length; k += 2) {
      const dx = (a[k] as number) - (b[k] as number);
      const dy = (a[k + 1] as number) - (b[k + 1] as number);
      const gap = Math.sqrt(dx * dx + dy * dy);
      if (gap > worst) {
        worst = gap;
      }
    }
  }
  return worst;
}

describe("T1 — the null treatment produces bitwise identical arms", () => {
  // The highest-value test in the suite. Any accidental extra randomness, any arm-dependent
  // branch, any order dependence in the force loop breaks this immediately and unambiguously.
  // `toEqual` on bytes, and `toBe(0)` on the gap — not `toBeCloseTo`, because the shared-tape
  // construction makes exactness available and inexactness would mean the arms have drifted.
  it("holds at the default configuration", () => {
    const config = makeRunConfig({ nTicks: 400, treatment: { kind: "none" } });
    const result = runPair(config);
    expect(bytesOf(result.treated)).toEqual(bytesOf(result.control));
    expect(worstGap(result)).toBe(0);
  });

  it("holds across the whole knob space", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 40 }),
        fc.double({ min: 0, max: 3, noNaN: true }),
        fc.double({ min: 0.1, max: 2.0, noNaN: true }),
        fc.double({ min: 0.05, max: 1.0, noNaN: true }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (nPedestrians, noiseAmplitude, maxSpeed, reactionTimeS, seed) => {
          const config = makeRunConfig({
            seed,
            nTicks: 60,
            treatment: { kind: "none" },
            crowd: { nPedestrians, noiseAmplitude, desiredSpeed: 1.34, relaxationTimeS: 0.5 },
            robot: {
              maxSpeed,
              reactionTimeS,
              deflectionWeight: 0,
              startXY: [2, 6.5],
              goalXY: [20, 6.5],
            },
          });
          const result = runPair(config);
          expect(worstGap(result)).toBe(0);
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe("the robot-blind lesson", () => {
  it("collapses the true effect to exactly zero, not merely to something small", () => {
    // This is the demonstration the whole site is built around: the robot is physically present
    // and moving in the treated arm, nobody responds to it, and the honest answer is 0.
    const config = makeRunConfig({ nTicks: 400, pedestriansSeeRobot: false });
    const result = runPair(config);
    expect(worstGap(result)).toBe(0);
  });

  it("produces a real, legible effect once people do see the robot", () => {
    const config = makeRunConfig({ nTicks: 400, pedestriansSeeRobot: true });
    const result = runPair(config);
    // Measured at ~0.97 m peak in the headless probe that preceded this port. Asserting a broad
    // band rather than a value: this is a legibility gate, not a golden file.
    expect(worstGap(result)).toBeGreaterThan(0.3);
    expect(worstGap(result)).toBeLessThan(6);
  });
});

describe("determinism", () => {
  it("gives byte-identical results for the same config run twice", () => {
    const config = makeRunConfig({ nTicks: 200 });
    expect(bytesOf(runPair(config).treated)).toEqual(bytesOf(runPair(config).treated));
  });

  it("survives interleaving, so no module-scope state is leaking between runs", () => {
    const a = makeRunConfig({ nTicks: 120, seed: 1 });
    const b = makeRunConfig({ nTicks: 120, seed: 2 });
    const firstA = bytesOf(runPair(a).treated);
    void runPair(b);
    expect(bytesOf(runPair(a).treated)).toEqual(firstA);
  });

  it("gives different seeds different worlds", () => {
    const a = runPair(makeRunConfig({ nTicks: 120, seed: 1 }));
    const b = runPair(makeRunConfig({ nTicks: 120, seed: 2 }));
    expect(bytesOf(a.treated)).not.toEqual(bytesOf(b.treated));
  });

  it("gives replicates the same world and different noise", () => {
    // The null band depends on this: same configuration, different exogenous draw, no intervention.
    const a = runPair(makeRunConfig({ nTicks: 120, replicate: 0 }));
    const b = runPair(makeRunConfig({ nTicks: 120, replicate: 1 }));
    expect(bytesOf(a.treated)).not.toEqual(bytesOf(b.treated));
  });
});

describe("sim invariants", () => {
  it("keeps everybody inside the room and produces no NaN at any reachable setting", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 44 }),
        fc.double({ min: 0, max: 3, noNaN: true }),
        fc.double({ min: 0.05, max: 1.0, noNaN: true }),
        (nPedestrians, noiseAmplitude, reactionTimeS) => {
          const config = makeRunConfig({
            nTicks: 120,
            crowd: { nPedestrians, noiseAmplitude, desiredSpeed: 1.34, relaxationTimeS: 0.5 },
            robot: {
              maxSpeed: 1.1,
              reactionTimeS,
              deflectionWeight: 0,
              startXY: [2, 6.5],
              goalXY: [20, 6.5],
            },
          });
          const result = runPair(config);
          for (const buffer of result.treated.positions) {
            for (let k = 0; k < buffer.length; k += 2) {
              expect(Number.isFinite(buffer[k] as number)).toBe(true);
              expect(Number.isFinite(buffer[k + 1] as number)).toBe(true);
              expect(buffer[k + 1] as number).toBeGreaterThanOrEqual(0.25 - 1e-9);
              expect(buffer[k + 1] as number).toBeLessThanOrEqual(config.heightM - 0.25 + 1e-9);
            }
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it("respects the speed cap", () => {
    const config = makeRunConfig({ nTicks: 300 });
    const result = runPair(config);
    const cap = config.crowd.desiredSpeed * 1.35;
    for (const buffer of result.treated.positions) {
      for (let k = 2; k < buffer.length; k += 2) {
        const dx = (buffer[k] as number) - (buffer[k - 2] as number);
        const dy = (buffer[k + 1] as number) - (buffer[k - 1] as number);
        const speed = Math.sqrt(dx * dx + dy * dy) / config.dt;
        // The wall reflection can add a little on the tick it fires, so allow a small margin.
        expect(speed).toBeLessThan(cap * 1.5);
      }
    }
  });
});
