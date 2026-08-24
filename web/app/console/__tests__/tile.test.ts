import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { makeRunConfig } from "../../../engine/contracts/config.js";
import { ContractError } from "../../../engine/core/errors.js";
import { COLUMNS, COLUMN_ORDER, type Reading, type ZeroReference } from "../../../engine/job/columns.js";
import { buildContext, type MeasurementParams, type ReportContext } from "../../../engine/job/report.js";
import { runPair } from "../../../engine/sim/run.js";
import { anchorFor } from "../../../ui/labels.js";
import {
  BAND_NOT_MEASURED,
  makeTileProps,
  renderTile,
  zeroRenderingFor,
  type TilePropsInit,
} from "../tile.js";

/**
 * The two rules this file exists to hold, both of them structural rather than editorial:
 *
 *   Guardrail 6 — the zero reading is inseparable from the value. It is a required prop, it is a
 *   sibling of the value inside the same tile, and no <details> may wrap it. A zero the reader has
 *   to click for is a zero that is not shown.
 *
 *   No literal metre or second value in any tile string. Every number renders from data at paint
 *   time, into a named slot, so a copy edit can never leave a stale figure behind.
 */

const doc = new JSDOM("<!doctype html><body></body>").window.document;

function measured(value: number): Reading {
  return { kind: "reading", value, availability: { kind: "measured" } };
}

function censored(why: string): Reading {
  return { kind: "reading", value: Number.NaN, availability: { kind: "censored", why } };
}

const EXACT_ZERO: ZeroReference = {
  kind: "exactZero",
  how: "when nobody in the room responds to the robot",
};

const GEOMETRIC_BOUND: ZeroReference = {
  kind: "geometricBound",
  noRunReadsBelow: true,
  how: "the shortest crossing this room allows",
};

const GEOMETRIC_REFERENCE: ZeroReference = {
  kind: "geometricBound",
  noRunReadsBelow: false,
  how: "the point at which the two outlines touch, which readings sit on both sides of",
};

const BASE: TilePropsInit = {
  column: "trueEffectM",
  label: "How far the crowd was moved",
  unit: "metres",
  reading: measured(0.352),
  zero: zeroRenderingFor(EXACT_ZERO, 0, "metres"),
  gauge: { kind: "bandNotMeasured" },
  stamps: [
    { kind: "settingStamp", label: "people", value: 18, unit: "people" },
    { kind: "settingStamp", label: "forecast horizon", value: 3, unit: "seconds" },
  ],
  assumption:
    "Both runs share a seed, a starting state and an exogenous noise draw, and differ only in " +
    "whether the robot is there.",
  anchor: "half a stride",
};

function leafText(root: Element): readonly { readonly className: string; readonly text: string }[] {
  const leaves: { className: string; text: string }[] = [];
  const all = Array.from(root.querySelectorAll("*"));
  for (const node of all) {
    if (node.children.length === 0) {
      leaves.push({ className: node.getAttribute("class") ?? "", text: node.textContent ?? "" });
    }
  }
  return leaves;
}

/**
 * The four leaves that exist to print a number, and are the only ones allowed to contain one.
 *
 * `tile-zero-how` is deliberately absent. It is the phrase beside the zero's own value slot, and
 * six catalogue entries used to spell the value out inside it as well, so the rendered tile read
 * "0.000 m  ... and this reads 0.000 m". The phrase is the one leaf most likely to acquire a
 * hardcoded figure, which is exactly why it is scanned rather than excused.
 */
const VALUE_SLOTS: readonly string[] = ["tile-number", "tile-zero-value", "stamp-value", "gauge-number"];

function literalsOutsideValueSlots(tile: Element): readonly string[] {
  const literal = /\d+\.\d+\s*(m|s)\b/;
  const offenders: string[] = [];
  for (const leaf of leafText(tile)) {
    if (VALUE_SLOTS.includes(leaf.className)) {
      continue;
    }
    if (literal.test(leaf.text)) {
      offenders.push(`${leaf.className}: ${leaf.text}`);
    }
  }
  return offenders;
}

const PARAMS: MeasurementParams = Object.freeze({
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.25,
  recoveryDwellSteps: 20,
});

/** One real paired run, so every descriptor's `assumption(ctx)` is the string a reader gets. */
function realContext(): ReportContext {
  const config = makeRunConfig({});
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

describe("the headline tile", () => {
  it("puts the zero reading beside the value, never inside a disclosure", () => {
    const tile = renderTile(doc, makeTileProps(BASE));
    const value = tile.querySelector(".tile-value");
    const zero = tile.querySelector(".tile-zero");
    expect(value).not.toBeNull();
    expect(zero).not.toBeNull();
    expect(zero?.parentElement).toBe(value?.parentElement);
    expect(zero?.closest("details")).toBeNull();
  });

  it("still shows the zero when the value itself is unavailable", () => {
    const tile = renderTile(doc, makeTileProps({ ...BASE, reading: censored("nobody arrived") }));
    expect(tile.querySelector(".tile-number")).toBeNull();
    expect(tile.querySelector(".tile-reason")?.textContent).toBe("nobody arrived");
    expect(tile.querySelector(".tile-zero-how")?.textContent).toBe(
      "when nobody in the room responds to the robot",
    );
  });

  it("refuses to build a tile with no zero at all", () => {
    const withoutZero = { ...BASE } as unknown as Record<string, unknown>;
    delete withoutZero["zero"];
    expect(() => makeTileProps(withoutZero as unknown as TilePropsInit)).toThrow(ContractError);
  });

  it("renders a bound as a bound", () => {
    const props = makeTileProps({
      ...BASE,
      unit: "seconds",
      reading: measured(41.5),
      zero: zeroRenderingFor(GEOMETRIC_BOUND, 40, "seconds"),
    });
    const tile = renderTile(doc, props);
    expect(tile.querySelector(".tile-zero-value")?.textContent).toBe("> 40.0");
    expect(tile.querySelector(".tile-zero-unit")?.textContent).toBe("s");
  });

  it("renders a plain zero as a plain number, with no bound and no sign", () => {
    // The assertion guardrail 6 most wants and the one branch of this ternary nothing pinned.
    const props = makeTileProps({ ...BASE, zero: zeroRenderingFor(EXACT_ZERO, 0, "metres") });
    const tile = renderTile(doc, props);
    expect(tile.querySelector(".tile-zero-value")?.textContent).toBe("0.000");
    expect(tile.querySelector(".tile-zero-unit")?.textContent).toBe("m");
  });

  it("prints no bound on a geometric zero that readings sit below", () => {
    // Minimum clearance: its zero is where the two outlines touch, and an overlap reads below it.
    // A "greater than" sign here would contradict both the phrase beside it and the value above.
    const props = makeTileProps({
      ...BASE,
      reading: measured(-0.05),
      anchor: null,
      zero: zeroRenderingFor(GEOMETRIC_REFERENCE, 0, "metres"),
    });
    const tile = renderTile(doc, props);
    expect(tile.querySelector(".tile-zero-value")?.textContent).toBe("0.000");
  });

  it("gives minimum clearance a zero that is not a floor, and the two cost columns ones that are", () => {
    // Pinned against the real catalogue, not a fixture: the rendering above is only correct
    // because these three declare what they declare.
    const clearance = COLUMNS.minClearanceM.zero;
    expect(clearance.kind).toBe("geometricBound");
    expect(clearance.kind === "geometricBound" && clearance.noRunReadsBelow).toBe(false);
    for (const key of ["robotPathM", "robotArrivalS"] as const) {
      const zero = COLUMNS[key].zero;
      expect(zero.kind).toBe("geometricBound");
      expect(zero.kind === "geometricBound" && zero.noRunReadsBelow).toBe(true);
    }
  });

  it("prints no metre or second value outside a value slot", () => {
    const tile = renderTile(
      doc,
      makeTileProps({
        ...BASE,
        gauge: { kind: "bandMeasured", bandM: 0.311, nReplicates: 8 },
      }),
    );
    expect(literalsOutsideValueSlots(tile)).toEqual([]);
  });

  it("says the band is unmeasured rather than drawing one", () => {
    const tile = renderTile(doc, makeTileProps(BASE));
    expect(tile.querySelector(".gauge-caption")?.textContent).toBe(BAND_NOT_MEASURED);
    expect(tile.querySelectorAll(".gauge-wedge").length).toBe(0);
    expect(tile.querySelectorAll(".gauge-tick").length).toBe(0);
  });

  it("draws one wedge and one tick when the band has been measured", () => {
    const tile = renderTile(
      doc,
      makeTileProps({ ...BASE, gauge: { kind: "bandMeasured", bandM: 0.311, nReplicates: 8 } }),
    );
    expect(tile.querySelectorAll(".gauge-wedge").length).toBe(1);
    expect(tile.querySelectorAll(".gauge-tick").length).toBe(1);
    expect(tile.querySelector(".gauge-number")?.textContent).toBe("8");
    expect(tile.querySelector(".gauge-figure")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the real column catalogue, rendered", () => {
  /**
   * The guard CLAUDE.md's "no numeric literal appears in console copy" sentence claims, pointed at
   * the strings that are actually shipped.
   *
   * It used to run on the `BASE` fixture above, whose label, assumption, anchor and zero phrase are
   * all written in this file — so the only real strings it ever scanned were the three hardcoded
   * inside `tile.ts`, and six catalogue phrases carrying literal metres went unnoticed for the
   * whole of the console's life. Every column is rendered here, not just the seven headlines: a
   * column nobody has ticked yet is still copy a reader can reach through the column picker.
   */
  const context = realContext();

  it("prints no metre or second value outside a value slot, for any column", () => {
    const offenders: string[] = [];
    for (const key of COLUMN_ORDER) {
      const descriptor = COLUMNS[key];
      // The zero's resolved VALUE is not what is under test — the strings are — so every column
      // that needs a finite one is handed the same plausible number. `notAPerturbation` is the
      // one kind whose value is NaN by contract, and `zeroRenderingFor` refuses a NaN for any
      // other kind, which is why this is not simply zero everywhere.
      const resolved = descriptor.zero.kind === "notAPerturbation" ? Number.NaN : 0.25;
      const value = 0.352;
      const tile = renderTile(
        doc,
        makeTileProps({
          column: key,
          label: descriptor.label,
          unit: descriptor.unit,
          reading: measured(value),
          zero: zeroRenderingFor(descriptor.zero, resolved, descriptor.unit),
          gauge: { kind: "bandMeasured", bandM: 0.311, nReplicates: 8 },
          stamps: [{ kind: "settingStamp", label: "people", value: 18, unit: "people" }],
          assumption: descriptor.assumption(context),
          anchor: descriptor.needsAnchor ? anchorFor(value) : null,
        }),
      );
      for (const offender of literalsOutsideValueSlots(tile)) {
        offenders.push(`${key} -> ${offender}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("renders a bound only where the column says no run reads below its zero", () => {
    for (const key of COLUMN_ORDER) {
      const descriptor = COLUMNS[key];
      if (descriptor.zero.kind === "notAPerturbation") {
        continue;
      }
      const rendering = zeroRenderingFor(descriptor.zero, 0.25, descriptor.unit);
      const expected =
        descriptor.zero.kind === "geometricBound" ? descriptor.zero.noRunReadsBelow : false;
      expect(rendering.bound, `${key} renders the wrong kind of zero`).toBe(expected);
    }
  });
});
