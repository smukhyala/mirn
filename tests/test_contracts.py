from __future__ import annotations

import math

import numpy as np
import pytest

from mirn.contracts import PerturbationEstimate, RolloutPair, Scene, Trajectory


def straight_line_trajectory(
    agent_id: str,
    t0: float,
    dt: float,
    n_steps: int,
    origin: tuple[float, float],
    velocity: tuple[float, float],
) -> Trajectory:
    positions = np.empty((n_steps, 2), dtype=np.float64)
    for step in range(n_steps):
        positions[step, 0] = origin[0] + velocity[0] * step
        positions[step, 1] = origin[1] + velocity[1] * step
    return Trajectory(agent_id=agent_id, positions=positions, t0=t0, dt=dt)


def make_scene(
    scene_id: str,
    pedestrians: tuple[Trajectory, ...],
    robot: Trajectory | None,
    robot_present: bool,
    seed: int,
) -> Scene:
    return Scene(
        scene_id=scene_id,
        pedestrians=pedestrians,
        robot=robot,
        robot_present=robot_present,
        source="synthetic-test",
        seed=seed,
    )


# --- Trajectory -------------------------------------------------------------------------------


def test_trajectory_positions_must_be_2d() -> None:
    with pytest.raises(ValueError):
        Trajectory(agent_id="a", positions=np.zeros((3, 2, 1)), t0=0.0, dt=1.0)


def test_trajectory_positions_must_have_two_columns() -> None:
    with pytest.raises(ValueError):
        Trajectory(agent_id="a", positions=np.zeros((3, 3)), t0=0.0, dt=1.0)


def test_trajectory_positions_must_have_at_least_one_row() -> None:
    with pytest.raises(ValueError):
        Trajectory(agent_id="a", positions=np.zeros((0, 2)), t0=0.0, dt=1.0)


def test_trajectory_dt_must_be_positive() -> None:
    with pytest.raises(ValueError):
        Trajectory(agent_id="a", positions=np.zeros((3, 2)), t0=0.0, dt=0.0)
    with pytest.raises(ValueError):
        Trajectory(agent_id="a", positions=np.zeros((3, 2)), t0=0.0, dt=-1.0)


def test_trajectory_dt_must_be_finite() -> None:
    with pytest.raises(ValueError):
        Trajectory(agent_id="a", positions=np.zeros((3, 2)), t0=0.0, dt=math.inf)
    with pytest.raises(ValueError):
        Trajectory(agent_id="a", positions=np.zeros((3, 2)), t0=0.0, dt=math.nan)


def test_trajectory_t0_must_be_finite() -> None:
    with pytest.raises(ValueError):
        Trajectory(agent_id="a", positions=np.zeros((3, 2)), t0=math.inf, dt=1.0)
    with pytest.raises(ValueError):
        Trajectory(agent_id="a", positions=np.zeros((3, 2)), t0=math.nan, dt=1.0)


def test_trajectory_positions_must_be_finite() -> None:
    bad_positions = np.zeros((3, 2))
    bad_positions[1, 0] = math.nan
    with pytest.raises(ValueError):
        Trajectory(agent_id="a", positions=bad_positions, t0=0.0, dt=1.0)

    bad_positions_inf = np.zeros((3, 2))
    bad_positions_inf[2, 1] = math.inf
    with pytest.raises(ValueError):
        Trajectory(agent_id="a", positions=bad_positions_inf, t0=0.0, dt=1.0)


def test_trajectory_properties() -> None:
    trajectory = straight_line_trajectory(
        agent_id="p1", t0=10.0, dt=0.5, n_steps=5, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    assert trajectory.n_steps == 5
    assert trajectory.duration == 5 * 0.5
    expected_times = 10.0 + 0.5 * np.arange(5)
    np.testing.assert_array_equal(trajectory.times, expected_times)


def test_trajectory_positions_array_is_read_only() -> None:
    trajectory = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    assert trajectory.positions.flags.writeable is False
    with pytest.raises(ValueError):
        trajectory.positions[0, 0] = 99.0


def test_trajectory_positions_are_float64_and_copied() -> None:
    raw = np.zeros((3, 2), dtype=np.float32)
    trajectory = Trajectory(agent_id="a", positions=raw, t0=0.0, dt=1.0)
    assert trajectory.positions.dtype == np.float64
    # Mutating the caller's original array must not affect the stored copy.
    raw[0, 0] = 123.0
    assert trajectory.positions[0, 0] == 0.0


def test_resample_to_rejects_non_positive_dt() -> None:
    trajectory = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 1.0)
    )
    with pytest.raises(ValueError):
        trajectory.resample_to(0.0)
    with pytest.raises(ValueError):
        trajectory.resample_to(-0.5)


def test_resample_to_preserves_agent_id_and_t0() -> None:
    trajectory = straight_line_trajectory(
        agent_id="p1", t0=3.0, dt=1.0, n_steps=5, origin=(0.0, 0.0), velocity=(1.0, 2.0)
    )
    resampled = trajectory.resample_to(0.25)
    assert resampled.agent_id == trajectory.agent_id
    assert resampled.t0 == trajectory.t0
    assert resampled.dt == 0.25


def test_resample_to_same_dt_reproduces_original_exactly() -> None:
    trajectory = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=5, origin=(0.0, 0.0), velocity=(1.0, -1.0)
    )
    resampled = trajectory.resample_to(1.0)
    np.testing.assert_array_equal(resampled.times, trajectory.times)
    np.testing.assert_array_equal(resampled.positions, trajectory.positions)


def test_resample_to_round_trips_a_straight_line_exactly() -> None:
    original = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=5, origin=(2.0, -1.0), velocity=(0.5, 1.5)
    )
    # 0.5 evenly divides the original 1.0 grid, so every original sample is exactly
    # reproduced by the down-sample and the subsequent up-sample back to dt=1.0 hits
    # exact original grid nodes both times.
    down = original.resample_to(0.5)
    back = down.resample_to(1.0)
    np.testing.assert_array_equal(back.times, original.times)
    np.testing.assert_array_equal(back.positions, original.positions)
    assert back.t0 == original.t0
    assert back.agent_id == original.agent_id


def test_resample_to_span_does_not_exceed_original() -> None:
    trajectory = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=5, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    resampled = trajectory.resample_to(0.3)
    assert resampled.times[-1] <= trajectory.times[-1] + 1e-9
    assert resampled.times[0] == trajectory.times[0]


# --- Scene --------------------------------------------------------------------------------------


def test_scene_robot_present_true_requires_robot() -> None:
    pedestrian = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    with pytest.raises(ValueError):
        make_scene("s1", (pedestrian,), robot=None, robot_present=True, seed=0)


def test_scene_robot_present_false_requires_no_robot() -> None:
    pedestrian = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    robot = straight_line_trajectory(
        agent_id="robot", t0=0.0, dt=1.0, n_steps=3, origin=(5.0, 5.0), velocity=(0.0, 0.0)
    )
    with pytest.raises(ValueError):
        make_scene("s1", (pedestrian,), robot=robot, robot_present=False, seed=0)


def test_scene_rejects_inconsistent_pedestrian_dt() -> None:
    p1 = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    p2 = straight_line_trajectory(
        agent_id="p2", t0=0.0, dt=0.5, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    with pytest.raises(ValueError):
        make_scene("s1", (p1, p2), robot=None, robot_present=False, seed=0)


def test_scene_rejects_duplicate_agent_ids() -> None:
    p1 = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    p1_dup = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(9.0, 9.0), velocity=(0.0, 1.0)
    )
    with pytest.raises(ValueError):
        make_scene("s1", (p1, p1_dup), robot=None, robot_present=False, seed=0)


def test_scene_n_pedestrians_and_lookup() -> None:
    p1 = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    p2 = straight_line_trajectory(
        agent_id="p2", t0=0.0, dt=1.0, n_steps=3, origin=(1.0, 1.0), velocity=(0.0, 1.0)
    )
    scene = make_scene("s1", (p1, p2), robot=None, robot_present=False, seed=0)
    assert scene.n_pedestrians == 2
    assert scene.pedestrian_by_id("p2") is p2
    with pytest.raises(KeyError):
        scene.pedestrian_by_id("missing")


# --- RolloutPair ----------------------------------------------------------------------------


def build_pair(
    influence: float = 0.0,
) -> tuple[RolloutPair, Trajectory, Trajectory]:
    p1_factual = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=4, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    p1_counterfactual_positions = p1_factual.positions.copy()
    for step in range(p1_counterfactual_positions.shape[0]):
        p1_counterfactual_positions[step, 1] += influence
    p1_counterfactual = Trajectory(
        agent_id="p1", positions=p1_counterfactual_positions, t0=0.0, dt=1.0
    )

    robot = straight_line_trajectory(
        agent_id="robot", t0=0.0, dt=1.0, n_steps=4, origin=(5.0, 5.0), velocity=(0.0, 0.0)
    )

    factual_scene = make_scene(
        "s1", (p1_factual,), robot=robot, robot_present=True, seed=42
    )
    counterfactual_scene = make_scene(
        "s1", (p1_counterfactual,), robot=None, robot_present=False, seed=42
    )
    pair = RolloutPair(factual=factual_scene, counterfactual=counterfactual_scene)
    return pair, p1_factual, p1_counterfactual


def test_rollout_pair_valid_construction() -> None:
    pair, _, _ = build_pair(influence=0.0)
    assert pair.factual.seed == pair.counterfactual.seed


def test_rollout_pair_rejects_mismatched_seed() -> None:
    pedestrian_factual = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    pedestrian_counterfactual = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    robot = straight_line_trajectory(
        agent_id="robot", t0=0.0, dt=1.0, n_steps=3, origin=(5.0, 5.0), velocity=(0.0, 0.0)
    )
    factual = make_scene("s1", (pedestrian_factual,), robot=robot, robot_present=True, seed=1)
    counterfactual = make_scene(
        "s1", (pedestrian_counterfactual,), robot=None, robot_present=False, seed=2
    )
    with pytest.raises(ValueError):
        RolloutPair(factual=factual, counterfactual=counterfactual)


def test_rollout_pair_rejects_robot_present_counterfactual() -> None:
    pedestrian = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    robot = straight_line_trajectory(
        agent_id="robot", t0=0.0, dt=1.0, n_steps=3, origin=(5.0, 5.0), velocity=(0.0, 0.0)
    )
    factual = make_scene("s1", (pedestrian,), robot=robot, robot_present=True, seed=1)
    counterfactual_bad = make_scene(
        "s1", (pedestrian,), robot=robot, robot_present=True, seed=1
    )
    with pytest.raises(ValueError):
        RolloutPair(factual=factual, counterfactual=counterfactual_bad)


def test_rollout_pair_rejects_robot_absent_factual() -> None:
    pedestrian = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    factual_bad = make_scene("s1", (pedestrian,), robot=None, robot_present=False, seed=1)
    counterfactual = make_scene("s1", (pedestrian,), robot=None, robot_present=False, seed=1)
    with pytest.raises(ValueError):
        RolloutPair(factual=factual_bad, counterfactual=counterfactual)


def test_rollout_pair_rejects_mismatched_shared_agent_dt() -> None:
    # Scene.__post_init__ only enforces dt-consistency *within* one scene (each scene here has a
    # single pedestrian, so that check is trivially satisfied). RolloutPair.__post_init__ is the
    # only guard against the same shared agent running on two different clocks across arms.
    pedestrian_factual = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    pedestrian_counterfactual = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=0.5, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    robot = straight_line_trajectory(
        agent_id="robot", t0=0.0, dt=1.0, n_steps=3, origin=(5.0, 5.0), velocity=(0.0, 0.0)
    )
    factual = make_scene("s1", (pedestrian_factual,), robot=robot, robot_present=True, seed=1)
    counterfactual = make_scene(
        "s1", (pedestrian_counterfactual,), robot=None, robot_present=False, seed=1
    )
    with pytest.raises(ValueError) as excinfo:
        RolloutPair(factual=factual, counterfactual=counterfactual)
    message = str(excinfo.value)
    assert "identical dt" in message
    assert "shared agent 'p1'" in message
    assert "1.0 != 0.5" in message


def test_rollout_pair_rejects_disjoint_agent_sets() -> None:
    pedestrian_a = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    pedestrian_b = straight_line_trajectory(
        agent_id="p2", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    robot = straight_line_trajectory(
        agent_id="robot", t0=0.0, dt=1.0, n_steps=3, origin=(5.0, 5.0), velocity=(0.0, 0.0)
    )
    factual = make_scene("s1", (pedestrian_a,), robot=robot, robot_present=True, seed=1)
    counterfactual = make_scene(
        "s1", (pedestrian_b,), robot=None, robot_present=False, seed=1
    )
    with pytest.raises(ValueError):
        RolloutPair(factual=factual, counterfactual=counterfactual)


def test_rollout_pair_rejects_differing_initial_position() -> None:
    pedestrian_factual = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    pedestrian_counterfactual = straight_line_trajectory(
        agent_id="p1", t0=0.0, dt=1.0, n_steps=3, origin=(0.1, 0.0), velocity=(1.0, 0.0)
    )
    robot = straight_line_trajectory(
        agent_id="robot", t0=0.0, dt=1.0, n_steps=3, origin=(5.0, 5.0), velocity=(0.0, 0.0)
    )
    factual = make_scene("s1", (pedestrian_factual,), robot=robot, robot_present=True, seed=1)
    counterfactual = make_scene(
        "s1", (pedestrian_counterfactual,), robot=None, robot_present=False, seed=1
    )
    with pytest.raises(ValueError):
        RolloutPair(factual=factual, counterfactual=counterfactual)


def test_paired_agents_ordering() -> None:
    p_b_factual = straight_line_trajectory(
        agent_id="b", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    p_a_factual = straight_line_trajectory(
        agent_id="a", t0=0.0, dt=1.0, n_steps=3, origin=(2.0, 0.0), velocity=(1.0, 0.0)
    )
    p_b_counterfactual = straight_line_trajectory(
        agent_id="b", t0=0.0, dt=1.0, n_steps=3, origin=(0.0, 0.0), velocity=(1.0, 0.0)
    )
    p_a_counterfactual = straight_line_trajectory(
        agent_id="a", t0=0.0, dt=1.0, n_steps=3, origin=(2.0, 0.0), velocity=(1.0, 0.0)
    )
    robot = straight_line_trajectory(
        agent_id="robot", t0=0.0, dt=1.0, n_steps=3, origin=(5.0, 5.0), velocity=(0.0, 0.0)
    )
    factual = make_scene(
        "s1", (p_b_factual, p_a_factual), robot=robot, robot_present=True, seed=1
    )
    counterfactual = make_scene(
        "s1", (p_b_counterfactual, p_a_counterfactual), robot=None, robot_present=False, seed=1
    )
    pair = RolloutPair(factual=factual, counterfactual=counterfactual)
    pairs = pair.paired_agents()
    assert len(pairs) == 2
    assert pairs[0][0].agent_id == "a"
    assert pairs[1][0].agent_id == "b"


# --- PerturbationEstimate --------------------------------------------------------------------


def make_estimate(**overrides: object) -> PerturbationEstimate:
    fields: dict[str, object] = {
        "value": 1.0,
        "ci_low": 0.5,
        "ci_high": 1.5,
        "units": "metres",
        "identification": "shared seed and exogenous noise across arms",
        "n_samples": 10,
        "divergence_name": "ade",
        "estimator_name": "paired",
    }
    for key, value in overrides.items():
        fields[key] = value
    return PerturbationEstimate(**fields)  # type: ignore[arg-type]


def test_perturbation_estimate_valid_construction() -> None:
    estimate = make_estimate()
    assert estimate.value == 1.0


def test_perturbation_estimate_rejects_bad_units() -> None:
    with pytest.raises(ValueError):
        make_estimate(units="km")


def test_perturbation_estimate_rejects_ci_ordering_violation() -> None:
    with pytest.raises(ValueError):
        make_estimate(ci_low=2.0, value=1.0, ci_high=3.0)
    with pytest.raises(ValueError):
        make_estimate(ci_low=0.0, value=1.0, ci_high=0.5)


def test_perturbation_estimate_rejects_empty_identification() -> None:
    with pytest.raises(ValueError):
        make_estimate(identification="")
    with pytest.raises(ValueError):
        make_estimate(identification="   ")


def test_perturbation_estimate_rejects_n_samples_below_one() -> None:
    with pytest.raises(ValueError):
        make_estimate(n_samples=0)


def test_perturbation_estimate_rejects_negative_value() -> None:
    with pytest.raises(ValueError):
        make_estimate(value=-1.0, ci_low=-2.0, ci_high=0.0)


def test_perturbation_estimate_rejects_non_finite_value() -> None:
    with pytest.raises(ValueError):
        make_estimate(value=math.inf, ci_low=0.0, ci_high=math.inf)
    with pytest.raises(ValueError):
        make_estimate(value=math.nan, ci_low=0.0, ci_high=1.0)


def test_perturbation_estimate_as_row_keys_match_fields_in_order() -> None:
    estimate = make_estimate()
    row = estimate.as_row()
    expected_keys = [
        "value",
        "ci_low",
        "ci_high",
        "units",
        "identification",
        "n_samples",
        "divergence_name",
        "estimator_name",
    ]
    assert list(row.keys()) == expected_keys
