"""Experiment 2 — the same data, three estimators.

Runs the forecast-residual estimator this project critiques, the paired-counterfactual estimator
it proposes, and the floor-calibrated version of the latter, over one identical collection of
`RolloutPair`s. The interesting comparison is at `influence = 0.0`, where the two arms are bitwise
identical: the paired estimator reports exactly zero and the residual estimator does not.

The detection floor the debiased estimator needs is computed here, from the counterfactual arm of
these same pairs, rather than being read from experiment 1's output. That keeps each experiment
independently runnable and each CSV row reproducible on its own.
"""

from __future__ import annotations

from collections.abc import Mapping

import pandas as pd

from mirn.contracts import PerturbationEstimate
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

COMPARISON_COLUMNS: tuple[str, ...] = (
    "estimator",
    "divergence",
    "value",
    "ci_low",
    "ci_high",
    "units",
    "n_samples",
    "influence",
    "seed",
)


def influence_parameter(default: float) -> ExperimentParameter:
    """The robot-influence control. `0.0` makes the two arms bitwise identical, which is the
    setting the placebo and confounding arguments both depend on."""
    return ExperimentParameter(
        name="influence",
        label="Robot influence",
        kind="float",
        default=default,
        minimum=0.0,
        maximum=2.0,
        step=0.05,
        help_text=(
            "How strongly the robot displaces nearby pedestrians. At 0.0 the robot-present and "
            "robot-absent arms are bitwise identical, so the true perturbation is exactly zero."
        ),
    )


def _estimate_row(
    estimator_name: str, estimate: PerturbationEstimate, influence: float, seed: int
) -> dict[str, object]:
    row: dict[str, object] = {}
    row["estimator"] = estimator_name
    row["divergence"] = estimate.divergence_name
    row["value"] = estimate.value
    row["ci_low"] = estimate.ci_low
    row["ci_high"] = estimate.ci_high
    row["units"] = estimate.units
    row["n_samples"] = estimate.n_samples
    row["influence"] = influence
    row["seed"] = seed
    return row


@EXPERIMENTS.register("estimator_comparison")
class EstimatorComparison(Experiment):
    """Three estimators, one dataset, side by side."""

    name = "estimator_comparison"
    title = "What the different methods report"
    claim = (
        "On identical data the naive and paired estimators disagree, and only one consults the "
        "robot-absent arm."
    )
    order = 2
    primary_parameters = ("influence", "horizon_steps")

    def parameters(self) -> tuple[ExperimentParameter, ...]:
        horizon_steps = ExperimentParameter(
            name="horizon_steps",
            label="Forecast horizon (steps)",
            kind="int",
            default=16,
            minimum=2.0,
            maximum=40.0,
            step=1.0,
            help_text=(
                "How far the constant-velocity forecast is rolled forward before its residual is "
                "measured. Longer horizons mean a worse forecast."
            ),
        )
        return (
            influence_parameter(1.0),
            divergence_parameter(),
            horizon_steps,
            n_scenes_parameter(),
        )

    def run(self, params: Mapping[str, object], seed: int) -> ExperimentResult:
        resolved = self.resolve(params)
        influence = float(resolved["influence"])  # type: ignore[arg-type]
        divergence = str(resolved["divergence"])
        horizon_steps = int(resolved["horizon_steps"])  # type: ignore[call-overload]
        n_scenes = int(resolved["n_scenes"])  # type: ignore[call-overload]

        adapter = build_adapter(n_scenes, seed)
        pairs = adapter.rollout_pairs_with_influence(influence)

        floor = cached_floor(divergence, n_scenes, seed)

        estimators: list[tuple[str, object]] = []
        estimators.append(
            (
                "cvm_residual",
                ESTIMATORS.create(
                    "cvm_residual", horizon_steps=horizon_steps, divergence=divergence
                ),
            )
        )
        estimators.append(("paired", ESTIMATORS.create("paired", divergence=divergence)))
        estimators.append(
            (
                "paired_debiased",
                ESTIMATORS.create("paired_debiased", divergence=divergence, floor=floor),
            )
        )

        rows: list[dict[str, object]] = []
        identifications: dict[str, str] = {}
        for estimator_name, estimator in estimators:
            estimate = estimator.estimate(pairs, seed)
            rows.append(_estimate_row(estimator_name, estimate, influence, seed))
            identifications[estimator_name] = estimate.identification

        frame = pd.DataFrame(rows, columns=list(COMPARISON_COLUMNS))

        payload: dict[str, object] = {}
        payload["identifications"] = identifications
        payload["mdp_95"] = floor
        payload["influence"] = influence
        payload["divergence"] = divergence
        payload["horizon_steps"] = horizon_steps
        payload["note"] = (
            "Synthetic data. The two arms share a seed and an exogenous noise realisation, so at "
            "influence 0.0 they are bitwise identical and the true perturbation is exactly zero."
        )

        return ExperimentResult(
            experiment_name=self.name,
            seed=seed,
            frame=frame,
            payload=payload,
            method_keys=("cvm_residual", "paired", "paired_debiased", "bootstrap_ci"),
        )
