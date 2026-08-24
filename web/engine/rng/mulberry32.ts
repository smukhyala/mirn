/**
 * The generator, carried over verbatim from `demo/perturbation-playground.html`, plus the
 * avalanche mix that lets it be used in counter mode.
 *
 * Everything here is pure int32 arithmetic — `Math.imul` is a signed 32-bit multiply, which
 * Python reproduces exactly with `(a * b) & 0xFFFFFFFF` reinterpreted signed. There is not a
 * single float operation until `toUnit`, and that one is a division by a power of two, which is
 * exact in binary64. So the RNG is comparable across languages *bitwise*, and the parity fixture
 * for it asserts `===` rather than any tolerance.
 */

export const UINT32_SCALE = 4294967296;

/** One step of mulberry32. Takes the state, returns a uint32. */
export function mulberry32Raw(a: number): number {
  let s = a | 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}

/** uint32 to [0, 1). Exact: the divisor is 2^32. */
export function toUnit(u32: number): number {
  return u32 / UINT32_SCALE;
}

/**
 * Avalanche four int32s into one. This is what makes randomness *addressable* rather than
 * streamed: the value at `(seed, tick, uid, channel)` is a hash, so there is no cursor, nothing
 * to keep aligned between the two arms, and adding an agent cannot shift anyone else's draws.
 */
export function mix4(a: number, b: number, c: number, d: number): number {
  let h = a | 0;
  h = Math.imul(h ^ (b + 0x9e3779b9), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (c + 0xc2b2ae35), 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 16) ^ (d + 0x165667b1), 0x85ebca6b);
  return (h ^ (h >>> 15)) | 0;
}
