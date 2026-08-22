import { describe, expect, it } from "vitest";
import { aggregateSweep, type SweepPoint } from "../sweep.js";

/** Hand-built points, so this file runs the arithmetic without running the crowd. */
function point(axisValue: number, seedIndex: number, metrics: Record<string, number>): SweepPoint {
  return { kind: "sweepPoint", axisValue, seedIndex, metrics };
}

describe("aggregateSweep", () => {
  it("writes the axis key first, then k, k_sd and k_n per metric in first-seen order", () => {
    const rows = aggregateSweep(
      [
        point(0.5, 0, { meanDeviationM: 1, maxDeviationM: 3 }),
        point(0.5, 1, { meanDeviationM: 3, maxDeviationM: 5 }),
      ],
      "repulsionScale",
    );
    expect(rows.length).toBe(1);
    // The ORDER is the assertion, not the presence. web/data/experiment-facts.json is committed
    // and diffed byte for byte, and JSON.stringify writes keys in insertion order.
    expect(Object.keys(rows[0]!)).toEqual([
      "repulsionScale",
      "meanDeviationM",
      "meanDeviationM_sd",
      "meanDeviationM_n",
      "maxDeviationM",
      "maxDeviationM_sd",
      "maxDeviationM_n",
    ]);
    expect(JSON.stringify(rows[0])).toBe(
      '{"repulsionScale":0.5,"meanDeviationM":2,"meanDeviationM_sd":1.4142135623730951,' +
        '"meanDeviationM_n":2,"maxDeviationM":4,"maxDeviationM_sd":1.4142135623730951,' +
        '"maxDeviationM_n":2}',
    );
  });

  it("keeps the cells in first-seen order, one row per axis value", () => {
    const rows = aggregateSweep(
      [point(3, 0, { a: 1 }), point(1, 0, { a: 2 }), point(3, 1, { a: 5 })],
      "axisName",
    );
    expect(rows.length).toBe(2);
    expect(rows[0]!["axisName"]).toBe(3);
    expect(rows[0]!["a"]).toBe(3);
    expect(rows[0]!["a_n"]).toBe(2);
    expect(rows[1]!["axisName"]).toBe(1);
    expect(rows[1]!["a"]).toBe(2);
    expect(rows[1]!["a_n"]).toBe(1);
    expect(Number.isNaN(rows[1]!["a_sd"]!)).toBe(true);
  });

  it("reports a fully censored column as NaN over a count of zero, never as a blank or a 0", () => {
    const rows = aggregateSweep(
      [
        point(0.4, 0, { robotArrivalS: Number.NaN }),
        point(0.4, 1, { robotArrivalS: Number.NaN }),
      ],
      "maxSpeed",
    );
    expect(Number.isNaN(rows[0]!["robotArrivalS"]!)).toBe(true);
    expect(Number.isNaN(rows[0]!["robotArrivalS_sd"]!)).toBe(true);
    expect(rows[0]!["robotArrivalS_n"]).toBe(0);
    // Exactly how e3_robot_speed's slowest cell is written in the facts file today: JSON has no
    // NaN, so a censored average serialises as null and only the count says what happened.
    expect(JSON.stringify(rows[0])).toBe(
      '{"maxSpeed":0.4,"robotArrivalS":null,"robotArrivalS_sd":null,"robotArrivalS_n":0}',
    );
  });

  it("averages a metric over only the seeds that produced it, keeping late keys late", () => {
    const rows = aggregateSweep(
      [point(1, 0, { a: 1 }), point(1, 1, { a: 3, b: 10 })],
      "axisName",
    );
    expect(Object.keys(rows[0]!)).toEqual(["axisName", "a", "a_sd", "a_n", "b", "b_sd", "b_n"]);
    expect(rows[0]!["a"]).toBe(2);
    expect(rows[0]!["a_n"]).toBe(2);
    expect(rows[0]!["b"]).toBe(10);
    expect(rows[0]!["b_n"]).toBe(1);
    expect(Number.isNaN(rows[0]!["b_sd"]!)).toBe(true);
  });

  it("returns frozen rows", () => {
    const rows = aggregateSweep([point(1, 0, { a: 1 })], "axisName");
    expect(Object.isFrozen(rows)).toBe(true);
    expect(Object.isFrozen(rows[0]!)).toBe(true);
  });
});
