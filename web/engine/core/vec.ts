/**
 * 2-vector arithmetic on flat arrays.
 *
 * `Math.hypot` is deliberately absent from this file and banned everywhere in `engine/measure`.
 * V8's `hypot` does extra scaling to avoid intermediate overflow and is *more* accurate than
 * numpy's `np.sqrt(np.sum(d * d))` — which means it disagrees with the oracle in the last bits.
 * `Math.sqrt` is correctly rounded by IEEE 754 on both sides, so `sqrt(dx*dx + dy*dy)` is the
 * portable spelling. This costs nothing and it is the difference between a parity fixture that
 * holds at 1e-15 and one that has to be loosened until it means nothing.
 */

export type Vec2 = readonly [number, number];

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function norm(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Squared distance, for cutoff tests that must not pay for a square root. */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
