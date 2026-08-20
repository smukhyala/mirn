/**
 * Plain-English names for machine keys, harvested from `src/mirn_app/static/app.js:487-516`
 * on the `feat/simulation-page` branch.
 *
 * These exist because guardrail 11 forbids a bare code identifier reaching a reader. Every
 * lookup here falls back to the raw key rather than throwing: a missing label should show up
 * as an ugly identifier in the page (which the jargon test then catches by name) rather than
 * as a blank tile or a crash.
 */

/** Keys whose expansion lives only inside a disclosure that is closed by default, so the
 *  abbreviation is spelled out at the point of use instead. */
const UNIT_LABEL: Readonly<Record<string, string>> = {
  metres: "metres",
  mdp: "× the detection floor",
  s: "seconds",
  deg: "degrees",
  count: "",
  ratio: "×",
  none: "",
};

/** The placebo experiment labels its rows by variant rather than by estimator; neither value
 *  is a card key, so they get plain-English names of their own. */
const VARIANT_LABEL: Readonly<Record<string, string>> = {
  full: "Everyone present",
  pedestrian_removed: "One bystander removed",
};

export function unitLabel(units: string): string {
  const label = UNIT_LABEL[units];
  if (label === undefined) {
    return units;
  }
  return label;
}

export function variantLabel(variant: string): string {
  const label = VARIANT_LABEL[variant];
  if (label === undefined) {
    return variant;
  }
  return label;
}

/**
 * A metre means nothing until it is a body-scale comparison.
 *
 * This is guardrail 7 in one function: a length may appear, but never alone. It lives here rather
 * than beside its first caller because two things need the identical wording — the derivation
 * panel in `web/notes.ts`, which shows it under a live number, and the `{{q:…anchor}}` token in
 * `web/build/quantities.ts`, which is the sanctioned escape from the comparative lint. Two copies
 * of these five phrases would drift, and the drift would be a page whose prose disagreed with the
 * panel directly below it.
 *
 * The bands are ordinary human distances, not round numbers: below the wobble of a normal
 * walking gait, a part-stride, a stride, a doorway.
 */
export function anchorFor(metres: number): string {
  if (metres < 0.15) {
    return "less than the wobble of ordinary walking";
  }
  if (metres < 0.5) {
    return "half a stride";
  }
  if (metres < 1.0) {
    return "one stride";
  }
  if (metres < 2.0) {
    return "the width of a doorway";
  }
  return "several strides";
}

/** Estimator and metric names come from their card's title, so the prose lives in one place. */
export function titleFromCard(
  cards: Readonly<Record<string, { readonly title?: string }>>,
  key: string,
): string {
  const card = cards[key];
  if (card !== undefined && card.title !== undefined && card.title.length > 0) {
    return card.title;
  }
  return key;
}
