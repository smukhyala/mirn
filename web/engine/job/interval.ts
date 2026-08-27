import { fail } from "../core/errors.js";

/**
 * A rate, and how well a count of rooms pins it down.
 *
 * The page reports "cleared the line on 8 of 8 rooms" and eight rooms pin a rate down poorly:
 * 8 of 8 is consistent with a true rate anywhere from about two-thirds to certainty. A reader
 * comparing 8 of 8 against 6 of 8 is comparing two numbers whose intervals overlap heavily, and
 * a fraction printed with nothing to judge its precision against is guardrail 6's own error one
 * level up — a value with no stated uncertainty.
 *
 * **Wilson score, never Wald.** Wald collapses to zero width at 0 of n and at n of n, which are
 * exactly the counts this bench produces most often, so on the case that motivates the whole
 * thing it would print an interval of no width on eight observations — a worse lie than no
 * interval at all. `interval.test.ts` computes the Wald form inline at 8 of 8 and asserts it is
 * degenerate, so the reason for this choice is pinned by a test rather than by this paragraph.
 * Wilson is closed form, needs no distribution table, and stays inside nought and one at every
 * count.
 *
 * **This is not a new measurement and it gets no zero of its own.** It qualifies a figure that
 * already carries one. Rendering it as a separate figure with a separate zero would imply a
 * second measurement that was not made.
 *
 * **It owes no parity fixture.** Python computes no proportion interval, so guardrail 8's
 * two-implementation rule is not engaged here. Recorded so the next audit does not re-derive it.
 *
 * **What it does not say.** A confidence interval describes sampling error and nothing else: how
 * much the count would move if the same bench ran the same rulers on more rooms of the same
 * invented crowd. It says nothing about the two things that actually bound these numbers — that
 * the crowd is calibrated against nothing, and that a room is not a corridor. A narrower interval
 * is a more precise number, not a truer one.
 */
export interface RateInterval {
  readonly kind: "rateInterval";
  readonly nCleared: number;
  readonly nAttempted: number;
  /** The point estimate the interval qualifies: `nCleared / nAttempted`. */
  readonly point: number;
  /** Wilson lower bound, clamped into [0, 1]. */
  readonly low: number;
  /** Wilson upper bound, clamped into [0, 1]. */
  readonly high: number;
  /** The confidence level the bounds were computed at, e.g. 0.95. */
  readonly confidence: number;
}

/**
 * The two-sided normal quantiles, as a closed table.
 *
 * A closed lookup is honest and testable; an inverse normal CDF would be a second formula
 * nobody checks, approximating a constant that is known exactly. Three entries is what the
 * surface needs, and a confidence the table does not hold is refused rather than approximated.
 * Adding a level means adding a row here, which is a visible diff.
 */
const Z_FOR_CONFIDENCE: ReadonlyMap<number, number> = new Map<number, number>([
  [0.9, 1.6448536269514722],
  [0.95, 1.959963984540054],
  [0.99, 2.5758293035489004],
]);

const DEFAULT_CONFIDENCE = 0.95;

/** The confidence levels this module will compute, smallest first. For tests and for callers
 * offering a control. */
export function supportedConfidences(): readonly number[] {
  const levels: number[] = [];
  for (const level of Z_FOR_CONFIDENCE.keys()) {
    levels.push(level);
  }
  levels.sort((a, b) => a - b);
  return Object.freeze(levels);
}

function clampToUnit(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function zFor(confidence: number): number {
  const z = Z_FOR_CONFIDENCE.get(confidence);
  if (z === undefined) {
    const known = supportedConfidences().join(", ");
    fail(`confidence must be one of ${known}, got ${confidence}`);
  }
  return z;
}

function checkCounts(nCleared: number, nAttempted: number): void {
  if (!Number.isInteger(nAttempted)) {
    fail(`nAttempted must be a whole number of rooms, got ${nAttempted}`);
  }
  if (!Number.isInteger(nCleared)) {
    fail(`nCleared must be a whole number of rooms, got ${nCleared}`);
  }
  if (nAttempted < 1) {
    fail(`nAttempted must be at least 1, got ${nAttempted}`);
  }
  if (nCleared < 0) {
    fail(`nCleared must not be negative, got ${nCleared}`);
  }
  if (nCleared > nAttempted) {
    fail(`nCleared must not exceed nAttempted, got ${nCleared} of ${nAttempted}`);
  }
}

/**
 * The Wilson score interval, in its standard closed form.
 *
 * With p = k/n, z the two-sided normal quantile for the level and d = 1 + z^2/n:
 *
 *   centre    = (p + z^2/(2n)) / d
 *   halfWidth = (z / d) * sqrt( p(1-p)/n + z^2/(4n^2) )
 *
 * and the bounds are centre -/+ halfWidth, clamped into [0, 1]. The clamp is belt and braces:
 * the closed form already stays inside the unit interval, and the only thing it guards is the
 * last bit of a float at an endpoint.
 */
export function wilsonInterval(
  nCleared: number,
  nAttempted: number,
  confidence: number = DEFAULT_CONFIDENCE,
): RateInterval {
  checkCounts(nCleared, nAttempted);
  const z = zFor(confidence);

  const n = nAttempted;
  const p = nCleared / n;
  const zSquared = z * z;
  const shift = zSquared / (2 * n);
  const denominator = 1 + zSquared / n;

  const centre = (p + shift) / denominator;
  const varianceTerm = (p * (1 - p)) / n;
  // Not a continuity correction: z^2/(4n^2) falls out of the score algebra, and it is the term
  // that keeps the width away from zero when p is 0 or 1 and the variance term vanishes.
  const zTerm = zSquared / (4 * n * n);
  const spread = Math.sqrt(varianceTerm + zTerm);
  const halfWidth = (z / denominator) * spread;

  // At p = 0 the shift term and the half width are the same quantity, so `centre - halfWidth` is
  // exactly 0 in real arithmetic, and at p = 1 the two sum to d/d, so the upper bound is exactly
  // 1. In floating point they miss by an ulp or two, and they miss in the direction that puts a
  // bound on the wrong side of the point estimate it is meant to contain: 0 of 7 came out with a
  // lower bound of 2.78e-17, above the 0 it qualifies. Snapping the endpoint is the exact answer
  // rather than a tolerance, so it is done here and not absorbed into the tests.
  const lowRaw = nCleared === 0 ? 0 : centre - halfWidth;
  const highRaw = nCleared === nAttempted ? 1 : centre + halfWidth;

  const low = clampToUnit(lowRaw);
  const high = clampToUnit(highRaw);

  return Object.freeze({
    kind: "rateInterval" as const,
    nCleared,
    nAttempted,
    point: p,
    low,
    high,
    confidence,
  });
}
