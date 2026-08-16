"""Adapter for the PeRoI dataset (Pedestrian Robot Interaction).

PeRoI is released on Zenodo (DOI 10.5281/zenodo.18876411, CC-BY-4.0, University of Bonn:
Agrawal, Ostermann-Myrau, Dengler, Bennewitz; published 2026-06-01). It ships three recording
conditions — `PD` (pedestrians only), `PD-SR` (stationary robot), `PD-MR` (moving robot) —
captured at 15 Hz via YOLOv11 detection and homography projection to ground-plane metres.

UNVERIFIED — confirm against the Zenodo release (10.5281/zenodo.18876411):

The exact on-disk file layout has not been inspected; the release has not been downloaded.
Everything below is an assumption, isolated behind the constant block immediately following
this docstring and the single function `_read_condition_frame`, so that reconciling this module
with the real schema is a change in one place.

Assumed directory structure under `root` (defaulting to `paths.data_root() / "peroi"`, i.e.
`$MIRN_DATA_ROOT/peroi`, per `.env.example`):

    <root>/
      PD/
        <scene_id>.csv
        ...
      PD-SR/
        <scene_id>.csv
        ...
      PD-MR/
        <scene_id>.csv
        ...

Each per-scene CSV is assumed to be a long-format track table with at least the columns
`agent_id, frame, x, y`: one row per detection, `frame` a monotonically increasing per-agent
integer index with no gaps (used only to order rows — this module does not attempt to
gap-fill missing detections), and `x`/`y` already homography-projected ground-plane metres.
Within `PD-SR` and `PD-MR` scene files, the robot is assumed to appear as an ordinary track row
sharing the same schema, distinguished only by the reserved `agent_id` value `"robot"`; `PD`
scene files are assumed to contain no such row, since that condition has no robot in the scene.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from mirn import paths
from mirn.contracts import RolloutPair, Scene, Trajectory
from mirn.data.base import CHARACTERIZE_COLUMNS, DATASETS, DatasetAdapter, summarize_condition

# --- UNVERIFIED on-disk schema assumptions -----------------------------------------------------
# Every constant in this block, plus `_read_condition_frame` below, is the single place that
# encodes an assumption about PeRoI's real file layout. See the module docstring.

_CONDITIONS: tuple[str, ...] = ("PD", "PD-SR", "PD-MR")
_CONDITION_DIR_NAMES: dict[str, str] = {"PD": "PD", "PD-SR": "PD-SR", "PD-MR": "PD-MR"}
_SCENE_FILE_SUFFIX = ".csv"
_REQUIRED_SCENE_COLUMNS: tuple[str, ...] = ("agent_id", "frame", "x", "y")
_LONG_FRAME_COLUMNS: tuple[str, ...] = ("agent_id", "frame", "x", "y", "scene_id")
_ROBOT_AGENT_ID = "robot"
_SAMPLING_RATE_HZ = 15.0
_DT = 1.0 / _SAMPLING_RATE_HZ
# --- end UNVERIFIED block ------------------------------------------------------------------


class PeroiAdapter(DatasetAdapter):
    """Reads the PeRoI dataset from an already-present on-disk directory.

    Downloads nothing. `root` defaults to `paths.data_root() / "peroi"`.
    """

    name = "peroi"

    def __init__(self, root: Path | None = None) -> None:
        if root is None:
            root = paths.data_root() / "peroi"
        self.root = Path(root)

    def conditions(self) -> tuple[str, ...]:
        return _CONDITIONS

    def load(self, condition: str) -> tuple[Scene, ...]:
        if condition not in _CONDITION_DIR_NAMES:
            raise KeyError(
                f"unknown PeRoI condition '{condition}'; expected one of {_CONDITIONS}"
            )

        long_frame = self._read_condition_frame(condition)
        robot_expected = condition != "PD"

        scene_ids = sorted(long_frame["scene_id"].unique().tolist())
        scenes: list[Scene] = []
        for scene_id in scene_ids:
            scene_frame = long_frame.loc[long_frame["scene_id"] == scene_id]
            agent_ids = sorted(scene_frame["agent_id"].unique().tolist())

            pedestrian_trajectories: list[Trajectory] = []
            robot_trajectory: Trajectory | None = None
            for agent_id in agent_ids:
                agent_frame = scene_frame.loc[scene_frame["agent_id"] == agent_id]
                agent_frame = agent_frame.sort_values("frame")
                positions = agent_frame.loc[:, ["x", "y"]].to_numpy(dtype=np.float64)
                trajectory = Trajectory(
                    agent_id=str(agent_id), positions=positions, t0=0.0, dt=_DT
                )
                if agent_id == _ROBOT_AGENT_ID:
                    robot_trajectory = trajectory
                else:
                    pedestrian_trajectories.append(trajectory)

            if robot_expected and robot_trajectory is None:
                raise ValueError(
                    f"scene '{scene_id}' in condition '{condition}' has no agent_id == "
                    f"'{_ROBOT_AGENT_ID}' row, but condition '{condition}' implies the robot is "
                    "present in every scene."
                )
            if not robot_expected and robot_trajectory is not None:
                raise ValueError(
                    f"scene '{scene_id}' in condition '{condition}' has an agent_id == "
                    f"'{_ROBOT_AGENT_ID}' row, but condition 'PD' implies no robot is present."
                )

            scene = Scene(
                scene_id=str(scene_id),
                pedestrians=tuple(pedestrian_trajectories),
                robot=robot_trajectory if robot_expected else None,
                robot_present=robot_expected,
                source=f"peroi:{condition}",
                seed=0,
            )
            scenes.append(scene)

        return tuple(scenes)

    def characterize(self) -> pd.DataFrame:
        rows: list[dict[str, object]] = []
        for condition in self.conditions():
            scenes = self.load(condition)
            rows.append(summarize_condition(condition, scenes))
        return pd.DataFrame(rows, columns=CHARACTERIZE_COLUMNS)

    def to_rollout_pairs(self) -> tuple[RolloutPair, ...]:
        """Deliberately unimplemented.

        PeRoI's PD / PD-SR / PD-MR conditions are different pedestrian populations observed at
        different times, NOT paired counterfactual twins of the same people, so a RolloutPair
        is not constructible from it.
        """
        raise NotImplementedError(
            "PeroiAdapter.to_rollout_pairs is not implemented: PeRoI's PD / PD-SR / PD-MR "
            "conditions are different pedestrian populations observed at different times, NOT "
            "paired counterfactual twins of the same people, so a RolloutPair is not "
            "constructible from it."
        )

    def _read_condition_frame(self, condition: str) -> pd.DataFrame:
        """Return a long-format frame with columns `_LONG_FRAME_COLUMNS` for `condition`.

        This is the single function that touches PeRoI's on-disk schema. Every other method on
        this class works only off the frame this returns.
        """
        if not self.root.is_dir():
            raise FileNotFoundError(
                f"PeRoI dataset root '{self.root}' does not exist. Download the release from "
                "Zenodo (DOI 10.5281/zenodo.18876411), extract it, and point MIRN_DATA_ROOT "
                "(or the `root` argument of PeroiAdapter) at the directory that contains the "
                "PD/, PD-SR/, and PD-MR/ condition subdirectories."
            )

        condition_dir = self.root / _CONDITION_DIR_NAMES[condition]
        if not condition_dir.is_dir():
            raise FileNotFoundError(
                f"PeRoI condition directory '{condition_dir}' does not exist under root "
                f"'{self.root}'. Expected one '{_SCENE_FILE_SUFFIX}' file per scene inside a "
                f"'{_CONDITION_DIR_NAMES[condition]}' subdirectory; see the mirn.data.peroi "
                "module docstring for the assumed layout."
            )

        scene_paths = sorted(condition_dir.glob(f"*{_SCENE_FILE_SUFFIX}"))
        if len(scene_paths) == 0:
            raise FileNotFoundError(
                f"no '{_SCENE_FILE_SUFFIX}' scene files found under '{condition_dir}'."
            )

        condition_frames: list[pd.DataFrame] = []
        for scene_path in scene_paths:
            scene_frame = pd.read_csv(scene_path)

            missing_columns: list[str] = []
            for column_name in _REQUIRED_SCENE_COLUMNS:
                if column_name not in scene_frame.columns:
                    missing_columns.append(column_name)
            if len(missing_columns) > 0:
                raise ValueError(
                    f"scene file '{scene_path}' is missing required column(s) "
                    f"{missing_columns}; expected columns {_REQUIRED_SCENE_COLUMNS}"
                )

            scene_frame = scene_frame.loc[:, list(_REQUIRED_SCENE_COLUMNS)].copy()
            scene_frame["scene_id"] = scene_path.stem
            condition_frames.append(scene_frame)

        long_frame = pd.concat(condition_frames, ignore_index=True)
        long_frame = long_frame.loc[:, list(_LONG_FRAME_COLUMNS)]
        return long_frame


# Registered here, after the class body, rather than via a bare `@DATASETS.register("peroi")`
# decorator, and guarded on the name not already being present. `python -m mirn.data.peroi`
# makes Python import this module twice under two different names (once as "mirn.data.peroi",
# a side effect of `mirn.data.__init__` eagerly importing every adapter submodule for
# registration; once as "__main__", to run the CLI below) — see the CPython runpy warning
# "found in sys.modules after import of package ... but prior to execution of ...". An
# unconditional decorator would attempt to register "peroi" twice and raise. `Registry.register`
# itself must keep raising on a genuine duplicate name (that behaviour is contract-tested in
# `tests/test_registry.py`), so the guard belongs here, at the single call site that can
# legitimately re-run.
if "peroi" not in DATASETS.names():
    DATASETS.register("peroi")(PeroiAdapter)


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m mirn.data.peroi")
    subparsers = parser.add_subparsers(dest="command", required=True)

    characterize_parser = subparsers.add_parser(
        "characterize", help="write PeroiAdapter().characterize() to a CSV file"
    )
    characterize_parser.add_argument(
        "--out", type=Path, required=True, help="output CSV path"
    )
    characterize_parser.add_argument(
        "--root", type=Path, default=None, help="PeRoI dataset root (default: $MIRN_DATA_ROOT/peroi)"
    )

    return parser


def main(argv: list[str] | None = None) -> None:
    """CLI entry point: `python -m mirn.data.peroi characterize --out PATH`."""
    parser = _build_arg_parser()
    args = parser.parse_args(argv)

    if args.command == "characterize":
        adapter = PeroiAdapter(root=args.root)
        frame = adapter.characterize()
        frame.to_csv(args.out, index=False)
        print(f"wrote {len(frame)} rows to {args.out}")


if __name__ == "__main__":
    main()
