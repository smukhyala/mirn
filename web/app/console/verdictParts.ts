import type { UnitKey } from "../../engine/job/columns.js";
import type { MethodFigure } from "./method.js";
import { formatValue, unitSuffix, type SettingStamp } from "./tile.js";

/**
 * The elements every verdict on the method card is built from.
 *
 * ## Why this exists now and did not before
 *
 * These six were written once, in `method.ts`, and then copied into `suppliedVerdict.ts` and partly
 * into `powerVerdict.ts` — each time under an instruction not to widen the module they came from,
 * and each time with a comment saying so and adding: *if these are ever hoisted, all call sites move
 * together or none do.* Three surfaces was the point at which that stopped being a reasonable
 * trade.
 *
 * The copies had already drifted, which is the argument for doing it rather than a tidy-up
 * preference. Measured before the merge, function by function: `element` had lost its
 * empty-content guard in `powerVerdict.ts`, `renderFigure` was wrapped differently in
 * `suppliedVerdict.ts`, and the CSV pair's `formatValue` had lost both of the comments explaining
 * its rounding. All three differences turned out to be cosmetic — whitespace and comments, no
 * behaviour — and that is a fact worth recording rather than a reason to relax: three of nine
 * copies drifted within a few commits of being made, and the next difference had no reason to be
 * harmless.
 *
 * ## What is deliberately NOT here
 *
 * `renderClearing` stays in `method.ts`. It renders a `ClearingBlock`, whose two branches encode
 * the card's judgement about which families are detectors, and that judgement belongs beside the
 * catalogue that makes it rather than in a bag of shared elements. `appendRateRange` also stays:
 * it was already exported and already shared, for the reason its own comment gives.
 *
 * `powerVerdict.ts`'s `cellValue` and `headCell` stay there too. They build table cells, which no
 * other surface has, and hoisting a helper with one call site would be moving code away from the
 * only file that explains it.
 *
 * ## The one rule these encode
 *
 * Every digit a reader sees lives inside one of the value slots below — `figure-number`,
 * `figure-unit`, `figure-inline`, `figure-zero-value`, `figure-zero-unit`, `stamp-value`,
 * `stamp-unit`. That is the mechanical half of "no numeric literal appears in console copy": the
 * scans in `method.test.ts`, `suppliedVerdict.test.ts` and `powerVerdict.test.ts` fail on a digit
 * found anywhere else, so a caption that quoted a figure into its own sentence goes red rather than
 * sitting there outliving the settings that produced it.
 */

export function element(
  doc: Document,
  tag: string,
  className: string,
  content: string,
): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  if (content.length > 0) {
    node.textContent = content;
  }
  return node;
}

export function part(doc: Document, name: string, heading: string): HTMLElement {
  const section = doc.createElement("section");
  section.className = "verdict-part";
  section.setAttribute("data-part", name);
  if (heading.length > 0) {
    section.appendChild(element(doc, "h3", "verdict-part-title", heading));
  }
  return section;
}

/** A value and its unit, in their own spans, at headline size. */
export function quantity(
  doc: Document,
  host: HTMLElement,
  value: number,
  unit: UnitKey,
): void {
  host.appendChild(element(doc, "span", "figure-number", formatValue(value, unit)));
  const suffix = unitSuffix(unit);
  if (suffix.length > 0) {
    host.appendChild(element(doc, "span", "figure-unit", suffix));
  }
}

/** The same value and unit, at reading size rather than headline size, for use inside a sentence. */
export function inlineQuantity(
  doc: Document,
  host: HTMLElement,
  value: number,
  unit: UnitKey,
): void {
  host.appendChild(element(doc, "span", "figure-inline", formatValue(value, unit)));
  const suffix = unitSuffix(unit);
  if (suffix.length > 0) {
    host.appendChild(element(doc, "span", "figure-unit", suffix));
  }
}

/** A labelled figure with its anchor and the zero it would read, which is guardrail 6's shape. */
export function renderFigure(
  doc: Document,
  figure: MethodFigure,
  name: string,
): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.className = "method-figure";
  wrap.setAttribute("data-number", name);
  wrap.appendChild(element(doc, "p", "figure-label", figure.label));

  const value = doc.createElement("p");
  value.className = "figure-value";
  quantity(doc, value, figure.value, figure.unit);
  wrap.appendChild(value);

  if (figure.anchor !== null) {
    wrap.appendChild(element(doc, "p", "figure-anchor", figure.anchor));
  }

  const zero = doc.createElement("p");
  zero.className = "figure-zero";
  zero.appendChild(
    element(doc, "span", "figure-zero-value", formatValue(figure.zeroValue, figure.unit)),
  );
  const suffix = unitSuffix(figure.unit);
  if (suffix.length > 0) {
    zero.appendChild(element(doc, "span", "figure-zero-unit", suffix));
  }
  zero.appendChild(element(doc, "span", "figure-zero-how", figure.zeroHow));
  wrap.appendChild(zero);
  return wrap;
}

/** What a measurement was taken at, printed always and never on hover. */
export function renderStamps(
  doc: Document,
  stamps: readonly SettingStamp[],
): HTMLElement {
  const row = doc.createElement("p");
  row.className = "method-stamps";
  for (const entry of stamps) {
    const wrap = doc.createElement("span");
    wrap.className = "stamp";
    wrap.appendChild(element(doc, "span", "stamp-label", entry.label));
    wrap.appendChild(element(doc, "span", "stamp-value", formatValue(entry.value, entry.unit)));
    const suffix = unitSuffix(entry.unit);
    if (suffix.length > 0) {
      wrap.appendChild(element(doc, "span", "stamp-unit", suffix));
    }
    row.appendChild(wrap);
  }
  return row;
}
