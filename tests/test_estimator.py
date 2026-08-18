from __future__ import annotations

import pytest

from mirn.data.synthetic import SyntheticAdapter
from mirn.estimator import ESTIMATORS
from mirn.estimator.paired import DebiasedPairedCounterfactual, PairedCounterfactual
from mirn.estimator.residual import ConstantVelocityResidual


def _adapter(n_scenes: int = 4, n_pedestrians: int = 6, n_steps: int = 30, seed: int = 0):
    return SyntheticAdapter(
        n_scenes=n_scenes, n_pedestrians=n_pedestrians, n_steps=n_steps, seed=seed
    )


# --- PairedCounterfactual ---------------------------------------------------------------------


def test_paired_zero_influence_is_exactly_zero() -> None:
    pairs = _adapter().rollout_pairs_with_influence(0.0)
    estimator = PairedCounterfactual(divergence="ade")
    result = estimator.estimate(pairs, seed=1)

    assert result.value == 0.0
    assert result.ci_low == 0.0
    assert result.ci_high == 0.0
    assert result.units == "metres"


def test_paired_value_increases_strictly_with_influence() -> None:
    adapter = _adapter()
    estimator = PairedCounterfactual(divergence="ade")
    influences = (0.0, 0.5, 1.0, 2.0)

    values: list[float] = []
    for influence in influences:
        pairs = adapter.rollout_pairs_with_influence(influence)
        result = estimator.estimate(pairs, seed=1)
        values.append(result.value)

    for index in range(1, len(values)):
        assert values[index] > values[index - 1]


def test_bootstrap_ci_brackets_point_estimate_for_every_estimator() -> None:
    pairs = _adapter(n_scenes=6, n_pedestrians=8, seed=2).rollout_pairs_with_influence(1.0)
    estimators = (
        PairedCounterfactual(divergence="ade"),
        ConstantVelocityResidual(horizon_steps=8, divergence="ade"),
        DebiasedPairedCounterfactual(divergence="ade", floor=1e-4),
    )
    for estimator in estimators:
        result = estimator.estimate(pairs, seed=3)
        assert result.ci_low <= result.value <= result.ci_high


def test_n_samples_equals_number_of_pairs() -> None:
    pairs = _adapter(n_scenes=5, n_pedestrians=4).rollout_pairs_with_influence(1.0)
    estimators = (
        PairedCounterfactual(divergence="ade"),
        ConstantVelocityResidual(horizon_steps=8, divergence="ade"),
        DebiasedPairedCounterfactual(divergence="ade", floor=1e-4),
    )
    for estimator in estimators:
        result = estimator.estimate(pairs, seed=1)
        assert result.n_samples == len(pairs)


def test_identification_nonempty_for_every_registered_estimator() -> None:
    for name in ESTIMATORS.names():
        estimator_cls = ESTIMATORS.get(name)
        estimator = estimator_cls()
        identification = estimator.identification()
        assert len(identification.strip()) > 0


def test_cvm_residual_identification_states_assumption_unmet() -> None:
    estimator = ConstantVelocityResidual()
    identification = estimator.identification()
    assert identification.strip().startswith("UNMET")


# --- DebiasedPairedCounterfactual -------------------------------------------------------------


def test_debiased_raises_on_zero_floor() -> None:
    pairs = _adapter(n_scenes=3).rollout_pairs_with_influence(1.0)
    estimator = DebiasedPairedCounterfactual(divergence="ade", floor=0.0)
    with pytest.raises(ValueError):
        estimator.estimate(pairs, seed=1)


def test_debiased_clips_value_and_ci_low_when_floor_dominates() -> None:
    """A floor much larger than the true effect must not produce a negative estimate: `value`
    and `ci_low` are clipped at zero rather than building an invalid PerturbationEstimate."""
    pairs = _adapter(n_scenes=4, n_pedestrians=6).rollout_pairs_with_influence(1.0)
    undebiased = PairedCounterfactual(divergence="ade").estimate(pairs, seed=1)

    huge_floor = undebiased.value * 100.0 + 1.0
    estimator = DebiasedPairedCounterfactual(divergence="ade", floor=huge_floor)
    result = estimator.estimate(pairs, seed=1)

    assert result.value == 0.0
    assert result.ci_low == 0.0
    assert result.ci_low <= result.value <= result.ci_high
    assert result.units == "mdp"


def test_debiased_reports_mdp_units_by_dividing_through_the_floor() -> None:
    pairs = _adapter(n_scenes=4, n_pedestrians=6).rollout_pairs_with_influence(1.0)
    undebiased = PairedCounterfactual(divergence="ade").estimate(pairs, seed=1)

    small_floor = undebiased.value * 0.1
    estimator = DebiasedPairedCounterfactual(divergence="ade", floor=small_floor)
    result = estimator.estimate(pairs, seed=1)

    assert result.units == "mdp"
    assert result.value > 0.0
    # value/ci_low/ci_high were all divided by the same floor: the mdp point estimate is the
    # (clipped) raw-metre debiased estimate divided by that floor, exactly.
    expected_value = max((undebiased.value - small_floor), 0.0) / small_floor
    assert result.value == pytest.approx(expected_value)


def test_diagnostic_estimators_declare_their_assumption_unmet() -> None:
    """Both single-arm estimators must announce, in their first six characters, that they do not
    identify the estimand. This is the guard against one of them being quoted as a result."""
    for name in ("cvm_residual", "noisy_oracle_residual"):
        estimator = ESTIMATORS.create(name)
        assert estimator.identification().startswith("UNMET:")
