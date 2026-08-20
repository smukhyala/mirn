import type { RunConfig } from "../contracts/config.js";
import { Channel, gaussian, type NoiseTape } from "../rng/tape.js";
import type { WorldState } from "./state.js";

/**
 * What the robot believes about the room.
 *
 * A DIFFERENT TYPE from `WorldState`, deliberately. The controller is typed to receive this and
 * the force kernel is typed to receive the real world, so "the robot acts on what it thinks it
 * sees" is enforced by the compiler rather than by everyone remembering.
 *
 * Perception error is drawn from the same tape on its own channels, addressed by
 * `(tick, observedUid, channel)`. So the error attached to a given person at a given instant is
 * identical in both arms even when the two robots are in different places and looking at
 * different subsets of the crowd. A sequential stream could not do that; counter addressing gets
 * it for nothing.
 */
export interface PerceivedWorld {
  readonly n: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
}

export function perceive(
  state: WorldState,
  config: RunConfig,
  tape: NoiseTape,
  tick: number,
  scratchX: Float64Array,
  scratchY: Float64Array,
): PerceivedWorld {
  const sigma = config.perception.positionSigmaM;
  const latency = config.perception.latencyTicks;
  // Latency is applied by addressing the tape at an earlier tick rather than by keeping a history
  // buffer: the belief is stale in the same reproducible way on every run.
  const sourceTick = tick - latency < 0 ? 0 : tick - latency;

  for (let i = 0; i < state.n; i++) {
    const uid = state.uid[i] as number;
    if (sigma === 0) {
      scratchX[i] = state.x[i] as number;
      scratchY[i] = state.y[i] as number;
      continue;
    }
    scratchX[i] =
      (state.x[i] as number) +
      sigma * gaussian(tape, sourceTick, uid, Channel.PerceptX, Channel.PerceptMiss);
    scratchY[i] =
      (state.y[i] as number) +
      sigma * gaussian(tape, sourceTick, uid, Channel.PerceptY, Channel.PerceptMiss);
  }

  return { n: state.n, x: scratchX, y: scratchY };
}
