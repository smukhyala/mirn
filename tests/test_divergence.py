from __future__ import annotations

import math

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from hypothesis.extra.numpy import arrays

from mirn.divergence import DIVERGENCES
from mirn.divergence.frechet import DiscreteFrechet
from mirn.divergence.wasserstein import SinkhornW2

COORDINATE = st.floats(min_value=-50.0, max_value=50.0, allow_nan=False, allow_infinity=False)


def path_strategy(n_steps: int):
    return arrays(dtype=np.float64, shape=(n_steps, 2), elements=COORDINATE)


def rotation_matrix(theta: float) -> np.ndarray:
    cos_theta = math.cos(theta)
    sin_theta = math.sin(theta)
    matrix = np.array(
        [[cos_theta, -sin_theta], [sin_theta, cos_theta]],
        dtype=np.float64,
    )
    return matrix


def make_divergence(name: str) -> object:
    """Construct a registered divergence with sane defaults for property testing."""
    return DIVERGENCES.create(name)


# --- identity -------------------------------------------------------------------------------


@given(path=path_strategy(5))
@settings(max_examples=25, deadline=None)
def test_identity_between_paths_is_exactly_zero(path: np.ndarray) -> None:
    for name in DIVERGENCES.names():
        divergence = make_divergence(name)
        value = divergence.between_paths(path, path)
        assert value == 0.0


@given(cloud=path_strategy(6))
@settings(max_examples=25, deadline=None)
def test_identity_between_clouds_is_exactly_zero(cloud: np.ndarray) -> None:
    for name in DIVERGENCES.names():
        divergence = make_divergence(name)
        if name == "frechet":
            with pytest.raises(NotImplementedError):
                divergence.between_clouds(cloud, cloud)
            continue
        value = divergence.between_clouds(cloud, cloud)
        assert value == 0.0


# --- non-negativity ---------------------------------------------------------------------------


@given(a=path_strategy(5), b=path_strategy(5))
@settings(max_examples=25, deadline=None)
def test_non_negativity_between_paths(a: np.ndarray, b: np.ndarray) -> None:
    for name in DIVERGENCES.names():
        divergence = make_divergence(name)
        value = divergence.between_paths(a, b)
        assert value >= 0.0


@given(a=path_strategy(5), b=path_strategy(7))
@settings(max_examples=25, deadline=None)
def test_non_negativity_between_clouds(a: np.ndarray, b: np.ndarray) -> None:
    for name in DIVERGENCES.names():
        divergence = make_divergence(name)
        if name == "frechet":
            continue
        value = divergence.between_clouds(a, b)
        assert value >= 0.0


# --- translation invariance --------------------------------------------------------------------


@given(
    a=path_strategy(5),
    b=path_strategy(5),
    shift=arrays(dtype=np.float64, shape=(2,), elements=COORDINATE),
)
@settings(max_examples=25, deadline=None)
def test_translation_invariance_between_paths(
    a: np.ndarray, b: np.ndarray, shift: np.ndarray
) -> None:
    for name in DIVERGENCES.names():
        divergence = make_divergence(name)
        original = divergence.between_paths(a, b)
        shifted = divergence.between_paths(a + shift, b + shift)
        assert abs(original - shifted) < 1e-6


@given(
    a=path_strategy(5),
    b=path_strategy(7),
    shift=arrays(dtype=np.float64, shape=(2,), elements=COORDINATE),
)
@settings(max_examples=25, deadline=None)
def test_translation_invariance_between_clouds(
    a: np.ndarray, b: np.ndarray, shift: np.ndarray
) -> None:
    for name in DIVERGENCES.names():
        divergence = make_divergence(name)
        if name == "frechet":
            continue
        original = divergence.between_clouds(a, b)
        shifted = divergence.between_clouds(a + shift, b + shift)
        assert abs(original - shifted) < 1e-6


# --- rotation invariance ------------------------------------------------------------------------


@given(
    a=path_strategy(5),
    b=path_strategy(5),
    theta=st.floats(min_value=-math.pi, max_value=math.pi, allow_nan=False),
)
@settings(max_examples=25, deadline=None)
def test_rotation_invariance_between_paths(a: np.ndarray, b: np.ndarray, theta: float) -> None:
    rotation = rotation_matrix(theta)
    a_rotated = a @ rotation.T
    b_rotated = b @ rotation.T
    for name in DIVERGENCES.names():
        divergence = make_divergence(name)
        original = divergence.between_paths(a, b)
        rotated = divergence.between_paths(a_rotated, b_rotated)
        assert abs(original - rotated) < 1e-6


@given(
    a=path_strategy(5),
    b=path_strategy(7),
    theta=st.floats(min_value=-math.pi, max_value=math.pi, allow_nan=False),
)
@settings(max_examples=25, deadline=None)
def test_rotation_invariance_between_clouds(a: np.ndarray, b: np.ndarray, theta: float) -> None:
    rotation = rotation_matrix(theta)
    a_rotated = a @ rotation.T
    b_rotated = b @ rotation.T
    for name in DIVERGENCES.names():
        divergence = make_divergence(name)
        if name == "frechet":
            continue
        original = divergence.between_clouds(a, b)
        rotated = divergence.between_clouds(a_rotated, b_rotated)
        assert abs(original - rotated) < 1e-6


# --- monotonicity (ade) -------------------------------------------------------------------------


@given(a=path_strategy(5), k=st.floats(min_value=0.0, max_value=25.0, allow_nan=False))
@settings(max_examples=25, deadline=None)
def test_ade_monotonic_under_constant_translation_of_b(a: np.ndarray, k: float) -> None:
    ade = DIVERGENCES.create("ade")
    direction = np.array([1.0, 0.0], dtype=np.float64)
    b = a + k * direction
    value = ade.between_paths(a, b)
    assert value == pytest.approx(k, abs=1e-9)


# --- shape / length validation -------------------------------------------------------------


def test_between_paths_raises_value_error_on_length_mismatch() -> None:
    a = np.zeros((5, 2))
    b = np.zeros((4, 2))
    for name in DIVERGENCES.names():
        divergence = make_divergence(name)
        with pytest.raises(ValueError):
            divergence.between_paths(a, b)


@pytest.mark.parametrize("bad_shape", [(5, 3), (5,), (2, 5, 2)])
def test_between_paths_raises_value_error_on_bad_shape(bad_shape: tuple[int, ...]) -> None:
    good = np.zeros((5, 2))
    bad = np.zeros(bad_shape)
    for name in DIVERGENCES.names():
        divergence = make_divergence(name)
        with pytest.raises(ValueError):
            divergence.between_paths(bad, good)
        with pytest.raises(ValueError):
            divergence.between_paths(good, bad)


@pytest.mark.parametrize("bad_shape", [(5, 3), (5,), (2, 5, 2)])
def test_between_clouds_raises_value_error_on_bad_shape(bad_shape: tuple[int, ...]) -> None:
    good = np.zeros((5, 2))
    bad = np.zeros(bad_shape)
    for name in DIVERGENCES.names():
        divergence = make_divergence(name)
        if name == "frechet":
            # DiscreteFrechet.between_clouds is unconditionally unimplemented; see its own test.
            continue
        with pytest.raises(ValueError):
            divergence.between_clouds(bad, good)
        with pytest.raises(ValueError):
            divergence.between_clouds(good, bad)


# --- SinkhornW2 closed form ----------------------------------------------------------------


def test_sinkhorn_w2_closed_form_repeated_point_clouds() -> None:
    n_points = 40
    m_points = 40
    k = 3.7
    cloud_a = np.zeros((n_points, 2), dtype=np.float64)
    cloud_b = np.zeros((m_points, 2), dtype=np.float64)
    cloud_b[:, 0] = k

    sinkhorn = SinkhornW2(epsilon=0.01)
    value = sinkhorn.between_clouds(cloud_a, cloud_b)
    assert value == pytest.approx(k, abs=2e-2)


def test_sinkhorn_w2_stays_finite_at_small_epsilon_on_large_clouds() -> None:
    rng = np.random.default_rng(42)
    cloud_a = rng.normal(size=(200, 2))
    cloud_b = rng.normal(size=(200, 2)) + 2.0

    sinkhorn = SinkhornW2(epsilon=0.01)
    value = sinkhorn.between_clouds(cloud_a, cloud_b)
    assert math.isfinite(value)
    assert value >= 0.0


def test_sinkhorn_w2_constructor_validates_parameters() -> None:
    with pytest.raises(ValueError):
        SinkhornW2(epsilon=0.0)
    with pytest.raises(ValueError):
        SinkhornW2(epsilon=-1.0)
    with pytest.raises(ValueError):
        SinkhornW2(max_iter=0)
    with pytest.raises(ValueError):
        SinkhornW2(tol=0.0)


def test_sinkhorn_w2_debiasing_gives_exact_zero_on_separately_allocated_equal_clouds() -> None:
    # Regression test for the debiasing fix: `x` and `x.copy()` are equal-valued but distinct
    # array objects, so nothing about object identity or a same-array fast path can make this
    # pass by accident. Plain (non-debiased) entropic OT at epsilon=0.1 returns roughly 0.17 on
    # an input shaped like this one; only the S(a,b) = OT(a,b) - 0.5 OT(a,a) - 0.5 OT(b,b)
    # debiasing correction drives it to exactly 0.
    rng = np.random.default_rng(7)
    cloud = rng.normal(size=(6, 2))
    cloud_copy = cloud.copy()
    assert cloud is not cloud_copy

    sinkhorn = SinkhornW2(epsilon=0.1)
    value = sinkhorn.between_clouds(cloud, cloud_copy)
    assert value == pytest.approx(0.0, abs=1e-9)


def test_sinkhorn_w2_debiased_value_is_small_within_a_shared_distribution() -> None:
    # The property the calibration layer (Task 4) actually relies on: the debiased divergence
    # between two independent samples from the SAME distribution must be much smaller than
    # between two clouds that are clearly drawn from different, well-separated distributions.
    # A plain (non-debiased) entropic OT self-distance bias would offset both terms by a similar
    # epsilon-dependent constant and could hide this contrast.
    rng = np.random.default_rng(11)
    sample_a = rng.normal(loc=0.0, scale=1.0, size=(150, 2))
    sample_b = rng.normal(loc=0.0, scale=1.0, size=(150, 2))
    separated = rng.normal(loc=20.0, scale=1.0, size=(150, 2))

    sinkhorn = SinkhornW2(epsilon=0.1)
    within_distribution = sinkhorn.between_clouds(sample_a, sample_b)
    across_distributions = sinkhorn.between_clouds(sample_a, separated)

    assert within_distribution < 0.1 * across_distributions


# --- DiscreteFrechet ----------------------------------------------------------------------


def test_discrete_frechet_hand_computed_example() -> None:
    # Two parallel straight lines sampled at matching x-coordinates: the optimal monotone
    # coupling is the identity alignment, so the Fréchet distance equals the constant offset.
    a = np.array([[0.0, 0.0], [1.0, 0.0], [2.0, 0.0], [3.0, 0.0]], dtype=np.float64)
    b = a + np.array([0.0, 1.0])

    frechet = DiscreteFrechet()
    value = frechet.between_paths(a, b)
    assert value == pytest.approx(1.0, abs=1e-9)


def test_discrete_frechet_between_clouds_raises_not_implemented() -> None:
    frechet = DiscreteFrechet()
    a = np.zeros((5, 2))
    b = np.zeros((5, 2))
    with pytest.raises(NotImplementedError):
        frechet.between_clouds(a, b)
