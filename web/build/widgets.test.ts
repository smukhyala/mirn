import { describe, expect, it } from "vitest";
import {
  isKnownControl,
  isKnownMetric,
  isKnownWidgetKind,
  KNOB_NAMES,
  METRIC_NAMES,
  VIEW_TOGGLE_NAMES,
} from "./widgets.js";

/**
 * These lists are the contract between the compiler and the runtime.
 *
 * The build refuses a page that asks for a figure, metric or dial the browser cannot draw. That
 * check is only worth having if the lists actually describe the runtime, so the runtime imports
 * them rather than keeping its own copy, and these tests pin the shape.
 */
describe("the widget registry", () => {
  it("knows every figure kind the pages use", () => {
    for (const kind of ["scene", "sweep", "quantity", "predict"]) {
      expect(isKnownWidgetKind(kind)).toBe(true);
    }
    expect(isKnownWidgetKind("histogram")).toBe(false);
  });

  it("accepts the transport controls, every dial, and every view toggle", () => {
    expect(isKnownControl("play")).toBe(true);
    expect(isKnownControl("scrub")).toBe(true);
    for (const name of [...KNOB_NAMES, ...VIEW_TOGGLE_NAMES]) {
      expect(isKnownControl(name)).toBe(true);
    }
  });

  it("rejects a dial nobody wired up", () => {
    // Six pages once told the reader to drag exactly this class of control, and the runtime
    // silently ignored it. The only symptom was a slider that was never there.
    expect(isKnownControl("crowdDensity")).toBe(false);
    expect(isKnownControl("robotAggression")).toBe(false);
  });

  it("rejects a metric with no builder", () => {
    // Two pages asked for metrics that did not exist and were served the deviation panel — a
    // working for a quantity neither page was discussing.
    expect(isKnownMetric("timeLost")).toBe(true);
    expect(isKnownMetric("nearMiss")).toBe(true);
    expect(isKnownMetric("socialCost")).toBe(false);
  });

  it("has no duplicate names across the control families", () => {
    const all = [...KNOB_NAMES, ...VIEW_TOGGLE_NAMES, "play", "scrub"];
    expect(new Set(all).size).toBe(all.length);
  });

  it("lists every metric exactly once", () => {
    expect(new Set(METRIC_NAMES).size).toBe(METRIC_NAMES.length);
  });
});
