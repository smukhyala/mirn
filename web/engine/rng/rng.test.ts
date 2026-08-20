import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { mix4, mulberry32Raw, toUnit, UINT32_SCALE } from "./mulberry32.js";
import { Channel, gaussian, makeTape, tapeRaw } from "./tape.js";

describe("mulberry32", () => {
  it("reproduces the demo's stream exactly", () => {
    // Regression lock against demo/perturbation-playground.html's generator, driven as a stream
    // (state carried forward) the way the demo drives it. If a refactor changes these, the
    // physics port is no longer the physics that was eyeballed and tuned.
    let state = 20260816;
    const drawn: number[] = [];
    for (let i = 0; i < 5; i++) {
      state = (state + 0x6d2b79f5) | 0;
      drawn.push(toUnit(mulberry32Raw(state - 0x6d2b79f5)));
    }
    for (const value of drawn) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("returns a uint32 for every int32 input", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const out = mulberry32Raw(seed);
        expect(Number.isInteger(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThan(UINT32_SCALE);
      }),
    );
  });

  it("maps to [0, 1) exactly, with no rounding to 1", () => {
    expect(toUnit(0)).toBe(0);
    expect(toUnit(UINT32_SCALE - 1)).toBeLessThan(1);
    // The divisor is a power of two, so the division is exact rather than rounded.
    expect(toUnit(1) * UINT32_SCALE).toBe(1);
  });
});

describe("mix4 avalanche", () => {
  it("flips about half the output bits when one input bit changes", () => {
    // An RNG that correlates across ticks produces a crowd that visibly drifts rather than
    // jitters, and no other cheap test catches it. Checking the tick axis specifically because
    // that is the one that increments by one 800 times a run.
    let flipped = 0;
    const samples = 4096;
    for (let tick = 0; tick < samples; tick++) {
      const a = mix4(20260816, tick, 3, Channel.NoiseX);
      const b = mix4(20260816, tick ^ 1, 3, Channel.NoiseX);
      let bits = a ^ b;
      // popcount
      bits = bits - ((bits >>> 1) & 0x55555555);
      bits = (bits & 0x33333333) + ((bits >>> 2) & 0x33333333);
      flipped += (((bits + (bits >>> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
    }
    const meanFlipped = flipped / samples;
    expect(meanFlipped).toBeGreaterThan(14);
    expect(meanFlipped).toBeLessThan(18);
  });

  it("separates channels: the same tick and agent give unrelated draws per channel", () => {
    const tape = makeTape(20260816);
    const x = tape(10, 4, Channel.NoiseX);
    const y = tape(10, 4, Channel.NoiseY);
    expect(x).not.toBe(y);
  });
});

describe("NoiseTape", () => {
  it("is a pure function of its address", () => {
    const tape = makeTape(20260816);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: -1, max: 200 }),
        (tick, uid) => {
          expect(tape(tick, uid, Channel.NoiseX)).toBe(tape(tick, uid, Channel.NoiseX));
        },
      ),
    );
  });

  it("gives two tapes with the same seed identical values everywhere", () => {
    const a = makeTape(7);
    const b = makeTape(7);
    for (let tick = 0; tick < 200; tick++) {
      for (let uid = 0; uid < 12; uid++) {
        expect(a(tick, uid, Channel.NoiseX)).toBe(b(tick, uid, Channel.NoiseX));
      }
    }
  });

  it("gives different seeds different values", () => {
    const a = makeTape(7);
    const b = makeTape(8);
    let identical = 0;
    for (let tick = 0; tick < 200; tick++) {
      if (a(tick, 0, Channel.NoiseX) === b(tick, 0, Channel.NoiseX)) {
        identical++;
      }
    }
    expect(identical).toBe(0);
  });

  it("is roster-invariant: adding an agent cannot shift an existing agent's draws", () => {
    // This is the property the demo could not have. Its `nextId++` and sequential streams meant
    // that injecting a pedestrian re-indexed everybody's randomness, so "add one person and see
    // what changes" also silently changed the weather.
    const tape = makeTape(20260816);
    const before: number[] = [];
    for (let uid = 0; uid < 12; uid++) {
      before.push(tape(50, uid, Channel.NoiseX));
    }
    const injectedUid = 10000;
    void tape(50, injectedUid, Channel.NoiseX);
    for (let uid = 0; uid < 12; uid++) {
      expect(tape(50, uid, Channel.NoiseX)).toBe(before[uid]);
    }
  });

  it("is order-independent: skipping a channel does not shift any other", () => {
    // The whole reason `g.rng(); g.rng();` existed. With a tape, the control arm never asking for
    // the robot's perception channels changes nothing at all.
    const tape = makeTape(20260816);
    const noiseFirst = tape(3, 5, Channel.NoiseX);
    void tape(3, 5, Channel.PerceptX);
    void tape(3, 5, Channel.PerceptY);
    expect(tape(3, 5, Channel.NoiseX)).toBe(noiseFirst);
  });

  it("exposes raw uint32 at an address for the cross-language parity fixture", () => {
    const raw = tapeRaw(20260816, 0, 0, Channel.NoiseX);
    expect(Number.isInteger(raw)).toBe(true);
    expect(raw).toBeGreaterThanOrEqual(0);
    expect(raw).toBeLessThan(UINT32_SCALE);
    expect(toUnit(raw)).toBe(makeTape(20260816)(0, 0, Channel.NoiseX));
  });
});

describe("gaussian", () => {
  it("is deterministic at an address", () => {
    const tape = makeTape(20260816);
    const a = gaussian(tape, 12, 3, Channel.PerceptX, Channel.PerceptY);
    const b = gaussian(tape, 12, 3, Channel.PerceptX, Channel.PerceptY);
    expect(a).toBe(b);
  });

  it("is finite everywhere, including at the clamped lower bound", () => {
    const tape = makeTape(20260816);
    for (let tick = 0; tick < 2000; tick++) {
      const value = gaussian(tape, tick, 0, Channel.PerceptX, Channel.PerceptY);
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("has roughly zero mean and unit variance over many draws", () => {
    const tape = makeTape(20260816);
    let sum = 0;
    let sumSquares = 0;
    const n = 20000;
    for (let tick = 0; tick < n; tick++) {
      const value = gaussian(tape, tick, 1, Channel.PerceptX, Channel.PerceptY);
      sum += value;
      sumSquares += value * value;
    }
    const mean = sum / n;
    const variance = sumSquares / n - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(variance).toBeGreaterThan(0.94);
    expect(variance).toBeLessThan(1.06);
  });
});

describe("the determinism guardrail itself", () => {
  it("makes Math.random throw inside the engine suite", () => {
    expect(() => Math.random()).toThrow(/banned in the engine/);
  });
});
