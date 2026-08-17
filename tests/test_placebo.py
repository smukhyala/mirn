"""The placebo test: a first-class gate, not an experiment.

This test exists because CausalAgents (arXiv:2207.03586) showed that standard forecasters shift
minADE by 25-38% (relative) when provably non-causal agents — agents that could not possibly have
influenced the ego trajectory — are removed from a scene. That is a symptom of estimators that
couple agents through shared model context (attention, social pooling, scene encoding): removing
one agent changes what the model infers about every other agent, even when the removed agent had
no causal role. `PairedCounterfactual` is built specifically to not have this failure mode — each
agent's divergence is computed independently from its own factual/counterfactual path pair, with
no cross-agent coupling — so deleting a non-interacting pedestrian must leave the estimate
unchanged (up to the ordinary dilution of an arithmetic mean losing one term, which vanishes as
the population grows). This test runs in CI on synthetic data and is expected to be the test that
catches real bugs if a future refactor accidentally introduces cross-agent coupling into the
paired estimator.
"""

from __future__ import annotations

import numpy as np

from mirn.contracts import RolloutPair, Scene, Trajectory
from mirn.data.synthetic import SyntheticAdapter
from mirn.estimator.paired import PairedCounterfactual

_INTERACTION_RADIUS_M = 6.0


def test_paired_estimator_is_exactly_zero_and_ci_contains_zero_at_zero_influence() -> None:
    """The placebo condition: no robot effect at all must be reported as no effect at all."""
    adapter = SyntheticAdapter(n_scenes=4, n_pedestrians=8, n_steps=30, seed=0)
    pairs = adapter.rollout_pairs_with_influence(0.0)

    estimator = PairedCounterfactual(divergence="ade")
    result = estimator.estimate(pairs, seed=1)

    assert result.value == 0.0
    assert result.ci_low <= 0.0 <= result.ci_high


def _farthest_pedestrian_agent_id(pair: RolloutPair) -> tuple[str, float]:
    """The agent_id of the factual-arm pedestrian whose minimum distance to the robot, over its
    entire trajectory, is largest — i.e. the pedestrian least plausibly influenced by the robot.
    """
    robot_positions = pair.factual.robot.positions

    best_agent_id = ""
    best_min_distance = -1.0
    for pedestrian in pair.factual.pedestrians:
        diff = pedestrian.positions - robot_positions
        distance = np.sqrt(np.sum(diff * diff, axis=1))
        min_distance = float(np.min(distance))
        if min_distance > best_min_distance:
            best_min_distance = min_distance
            best_agent_id = pedestrian.agent_id

    return best_agent_id, best_min_distance


def _pair_without_agent(pair: RolloutPair, removed_agent_id: str) -> RolloutPair:
    """`pair` with `removed_agent_id` deleted from both the factual and counterfactual arms."""
    factual_pedestrians: list[Trajectory] = []
    for pedestrian in pair.factual.pedestrians:
        if pedestrian.agent_id != removed_agent_id:
            factual_pedestrians.append(pedestrian)

    counterfactual_pedestrians: list[Trajectory] = []
    for pedestrian in pair.counterfactual.pedestrians:
        if pedestrian.agent_id != removed_agent_id:
            counterfactual_pedestrians.append(pedestrian)

    new_factual = Scene(
        scene_id=pair.factual.scene_id,
        pedestrians=tuple(factual_pedestrians),
        robot=pair.factual.robot,
        robot_present=pair.factual.robot_present,
        source=pair.factual.source,
        seed=pair.factual.seed,
    )
    new_counterfactual = Scene(
        scene_id=pair.counterfactual.scene_id,
        pedestrians=tuple(counterfactual_pedestrians),
        robot=pair.counterfactual.robot,
        robot_present=pair.counterfactual.robot_present,
        source=pair.counterfactual.source,
        seed=pair.counterfactual.seed,
    )
    return RolloutPair(factual=new_factual, counterfactual=new_counterfactual)


def test_deleting_a_noninteracting_agent_does_not_move_the_paired_estimate() -> None:
    """Deleting a pedestrian who is never within 6 m of the robot must change the paired
    estimate by less than 1e-9.

    A large pedestrian population (500) and a small but non-zero influence keep the *average*
    per-agent effect small enough that even the ordinary arithmetic-mean dilution from losing one
    term (which any mean-based aggregate exhibits, causal coupling or not) falls far below the
    1e-9 gate — while still exercising the real synthetic robot-influence dynamics rather than a
    hand-constructed zero. Task 3's `SyntheticAdapter` is used directly (available on this
    branch); influence is enabled (non-zero), unlike the placebo sub-test above.
    """
    adapter = SyntheticAdapter(n_scenes=1, n_pedestrians=500, n_steps=20, seed=0)
    pairs = adapter.rollout_pairs_with_influence(1e-6)
    pair = pairs[0]

    removed_agent_id, min_distance = _farthest_pedestrian_agent_id(pair)
    assert min_distance > _INTERACTION_RADIUS_M

    estimator = PairedCounterfactual(divergence="ade")
    before = estimator.estimate(pairs, seed=1)

    pair_without_agent = _pair_without_agent(pair, removed_agent_id)
    after = estimator.estimate((pair_without_agent,), seed=1)

    assert abs(after.value - before.value) < 1e-9
