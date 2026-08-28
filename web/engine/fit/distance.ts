import { fail } from "../core/errors.js";
import { quantileLinear } from "../measure/kernels.js";

/**
 * How far apart two bags of speeds are, in metres per second.
 *
 * ## What it is
 *
 * The mean absolute gap between the two samples' quantile functions, read at a fixed ladder of
 * quantiles. That is the 1-Wasserstein distance between the two distributions, approximated on a
 * grid, and the reason to prefer it here is that it comes out **in the units of the thing being
 * compared**. A reader is told the invented crowd's speeds sit 0.08 m/s from the recording's, which
 * is a sentence about walking. A test statistic with a p-value attached would be a sentence about
 * statistics, and it would invite exactly the reading guardrail 1 forbids: that a small enough
 * number licenses the disturbance figures elsewhere on the site.
 *
 * It is nought when the two distributions match and grows as they part. It is symmetric. It does
 * not care about the order the speeds came in, which is correct — a crowd is being compared to a
 * crowd, not a person to a person, and nothing here can or should line one walker up against
 * another.
 *
 * ## The ladder, and why the ends are left off
 *
 * Quantiles from 0.05 to 0.95. The extremes are excluded on purpose: the maximum of a tracked
 * pedestrian speed sample is usually a tracking error rather than a sprint, and a distance that
 * included it would move more when a tracker glitched than when the crowd's walking changed.
 *
 * It bounds that rather than abolishing it, and the difference is worth stating because the test
 * beside this file first asserted the stronger version and went red. On a small sample the top rung
 * interpolates a little way into the gap below the maximum, so some of an outlier leaks in; the
 * leak shrinks as the sample grows, and at the thousands of steps a real recording carries, a lone
 * glitch sits outside the ladder entirely. This is a judgement, stated rather than buried, and the
 * kind of thing that should be argued with rather than inherited.
 *
 * ## No oracle is owed
 *
 * Guardrail 8 binds any formula that exists in BOTH languages. This one exists only here: Python
 * has no fitting routine and gains none, because guardrail 9 keeps the shared surface to
 * `web/engine/measure/` and the crowd itself is TypeScript-only by rule. If a fit is ever ported,
 * it gets a parity fixture like everything else. `quantileLinear` — the one piece of arithmetic
 * borrowed from the oracle-backed layer — already has one.
 */

/**
 * Where the two distributions are compared. Nineteen rungs, evenly spaced, ends excluded.
 *
 * A closed table like every other catalogue here, and written out rather than generated so that a
 * change to it is a visible diff rather than a changed loop bound.
 */
export const QUANTILE_LADDER: readonly number[] = Object.freeze([
  0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85,
  0.9, 0.95,
]);

/** A sorted copy. The input is never reordered: callers hold onto their samples. */
function sortedCopy(values: Float64Array): Float64Array {
  const copy = new Float64Array(values);
  copy.sort();
  return copy;
}

/**
 * The distance between two speed samples, in metres per second.
 *
 * Both samples must hold something. An empty one is refused rather than treated as a distribution
 * of nothing: a distance to an empty sample is not large, it is undefined, and returning a number
 * there would put a figure on a page that describes no comparison.
 */
export function speedDistance(left: Float64Array, right: Float64Array): number {
  if (left.length < 1 || right.length < 1) {
    fail(
      "a distance between two sets of speeds needs speeds on both sides, and one of them is empty",
    );
  }

  const a = sortedCopy(left);
  const b = sortedCopy(right);

  let total = 0;
  for (const q of QUANTILE_LADDER) {
    total = total + Math.abs(quantileLinear(a, q) - quantileLinear(b, q));
  }
  return total / QUANTILE_LADDER.length;
}
