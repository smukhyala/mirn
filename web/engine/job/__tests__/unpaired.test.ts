import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import { runPair, type RunResult } from "../../sim/run.js";
import { COLUMNS, COLUMN_ORDER, type ColumnKey, type Reading } from "../columns.js";
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
 * seed. A column that returns the same reading both times — same availability, and the same value
 * whenever that availability is "measured" — never looked at the control arm. Availability
 * changing counts as noticing every bit as much as a value changing does: a column that goes from
 * measured to censored the moment the control arm is swapped read the control arm to decide that,
 * and showing it on a withheld card would leak exactly that decision.
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

/**
 * Every column's full `Reading` — availability and value both — against a run whose control arm
 * came from `controlFrom`.
 *
 * `runReport` is called with the full `COLUMN_ORDER`, and it sets `report[key]` unconditionally
 * for every key it is asked for (see `report.ts`), so every entry here is populated whether or not
 * the column measured anything. Keeping the whole `Reading`, not just a filtered-to-measured
 * number, is what lets the corridor-readable check below see a column go from measured to censored
 * under the swap rather than silently vanishing from the comparison.
 */
function readingsWith(controlFrom: typeof CONFIG): ReadonlyMap<ColumnKey, Reading> {
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
  const out = new Map<ColumnKey, Reading>();
  for (const key of COLUMN_ORDER) {
    const reading = report[key];
    if (reading !== undefined) {
      out.set(key, reading);
    }
  }
  return out;
}

describe("which readouts a real corridor could produce", () => {
  it("the catalogue splits both ways, so neither answer is the default", () => {
    // This used to assert `typeof column.corridorReadable === "boolean"`, which the type system
    // guarantees on a frozen object literal with a non-optional field: no single-line change to
    // columns.ts could make it red without a deliberate cast. What is worth checking is that the
    // flag is a decision rather than a constant — a catalogue where every column answered the same
    // way would make the two tests below it vacuous in one direction and nobody would notice.
    let readable = 0;
    let needsControl = 0;
    for (const key of COLUMN_ORDER) {
      if (COLUMNS[key].corridorReadable) {
        readable = readable + 1;
      } else {
        needsControl = needsControl + 1;
      }
    }
    expect(readable, "no column claims to be readable from one crossing").toBeGreaterThan(0);
    expect(needsControl, "no column admits to needing the run without the robot").toBeGreaterThan(0);
    expect(readable + needsControl).toBe(COLUMN_ORDER.length);
  });

  it("a column that claims to need no control run reads identically under the swap", () => {
    const withReal = readingsWith(CONFIG);
    const withDecoy = readingsWith(DECOY);

    for (const key of COLUMN_ORDER) {
      const column = COLUMNS[key];
      if (!column.corridorReadable) {
        continue;
      }
      const a = withReal.get(key);
      const b = withDecoy.get(key);
      // A corridor-readable column must produce a comparable reading in this fixture. Skipping
      // silently here is exactly the hole that let a paired column (`recoveryS`, computed from
      // the paired deviation series) hide behind a swap that censors it rather than moving its
      // value: it would drop out of both maps and never be checked at all. So this fails loudly
      // instead of continuing past a missing reading.
      expect(a, `${key} claims to need no control run but produced no reading against the real pair`).toBeDefined();
      expect(
        b,
        `${key} claims to need no control run but produced no reading against the decoy pair`,
      ).toBeDefined();
      if (a === undefined || b === undefined) {
        continue;
      }
      // Availability changing IS the column noticing the swap, every bit as much as a value
      // changing — a column that goes from measured to censored decided that by looking at the
      // control arm. Compare availability kinds before ever looking at values.
      expect(
        b.availability.kind,
        `${key} claims to need no control run but its availability changed when the control arm ` +
          `was swapped: real=${a.availability.kind}, decoy=${b.availability.kind}`,
      ).toBe(a.availability.kind);
      if (a.availability.kind === "measured") {
        expect(
          b.value,
          `${key} claims to need no control run but its value moved when the control arm was swapped`,
        ).toBe(a.value);
      }
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
      if (a === undefined || b === undefined) {
        continue;
      }
      if (a.availability.kind !== "measured" || b.availability.kind !== "measured") {
        continue;
      }
      if (a.value !== b.value) {
        noticed += 1;
      }
    }
    expect(noticed, "no paired column noticed the swap, so this test proves nothing").toBeGreaterThan(0);
  });
});
