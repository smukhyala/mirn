import { SIM_CONSTANTS, type RunConfig } from "../contracts/config.js";
import { Channel, type NoiseTape } from "../rng/tape.js";
import { accumulateForces } from "./forces.js";
import { applyCommand, planRobot } from "./robot.js";
import { ROBOT_UID, type WorldState } from "./state.js";

/** Caller-owned scratch, allocated once per run rather than once per tick. */
export interface Scratch {
  readonly fx: Float64Array;
  readonly fy: Float64Array;
  readonly noiseX: Float64Array;
  readonly noiseY: Float64Array;
}

export function makeScratch(n: number): Scratch {
  return {
    fx: new Float64Array(n),
    fy: new Float64Array(n),
    noiseX: new Float64Array(n),
    noiseY: new Float64Array(n),
  };
}

/**
 * One tick of one arm.
 *
 * The noise is drawn by ADDRESS, not from a stream: `tape(tick, uid, channel)`. Both arms call
 * this with the same tape, so both see identical exogenous noise for the same agent at the same
 * instant, whether or not the other arm exists. There is nothing to keep aligned.
 */
export function stepWorld(
  state: WorldState,
  config: RunConfig,
  tape: NoiseTape,
  tick: number,
  scratch: Scratch,
): void {
  const robot = state.robot;
  if (robot !== null) {
    const command = planRobot(state, robot, config);
    applyCommand(robot, command, config);

    robot.x += robot.vx * config.dt;
    robot.y += robot.vy * config.dt;
    if (robot.x < 0.35) {
      robot.x = 0.35;
    }
    if (robot.x > config.widthM - 0.35) {
      robot.x = config.widthM - 0.35;
    }
    if (robot.y < 0.35) {
      robot.y = 0.35;
    }
    if (robot.y > config.heightM - 0.35) {
      robot.y = config.heightM - 0.35;
    }

    if (robot.arrivedTick < 0) {
      const dx = robot.gx - robot.x;
      const dy = robot.gy - robot.y;
      if (Math.sqrt(dx * dx + dy * dy) < SIM_CONSTANTS.goalReachedM) {
        robot.arrivedTick = tick;
      }
    }
  }

  const amplitude = config.crowd.noiseAmplitude;
  for (let i = 0; i < state.n; i++) {
    const uid = state.uid[i] as number;
    scratch.noiseX[i] = (tape(tick, uid, Channel.NoiseX) - 0.5) * amplitude;
    scratch.noiseY[i] = (tape(tick, uid, Channel.NoiseY) - 0.5) * amplitude;
  }

  accumulateForces(
    state,
    config,
    config.pedestriansSeeRobot,
    scratch.noiseX,
    scratch.noiseY,
    scratch.fx,
    scratch.fy,
  );

  const cap = config.crowd.desiredSpeed * SIM_CONSTANTS.speedCapFactor;
  for (let i = 0; i < state.n; i++) {
    if (state.arrived[i] === 1) {
      state.vx[i] = 0;
      state.vy[i] = 0;
      continue;
    }

    let vx = (state.vx[i] as number) + (scratch.fx[i] as number) * config.dt;
    let vy = (state.vy[i] as number) + (scratch.fy[i] as number) * config.dt;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > cap) {
      vx = (vx / speed) * cap;
      vy = (vy / speed) * cap;
    }

    let x = (state.x[i] as number) + vx * config.dt;
    let y = (state.y[i] as number) + vy * config.dt;

    if (y < 0.25) {
      y = 0.25;
      vy = Math.abs(vy) * SIM_CONSTANTS.wallRestitution;
    }
    if (y > config.heightM - 0.25) {
      y = config.heightM - 0.25;
      vy = -Math.abs(vy) * SIM_CONSTANTS.wallRestitution;
    }
    if (x < 0.25) {
      x = 0.25;
      vx = Math.abs(vx) * SIM_CONSTANTS.wallRestitution;
    }
    if (x > config.widthM - 0.25) {
      x = config.widthM - 0.25;
      vx = -Math.abs(vx) * SIM_CONSTANTS.wallRestitution;
    }

    state.vx[i] = vx;
    state.vy[i] = vy;
    state.x[i] = x;
    state.y[i] = y;

    if (state.arrived[i] === 0) {
      const dx = (state.gx[i] as number) - x;
      const dy = (state.gy[i] as number) - y;
      if (Math.sqrt(dx * dx + dy * dy) < 0.7) {
        state.arrived[i] = 1;
      }
    }
  }
}

export { ROBOT_UID };
