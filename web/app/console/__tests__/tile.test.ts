import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { ContractError } from "../../../engine/core/errors.js";
import type { Reading, ZeroReference } from "../../../engine/job/columns.js";
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
  how: "the shortest crossing this room allows",
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

  it("prints no metre or second value outside a value slot", () => {
    const tile = renderTile(
      doc,
      makeTileProps({
        ...BASE,
        gauge: { kind: "bandMeasured", bandM: 0.311, nReplicates: 8 },
      }),
    );
    const slots = ["tile-number", "tile-zero-value", "stamp-value", "gauge-number"];
    const literal = /\d+\.\d+\s*(m|s)\b/;
    const offenders: string[] = [];
    for (const leaf of leafText(tile)) {
      if (slots.includes(leaf.className)) {
        continue;
      }
      if (literal.test(leaf.text)) {
        offenders.push(`${leaf.className}: ${leaf.text}`);
      }
    }
    expect(offenders).toEqual([]);
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
