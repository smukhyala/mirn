/**
 * What the runtime can actually draw, as plain data with no DOM in it.
 *
 * This exists so the BUILD can check a page against the runtime's capabilities. The obvious
 * approach — importing the predicates straight from `web/notes.ts` — runs that module's boot code,
 * which touches `document` and dies under Node. So the names live here, the runtime imports them
 * and is tested against them, and the compiler imports them without dragging a browser in.
 *
 * Every entry below corresponds to a bug that shipped: a `predict` block that rendered a red error
 * box on five pages, `mirn:quantity` blocks naming metrics that did not exist and being served a
 * different quantity's working, and six scenes asking for dials the runtime silently ignored while
 * the prose told the reader to drag them.
 */

export const WIDGET_KINDS: readonly string[] = Object.freeze([
  "scene",
  "sweep",
  "quantity",
  "predict",
]);

/** Dials that change what is simulated. Each must have an entry in the runtime's KNOBS. */
export const KNOB_NAMES: readonly string[] = Object.freeze([
  "repulsionScale",
  "crowdSize",
  "robotSpeed",
  "passingOffset",
  "perceptionNoise",
  "deflectionWeight",
  "seed",
]);

/** Controls that change what is drawn rather than what is simulated. */
export const VIEW_TOGGLE_NAMES: readonly string[] = Object.freeze([
  "showControl",
  "showGaps",
  "seeRobot",
]);

/** Transport controls, always available. */
export const TRANSPORT_NAMES: readonly string[] = Object.freeze(["play", "scrub"]);

/** Quantities a `mirn:quantity` block may ask to have explained. */
export const METRIC_NAMES: readonly string[] = Object.freeze([
  "deviation",
  "deviation-summary",
  "perturbation",
  "detection-floor",
  "timeLost",
  "nearMiss",
]);

export function isKnownControl(name: string): boolean {
  return (
    TRANSPORT_NAMES.includes(name) ||
    KNOB_NAMES.includes(name) ||
    VIEW_TOGGLE_NAMES.includes(name)
  );
}

export function isKnownMetric(name: string): boolean {
  return METRIC_NAMES.includes(name);
}

export function isKnownWidgetKind(name: string): boolean {
  return WIDGET_KINDS.includes(name);
}
