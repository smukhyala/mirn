"""Typed, frozen contracts shared by every module in mirn.

These four dataclasses are the vocabulary the rest of the package speaks. They are intentionally
strict: validation happens once, in `__post_init__`, and a violated invariant is always a
`ValueError` (or `KeyError` for lookups) — never a warning and never a silent coercion.

Arrays stored on these contracts are normalised to `numpy.float64` and marked read-only
(`flags.writeable = False`) so that accidental in-place mutation through the public attribute is
caught immediately (numpy raises `ValueError` on the write) rather than silently corrupting
shared state. This is not genuine immutability: a determined caller can flip `flags.writeable`
back to `True` and mutate the array anyway — numpy does not enforce the flag against that, it is
a standard numpy idiom for catching mistakes, not a security boundary. We deliberately do not
defend against the determined-caller case with per-access defensive copies; copying on every
access would cost real time in the estimator loops. Because `frozen=True` blocks attribute
assignment from `__post_init__`, normalised values are written back via `object.__setattr__`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True, slots=True)
class Trajectory:
    """A single agent's 2-D position history on a uniform time grid.

    `positions` has shape (T, 2); row `i` is the agent's (x, y) position at time
    `t0 + i * dt`.
    """

    agent_id: str
    positions: np.ndarray
    t0: float
    dt: float

    def __post_init__(self) -> None:
        positions = np.array(self.positions, dtype=np.float64)

        if positions.ndim != 2:
            raise ValueError(
                f"Trajectory.positions must be 2-D with shape (T, 2), got ndim={positions.ndim}"
            )
        if positions.shape[1] != 2:
            raise ValueError(
                f"Trajectory.positions must have shape (T, 2), got shape={positions.shape}"
            )
        if positions.shape[0] < 1:
            raise ValueError(
                f"Trajectory.positions must have at least one timestep, got shape={positions.shape}"
            )
        if not math.isfinite(self.dt):
            raise ValueError(f"Trajectory.dt must be finite, got {self.dt}")
        if self.dt <= 0:
            raise ValueError(f"Trajectory.dt must be > 0, got {self.dt}")
        if not math.isfinite(self.t0):
            raise ValueError(f"Trajectory.t0 must be finite, got {self.t0}")
        if not np.isfinite(positions).all():
            raise ValueError("Trajectory.positions must contain only finite values")

        positions.flags.writeable = False
        object.__setattr__(self, "positions", positions)

    @property
    def n_steps(self) -> int:
        return self.positions.shape[0]

    @property
    def duration(self) -> float:
        return self.n_steps * self.dt

    @property
    def times(self) -> np.ndarray:
        return self.t0 + self.dt * np.arange(self.n_steps)

    def resample_to(self, dt: float) -> Trajectory:
        """Linearly interpolate this trajectory onto a new uniform grid with spacing `dt`.

        `agent_id` and `t0` are preserved. The new grid starts at `t0` and covers the same
        closed interval as `self.times` where possible: it never extends past
        `self.times[-1]`, so the last new sample may fall short of the original span by less
        than one `dt` step when the spans are not exactly commensurate.
        """
        if not math.isfinite(dt):
            raise ValueError(f"resample_to dt must be finite, got {dt}")
        if dt <= 0:
            raise ValueError(f"resample_to dt must be > 0, got {dt}")

        old_times = self.times
        span = old_times[-1] - old_times[0]

        if span <= 0:
            new_n_steps = 1
        else:
            n_intervals = math.floor(span / dt + 1e-9)
            new_n_steps = n_intervals + 1

        new_times = self.t0 + dt * np.arange(new_n_steps)
        new_positions = np.empty((new_n_steps, 2), dtype=np.float64)
        for dim in range(2):
            new_positions[:, dim] = np.interp(new_times, old_times, self.positions[:, dim])

        return Trajectory(agent_id=self.agent_id, positions=new_positions, t0=self.t0, dt=dt)


@dataclass(frozen=True, slots=True)
class Scene:
    """A collection of pedestrian trajectories, plus an optional robot trajectory."""

    scene_id: str
    pedestrians: tuple[Trajectory, ...]
    robot: Trajectory | None
    robot_present: bool
    source: str
    seed: int

    def __post_init__(self) -> None:
        pedestrians = tuple(self.pedestrians)
        object.__setattr__(self, "pedestrians", pedestrians)

        if self.robot_present and self.robot is None:
            raise ValueError("Scene.robot_present is True but Scene.robot is None")
        if not self.robot_present and self.robot is not None:
            raise ValueError("Scene.robot_present is False but Scene.robot is not None")

        seen_ids: set[str] = set()
        dt_reference: float | None = None
        for pedestrian in pedestrians:
            if pedestrian.agent_id in seen_ids:
                raise ValueError(
                    f"Scene.pedestrians has duplicate agent_id '{pedestrian.agent_id}'"
                )
            seen_ids.add(pedestrian.agent_id)

            if dt_reference is None:
                dt_reference = pedestrian.dt
            elif pedestrian.dt != dt_reference:
                raise ValueError(
                    "Scene.pedestrians must share a single dt, got "
                    f"{pedestrian.dt} != {dt_reference}"
                )

    @property
    def n_pedestrians(self) -> int:
        return len(self.pedestrians)

    def pedestrian_by_id(self, agent_id: str) -> Trajectory:
        for pedestrian in self.pedestrians:
            if pedestrian.agent_id == agent_id:
                return pedestrian
        raise KeyError(f"no pedestrian with agent_id '{agent_id}' in scene '{self.scene_id}'")


@dataclass(frozen=True, slots=True)
class RolloutPair:
    """A factual (robot-present) scene and a counterfactual (robot-absent) scene.

    This pairing is the whole experiment: both arms must share a seed, share exogenous
    pedestrian state, and differ only in robot presence. If an adapter cannot satisfy these
    invariants, that adapter is unusable — the invariants do not relax.
    """

    factual: Scene
    counterfactual: Scene

    def __post_init__(self) -> None:
        if self.factual.seed != self.counterfactual.seed:
            raise ValueError(
                "RolloutPair violates 'factual.seed == counterfactual.seed': "
                f"{self.factual.seed} != {self.counterfactual.seed}"
            )
        if self.factual.robot_present is not True:
            raise ValueError(
                "RolloutPair violates 'factual.robot_present is True': "
                f"got {self.factual.robot_present}"
            )
        if self.counterfactual.robot_present is not False:
            raise ValueError(
                "RolloutPair violates 'counterfactual.robot_present is False': "
                f"got {self.counterfactual.robot_present}"
            )

        factual_ids: set[str] = set()
        for pedestrian in self.factual.pedestrians:
            factual_ids.add(pedestrian.agent_id)
        counterfactual_ids: set[str] = set()
        for pedestrian in self.counterfactual.pedestrians:
            counterfactual_ids.add(pedestrian.agent_id)

        if factual_ids != counterfactual_ids:
            raise ValueError(
                "RolloutPair violates 'identical pedestrian agent_id sets': "
                f"factual={sorted(factual_ids)} counterfactual={sorted(counterfactual_ids)}"
            )

        for agent_id in sorted(factual_ids):
            factual_traj = self.factual.pedestrian_by_id(agent_id)
            counterfactual_traj = self.counterfactual.pedestrian_by_id(agent_id)

            if factual_traj.dt != counterfactual_traj.dt:
                raise ValueError(
                    f"RolloutPair violates 'identical dt' for shared agent '{agent_id}': "
                    f"{factual_traj.dt} != {counterfactual_traj.dt}"
                )

            position_diff = np.abs(factual_traj.positions[0] - counterfactual_traj.positions[0])
            if np.max(position_diff) > 1e-9:
                raise ValueError(
                    "RolloutPair violates 'identical first position within 1e-9' for shared "
                    f"agent '{agent_id}': factual={factual_traj.positions[0]!r} "
                    f"counterfactual={counterfactual_traj.positions[0]!r}"
                )

    def paired_agents(self) -> tuple[tuple[Trajectory, Trajectory], ...]:
        """Return (factual, counterfactual) trajectory pairs, ordered by agent_id."""
        factual_ids: list[str] = []
        for pedestrian in self.factual.pedestrians:
            factual_ids.append(pedestrian.agent_id)

        pairs: list[tuple[Trajectory, Trajectory]] = []
        for agent_id in sorted(factual_ids):
            factual_traj = self.factual.pedestrian_by_id(agent_id)
            counterfactual_traj = self.counterfactual.pedestrian_by_id(agent_id)
            pairs.append((factual_traj, counterfactual_traj))

        return tuple(pairs)


@dataclass(frozen=True, slots=True)
class PerturbationEstimate:
    """The result of a perturbation estimator: a point estimate with a confidence interval and
    an explicit statement of the identifying assumption it relies on."""

    value: float
    ci_low: float
    ci_high: float
    units: str
    identification: str
    n_samples: int
    divergence_name: str
    estimator_name: str

    def __post_init__(self) -> None:
        if self.units not in ("metres", "mdp"):
            raise ValueError(
                f"PerturbationEstimate.units must be 'metres' or 'mdp', got '{self.units}'"
            )
        if not math.isfinite(self.value):
            raise ValueError(f"PerturbationEstimate.value must be finite, got {self.value}")
        if self.value < 0:
            raise ValueError(f"PerturbationEstimate.value must be >= 0, got {self.value}")
        if not (self.ci_low <= self.value <= self.ci_high):
            raise ValueError(
                "PerturbationEstimate violates 'ci_low <= value <= ci_high': "
                f"ci_low={self.ci_low}, value={self.value}, ci_high={self.ci_high}"
            )
        if len(self.identification.strip()) == 0:
            raise ValueError("PerturbationEstimate.identification must be non-empty")
        if self.n_samples < 1:
            raise ValueError(
                f"PerturbationEstimate.n_samples must be >= 1, got {self.n_samples}"
            )

    def as_row(self) -> dict[str, object]:
        """Flatten to a dict for CSV writing. Keys are exactly the dataclass field names, in
        field-declaration order."""
        row: dict[str, object] = {}
        row["value"] = self.value
        row["ci_low"] = self.ci_low
        row["ci_high"] = self.ci_high
        row["units"] = self.units
        row["identification"] = self.identification
        row["n_samples"] = self.n_samples
        row["divergence_name"] = self.divergence_name
        row["estimator_name"] = self.estimator_name
        return row
