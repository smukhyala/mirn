"""The CLI is the non-interactive path to the same results the page shows. It must write a real
CSV and it must fail helpfully."""

from __future__ import annotations

import pandas as pd
import pytest

from mirn import cli


def test_list_prints_every_registered_experiment(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = cli.main(["list"])
    captured = capsys.readouterr()
    assert exit_code == 0
    for name in ("calibration_floor", "estimator_comparison", "confounding_sweep", "placebo"):
        assert name in captured.out


def test_list_prints_parameter_names(capsys: pytest.CaptureFixture[str]) -> None:
    cli.main(["list"])
    captured = capsys.readouterr()
    assert "divergence" in captured.out
    assert "n_scenes" in captured.out


def test_run_writes_a_csv_to_the_requested_path(tmp_path) -> None:
    out_path = tmp_path / "floor.csv"
    exit_code = cli.main(
        [
            "run",
            "calibration_floor",
            "--param",
            "n_scenes=3",
            "--param",
            "n_splits=20",
            "--seed",
            "0",
            "--out",
            str(out_path),
        ]
    )
    assert exit_code == 0
    assert out_path.exists()
    frame = pd.read_csv(out_path)
    assert list(frame.columns) == [
        "divergence",
        "n_scenes",
        "n_splits",
        "null_mean",
        "null_sd",
        "mdp_95",
        "seed",
    ]
    assert len(frame) == 1


def test_run_writes_a_figure_when_asked(tmp_path) -> None:
    out_path = tmp_path / "floor.csv"
    figure_path = tmp_path / "floor.png"
    cli.main(
        [
            "run",
            "calibration_floor",
            "--param",
            "n_scenes=3",
            "--param",
            "n_splits=20",
            "--out",
            str(out_path),
            "--figure",
            str(figure_path),
        ]
    )
    assert figure_path.exists()
    assert figure_path.stat().st_size > 0


def test_run_rejects_an_unknown_experiment(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = cli.main(["run", "no_such_experiment"])
    captured = capsys.readouterr()
    assert exit_code == 1
    assert "calibration_floor" in captured.err


def test_run_rejects_an_unknown_parameter(capsys: pytest.CaptureFixture[str], tmp_path) -> None:
    exit_code = cli.main(
        ["run", "calibration_floor", "--param", "nonsense=1", "--out", str(tmp_path / "x.csv")]
    )
    captured = capsys.readouterr()
    assert exit_code == 1
    assert "unknown parameter" in captured.err


def test_run_rejects_a_malformed_param(capsys: pytest.CaptureFixture[str], tmp_path) -> None:
    exit_code = cli.main(
        ["run", "calibration_floor", "--param", "missing_equals", "--out", str(tmp_path / "x.csv")]
    )
    captured = capsys.readouterr()
    assert exit_code == 1
    assert "key=value" in captured.err
