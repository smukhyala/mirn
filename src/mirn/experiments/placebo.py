"""Experiment 4 — the placebo test.

Delete a pedestrian the robot never came near, from both arms, and re-estimate. A valid
perturbation estimator should not move: that pedestrian carries no robot effect, so removing it
removes no signal. CausalAgents found trajectory forecasters shift 25-38% relative minADE when
provably non-causal agents are removed, which is why this is a first-class gate in
`tests/test_placebo.py` rather than only an experiment.

`select_non_interacting_agent` and `drop_agent` live here and are imported by that test, so the
gate and the experiment can never drift apart.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np
import pandas as pd

from mirn.contracts import RolloutPair, Scene
from mirn.estimator import ESTIMATORS
from mirn.experiments.base import (
    EXPERIMENTS,
    Experiment,
    ExperimentParameter,
    ExperimentResult,
)
from mirn.experiments.calibration_floor import (
    build_adapter,
    divergence_parameter,
    n_scenes_parameter,
)
from mirn.experiments.estimator_comparison import influence_parameter

PLACEBO_COLUMNS: tuple[str, ...] = (
    "variant",
    "n_pedestrians",
    "value",
    "ci_low",
    "ci_high",
    "delta_vs_full",
    "influence",
    "seed",
)

DEFAULT_EXCLUSION_RADIUS_M = 4.5


def select_non_interacting_agent(pair: RolloutPair, exclusion_radius_m: float) -> str | None:
    """The id of a pedestrian that never comes within `exclusion_radius_m` of the robot.

    Returns the lowest such `agent_id` so the choice is deterministic, or None when every
    pedestrian in the pair passes close to the robot at some point.
    """
    robot = pair.factual.robot
    if robot is None:
        raise ValueError(
            "select_non_interacting_agent requires a factual arm with a robot; got "
            f"robot_present={pair.factual.robot_present}"
        )
    robot_positions = robot.positions

    candidate_ids: list[str] = []
    for pedestrian in pair.factual.pedestrians:
        offsets = pedestrian.positions - robot_positions
        distances = np.sqrt(np.sum(offsets * offsets, axis=1))
        closest_approach = float(np.min(distances))
        if closest_approach > exclusion_radius_m:
            candidate_ids.append(pedestrian.agent_id)

    if len(candidate_ids) == 0:
        return None
    candidate_ids.sort()
    return candidate_ids[0]


def select_common_non_interacting_agent(
    pairs: Sequence[RolloutPair], exclusion_radius_m: float
) -> str | None:
    """The lowest `agent_id` that is non-interacting in *every* pair.

    Selecting from one scene and deleting from all of them would be wrong: an agent that stays
    clear of the robot in scene 0 may pass right by it in scene 2, and removing it there would
    delete real signal and make the placebo test measure the wrong thing.
    """
    if len(pairs) < 1:
        raise ValueError("select_common_non_interacting_agent requires at least one pair")

    common: set[str] | None = None
    for pair in pairs:
        eligible: set[str] = set()
        robot = pair.factual.robot
        if robot is None:
            raise ValueError(
                "select_common_non_interacting_agent requires every factual arm to have a robot"
            )
        for pedestrian in pair.factual.pedestrians:
            offsets = pedestrian.positions - robot.positions
            distances = np.sqrt(np.sum(offsets * offsets, axis=1))
            if float(np.min(distances)) > exclusion_radius_m:
                eligible.add(pedestrian.agent_id)
        if common is None:
            common = eligible
        else:
            common = common & eligible

    if common is None or len(common) == 0:
        return None
    ordered: list[str] = []
    for agent_id in common:
        ordered.append(agent_id)
    ordered.sort()
    return ordered[0]


def _scene_without(scene: Scene, agent_id: str) -> Scene:
    kept: list[object] = []
    for pedestrian in scene.pedestrians:
        if pedestrian.agent_id != agent_id:
            kept.append(pedestrian)
    return Scene(
        scene_id=scene.scene_id,
        pedestrians=tuple(kept),
        robot=scene.robot,
        robot_present=scene.robot_present,
        source=scene.source,
        seed=scene.seed,
    )


def drop_agent(pair: RolloutPair, agent_id: str) -> RolloutPair:
    """The same pair with one pedestrian removed from *both* arms.

    Removing from both arms is what keeps the `RolloutPair` invariants intact; removing from one
    would produce a pair whose agent sets differ, which `__post_init__` rejects.
    """
    factual = _scene_without(pair.factual, agent_id)
    if len(factual.pedestrians) == len(pair.factual.pedestrians):
        raise ValueError(
            f"agent '{agent_id}' is not present in the factual arm of scene "
            f"'{pair.factual.scene_id}'"
        )
    counterfactual = _scene_without(pair.counterfactual, agent_id)
    return RolloutPair(factual=factual, counterfactual=counterfactual)


@EXPERIMENTS.register("placebo")
class Placebo(Experiment):
    """Delete a non-interacting pedestrian and check the estimate does not move."""

    name = "placebo"
    title = "The placebo test"
    claim = "Deleting a pedestrian the robot never came near does not move the estimate."

    def parameters(self) -> tuple[ExperimentParameter, ...]:
        exclusion_radius = ExperimentParameter(
            name="exclusion_radius_m",
            label="Exclusion radius (m)",
            kind="float",
            default=DEFAULT_EXCLUSION_RADIUS_M,
            minimum=1.0,
            maximum=12.0,
            step=0.5,
            help_text=(
                "A pedestrian is treated as non-interacting if it never comes within this "
                "distance of the robot."
            ),
        )
        return (
            influence_parameter(1.0),
            exclusion_radius,
            divergence_parameter(),
            n_scenes_parameter(),
        )

    def run(self, params: Mapping[str, object], seed: int) -> ExperimentResult:
        resolved = self.resolve(params)
        influence = float(resolved["influence"])  # type: ignore[arg-type]
        exclusion_radius_m = float(resolved["exclusion_radius_m"])  # type: ignore[arg-type]
        divergence = str(resolved["divergence"])
        n_scenes = int(resolved["n_scenes"])  # type: ignore[call-overload]

        adapter = build_adapter(n_scenes, seed)
        pairs = adapter.rollout_pairs_with_influence(influence)
        estimator = ESTIMATORS.create("paired", divergence=divergence)

        full_estimate = estimator.estimate(pairs, seed)

        removed_agent_id = select_common_non_interacting_agent(pairs, exclusion_radius_m)
        if removed_agent_id is None:
            raise ValueError(
                "no pedestrian stays farther than "
                f"{exclusion_radius_m} m from the robot in every scene, so there is no "
                "non-interacting agent to remove; lower the exclusion radius"
            )

        reduced_pairs: list[RolloutPair] = []
        for pair in pairs:
            reduced_pairs.append(drop_agent(pair, removed_agent_id))
        reduced_estimate = estimator.estimate(tuple(reduced_pairs), seed)

        delta = reduced_estimate.value - full_estimate.value

        rows: list[dict[str, object]] = []
        full_row: dict[str, object] = {}
        full_row["variant"] = "full"
        full_row["n_pedestrians"] = pairs[0].factual.n_pedestrians
        full_row["value"] = full_estimate.value
        full_row["ci_low"] = full_estimate.ci_low
        full_row["ci_high"] = full_estimate.ci_high
        full_row["delta_vs_full"] = 0.0
        full_row["influence"] = influence
        full_row["seed"] = seed
        rows.append(full_row)

        reduced_row: dict[str, object] = {}
        reduced_row["variant"] = "pedestrian_removed"
        reduced_row["n_pedestrians"] = reduced_pairs[0].factual.n_pedestrians
        reduced_row["value"] = reduced_estimate.value
        reduced_row["ci_low"] = reduced_estimate.ci_low
        reduced_row["ci_high"] = reduced_estimate.ci_high
        reduced_row["delta_vs_full"] = delta
        reduced_row["influence"] = influence
        reduced_row["seed"] = seed
        rows.append(reduced_row)

        frame = pd.DataFrame(rows, columns=list(PLACEBO_COLUMNS))

        payload: dict[str, object] = {}
        payload["removed_agent_id"] = removed_agent_id
        payload["exclusion_radius_m"] = exclusion_radius_m
        payload["delta_vs_full"] = delta
        payload["full_value"] = full_estimate.value
        payload["reduced_value"] = reduced_estimate.value
        payload["influence"] = influence
        payload["note"] = (
            "Synthetic data. The removed pedestrian never comes within the exclusion radius of "
            "the robot, so it carries no robot effect and removing it should remove no signal."
        )

        return ExperimentResult(
            experiment_name=self.name,
            seed=seed,
            frame=frame,
            payload=payload,
            method_keys=("paired", "bootstrap_ci"),
        )
