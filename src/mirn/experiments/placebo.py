"""Experiment 4 — the placebo test.

Delete a pedestrian the robot never came near, from both arms, and re-estimate. A valid
perturbation estimator should not move: that pedestrian carries no robot effect, so removing it
removes no signal. CausalAgents found trajectory forecasters shift 25-38% relative minADE when
provably non-causal agents are removed, which is why this is a first-class gate in
`tests/test_placebo.py` rather than only an experiment.

`select_non_interacting_agent` and `drop_agent` live here and are imported by that test, so the
gate and the experiment can never drift apart.

Selection and removal happen **per pair, independently**. Each `RolloutPair`'s own bystander is
found and dropped from that pair alone; different pairs generally lose different pedestrians. This
replaces an earlier, wrong design that required one shared `agent_id` to qualify as a bystander in
*every* scene before removing it everywhere. That was wrong for two reasons: (1) `agent_id`s are
per-scene arbitrary labels — `ped2` in scene 0 and `ped2` in scene 5 are different simulated people,
since each scene draws its own `start_y` from `scene_seed = seed + scene_index` — so requiring one
label to qualify everywhere is an artifact of the fixture's naming, not a scientific requirement;
and (2) at the declared default `n_scenes=8` (what a form pre-filled with defaults submits), the
probability that any single pedestrian clears the exclusion radius in *every* one of 8
independently-drawn scenes is a few percent at best (see `DEFAULT_EXCLUSION_RADIUS_M`'s comment for
the arithmetic) — the design was unusable outside the small `n_scenes=3` values the test suite
happened to use. `RolloutPair` only requires the two arms of the *same* pair to share an agent set,
never that different pairs share one, so per-pair removal is valid, and the estimator already
averages a per-pair divergence, so the estimand is unchanged by which specific bystander is dropped
in each scene.

Eligibility is measured on the **counterfactual** (robot-absent) arm's pedestrian trajectories,
not the factual arm's, even though the robot's own position is only available on the factual arm
(the counterfactual `Scene.robot` is `None` by contract — `RolloutPair` requires it). This matters:
`_generate_pair` always directs its displacement to *increase* a pedestrian's lateral offset from
the robot, never decrease it, so a factual-arm closest-approach is always `>=` the same
pedestrian's counterfactual-arm closest-approach. Selecting eligibility from the factual arm would
therefore select partly on the very displacement being tested — selection on the outcome, the same
class of error this project's guardrails exist to keep out of the estimator itself. Selecting from
the counterfactual arm instead makes the choice depend only on the pedestrian's undisturbed path,
which is influence-independent by construction: the same *set* of per-scene removed agents results
at every influence level for a fixed seed and scene count (see
`test_placebo_removed_agent_is_influence_independent`).

Caveat on what "non-interacting" actually buys us here. The exclusion radius is 4.0 m against a
3.0 m displacement decay length (`DISPLACEMENT_DECAY_LENGTH_M` in `data/synthetic.py`), measured on
the counterfactual arm, so a removed agent still retains roughly `exp(-4.0 / 3.0) ≈ 26%` of the peak
displacement amplitude at its closest approach — it is *weakly interacting*, not truly
non-interacting. A genuinely non-interacting pedestrian is impossible in this fixture, and the true
ceiling is tighter than the box height alone suggests: pedestrians travel for `DEFAULT_N_STEPS *
_DT` = 6 s at roughly the 1.2 m/s base speed, reaching only `x ≈ 7.2 m` against the robot's
`x = 10 m` (`dx ≈ 2.8 m`), while the box is 12 m tall with the robot fixed at its centre
(`y = 6`, so `dy` is at most 6 m). Combining both offsets, not just the lateral one, the true
worst-case closest approach is `sqrt(2.8² + 6²) ≈ 6.62 m` — about 2.2 decay lengths,
`exp(-6.62 / 3.0) ≈ 11.0%` residual amplitude at best, not the `exp(-2) ≈ 13.5%` an
x-offset-blind estimate would suggest. Exact invariance is therefore established only at
`influence = 0.0`, where both arms are bitwise identical and the delta is exactly zero by
construction, not by selection. At `influence > 0` this experiment is a *bounded sensitivity*
check against CausalAgents' reported 25-38% relative minADE shift — not a proof that the removed
agents carry zero robot effect.
"""

from __future__ import annotations

import math
from collections.abc import Mapping

import numpy as np
import pandas as pd

from mirn.contracts import RolloutPair, Scene
from mirn.data.synthetic import DISPLACEMENT_AMPLITUDE_M, DISPLACEMENT_DECAY_LENGTH_M
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
    "units",
    "delta_vs_full",
    "influence",
    "seed",
)

# Modelled against COUNTERFACTUAL-arm distances under PER-PAIR selection (see the module
# docstring for why that arm, and why per-pair rather than one shared agent_id across every
# scene). A pedestrian's counterfactual closest approach is sqrt(2.8^2 + (y0 - 6)^2), where y0 is
# its uniform-in-[0, 12] starting y; at R = 4.0 m that gives a per-pedestrian qualifying
# probability p ~= 0.524. With DEFAULT_N_PEDESTRIANS = 12 candidates per scene, the probability a
# single scene has at least one qualifying pedestrian is 1 - (1 - p)^12 ~= 99.99%, so the
# probability every scene in the run independently has one is ~99.9% at the declared default
# n_scenes=8 and ~99.6% at the top of the allowed range, n_scenes=32 -- both verified directly by
# test_placebo_succeeds_at_declared_defaults_across_many_seeds and
# test_placebo_succeeds_at_the_top_of_the_scene_range, across many seeds, without raising. This
# replaces an earlier, incorrect n_scenes=3-only measurement that required one shared agent_id to
# qualify in every scene -- a model that was unusable above a few scenes (roughly 6.6% success at
# n_scenes=8) regardless of radius. 4.0 m remains comfortably above the 3.0 m displacement decay
# length. See the module docstring for what this radius does and does not establish, and `run()`
# for the rare (~0.1-0.4%) per-scene failure case, which raises ValueError naming the scene.
DEFAULT_EXCLUSION_RADIUS_M = 4.0


def select_non_interacting_agent(pair: RolloutPair, exclusion_radius_m: float) -> str | None:
    """The id of a pedestrian that never comes within `exclusion_radius_m` of the robot.

    Distance is measured on the **counterfactual** arm's (undisplaced) pedestrian path against the
    robot's fixed position, read from the factual arm since the counterfactual `Scene.robot` is
    `None` by contract. Measuring on the factual arm would select partly on the robot's own
    displacement, which always pushes a pedestrian's factual-arm distance to be `>=` its
    counterfactual-arm distance — selection on the outcome. See the module docstring.

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
    for pedestrian in pair.counterfactual.pedestrians:
        offsets = pedestrian.positions - robot_positions
        distances = np.sqrt(np.sum(offsets * offsets, axis=1))
        closest_approach = float(np.min(distances))
        if closest_approach > exclusion_radius_m:
            candidate_ids.append(pedestrian.agent_id)

    if len(candidate_ids) == 0:
        return None
    candidate_ids.sort()
    return candidate_ids[0]


def select_closest_approaching_agent(pair: RolloutPair) -> str | None:
    """The id of the pedestrian that comes nearest the robot at any point in the rollout.

    The deliberate counterpart to `select_non_interacting_agent`, and the reason both exist:
    that function finds an agent whose removal must *not* move the estimate, this one finds the
    agent whose removal *must*. A placebo gate built only from the first half passes for an
    estimator that ignores its inputs entirely, so the negative control needs this selector.

    Distance is measured on the **counterfactual** arm's (undisplaced) pedestrian path against
    the robot position read from the factual arm, for exactly the reason its sibling above
    gives: `_generate_pair` only ever displaces a pedestrian *away* from the robot, so a
    factual-arm closest approach is always `>=` the same pedestrian's counterfactual-arm value.
    Ranking on the factual arm would therefore rank partly on the displacement the caller is
    about to measure — selection on the outcome, and here the direction of that bias is exactly
    the direction that would manufacture a passing negative control. Ranking on the
    counterfactual arm depends only on the undisturbed path, so the same agent is selected at
    every influence level for a fixed seed.

    Unlike `select_non_interacting_agent` this takes no radius, which is a real asymmetry and not
    an oversight: "the nearest pedestrian" is well defined on its own, whereas "non-interacting"
    means nothing until an exclusion distance is stated. A caller that needs *nearest and
    genuinely close* asserts the returned agent's approach distance itself.

    Ties are broken toward the lowest `agent_id` so the choice is deterministic. Returns None
    only when the pair has no pedestrians at all.
    """
    robot = pair.factual.robot
    if robot is None:
        raise ValueError(
            "select_closest_approaching_agent requires a factual arm with a robot; got "
            f"robot_present={pair.factual.robot_present}"
        )
    robot_positions = robot.positions

    nearest_agent_id: str | None = None
    nearest_approach = 0.0
    for pedestrian in pair.counterfactual.pedestrians:
        offsets = pedestrian.positions - robot_positions
        distances = np.sqrt(np.sum(offsets * offsets, axis=1))
        closest_approach = float(np.min(distances))

        if nearest_agent_id is None:
            nearest_agent_id = pedestrian.agent_id
            nearest_approach = closest_approach
        elif closest_approach < nearest_approach:
            nearest_agent_id = pedestrian.agent_id
            nearest_approach = closest_approach
        elif closest_approach == nearest_approach:
            # Exact float equality is intended. Two pedestrians tying to the last bit is
            # vanishingly rare, but "vanishingly rare" is not "deterministic", and a gate that
            # silently depends on tuple order is a gate that changes answer under a fixture
            # reshuffle. Lowest agent_id wins, matching select_non_interacting_agent's sort.
            if pedestrian.agent_id < nearest_agent_id:
                nearest_agent_id = pedestrian.agent_id

    return nearest_agent_id


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


def _closest_approach(pair: RolloutPair, agent_id: str) -> float:
    """`agent_id`'s minimum distance to the robot, over every timestep of `pair`'s counterfactual
    (undisplaced) arm, against the robot position read from `pair`'s factual arm. This is the same
    quantity `select_non_interacting_agent` checks against the exclusion radius internally,
    recomputed here for the agent that pair actually selected so it can be reported in the
    payload — deliberately the counterfactual-arm value, not the factual-arm one, so the reported
    number matches the criterion eligibility was actually judged against."""
    robot = pair.factual.robot
    if robot is None:
        raise ValueError("_closest_approach requires the pair's factual arm to have a robot")
    trajectory = pair.counterfactual.pedestrian_by_id(agent_id)
    offsets = trajectory.positions - robot.positions
    distances = np.sqrt(np.sum(offsets * offsets, axis=1))
    return float(np.min(distances))


def _residual_displacement_m(influence: float, closest_approach_m: float) -> float:
    """The peak lateral displacement the synthetic fixture would still apply to a pedestrian at
    `closest_approach_m` from the robot, at the given `influence`. Uses the same amplitude and
    decay-length constants as `mirn.data.synthetic._generate_pair` so this number tracks the
    fixture exactly rather than duplicating its literals."""
    decay = math.exp(-closest_approach_m / DISPLACEMENT_DECAY_LENGTH_M)
    return influence * DISPLACEMENT_AMPLITUDE_M * decay


@EXPERIMENTS.register("placebo")
class Placebo(Experiment):
    """Delete a non-interacting pedestrian and check the estimate does not move."""

    name = "placebo"
    title = "The placebo test"
    claim = (
        "Deleting a pedestrian that stays far from the robot barely moves the estimate: exactly "
        "zero change when there is no robot effect, and a bounded change otherwise."
    )
    order = 4
    primary_parameters = ("influence", "exclusion_radius_m")

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

        # Selection and removal are per pair: each scene loses its own bystander, found
        # independently from that scene's own counterfactual arm. See the module docstring for
        # why one shared agent_id across every scene is the wrong model.
        removed_agent_ids: dict[str, str] = {}
        closest_approaches: dict[str, float] = {}
        reduced_pairs: list[RolloutPair] = []
        for pair in pairs:
            scene_id = pair.factual.scene_id
            agent_id = select_non_interacting_agent(pair, exclusion_radius_m)
            if agent_id is None:
                raise ValueError(
                    f"scene '{scene_id}' has no pedestrian farther than {exclusion_radius_m} m "
                    "from the robot; lower the exclusion radius and try again"
                )
            removed_agent_ids[scene_id] = agent_id
            closest_approaches[scene_id] = _closest_approach(pair, agent_id)
            reduced_pairs.append(drop_agent(pair, agent_id))
        reduced_estimate = estimator.estimate(tuple(reduced_pairs), seed)

        delta = reduced_estimate.value - full_estimate.value

        # The honest upper bound on residual contamination is the worst (smallest) closest
        # approach among every scene's removed agent, not any one scene's value in isolation.
        worst_scene_id = ""
        worst_closest_approach_m = 0.0
        first_scene = True
        for scene_id in closest_approaches:
            candidate = closest_approaches[scene_id]
            if first_scene or candidate < worst_closest_approach_m:
                worst_scene_id = scene_id
                worst_closest_approach_m = candidate
                first_scene = False
        residual_displacement_m = _residual_displacement_m(influence, worst_closest_approach_m)

        rows: list[dict[str, object]] = []
        full_row: dict[str, object] = {}
        full_row["variant"] = "full"
        full_row["n_pedestrians"] = pairs[0].factual.n_pedestrians
        full_row["value"] = full_estimate.value
        full_row["ci_low"] = full_estimate.ci_low
        full_row["ci_high"] = full_estimate.ci_high
        full_row["units"] = full_estimate.units
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
        reduced_row["units"] = reduced_estimate.units
        reduced_row["delta_vs_full"] = delta
        reduced_row["influence"] = influence
        reduced_row["seed"] = seed
        rows.append(reduced_row)

        frame = pd.DataFrame(rows, columns=list(PLACEBO_COLUMNS))

        payload: dict[str, object] = {}
        payload["removed_agent_ids"] = removed_agent_ids
        payload["exclusion_radius_m"] = exclusion_radius_m
        payload["removed_agent_closest_approach_m"] = worst_closest_approach_m
        payload["removed_agent_residual_displacement_m"] = residual_displacement_m
        payload["worst_case_scene_id"] = worst_scene_id
        payload["delta_vs_full"] = delta
        payload["full_value"] = full_estimate.value
        payload["reduced_value"] = reduced_estimate.value
        payload["influence"] = influence
        payload["note"] = (
            "Synthetic data. Each scene loses its own bystander pedestrian, selected "
            "independently per pair; the removed pedestrians stay outside the exclusion radius "
            "but are weakly interacting, not non-interacting. "
            "removed_agent_closest_approach_m and removed_agent_residual_displacement_m are the "
            f"worst case across all removed agents (scene '{worst_scene_id}'), the honest upper "
            "bound on contamination: at this influence level the fixture still applies that "
            f"agent roughly {residual_displacement_m:.3f} m of peak lateral displacement. Exact "
            "invariance holds only at influence 0.0, where the robot-present and robot-absent "
            "runs follow identical paths step for step; at "
            "influence > 0 this is a bounded sensitivity check, not a proof of zero effect."
        )

        return ExperimentResult(
            experiment_name=self.name,
            seed=seed,
            frame=frame,
            payload=payload,
            method_keys=("paired", "bootstrap_ci"),
        )
