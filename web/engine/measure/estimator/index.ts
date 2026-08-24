import { fail } from "../../core/errors.js";
import type { PairedRun } from "../../contracts/pairedRun.js";
import { pairedAgents } from "../../contracts/pairedRun.js";
import { ade } from "../divergence/index.js";
import { mean, pairwiseSum } from "../kernels.js";

/**
 * The two estimators the lesson turns on, ported from src/mirn/estimator/.
 *
 * `paired` can see both worlds, because this one is invented. `cvmResidual` cannot — it does what
 * published work has to do, guessing where a person was about to walk and calling the error a
 * measurement of the robot. Showing them side by side, on a run where the honest answer is known
 * to be zero, is the whole argument.
 */

export interface Estimate {
  readonly value: number;
  readonly nSamples: number;
  readonly estimatorName: string;
  readonly divergenceName: string;
  /** The identifying assumption, in the estimator's own words. Never optional. */
  readonly identification: string;
}

const PAIRED_IDENTIFICATION =
  "Both runs share a seed, a starting state and an exogenous noise draw, and differ only in " +
  "whether the robot is there. Because nothing else can differ, the gap between a person's two " +
  "paths is the robot's effect on them and nothing is estimated.";

const CVM_IDENTIFICATION =
  "UNMET: this does not identify the robot's effect. It forecasts each person's future from " +
  "their own recent past assuming they carry straight on, then reports how wrong the forecast " +
  "was as if that were the robot's doing. The number therefore contains every reason a person " +
  "might not walk in a straight line — turning, slowing, stepping round somebody else — which " +
  "would all be there with no robot in the room at all.";

/** Mean over agents of the divergence between their two paths. One value per paired run. */
export function paired(pair: PairedRun): Estimate {
  const agents = pairedAgents(pair);
  if (agents.length === 0) {
    fail("paired estimator requires at least one shared agent");
  }
  const perAgent = new Float64Array(agents.length);
  for (let i = 0; i < agents.length; i++) {
    const [treated, control] = agents[i] as readonly [
      { positions: Float64Array },
      { positions: Float64Array },
    ];
    perAgent[i] = ade(treated.positions, control.positions);
  }
  return {
    value: mean(perAgent),
    nSamples: agents.length,
    estimatorName: "paired",
    divergenceName: "ade",
    identification: PAIRED_IDENTIFICATION,
  };
}

/**
 * Constant-velocity forecast residual: the method being critiqued.
 *
 * Fit a velocity from the two observations ending `horizonSteps` before `endStep`, roll it
 * forward, and compare against what actually happened. The counterfactual arm is never consulted
 * — which is exactly the defect, and why the same run can report half a metre of "robot effect"
 * from a robot that did nothing.
 *
 * `endStep` matters more here than it does in Python, and it is the reason this parameter exists.
 * The Python version anchors at the last timestep because its synthetic pedestrians cross at
 * constant speed and never stop. These ones arrive and park, so by the end of the episode the
 * room is motionless: a constant-velocity forecast of a stationary person is exactly right, the
 * residual is exactly zero, and the estimator reads 0.0000 no matter how bad it actually is.
 * Measure it where the crowd is moving, or do not measure it.
 */
export function cvmResidual(pair: PairedRun, horizonSteps: number, endStep?: number): Estimate {
  if (!Number.isInteger(horizonSteps) || horizonSteps < 1) {
    fail(`cvmResidual horizonSteps must be a positive integer, got ${horizonSteps}`);
  }
  const agents = pairedAgents(pair);
  const perAgent = new Float64Array(agents.length);

  for (let i = 0; i < agents.length; i++) {
    const [treated] = agents[i] as readonly [
      { positions: Float64Array; nSteps: number; dt: number; agentId: string },
      unknown,
    ];
    const positions = treated.positions;
    const nSteps = treated.nSteps;
    const window = endStep === undefined ? nSteps - 1 : endStep;
    if (!Number.isInteger(window) || window < 0 || window > nSteps - 1) {
      fail(`cvmResidual endStep must be an integer in [0, ${nSteps - 1}], got ${endStep}`);
    }
    const anchor = window - horizonSteps;
    if (anchor < 1) {
      fail(
        `cvmResidual needs at least horizonSteps + 2 = ${horizonSteps + 2} timesteps to fit a ` +
          `velocity and roll it forward, got ${nSteps} for agent '${treated.agentId}'`,
      );
    }

    const vx = ((positions[2 * anchor] as number) - (positions[2 * anchor - 2] as number)) / treated.dt;
    const vy =
      ((positions[2 * anchor + 1] as number) - (positions[2 * anchor - 1] as number)) / treated.dt;

    const residuals = new Float64Array(horizonSteps);
    for (let step = 1; step <= horizonSteps; step++) {
      const forecastX = (positions[2 * anchor] as number) + vx * treated.dt * step;
      const forecastY = (positions[2 * anchor + 1] as number) + vy * treated.dt * step;
      const actualX = positions[2 * (anchor + step)] as number;
      const actualY = positions[2 * (anchor + step) + 1] as number;
      const dx = actualX - forecastX;
      const dy = actualY - forecastY;
      residuals[step - 1] = Math.sqrt(dx * dx + dy * dy);
    }
    perAgent[i] = pairwiseSum(residuals, 0, horizonSteps) / horizonSteps;
  }

  return {
    value: mean(perAgent),
    nSamples: agents.length,
    estimatorName: "cvm_residual",
    divergenceName: "ade",
    identification: CVM_IDENTIFICATION,
  };
}
