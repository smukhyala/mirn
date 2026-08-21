/**
 * The numeric inner loops.
 *
 * This is the fast layer, and it is where the float behaviour that has to match numpy is decided:
 * pairwise summation, per-step distance, path length, argmax tie-breaking and the linear quantile.
 * `metrics.ts` composes these into the six measurements the lesson quotes. Everything here is unit
 * tested directly and covered again by the cross-language parity fixtures.
 *
 * Neither this file nor `metrics.ts` explains itself. The wording a reader opens underneath a
 * number is written separately, by the derivation builders in `web/notes.ts`, and nothing checks
 * that the two still describe the same arithmetic — so a formula change here is not finished until
 * its builder has been changed too.
 *
 * `Math.hypot` is banned throughout this directory. V8's implementation scales to avoid
 * intermediate overflow and is *more* accurate than numpy's naive `sqrt(sum(d*d))` — so it
 * disagrees with the oracle in the last bits, which is the one thing a parity harness must not
 * have to tolerate. `__tests__/hypot.test.ts` enforces that by reading this directory's source;
 * before it existed the ban was three comments and no check.
 */

/**
 * Pairwise (divide-and-conquer) summation, matching numpy's accumulation strategy rather than a
 * left-to-right fold. numpy's `mean` and `sum` are pairwise, so a naive fold differs from the
 * oracle by a few ULP — small, but it is the difference between a parity fixture that holds at
 * 1e-15 and one that has to be loosened until it stops meaning anything.
 */
export function pairwiseSum(values: Float64Array, from: number, to: number): number {
  const count = to - from;
  if (count <= 0) {
    return 0;
  }
  if (count <= 8) {
    let total = 0;
    for (let i = from; i < to; i++) {
      total += values[i] as number;
    }
    return total;
  }
  const half = from + (count >> 1);
  return pairwiseSum(values, from, half) + pairwiseSum(values, half, to);
}

export function mean(values: Float64Array): number {
  if (values.length === 0) {
    return 0;
  }
  return pairwiseSum(values, 0, values.length) / values.length;
}

/** Per-timestep Euclidean distance between two flat (T, 2) paths. Allocates one output array. */
export function perStepDistance(a: Float64Array, b: Float64Array): Float64Array {
  const nSteps = a.length / 2;
  const out = new Float64Array(nSteps);
  for (let t = 0; t < nSteps; t++) {
    const dx = (a[2 * t] as number) - (b[2 * t] as number);
    const dy = (a[2 * t + 1] as number) - (b[2 * t + 1] as number);
    out[t] = Math.sqrt(dx * dx + dy * dy);
  }
  return out;
}

/** Cumulative polyline length of a flat (T, 2) path. */
export function pathLength(path: Float64Array): number {
  const nSteps = path.length / 2;
  if (nSteps < 2) {
    return 0;
  }
  const segments = new Float64Array(nSteps - 1);
  for (let t = 1; t < nSteps; t++) {
    const dx = (path[2 * t] as number) - (path[2 * t - 2] as number);
    const dy = (path[2 * t + 1] as number) - (path[2 * t - 1] as number);
    segments[t - 1] = Math.sqrt(dx * dx + dy * dy);
  }
  return pairwiseSum(segments, 0, segments.length);
}

export function argmax(values: Float64Array): number {
  let best = 0;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i++) {
    const value = values[i] as number;
    // Strict `>` so ties resolve to the FIRST index, matching numpy's argmax. `>=` would resolve
    // to the last and the two languages would disagree on the witness for a flat maximum.
    if (value > bestValue) {
      bestValue = value;
      best = i;
    }
  }
  return best;
}

/**
 * numpy's default quantile, `method="linear"`, at index `(n - 1) * q`.
 *
 * Reimplemented rather than approximated: there are nine interpolation conventions in common use
 * and picking a different one silently shifts every detection floor on the site.
 */
export function quantileLinear(sorted: Float64Array, q: number): number {
  const n = sorted.length;
  if (n === 0) {
    return Number.NaN;
  }
  if (n === 1) {
    return sorted[0] as number;
  }
  const position = (n - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sorted[lower] as number;
  }
  const frac = position - lower;
  const a = sorted[lower] as number;
  const b = sorted[upper] as number;
  return a + (b - a) * frac;
}
