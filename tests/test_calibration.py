from __future__ import annotations

import numpy as np
import pytest

from mirn.calibration.null import (
    calibration_report,
    minimum_detectable_perturbation,
    split_half_null,
)
from mirn.data.synthetic import SyntheticAdapter


def _counterfactual_scenes(n_scenes: int = 6, n_pedestrians: int = 10, n_steps: int = 20):
    adapter = SyntheticAdapter(n_scenes=n_scenes, n_pedestrians=n_pedestrians, n_steps=n_steps, seed=0)
    return adapter.load("counterfactual")


# --- split_half_null ---------------------------------------------------------------------------


def test_split_half_null_samples_are_finite_and_non_negative() -> None:
    scenes = _counterfactual_scenes()
    for divergence in ("ade", "fde", "sinkhorn_w2"):
        null_samples = split_half_null(scenes, divergence, seed=1, n_splits=25)
        assert np.all(np.isfinite(null_samples))
        assert np.all(null_samples >= 0.0)


def test_split_half_null_rejects_frechet_naming_cloud_capable_alternatives() -> None:
    """Ambiguity resolution: `frechet.between_clouds` raises NotImplementedError (Fréchet
    distance is order-dependent), so `split_half_null` must reject it up front with a ValueError
    that names the offending divergence and lists the cloud-capable alternatives, rather than
    letting a NotImplementedError propagate from deep inside the split loop."""
    scenes = _counterfactual_scenes()
    with pytest.raises(ValueError) as excinfo:
        split_half_null(scenes, "frechet", seed=1, n_splits=5)

    message = str(excinfo.value)
    assert "frechet" in message
    assert "ade" in message
    assert "fde" in message
    assert "sinkhorn_w2" in message


def test_split_half_null_is_deterministic_under_fixed_seed() -> None:
    scenes = _counterfactual_scenes()
    first = split_half_null(scenes, "ade", seed=42, n_splits=20)
    second = split_half_null(scenes, "ade", seed=42, n_splits=20)
    assert np.array_equal(first, second)


# --- minimum_detectable_perturbation ------------------------------------------------------------


def test_mdp_95_is_greater_than_the_null_median() -> None:
    scenes = _counterfactual_scenes(n_scenes=6, n_pedestrians=12)
    null_samples = split_half_null(scenes, "ade", seed=3, n_splits=200)
    mdp_95 = minimum_detectable_perturbation(null_samples, alpha=0.05)
    assert mdp_95 > float(np.median(null_samples))


# --- calibration_report -------------------------------------------------------------------------


def test_calibration_report_columns_and_single_row() -> None:
    scenes = _counterfactual_scenes()
    report = calibration_report(scenes, "ade", seed=5)

    assert list(report.columns) == [
        "divergence",
        "n_scenes",
        "n_splits",
        "null_mean",
        "null_sd",
        "mdp_95",
        "seed",
    ]
    assert len(report) == 1
    assert report.loc[0, "divergence"] == "ade"
    assert report.loc[0, "n_scenes"] == len(scenes)
    assert report.loc[0, "seed"] == 5


def test_calibration_report_is_deterministic_under_fixed_seed() -> None:
    scenes = _counterfactual_scenes()
    first = calibration_report(scenes, "ade", seed=7)
    second = calibration_report(scenes, "ade", seed=7)

    assert first.equals(second)


def test_calibration_report_rejects_frechet() -> None:
    scenes = _counterfactual_scenes()
    with pytest.raises(ValueError):
        calibration_report(scenes, "frechet", seed=1)
