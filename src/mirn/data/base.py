"""The `DatasetAdapter` extension point: a uniform interface over pedestrian-trajectory datasets.

Every concrete adapter registers itself into `DATASETS` via the `@DATASETS.register("name")`
decorator. Callers look implementations up by name — never by an `if name == ...` dispatch
chain.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np
import pandas as pd

from mirn.contracts import Scene
from mirn.registry import Registry

DATASETS = Registry("dataset")

CHARACTERIZE_COLUMNS: tuple[str, ...] = (
    "condition",
    "n_scenes",
    "n_trajectories",
    "n_points",
    "mean_duration_s",
    "mean_speed_ms",
    "median_speed_ms",
    "frac_robot_present",
)


class DatasetAdapter(ABC):
    """A dataset that can be enumerated by condition and loaded into `Scene`s.

    `conditions` names the recording conditions the dataset distinguishes (e.g. robot-present
    vs robot-absent, or different robot behaviours). `load` returns every `Scene` for one
    condition. `characterize` returns one summary row per condition, with exactly the columns
    in `CHARACTERIZE_COLUMNS`.
    """

    name: str

    @abstractmethod
    def conditions(self) -> tuple[str, ...]:
        """Return the dataset's condition names."""
        raise NotImplementedError

    @abstractmethod
    def load(self, condition: str) -> tuple[Scene, ...]:
        """Return every `Scene` recorded under `condition`."""
        raise NotImplementedError

    @abstractmethod
    def characterize(self) -> pd.DataFrame:
        """Return one summary row per condition, columns exactly `CHARACTERIZE_COLUMNS`."""
        raise NotImplementedError


def summarize_condition(condition: str, scenes: tuple[Scene, ...]) -> dict[str, object]:
    """Compute one `characterize()` row for `condition` from its already-loaded `scenes`.

    Shared by every `DatasetAdapter.characterize` implementation so the column list and the
    summary statistics are defined exactly once.

    Speeds are computed from consecutive-frame pedestrian displacement magnitude divided by
    each trajectory's `dt`; a trajectory with fewer than two points contributes no speed sample.
    `n_trajectories` and `n_points` count pedestrians only — the robot, when present, is a
    control signal on the scene rather than part of the measured pedestrian population.
    """
    n_scenes = len(scenes)
    n_trajectories = 0
    n_points = 0
    n_robot_present = 0
    duration_values: list[float] = []
    speed_values: list[float] = []

    for scene in scenes:
        if scene.robot_present:
            n_robot_present += 1
        for pedestrian in scene.pedestrians:
            n_trajectories += 1
            n_points += pedestrian.n_steps
            duration_values.append(pedestrian.duration)
            if pedestrian.n_steps >= 2:
                steps = pedestrian.positions[1:] - pedestrian.positions[:-1]
                step_distances = np.sqrt(np.sum(steps * steps, axis=1))
                step_speeds = step_distances / pedestrian.dt
                for step_speed in step_speeds:
                    speed_values.append(float(step_speed))

    row: dict[str, object] = {}
    row["condition"] = condition
    row["n_scenes"] = n_scenes
    row["n_trajectories"] = n_trajectories
    row["n_points"] = n_points

    if len(duration_values) > 0:
        row["mean_duration_s"] = float(np.mean(np.array(duration_values, dtype=np.float64)))
    else:
        row["mean_duration_s"] = float("nan")

    if len(speed_values) > 0:
        speed_array = np.array(speed_values, dtype=np.float64)
        row["mean_speed_ms"] = float(np.mean(speed_array))
        row["median_speed_ms"] = float(np.median(speed_array))
    else:
        row["mean_speed_ms"] = float("nan")
        row["median_speed_ms"] = float("nan")

    if n_scenes > 0:
        row["frac_robot_present"] = n_robot_present / n_scenes
    else:
        row["frac_robot_present"] = float("nan")

    return row
