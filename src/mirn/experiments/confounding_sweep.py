"""Experiment 3 — reported perturbation tracks predictor error, not the robot.

Wayfinder §11 measurement 5. The setup holds the *true* perturbation fixed at exactly zero — the
synthetic adapter's two arms are bitwise identical at `influence = 0.0` — and then sweeps the
quality of the forecaster used by a residual-style estimator. If the reported number climbs, then
reported perturbation is partly an artifact of model accuracy, and a policy trained to minimise it
is partly trained to be predictable.

Two axes are offered because they answer different objections. `predictor_noise` corrupts a
perfect oracle by a known sigma and produces the relationship in closed form. `forecast_horizon`
degrades a genuine constant-velocity forecaster the way forecasters actually degrade, and shows
the effect is not an artifact of the corruption model.
"""

from __future__ import annotations

from collections.abc import Mapping

import numpy as np
import pandas as pd

from mirn.estimator import ESTIMATORS
from mirn.experiments.base import (
    EXPERIMENTS,
    Experiment,
    ExperimentParameter,
    ExperimentResult,
)
from mirn.experiments.calibration_floor import (
    build_adapter,
    cached_floor,
    divergence_parameter,
    n_scenes_parameter,
)
from mirn.experiments.estimator_comparison import influence_parameter

SWEEP_COLUMNS: tuple[str, ...] = (
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
)

_AXES: tuple[str, ...] = ("predictor_noise", "forecast_horizon")
_HORIZON_MIN = 2
_HORIZON_MAX = 40

# The human-readable axis label lives here, next to the grid each axis produces, so the two
# cannot drift apart. The UI reads this string out of the payload rather than re-deriving it
# from the axis value — see CLAUDE.md's ban on value-branching in app.js.
_AXIS_LABELS: dict[str, str] = {
    "predictor_noise": "predictor error sigma (m)",
    "forecast_horizon": "forecast horizon (steps)",
}


def _axis_values(axis: str, n_points: int, noise_max: float) -> np.ndarray:
    """The grid to sweep over. Horizon values are rounded to distinct integers; see the plan note
    on why `n_points <= 16` guarantees distinctness over 2..40."""
    if axis == "predictor_noise":
        return np.linspace(0.0, noise_max, n_points)
    raw = np.linspace(float(_HORIZON_MIN), float(_HORIZON_MAX), n_points)
    return np.round(raw)


def _build_estimator(axis: str, axis_value: float, divergence: str) -> object:
    """Registry construction, so no `if name ==` dispatch chain exists over estimator names."""
    if axis == "predictor_noise":
        return ESTIMATORS.create(
            "noisy_oracle_residual",
            predictor_error_std=float(axis_value),
            divergence=divergence,
        )
    return ESTIMATORS.create(
        "cvm_residual", horizon_steps=int(axis_value), divergence=divergence
    )


def _floor_crossing(
    axis_values: np.ndarray, reported: np.ndarray, mdp_95: float
) -> float | None:
    """The linearly-interpolated axis value at which `reported` first exceeds `mdp_95`.

    Returns None when no swept point clears the floor, which the interface renders as "does not
    cross within the swept range" rather than extrapolating a number nobody measured.
    """
    if reported.shape[0] < 1:
        return None
    if reported[0] > mdp_95:
        return float(axis_values[0])
    for index in range(1, reported.shape[0]):
        previous_value = float(reported[index - 1])
        current_value = float(reported[index])
        if previous_value <= mdp_95 < current_value:
            span = current_value - previous_value
            fraction = (mdp_95 - previous_value) / span
            low_axis = float(axis_values[index - 1])
            high_axis = float(axis_values[index])
            return low_axis + fraction * (high_axis - low_axis)
    return None


@EXPERIMENTS.register("confounding_sweep")
class ConfoundingSweep(Experiment):
    """True perturbation pinned; predictor quality swept."""

    name = "confounding_sweep"
    title = "Reported perturbation tracks predictor error"
    claim = (
        "With true perturbation pinned at exactly zero, the reported number climbs with "
        "predictor error and crosses the detection floor."
    )
    order = 3
    primary_parameters = ("influence", "axis", "noise_max")

    def parameters(self) -> tuple[ExperimentParameter, ...]:
        axis = ExperimentParameter(
            name="axis",
            label="Predictor-quality axis",
            kind="choice",
            default="predictor_noise",
            choices=_AXES,
            help_text=(
                "predictor_noise corrupts a perfect oracle by a known sigma and gives the "
                "relationship in closed form. forecast_horizon degrades a real constant-velocity "
                "forecaster instead."
            ),
        )
        n_points = ExperimentParameter(
            name="n_points",
            label="Sweep points",
            kind="int",
            default=8,
            minimum=4.0,
            maximum=16.0,
            step=1.0,
            help_text="How many predictor-quality levels to evaluate.",
        )
        noise_max = ExperimentParameter(
            name="noise_max",
            label="Maximum predictor error (m)",
            kind="float",
            default=0.5,
            minimum=0.001,
            maximum=2.0,
            step=0.01,
            help_text="Upper end of the sigma grid; ignored on the forecast_horizon axis.",
        )
        return (
            influence_parameter(0.0),
            axis,
            n_points,
            noise_max,
            divergence_parameter(),
            n_scenes_parameter(),
        )

    def run(self, params: Mapping[str, object], seed: int) -> ExperimentResult:
        resolved = self.resolve(params)
        influence = float(resolved["influence"])  # type: ignore[arg-type]
        axis = str(resolved["axis"])
        n_points = int(resolved["n_points"])  # type: ignore[call-overload]
        noise_max = float(resolved["noise_max"])  # type: ignore[arg-type]
        divergence = str(resolved["divergence"])
        n_scenes = int(resolved["n_scenes"])  # type: ignore[call-overload]

        adapter = build_adapter(n_scenes, seed)
        pairs = adapter.rollout_pairs_with_influence(influence)

        mdp_95 = cached_floor(divergence, n_scenes, seed)

        paired_estimator = ESTIMATORS.create("paired", divergence=divergence)
        true_estimate = paired_estimator.estimate(pairs, seed)
        true_value = true_estimate.value

        axis_values = _axis_values(axis, n_points, noise_max)

        rows: list[dict[str, object]] = []
        reported_values = np.empty(axis_values.shape[0], dtype=np.float64)
        for index in range(axis_values.shape[0]):
            axis_value = float(axis_values[index])
            estimator = _build_estimator(axis, axis_value, divergence)
            estimate = estimator.estimate(pairs, seed)
            reported_values[index] = estimate.value

            row: dict[str, object] = {}
            row["axis"] = axis
            row["axis_value"] = axis_value
            row["reported_value"] = estimate.value
            row["reported_ci_low"] = estimate.ci_low
            row["reported_ci_high"] = estimate.ci_high
            row["true_value"] = true_value
            row["mdp_95"] = mdp_95
            row["exceeds_floor"] = bool(estimate.value > mdp_95)
            row["influence"] = influence
            row["divergence"] = divergence
            row["seed"] = seed
            rows.append(row)

        frame = pd.DataFrame(rows, columns=list(SWEEP_COLUMNS))
        crossing = _floor_crossing(axis_values, reported_values, mdp_95)

        payload: dict[str, object] = {}
        payload["axis"] = axis
        payload["axis_label"] = _AXIS_LABELS[axis]
        payload["mdp_95"] = mdp_95
        payload["true_value"] = true_value
        payload["floor_crossing_axis_value"] = crossing
        payload["influence"] = influence
        payload["divergence"] = divergence
        payload["note"] = (
            "Synthetic data. True perturbation is measured by the paired estimator on the same "
            "pairs and is exactly zero when influence is 0.0, so every metre the reported curve "
            "climbs is predictor error wearing a causal label. On the forecast_horizon axis, the "
            "'genuine' constant-velocity forecaster is only fighting i.i.d. per-step Gaussian "
            "jitter — a best case for that model class — so its floor-crossing point is a "
            "property of this toy noise model and does not transfer to real pedestrian curvature "
            "or acceleration."
        )

        return ExperimentResult(
            experiment_name=self.name,
            seed=seed,
            frame=frame,
            payload=payload,
            method_keys=(
                "noisy_oracle_residual",
                "cvm_residual",
                "paired",
                "minimum_detectable_perturbation",
            ),
        )
