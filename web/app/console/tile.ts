import { ContractError } from "../../engine/core/errors.js";
import type { ColumnKey, Reading, UnitKey, ZeroReference } from "../../engine/job/columns.js";

/**
 * One headline readout, and the one-dimensional ruler underneath it.
 *
 * The gauge is a hairline scale from zero, a filled wedge covering the run-to-run band, and one
 * tick at the value. It is a ruler rather than a box on purpose: it discharges guardrail 6 (what
 * this would read if the answer were zero) and guardrail 7 (a metre never appears alone) in a
 * single glyph, and it is one of the four non-rectangular elements on the page.
 *
 * `zero` is a required prop. It is not optional, it is not inside the <details>, and the tests
 * beside this file assert both. A zero-reference the reader has to open is a zero-reference that
 * was not shown.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

const DECIMALS: Readonly<Record<UnitKey, number>> = Object.freeze({
  metres: 3,
  seconds: 1,
  count: 0,
  ratio: 2,
  people: 0,
  none: 3,
});

const SUFFIX: Readonly<Record<UnitKey, string>> = Object.freeze({
  metres: "m",
  seconds: "s",
  count: "",
  ratio: "×",
  people: "people",
  none: "",
});

export const BAND_NOT_MEASURED = "not yet measured — press Run";

export function formatValue(value: number, unit: UnitKey): string {
  const places = DECIMALS[unit];
  return value.toFixed(places);
}

export function unitSuffix(unit: UnitKey): string {
  return SUFFIX[unit];
}

export interface ZeroRendering {
  readonly kind: "zeroRendering";
  /**
   * The phrase alone. It never contains a number — the number is `value`, printed immediately
   * before it. Six catalogue phrases used to say "…reads 0.000 m" beside a slot already printing
   * 0.000 m, and `tile.test.ts` now renders every real column to keep that from coming back.
   */
  readonly how: string;
  /** NaN only when the reference is `notAPerturbation`. */
  readonly value: number;
  readonly unit: UnitKey;
  /**
   * Whether to print the value as a floor, with a "greater than" sign in front of it.
   *
   * Read off the reference's own `noRunReadsBelow` field, never off its `kind`. Deriving it from
   * the kind put "> 0.000 m" under a minimum clearance of -0.050 m, beside a phrase saying that
   * clearances go below zero: one line contradicting itself and the number above it.
   */
  readonly bound: boolean;
}

export function zeroRenderingFor(
  reference: ZeroReference,
  resolved: number,
  unit: UnitKey,
): ZeroRendering {
  if (reference.how.length === 0) {
    throw new ContractError("a zero-reference must carry a phrase saying what its number means");
  }
  let value = resolved;
  let bound = false;
  if (reference.kind === "notAPerturbation") {
    value = Number.NaN;
  } else if (reference.kind === "geometricBound") {
    bound = reference.noRunReadsBelow;
  }
  if (reference.kind !== "notAPerturbation" && !Number.isFinite(value)) {
    throw new ContractError(
      `the zero-reference '${reference.how}' resolved to ${resolved}, which cannot be shown ` +
        `beside a number; a zero with no value is the error this tile exists to prevent`,
    );
  }
  return Object.freeze({ kind: "zeroRendering" as const, how: reference.how, value, unit, bound });
}

export type BandGauge =
  | { readonly kind: "bandMeasured"; readonly bandM: number; readonly nReplicates: number }
  | { readonly kind: "bandNotMeasured" };

export interface SettingStamp {
  readonly kind: "settingStamp";
  readonly label: string;
  readonly value: number;
  readonly unit: UnitKey;
}

export interface TilePropsInit {
  readonly column: ColumnKey;
  readonly label: string;
  readonly unit: UnitKey;
  readonly reading: Reading;
  readonly zero: ZeroRendering;
  readonly gauge: BandGauge;
  /** What this was measured at. Printed always, never on hover. */
  readonly stamps: readonly SettingStamp[];
  readonly assumption: string;
  /** Guardrail 7's body-scale phrase, or null for a unit that needs no anchor. */
  readonly anchor: string | null;
}

export interface TileProps extends TilePropsInit {
  readonly kind: "tileProps";
}

export function makeTileProps(init: TilePropsInit): TileProps {
  if (init.zero === undefined || init.zero.kind !== "zeroRendering") {
    throw new ContractError(
      `the tile for '${String(init.column)}' was built without a zero reading; every number on ` +
        `this page shows what it would read if the answer were zero`,
    );
  }
  if (init.reading === undefined || init.reading.kind !== "reading") {
    throw new ContractError(`the tile for '${String(init.column)}' was built without a reading`);
  }
  if (init.reading.availability.kind === "measured" && !Number.isFinite(init.reading.value)) {
    throw new ContractError(
      `the tile for '${String(init.column)}' claims a measured value of ${init.reading.value}`,
    );
  }
  if (init.label.length === 0) {
    throw new ContractError(`the tile for '${String(init.column)}' has no plain-English name`);
  }
  if (init.assumption.length === 0) {
    throw new ContractError(`the tile for '${String(init.column)}' states no assumption`);
  }
  for (const stamp of init.stamps) {
    if (stamp.kind !== "settingStamp" || !Number.isFinite(stamp.value)) {
      throw new ContractError(
        `the tile for '${String(init.column)}' carries a setting stamp with no value`,
      );
    }
  }
  return Object.freeze({ kind: "tileProps" as const, ...init, stamps: Object.freeze([...init.stamps]) });
}

function element(doc: Document, tag: string, className: string, content: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  if (content.length > 0) {
    node.textContent = content;
  }
  return node;
}

function svgLine(
  doc: Document,
  className: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Element {
  const node = doc.createElementNS(SVG_NS, "line");
  node.setAttribute("class", className);
  node.setAttribute("x1", x1.toFixed(2));
  node.setAttribute("y1", y1.toFixed(2));
  node.setAttribute("x2", x2.toFixed(2));
  node.setAttribute("y2", y2.toFixed(2));
  return node;
}

/** The gauge's top of scale: whichever of the band and the value is larger, with headroom. */
function gaugeDomain(bandM: number, reading: Reading): number {
  let top = bandM;
  if (reading.availability.kind === "measured" && reading.value > top) {
    top = reading.value;
  }
  const padded = top * 1.25;
  if (padded > 0) {
    return padded;
  }
  return 1;
}

function renderGauge(doc: Document, props: TileProps): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.className = "band-gauge";

  // Redundant with the tile's own text, so it is hidden from assistive technology rather than
  // given a label full of numbers that the text already carries.
  const figure = doc.createElementNS(SVG_NS, "svg");
  figure.setAttribute("class", "gauge-figure");
  figure.setAttribute("viewBox", "0 0 200 22");
  figure.setAttribute("aria-hidden", "true");
  figure.appendChild(svgLine(doc, "gauge-scale", 8, 15, 192, 15));
  figure.appendChild(svgLine(doc, "gauge-zero", 8, 11, 8, 19));

  if (props.gauge.kind === "bandMeasured") {
    const domain = gaugeDomain(props.gauge.bandM, props.reading);
    const xBand = 8 + (props.gauge.bandM / domain) * 184;
    const wedge = doc.createElementNS(SVG_NS, "path");
    wedge.setAttribute("class", "gauge-wedge");
    wedge.setAttribute("d", `M 8 15 L ${xBand.toFixed(2)} 15 L ${xBand.toFixed(2)} 7 Z`);
    figure.appendChild(wedge);
    if (props.reading.availability.kind === "measured") {
      const xValue = 8 + (props.reading.value / domain) * 184;
      figure.appendChild(svgLine(doc, "gauge-tick", xValue, 4, xValue, 19));
    }
  }
  wrap.appendChild(figure);

  const caption = doc.createElement("p");
  caption.className = "gauge-caption";
  if (props.gauge.kind === "bandNotMeasured") {
    caption.textContent = BAND_NOT_MEASURED;
  } else {
    caption.appendChild(element(doc, "span", "gauge-number", String(props.gauge.nReplicates)));
    caption.appendChild(
      element(
        doc,
        "span",
        "gauge-words",
        " replicate runs of this room with no robot in it, 95th percentile",
      ),
    );
  }
  wrap.appendChild(caption);
  return wrap;
}

function renderZero(doc: Document, zero: ZeroRendering): HTMLElement {
  const row = doc.createElement("p");
  row.className = "tile-zero";
  if (Number.isFinite(zero.value)) {
    const prefix = zero.bound ? "> " : "";
    row.appendChild(
      element(doc, "span", "tile-zero-value", `${prefix}${formatValue(zero.value, zero.unit)}`),
    );
    const suffix = unitSuffix(zero.unit);
    if (suffix.length > 0) {
      row.appendChild(element(doc, "span", "tile-zero-unit", suffix));
    }
  }
  row.appendChild(element(doc, "span", "tile-zero-how", zero.how));
  return row;
}

function renderStamps(doc: Document, stamps: readonly SettingStamp[]): HTMLElement {
  const row = doc.createElement("p");
  row.className = "tile-stamps";
  for (const stamp of stamps) {
    const wrap = doc.createElement("span");
    wrap.className = "stamp";
    wrap.appendChild(element(doc, "span", "stamp-label", stamp.label));
    wrap.appendChild(element(doc, "span", "stamp-value", formatValue(stamp.value, stamp.unit)));
    const suffix = unitSuffix(stamp.unit);
    if (suffix.length > 0) {
      wrap.appendChild(element(doc, "span", "stamp-unit", suffix));
    }
    row.appendChild(wrap);
  }
  return row;
}

export function renderTile(doc: Document, props: TileProps): HTMLElement {
  const tile = doc.createElement("section");
  tile.className = "tile";
  tile.setAttribute("data-column", String(props.column));

  tile.appendChild(element(doc, "p", "tile-label", props.label));

  const value = doc.createElement("p");
  value.className = "tile-value";
  if (props.reading.availability.kind === "measured") {
    value.appendChild(element(doc, "span", "tile-number", formatValue(props.reading.value, props.unit)));
    const suffix = unitSuffix(props.unit);
    if (suffix.length > 0) {
      value.appendChild(element(doc, "span", "tile-unit", suffix));
    }
  } else {
    value.classList.add("is-unavailable");
    value.appendChild(element(doc, "span", "tile-reason", props.reading.availability.why));
  }
  tile.appendChild(value);

  if (props.anchor !== null) {
    tile.appendChild(element(doc, "p", "tile-anchor", props.anchor));
  }

  tile.appendChild(renderGauge(doc, props));
  tile.appendChild(renderZero(doc, props.zero));
  tile.appendChild(renderStamps(doc, props.stamps));

  const working = doc.createElement("details");
  working.className = "tile-working";
  const summary = doc.createElement("summary");
  summary.textContent = "show the working";
  working.appendChild(summary);
  working.appendChild(element(doc, "p", "tile-assumption", props.assumption));
  tile.appendChild(working);

  return tile;
}
