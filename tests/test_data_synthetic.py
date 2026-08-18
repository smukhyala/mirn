from __future__ import annotations

import numpy as np

from mirn.contracts import RolloutPair
from mirn.data.synthetic import SyntheticAdapter


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
