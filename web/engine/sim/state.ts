import type { RunConfig } from "../contracts/config.js";
import { Channel, type NoiseTape } from "../rng/tape.js";

/**
 * Struct-of-arrays over Float64Array, with zero per-agent objects.
 *
 * The demo stored agents as objects and allocated a fresh `[fx, fy]` array per agent per tick —
 * about 64,000 allocations in a single run. Flat typed arrays remove that entirely and are also
 * what makes the frame buffers zero-copy transferable to a Worker.
 */
export interface WorldState {
  readonly n: number;
  readonly uid: Int32Array;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  readonly gx: Float64Array;
  readonly gy: Float64Array;
  readonly arrived: Uint8Array;
  robot: RobotState | null;
}

export interface RobotState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gx: number;
  gy: number;
  /** -1 until the robot first reaches its goal. Time-to-goal reads this. */
  arrivedTick: number;
}

export const ROBOT_UID = -1;

/** Base pedestrians take 0..n-1; disturbance-injected agents start here so they can never
 *  collide with a base uid and therefore can never shift a base agent's noise address. */
export const INJECTED_UID_BASE = 10000;

export function agentIdFor(uid: number): string {
  if (uid === ROBOT_UID) {
    return "robot";
  }
  if (uid >= INJECTED_UID_BASE) {
    return `inj${uid}`;
  }
  return `ped${uid}`;
}

/**
 * Initial placement, drawn at tick -1 so it cannot collide with any in-run draw.
 *
 * Both arms call this with the same tape and the same config, so they start identical by
 * construction rather than by a copy step — which is what `PairedRun`'s exact first-position
 * check then verifies.
 */
export function initialState(config: RunConfig, tape: NoiseTape, withRobot: boolean): WorldState {
  const n = config.crowd.nPedestrians;
  const state: WorldState = {
    n,
    uid: new Int32Array(n),
    x: new Float64Array(n),
    y: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    gx: new Float64Array(n),
    gy: new Float64Array(n),
    arrived: new Uint8Array(n),
    robot: null,
  };

  for (let i = 0; i < n; i++) {
    const uid = i;
    state.uid[i] = uid;
    const sideDraw = tape(-1, uid, Channel.SpawnX);
    const fromLeft = sideDraw < 0.5;
    const inset = 0.8 + tape(-1, uid, Channel.SpawnY) * 1.6;
    state.x[i] = fromLeft ? inset : config.widthM - inset;
    state.y[i] = 1.2 + tape(-1, uid, Channel.SpawnGoalY) * (config.heightM - 2.4);
    state.gx[i] = fromLeft ? config.widthM - 1.0 : 1.0;
    // A second, independent draw for the goal's height, so start and goal are not correlated.
    state.gy[i] = 1.2 + tape(-2, uid, Channel.SpawnGoalY) * (config.heightM - 2.4);
  }

  if (withRobot) {
    state.robot = {
      x: config.robot.startXY[0],
      y: config.robot.startXY[1],
      vx: 0,
      vy: 0,
      gx: config.robot.goalXY[0],
      gy: config.robot.goalXY[1],
      arrivedTick: -1,
    };
  }

  return state;
}
