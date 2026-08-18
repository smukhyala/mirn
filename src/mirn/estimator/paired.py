"""`PairedCounterfactual` and `DebiasedPairedCounterfactual` — the estimators this project
proposes in place of the single-arm forecast-residual approach in `residual.py`.

Both consult `RolloutPair.paired_agents()`: for each pedestrian that appears in both arms of a
pair, the named divergence's `between_paths` is applied to that pedestrian's factual path against
its own counterfactual path, under the shared-seed / shared-exogenous-noise identification that
makes the two paths differ only by the robot's presence. Per-agent divergences are averaged to one
value per pair, and the per-pair array is what `bootstrap_ci` resamples — this is what "1000
resamples over pairs" means in practice.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from mirn.contracts import PerturbationEstimate, RolloutPair
from mirn.divergence import DIVERGENCES, Divergence
from mirn.estimator.base import ESTIMATORS, PerturbationEstimator, bootstrap_ci

_PAIRED_IDENTIFICATION = (
    "Identifies the causal effect of robot presence under the assumption that the factual and "
    "counterfactual arms of a RolloutPair share the same seed and the same exogenous pedestrian "
    "noise realisation (enforced by RolloutPair.__post_init__), so that the only difference "
    "between an agent's factual and counterfactual path is the robot's presence. Under that "
    "assumption, the divergence between the two paths is exactly the robot's causal effect on "
    "that agent, not a mixture of causal effect and ordinary forecast error."
)


def _per_pair_values(pairs: Sequence[RolloutPair], divergence: Divergence) -> np.ndarray:
    """One divergence value per `RolloutPair`: the named divergence's `between_paths`, applied to
    each paired agent's factual vs. counterfactual path, averaged over agents in that pair."""
    if len(pairs) < 1:
        raise ValueError("estimate requires at least one RolloutPair")

    per_pair_values = np.empty(len(pairs), dtype=np.float64)
    for pair_index in range(len(pairs)):
        pair = pairs[pair_index]
        agent_pairs = pair.paired_agents()
        if len(agent_pairs) < 1:
            raise ValueError(f"RolloutPair at index {pair_index} has no paired agents")

        agent_values = np.empty(len(agent_pairs), dtype=np.float64)
        for agent_index in range(len(agent_pairs)):
            factual_traj, counterfactual_traj = agent_pairs[agent_index]
            agent_values[agent_index] = divergence.between_paths(
                factual_traj.positions, counterfactual_traj.positions
            )
        per_pair_values[pair_index] = np.mean(agent_values)

    return per_pair_values


@ESTIMATORS.register("paired")
class PairedCounterfactual(PerturbationEstimator):
    """The paired-counterfactual estimator: mean divergence between each agent's factual and
    counterfactual path, in raw metres."""

    name = "paired"

    def __init__(self, divergence: str = "ade") -> None:
        self.divergence_name = divergence
        self._divergence = DIVERGENCES.create(divergence)

    def identification(self) -> str:
        return _PAIRED_IDENTIFICATION

    def estimate(self, pairs: Sequence[RolloutPair], seed: int) -> PerturbationEstimate:
        per_pair_values = _per_pair_values(pairs, self._divergence)
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


@ESTIMATORS.register("paired_debiased")
class DebiasedPairedCounterfactual(PerturbationEstimator):
    """`PairedCounterfactual`, debiased against a calibrated detection floor.

    Subtracts `floor` (in the same raw-metre units the divergence produces) from every per-pair
    value before averaging and bootstrapping, then clips the reported `value` and `ci_low` at
    zero — a perturbation estimate below the measurement noise floor is reported as "no detected
    perturbation", not as a negative effect. When `floor > 0`, the result is additionally
    rescaled into MDP units by dividing `value`, `ci_low`, and `ci_high` by `floor`, per the
    project's "never report perturbation in raw metres outside calibration units" convention.
    """

    name = "paired_debiased"

    def __init__(self, divergence: str = "ade", floor: float = 0.0) -> None:
        if floor < 0:
            raise ValueError(f"DebiasedPairedCounterfactual floor must be >= 0, got {floor}")
        self.divergence_name = divergence
        self._divergence = DIVERGENCES.create(divergence)
        self.floor = floor

    def identification(self) -> str:
        return (
            _PAIRED_IDENTIFICATION
            + " Additionally assumes the supplied detection floor was calibrated via "
            "mirn.calibration.null.minimum_detectable_perturbation on a comparable "
            "divergence/dataset combination, so that subtracting it isolates signal that "
            "exceeds what split-half measurement noise alone could produce."
        )

    def estimate(self, pairs: Sequence[RolloutPair], seed: int) -> PerturbationEstimate:
        if self.floor == 0.0:
            raise ValueError(
                "DebiasedPairedCounterfactual.floor is 0.0; calibrate a detection floor first "
                "via mirn.calibration.null.minimum_detectable_perturbation (floor=0.0 would "
                "silently report raw, undebiased metres as if they were a calibrated estimate)."
            )

        raw_per_pair_values = _per_pair_values(pairs, self._divergence)
        debiased_per_pair_values = raw_per_pair_values - self.floor

        raw_value = float(np.mean(debiased_per_pair_values))
        raw_ci_low, raw_ci_high = bootstrap_ci(debiased_per_pair_values, seed)

        value = max(raw_value, 0.0)
        ci_low = max(raw_ci_low, 0.0)
        # Debiasing can, in the degenerate case where the floor dominates every per-pair value,
        # push the raw upper percentile below the (already-clipped) point estimate. Clip against
        # `value` rather than a bare 0.0 so `ci_low <= value <= ci_high` always holds and
        # PerturbationEstimate's own validation never fails on the estimator's account.
        ci_high = max(raw_ci_high, value)

        units = "metres"
        if self.floor > 0.0:
            value = value / self.floor
            ci_low = ci_low / self.floor
            ci_high = ci_high / self.floor
            units = "mdp"

        return PerturbationEstimate(
            value=value,
            ci_low=ci_low,
            ci_high=ci_high,
            units=units,
            identification=self.identification(),
            n_samples=len(pairs),
            divergence_name=self.divergence_name,
            estimator_name=self.name,
        )
