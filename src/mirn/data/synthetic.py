"""A synthetic paired-data generator: the fixture the estimator/divergence/placebo tests depend
on when real datasets are unavailable or, for PeRoI, structurally unable to supply pairs.

Pedestrians cross a 20 x 12 m box left-to-right under a constant-velocity model plus seeded
Gaussian noise. A robot sits at the box centre and, in the factual arm only, displaces nearby
pedestrians laterally by an amount that decays exponentially with distance to the robot. Both
arms are built from the *same* drawn noise and the same base (undisturbed) trajectory, so the
counterfactual arm is exactly the pre-robot trajectory and the factual arm is the pre-robot
trajectory plus the robot-induced displacement. Because the displacement is proportional to
`influence`, `influence = 0.0` zeroes it out via `x + 0.0 == x` (exact for finite floats): the
two arms are then bitwise identical, not merely close.

The first timestep's displacement is always forced to exactly 0.0 regardless of `influence`, so
the arms' initial pedestrian state matches exactly — `RolloutPair` requires this of any adapter.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from mirn.contracts import RolloutPair, Scene, Trajectory
from mirn.data.base import CHARACTERIZE_COLUMNS, DATASETS, DatasetAdapter, summarize_condition

_BOX_WIDTH_M = 20.0
_BOX_HEIGHT_M = 12.0
_DT = 0.1
_ROBOT_POSITION_M: tuple[float, float] = (_BOX_WIDTH_M / 2.0, _BOX_HEIGHT_M / 2.0)
_ROBOT_AGENT_ID = "robot"
_BASE_SPEED_MS = 1.2
_SPEED_NOISE_STD_MS = 0.15
_MIN_SPEED_MS = 0.3
_POSITION_NOISE_STD_M = 0.03
DISPLACEMENT_AMPLITUDE_M = 1.5
DISPLACEMENT_DECAY_LENGTH_M = 3.0
_DEFAULT_INFLUENCE = 1.0
_CONDITIONS: tuple[str, ...] = ("factual", "counterfactual")
_VELOCITY_UNIT = np.array([1.0, 0.0], dtype=np.float64)
_LATERAL_UNIT = np.array([-_VELOCITY_UNIT[1], _VELOCITY_UNIT[0]], dtype=np.float64)


@DATASETS.register("synthetic")
class SyntheticAdapter(DatasetAdapter):
    """Generates deterministic, seeded synthetic `RolloutPair`s for testing."""

    name = "synthetic"

    def __init__(
        self,
        n_scenes: int = 8,
        n_pedestrians: int = 12,
        n_steps: int = 60,
        seed: int = 0,
    ) -> None:
        if n_scenes < 1:
            raise ValueError(f"n_scenes must be >= 1, got {n_scenes}")
        if n_pedestrians < 1:
            raise ValueError(f"n_pedestrians must be >= 1, got {n_pedestrians}")
        if n_steps < 2:
            raise ValueError(f"n_steps must be >= 2, got {n_steps}")

        self.n_scenes = n_scenes
        self.n_pedestrians = n_pedestrians
        self.n_steps = n_steps
        self.seed = seed

    def conditions(self) -> tuple[str, ...]:
        return _CONDITIONS

    def load(self, condition: str) -> tuple[Scene, ...]:
        if condition not in _CONDITIONS:
            raise KeyError(
                f"unknown synthetic condition '{condition}'; expected one of {_CONDITIONS}"
            )

        pairs = self.rollout_pairs()
        scenes: list[Scene] = []
        for pair in pairs:
            if condition == "factual":
                scenes.append(pair.factual)
            else:
                scenes.append(pair.counterfactual)
        return tuple(scenes)

    def characterize(self) -> pd.DataFrame:
        rows: list[dict[str, object]] = []
        for condition in self.conditions():
            scenes = self.load(condition)
            rows.append(summarize_condition(condition, scenes))
        return pd.DataFrame(rows, columns=CHARACTERIZE_COLUMNS)

    def rollout_pairs(self) -> tuple[RolloutPair, ...]:
        """Rollout pairs at the generator's default influence level."""
        return self.rollout_pairs_with_influence(_DEFAULT_INFLUENCE)

    def rollout_pairs_with_influence(self, influence: float) -> tuple[RolloutPair, ...]:
        """Rollout pairs at an explicit robot-influence level.

        `influence = 0.0` yields factual/counterfactual arms that are bitwise identical in
        pedestrian positions (`np.array_equal`, not `np.allclose`).
        """
        pairs: list[RolloutPair] = []
        for scene_index in range(self.n_scenes):
            pairs.append(self._generate_pair(scene_index, influence))
        return tuple(pairs)

    def _generate_pair(self, scene_index: int, influence: float) -> RolloutPair:
        scene_seed = self.seed + scene_index
        rng = np.random.default_rng(scene_seed)

        start_y = rng.uniform(0.0, _BOX_HEIGHT_M, size=self.n_pedestrians)
        speed_offsets = rng.normal(0.0, _SPEED_NOISE_STD_MS, size=self.n_pedestrians)
        speeds = np.empty(self.n_pedestrians, dtype=np.float64)
        for pedestrian_index in range(self.n_pedestrians):
            candidate_speed = _BASE_SPEED_MS + speed_offsets[pedestrian_index]
            speeds[pedestrian_index] = max(candidate_speed, _MIN_SPEED_MS)

        # Drawn once; reused for both arms below so the only difference between them is the
        # robot-induced displacement.
        noise = rng.normal(
            0.0, _POSITION_NOISE_STD_M, size=(self.n_pedestrians, self.n_steps, 2)
        )

        time_steps = _DT * np.arange(self.n_steps)
        robot_position = np.array(_ROBOT_POSITION_M, dtype=np.float64)

        factual_trajectories: list[Trajectory] = []
        counterfactual_trajectories: list[Trajectory] = []

        for pedestrian_index in range(self.n_pedestrians):
            agent_id = f"ped{pedestrian_index}"
            speed = speeds[pedestrian_index]

            base_positions = np.empty((self.n_steps, 2), dtype=np.float64)
            base_positions[:, 0] = speed * time_steps
            base_positions[:, 1] = start_y[pedestrian_index]
            base_positions = base_positions + noise[pedestrian_index]

            vector_from_robot = base_positions - robot_position[np.newaxis, :]
            distance_from_robot = np.sqrt(np.sum(vector_from_robot * vector_from_robot, axis=1))
            lateral_projection = (
                vector_from_robot[:, 0] * _LATERAL_UNIT[0]
                + vector_from_robot[:, 1] * _LATERAL_UNIT[1]
            )
            lateral_sign = np.sign(lateral_projection)
            for step_index in range(self.n_steps):
                if lateral_sign[step_index] == 0.0:
                    lateral_sign[step_index] = 1.0

            decay = np.exp(-distance_from_robot / DISPLACEMENT_DECAY_LENGTH_M)
            displacement_magnitude = influence * DISPLACEMENT_AMPLITUDE_M * decay

            displacement = np.empty((self.n_steps, 2), dtype=np.float64)
            for step_index in range(self.n_steps):
                signed_magnitude = lateral_sign[step_index] * displacement_magnitude[step_index]
                displacement[step_index, 0] = signed_magnitude * _LATERAL_UNIT[0]
                displacement[step_index, 1] = signed_magnitude * _LATERAL_UNIT[1]
            # Exogenous initial state must match exactly across arms (RolloutPair invariant),
            # not merely "small enough" from decay.
            displacement[0, :] = 0.0

            factual_positions = base_positions + displacement

            factual_trajectories.append(
                Trajectory(agent_id=agent_id, positions=factual_positions, t0=0.0, dt=_DT)
            )
            counterfactual_trajectories.append(
                Trajectory(agent_id=agent_id, positions=base_positions, t0=0.0, dt=_DT)
            )

        robot_positions = np.tile(robot_position, (self.n_steps, 1))
        robot_trajectory = Trajectory(
            agent_id=_ROBOT_AGENT_ID, positions=robot_positions, t0=0.0, dt=_DT
        )

        scene_id = f"synthetic-{scene_index}"
        factual_scene = Scene(
            scene_id=scene_id,
            pedestrians=tuple(factual_trajectories),
            robot=robot_trajectory,
            robot_present=True,
            source="synthetic",
            seed=scene_seed,
        )
        counterfactual_scene = Scene(
            scene_id=scene_id,
            pedestrians=tuple(counterfactual_trajectories),
            robot=None,
            robot_present=False,
            source="synthetic",
            seed=scene_seed,
        )
        return RolloutPair(factual=factual_scene, counterfactual=counterfactual_scene)
