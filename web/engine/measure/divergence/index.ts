import { fail } from "../../core/errors.js";
import { mean, pairwiseSum, perStepDistance } from "../kernels.js";

/**
 * Divergences, ported from src/mirn/divergence/. Each is a rule for turning two paths — or two
 * clouds of points — into a single number saying how far apart they are.
 *
 * These are the functions the parity harness compares against Python, so the summation order and
 * the tie-breaking are part of the contract, not implementation detail. Deviating from Python
 * here is a bug even when the alternative is more accurate.
 */
export interface Divergence {
  readonly name: string;
  readonly betweenPaths: ((a: Float64Array, b: Float64Array) => number) | null;
  readonly betweenClouds: ((a: Float64Array, b: Float64Array) => number) | null;
}

function validatePath(path: Float64Array, label: string): void {
  if (path.length % 2 !== 0 || path.length < 2) {
    fail(`${label} must be a flat (T, 2) buffer with T >= 1, got length ${path.length}`);
  }
}

function requireEqualLength(a: Float64Array, b: Float64Array, label: string): void {
  if (a.length !== b.length) {
    fail(`${label} requires equal-length paths, got ${a.length / 2} != ${b.length / 2}`);
  }
}

export function ade(a: Float64Array, b: Float64Array): number {
  validatePath(a, "ade a");
  validatePath(b, "ade b");
  requireEqualLength(a, b, "ade");
  return mean(perStepDistance(a, b));
}

export function fde(a: Float64Array, b: Float64Array): number {
  validatePath(a, "fde a");
  validatePath(b, "fde b");
  requireEqualLength(a, b, "fde");
  const last = a.length - 2;
  const dx = (a[last] as number) - (b[last] as number);
  const dy = (a[last + 1] as number) - (b[last + 1] as number);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Symmetrised mean nearest-neighbour distance. Python calls this ADE's point-cloud form. */
export function adeBetweenClouds(a: Float64Array, b: Float64Array): number {
  validatePath(a, "adeBetweenClouds a");
  validatePath(b, "adeBetweenClouds b");
  const n = a.length / 2;
  const m = b.length / 2;

  const aToB = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let j = 0; j < m; j++) {
      const dx = (a[2 * i] as number) - (b[2 * j] as number);
      const dy = (a[2 * i + 1] as number) - (b[2 * j + 1] as number);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < nearest) {
        nearest = d;
      }
    }
    aToB[i] = nearest;
  }

  const bToA = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      const dx = (a[2 * i] as number) - (b[2 * j] as number);
      const dy = (a[2 * i + 1] as number) - (b[2 * j + 1] as number);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < nearest) {
        nearest = d;
      }
    }
    bToA[j] = nearest;
  }

  return (pairwiseSum(aToB, 0, n) / n + pairwiseSum(bToA, 0, m) / m) / 2;
}

/** Centroid distance. Python's FDE point-cloud form. */
export function fdeBetweenClouds(a: Float64Array, b: Float64Array): number {
  validatePath(a, "fdeBetweenClouds a");
  validatePath(b, "fdeBetweenClouds b");
  const n = a.length / 2;
  const m = b.length / 2;

  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    ax[i] = a[2 * i] as number;
    ay[i] = a[2 * i + 1] as number;
  }
  const bx = new Float64Array(m);
  const by = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    bx[j] = b[2 * j] as number;
    by[j] = b[2 * j + 1] as number;
  }

  const dx = pairwiseSum(ax, 0, n) / n - pairwiseSum(bx, 0, m) / m;
  const dy = pairwiseSum(ay, 0, n) / n - pairwiseSum(by, 0, m) / m;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Discrete Frechet distance: the shortest leash that lets both paths be walked forwards.
 *
 * The DP contains only `min`, `max` and `sqrt` over a precomputed table — no accumulation at all
 * — so every intermediate value already appears in the inputs. That makes this the one divergence
 * that is comparable across languages BITWISE, which is why the parity harness uses it as its
 * canary: if Frechet ever disagrees, the cause is a real logic difference, never rounding.
 */
export function frechet(a: Float64Array, b: Float64Array): number {
  validatePath(a, "frechet a");
  validatePath(b, "frechet b");
  const n = a.length / 2;
  const m = b.length / 2;

  const distance = (i: number, j: number): number => {
    const dx = (a[2 * i] as number) - (b[2 * j] as number);
    const dy = (a[2 * i + 1] as number) - (b[2 * j + 1] as number);
    return Math.sqrt(dx * dx + dy * dy);
  };

  const coupling = new Float64Array(n * m);
  coupling[0] = distance(0, 0);
  for (let i = 1; i < n; i++) {
    coupling[i * m] = Math.max(coupling[(i - 1) * m] as number, distance(i, 0));
  }
  for (let j = 1; j < m; j++) {
    coupling[j] = Math.max(coupling[j - 1] as number, distance(0, j));
  }
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < m; j++) {
      const best = Math.min(
        coupling[(i - 1) * m + j] as number,
        coupling[(i - 1) * m + (j - 1)] as number,
        coupling[i * m + (j - 1)] as number,
      );
      coupling[i * m + j] = Math.max(best, distance(i, j));
    }
  }
  return coupling[n * m - 1] as number;
}

/**
 * Frechet has no meaningful point-cloud form, and Python raises rather than silently discarding
 * order. Matching that refusal is the point: a divergence that quietly answers a question it
 * cannot answer is worse than one that stops.
 */
export const DIVERGENCES: Readonly<Record<string, Divergence>> = Object.freeze({
  ade: Object.freeze({ name: "ade", betweenPaths: ade, betweenClouds: adeBetweenClouds }),
  fde: Object.freeze({ name: "fde", betweenPaths: fde, betweenClouds: fdeBetweenClouds }),
  frechet: Object.freeze({ name: "frechet", betweenPaths: frechet, betweenClouds: null }),
});
