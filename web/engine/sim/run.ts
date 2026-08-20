import type { RunConfig } from "../contracts/config.js";
import { makePairedRun, type ArmId, type PairedRun } from "../contracts/pairedRun.js";
import { makeScene, type Scene } from "../contracts/scene.js";
import { makeTrajectory, type Trajectory } from "../contracts/trajectory.js";
import { mix4 } from "../rng/mulberry32.js";
import { makeTape, type NoiseTape } from "../rng/tape.js";
import { agentIdFor, initialState, ROBOT_UID } from "./state.js";
import { makeScratch, stepWorld } from "./world.js";

export interface ArmResult {
  readonly scene: Scene;
  /** Flat (nTicks+1, 2) per agent, in uid order. Same buffers the Scene's trajectories wrap. */
  readonly positions: readonly Float64Array[];
  readonly robotPositions: Float64Array | null;
}

/**
 * Run one arm to completion.
 *
 * Note the signature: this takes a `NoiseTape`, not a seed. There is no reachable seed inside a
 * tape and no way to construct another one from here, so this function is structurally incapable
 * of giving one arm different randomness from the other. That is the lockstep guarantee, and it
 * is a property of the type rather than of anyone remembering to keep two cursors in step.
 */
export function runArm(
  config: RunConfig,
  spawnTape: NoiseTape,
  noiseTape: NoiseTape,
  arm: ArmId,
  withRobot: boolean,
): ArmResult {
  const state = initialState(config, spawnTape, withRobot);
  const scratch = makeScratch(state.n);
  const nSamples = config.nTicks + 1;

  const positions: Float64Array[] = [];
  for (let i = 0; i < state.n; i++) {
    positions.push(new Float64Array(nSamples * 2));
  }
  const robotPositions = withRobot ? new Float64Array(nSamples * 2) : null;

  const record = (sample: number): void => {
    for (let i = 0; i < state.n; i++) {
      const buffer = positions[i] as Float64Array;
      buffer[2 * sample] = state.x[i] as number;
      buffer[2 * sample + 1] = state.y[i] as number;
    }
    if (robotPositions !== null && state.robot !== null) {
      robotPositions[2 * sample] = state.robot.x;
      robotPositions[2 * sample + 1] = state.robot.y;
    }
  };

  record(0);
  for (let tick = 0; tick < config.nTicks; tick++) {
    stepWorld(state, config, noiseTape, tick, scratch);
    record(tick + 1);
  }

  const pedestrians: Trajectory[] = [];
  for (let i = 0; i < state.n; i++) {
    const uid = state.uid[i] as number;
    pedestrians.push(
      makeTrajectory({
        agentId: agentIdFor(uid),
        agentUid: uid,
        positions: positions[i] as Float64Array,
        t0: 0,
        dt: config.dt,
      }),
    );
  }

  let robotTrajectory: Trajectory | null = null;
  if (robotPositions !== null) {
    robotTrajectory = makeTrajectory({
      agentId: agentIdFor(ROBOT_UID),
      agentUid: ROBOT_UID,
      positions: robotPositions,
      t0: 0,
      dt: config.dt,
    });
  }

  const scene = makeScene({
    sceneId: `${arm}-${config.seed}-${config.replicate}`,
    pedestrians,
    robot: robotTrajectory,
    robotPresent: withRobot,
    source: "sfm",
    seed: config.seed,
  });

  return { scene, positions, robotPositions };
}

export interface RunResult {
  readonly kind: "runResult";
  readonly config: RunConfig;
  readonly pair: PairedRun;
  readonly treated: ArmResult;
  readonly control: ArmResult;
  readonly timingMs: number;
}

/**
 * The only producer of a `PairedRun`.
 *
 * `makePairedRun` is not re-exported from the engine entry point, so there is no way to
 * hand-assemble a mismatched pair from outside. Both arms are driven by the same tape object.
 */
export function runPair(config: RunConfig, nowMs: () => number = () => 0): RunResult {
  const started = nowMs();
  // Two tapes, on purpose. Placement comes from the seed alone, so every replicate of a
  // configuration puts the same people in the same places; only the in-run noise moves with the
  // replicate. Mixing the replicate into placement as well turned each replicate into a different
  // crowd entirely and inflated the run-to-run band to room scale.
  const spawnTape = makeTape(config.seed);
  const noiseTape = makeTape(mix4(config.seed, config.replicate, 0, 0));

  // The robot is always in the treated arm. Under a robot-presence treatment the control arm has
  // no robot at all; under every other treatment it is in both arms and the difference is
  // elsewhere, which is what lets `{ kind: "none" }` be the null treatment the lockstep test uses.
  const treatedHasRobot = true;
  const controlHasRobot = config.treatment.kind !== "robot-presence";

  const treated = runArm(config, spawnTape, noiseTape, "treated", treatedHasRobot);
  const control = runArm(config, spawnTape, noiseTape, "control", controlHasRobot);

  const pair = makePairedRun({
    treated: treated.scene,
    control: control.scene,
    treatment: config.treatment,
  });

  return {
    kind: "runResult",
    config,
    pair,
    treated,
    control,
    timingMs: nowMs() - started,
  };
}
