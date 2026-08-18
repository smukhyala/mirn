from __future__ import annotations

import numpy as np
import pytest

from mirn.contracts import RolloutPair
from mirn.data.synthetic import (
    BOX_HEIGHT_M,
    BOX_WIDTH_M,
    DISPLACEMENT_AMPLITUDE_M,
    DISPLACEMENT_DECAY_LENGTH_M,
    SyntheticAdapter,
)


def _mean_paired_displacement(pairs: tuple[RolloutPair, ...]) -> float:
    displacement_values: list[float] = []
    for pair in pairs:
        for factual_traj, counterfactual_traj in pair.paired_agents():
            diff = factual_traj.positions - counterfactual_traj.positions
            step_distances = np.sqrt(np.sum(diff * diff, axis=1))
            for step_distance in step_distances:
                displacement_values.append(float(step_distance))
    return float(np.mean(np.array(displacement_values, dtype=np.float64)))


def test_zero_influence_arms_are_bitwise_identical() -> None:
    adapter = SyntheticAdapter(n_scenes=3, n_pedestrians=5, n_steps=20, seed=7)
    pairs = adapter.rollout_pairs_with_influence(0.0)

    assert len(pairs) == 3
    for pair in pairs:
        for factual_traj, counterfactual_traj in pair.paired_agents():
            assert np.array_equal(factual_traj.positions, counterfactual_traj.positions)


def test_increasing_influence_strictly_increases_mean_displacement() -> None:
    adapter = SyntheticAdapter(n_scenes=4, n_pedestrians=8, n_steps=30, seed=3)

    low_influence_pairs = adapter.rollout_pairs_with_influence(0.5)
    high_influence_pairs = adapter.rollout_pairs_with_influence(2.0)

    mean_low = _mean_paired_displacement(low_influence_pairs)
    mean_high = _mean_paired_displacement(high_influence_pairs)

    assert mean_high > mean_low


def test_all_generated_pairs_construct_without_raising() -> None:
    adapter = SyntheticAdapter(n_scenes=6, n_pedestrians=10, n_steps=40, seed=11)

    for influence in (0.0, 0.25, 1.0, 3.0):
        pairs = adapter.rollout_pairs_with_influence(influence)
        assert len(pairs) == 6
        for pair in pairs:
            assert pair.factual.robot_present is True
            assert pair.counterfactual.robot_present is False


def test_default_rollout_pairs_matches_default_influence() -> None:
    adapter = SyntheticAdapter(n_scenes=2, n_pedestrians=4, n_steps=15, seed=9)

    default_pairs = adapter.rollout_pairs()
    explicit_pairs = adapter.rollout_pairs_with_influence(1.0)

    for default_pair, explicit_pair in zip(default_pairs, explicit_pairs):
        for (fd, cd), (fe, ce) in zip(
            default_pair.paired_agents(), explicit_pair.paired_agents()
        ):
            assert np.array_equal(fd.positions, fe.positions)
            assert np.array_equal(cd.positions, ce.positions)


def test_same_seed_gives_identical_arrays() -> None:
    adapter_a = SyntheticAdapter(n_scenes=2, n_pedestrians=4, n_steps=15, seed=42)
    adapter_b = SyntheticAdapter(n_scenes=2, n_pedestrians=4, n_steps=15, seed=42)

    pairs_a = adapter_a.rollout_pairs_with_influence(1.0)
    pairs_b = adapter_b.rollout_pairs_with_influence(1.0)

    for pair_a, pair_b in zip(pairs_a, pairs_b):
        for (fa, ca), (fb, cb) in zip(pair_a.paired_agents(), pair_b.paired_agents()):
            assert np.array_equal(fa.positions, fb.positions)
            assert np.array_equal(ca.positions, cb.positions)


def test_different_seed_gives_different_arrays() -> None:
    adapter_a = SyntheticAdapter(n_scenes=1, n_pedestrians=4, n_steps=15, seed=1)
    adapter_b = SyntheticAdapter(n_scenes=1, n_pedestrians=4, n_steps=15, seed=2)

    pairs_a = adapter_a.rollout_pairs_with_influence(1.0)
    pairs_b = adapter_b.rollout_pairs_with_influence(1.0)

    factual_a = pairs_a[0].factual.pedestrians[0].positions
    factual_b = pairs_b[0].factual.pedestrians[0].positions
    assert not np.array_equal(factual_a, factual_b)


def test_load_and_characterize_conditions() -> None:
    adapter = SyntheticAdapter(n_scenes=3, n_pedestrians=5, n_steps=10, seed=0)

    assert adapter.conditions() == ("factual", "counterfactual")

    factual_scenes = adapter.load("factual")
    counterfactual_scenes = adapter.load("counterfactual")
    assert len(factual_scenes) == 3
    assert len(counterfactual_scenes) == 3
    for scene in factual_scenes:
        assert scene.robot_present is True
    for scene in counterfactual_scenes:
        assert scene.robot_present is False

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
    assert len(frame) == 2


def test_default_settings_reproduce_the_previous_trajectories_bitwise() -> None:
    """The whole rest of the suite depends on these exact numbers. Not allclose — array_equal."""
    adapter = SyntheticAdapter(n_scenes=3, n_pedestrians=12, n_steps=60, seed=0)
    explicit = SyntheticAdapter(
        n_scenes=3,
        n_pedestrians=12,
        n_steps=60,
        seed=0,
        robot_position=(BOX_WIDTH_M / 2.0, BOX_HEIGHT_M / 2.0),
        displacement_amplitude_m=DISPLACEMENT_AMPLITUDE_M,
        displacement_decay_length_m=DISPLACEMENT_DECAY_LENGTH_M,
    )
    default_pairs = adapter.rollout_pairs_with_influence(1.0)
    explicit_pairs = explicit.rollout_pairs_with_influence(1.0)
    for pair_index in range(len(default_pairs)):
        default_agents = default_pairs[pair_index].paired_agents()
        explicit_agents = explicit_pairs[pair_index].paired_agents()
        for agent_index in range(len(default_agents)):
            assert np.array_equal(
                default_agents[agent_index][0].positions,
                explicit_agents[agent_index][0].positions,
            )


def test_a_larger_amplitude_pushes_people_further() -> None:
    weak = SyntheticAdapter(n_scenes=2, seed=0, displacement_amplitude_m=0.5)
    strong = SyntheticAdapter(n_scenes=2, seed=0, displacement_amplitude_m=3.0)
    weak_gap = _mean_arm_gap(weak.rollout_pairs_with_influence(1.0))
    strong_gap = _mean_arm_gap(strong.rollout_pairs_with_influence(1.0))
    assert strong_gap > weak_gap


def test_a_longer_reach_pushes_more_people() -> None:
    short = SyntheticAdapter(n_scenes=2, seed=0, displacement_decay_length_m=1.0)
    long_reach = SyntheticAdapter(n_scenes=2, seed=0, displacement_decay_length_m=6.0)
    assert _mean_arm_gap(long_reach.rollout_pairs_with_influence(1.0)) > _mean_arm_gap(
        short.rollout_pairs_with_influence(1.0)
    )


def test_moving_the_robot_changes_who_is_affected() -> None:
    centre = SyntheticAdapter(n_scenes=2, seed=0)
    corner = SyntheticAdapter(n_scenes=2, seed=0, robot_position=(2.0, 1.0))
    centre_pairs = centre.rollout_pairs_with_influence(1.0)
    corner_pairs = corner.rollout_pairs_with_influence(1.0)
    centre_first = centre_pairs[0].paired_agents()[0][0].positions
    corner_first = corner_pairs[0].paired_agents()[0][0].positions
    assert not np.array_equal(centre_first, corner_first)


def test_the_counterfactual_arm_never_depends_on_robot_settings() -> None:
    """The robot-absent world must be identical no matter how the robot is configured — the floor
    cache keys on this and would silently return a wrong value otherwise."""
    baseline = SyntheticAdapter(n_scenes=2, seed=0)
    altered = SyntheticAdapter(
        n_scenes=2, seed=0, robot_position=(3.0, 9.0),
        displacement_amplitude_m=4.0, displacement_decay_length_m=1.0,
    )
    baseline_pairs = baseline.rollout_pairs_with_influence(1.0)
    altered_pairs = altered.rollout_pairs_with_influence(1.0)
    for pair_index in range(len(baseline_pairs)):
        baseline_agents = baseline_pairs[pair_index].paired_agents()
        altered_agents = altered_pairs[pair_index].paired_agents()
        for agent_index in range(len(baseline_agents)):
            assert np.array_equal(
                baseline_agents[agent_index][1].positions,
                altered_agents[agent_index][1].positions,
            )


def test_rejects_a_non_positive_decay_length() -> None:
    with pytest.raises(ValueError, match="displacement_decay_length_m"):
        SyntheticAdapter(displacement_decay_length_m=0.0)


def test_rejects_a_negative_amplitude() -> None:
    with pytest.raises(ValueError, match="displacement_amplitude_m"):
        SyntheticAdapter(displacement_amplitude_m=-1.0)


def test_rejects_a_robot_outside_the_box() -> None:
    with pytest.raises(ValueError, match="robot_position"):
        SyntheticAdapter(robot_position=(999.0, 1.0))


def _mean_arm_gap(pairs: tuple) -> float:
    totals: list[float] = []
    for pair in pairs:
        for factual_traj, counterfactual_traj in pair.paired_agents():
            offsets = factual_traj.positions - counterfactual_traj.positions
            distances = np.sqrt(np.sum(offsets * offsets, axis=1))
            totals.append(float(np.mean(distances)))
    return float(np.mean(np.asarray(totals)))
