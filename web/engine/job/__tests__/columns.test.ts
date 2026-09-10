import { describe, expect, it } from "vitest";
import { makeRunConfig, type DisturbanceSpec } from "../../contracts/config.js";
import type { TreatmentSpec } from "../../contracts/pairedRun.js";
import { runPair } from "../../sim/run.js";
import { COLUMNS, COLUMN_ORDER, HEADLINE_COLUMNS, type ColumnKey } from "../columns.js";
import {
  buildContext,
  type MeasurementParams,
  type PairingOrigin,
  type ReportContext,
} from "../report.js";
import { contextInitFromConfig } from "../simContext.js";
import { CODE_IDENTIFIER_OR_SYNTAX } from "../../../testing/identifiers.js";

const PARAMS: MeasurementParams = Object.freeze({
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.25,
  recoveryDwellSteps: 20,
});

function contextWith(treatment: TreatmentSpec): ReportContext {
  return contextForConfig(makeRunConfig({ treatment }));
}

function contextForConfig(config: ReturnType<typeof makeRunConfig>): ReportContext {
  return buildContext({
    ...contextInitFromConfig(config),
    params: PARAMS,
    run: runPair(config),
    band: null,
    floor: null,
    zeroRun: null,
    frechetMeanM: null,
  });
}

/**
 * A robot present in the run but never moving, so `clearanceAfterBothMove` never gets a pair to
 * measure. Distinct from `{ kind: "none" }`, which does NOT remove the robot -- run.ts keeps a
 * robot in the treated arm under every treatment kind -- so this is the only way to reach the
 * "nothing to miss with" branch through a real ReportContext, the same stationary-robot case
 * clearance.test.ts already exercises directly against clearanceAfterBothMove.
 */
function stationaryRobotContext(): ReportContext {
  return contextForConfig(makeRunConfig({ robot: { maxSpeed: 0 } }));
}

/** A term the operator has never met, spelled the way a program spells it. */

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
      expect(column.label).not.toMatch(CODE_IDENTIFIER_OR_SYNTAX);
      expect(column.zero.how.length).toBeGreaterThan(20);
      expect(column.zero.how).not.toMatch(CODE_IDENTIFIER_OR_SYNTAX);
      const assumption = column.assumption(context);
      expect(assumption.length).toBeGreaterThan(20);
      expect(assumption).not.toMatch(CODE_IDENTIFIER_OR_SYNTAX);
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
    const reading = COLUMNS.nearMissEpisodes.extract(stationaryRobotContext());
    expect(reading.availability.kind).toBe("notApplicable");
    expect(Number.isNaN(reading.value)).toBe(true);
    if (reading.availability.kind === "notApplicable") {
      // A robot IS present here, just stationary -- asserting "no robot" would be false, and
      // this project treats a false reader-facing string as a defect, not a wording nit. Check
      // the actual text, not just that the reading declined to report: a test that only checked
      // `availability.kind` would keep passing even with the false sentence still in place.
      expect(reading.availability.why).not.toMatch(/no robot/i);
      expect(reading.availability.why).toMatch(/left where they were standing/);
    }
  });

  it("refuses to report a closest approach for the same reason, with the same honest text", () => {
    const reading = COLUMNS.minClearanceM.extract(stationaryRobotContext());
    expect(reading.availability.kind).toBe("notApplicable");
    expect(Number.isNaN(reading.value)).toBe(true);
    if (reading.availability.kind === "notApplicable") {
      expect(reading.availability.why).not.toMatch(/no robot/i);
      expect(reading.availability.why).toMatch(/left where they were standing/);
    }
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

  it("writes every availability reason in English too, not just label/zero/assumption", () => {
    // Minor/optional per review: the reader sees `availability.why` on a censored or
    // notApplicable tile just as much as `label`/`zero.how`/`assumption`, but the English-prose
    // test above never looked at it. Cover every reason string this file actually produces,
    // including the two new ones from the minClearanceM/nearMissEpisodes fix above.
    const stationary = stationaryRobotContext();
    const readings = [
      COLUMNS.runToRunBandM.extract(context),
      COLUMNS.worstMomentNullM.extract(context),
      COLUMNS.forecastZeroM.extract(context),
      COLUMNS.detectionFloorM.extract(context),
      COLUMNS.frechetMeanM.extract(context),
      COLUMNS.recoveryS.extract(context),
      COLUMNS.extraPathM.extract(context),
      COLUMNS.nearMissEpisodes.extract(stationary),
      COLUMNS.minClearanceM.extract(stationary),
    ];
    let nCovered = 0;
    for (const reading of readings) {
      if (reading.availability.kind !== "measured") {
        nCovered++;
        const why = reading.availability.why;
        expect(why.length).toBeGreaterThan(20);
        expect(why).not.toMatch(CODE_IDENTIFIER_OR_SYNTAX);
      }
    }
    expect(nCovered).toBe(readings.length);
  });
});

describe("the headline column set", () => {
  it("contains only keys that exist in COLUMNS", () => {
    const columnKeys = Object.keys(COLUMNS) as ColumnKey[];
    const columnKeySet = new Set(columnKeys);

    for (const key of HEADLINE_COLUMNS) {
      expect(columnKeySet.has(key)).toBe(true);
    }
  });

  it("contains only keys that appear in COLUMN_ORDER", () => {
    const columnOrderSet = new Set(COLUMN_ORDER);

    for (const key of HEADLINE_COLUMNS) {
      expect(columnOrderSet.has(key)).toBe(true);
    }
  });

  it("contains no duplicates", () => {
    const uniqueSet = new Set(HEADLINE_COLUMNS);
    expect(uniqueSet.size).toBe(HEADLINE_COLUMNS.length);
  });

  it("is frozen and immutable", () => {
    expect(Object.isFrozen(HEADLINE_COLUMNS)).toBe(true);
  });
});

/**
 * Guardrail 1, at the one tile whose wording turns on something no reader could see for themselves.
 *
 * `pairedAssumption` used to branch on the treatment kind alone, and told everybody that the two
 * runs "share a seed, a starting state and the same random wobble" and that "nothing else can
 * differ". For a pair this bench built that is true by construction — one shared noise tape, one
 * initial state, one seed. For a pair read in from another simulator's file it is unchecked and
 * uncheckable, and `EXTERNAL_CROWD_DISCLOSURE` says so in as many words, so the two sentences
 * would have sat on one screen contradicting each other with the confident one in the larger type.
 *
 * Both halves are held here. The constructed half asserts the ORIGINAL sentences survive word for
 * word: gating that made an adapted run honest by making a simulated run vague would be a
 * regression dressed as a fix, and only an exact-text assertion catches that. The asserted half
 * asserts the shared-randomness claim is gone and the file's-claim framing is there instead.
 *
 * The adapted path is exercised end to end, through the real adapter, in the adapter's own
 * `build.test.ts`. What this file adds is the third treatment kind: a shove pair cannot be read in
 * from a file at all — `parse.ts` accepts a robot-presence or a null treatment and nothing else —
 * so the disturbance branch has no adapted fixture and would otherwise go unread.
 */
describe("what a tile may claim about a pairing depends on who built it", () => {
  const SHOVE: DisturbanceSpec = Object.freeze({
    kind: "impulse" as const,
    id: "shove",
    atTick: 20,
    durationTicks: 1,
    magnitude: 1,
    headingRad: 0,
    targetUid: 0,
  });

  // One config per treatment kind, each simulated ONCE and read from two contexts that differ in
  // the single field under test. Running the pair twice would double this file's cost to assert
  // nothing extra: `pairedAssumption` reads the run's treatment and the pairing origin and nothing
  // else, so the same run under both origins is the sharpest available comparison as well as the
  // cheapest.
  const CONFIGS = [
    makeRunConfig({ treatment: { kind: "robot-presence" } }),
    makeRunConfig({
      disturbances: [SHOVE],
      treatment: { kind: "disturbance", disturbanceId: SHOVE.id },
    }),
    makeRunConfig({ treatment: { kind: "none" } }),
  ] as const;

  const PAIRED_KEYS: readonly ColumnKey[] = Object.freeze(["trueEffectM", "worstMomentM"]);

  function contextFor(config: (typeof CONFIGS)[number], pairingOrigin: PairingOrigin): ReportContext {
    return buildContext({
      ...contextInitFromConfig(config),
      pairingOrigin,
      params: PARAMS,
      run: runPair(config),
      band: null,
      floor: null,
      zeroRun: null,
      frechetMeanM: null,
    });
  }

  const constructed = CONFIGS.map((config) => contextFor(config, "constructed"));
  const asserted = CONFIGS.map((config) => contextFor(config, "asserted"));

  it("keeps every word of the constructed sentence, which is true by construction", () => {
    for (const context of constructed) {
      for (const key of PAIRED_KEYS) {
        const assumption = COLUMNS[key].assumption(context);
        expect(assumption).toContain(
          "Both runs share a seed, a starting state and the same random wobble",
        );
        expect(assumption).not.toContain("the file's claim");
      }
    }
    const robotPresence = constructed[0] as ReportContext;
    expect(COLUMNS.trueEffectM.assumption(robotPresence)).toContain(
      "Because nothing else can differ, the gap between a person's two paths is the robot's " +
        "effect on them and nothing is estimated.",
    );
  });

  it("drops the shared-randomness claim when the pairing was only asserted", () => {
    for (const context of asserted) {
      for (const key of PAIRED_KEYS) {
        const assumption = COLUMNS[key].assumption(context);
        expect(assumption).not.toContain("share a seed");
        expect(assumption).not.toContain("the same random wobble");
        expect(assumption).not.toContain("nothing else can differ");
        expect(assumption).not.toContain("and of nothing else");
      }
    }
  });

  it("says instead what was checked, and whose claim the rest of it is", () => {
    for (const context of asserted) {
      for (const key of PAIRED_KEYS) {
        const assumption = COLUMNS[key].assumption(context);
        expect(assumption).toContain("a simulator this bench did not run");
        expect(assumption).toContain("name the same people, share a clock and a length");
        expect(assumption).toContain("What it could not check");
        expect(assumption).toContain("share the same underlying randomness");
        expect(assumption).toContain("the file's claim, not a finding of this bench's");
      }
    }
  });

  it("still names what the two runs are said to differ by, which is the treatment's job", () => {
    // The origin gates the confidence, not the subject. A reader still has to be told whether the
    // robot, one shove or nothing at all is what the file says the arms differ by: a sentence
    // honest about its provenance and silent about its subject has explained nothing.
    const [robot, shove, nothing] = asserted as readonly ReportContext[];
    expect(COLUMNS.trueEffectM.assumption(robot as ReportContext)).toContain(
      "differ only in whether the robot is there",
    );
    expect(COLUMNS.trueEffectM.assumption(shove as ReportContext)).toContain(
      "one scheduled shove happened",
    );
    expect(COLUMNS.trueEffectM.assumption(nothing as ReportContext)).toContain(
      "nothing was done to either of them",
    );
  });

  it("writes the asserted sentences in English, not in code, and puts no figure in them", () => {
    // Guardrail 12, plus the no-numeric-literal rule, over strings the catalogue scan above cannot
    // reach: that scan builds its context from `contextWith`, whose pairing is always constructed,
    // so every asserted branch would go unscanned however many of them there were.
    for (const context of asserted) {
      for (const key of PAIRED_KEYS) {
        const assumption = COLUMNS[key].assumption(context);
        expect(assumption.length).toBeGreaterThan(20);
        expect(assumption).not.toMatch(CODE_IDENTIFIER_OR_SYNTAX);
        expect(assumption).not.toMatch(/[0-9]/);
      }
    }
  });
});
