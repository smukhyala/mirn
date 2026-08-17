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

from mirn.data.synthetic import SyntheticAdapter
from mirn.estimator.paired import PairedCounterfactual
from mirn.experiments.placebo import drop_agent, select_non_interacting_agent

_INTERACTION_RADIUS_M = 6.0


def test_paired_estimator_is_exactly_zero_and_ci_contains_zero_at_zero_influence() -> None:
    """The placebo condition: no robot effect at all must be reported as no effect at all."""
    adapter = SyntheticAdapter(n_scenes=4, n_pedestrians=8, n_steps=30, seed=0)
    pairs = adapter.rollout_pairs_with_influence(0.0)

    estimator = PairedCounterfactual(divergence="ade")
    result = estimator.estimate(pairs, seed=1)

    assert result.value == 0.0
    assert result.ci_low <= 0.0 <= result.ci_high


def test_deleting_a_noninteracting_agent_does_not_move_the_paired_estimate() -> None:
    """Deleting a pedestrian who is never within 6 m of the robot must change the paired
    estimate by less than 1e-9.

    A large pedestrian population (500) and a small but non-zero influence keep the *average*
    per-agent effect small enough that even the ordinary arithmetic-mean dilution from losing one
    term (which any mean-based aggregate exhibits, causal coupling or not) falls far below the
    1e-9 gate — while still exercising the real synthetic robot-influence dynamics rather than a
    hand-constructed zero. Task 3's `SyntheticAdapter` is used directly (available on this
    branch); influence is enabled (non-zero), unlike the placebo sub-test above.

    Pedestrian selection and removal go through `mirn.experiments.placebo`'s shared helpers
    (`select_non_interacting_agent`, `drop_agent`) so this gate and the placebo experiment can
    never drift apart.
    """
    adapter = SyntheticAdapter(n_scenes=1, n_pedestrians=500, n_steps=20, seed=0)
    pairs = adapter.rollout_pairs_with_influence(1e-6)
    pair = pairs[0]

    removed_agent_id = select_non_interacting_agent(pair, _INTERACTION_RADIUS_M)
    assert removed_agent_id is not None

    robot_positions = pair.factual.robot.positions
    removed_trajectory = pair.factual.pedestrian_by_id(removed_agent_id)
    diff = removed_trajectory.positions - robot_positions
    min_distance = float(np.min(np.sqrt(np.sum(diff * diff, axis=1))))
    assert min_distance > _INTERACTION_RADIUS_M

    estimator = PairedCounterfactual(divergence="ade")
    before = estimator.estimate(pairs, seed=1)

    pair_without_agent = drop_agent(pair, removed_agent_id)
    after = estimator.estimate((pair_without_agent,), seed=1)

    assert abs(after.value - before.value) < 1e-9
