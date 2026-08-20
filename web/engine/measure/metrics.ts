import type { PairedRun } from "../contracts/pairedRun.js";
import { pairedAgents } from "../contracts/pairedRun.js";
import type { RunResult } from "../sim/run.js";
import { argmax, mean, pathLength, perStepDistance } from "./kernels.js";

/**
 * The measurements the lesson is built from.
 *
 * Six of them, and the set is chosen so that each answers a question the previous one could not.
 * Deliberately absent: cumulative deviation in metre-seconds, which is a unit nobody has a feel
 * for and which hides which of its two factors moved; and a separate collision count, which is a
 * lossy summary of the clearance series whose value depends on the timestep.
 */

export interface Deviation {
  /** Per-tick mean over agents of the gap between a person's two paths. */
  readonly series: Float64Array;
  /** "How bad was it typically?" Python's ADE, per agent, averaged. */
  readonly meanM: number;
  /** "How bad did it ever get?" With the tick it happened on, so the canvas can point at it. */
  readonly maxM: number;
  readonly maxAtStep: number;
  /** Per-agent mean deviation, so a single person can be singled out. */
  readonly perAgentM: Float64Array;
}

export function deviation(pair: PairedRun): Deviation {
  const agents = pairedAgents(pair);
  const nSteps = pair.nSteps;
  const series = new Float64Array(nSteps);
  const perAgent = new Float64Array(agents.length);

  for (let i = 0; i < agents.length; i++) {
    const [treated, control] = agents[i] as readonly [
      { positions: Float64Array },
      { positions: Float64Array },
    ];
    const perStep = perStepDistance(treated.positions, control.positions);
    perAgent[i] = mean(perStep);
    for (let s = 0; s < nSteps; s++) {
      series[s] = (series[s] as number) + (perStep[s] as number);
    }
  }
  for (let s = 0; s < nSteps; s++) {
    series[s] = (series[s] as number) / agents.length;
  }

  const maxAtStep = argmax(series);
  return {
    series,
    meanM: mean(perAgent),
    maxM: series[maxAtStep] as number,
    maxAtStep,
    perAgentM: perAgent,
  };
}

/**
 * How much further the robot travelled, and how much longer it took.
 *
 * Signed, deliberately. A shove toward the goal genuinely shortens the path and saves time, and
 * clipping that to zero would be a lie — which is why these do not go through
 * `PerturbationEstimate`, whose `value >= 0` rule is correct for divergences and wrong here.
 *
 * `timeLostS` is censored when an arm never reaches the goal: the tile must then render "> 4.2 s"
 * rather than a number, because a bound is not a measurement.
 */
export interface RobotCost {
  readonly extraPathM: number;
  readonly treatedPathM: number;
  readonly controlPathM: number;
  readonly timeLostS: number;
  readonly censored: boolean;
  readonly treatedArrivalS: number;
  readonly controlArrivalS: number;
}

export function robotCost(treated: RunResult["treated"], control: RunResult["control"], dt: number): RobotCost {
  const a = treated.robotPositions;
  const b = control.robotPositions;
  if (a === null) {
    return {
      extraPathM: Number.NaN,
      treatedPathM: Number.NaN,
      controlPathM: b === null ? Number.NaN : pathLength(b),
      timeLostS: Number.NaN,
      censored: true,
      treatedArrivalS: Number.NaN,
      controlArrivalS: Number.NaN,
    };
  }
  if (b === null) {
    // A robot-presence pair has no robot in the control arm, so there is nothing to compare the
    // robot's own journey AGAINST — but the treated robot still has a path and an arrival time,
    // and those are the whole x-axis of the politeness trade-off. The first version discarded
    // them along with the comparison and every time-to-goal came back NaN.
    const treatedArrivalOnly = arrivalStep(a);
    return {
      extraPathM: Number.NaN,
      treatedPathM: pathLength(a),
      controlPathM: Number.NaN,
      timeLostS: Number.NaN,
      censored: true,
      treatedArrivalS: treatedArrivalOnly < 0 ? Number.NaN : treatedArrivalOnly * dt,
      controlArrivalS: Number.NaN,
    };
  }
  const treatedPathM = pathLength(a);
  const controlPathM = pathLength(b);
  const treatedArrival = arrivalStep(a);
  const controlArrival = arrivalStep(b);
  const censored = treatedArrival < 0 || controlArrival < 0;
  return {
    extraPathM: treatedPathM - controlPathM,
    treatedPathM,
    controlPathM,
    timeLostS: censored ? Number.NaN : (treatedArrival - controlArrival) * dt,
    censored,
    treatedArrivalS: treatedArrival < 0 ? Number.NaN : treatedArrival * dt,
    controlArrivalS: controlArrival < 0 ? Number.NaN : controlArrival * dt,
  };
}

/** First step after which the path never moves again: the robot has stopped at its goal. */
function arrivalStep(path: Float64Array): number {
  const nSteps = path.length / 2;
  for (let s = 1; s < nSteps; s++) {
    const dx = (path[2 * s] as number) - (path[2 * s - 2] as number);
    const dy = (path[2 * s + 1] as number) - (path[2 * s - 1] as number);
    if (Math.sqrt(dx * dx + dy * dy) < 1e-4) {
      return s;
    }
  }
  return -1;
}

/**
 * How close the robot ever came to anybody, surface to surface, and how many separate occasions
 * it came closer than a threshold.
 *
 * Episodes, not ticks. Counting ticks below a threshold makes the "safety" number scale with
 * 1/dt, which is a wonderful demonstration of a metric that depends on your simulator settings
 * rather than on the world — but a terrible default.
 */
export interface Clearance {
  readonly minM: number;
  readonly minAtStep: number;
  readonly nearMissEpisodes: number;
  readonly thresholdM: number;
}

export function clearance(
  robotPath: Float64Array | null,
  pedestrianPaths: readonly Float64Array[],
  robotRadiusM: number,
  pedRadiusM: number,
  thresholdM: number,
): Clearance {
  if (robotPath === null) {
    return { minM: Number.NaN, minAtStep: -1, nearMissEpisodes: 0, thresholdM };
  }
  const nSteps = robotPath.length / 2;
  let minM = Number.POSITIVE_INFINITY;
  let minAtStep = -1;
  let episodes = 0;
  let inside = false;

  for (let s = 0; s < nSteps; s++) {
    let closest = Number.POSITIVE_INFINITY;
    for (const path of pedestrianPaths) {
      const dx = (path[2 * s] as number) - (robotPath[2 * s] as number);
      const dy = (path[2 * s + 1] as number) - (robotPath[2 * s + 1] as number);
      const gap = Math.sqrt(dx * dx + dy * dy) - (robotRadiusM + pedRadiusM);
      if (gap < closest) {
        closest = gap;
      }
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
  return { minM, minAtStep, nearMissEpisodes: episodes, thresholdM };
}

/**
 * How long after a disturbance the deviation stayed back inside a tolerance.
 *
 * `toleranceM` is a choice, not a fact, and the interface makes the reader drag it — because
 * "recovered" is a property of the tolerance you picked, not of the system. Censored when the
 * episode ends before the dwell window is satisfied.
 */
export interface Recovery {
  readonly recoveryS: number;
  readonly censored: boolean;
  readonly peakM: number;
  readonly peakAtS: number;
  readonly toleranceM: number;
}

export function recovery(
  series: Float64Array,
  disturbanceStep: number,
  dt: number,
  toleranceM: number,
  dwellSteps: number,
): Recovery {
  const nSteps = series.length;
  let peakM = 0;
  let peakAtStep = disturbanceStep;
  for (let s = disturbanceStep; s < nSteps; s++) {
    if ((series[s] as number) > peakM) {
      peakM = series[s] as number;
      peakAtStep = s;
    }
  }

  for (let start = disturbanceStep; start < nSteps - dwellSteps; start++) {
    let held = true;
    for (let s = start; s <= start + dwellSteps; s++) {
      if ((series[s] as number) > toleranceM) {
        held = false;
        break;
      }
    }
    if (held) {
      return {
        recoveryS: (start - disturbanceStep) * dt,
        censored: false,
        peakM,
        peakAtS: (peakAtStep - disturbanceStep) * dt,
        toleranceM,
      };
    }
  }
  return {
    recoveryS: Number.NaN,
    censored: true,
    peakM,
    peakAtS: (peakAtStep - disturbanceStep) * dt,
    toleranceM,
  };
}
