"""Experiment 1 — the detection floor.

Splits a robot-free pedestrian population in half at random, repeatedly, and measures the
divergence between the halves. Both halves are drawn from the same population, so the resulting
distribution is pure measurement noise: it is the number a divergence reports when there is no
robot in the scene at all. Its 95th percentile is the minimum detectable perturbation, and every
estimate elsewhere in the project is only interpretable against it.

Wayfinder §11 measurement 1 notes that nobody has published this, and that everything downstream
is uninterpretable without it.
"""

from __future__ import annotations

from collections.abc import Mapping

import numpy as np
import pandas as pd

from mirn.calibration.null import minimum_detectable_perturbation, split_half_null
from mirn.data.synthetic import SyntheticAdapter
from mirn.experiments.base import (
    EXPERIMENTS,
    Experiment,
    ExperimentParameter,
    ExperimentResult,
)

DEFAULT_N_PEDESTRIANS = 12
DEFAULT_N_STEPS = 60
FLOOR_N_SPLITS = 200
CLOUD_DIVERGENCES: tuple[str, ...] = ("ade", "fde", "sinkhorn_w2")

CALIBRATION_COLUMNS: tuple[str, ...] = (
    "divergence",
    "n_scenes",
    "n_splits",
    "null_mean",
    "null_sd",
    "mdp_95",
    "seed",
)


def divergence_parameter() -> ExperimentParameter:
    """The cloud-capable divergence control, shared by every experiment that calibrates a floor.

    `frechet` is deliberately absent: it is order-dependent and its `between_clouds` raises, so
    offering it would turn a design decision into a runtime error.
    """
    return ExperimentParameter(
        name="divergence",
        label="Divergence",
        kind="choice",
        default="ade",
        choices=CLOUD_DIVERGENCES,
        help_text=(
            "Which distance function to measure with. Frechet is excluded because it is "
            "order-dependent and has no point-cloud form, so it cannot be calibrated."
        ),
    )


def n_scenes_parameter() -> ExperimentParameter:
    """The scene-count control, shared by every experiment."""
    return ExperimentParameter(
        name="n_scenes",
        label="Scenes",
        kind="int",
        default=8,
        minimum=2.0,
        maximum=32.0,
        step=1.0,
        help_text="How many independent synthetic crossings to generate.",
    )


def build_adapter(n_scenes: int, seed: int) -> SyntheticAdapter:
    """The one place synthetic data is constructed, so every experiment measures the same
    population shape and their numbers stay comparable."""
    return SyntheticAdapter(
        n_scenes=n_scenes,
        n_pedestrians=DEFAULT_N_PEDESTRIANS,
        n_steps=DEFAULT_N_STEPS,
        seed=seed,
    )


def floor_from_scenes(scenes: tuple, divergence: str, seed: int) -> float:
    """The detection floor for a robot-free scene collection.

    Used by experiments 2 and 3 so each computes its own floor from its own data rather than
    depending on experiment 1 having been run first — every CSV row stays self-contained.
    """
    null_samples = split_half_null(scenes, divergence, seed, n_splits=FLOOR_N_SPLITS)
    return minimum_detectable_perturbation(null_samples, alpha=0.05)


@EXPERIMENTS.register("calibration_floor")
class CalibrationFloor(Experiment):
    """The split-half null and the detection floor derived from it."""

    name = "calibration_floor"
    title = "The detection floor"
    claim = "A divergence reports a non-zero number even when no robot is present."

    def parameters(self) -> tuple[ExperimentParameter, ...]:
        n_splits = ExperimentParameter(
            name="n_splits",
            label="Split-half draws",
            kind="int",
            default=200,
            minimum=20.0,
            maximum=500.0,
            step=10.0,
            help_text="How many random balanced partitions of the pedestrian pool to measure.",
        )
        return (divergence_parameter(), n_scenes_parameter(), n_splits)

    def run(self, params: Mapping[str, object], seed: int) -> ExperimentResult:
        resolved = self.resolve(params)
        divergence = str(resolved["divergence"])
        n_scenes = int(resolved["n_scenes"])  # type: ignore[call-overload]
        n_splits = int(resolved["n_splits"])  # type: ignore[call-overload]

        adapter = build_adapter(n_scenes, seed)
        scenes = adapter.load("counterfactual")

        null_samples = split_half_null(scenes, divergence, seed, n_splits=n_splits)
        mdp_95 = minimum_detectable_perturbation(null_samples, alpha=0.05)

        row: dict[str, object] = {}
        row["divergence"] = divergence
        row["n_scenes"] = n_scenes
        row["n_splits"] = n_splits
        row["null_mean"] = float(np.mean(null_samples))
        row["null_sd"] = float(np.std(null_samples))
        row["mdp_95"] = mdp_95
        row["seed"] = seed
        frame = pd.DataFrame([row], columns=list(CALIBRATION_COLUMNS))

        sample_list: list[float] = []
        for sample_index in range(null_samples.shape[0]):
            sample_list.append(float(null_samples[sample_index]))

        payload: dict[str, object] = {}
        payload["null_samples"] = sample_list
        payload["mdp_95"] = mdp_95
        payload["null_mean"] = float(np.mean(null_samples))
        payload["null_sd"] = float(np.std(null_samples))
        payload["divergence"] = divergence
        payload["units"] = "metres"
        payload["note"] = (
            "Synthetic data. Both halves are drawn from the same robot-free population, so every "
            "metre shown here is measurement noise."
        )

        return ExperimentResult(
            experiment_name=self.name,
            seed=seed,
            frame=frame,
            payload=payload,
            method_keys=(divergence, "split_half_null", "minimum_detectable_perturbation"),
        )
