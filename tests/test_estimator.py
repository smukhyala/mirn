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


# --- ConstantVelocityResidual.end_step ---------------------------------------------------------


def _parked_pair(n_steps: int = 24, parked_from: int = 14):
    """One paired run whose crowd arrives and stops, built from the parity fixture's generator.

    Reused rather than re-derived so that the behaviour these tests pin is exactly the behaviour
    frozen into `tests/golden/parity/estimator.cvm_residual.per_run.json`.
    """
    from mirn.fixtures import _crowd_arms, _rollout_pair

    control_paths, treated_paths, robot_path = _crowd_arms(
        seed=3003, n_agents=4, n_steps=n_steps, amplitude=1.2, parked_from=parked_from
    )
    return _rollout_pair("parked", control_paths, treated_paths, robot_path)


def test_cvm_residual_reads_exactly_zero_once_the_crowd_has_parked() -> None:
    """The estimator's flattering blind spot, pinned so it cannot be quoted as a good score.

    A constant-velocity forecast of a stationary person is exactly right, so measured at the end
    of an episode where everyone has arrived and stopped, this estimator reports 0.0 — a perfect
    score from a method the project argues is broken. `end_step` exists to move the window off
    that dead zone, and a reader who does not know the dead zone exists will believe the 0.0.
    """
    pair = _parked_pair()
    at_the_end = ConstantVelocityResidual(horizon_steps=6, divergence="ade")
    assert at_the_end.estimate([pair], seed=0).value == 0.0


def test_cvm_residual_end_step_moves_the_window_back_onto_moving_people() -> None:
    """`end_step` must actually select the window, not merely be accepted and ignored."""
    pair = _parked_pair()
    while_walking = ConstantVelocityResidual(horizon_steps=6, divergence="ade", end_step=13)
    assert while_walking.estimate([pair], seed=0).value > 0.0


def test_cvm_residual_end_step_none_is_the_last_timestep() -> None:
    """The default has to be the old behaviour, or every existing result silently shifts."""
    pair = _parked_pair()
    default = ConstantVelocityResidual(horizon_steps=6, divergence="ade")
    explicit = ConstantVelocityResidual(horizon_steps=6, divergence="ade", end_step=23)
    assert default.estimate([pair], seed=0).value == explicit.estimate([pair], seed=0).value


def test_cvm_residual_rejects_an_end_step_past_the_trajectory() -> None:
    """An out-of-range window must be refused where the parameter is, not deep inside a divergence.

    numpy slicing past the end truncates rather than raising, so `positions[a+1 : a+1+h]` returns
    fewer rows than the forecast and the error finally surfaces from `between_paths` as
    "requires equal-length paths, got 5 != 6" — which names neither `end_step` nor the agent.
    """
    pair = _parked_pair()
    with pytest.raises(ValueError, match="end_step must lie in"):
        ConstantVelocityResidual(horizon_steps=6, end_step=99).estimate([pair], seed=0)
    with pytest.raises(ValueError, match="end_step must be >= 0"):
        ConstantVelocityResidual(horizon_steps=6, end_step=-1)


def test_cvm_residual_rejects_a_window_too_short_to_fit_a_velocity() -> None:
    """A window ending at or before horizon_steps + 1 leaves no two points to fit a velocity."""
    pair = _parked_pair()
    with pytest.raises(ValueError, match="horizon_steps \\+ 2"):
        ConstantVelocityResidual(horizon_steps=6, end_step=6).estimate([pair], seed=0)
