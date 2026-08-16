from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from mirn.data.peroi import PeroiAdapter


def _write_scene_csv(
    directory: Path, scene_id: str, agent_ids: tuple[str, ...], n_frames: int, seed: int
) -> None:
    rng = np.random.default_rng(seed)
    rows: list[dict[str, object]] = []
    for agent_id in agent_ids:
        origin = rng.uniform(0.0, 10.0, size=2)
        velocity = rng.uniform(-0.5, 0.5, size=2)
        for frame in range(n_frames):
            position = origin + velocity * frame
            row: dict[str, object] = {}
            row["agent_id"] = agent_id
            row["frame"] = frame
            row["x"] = float(position[0])
            row["y"] = float(position[1])
            rows.append(row)

    directory.mkdir(parents=True, exist_ok=True)
    frame_table = pd.DataFrame(rows)
    frame_table.to_csv(directory / f"{scene_id}.csv", index=False)


def _build_fixture(root: Path) -> None:
    """Write a synthetic on-disk PeRoI fixture matching the layout documented in
    `mirn.data.peroi`'s module docstring: `<root>/<condition>/<scene_id>.csv` with columns
    `agent_id, frame, x, y`, robot rows marked by `agent_id == "robot"`."""
    _write_scene_csv(root / "PD", "scene0", ("p0", "p1", "p2"), n_frames=10, seed=1)
    _write_scene_csv(root / "PD", "scene1", ("p0", "p1"), n_frames=8, seed=2)

    _write_scene_csv(root / "PD-SR", "scene0", ("p0", "p1", "robot"), n_frames=10, seed=3)

    _write_scene_csv(
        root / "PD-MR", "scene0", ("p0", "p1", "p2", "robot"), n_frames=12, seed=4
    )


def test_conditions_are_exactly_pd_pdsr_pdmr() -> None:
    adapter = PeroiAdapter(root=Path("/nonexistent-does-not-matter"))
    assert adapter.conditions() == ("PD", "PD-SR", "PD-MR")


def test_load_shapes(tmp_path: Path) -> None:
    _build_fixture(tmp_path)
    adapter = PeroiAdapter(root=tmp_path)

    pd_scenes = adapter.load("PD")
    assert len(pd_scenes) == 2
    for scene in pd_scenes:
        assert scene.robot_present is False
        assert scene.robot is None
    assert pd_scenes[0].n_pedestrians == 3
    assert pd_scenes[1].n_pedestrians == 2

    sr_scenes = adapter.load("PD-SR")
    assert len(sr_scenes) == 1
    assert sr_scenes[0].robot_present is True
    assert sr_scenes[0].robot is not None
    assert sr_scenes[0].n_pedestrians == 2

    mr_scenes = adapter.load("PD-MR")
    assert len(mr_scenes) == 1
    assert mr_scenes[0].robot_present is True
    assert mr_scenes[0].robot is not None
    assert mr_scenes[0].n_pedestrians == 3


def test_characterize_columns_and_row_count(tmp_path: Path) -> None:
    _build_fixture(tmp_path)
    adapter = PeroiAdapter(root=tmp_path)
    frame = adapter.characterize()

    expected_columns = (
        "condition",
        "n_scenes",
        "n_trajectories",
        "n_points",
        "mean_duration_s",
        "mean_speed_ms",
        "median_speed_ms",
        "frac_robot_present",
    )
    assert tuple(frame.columns) == expected_columns
    assert len(frame) == 3
    assert list(frame["condition"]) == ["PD", "PD-SR", "PD-MR"]

    pd_row = frame.loc[frame["condition"] == "PD"].iloc[0]
    assert pd_row["frac_robot_present"] == 0.0
    sr_row = frame.loc[frame["condition"] == "PD-SR"].iloc[0]
    assert sr_row["frac_robot_present"] == 1.0


def test_missing_root_raises_file_not_found_error(tmp_path: Path) -> None:
    adapter = PeroiAdapter(root=tmp_path / "does-not-exist")
    with pytest.raises(FileNotFoundError):
        adapter.load("PD")


def test_missing_condition_directory_raises_file_not_found_error(tmp_path: Path) -> None:
    _write_scene_csv(tmp_path / "PD", "scene0", ("p0",), n_frames=5, seed=1)
    adapter = PeroiAdapter(root=tmp_path)
    with pytest.raises(FileNotFoundError):
        adapter.load("PD-SR")


def test_to_rollout_pairs_raises_not_implemented(tmp_path: Path) -> None:
    _build_fixture(tmp_path)
    adapter = PeroiAdapter(root=tmp_path)
    with pytest.raises(NotImplementedError):
        adapter.to_rollout_pairs()
