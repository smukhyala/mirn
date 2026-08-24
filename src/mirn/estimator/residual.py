"""`ConstantVelocityResidual` — the estimator this project critiques.

This reproduces standard forecast-residual practice: for each pedestrian in the **factual** arm
only, fit a constant-velocity model from two consecutive observed positions ending `horizon_steps`
before `end_step` (the trajectory's last timestep by default), roll that model forward
`horizon_steps`, and report the divergence between the rolled-forward forecast and the
actually-observed continuation as "perturbation". The counterfactual arm is never consulted —
which is exactly the defect `paired.py` exists to fix.
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
    trajectory: Trajectory, horizon_steps: int, divergence_name: str, end_step: int | None
) -> float:
    """The forecast-vs-observed divergence for one pedestrian's factual-arm trajectory.

    The two positions immediately before and at index `anchor_index = end_step - horizon_steps`
    fix a constant velocity; that velocity is rolled forward `horizon_steps` steps to produce a
    forecast path, which is compared against the actually-observed path over the same window via
    the named divergence's `between_paths`. `end_step=None` means the last timestep.
    """
    positions = trajectory.positions
    n_steps = positions.shape[0]

    if end_step is None:
        window_end = n_steps - 1
    else:
        window_end = end_step
    if window_end < 0 or window_end > n_steps - 1:
        raise ValueError(
            f"ConstantVelocityResidual end_step must lie in [0, {n_steps - 1}] for agent "
            f"'{trajectory.agent_id}', got {window_end}"
        )

    anchor_index = window_end - horizon_steps

    if anchor_index < 1:
        raise ValueError(
            "ConstantVelocityResidual needs at least horizon_steps + 2 = "
            f"{horizon_steps + 2} timesteps up to and including end_step to fit a "
            f"constant-velocity anchor and roll it forward, got a window ending at "
            f"{window_end} of {n_steps} timesteps for agent '{trajectory.agent_id}'"
        )

    velocity = (positions[anchor_index] - positions[anchor_index - 1]) / trajectory.dt

    forecast_path = np.empty((horizon_steps, 2), dtype=np.float64)
    for step_offset in range(1, horizon_steps + 1):
        offset_position = (
            positions[anchor_index] + velocity * trajectory.dt * step_offset
        )
        forecast_path[step_offset - 1] = offset_position

    observed_path = positions[anchor_index + 1 : anchor_index + 1 + horizon_steps]

    divergence = DIVERGENCES.create(divergence_name)
    return divergence.between_paths(forecast_path, observed_path)


@ESTIMATORS.register("cvm_residual")
class ConstantVelocityResidual(PerturbationEstimator):
    """Standard-practice forecast-residual estimator: the estimator this project critiques.

    `end_step` moves the measurement window off the end of the episode, and it exists because
    the end of an episode is where this estimator flatters itself. Once everybody has arrived
    and stopped, a constant-velocity forecast of a stationary person is exactly right, the
    residual is exactly 0.0, and the estimator reports a perfect score precisely where it is
    testing nothing. The browser's crowds park like that; these synthetic ones cross at constant
    speed and never stop, which is why Python could get away without the parameter until the
    two implementations had to agree on the same number. Default `None` keeps the old behaviour
    (anchor at the last timestep).
    """

    name = "cvm_residual"

    def __init__(
        self,
        horizon_steps: int = 16,
        divergence: str = "ade",
        end_step: int | None = None,
    ) -> None:
        if horizon_steps < 1:
            raise ValueError(f"horizon_steps must be >= 1, got {horizon_steps}")
        if end_step is not None and end_step < 0:
            raise ValueError(f"end_step must be >= 0 or None, got {end_step}")
        self.horizon_steps = horizon_steps
        self.divergence_name = divergence
        # Not bounded above here: the upper bound is per-trajectory (T - 1), so it is checked in
        # _constant_velocity_residual where T is known, and names the agent when it fires.
        self.end_step = end_step
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
                    pedestrians[agent_index],
                    self.horizon_steps,
                    self.divergence_name,
                    self.end_step,
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
