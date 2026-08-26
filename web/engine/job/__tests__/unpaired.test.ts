import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import { runPair, type RunResult } from "../../sim/run.js";
import { COLUMNS, COLUMN_ORDER, type ColumnKey } from "../columns.js";
import { buildContext, runReport, type MeasurementParams } from "../report.js";

/**
 * A withheld card may show only numbers a real corridor could have produced.
 *
 * In a corridor the second run does not exist, so any measurement that reads the control arm is
 * unavailable there — and showing one on a card would hand the reader the answer they are being
 * asked to guess. Which measurements those are is not obvious from their names: "how long until
 * the crowd was back inside tolerance" sounds like a property of the crowd, and is in fact
 * computed from the paired deviation series.
 *
 * So this proves it rather than trusting a list. Each column is computed twice — once against the
 * real pair, once against a pair whose control arm has been swapped for a decoy from a different
 * seed. A column that returns the same value both times never looked at the control arm.
 */

const PARAMS: MeasurementParams = Object.freeze({
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.25,
  recoveryDwellSteps: 20,
});

const CONFIG = makeRunConfig({ crowd: { nPedestrians: 12 } });
const DECOY = makeRunConfig({ seed: CONFIG.seed + 9999, crowd: { nPedestrians: 12 } });

/**
 * Build a `RunResult` whose control arm belongs to a different run entirely.
 *
 * `RunResult.control` is the raw `ArmResult` (positions, robotPositions, arrivedTick) that
 * `pedestrianTimeLost` and `robotCost` read directly; `RunResult.pair.control` is the validated
 * `Scene` that `pairedAgents` (and everything built on it — `deviation`, `paired`, `cvmResidual`)
 * reads instead. They are two views of the same arm, not two arms, so both have to come from the
 * decoy or half the extractors would see the real control and half would see the decoy, which
 * would not be an honest swap. `real.pair` is never re-validated through `makePairedRun` here —
 * doing so would reject a control arm from a different seed, which is exactly what this needs to
 * construct.
 */
function swapControl(real: RunResult, decoy: RunResult): RunResult {
  return {
    ...real,
    control: decoy.control,
    pair: { ...real.pair, control: decoy.pair.control },
  };
}

function readingsWith(controlFrom: typeof CONFIG): ReadonlyMap<ColumnKey, number> {
  const real = runPair(CONFIG, () => 0);
  const decoy = runPair(controlFrom, () => 0);
  const swapped = swapControl(real, decoy);
  const ctx = buildContext({
    config: CONFIG,
    params: PARAMS,
    run: swapped,
    band: null,
    floor: null,
    zeroRun: null,
    frechetMeanM: null,
  });
  const report = runReport(ctx, COLUMN_ORDER);
  const out = new Map<ColumnKey, number>();
  for (const key of COLUMN_ORDER) {
    const reading = report[key];
    if (reading !== undefined && reading.availability.kind === "measured") {
      out.set(key, reading.value);
    }
  }
  return out;
}

describe("which readouts a real corridor could produce", () => {
  it("every column declares whether it can be read without a control run", () => {
    for (const key of COLUMN_ORDER) {
      const column = COLUMNS[key];
      expect(typeof column.corridorReadable, `${key} must declare it`).toBe("boolean");
    }
  });

  it("a column that claims to need no control run does not notice the control arm changing", () => {
    const withReal = readingsWith(CONFIG);
    const withDecoy = readingsWith(DECOY);

    for (const key of COLUMN_ORDER) {
      const column = COLUMNS[key];
      if (!column.corridorReadable) {
        continue;
      }
      const a = withReal.get(key);
      const b = withDecoy.get(key);
      if (a === undefined || b === undefined) {
        continue;
      }
      expect(
        a,
        `${key} claims to need no control run but its value moved when the control arm was swapped`,
      ).toBe(b);
    }
  });

  it("a column that claims to need a control run does notice", () => {
    // The converse, so the flag cannot be made vacuous by setting everything to false.
    const withReal = readingsWith(CONFIG);
    const withDecoy = readingsWith(DECOY);
    let noticed = 0;
    for (const key of COLUMN_ORDER) {
      if (COLUMNS[key].corridorReadable) {
        continue;
      }
      const a = withReal.get(key);
      const b = withDecoy.get(key);
      if (a !== undefined && b !== undefined && a !== b) {
        noticed += 1;
      }
    }
    expect(noticed, "no paired column noticed the swap, so this test proves nothing").toBeGreaterThan(0);
  });
});
