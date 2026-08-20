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
