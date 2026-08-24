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
 *
 * These functions compute values. They do not carry a description of how the value was reached:
 * the arithmetic runs here, over the kernels in `kernels.ts`, and the wording a reader opens
 * underneath a number is written by hand in `web/engine/job/columns.ts`. Keeping the two in step is a convention
 * and not a mechanism — a derivation panel has already once explained a different quantity from
 * the one printed above it — so a change to any formula below is a change to its builder as well.
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
 * How much further the robot travelled.
 *
 * Signed, deliberately. A shove toward the goal genuinely shortens the path, and clipping that to
 * zero would be a lie — which is why this does not go through `PerturbationEstimate`, whose
 * `value >= 0` rule is correct for divergences and wrong here.
 *
 * It used to carry four more fields — a time lost, a censoring flag and both arrival times — all
 * of them derived from a "first step after which the path stops moving" heuristic. That heuristic
 * is the one that reported a 1.1 m/s robot arriving at 2.26 m/s under a heavy deflection weight,
 * because a robot pinned against the crowd stops moving without having arrived. Nothing ever read
 * those four: the console's arrival column goes through `arrivalSecondsOf`, which asks the
 * simulator when the robot actually came inside its goal radius rather than guessing from the
 * shape of the path. They are gone rather than merely unused, because the next author of a
 * time-to-goal column would have found `treatedArrivalS` sitting here and reached for it.
 */
export interface RobotCost {
  readonly extraPathM: number;
  readonly treatedPathM: number;
  readonly controlPathM: number;
}

export function robotCost(treated: RunResult["treated"], control: RunResult["control"]): RobotCost {
  const a = treated.robotPositions;
  const b = control.robotPositions;
  if (a === null) {
    return {
      extraPathM: Number.NaN,
      treatedPathM: Number.NaN,
      controlPathM: b === null ? Number.NaN : pathLength(b),
    };
  }
  if (b === null) {
    // A robot-presence pair has no robot in the control arm, so there is nothing to compare the
    // robot's own journey AGAINST — but the treated robot still has a path of its own, and
    // discarding that along with the comparison would lose a measurement that is perfectly well
    // defined.
    return {
      extraPathM: Number.NaN,
      treatedPathM: pathLength(a),
      controlPathM: Number.NaN,
    };
  }
  const treatedPathM = pathLength(a);
  const controlPathM = pathLength(b);
  return {
    extraPathM: treatedPathM - controlPathM,
    treatedPathM,
    controlPathM,
  };
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
