import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import type { TreatmentSpec } from "../../contracts/pairedRun.js";
import { runPair } from "../../sim/run.js";
import { COLUMNS, COLUMN_ORDER, type ColumnKey } from "../columns.js";
import { buildContext, type MeasurementParams, type ReportContext } from "../report.js";

const PARAMS: MeasurementParams = Object.freeze({
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.25,
  recoveryDwellSteps: 20,
});

function contextWith(treatment: TreatmentSpec): ReportContext {
  const config = makeRunConfig({ treatment });
  return buildContext({
    config,
    params: PARAMS,
    run: runPair(config),
    band: null,
    floor: null,
    zeroRun: null,
    frechetMeanM: null,
  });
}

/** A term the operator has never met, spelled the way a program spells it. */
const CODE_IDENTIFIER = /\b(?:[a-z]+[A-Z][A-Za-z]*|[a-z_]+_[a-z_]+)\b|[()[\]{}]|=>/;

describe("the column catalogue is total and self-consistent", () => {
  it("orders every key exactly once", () => {
    const keys = Object.keys(COLUMNS) as ColumnKey[];
    expect([...COLUMN_ORDER].sort()).toEqual([...keys].sort());
    expect(new Set(COLUMN_ORDER).size).toBe(COLUMN_ORDER.length);
  });

  it("gives every column its own key back", () => {
    for (const key of COLUMN_ORDER) {
      expect(COLUMNS[key].key).toBe(key);
      expect(COLUMNS[key].kind).toBe("column");
    }
  });

  it("matches every column's statistic to its zero-reference's statistic", () => {
    // A max-over-steps readout judged against a mean-over-steps floor clears it for free, because
    // max >= mean for any series. So a companion zero must be measured the same way.
    for (const key of COLUMN_ORDER) {
      const column = COLUMNS[key];
      if (column.zero.kind === "companionColumn") {
        expect(COLUMNS[column.zero.column].statistic).toBe(column.statistic);
      }
    }
  });

  it("writes labels, zeros and assumptions in English, not in code", () => {
    const context = contextWith({ kind: "robot-presence" });
    for (const key of COLUMN_ORDER) {
      const column = COLUMNS[key];
      expect(column.label.length).toBeGreaterThan(3);
      expect(column.label).not.toMatch(CODE_IDENTIFIER);
      expect(column.zero.how.length).toBeGreaterThan(20);
      expect(column.zero.how).not.toMatch(CODE_IDENTIFIER);
      const assumption = column.assumption(context);
      expect(assumption.length).toBeGreaterThan(20);
      expect(assumption).not.toMatch(CODE_IDENTIFIER);
    }
  });

  it("anchors every metre column against something with scale", () => {
    // Guardrail 7. A metre on its own means nothing to a beginner, so a metres column either
    // declares that it needs a body-scale anchor beside it or carries a zero that gives scale.
    for (const key of COLUMN_ORDER) {
      const column = COLUMNS[key];
      if (column.unit === "metres") {
        const hasScale =
          column.needsAnchor ||
          column.zero.kind === "geometricBound" ||
          column.zero.kind === "companionColumn";
        expect(hasScale).toBe(true);
      }
    }
  });
});

describe("availability", () => {
  const context = contextWith({ kind: "robot-presence" });

  it("is NaN if and only if the reading is not measured", () => {
    for (const key of COLUMN_ORDER) {
      const reading = COLUMNS[key].extract(context);
      const measured = reading.availability.kind === "measured";
      expect(Number.isNaN(reading.value)).toBe(!measured);
    }
  });

  it("declares honestly what it needs, with band, floor, zero run and Frechet all absent", () => {
    // The context above has all four optional inputs null. Every column that says it needs one
    // must decline to report, and every column that says it needs only the run must report.
    for (const key of COLUMN_ORDER) {
      const column = COLUMNS[key];
      const reading = column.extract(context);
      if (column.needs !== "run") {
        expect(reading.availability.kind).not.toBe("measured");
      }
    }
    expect(COLUMNS.trueEffectM.extract(context).availability.kind).toBe("measured");
    expect(COLUMNS.worstMomentM.extract(context).availability.kind).toBe("measured");
    expect(COLUMNS.robotPathM.extract(context).availability.kind).toBe("measured");
    expect(COLUMNS.minClearanceM.extract(context).availability.kind).toBe("measured");
  });

  it("reads the values the simulator actually produced at the default settings", () => {
    expect(COLUMNS.trueEffectM.extract(context).value).toBe(0.35157013372697155);
    expect(COLUMNS.worstMomentM.extract(context).value).toBe(0.7611531942454374);
    expect(COLUMNS.robotPathM.extract(context).value).toBe(17.780036918665008);
    expect(COLUMNS.robotArrivalS.extract(context).value).toBe(328 * 0.05);
    expect(COLUMNS.minClearanceM.extract(context).value).toBe(-0.04979741026062734);
    expect(COLUMNS.nearMissEpisodes.extract(context).value).toBe(2);
    expect(COLUMNS.pedestrianTimeLostS.extract(context).value).toBe(-0.08333333333333333);
    expect(context.straightLineM).toBe(16.9);
  });

  it("censors a recovery that never came back inside its tolerance", () => {
    const reading = COLUMNS.recoveryS.extract(context);
    expect(reading.availability.kind).toBe("censored");
    expect(Number.isNaN(reading.value)).toBe(true);
  });

  it("calls the robot's extra path not applicable when the control arm has no robot", () => {
    const reading = COLUMNS.extraPathM.extract(context);
    expect(reading.availability.kind).toBe("notApplicable");
    if (reading.availability.kind === "notApplicable") {
      expect(reading.availability.why).toMatch(/no robot/);
    }
  });

  it("refuses to report a near-miss count of zero when the robot never left its spawn tile", () => {
    // A finite zero is the dangerous case: it averages happily and reads as a real measurement.
    // `{ kind: "none" }` alone does not remove the robot: run.ts keeps a robot in the treated arm
    // under every treatment kind, so `contextWith({ kind: "none" })` still measures two genuine
    // near-miss episodes. The only way to reach the "nothing to miss with" branch through a real
    // ReportContext is a robot that never moves off its own spawn tile -- the same stationary-robot
    // case clearance.test.ts already exercises directly against clearanceAfterBothMove.
    const config = makeRunConfig({ robot: { maxSpeed: 0 } });
    const stationary = buildContext({
      config,
      params: PARAMS,
      run: runPair(config),
      band: null,
      floor: null,
      zeroRun: null,
      frechetMeanM: null,
    });
    const reading = COLUMNS.nearMissEpisodes.extract(stationary);
    expect(reading.availability.kind).toBe("notApplicable");
    expect(Number.isNaN(reading.value)).toBe(true);
  });

  it("rewrites the identifying assumption when the robot is in both arms", () => {
    const shared = contextWith({ kind: "none" });
    const withRobot = contextWith({ kind: "robot-presence" });
    const a = COLUMNS.trueEffectM.assumption(shared);
    const b = COLUMNS.trueEffectM.assumption(withRobot);
    expect(a).not.toBe(b);
    expect(b).toMatch(/whether the robot is there/);
    expect(a).not.toMatch(/whether the robot is there/);
  });
});
