"""Figures are the paper path. They must build headlessly and take every colour from the theme."""

from __future__ import annotations

import matplotlib
import numpy as np
import pandas as pd
import pytest

matplotlib.use("Agg")

from mirn.viz import figures, theme


def _sweep_frame() -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    axis_values = [0.0, 0.1, 0.2, 0.3]
    reported = [0.0, 0.125, 0.251, 0.376]
    for index in range(len(axis_values)):
        row: dict[str, object] = {}
        row["axis"] = "predictor_noise"
        row["axis_value"] = axis_values[index]
        row["reported_value"] = reported[index]
        row["reported_ci_low"] = reported[index] * 0.95
        row["reported_ci_high"] = reported[index] * 1.05
        row["true_value"] = 0.0
        row["mdp_95"] = 0.2
        rows.append(row)
    return pd.DataFrame(rows)


def test_null_distribution_figure_builds_with_theme_background() -> None:
    rng = np.random.default_rng(0)
    null_samples = rng.gamma(2.0, 0.05, size=200)
    figure = figures.null_distribution_figure(null_samples, 0.2, "ade")
    assert figure.get_facecolor() == matplotlib.colors.to_rgba(theme.DARK_PALETTE.background)
    assert len(figure.axes) == 1


def test_null_distribution_figure_marks_the_floor() -> None:
    rng = np.random.default_rng(1)
    null_samples = rng.gamma(2.0, 0.05, size=200)
    figure = figures.null_distribution_figure(null_samples, 0.2, "ade")
    axis = figure.axes[0]
    assert len(axis.lines) >= 1
    assert "ade" in axis.get_xlabel().lower() or "ade" in axis.get_title().lower()


def test_null_distribution_figure_rejects_multidimensional_array() -> None:
    rng = np.random.default_rng(2)
    null_samples = rng.gamma(2.0, 0.05, size=(10, 10))
    with pytest.raises(ValueError) as excinfo:
        figures.null_distribution_figure(null_samples, 0.2, "ade")
    assert "1-D" in str(excinfo.value)


def test_null_distribution_figure_rejects_empty_array() -> None:
    null_samples = np.array([], dtype=np.float64)
    with pytest.raises(ValueError) as excinfo:
        figures.null_distribution_figure(null_samples, 0.2, "ade")
    assert "non-empty" in str(excinfo.value)


def test_confounding_sweep_figure_plots_reported_and_true() -> None:
    figure = figures.confounding_sweep_figure(_sweep_frame())
    axis = figure.axes[0]
    assert len(axis.lines) >= 2
    assert figure.get_facecolor() == matplotlib.colors.to_rgba(theme.DARK_PALETTE.background)


def test_confounding_sweep_figure_rejects_a_frame_missing_columns() -> None:
    frame = _sweep_frame().drop(columns=["true_value"])
    with pytest.raises(ValueError) as excinfo:
        figures.confounding_sweep_figure(frame)
    assert "true_value" in str(excinfo.value)


def test_confounding_sweep_figure_rejects_single_row_frame() -> None:
    frame = _sweep_frame().iloc[:1]
    with pytest.raises(ValueError) as excinfo:
        figures.confounding_sweep_figure(frame)
    assert "at least 2 rows" in str(excinfo.value)


def test_confounding_sweep_figure_rejects_zero_floor() -> None:
    frame = _sweep_frame().copy()
    frame["mdp_95"] = 0.0
    with pytest.raises(ValueError) as excinfo:
        figures.confounding_sweep_figure(frame)
    assert "mdp_95" in str(excinfo.value)


def test_confounding_sweep_figure_y_axis_label_contains_mdp() -> None:
    figure = figures.confounding_sweep_figure(_sweep_frame())
    axis = figure.axes[0]
    y_label = axis.get_ylabel()
    assert "MDP" in y_label


def test_confounding_sweep_figure_rejects_an_unrecognised_axis() -> None:
    frame = _sweep_frame().copy()
    frame["axis"] = "unknown_axis"
    with pytest.raises(ValueError) as excinfo:
        figures.confounding_sweep_figure(frame)
    assert "unknown_axis" in str(excinfo.value)


def test_confounding_sweep_figure_normalizes_to_mdp_units() -> None:
    rows: list[dict[str, object]] = []
    reported_values = [0.0, 0.4, 0.2]
    for index in range(len(reported_values)):
        row: dict[str, object] = {}
        row["axis"] = "predictor_noise"
        row["axis_value"] = float(index)
        row["reported_value"] = reported_values[index]
        row["reported_ci_low"] = reported_values[index] * 0.95
        row["reported_ci_high"] = reported_values[index] * 1.05
        row["true_value"] = 0.0
        row["mdp_95"] = 0.2
        rows.append(row)
    frame = pd.DataFrame(rows)

    figure = figures.confounding_sweep_figure(frame)
    axis = figure.axes[0]
    reported_line = axis.lines[1]
    reported_y_data = reported_line.get_ydata()
    assert len(reported_y_data) == 3
    assert reported_y_data[2] == 1.0
