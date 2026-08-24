/**
 * The analytic paired run: a crowd with no crowd in it.
 *
 * This is the TypeScript mirror of `src/mirn/data/synthetic.py`, and it exists for exactly one
 * reason — the placebo gate in `placebo.test.ts` cannot run on the social-force simulator. On a
 * dynamical crowd, deleting a bystander who never came within 5 m of the robot still moves the
 * estimate, because removing anybody rewires the interaction chain and the robot then picks a
 * different path. That is correct behaviour of a crowd, not a bug in the estimator, and pointing
 * the gate at it would make the gate permanently red for a good reason. The tempting repair is to
 * loosen the tolerance until it goes green, which leaves a test that asserts nothing. So the gate
 * gets a world where the only coupling that exists is the one being measured.
 *
 * Properties, all load-bearing, all carried over from the Python original:
 *
 *  - Pedestrians cross the box left to right at constant velocity plus seeded noise.
 *  - The robot sits at one fixed point for the whole run. It never moves and never plans.
 *  - In the TREATED arm only, the robot pushes nearby pedestrians sideways by an amount that
 *    decays exponentially with their distance to it.
 *  - Pedestrians do not interact with each other AT ALL. No repulsion, no avoidance, no shared
 *    state. This is the whole point: agent *i*'s path is a pure function of `(seed, i)`, so
 *    deleting agent *j* cannot change it, and any movement in the estimate after a deletion is
 *    the estimator's doing rather than the world's.
 *  - The first timestep's displacement is forced to exactly 0, so both arms start a pedestrian at
 *    the identical position and `makePairedRun`'s exact first-position invariant holds.
 *  - At `influence = 0` the two arms are BITWISE identical, because the displacement is a factor
 *    of `influence` and `x + 0 === x` for every finite double. Not close — identical.
 *
 * Two deliberate departures from the Python file, both because this side has better tools:
 *
 *  1. Noise comes from the engine's addressable `NoiseTape` rather than a drawn-in-order array.
 *     The value at `(tick, uid, channel)` is a pure hash, so there is no cursor and no stream:
 *     adding or removing a pedestrian cannot shift anybody else's draws. Python gets the same
 *     guarantee from fixed array indices; here it is structural.
 *  2. The axis of a position-noise draw is folded into the *tick* address (`2*step` for x,
 *     `2*step+1` for y) instead of getting its own channel. A test fixture must not widen the
 *     engine's public channel vocabulary to suit itself.
 *
 * `Math.hypot` is banned everywhere under `web/engine/measure/`, this directory included: V8's is
 * more accurate than numpy's naive `sqrt(sum(d*d))` and would disagree with the oracle in the last
 * bits. Distances below are spelled out longhand for that reason.
 *
 * This is a test fixture. It is not the simulator, it is not shown to a reader, and no number it
 * produces belongs on a page.
 */

import { fail, requireFinite } from "../../core/errors.js";
import type { PairedRun } from "../../contracts/pairedRun.js";
import { makePairedRun } from "../../contracts/pairedRun.js";
import { makeScene, pedestrianById } from "../../contracts/scene.js";
import type { Trajectory } from "../../contracts/trajectory.js";
import { makeTrajectory } from "../../contracts/trajectory.js";
import type { NoiseTape } from "../../rng/tape.js";
import { Channel, gaussian, makeTape } from "../../rng/tape.js";

/** The box, matching `BOX_WIDTH_M` / `BOX_HEIGHT_M` in data/synthetic.py. */
export const ANALYTIC_BOX_WIDTH_M = 20;
export const ANALYTIC_BOX_HEIGHT_M = 12;

/** Peak sideways push, applied to a pedestrian standing on top of the robot. */
export const DISPLACEMENT_AMPLITUDE_M = 1.5;

/**
 * How far the push reaches, as the length scale of `exp(-distance / reach)`.
 *
 * 3.0 m is Python's default and is kept as the default here, but note what it means in a 12 m
 * box with the robot at the centre: the farthest any pedestrian can ever be is 6 m, which is two
 * reach lengths, so even the most distant bystander keeps `exp(-2) ~= 13.5%` of the peak push.
 * `data/synthetic.py` says so in its own docstring — "weakly interacting, not truly
 * non-interacting". The placebo gate therefore overrides this with a much shorter reach, so that
 * "never came near the robot" actually means "carries no robot effect" instead of "carries 13.5%
 * of one".
 */
export const DISPLACEMENT_DECAY_LENGTH_M = 3.0;

const DT = 0.1;
const BASE_SPEED_MS = 1.2;
const SPEED_NOISE_STD_MS = 0.15;
const MIN_SPEED_MS = 0.3;
const POSITION_NOISE_STD_M = 0.03;

/**
 * Everyone walks along +x, so the sideways direction is +y. Written as a vector rather than
 * folded into the arithmetic so that the push stays perpendicular to travel if the direction of
 * travel is ever changed — the same shape `_LATERAL_UNIT` has in Python.
 */
const VELOCITY_UNIT: readonly [number, number] = [1, 0];
const LATERAL_UNIT: readonly [number, number] = [-VELOCITY_UNIT[1], VELOCITY_UNIT[0]];

/**
 * Tape addresses for the two per-pedestrian draws made before the walk starts. They are ticks
 * rather than channels for the reason given in the module docstring, and they are distinct from
 * each other and from every position-noise address, which lives on the Noise channels.
 */
const START_Y_TICK = 0;
const SPEED_TICK = 1;

export interface AnalyticSpec {
  readonly kind: "analyticSpec";
  readonly seed: number;
  readonly nPedestrians: number;
  readonly nSteps: number;
  /** Scales the whole robot push. 0 makes the arms bitwise identical. */
  readonly influence: number;
  readonly robotXY: readonly [number, number];
  readonly displacementAmplitudeM: number;
  readonly displacementDecayLengthM: number;
}

export const DEFAULT_ANALYTIC_SPEC: AnalyticSpec = Object.freeze({
  kind: "analyticSpec" as const,
  seed: 20260816,
  nPedestrians: 12,
  nSteps: 60,
  influence: 1,
  robotXY: Object.freeze([ANALYTIC_BOX_WIDTH_M / 2, ANALYTIC_BOX_HEIGHT_M / 2] as [number, number]),
  displacementAmplitudeM: DISPLACEMENT_AMPLITUDE_M,
  displacementDecayLengthM: DISPLACEMENT_DECAY_LENGTH_M,
});

export interface AnalyticSpecOverrides {
  seed?: number;
  nPedestrians?: number;
  nSteps?: number;
  influence?: number;
  robotXY?: readonly [number, number];
  displacementAmplitudeM?: number;
  displacementDecayLengthM?: number;
}

/** Validates on the way in, the same checks `SyntheticAdapter.__init__` makes. */
export function makeAnalyticSpec(overrides: AnalyticSpecOverrides = {}): AnalyticSpec {
  const merged: AnalyticSpec = Object.freeze({
    ...DEFAULT_ANALYTIC_SPEC,
    ...overrides,
    kind: "analyticSpec" as const,
  });

  if (!Number.isInteger(merged.seed)) {
    fail(`AnalyticSpec.seed must be an integer, got ${merged.seed}`);
  }
  if (!Number.isInteger(merged.nPedestrians) || merged.nPedestrians < 1) {
    fail(`AnalyticSpec.nPedestrians must be a positive integer, got ${merged.nPedestrians}`);
  }
  if (!Number.isInteger(merged.nSteps) || merged.nSteps < 2) {
    fail(`AnalyticSpec.nSteps must be an integer >= 2, got ${merged.nSteps}`);
  }
  requireFinite(merged.influence, "AnalyticSpec.influence");
  if (merged.influence < 0) {
    fail(`AnalyticSpec.influence must be >= 0, got ${merged.influence}`);
  }
  requireFinite(merged.displacementAmplitudeM, "AnalyticSpec.displacementAmplitudeM");
  if (merged.displacementAmplitudeM < 0) {
    fail(
      `AnalyticSpec.displacementAmplitudeM must be >= 0, got ${merged.displacementAmplitudeM}`,
    );
  }
  requireFinite(merged.displacementDecayLengthM, "AnalyticSpec.displacementDecayLengthM");
  if (merged.displacementDecayLengthM <= 0) {
    fail(
      `AnalyticSpec.displacementDecayLengthM must be > 0 (it is a divisor), got ` +
        `${merged.displacementDecayLengthM}`,
    );
  }
  const robotX = merged.robotXY[0];
  const robotY = merged.robotXY[1];
  if (!(robotX >= 0 && robotX <= ANALYTIC_BOX_WIDTH_M)) {
    fail(`AnalyticSpec.robotXY x must lie within 0..${ANALYTIC_BOX_WIDTH_M}, got ${robotX}`);
  }
  if (!(robotY >= 0 && robotY <= ANALYTIC_BOX_HEIGHT_M)) {
    fail(`AnalyticSpec.robotXY y must lie within 0..${ANALYTIC_BOX_HEIGHT_M}, got ${robotY}`);
  }

  return merged;
}

/**
 * One pedestrian's undisturbed path: constant velocity along +x from a seeded starting height,
 * plus seeded per-step jitter. This is the control arm's trajectory verbatim, and the treated
 * arm's before the robot is added, so the only thing that can differ between arms is the push.
 */
function undisturbedPath(spec: AnalyticSpec, tape: NoiseTape, uid: number): Float64Array {
  const startYUnit = tape(START_Y_TICK, uid, Channel.SpawnY);
  const startY = ANALYTIC_BOX_HEIGHT_M * startYUnit;

  const speedOffset =
    SPEED_NOISE_STD_MS * gaussian(tape, SPEED_TICK, uid, Channel.SpawnX, Channel.SpawnY);
  let speed = BASE_SPEED_MS + speedOffset;
  if (speed < MIN_SPEED_MS) {
    speed = MIN_SPEED_MS;
  }

  const positions = new Float64Array(spec.nSteps * 2);
  for (let step = 0; step < spec.nSteps; step++) {
    const t = DT * step;
    const noiseX =
      POSITION_NOISE_STD_M * gaussian(tape, 2 * step, uid, Channel.NoiseX, Channel.NoiseY);
    const noiseY =
      POSITION_NOISE_STD_M * gaussian(tape, 2 * step + 1, uid, Channel.NoiseX, Channel.NoiseY);
    positions[2 * step] = speed * t + noiseX;
    positions[2 * step + 1] = startY + noiseY;
  }
  return positions;
}

/**
 * The same path with the robot's sideways push added.
 *
 * The push always points away from the robot, so it increases a pedestrian's lateral offset and
 * never decreases it. That asymmetry is why every eligibility question in this file is asked of
 * the CONTROL arm — see `selectNonInteractingAgent`.
 */
function pushedPath(spec: AnalyticSpec, undisturbed: Float64Array): Float64Array {
  const robotX = spec.robotXY[0];
  const robotY = spec.robotXY[1];
  const pushed = new Float64Array(undisturbed.length);

  for (let step = 0; step < spec.nSteps; step++) {
    const x = undisturbed[2 * step] as number;
    const y = undisturbed[2 * step + 1] as number;
    const offsetX = x - robotX;
    const offsetY = y - robotY;
    const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);

    const lateralProjection = offsetX * LATERAL_UNIT[0] + offsetY * LATERAL_UNIT[1];
    let lateralSign = Math.sign(lateralProjection);
    // A pedestrian dead level with the robot has no side to be pushed towards. Python breaks the
    // tie the same way, and it must be broken identically or the two languages would disagree
    // about which way a knife-edge pedestrian goes.
    if (lateralSign === 0) {
      lateralSign = 1;
    }

    const decay = Math.exp(-distance / spec.displacementDecayLengthM);
    const magnitude = spec.influence * spec.displacementAmplitudeM * decay;
    const signedMagnitude = lateralSign * magnitude;

    let pushX = signedMagnitude * LATERAL_UNIT[0];
    let pushY = signedMagnitude * LATERAL_UNIT[1];
    // The paired contract demands the two arms agree EXACTLY at t=0, not within a tolerance, and
    // the decay at t=0 is small but never zero. Forcing it rather than hoping for it is what lets
    // `makePairedRun` keep its exact check instead of growing an epsilon.
    if (step === 0) {
      pushX = 0;
      pushY = 0;
    }

    pushed[2 * step] = x + pushX;
    pushed[2 * step + 1] = y + pushY;
  }
  return pushed;
}

/**
 * A paired run of the analytic world, built through `makePairedRun` so it is held to exactly the
 * same invariants as a run out of the real simulator. A fixture that dodged the contract would
 * be free to drift away from what the product actually measures.
 */
export function analyticPair(spec: AnalyticSpec): PairedRun {
  const tape = makeTape(spec.seed);

  const treatedPedestrians: Trajectory[] = [];
  const controlPedestrians: Trajectory[] = [];
  for (let uid = 0; uid < spec.nPedestrians; uid++) {
    const agentId = `ped${uid}`;
    const undisturbed = undisturbedPath(spec, tape, uid);
    const pushed = pushedPath(spec, undisturbed);

    treatedPedestrians.push(
      makeTrajectory({ agentId, agentUid: uid, positions: pushed, t0: 0, dt: DT }),
    );
    controlPedestrians.push(
      makeTrajectory({ agentId, agentUid: uid, positions: undisturbed, t0: 0, dt: DT }),
    );
  }

  const robotPositions = new Float64Array(spec.nSteps * 2);
  for (let step = 0; step < spec.nSteps; step++) {
    robotPositions[2 * step] = spec.robotXY[0];
    robotPositions[2 * step + 1] = spec.robotXY[1];
  }
  // uid -1 is the robot, per the parity rule asserted in contracts/trajectory.ts.
  const robot = makeTrajectory({
    agentId: "robot",
    agentUid: -1,
    positions: robotPositions,
    t0: 0,
    dt: DT,
  });

  const sceneId = `analytic_${spec.seed}`;
  const treated = makeScene({
    sceneId,
    pedestrians: treatedPedestrians,
    robot,
    robotPresent: true,
    source: "analytic",
    seed: spec.seed,
  });
  const control = makeScene({
    sceneId,
    pedestrians: controlPedestrians,
    robot: null,
    robotPresent: false,
    source: "analytic",
    seed: spec.seed,
  });

  return makePairedRun({ treated, control, treatment: { kind: "robot-presence" } });
}

/**
 * How close a pedestrian ever got to the robot, judged on the CONTROL arm.
 *
 * The robot's position has to be read from the treated arm, because a control scene has no robot
 * by contract. The pedestrian's path is read from the control arm, and that choice is the whole
 * argument of `src/mirn/experiments/placebo.py`'s docstring: the push always moves a pedestrian
 * further from the robot, so a treated-arm closest approach is always at least as large as the
 * same pedestrian's control-arm closest approach. Choosing who counts as a bystander from the
 * treated arm would therefore be choosing partly on the very displacement under test — selection
 * on the outcome, the exact error this project exists to keep out of the measurement.
 */
export function closestApproachM(pair: PairedRun, agentId: string): number {
  const robot = pair.treated.robot;
  if (robot === null) {
    fail(
      `closestApproachM needs the treated arm to carry a robot; got robotPresent=` +
        `${pair.treated.robotPresent}`,
    );
  }
  const pedestrian = pedestrianById(pair.control, agentId);

  let nearest = Number.POSITIVE_INFINITY;
  for (let step = 0; step < pedestrian.nSteps; step++) {
    const dx = (pedestrian.positions[2 * step] as number) - (robot.positions[2 * step] as number);
    const dy =
      (pedestrian.positions[2 * step + 1] as number) - (robot.positions[2 * step + 1] as number);
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < nearest) {
      nearest = distance;
    }
  }
  return nearest;
}

/**
 * The lowest-numbered pedestrian that never came within `exclusionRadiusM` of the robot, or null
 * if everybody did. Lowest rather than random so the gate names the same bystander every run.
 * Mirrors `select_non_interacting_agent`.
 */
export function selectNonInteractingAgent(
  pair: PairedRun,
  exclusionRadiusM: number,
): string | null {
  const candidates: string[] = [];
  for (const pedestrian of pair.control.pedestrians) {
    const closest = closestApproachM(pair, pedestrian.agentId);
    if (closest > exclusionRadiusM) {
      candidates.push(pedestrian.agentId);
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort();
  return candidates[0] as string;
}

/**
 * The pedestrian that passed closest to the robot — the negative control's victim.
 *
 * Judged on the control arm for the same reason as the bystander: picking the close-passer off
 * the treated arm would pick partly on the push itself. Ties break to the lowest id so the choice
 * is reproducible.
 */
export function selectClosestAgent(pair: PairedRun): string {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const agentIds: string[] = [];
  for (const pedestrian of pair.control.pedestrians) {
    agentIds.push(pedestrian.agentId);
  }
  agentIds.sort();

  for (const agentId of agentIds) {
    const closest = closestApproachM(pair, agentId);
    if (closest < bestDistance) {
      bestDistance = closest;
      bestId = agentId;
    }
  }
  if (bestId === null) {
    return fail("selectClosestAgent requires at least one pedestrian");
  }
  return bestId;
}

function sceneWithout(
  pedestrians: readonly Trajectory[],
  agentId: string,
): readonly Trajectory[] {
  const kept: Trajectory[] = [];
  for (const pedestrian of pedestrians) {
    if (pedestrian.agentId !== agentId) {
      kept.push(pedestrian);
    }
  }
  return kept;
}

function sceneWithOnly(
  pedestrians: readonly Trajectory[],
  agentId: string,
): readonly Trajectory[] {
  const kept: Trajectory[] = [];
  for (const pedestrian of pedestrians) {
    if (pedestrian.agentId === agentId) {
      kept.push(pedestrian);
    }
  }
  return kept;
}

/**
 * The same run with one pedestrian deleted from BOTH arms. Mirrors `drop_agent`.
 *
 * Deleting from both is what keeps the pairing legal — `makePairedRun` rejects a pair whose arms
 * disagree about who is in the room — and it is also the only deletion that means anything: the
 * question is whether the estimate depends on a bystander's presence, not on their treatment.
 */
export function dropAgent(pair: PairedRun, agentId: string): PairedRun {
  const treatedKept = sceneWithout(pair.treated.pedestrians, agentId);
  if (treatedKept.length === pair.treated.pedestrians.length) {
    fail(`dropAgent: no pedestrian '${agentId}' in the treated arm of '${pair.treated.sceneId}'`);
  }
  const controlKept = sceneWithout(pair.control.pedestrians, agentId);

  const treated = makeScene({
    sceneId: pair.treated.sceneId,
    pedestrians: treatedKept,
    robot: pair.treated.robot,
    robotPresent: pair.treated.robotPresent,
    source: pair.treated.source,
    seed: pair.treated.seed,
  });
  const control = makeScene({
    sceneId: pair.control.sceneId,
    pedestrians: controlKept,
    robot: pair.control.robot,
    robotPresent: pair.control.robotPresent,
    source: pair.control.source,
    seed: pair.control.seed,
  });
  return makePairedRun({ treated, control, treatment: pair.treatment });
}

/**
 * The same run with everybody except one pedestrian deleted, from both arms.
 *
 * This exists so a test can ask the estimator what one person contributes WITHOUT reaching inside
 * it. The paired estimator averages over agents, so run on a single-agent pair it returns that
 * agent's divergence and nothing else — which is what lets `placebo.test.ts` check that deleting
 * somebody moves the aggregate by exactly the term that was lost, using only the public API.
 */
export function keepOnlyAgent(pair: PairedRun, agentId: string): PairedRun {
  const treatedKept = sceneWithOnly(pair.treated.pedestrians, agentId);
  if (treatedKept.length === 0) {
    fail(
      `keepOnlyAgent: no pedestrian '${agentId}' in the treated arm of '${pair.treated.sceneId}'`,
    );
  }
  const controlKept = sceneWithOnly(pair.control.pedestrians, agentId);

  const treated = makeScene({
    sceneId: pair.treated.sceneId,
    pedestrians: treatedKept,
    robot: pair.treated.robot,
    robotPresent: pair.treated.robotPresent,
    source: pair.treated.source,
    seed: pair.treated.seed,
  });
  const control = makeScene({
    sceneId: pair.control.sceneId,
    pedestrians: controlKept,
    robot: pair.control.robot,
    robotPresent: pair.control.robotPresent,
    source: pair.control.source,
    seed: pair.control.seed,
  });
  return makePairedRun({ treated, control, treatment: pair.treatment });
}
