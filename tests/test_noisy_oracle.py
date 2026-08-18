"""NoisyOracleResidual is a diagnostic, not a proposal: it exists so the confounding argument has
a closed form instead of only a plot. With the factual and counterfactual arms bitwise identical
(influence = 0.0), every metre it reports is predictor error, and the ADE of an isotropic Gaussian
displacement is Rayleigh-distributed with mean sigma * sqrt(pi / 2)."""

from __future__ import annotations

import math

import numpy as np
import pytest

from mirn.contracts import RolloutPair, Scene, Trajectory
from mirn.data.synthetic import SyntheticAdapter
from mirn.estimator import ESTIMATORS

_RAYLEIGH_MEAN_FACTOR = math.sqrt(math.pi / 2.0)


def _zero_influence_pairs() -> tuple:
    adapter = SyntheticAdapter(n_scenes=8, n_pedestrians=12, n_steps=60, seed=0)
    return adapter.rollout_pairs_with_influence(0.0)


def test_identification_declares_the_assumption_unmet() -> None:
    estimator = ESTIMATORS.create("noisy_oracle_residual")
    assert estimator.identification().startswith("UNMET:")


def test_zero_noise_on_zero_influence_reports_exactly_zero() -> None:
    """A perfect predictor in a world with no robot effect must report exactly 0.0 — this is the
    anchor the whole sweep hangs from."""
    estimator = ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=0.0)
    result = estimator.estimate(_zero_influence_pairs(), seed=7)
    assert result.value == 0.0
    assert result.ci_low == 0.0
    assert result.ci_high == 0.0


@pytest.mark.parametrize("sigma", [0.02, 0.10, 0.25])
def test_reported_value_matches_the_rayleigh_closed_form(sigma: float) -> None:
    estimator = ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=sigma)
    result = estimator.estimate(_zero_influence_pairs(), seed=11)
    expected = sigma * _RAYLEIGH_MEAN_FACTOR
    assert result.value == pytest.approx(expected, rel=0.05)


def test_reported_value_increases_strictly_with_predictor_error() -> None:
    pairs = _zero_influence_pairs()
    sigmas = [0.0, 0.05, 0.10, 0.20, 0.40]
    values: list[float] = []
    for sigma in sigmas:
        estimator = ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=sigma)
        values.append(estimator.estimate(pairs, seed=3).value)
    for index in range(1, len(values)):
        assert values[index] > values[index - 1]


def test_true_perturbation_stays_exactly_zero_across_that_sweep() -> None:
    """The point of the sweep: the reported number climbs while the truth does not move."""
    pairs = _zero_influence_pairs()
    paired = ESTIMATORS.create("paired")
    assert paired.estimate(pairs, seed=3).value == 0.0


def test_is_deterministic_under_a_fixed_seed() -> None:
    pairs = _zero_influence_pairs()
    estimator = ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=0.1)
    first = estimator.estimate(pairs, seed=5)
    second = estimator.estimate(pairs, seed=5)
    assert first.value == second.value
    assert first.ci_low == second.ci_low


def test_negative_predictor_error_raises() -> None:
    with pytest.raises(ValueError, match="predictor_error_std"):
        ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=-0.1)


def test_result_carries_units_and_identification() -> None:
    estimator = ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=0.1)
    result = estimator.estimate(_zero_influence_pairs(), seed=1)
    assert result.units == "metres"
    assert result.estimator_name == "noisy_oracle_residual"
    assert result.divergence_name == "ade"
    assert result.n_samples == 8
    assert result.identification.startswith("UNMET:")


def test_estimate_raises_on_empty_pairs() -> None:
    estimator = ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=0.1)
    with pytest.raises(ValueError, match="RolloutPair"):
        estimator.estimate((), seed=0)


def _rollout_pair_with_no_pedestrians() -> RolloutPair:
    """A RolloutPair whose two arms both carry zero pedestrians. `Scene.__post_init__` and
    `RolloutPair.__post_init__` place no minimum on pedestrian count, so this is a legitimate
    construction through the public contract, not a fixture that contorts around a guard."""
    robot_positions = np.zeros((3, 2), dtype=np.float64)
    robot_trajectory = Trajectory(agent_id="robot", positions=robot_positions, t0=0.0, dt=0.1)

    factual_scene = Scene(
        scene_id="empty",
        pedestrians=(),
        robot=robot_trajectory,
        robot_present=True,
        source="test",
        seed=0,
    )
    counterfactual_scene = Scene(
        scene_id="empty",
        pedestrians=(),
        robot=None,
        robot_present=False,
        source="test",
        seed=0,
    )
    return RolloutPair(factual=factual_scene, counterfactual=counterfactual_scene)


def test_estimate_raises_on_pair_with_no_paired_agents() -> None:
    estimator = ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=0.1)
    pairs = (_rollout_pair_with_no_pedestrians(),)
    with pytest.raises(ValueError, match="no paired agents"):
        estimator.estimate(pairs, seed=0)
