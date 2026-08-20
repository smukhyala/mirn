import { describe, expect, it } from "vitest";
import { frameIndexAt, type PlaybackBase } from "./clock.js";

const base: PlaybackBase = { wallStartMs: 1000, sampleAtStart: 0, dtMs: 50, rate: 1 };

describe("frameIndexAt", () => {
  it("advances one sample per dt of wall time", () => {
    expect(frameIndexAt(1000, base, 100)).toBe(0);
    expect(frameIndexAt(1050, base, 100)).toBe(1);
    expect(frameIndexAt(1500, base, 100)).toBe(10);
  });

  it("clamps rather than running off either end", () => {
    expect(frameIndexAt(0, base, 100)).toBe(0);
    expect(frameIndexAt(999_999, base, 100)).toBe(99);
  });

  it("does not try to catch up after a long gap — the whole point of dropping the accumulator", () => {
    // A backgrounded tab returning after 30 s resolves straight to the clamped frame. An
    // accumulator would instead owe 600 physics steps and stall the first frame back.
    expect(frameIndexAt(31_000, base, 100)).toBe(99);
  });

  it("honours the playback rate", () => {
    const half: PlaybackBase = { ...base, rate: 0.5 };
    expect(frameIndexAt(1500, half, 100)).toBe(5);
  });

  it("resumes from the sample it was re-based at", () => {
    const resumed: PlaybackBase = { ...base, wallStartMs: 5000, sampleAtStart: 42 };
    expect(frameIndexAt(5000, resumed, 100)).toBe(42);
    expect(frameIndexAt(5100, resumed, 100)).toBe(44);
  });
});
