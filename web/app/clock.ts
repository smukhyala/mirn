/**
 * Absolute-time frame indexing, replacing the demo's fixed-timestep accumulator.
 *
 * An accumulator exists to keep a stateful live simulation in sync with a variable wall clock.
 * The engine is batch and headless — it always runs exactly nTicks fixed steps and never sees a
 * wall clock — so there is nothing to accumulate. Indexing by absolute elapsed time has no drift,
 * no spiral of death, and needs no substep clamping: a backgrounded tab that returns after ten
 * seconds simply resolves to a later frame and draws it, rather than trying to catch up through
 * two hundred physics steps it no longer needs.
 *
 * Pausing re-bases `wallStartMs`. Scrubbing sets `sampleAtStart`. Slow motion is `rate < 1`.
 */
export interface PlaybackBase {
  readonly wallStartMs: number;
  readonly sampleAtStart: number;
  readonly dtMs: number;
  readonly rate: number;
}

export function frameIndexAt(nowMs: number, base: PlaybackBase, nSamples: number): number {
  const elapsed = (nowMs - base.wallStartMs) * base.rate;
  const raw = base.sampleAtStart + Math.floor(elapsed / base.dtMs);
  if (raw < 0) {
    return 0;
  }
  if (raw > nSamples - 1) {
    return nSamples - 1;
  }
  return raw;
}
