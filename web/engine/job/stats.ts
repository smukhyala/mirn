/**
 * The numeric helpers the experiment script and the console both average with.
 *
 * This file must never import from `web/engine/measure/`. That directory is checked against a
 * Python oracle and `web/engine/job/` deliberately is not (CLAUDE.md, guardrails 8 and 9), so a
 * shared dependency between them would drag one into the other's parity obligations for no
 * benefit.
 *
 * These three were lifted verbatim out of scripts/measure-experiments.ts. The filter/reduce form
 * survives the house preference for explicit loops on purpose: web/data/experiment-facts.json is
 * committed and diffed byte for byte, so the summation order here is observable output rather
 * than style.
 */

/**
 * Mean over the FINITE values, which is a survivorship trap and is why every swept column also
 * reports how many runs it actually averaged.
 *
 * A censored measurement — recovery that never came inside its tolerance, an arrival that never
 * happened — comes back NaN and gets dropped here. Recovery time was once averaged over as few as
 * two of eight runs and presented as a property of the eight, with nothing on the page or in the
 * facts file to say so. Dropping the value is right; dropping it silently is not, which is what
 * `finiteCount` is for.
 */
export function meanOf(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return Number.NaN;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

/** How many of the values were finite — the denominator a mean must never be quoted without. */
export function finiteCount(values: readonly number[]): number {
  return values.filter((v) => Number.isFinite(v)).length;
}

/**
 * Sample standard deviation, n-1, over the finite values.
 *
 * NaN below two survivors rather than 0: a 0 there reads as "measured, and there was no spread",
 * which is the opposite of "there was not enough left to say".
 */
export function sdOf(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return Number.NaN;
  const m = meanOf(finite);
  return Math.sqrt(finite.reduce((a, b) => a + (b - m) ** 2, 0) / (finite.length - 1));
}
