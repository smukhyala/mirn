import { SIM_CONSTANTS, type RunConfig } from "../contracts/config.js";
import type { PairedRun } from "../contracts/pairedRun.js";
import { pairedAgents } from "../contracts/pairedRun.js";
import { fail } from "../core/errors.js";
import { deviation, type Deviation } from "../measure/metrics.js";
import type { RunToRunBand } from "../measure/null/band.js";
import type { SplitHalfNull } from "../measure/null/splitHalf.js";
import type { ArmResult, RunResult } from "../sim/run.js";

/**
 * The measurement report layer.
 *
 * Nothing here computes a divergence or a quantile from raw positions: those live in
 * `web/engine/measure/`, which has a Python oracle. This file joins, gates and packages, and it
 * has no oracle and must not acquire one.
 *
 * `deviation` is the one deliberate exception to "no runtime import from `measure/`": every column
 * extractor is handed a `ReportContext`, and that record's `deviation` field has to be an already
 * computed `Deviation`, not a recipe for making one — `buildContext` is the single place that
 * calls it, once per run, so no other file in `job/` ever needs to. `RunToRunBand` and
 * `SplitHalfNull` stay type-only, same as `Deviation` did before this file needed a real value
 * instead of just its shape.
 */

/**
 * Per-agent displacement keyed by the uid the position buffers are keyed by.
 *
 * `deviation().perAgentM[i]` belongs to `pairedAgents(pair)[i]`, which is ordered by string-sorted
 * agent id — ped0, ped1, ped10, ped2. `ArmResult.positions[i]` is ordered by uid. Joining those
 * two arrays positionally silently rebinds every person from the eleventh onwards to a stranger,
 * and it shipped once. This is the only supported way to ask what one person's displacement was.
 */
export function perAgentDeviationByUid(pair: PairedRun, dev: Deviation): ReadonlyMap<number, number> {
  const agents = pairedAgents(pair);
  if (dev.perAgentM.length !== agents.length) {
    fail(
      `perAgentDeviationByUid was given ${dev.perAgentM.length} per-agent values for ` +
        `${agents.length} paired agents; they must come from the same pair`,
    );
  }
  const byUid = new Map<number, number>();
  for (let i = 0; i < agents.length; i++) {
    const entry = agents[i] as readonly [{ agentUid: number }, { agentUid: number }];
    const uid = entry[0].agentUid;
    const value = dev.perAgentM[i] as number;
    byUid.set(uid, value);
  }
  return byUid;
}

export interface PedestrianTimeLost {
  readonly meanS: number;
  readonly nUsed: number;
  readonly nAgents: number;
}

/**
 * How much longer each person took to settle with the robot in the room than without it.
 *
 * This is the ONE legitimate positional join in the codebase: `treated.positions[i]` and
 * `control.positions[i]` are both uid-ordered by `runArm`, so index i is the same person in both.
 * It is legitimate because neither side came from `pairedAgents`. Nothing else may join by index.
 *
 * A person who never settles in either arm is dropped and counted, never averaged as a zero.
 */
export function pedestrianTimeLost(r: RunResult, dt: number): PedestrianTimeLost {
  const nAgents = r.treated.positions.length;
  let nUsed = 0;
  let total = 0;
  for (let i = 0; i < nAgents; i++) {
    const treatedPath = r.treated.positions[i] as Float64Array;
    const controlPath = r.control.positions[i] as Float64Array;
    const treatedSettled = settledStep(treatedPath);
    const controlSettled = settledStep(controlPath);
    if (treatedSettled >= 0 && controlSettled >= 0) {
      nUsed++;
      total += (treatedSettled - controlSettled) * dt;
    }
  }
  let meanS = Number.NaN;
  if (nUsed > 0) {
    meanS = total / nUsed;
  }
  return { meanS, nUsed, nAgents };
}

/**
 * First step after which a pedestrian never moves again. -1 if they never settle.
 *
 * The 1e-9 tolerance here is deliberately not `metrics.ts`'s 1e-4, and the difference is
 * physical, not stylistic. A pedestrian who has arrived is frozen exactly: `stepWorld` zeroes
 * their velocity and skips their position update, so two consecutive samples are bit-identical.
 * The robot is never frozen this way — its planner can return `(0, 0)`, but `applyCommand`
 * integrates that through a first-order lag, so the robot's velocity decays geometrically toward
 * zero and its per-step displacement keeps shrinking without ever hitting it. A tolerance loose
 * enough to call that "settled" would call every long-idle robot tick settled too.
 */
function settledStep(path: Float64Array): number {
  const nSteps = path.length / 2;
  for (let s = 1; s < nSteps; s++) {
    const dx = (path[2 * s] as number) - (path[2 * s - 2] as number);
    const dy = (path[2 * s + 1] as number) - (path[2 * s - 1] as number);
    if (Math.sqrt(dx * dx + dy * dy) < 1e-9) {
      return s;
    }
  }
  return -1;
}

/** How the ruler was set. Task 15's `spec.ts` re-exports this and validates it. */
export interface MeasurementParams {
  readonly kind: "measurementParams";
  /** Default 60 steps, which is 3.00 s. Not 16: at 16 the forecaster reads below the band. */
  readonly forecastHorizonSteps: number;
  /** Required, never defaulted. With no end step the forecaster reads exactly 0 on this crowd. */
  readonly forecastEndStep: number;
  readonly nearMissThresholdM: number;
  readonly recoveryToleranceFraction: number;
  readonly recoveryDwellSteps: number;
}

/** First step at which a path is further than `thresholdM` from where it began. -1 if never. */
export function startedMovingStep(path: Float64Array, thresholdM: number): number {
  const nSteps = path.length / 2;
  const x0 = path[0] as number;
  const y0 = path[1] as number;
  for (let s = 0; s < nSteps; s++) {
    const dx = (path[2 * s] as number) - x0;
    const dy = (path[2 * s + 1] as number) - y0;
    if (Math.sqrt(dx * dx + dy * dy) > thresholdM) {
      return s;
    }
  }
  return -1;
}

export interface GatedClearance {
  readonly kind: "gatedClearance";
  readonly minM: number;
  readonly minAtStep: number;
  readonly nearMissEpisodes: number;
  readonly thresholdM: number;
  /** Earliest step any robot-person pair qualified. -1 if none ever did. */
  readonly firstMeasuredStep: number;
  readonly nStepsMeasured: number;
}

/**
 * Surface-to-surface gap between the robot and the nearest person, measured only from the moment
 * both of them have left where they were standing.
 *
 * "Has left" means further than its own body radius from its step-0 position. Before that a
 * pedestrian who spawned on the robot's start tile reports a gap of -0.55 m at step 0, which is
 * an artifact of where the crowd is placed and not something the robot did.
 *
 * Episodes rather than ticks, matching `clearance()`: counting ticks below a threshold makes the
 * safety number scale with 1/dt. A step where no pair yet qualifies breaks an episode.
 */
export function clearanceAfterBothMove(
  robotPath: Float64Array | null,
  pedestrianPaths: readonly Float64Array[],
  robotRadiusM: number,
  pedRadiusM: number,
  thresholdM: number,
): GatedClearance {
  const empty: GatedClearance = {
    kind: "gatedClearance",
    minM: Number.NaN,
    minAtStep: -1,
    nearMissEpisodes: 0,
    thresholdM,
    firstMeasuredStep: -1,
    nStepsMeasured: 0,
  };
  if (robotPath === null) {
    return empty;
  }
  const robotStart = startedMovingStep(robotPath, robotRadiusM);
  if (robotStart < 0) {
    return empty;
  }

  const gateOf: number[] = [];
  for (const path of pedestrianPaths) {
    const pedStart = startedMovingStep(path, pedRadiusM);
    if (pedStart < 0) {
      gateOf.push(-1);
    } else if (pedStart > robotStart) {
      gateOf.push(pedStart);
    } else {
      gateOf.push(robotStart);
    }
  }

  const nSteps = robotPath.length / 2;
  const contactRadius = robotRadiusM + pedRadiusM;
  let minM = Number.POSITIVE_INFINITY;
  let minAtStep = -1;
  let firstMeasuredStep = -1;
  let nStepsMeasured = 0;
  let episodes = 0;
  let inside = false;

  for (let s = 0; s < nSteps; s++) {
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pedestrianPaths.length; i++) {
      const gate = gateOf[i] as number;
      if (gate < 0 || s < gate) {
        continue;
      }
      const path = pedestrianPaths[i] as Float64Array;
      const dx = (path[2 * s] as number) - (robotPath[2 * s] as number);
      const dy = (path[2 * s + 1] as number) - (robotPath[2 * s + 1] as number);
      const gap = Math.sqrt(dx * dx + dy * dy) - contactRadius;
      if (gap < closest) {
        closest = gap;
      }
    }
    if (closest === Number.POSITIVE_INFINITY) {
      inside = false;
      continue;
    }
    nStepsMeasured++;
    if (firstMeasuredStep < 0) {
      firstMeasuredStep = s;
    }
    if (closest < minM) {
      minM = closest;
      minAtStep = s;
    }
    if (closest < thresholdM) {
      if (!inside) {
        episodes++;
        inside = true;
      }
    } else {
      inside = false;
    }
  }

  if (nStepsMeasured === 0) {
    return empty;
  }
  return {
    kind: "gatedClearance",
    minM,
    minAtStep,
    nearMissEpisodes: episodes,
    thresholdM,
    firstMeasuredStep,
    nStepsMeasured,
  };
}

/**
 * When the robot got there, in seconds, or NaN if it never did.
 *
 * `arrivedTick` is set after the robot moves on that tick, and that position is recorded as
 * sample `arrivedTick + 1`, so the arrival second is `(arrivedTick + 1) * dt`. Non-arrival is NaN
 * here and is rendered as censored by the column, never as a number and never as zero.
 */
export function arrivalSecondsOf(arm: ArmResult, dt: number): number {
  if (arm.arrivedTick < 0) {
    return Number.NaN;
  }
  return (arm.arrivedTick + 1) * dt;
}

/** Everything a column extractor is allowed to look at. Built once per run, never per column. */
export interface ReportContext {
  readonly kind: "reportContext";
  readonly config: RunConfig;
  readonly params: MeasurementParams;
  readonly run: RunResult;
  readonly deviation: Deviation;
  readonly band: RunToRunBand | null;
  readonly floor: SplitHalfNull | null;
  readonly zeroRun: RunResult | null;
  readonly frechetMeanM: number | null;
  /**
   * The shortest crossing that counts as arriving: straight-line start-to-goal minus the goal
   * radius the robot stops inside. 16.90 m at the default config, where start and goal are
   * 18.00 m apart and the robot stops within 1.1 m. It is a bound, and the tile says so.
   */
  readonly straightLineM: number;
}

export interface BuildContextInit {
  readonly config: RunConfig;
  readonly params: MeasurementParams;
  readonly run: RunResult;
  readonly band: RunToRunBand | null;
  readonly floor: SplitHalfNull | null;
  readonly zeroRun: RunResult | null;
  readonly frechetMeanM: number | null;
}

export function buildContext(init: BuildContextInit): ReportContext {
  const startX = init.config.robot.startXY[0];
  const startY = init.config.robot.startXY[1];
  const goalX = init.config.robot.goalXY[0];
  const goalY = init.config.robot.goalXY[1];
  const dx = goalX - startX;
  const dy = goalY - startY;
  const straightLine = Math.sqrt(dx * dx + dy * dy) - SIM_CONSTANTS.goalReachedM;
  let straightLineM = straightLine;
  if (straightLine < 0) {
    straightLineM = 0;
  }
  return Object.freeze({
    kind: "reportContext" as const,
    config: init.config,
    params: init.params,
    run: init.run,
    deviation: deviation(init.run.pair),
    band: init.band,
    floor: init.floor,
    zeroRun: init.zeroRun,
    frechetMeanM: init.frechetMeanM,
    straightLineM,
  });
}
