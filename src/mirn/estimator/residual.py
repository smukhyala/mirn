"""`ConstantVelocityResidual` — the estimator this project critiques.

This reproduces standard forecast-residual practice: for each pedestrian in the **factual** arm
only, fit a constant-velocity model from two consecutive observed positions ending `horizon_steps`
before the trajectory's end, roll that model forward `horizon_steps`, and report the divergence
between the rolled-forward forecast and the actually-observed continuation as "perturbation". The
counterfactual arm is never consulted — which is exactly the defect `paired.py` exists to fix.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from mirn.contracts import PerturbationEstimate, RolloutPair, Trajectory
from mirn.divergence import DIVERGENCES
from mirn.estimator.base import ESTIMATORS, PerturbationEstimator, bootstrap_ci

_RESIDUAL_IDENTIFICATION = (
    "UNMET: this estimator does not identify the causal effect of robot presence. It forecasts "
    "each factual-arm pedestrian's own future position from its own recent past under a "
    "constant-velocity model, then reports the forecast residual as if it were perturbation; the "
    "counterfactual (robot-absent) arm of the RolloutPair is never consulted. The residual it "
    "reports therefore conflates the causal effect of the robot with ordinary forecast error — "
    "turning, acceleration, sensor noise, model misspecification — that would be present even in "
    "a robot-free world. It is included here for side-by-side comparison against the paired "
    "estimator, and is reported for that comparison only; it is not to be believed as a "
    "measurement of perturbation."
)


def _constant_velocity_residual(
    trajectory: Trajectory, horizon_steps: int, divergence_name: str
) -> float:
    """The forecast-vs-observed divergence for one pedestrian's factual-arm trajectory.

    The two positions immediately before and at index `anchor_index = (T - 1) - horizon_steps`
    fix a constant velocity; that velocity is rolled forward `horizon_steps` steps to produce a
    forecast path, which is compared against the actually-observed path over the same window via
    the named divergence's `between_paths`.
    """
    positions = trajectory.positions
    n_steps = positions.shape[0]
    anchor_index = (n_steps - 1) - horizon_steps

    if anchor_index < 1:
        raise ValueError(
            "ConstantVelocityResidual requires trajectories with at least "
            f"horizon_steps + 2 = {horizon_steps + 2} timesteps to fit a constant-velocity "
            f"anchor and roll it forward, got {n_steps} timesteps for agent "
            f"'{trajectory.agent_id}'"
        )

    velocity = (positions[anchor_index] - positions[anchor_index - 1]) / trajectory.dt

    forecast_path = np.empty((horizon_steps, 2), dtype=np.float64)
    for step_offset in range(1, horizon_steps + 1):
        forecast_path[step_offset - 1] = positions[anchor_index] + velocity * trajectory.dt * step_offset

    observed_path = positions[anchor_index + 1 : anchor_index + 1 + horizon_steps]

    divergence = DIVERGENCES.create(divergence_name)
    return divergence.between_paths(forecast_path, observed_path)


@ESTIMATORS.register("cvm_residual")
class ConstantVelocityResidual(PerturbationEstimator):
    """Standard-practice forecast-residual estimator: the estimator this project critiques."""

    name = "cvm_residual"

    def __init__(self, horizon_steps: int = 16, divergence: str = "ade") -> None:
        if horizon_steps < 1:
            raise ValueError(f"horizon_steps must be >= 1, got {horizon_steps}")
        self.horizon_steps = horizon_steps
        self.divergence_name = divergence
        # Constructed once up front so an unknown divergence name fails at __init__ time, not on
        # the first call to estimate().
        DIVERGENCES.create(divergence)

    def identification(self) -> str:
        return _RESIDUAL_IDENTIFICATION

    def estimate(self, pairs: Sequence[RolloutPair], seed: int) -> PerturbationEstimate:
        if len(pairs) < 1:
            raise ValueError("estimate requires at least one RolloutPair")

        per_pair_values = np.empty(len(pairs), dtype=np.float64)
        for pair_index in range(len(pairs)):
            factual_scene = pairs[pair_index].factual
            pedestrians = factual_scene.pedestrians
            if len(pedestrians) < 1:
                raise ValueError(f"RolloutPair at index {pair_index} has no factual pedestrians")

            agent_values = np.empty(len(pedestrians), dtype=np.float64)
            for agent_index in range(len(pedestrians)):
                agent_values[agent_index] = _constant_velocity_residual(
                    pedestrians[agent_index], self.horizon_steps, self.divergence_name
                )
            per_pair_values[pair_index] = np.mean(agent_values)

        value = float(np.mean(per_pair_values))
        ci_low, ci_high = bootstrap_ci(per_pair_values, seed)

        return PerturbationEstimate(
            value=value,
            ci_low=ci_low,
            ci_high=ci_high,
            units="metres",
            identification=self.identification(),
            n_samples=len(pairs),
            divergence_name=self.divergence_name,
            estimator_name=self.name,
        )
