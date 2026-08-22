import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import { deviation, robotCost } from "../../measure/metrics.js";
import { aggregateSweep, runSweep } from "../sweep.js";

/**
 * The historical pin.
 *
 * scripts/measure-experiments.ts and web/data/experiment-facts.json are both deleted by the last
 * commit of the console pivot, and they are the only things that currently prove this module
 * reproduces the numbers the site published. This test outlives them: the fixture beside it is a
 * verbatim copy of two blocks of that file, and the sweep is rebuilt here from the same seeds and
 * the same configs.
 *
 * If this goes red, the arithmetic moved. Regenerating the fixture to make it green is a formula
 * change with the evidence deleted.
 */
interface GoldenBlock {
  readonly axis: string;
  readonly baseSeed: number;
  readonly seedStride: number;
  readonly nTicks: number;
  readonly dt: number;
  readonly values: readonly number[];
  readonly seedIndices: readonly number[];
  readonly rows: readonly Readonly<Record<string, number | null>>[];
}

interface Golden {
  readonly e1_push_strength: GoldenBlock;
  readonly e3_robot_speed_slowest_cell: GoldenBlock;
}

const GOLDEN_PATH = join(dirname(fileURLToPath(import.meta.url)), "sweep.golden.json");
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as Golden;

describe("the sweep runner against the numbers this project published", () => {
  it(
    "reproduces the push-strength sweep exactly, key order included",
    () => {
      const block = golden.e1_push_strength;
      const points = runSweep({
        values: block.values,
        seedIndices: block.seedIndices,
        config: (value, seedIndex) =>
          makeRunConfig({
            seed: block.baseSeed + seedIndex * block.seedStride,
            nTicks: block.nTicks,
            robot: { repulsionScale: value },
          }),
        measure: (run) => {
          const d = deviation(run.pair);
          return { meanDeviationM: d.meanM, maxDeviationM: d.maxM };
        },
      });
      const rows = aggregateSweep(points, block.axis);
      expect(rows.length).toBe(7);
      // JSON.stringify rather than toEqual: this pins the key ORDER as well as every digit, and
      // key order is what made the extracted aggregate byte-compatible with the facts file.
      expect(JSON.stringify(rows)).toBe(JSON.stringify(block.rows));
    },
    120_000,
  );

  it(
    "reproduces the fully censored arrival cell as NaN over a count of zero",
    () => {
      const block = golden.e3_robot_speed_slowest_cell;
      const points = runSweep({
        values: block.values,
        seedIndices: block.seedIndices,
        config: (value, seedIndex) =>
          makeRunConfig({
            seed: block.baseSeed + seedIndex * block.seedStride,
            nTicks: block.nTicks,
            robot: { maxSpeed: value },
          }),
        measure: (run) => ({
          robotArrivalS: robotCost(run.treated, run.control, block.dt).treatedArrivalS,
        }),
      });
      const rows = aggregateSweep(points, block.axis);
      expect(JSON.stringify(rows)).toBe(JSON.stringify(block.rows));
      expect(Number.isNaN(rows[0]!["robotArrivalS"]!)).toBe(true);
      expect(rows[0]!["robotArrivalS_n"]).toBe(0);
    },
    60_000,
  );
});
