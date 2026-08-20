import { mix4, mulberry32Raw, toUnit } from "./mulberry32.js";

/**
 * Channels are the third address component. Separating them means the robot's perception error
 * for a given person at a given tick is the *same draw* whether or not the robot happened to look
 * at them — which is what keeps the two arms comparable even when the treated robot is somewhere
 * else and sees a different subset of the crowd.
 */
export const Channel = {
  NoiseX: 0,
  NoiseY: 1,
  PerceptX: 2,
  PerceptY: 3,
  PerceptMiss: 4,
  SpawnX: 5,
  SpawnY: 6,
  SpawnGoalY: 7,
} as const;

export type Channel = (typeof Channel)[keyof typeof Channel];

/**
 * The only source of randomness in the engine.
 *
 * The demo kept its two worlds in step with `g.rng(); g.rng(); // keep streams aligned` — a
 * correct invariant wrapped in a fragile mechanism, since any third draw desynchronises it
 * silently. A tape has no stream and no cursor: the value for `(tick, uid, channel)` is a pure
 * function, so there is nothing to keep aligned and no way for the arms to diverge.
 *
 * Note what the signature does NOT contain: a seed. `runArm` receives a tape, not a seed, so it
 * is structurally incapable of constructing a differently-seeded generator for one arm.
 */
export type NoiseTape = (tick: number, uid: number, channel: Channel) => number;

export function makeTape(seed: number): NoiseTape {
  const base = seed | 0;
  return function tape(tick: number, uid: number, channel: Channel): number {
    return toUnit(mulberry32Raw(mix4(base, tick, uid, channel)));
  };
}

/** Raw uint32 at an address — what the cross-language parity fixture compares with `===`. */
export function tapeRaw(seed: number, tick: number, uid: number, channel: Channel): number {
  return mulberry32Raw(mix4(seed | 0, tick, uid, channel));
}

/**
 * Stateless Box-Muller over two channels.
 *
 * `log` and `cos` are not bit-portable across engines, so the parity fixture exports the drawn
 * gaussians rather than asking Python to regenerate them. That is the honest arrangement: the
 * transcendentals get one small tolerance-based test of their own instead of a hidden
 * cross-language dependency buried inside every perception draw.
 */
export function gaussian(
  tape: NoiseTape,
  tick: number,
  uid: number,
  channelU: Channel,
  channelV: Channel,
): number {
  const rawU = tape(tick, uid, channelU);
  // Clamp away from exactly zero; log(0) is -Infinity and would poison the whole run.
  const u = rawU < 2.3283064365386963e-10 ? 2.3283064365386963e-10 : rawU;
  const v = tape(tick, uid, channelV);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
