"""`NoisyOracleResidual` — a deliberately corrupted oracle, used to make the confounding analytic.

`ConstantVelocityResidual` demonstrates that a forecast residual conflates causal effect with
forecast error, but its only quality knob is the forecast horizon, which is coarse and moves
several things at once. This estimator instead takes the *true* counterfactual path and adds
i.i.d. Gaussian noise of a caller-specified scale, producing a predictor whose error is exactly
the parameter `predictor_error_std`. Sweeping that parameter while the true perturbation is pinned
at zero gives the wayfinder's §11 measurement 5 in closed form: with the `ade` divergence the
reported value has expectation `sigma * sqrt(pi / 2)`, a straight line through the origin, while
the true effect never moves off zero.

It is a diagnostic and never a proposal. It consults the counterfactual arm only in order to
corrupt it, which is the opposite of what `paired.py` does with the same data.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from mirn.contracts import PerturbationEstimate, RolloutPair
from mirn.divergence import DIVERGENCES
from mirn.estimator.base import ESTIMATORS, PerturbationEstimator, bootstrap_ci

_NOISY_ORACLE_IDENTIFICATION = (
    "UNMET: this estimator does not identify the causal effect of robot presence, and is not "
    "offered as a way to measure anything. It constructs a forecast by taking each pedestrian's "
    "true counterfactual path and adding i.i.d. Gaussian noise of a caller-specified standard "
    "deviation, then reports the divergence between that corrupted forecast and the observed "
    "factual path exactly as a forecast-residual estimator would. It therefore reports predictor "
    "error by construction: on data whose true perturbation is exactly zero it still returns a "
    "positive number that grows linearly with the injected noise. It exists to demonstrate that "
    "property, which is the defect ConstantVelocityResidual exhibits accidentally and this "
    "estimator exhibits on purpose."
)


@ESTIMATORS.register("noisy_oracle_residual")
class NoisyOracleResidual(PerturbationEstimator):
    """A perfect causal predictor corrupted by a known amount of Gaussian error."""

    name = "noisy_oracle_residual"

    def __init__(self, predictor_error_std: float = 0.05, divergence: str = "ade") -> None:
        if predictor_error_std < 0.0:
            raise ValueError(
                f"NoisyOracleResidual predictor_error_std must be >= 0, got {predictor_error_std}"
            )
        self.predictor_error_std = predictor_error_std
        self.divergence_name = divergence
        self._divergence = DIVERGENCES.create(divergence)

    def identification(self) -> str:
        return _NOISY_ORACLE_IDENTIFICATION

    def estimate(self, pairs: Sequence[RolloutPair], seed: int) -> PerturbationEstimate:
        if len(pairs) < 1:
            raise ValueError("estimate requires at least one RolloutPair")

        rng = np.random.default_rng(seed)

        per_pair_values = np.empty(len(pairs), dtype=np.float64)
        for pair_index in range(len(pairs)):
            agent_pairs = pairs[pair_index].paired_agents()
            if len(agent_pairs) < 1:
                raise ValueError(f"RolloutPair at index {pair_index} has no paired agents")

            agent_values = np.empty(len(agent_pairs), dtype=np.float64)
            for agent_index in range(len(agent_pairs)):
                factual_traj, counterfactual_traj = agent_pairs[agent_index]
                counterfactual_positions = counterfactual_traj.positions
                noise = rng.normal(
                    0.0, self.predictor_error_std, size=counterfactual_positions.shape
                )
                forecast_positions = counterfactual_positions + noise
                agent_values[agent_index] = self._divergence.between_paths(
                    forecast_positions, factual_traj.positions
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
