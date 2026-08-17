"""Contract tests over every registered experiment, plus the specific numeric claims each one
makes. The generic block loops over EXPERIMENTS.names(), so a new experiment inherits determinism,
JSON-safety and parameter-validation coverage the moment it registers."""

from __future__ import annotations

import json

import pandas as pd
import pytest

from mirn.experiments import EXPERIMENTS
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
