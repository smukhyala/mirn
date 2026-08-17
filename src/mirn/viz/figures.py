"""The two figures that go in the paper.

Interactive plots in the browser are drawn in JavaScript from the same `ExperimentResult` payload
these functions consume, so a figure and its CSV cannot disagree. Neither function sets a colour
literal: every colour comes from `mirn.viz.theme`.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from matplotlib.figure import Figure

from mirn.viz.theme import PALETTE, apply_matplotlib

_SWEEP_COLUMNS: tuple[str, ...] = (
    "axis",
    "axis_value",
    "reported_value",
    "reported_ci_low",
    "reported_ci_high",
    "true_value",
    "mdp_95",
)


def _require_columns(frame: pd.DataFrame, required: tuple[str, ...]) -> None:
    missing: list[str] = []
    for column in required:
        if column not in frame.columns:
            missing.append(column)
    if len(missing) > 0:
        raise ValueError(
            f"frame is missing required columns: {', '.join(missing)}; "
            f"expected exactly {', '.join(required)}"
        )


def null_distribution_figure(
    null_samples: np.ndarray, mdp_95: float, divergence_name: str
) -> Figure:
    """The split-half null distribution with the 95% detection floor marked.

    This is the plot the wayfinder (§15b) calls "the thing other people will cite": it shows the
    number a divergence reports when no robot is present at all.
    """
    if null_samples.ndim != 1:
        raise ValueError(f"null_samples must be 1-D, got ndim={null_samples.ndim}")
    if null_samples.shape[0] < 1:
        raise ValueError("null_samples must be non-empty")

    apply_matplotlib()
    figure = Figure(figsize=(5.2, 3.0))
    axis = figure.add_subplot(1, 1, 1)

    axis.hist(null_samples, bins=32, color=PALETTE.counterfactual, alpha=0.85, edgecolor="none")
    axis.axvline(mdp_95, color=PALETTE.floor, linewidth=1.4, linestyle="--")
    axis.annotate(
        f"MDP$_{{95}}$ = {mdp_95:.3f} m",
        xy=(mdp_95, 0.0),
        xytext=(6.0, 8.0),
        textcoords="offset points",
        color=PALETTE.ink,
        fontsize=8,
    )
    axis.set_xlabel(f"split-half {divergence_name} between robot-free halves (m)")
    axis.set_ylabel("draws")
    axis.set_title("The detection floor: perturbation reported with no robot present")
    figure.tight_layout()
    return figure


def confounding_sweep_figure(sweep_frame: pd.DataFrame) -> Figure:
    """Reported vs. true perturbation against predictor error, with the detection floor marked.

    The argument in one image: true perturbation is pinned at zero across the whole sweep while
    the reported number climbs through the detection floor. All perturbation values are normalized
    to MDP units (divided by the measured detection floor).
    """
    _require_columns(sweep_frame, _SWEEP_COLUMNS)
    if len(sweep_frame) < 2:
        raise ValueError(f"sweep_frame needs at least 2 rows to draw a curve, got {len(sweep_frame)}")

    apply_matplotlib()
    figure = Figure(figsize=(5.2, 3.2))
    axis = figure.add_subplot(1, 1, 1)

    axis_values = sweep_frame["axis_value"].to_numpy()
    reported = sweep_frame["reported_value"].to_numpy()
    reported_low = sweep_frame["reported_ci_low"].to_numpy()
    reported_high = sweep_frame["reported_ci_high"].to_numpy()
    true_values = sweep_frame["true_value"].to_numpy()
    mdp_95 = float(sweep_frame["mdp_95"].to_numpy()[0])
    axis_name = str(sweep_frame["axis"].to_numpy()[0])

    if mdp_95 <= 0.0:
        raise ValueError(
            f"sweep cannot be expressed in MDP units without a positive detection floor; "
            f"received mdp_95={mdp_95}"
        )

    reported_mdp = reported / mdp_95
    reported_low_mdp = reported_low / mdp_95
    reported_high_mdp = reported_high / mdp_95
    true_values_mdp = true_values / mdp_95

    axis.axhspan(0.0, 1.0, color=PALETTE.floor, alpha=0.22, linewidth=0.0)
    axis.axhline(1.0, color=PALETTE.floor, linewidth=1.2, linestyle="--")
    axis.annotate(
        "detection floor",
        xy=(0.0, 1.0),
        xytext=(6.0, 8.0),
        textcoords="offset points",
        color=PALETTE.ink,
        fontsize=8,
    )
    axis.fill_between(axis_values, reported_low_mdp, reported_high_mdp, color=PALETTE.naive, alpha=0.18)
    axis.plot(axis_values, reported_mdp, color=PALETTE.naive, linewidth=1.8, label="reported")
    axis.plot(
        axis_values,
        true_values_mdp,
        color=PALETTE.paired,
        linewidth=1.8,
        linestyle="--",
        label="true (paired)",
    )

    if axis_name == "predictor_noise":
        axis.set_xlabel("predictor error $\\sigma$ (m)")
    else:
        axis.set_xlabel("forecast horizon (steps)")
    axis.set_ylabel("perturbation (MDP$_{95}$ units)")
    axis.set_title("Reported perturbation crosses the detection floor with no robot effect")
    axis.legend(loc="upper left")
    figure.tight_layout()
    return figure
