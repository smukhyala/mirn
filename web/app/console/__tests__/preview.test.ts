import { describe, expect, it } from "vitest";
import { paired } from "../../../engine/measure/estimator/index.js";
import { HEADLINE_COLUMNS } from "../../../engine/job/columns.js";
import { DEFAULT_SETTINGS, makeConsoleSettings } from "../state.js";
import {
  DEBOUNCE_PEOPLE,
  isRenderable,
  peopleIn,
  resolveZero,
  runPreview,
  shouldDebounce,
  stampsFor,
} from "../preview.js";
import { unitSuffix } from "../tile.js";

/**
 * The preview is the page's honesty at the moment of turning a knob: what the arena shows and what
 * the tiles say must both describe the room whose settings are in the panel right now.
 *
 * The bug this file exists to prevent is a specific one. With a people-sweep configured, cell 0 of
 * the job is 4 people while the slider reads 18, so a preview built through `jobForRun` (or through
 * `configForCell` on the wrong job) would describe a room nobody is looking at, in every tile, with
 * no visible tell. `state.test.ts` already guards `jobForPreview` itself against exactly this; what
 * this file guards is that `runPreview` reaches for that job and not the other one.
 *
 * `runToRunBandM` is a HEADLINE_COLUMNS entry, but a preview never buys the band `jobForPreview`
 * would need to report it (267 ms is not a keystroke budget), so it is deliberately excluded below
 * rather than asserted alongside the other six.
 */

const settings = makeConsoleSettings({
  ...DEFAULT_SETTINGS,
  sweepAxis: "crowdSize",
  sweepValues: [4, 8, 12, 18, 24, 32, 44],
  seedCount: 8,
});

describe("the live preview", () => {
  it("simulates the settings in the panel, not the first cell of the sweep", () => {
    const preview = runPreview(settings);
    expect(preview.config.crowd.nPedestrians).toBe(18);
    expect(peopleIn(settings)).toBe(18);
  });

  it("computes the zero-effect reference run at the same settings", () => {
    const preview = runPreview(settings);
    expect(preview.zeroRun.config.pedestriansSeeRobot).toBe(false);
    expect(preview.zeroRun.config.crowd.nPedestrians).toBe(18);
    expect(preview.zeroRun.config.seed).toBe(preview.config.seed);
    // Determinism, not approximation: the zero run's true effect is exactly zero.
    expect(paired(preview.zeroRun.pair).value).toBe(0);
  });

  it("reports every column it can measure live, and never the run-to-run band", () => {
    const preview = runPreview(settings);
    for (const key of HEADLINE_COLUMNS) {
      if (key === "runToRunBandM") {
        continue;
      }
      expect(preview.readings[key], `no reading for ${String(key)}`).toBeDefined();
    }
    expect(preview.readings["runToRunBandM"]).toBeUndefined();

    const forecast = preview.readings["forecastReportM"];
    expect(forecast?.availability.kind).toBe("measured");
    expect(Number.isFinite(forecast?.value ?? Number.NaN)).toBe(true);

    // The zero-effect reference run is what keeps this from reading "not applicable" on first
    // load — the console's central argument, and the thing this whole module exists to protect.
    const zero = preview.readings["forecastZeroM"];
    expect(zero?.availability.kind).toBe("measured");
    expect(Number.isFinite(zero?.value ?? Number.NaN)).toBe(true);
  });

  it("stamps every readout with the settings it was measured at", () => {
    const stamps = stampsFor(runPreview(settings));
    const labels = stamps.map((stamp) => stamp.label);
    expect(labels).toContain("crowd");
    expect(labels).toContain("forecast horizon");
    expect(labels).toContain("measured at");
  });

  it("never labels a stamp with its own unit, which would print the word twice", () => {
    // "people 18 people": the label sits before the value and the unit suffix after it.
    for (const stamp of stampsFor(runPreview(settings))) {
      expect(stamp.label, `the ${stamp.label} stamp repeats its unit`).not.toBe(
        unitSuffix(stamp.unit),
      );
    }
  });

  it("debounces at the crowd size the panel warns about, which is also the slider's own max", () => {
    expect(shouldDebounce(settings)).toBe(false); // 18 people
    const atMax = makeConsoleSettings({
      ...settings,
      axisValues: { ...settings.axisValues, crowdSize: DEBOUNCE_PEOPLE },
    });
    expect(peopleIn(atMax)).toBe(DEBOUNCE_PEOPLE);
    // A strict `>` could never fire here: DEBOUNCE_PEOPLE (44) is crowdSize's own max, and
    // makeConsoleSettings itself refuses a value above it (the range input clamps to it too), so
    // 44 is the largest crowd this settings object can ever legally hold.
    expect(shouldDebounce(atMax)).toBe(true);

    const justUnder = makeConsoleSettings({
      ...settings,
      axisValues: { ...settings.axisValues, crowdSize: DEBOUNCE_PEOPLE - 1 },
    });
    expect(shouldDebounce(justUnder)).toBe(false);
  });
});

describe("resolveZero", () => {
  it("resolves an exact zero to the literal zero, in the column's own unit", () => {
    const preview = runPreview(settings);
    expect(resolveZero("trueEffectM", preview.context, preview.readings)).toBe(0);
  });

  it("resolves the robot's crossing bound to the straight-line distance", () => {
    const preview = runPreview(settings);
    expect(resolveZero("robotPathM", preview.context, preview.readings)).toBe(
      preview.context.straightLineM,
    );
  });

  it("resolves the robot's arrival bound to a time, not the same number as its distance", () => {
    const preview = runPreview(settings);
    const expected = preview.context.straightLineM / preview.config.robot.maxSpeed;
    expect(resolveZero("robotArrivalS", preview.context, preview.readings)).toBe(expected);
    expect(resolveZero("robotArrivalS", preview.context, preview.readings)).not.toBe(
      resolveZero("robotPathM", preview.context, preview.readings),
    );
  });

  it("resolves the closest-approach bound to the coordinate zero, not the crossing distance", () => {
    // minClearanceM shares its zero.kind ("geometricBound") with robotPathM but must not share
    // its number: the two are unrelated quantities (a gap in metres vs a ~17 m crossing).
    const preview = runPreview(settings);
    expect(resolveZero("minClearanceM", preview.context, preview.readings)).toBe(0);
    expect(resolveZero("minClearanceM", preview.context, preview.readings)).not.toBe(
      resolveZero("robotPathM", preview.context, preview.readings),
    );
  });

  it("resolves a companion column by reading its own measured value", () => {
    const preview = runPreview(settings);
    const expected = preview.readings["forecastZeroM"]?.value;
    expect(expected).toBeDefined();
    expect(resolveZero("forecastReportM", preview.context, preview.readings)).toBe(expected);
  });

  it("cannot resolve a companion column that a preview never bought", () => {
    // worstMomentM's own reading needs only "run" and is always measured here, but its
    // zero-reference is the companion column worstMomentNullM, which needs the run-to-run band —
    // never bought by a preview. This is the exact gap boot.test.ts found by actually booting the
    // page: `console.ts` once handed this NaN straight to `zeroRenderingFor`, which throws rather
    // than show a number with no zero beside it.
    const preview = runPreview(settings);
    expect(preview.readings["worstMomentNullM"]).toBeUndefined();
    expect(Number.isNaN(resolveZero("worstMomentM", preview.context, preview.readings))).toBe(true);
  });
});

describe("isRenderable", () => {
  it("allows a column whose reading and zero are both live", () => {
    const preview = runPreview(settings);
    expect(isRenderable("trueEffectM", preview.context, preview.readings)).toBe(true);
    expect(isRenderable("forecastReportM", preview.context, preview.readings)).toBe(true);
  });

  it("refuses a column a preview never reports at all", () => {
    const preview = runPreview(settings);
    expect(isRenderable("runToRunBandM", preview.context, preview.readings)).toBe(false);
  });

  it("refuses a column whose reading is live but whose zero-reference is not", () => {
    // The specific defect this whole module exists to prevent from reaching the page: a reading
    // with no resolvable zero beside it.
    const preview = runPreview(settings);
    expect(preview.readings["worstMomentM"]?.availability.kind).toBe("measured");
    expect(isRenderable("worstMomentM", preview.context, preview.readings)).toBe(false);
  });
});
