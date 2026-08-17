"""Contract tests over every registered experiment, plus the specific numeric claims each one
makes. The generic block loops over EXPERIMENTS.names(), so a new experiment inherits determinism,
JSON-safety and parameter-validation coverage the moment it registers."""

from __future__ import annotations

import json

import pandas as pd
import pytest

from mirn.calibration.null import minimum_detectable_perturbation, split_half_null
from mirn.experiments import EXPERIMENTS
from mirn.experiments.calibration_floor import FLOOR_N_SPLITS, build_adapter, cached_floor
from mirn.method.catalog import CARDS

_FAST_PARAMS: dict[str, dict[str, object]] = {
    "calibration_floor": {"n_scenes": 3, "n_splits": 20, "divergence": "ade"},
    "estimator_comparison": {"n_scenes": 3, "influence": 1.0, "divergence": "ade"},
    "confounding_sweep": {"n_scenes": 3, "n_points": 4, "divergence": "ade"},
    "placebo": {"n_scenes": 3, "influence": 1.0, "divergence": "ade"},
}


def _fast_params(name: str) -> dict[str, object]:
    return dict(_FAST_PARAMS[name])


def test_every_registered_experiment_has_fast_params_declared() -> None:
    """Guards this test file against silently skipping a newly registered experiment."""
    for name in EXPERIMENTS.names():
        assert name in _FAST_PARAMS, f"add fast params for the '{name}' experiment"


def test_every_experiment_is_deterministic_under_a_fixed_seed() -> None:
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        first = experiment.run(_fast_params(name), seed=17)
        second = experiment.run(_fast_params(name), seed=17)
        pd.testing.assert_frame_equal(first.frame, second.frame)
        assert first.payload == second.payload


def test_every_experiment_payload_is_json_safe() -> None:
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        result = experiment.run(_fast_params(name), seed=1)
        json.dumps(result.as_json())


def test_every_experiment_rejects_an_unknown_parameter() -> None:
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        with pytest.raises(ValueError, match="unknown parameter"):
            experiment.run({"nonsense": 1}, seed=0)


def test_every_experiment_declares_unique_parameter_names() -> None:
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        seen: list[str] = []
        for parameter in experiment.parameters():
            assert parameter.name not in seen
            seen.append(parameter.name)


def test_every_experiment_method_key_resolves_to_a_card() -> None:
    """An experiment must never point the UI at mathematics that does not exist."""
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        result = experiment.run(_fast_params(name), seed=0)
        for key in result.method_keys:
            assert key in CARDS, f"experiment '{name}' names missing method card '{key}'"


def test_every_experiment_has_a_nonempty_title_and_claim() -> None:
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        assert len(experiment.title.strip()) > 0
        assert len(experiment.claim.strip()) > 0


_CALIBRATION_COLUMNS = [
    "divergence",
    "n_scenes",
    "n_splits",
    "null_mean",
    "null_sd",
    "mdp_95",
    "seed",
]


def test_calibration_floor_columns_are_exact() -> None:
    experiment = EXPERIMENTS.create("calibration_floor")
    result = experiment.run(_fast_params("calibration_floor"), seed=0)
    assert list(result.frame.columns) == _CALIBRATION_COLUMNS
    assert len(result.frame) == 1


def test_calibration_floor_reports_a_positive_floor_with_no_robot_present() -> None:
    """The whole point: a robot-free population still produces a non-zero divergence."""
    experiment = EXPERIMENTS.create("calibration_floor")
    result = experiment.run(_fast_params("calibration_floor"), seed=0)
    mdp_95 = float(result.frame["mdp_95"].to_numpy()[0])
    assert mdp_95 > 0.0


def test_calibration_floor_mdp_exceeds_the_null_median() -> None:
    experiment = EXPERIMENTS.create("calibration_floor")
    result = experiment.run(_fast_params("calibration_floor"), seed=0)
    samples = result.payload["null_samples"]
    ordered = sorted(samples)
    median = ordered[len(ordered) // 2]
    assert float(result.frame["mdp_95"].to_numpy()[0]) >= median


def test_calibration_floor_payload_carries_every_null_draw() -> None:
    experiment = EXPERIMENTS.create("calibration_floor")
    result = experiment.run(_fast_params("calibration_floor"), seed=0)
    assert len(result.payload["null_samples"]) == 20
    for sample in result.payload["null_samples"]:
        assert sample >= 0.0


def test_calibration_floor_does_not_offer_the_order_dependent_divergence() -> None:
    """frechet.between_clouds raises NotImplementedError, so it must be unreachable here."""
    experiment = EXPERIMENTS.create("calibration_floor")
    for parameter in experiment.parameters():
        if parameter.name == "divergence":
            assert "frechet" not in parameter.choices


def test_cached_floor_matches_every_influence() -> None:
    """The load-bearing test: `cached_floor` is deliberately not keyed on `influence`, on the
    belief that the counterfactual arm is the pre-displacement trajectory and therefore identical
    at every influence level. Prove that directly, per influence, rather than assuming it. If this
    ever fails, the cache is unsound and must not be used — do not adjust the assertion."""
    divergence = "ade"
    n_scenes = 3
    seed = 0

    cached_floor.cache_clear()
    expected = cached_floor(divergence, n_scenes, seed)

    influences = (0.0, 0.5, 1.0, 2.0)
    for influence in influences:
        adapter = build_adapter(n_scenes, seed)
        pairs = adapter.rollout_pairs_with_influence(influence)
        counterfactual_scenes: list[object] = []
        for pair in pairs:
            counterfactual_scenes.append(pair.counterfactual)
        null_samples = split_half_null(
            tuple(counterfactual_scenes), divergence, seed, n_splits=FLOOR_N_SPLITS
        )
        direct_floor = minimum_detectable_perturbation(null_samples, alpha=0.05)
        assert direct_floor == expected, f"floor diverged at influence={influence}"


def test_cached_floor_is_deterministic_on_repeat_call() -> None:
    cached_floor.cache_clear()
    first = cached_floor("ade", 3, 0)
    second = cached_floor("ade", 3, 0)
    assert first == second


def test_cached_floor_keys_on_divergence_n_scenes_and_seed() -> None:
    """Distinct argument combinations must land in distinct cache slots, and in particular a
    changed seed must change the returned value — otherwise the key isn't actually being used and
    every call would silently collapse onto one entry."""
    cached_floor.cache_clear()
    cached_floor("ade", 3, 0)
    cached_floor("fde", 3, 0)
    cached_floor("ade", 4, 0)
    cached_floor("ade", 3, 1)
    info = cached_floor.cache_info()
    assert info.currsize == 4

    value_seed_0 = cached_floor("ade", 3, 0)
    value_seed_1 = cached_floor("ade", 3, 1)
    assert value_seed_0 != value_seed_1


def test_cached_floor_cache_clear_recomputes_the_same_value() -> None:
    """Also proves the function is genuinely deterministic, not accidentally stable because it
    never actually recomputed."""
    cached_floor.cache_clear()
    first = cached_floor("ade", 3, 0)
    cached_floor.cache_clear()
    second = cached_floor("ade", 3, 0)
    assert first == second


_COMPARISON_COLUMNS = [
    "estimator",
    "divergence",
    "value",
    "ci_low",
    "ci_high",
    "units",
    "n_samples",
    "influence",
    "seed",
]


def _comparison_frame(**overrides: object) -> pd.DataFrame:
    params = _fast_params("estimator_comparison")
    for key in overrides:
        params[key] = overrides[key]
    experiment = EXPERIMENTS.create("estimator_comparison")
    return experiment.run(params, seed=0).frame


def test_estimator_comparison_columns_are_exact() -> None:
    frame = _comparison_frame()
    assert list(frame.columns) == _COMPARISON_COLUMNS


def test_estimator_comparison_reports_all_three_estimators() -> None:
    frame = _comparison_frame()
    reported = sorted(frame["estimator"].tolist())
    assert reported == ["cvm_residual", "paired", "paired_debiased"]


def test_paired_reports_exactly_zero_at_zero_influence() -> None:
    """The arms are bitwise identical at influence 0, so the paired estimator has nothing to
    measure. Anything other than exactly 0.0 means the pairing invariant has broken."""
    frame = _comparison_frame(influence=0.0)
    paired_rows = frame[frame["estimator"] == "paired"]
    assert float(paired_rows["value"].to_numpy()[0]) == 0.0


def test_the_naive_estimator_reports_a_positive_number_at_zero_influence() -> None:
    """The critique in one assertion: with no robot effect whatsoever, the forecast-residual
    estimator still reports metres of 'perturbation'."""
    frame = _comparison_frame(influence=0.0)
    naive_rows = frame[frame["estimator"] == "cvm_residual"]
    assert float(naive_rows["value"].to_numpy()[0]) > 0.0


def test_paired_value_increases_with_influence() -> None:
    low = _comparison_frame(influence=0.5)
    high = _comparison_frame(influence=1.5)
    low_value = float(low[low["estimator"] == "paired"]["value"].to_numpy()[0])
    high_value = float(high[high["estimator"] == "paired"]["value"].to_numpy()[0])
    assert high_value > low_value


def test_debiased_estimator_reports_mdp_units() -> None:
    frame = _comparison_frame()
    debiased = frame[frame["estimator"] == "paired_debiased"]
    assert debiased["units"].to_numpy()[0] == "mdp"


def test_confidence_intervals_bracket_every_point_estimate() -> None:
    frame = _comparison_frame()
    for index in range(len(frame)):
        row = frame.iloc[index]
        assert row["ci_low"] <= row["value"] <= row["ci_high"]


def test_comparison_payload_carries_each_identification_string() -> None:
    experiment = EXPERIMENTS.create("estimator_comparison")
    result = experiment.run(_fast_params("estimator_comparison"), seed=0)
    identifications = result.payload["identifications"]
    assert identifications["cvm_residual"].startswith("UNMET:")
    assert not identifications["paired"].startswith("UNMET:")


_SWEEP_COLUMNS = [
    "axis",
    "axis_value",
    "reported_value",
    "reported_ci_low",
    "reported_ci_high",
    "true_value",
    "mdp_95",
    "exceeds_floor",
    "influence",
    "divergence",
    "seed",
]


def _sweep_result(**overrides: object):
    params = _fast_params("confounding_sweep")
    for key in overrides:
        params[key] = overrides[key]
    return EXPERIMENTS.create("confounding_sweep").run(params, seed=0)


def test_confounding_sweep_columns_are_exact() -> None:
    assert list(_sweep_result().frame.columns) == _SWEEP_COLUMNS


def test_confounding_sweep_frame_columns_satisfy_the_figure_contract() -> None:
    """viz.figures.confounding_sweep_figure reads these names; keep the two in lockstep."""
    from mirn.viz.figures import confounding_sweep_figure

    figure = confounding_sweep_figure(_sweep_result(n_points=6).frame)
    assert len(figure.axes) == 1
    # The frame is in metres; the figure must render MDP units (CLAUDE.md guardrail 3).
    assert "MDP" in figure.axes[0].get_ylabel()


def test_true_perturbation_is_exactly_zero_at_every_sweep_point() -> None:
    """The pin. If this ever fails, the sweep is measuring two moving quantities and proves
    nothing about confounding."""
    frame = _sweep_result(influence=0.0, n_points=6).frame
    for index in range(len(frame)):
        assert float(frame["true_value"].to_numpy()[index]) == 0.0


def test_reported_perturbation_rises_along_the_noise_axis_while_truth_stays_flat() -> None:
    frame = _sweep_result(axis="predictor_noise", influence=0.0, n_points=6).frame
    reported = frame["reported_value"].to_numpy()
    for index in range(1, len(reported)):
        assert reported[index] > reported[index - 1]
    assert float(frame["true_value"].to_numpy()[-1]) == 0.0


def test_reported_perturbation_rises_along_the_horizon_axis() -> None:
    frame = _sweep_result(axis="forecast_horizon", influence=0.0, n_points=6).frame
    reported = frame["reported_value"].to_numpy()
    assert reported[-1] > reported[0]


def test_horizon_axis_values_are_distinct_integers() -> None:
    frame = _sweep_result(axis="forecast_horizon", n_points=16).frame
    values = frame["axis_value"].tolist()
    assert len(set(values)) == len(values)
    for value in values:
        assert float(value) == int(value)


def test_the_reported_curve_crosses_the_detection_floor() -> None:
    """The single number the experiment exists to produce: the predictor error at which a
    world with exactly zero perturbation reads as a detected perturbation."""
    result = _sweep_result(axis="predictor_noise", influence=0.0, n_points=8)
    crossing = result.payload["floor_crossing_axis_value"]
    assert crossing is not None
    assert crossing > 0.0
    assert bool(result.frame["exceeds_floor"].to_numpy()[-1]) is True


def test_floor_crossing_is_none_when_the_curve_never_clears_the_floor() -> None:
    result = _sweep_result(axis="predictor_noise", influence=0.0, n_points=4, noise_max=0.001)
    assert result.payload["floor_crossing_axis_value"] is None


def test_mdp_is_identical_on_every_row() -> None:
    """One floor per sweep, repeated so a single CSV row is self-contained."""
    frame = _sweep_result(n_points=6).frame
    values = frame["mdp_95"].tolist()
    for value in values:
        assert value == values[0]


def test_axis_choices_are_exactly_the_two_documented_axes() -> None:
    experiment = EXPERIMENTS.create("confounding_sweep")
    for parameter in experiment.parameters():
        if parameter.name == "axis":
            assert parameter.choices == ("predictor_noise", "forecast_horizon")


_PLACEBO_COLUMNS = [
    "variant",
    "n_pedestrians",
    "value",
    "ci_low",
    "ci_high",
    "delta_vs_full",
    "influence",
    "seed",
]


def _placebo_result(**overrides: object):
    params = _fast_params("placebo")
    for key in overrides:
        params[key] = overrides[key]
    return EXPERIMENTS.create("placebo").run(params, seed=0)


def test_placebo_columns_are_exact() -> None:
    assert list(_placebo_result().frame.columns) == _PLACEBO_COLUMNS


def test_placebo_reports_a_full_and_a_reduced_variant() -> None:
    frame = _placebo_result().frame
    assert sorted(frame["variant"].tolist()) == ["full", "pedestrian_removed"]


def test_removing_a_non_interacting_pedestrian_barely_moves_the_estimate() -> None:
    """The placebo gate. A large delta here means the estimator is measuring the population
    rather than the robot."""
    frame = _placebo_result(influence=1.0).frame
    reduced = frame[frame["variant"] == "pedestrian_removed"]
    delta = abs(float(reduced["delta_vs_full"].to_numpy()[0]))
    mdp_relative = delta / max(float(frame["value"].to_numpy()[0]), 1e-12)
    assert mdp_relative < 0.25


def test_placebo_removes_exactly_one_pedestrian() -> None:
    frame = _placebo_result().frame
    full = int(frame[frame["variant"] == "full"]["n_pedestrians"].to_numpy()[0])
    reduced = int(
        frame[frame["variant"] == "pedestrian_removed"]["n_pedestrians"].to_numpy()[0]
    )
    assert reduced == full - 1


def test_placebo_payload_names_the_removed_agent() -> None:
    result = _placebo_result()
    removed = result.payload["removed_agent_id"]
    assert type(removed) is str
    assert len(removed) > 0


def test_placebo_delta_is_exactly_zero_at_zero_influence() -> None:
    """Both arms identical means both variants estimate exactly 0.0, so the delta is exactly 0.0
    — not merely small."""
    frame = _placebo_result(influence=0.0).frame
    reduced = frame[frame["variant"] == "pedestrian_removed"]
    assert float(reduced["delta_vs_full"].to_numpy()[0]) == 0.0
