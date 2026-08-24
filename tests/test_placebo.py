"""The placebo test: a first-class gate, not an experiment.

This gate exists because CausalAgents (arXiv:2207.03586) showed that standard forecasters shift
minADE by 25-38% (relative) when provably non-causal agents — agents that could not possibly have
influenced the ego trajectory — are removed from a scene. That is a symptom of estimators that
couple agents through shared model context (attention, social pooling, scene encoding): removing
one agent changes what the model infers about every other agent, even when the removed agent had
no causal role. `PairedCounterfactual` is built specifically to not have this failure mode — each
agent's divergence is computed independently from its own factual/counterfactual path pair, with
no cross-agent coupling — so deleting a non-interacting pedestrian must leave the estimate
unchanged (up to the ordinary dilution of an arithmetic mean losing one term, which vanishes as
the population grows).

Three tests, and the third is load-bearing:

1. `test_paired_estimator_is_exactly_zero_...` — no robot effect at all is reported as no effect
   at all, with a CI covering zero.
2. `test_deleting_a_noninteracting_agent_does_not_move_the_paired_estimate` — the insensitivity
   half. Deleting a bystander the robot never came near must not move the estimate.
3. `test_deleting_a_close_passing_agent_moves_the_paired_estimate` — the **negative control**,
   the sensitivity half.

The negative control protects against the failure the first two tests are structurally blind to.
Tests 1 and 2 both assert that a number does *not* move, so both are passed perfectly by an
estimator that has stopped reading its inputs — one that returns a constant, or that has had its
divergence silently zeroed, or whose per-agent loop quietly iterates over nothing. That is not a
hypothetical class of bug: it is the exact residue of a refactor that breaks the factual /
counterfactual wiring, and it would leave this gate green while making every number on the site
meaningless. A placebo test made only of null results measures nothing. So the third test deletes
a pedestrian that *did* pass close to the robot and asserts the estimate moves, and moves
downward, because the agent removed was carrying the largest share of the measured effect.

The two deletion tests deliberately want opposite population sizes, which reads as an
inconsistency until you see why. Deleting one agent from a mean of N moves it by
`(mean - d_k) / (N - 1)`, an arithmetic dilution every mean-based aggregate exhibits whether or
not the estimator has any causal coupling at all. Test 2 needs that dilution term to be
*negligible* so that any movement it sees is real cross-agent coupling rather than bookkeeping,
so it uses 500 pedestrians and gates at 1e-9. Test 3 needs the opposite: the contribution of the
one deleted agent has to be able to show up in the mean at all, so it uses a small crowd where
`1 / (N - 1)` is large. Raising test 3's population or lowering test 2's would quietly destroy the
property each one is testing.
"""

from __future__ import annotations

import numpy as np

from mirn.data.synthetic import SyntheticAdapter
from mirn.estimator.paired import PairedCounterfactual
from mirn.experiments.placebo import (
    drop_agent,
    select_closest_approaching_agent,
    select_non_interacting_agent,
)

_INTERACTION_RADIUS_M = 6.0

# The negative control's premise check: the agent it deletes must genuinely have passed close to
# the robot, not merely be the least-distant of a uniformly remote crowd. Measured on the
# counterfactual arm, like the selection itself.
_CLOSE_APPROACH_RADIUS_M = 2.0

# The negative control's gate, as a fraction of the full-population estimate. At the pinned seed
# the observed drop is ~49%, so this is roughly 10x headroom — deliberately loose, because the
# number this test defends is "the estimator still responds to its inputs", not a calibrated
# effect size, and a gate that trips on ordinary fixture churn gets loosened rather than
# investigated. 5% is not fitted to seed 0 either: it is below the worst case (6.6%) over a
# 200-seed sweep of this configuration, so reseeding the fixture cannot flake it.
_MIN_NEGATIVE_CONTROL_DROP = 0.05


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

    # Selection is judged on the counterfactual (undisplaced) arm — see
    # mirn.experiments.placebo's module docstring for why — so this check must recompute the
    # distance on that same arm, not the factual (displaced) one, to actually test the function's
    # contract.
    robot_positions = pair.factual.robot.positions
    removed_trajectory = pair.counterfactual.pedestrian_by_id(removed_agent_id)
    diff = removed_trajectory.positions - robot_positions
    min_distance = float(np.min(np.sqrt(np.sum(diff * diff, axis=1))))
    assert min_distance > _INTERACTION_RADIUS_M

    estimator = PairedCounterfactual(divergence="ade")
    before = estimator.estimate(pairs, seed=1)

    pair_without_agent = drop_agent(pair, removed_agent_id)
    after = estimator.estimate((pair_without_agent,), seed=1)

    assert abs(after.value - before.value) < 1e-9


def test_deleting_a_close_passing_agent_moves_the_paired_estimate() -> None:
    """The negative control. Deleting the pedestrian that *did* pass close to the robot must drop
    the paired estimate by at least 5%.

    Guards against the estimator going deaf. The two tests above both assert a number stays put,
    so both stay green for an estimator that returns a constant, has had its divergence zeroed,
    or is averaging over an empty agent list — precisely the wreckage a refactor of the
    factual/counterfactual wiring leaves behind. This test is the only one here that fails in
    that case, which is why the gate is not complete without it.

    Three choices in the fixture, each load-bearing:

    - **Six pedestrians, not 500.** The exact opposite of the test above, on purpose, and the
      module docstring explains the apparent inconsistency: deleting one agent from a mean of N
      moves it by `(mean - d_k) / (N - 1)`, so the test that wants to see no movement needs that
      factor tiny and the test that wants to see movement needs it large. At N=500 the strongest
      possible causal signal from one agent is diluted below the noise of the assertion.
    - **120 steps, not the 20 above.** At 20 steps (2 s at ~1.2 m/s) pedestrians travel ~2.3 m
      from `x ~= 0` and never reach the robot at `x = 10`, so the nearest agent in the crowd is
      still ~7.5 m away and "passed close to the robot" describes nobody. 120 steps carries them
      to `x ~= 14`, actually past the robot, so the closest approach is set by their lateral
      offset and the premise of the test is real. `_CLOSE_APPROACH_RADIUS_M` asserts this rather
      than trusting it.
    - **A 1 m displacement decay length, not the fixture default of 3 m.** Against a 12 m box, a
      3 m decay displaces *every* pedestrian appreciably and no single one dominates the mean, so
      removing the nearest is barely distinguishable from removing any other — the test would be
      measuring arithmetic dilution and calling it sensitivity. Shortening the decay makes
      proximity to the robot the thing that determines an agent's contribution, which is the
      premise the negative control is built on. At the pinned seed the selected agent's ADE is
      ~0.067 m against ~0.002 m for the far ones.

    The drop must be downward, not merely nonzero. Removing the largest term from a mean can only
    lower it, so direction is a free extra assertion that catches sign and pairing-order errors a
    magnitude-only check would wave through.
    """
    adapter = SyntheticAdapter(
        n_scenes=1,
        n_pedestrians=6,
        n_steps=120,
        seed=0,
        displacement_decay_length_m=1.0,
    )
    pairs = adapter.rollout_pairs_with_influence(1.0)
    pair = pairs[0]

    removed_agent_id = select_closest_approaching_agent(pair)
    assert removed_agent_id is not None

    # Selection is judged on the counterfactual (undisplaced) arm, for the same reason the
    # non-interacting test gives: the fixture displaces pedestrians away from the robot, so
    # ranking on the factual arm would rank partly on the displacement being measured. Here that
    # bias runs in the direction that would manufacture a pass, so recompute on the
    # counterfactual arm to actually check the selector's contract.
    robot_positions = pair.factual.robot.positions
    removed_trajectory = pair.counterfactual.pedestrian_by_id(removed_agent_id)
    diff = removed_trajectory.positions - robot_positions
    min_distance = float(np.min(np.sqrt(np.sum(diff * diff, axis=1))))
    assert min_distance < _CLOSE_APPROACH_RADIUS_M

    estimator = PairedCounterfactual(divergence="ade")
    before = estimator.estimate(pairs, seed=1)

    pair_without_agent = drop_agent(pair, removed_agent_id)
    after = estimator.estimate((pair_without_agent,), seed=1)

    assert before.value > 0.0
    assert after.value < before.value

    relative_drop = (before.value - after.value) / before.value
    assert relative_drop > _MIN_NEGATIVE_CONTROL_DROP
