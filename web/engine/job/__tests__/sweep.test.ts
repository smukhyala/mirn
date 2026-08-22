import { describe, expect, it } from "vitest";
import { makeRunConfig, type RunConfigOverrides } from "../../contracts/config.js";
import { ContractError } from "../../core/errors.js";
import { deviation } from "../../measure/metrics.js";
import { runSweep } from "../sweep.js";

/**
 * Small on purpose: 4 people for 40 ticks is about 5 ms a pair, so this whole file runs in well
 * under a second. Nothing here is a measurement of the crowd; it is a test of the harness.
 */
function tinyConfig(seedIndex: number, overrides: RunConfigOverrides = {}) {
  return makeRunConfig({
    seed: 20260816 + seedIndex * 7919,
    nTicks: 40,
    crowd: { nPedestrians: 4 },
    ...overrides,
  });
}

describe("runSweep", () => {
  it("runs every axis value against every seed, axis value outermost", () => {
    const visited: string[] = [];
    const points = runSweep({
      values: [0, 1],
      seedIndices: [0, 1, 2],
      config: (value, seedIndex) => tinyConfig(seedIndex, { robot: { repulsionScale: value } }),
      measure: (_run, value, seedIndex) => {
        visited.push(`${value}:${seedIndex}`);
        return { seen: 1 };
      },
    });
    expect(visited).toEqual(["0:0", "0:1", "0:2", "1:0", "1:1", "1:2"]);
    expect(points.length).toBe(6);
    expect(points[0]!.kind).toBe("sweepPoint");
    expect(points[0]!.axisValue).toBe(0);
    expect(points[0]!.seedIndex).toBe(0);
    expect(points[5]!.axisValue).toBe(1);
    expect(points[5]!.seedIndex).toBe(2);
  });

  it("hands the measurement function the run built from that cell's own config", () => {
    const points = runSweep({
      values: [2],
      seedIndices: [5],
      config: (value, seedIndex) => tinyConfig(seedIndex, { robot: { repulsionScale: value } }),
      measure: (run) => ({
        repulsionScale: run.config.robot.repulsionScale,
        seed: run.config.seed,
      }),
    });
    expect(points[0]!.metrics["repulsionScale"]).toBe(2);
    expect(points[0]!.metrics["seed"]).toBe(20260816 + 5 * 7919);
  });

  it("is bitwise reproducible: the same sweep run twice differs by exactly zero", () => {
    const build = () =>
      runSweep({
        values: [0.5, 1],
        seedIndices: [0, 1],
        config: (value, seedIndex) => tinyConfig(seedIndex, { robot: { repulsionScale: value } }),
        measure: (run) => {
          const d = deviation(run.pair);
          return { meanDeviationM: d.meanM, maxDeviationM: d.maxM };
        },
      });
    const first = build();
    const second = build();
    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i++) {
      const a = first[i]!;
      const b = second[i]!;
      // Bytes, not approximations. Anything but an exact 0 means the two runs drew different
      // randomness, and every claim downstream of this module is then unreproducible.
      expect(b.metrics["meanDeviationM"]! - a.metrics["meanDeviationM"]!).toBe(0);
      expect(b.metrics["maxDeviationM"]! - a.metrics["maxDeviationM"]!).toBe(0);
    }
  });

  it("carries a censored measurement through as NaN rather than dropping the run", () => {
    const points = runSweep({
      values: [0],
      seedIndices: [0, 1],
      config: (_value, seedIndex) => tinyConfig(seedIndex),
      measure: (_run, _value, seedIndex) => ({ arrivalS: seedIndex === 1 ? Number.NaN : 3 }),
    });
    expect(points.length).toBe(2);
    expect(points[0]!.metrics["arrivalS"]).toBe(3);
    expect(Number.isNaN(points[1]!.metrics["arrivalS"]!)).toBe(true);
  });

  it("freezes its own copy of the metrics, so a caller's scratch object cannot rewrite a result", () => {
    const scratch: Record<string, number> = { a: 1 };
    const points = runSweep({
      values: [0],
      seedIndices: [0],
      config: (_value, seedIndex) => tinyConfig(seedIndex),
      measure: () => scratch,
    });
    scratch["a"] = 99;
    expect(points[0]!.metrics["a"]).toBe(1);
    expect(Object.isFrozen(points[0]!)).toBe(true);
    expect(Object.isFrozen(points[0]!.metrics)).toBe(true);
  });

  it("refuses an empty grid before it simulates anything", () => {
    expect(() =>
      runSweep({
        values: [],
        seedIndices: [0],
        config: (_value, seedIndex) => tinyConfig(seedIndex),
        measure: () => ({}),
      }),
    ).toThrow(ContractError);
    expect(() =>
      runSweep({
        values: [0],
        seedIndices: [],
        config: (_value, seedIndex) => tinyConfig(seedIndex),
        measure: () => ({}),
      }),
    ).toThrow(ContractError);
  });

  it("refuses a repeated axis value or seed index, which would silently merge two cells", () => {
    expect(() =>
      runSweep({
        values: [1, 1],
        seedIndices: [0],
        config: (_value, seedIndex) => tinyConfig(seedIndex),
        measure: () => ({}),
      }),
    ).toThrow(/appears twice/);
    expect(() =>
      runSweep({
        values: [1],
        seedIndices: [0, 0],
        config: (_value, seedIndex) => tinyConfig(seedIndex),
        measure: () => ({}),
      }),
    ).toThrow(/appears twice/);
  });
});
