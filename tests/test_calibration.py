from __future__ import annotations

import numpy as np
import pytest

from mirn.calibration.null import (
    calibration_report,
    minimum_detectable_perturbation,
    solver_settings_for,
    split_half_null,
)
from mirn.data.synthetic import SyntheticAdapter


def _counterfactual_scenes(n_scenes: int = 6, n_pedestrians: int = 10, n_steps: int = 20):
    adapter = SyntheticAdapter(
        n_scenes=n_scenes,
        n_pedestrians=n_pedestrians,
        n_steps=n_steps,
        seed=0,
    )
    return adapter.load("counterfactual")


def _small_counterfactual_scenes():
    """A deliberately small fixture for the `sinkhorn_w2` arm of the null-sampling test.

    The default fixture pools 60 pedestrians x 20 steps, so each split-half cloud carries 600
    points and each `SinkhornW2.between_clouds` call runs three 600 x 600 Sinkhorn solves. At the
    class's post-fix defaults (see `mirn.divergence.wasserstein`: max_iter=20000 rather than 500,
    because the convergence criterion is now row-marginal violation against tol=1e-9) that is
    minutes per split. Shrinking the CLOUD, not the tolerance, is the right lever: what this test
    asserts — that every null sample is finite and non-negative — is a scale-independent property,
    so 10 pedestrians x 6 steps (30 points per half) exercises it exactly as well.
    """
    return _counterfactual_scenes(n_scenes=2, n_pedestrians=5, n_steps=6)


# --- split_half_null ---------------------------------------------------------------------------


@pytest.mark.slow
def test_split_half_null_samples_are_finite_and_non_negative() -> None:
    scenes = _counterfactual_scenes()
    for divergence in ("ade", "fde"):
        null_samples = split_half_null(scenes, divergence, seed=1, n_splits=25)
        assert np.all(np.isfinite(null_samples))
        assert np.all(null_samples >= 0.0)

    # Same assertions for sinkhorn_w2, on a smaller fixture purely for runtime; see
    # `_small_counterfactual_scenes`. The split count is unchanged.
    small_scenes = _small_counterfactual_scenes()
    sinkhorn_samples = split_half_null(small_scenes, "sinkhorn_w2", seed=1, n_splits=25)
    assert np.all(np.isfinite(sinkhorn_samples))
    assert np.all(sinkhorn_samples >= 0.0)


def test_split_half_null_rejects_frechet_naming_cloud_capable_alternatives() -> None:
    """Ambiguity resolution: `frechet.between_clouds` raises NotImplementedError (Fréchet
    distance is order-dependent), so `split_half_null` must reject it up front with a ValueError
    that names the offending divergence and lists the cloud-capable alternatives, rather than
    letting a NotImplementedError propagate from deep inside the split loop."""
    scenes = _counterfactual_scenes()
    with pytest.raises(ValueError) as excinfo:
        split_half_null(scenes, "frechet", seed=1, n_splits=5)

    message = str(excinfo.value)
    assert "frechet" in message
    assert "ade" in message
    assert "fde" in message
    assert "sinkhorn_w2" in message


def test_split_half_null_is_deterministic_under_fixed_seed() -> None:
    scenes = _counterfactual_scenes()
    first = split_half_null(scenes, "ade", seed=42, n_splits=20)
    second = split_half_null(scenes, "ade", seed=42, n_splits=20)
    assert np.array_equal(first, second)


# --- minimum_detectable_perturbation ------------------------------------------------------------


@pytest.mark.slow
def test_mdp_95_is_greater_than_the_null_median() -> None:
    scenes = _counterfactual_scenes(n_scenes=6, n_pedestrians=12)
    null_samples = split_half_null(scenes, "ade", seed=3, n_splits=200)
    mdp_95 = minimum_detectable_perturbation(null_samples, alpha=0.05)
    assert mdp_95 > float(np.median(null_samples))


# --- calibration_report -------------------------------------------------------------------------


@pytest.mark.slow
def test_calibration_report_columns_and_single_row() -> None:
    scenes = _counterfactual_scenes()
    report = calibration_report(scenes, "ade", seed=5)

    assert list(report.columns) == [
        "divergence",
        "n_scenes",
        "n_splits",
        "null_mean",
        "null_sd",
        "mdp_95",
        "seed",
        "epsilon",
        "max_iter",
        "tol",
    ]
    assert len(report) == 1
    assert report.loc[0, "divergence"] == "ade"
    assert report.loc[0, "n_scenes"] == len(scenes)
    assert report.loc[0, "seed"] == 5


@pytest.mark.slow
def test_calibration_report_is_deterministic_under_fixed_seed() -> None:
    scenes = _counterfactual_scenes()
    first = calibration_report(scenes, "ade", seed=7)
    second = calibration_report(scenes, "ade", seed=7)

    assert first.equals(second)


def test_calibration_report_rejects_frechet() -> None:
    scenes = _counterfactual_scenes()
    with pytest.raises(ValueError):
        calibration_report(scenes, "frechet", seed=1)


@pytest.mark.slow
def test_split_half_null_threads_solver_settings_to_the_divergence() -> None:
    """The detection floor must not be set by a constructor default a caller cannot see.

    Before this, `split_half_null` built its divergence with `DIVERGENCES.create(name)` and no
    arguments, so `SinkhornW2`'s class defaults silently fixed the floor. The floor is the scale
    every other number in the project is expressed as a multiple of, so an invisible default there
    is not a tidiness problem: it makes the headline number irreproducible.
    """
    adapter = SyntheticAdapter(n_scenes=1, n_pedestrians=6, n_steps=8, seed=0)
    scenes = [pair.counterfactual for pair in adapter.rollout_pairs()]

    loose = split_half_null(
        scenes, "sinkhorn_w2", seed=3, n_splits=4, divergence_kwargs={"epsilon": 0.5}
    )
    tight = split_half_null(
        scenes, "sinkhorn_w2", seed=3, n_splits=4, divergence_kwargs={"epsilon": 0.02}
    )

    # Same seed and the same splits; only the solver differs. If the kwargs were being dropped
    # these would be identical, which is exactly the bug.
    assert not np.allclose(loose, tight)


@pytest.mark.slow
def test_calibration_report_records_the_solver_settings_it_used() -> None:
    """A published floor has to be reproducible from the CSV row alone."""
    adapter = SyntheticAdapter(n_scenes=1, n_pedestrians=6, n_steps=8, seed=0)
    scenes = [pair.counterfactual for pair in adapter.rollout_pairs()]

    report = calibration_report(
        scenes, "sinkhorn_w2", seed=3, divergence_kwargs={"epsilon": 0.25}
    )

    assert report["epsilon"].iloc[0] == 0.25
    assert report["max_iter"].iloc[0] == 50000
    assert report["tol"].iloc[0] == 1e-5


def test_solverless_divergences_report_empty_settings_rather_than_missing_columns() -> None:
    """A CSV whose columns depend on a parameter value is a CSV nothing can concatenate."""
    settings = solver_settings_for("ade", None)
    assert settings == {"epsilon": "", "max_iter": "", "tol": ""}


# --- injectable permutations and stride ---------------------------------------------------------


def _fixed_permutations(rows: list[list[int]]):
    """A `PermutationSource` that hands back a recorded split, the way a parity fixture does."""

    def source(n_pedestrians: int, split_index: int) -> np.ndarray:
        assert len(rows[split_index]) == n_pedestrians
        return np.asarray(rows[split_index], dtype=np.intp)

    return source


def test_injected_permutations_replace_the_rng_and_are_reproducible() -> None:
    """The capability the cross-language fixture is built on.

    numpy's PCG64 cannot be reproduced in JavaScript without reimplementing a numpy internal, so
    the browser is handed the splits instead of drawing them. That only isolates the arithmetic
    if the splits genuinely override the generator: if `seed` were still steering anything, the
    two seeds below would give two different nulls and the parity fixture would be comparing two
    different questions.
    """
    scenes = _counterfactual_scenes(n_scenes=1, n_pedestrians=6, n_steps=8)
    rows = [[0, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 0], [2, 0, 4, 1, 5, 3]]

    first = split_half_null(
        scenes, "ade", seed=1, n_splits=3, permutations=_fixed_permutations(rows)
    )
    second = split_half_null(
        scenes, "ade", seed=999, n_splits=3, permutations=_fixed_permutations(rows)
    )

    assert np.array_equal(first, second)


def test_a_permutation_that_is_not_a_permutation_is_rejected() -> None:
    """A repeated index would overlap the two halves and quietly lower the floor.

    Nothing downstream can tell a floor computed on overlapping halves from a real one — it is
    just a smaller number — so the bad split has to be refused at the door rather than diagnosed
    from a page.
    """
    scenes = _counterfactual_scenes(n_scenes=1, n_pedestrians=4, n_steps=8)
    repeated = [[0, 1, 1, 3]]

    with pytest.raises(ValueError, match="not a permutation of range"):
        split_half_null(
            scenes, "ade", seed=1, n_splits=1, permutations=_fixed_permutations(repeated)
        )


def test_wrong_length_permutation_is_rejected_rather_than_truncated() -> None:
    """A short split would silently drop pedestrians out of both halves."""
    scenes = _counterfactual_scenes(n_scenes=1, n_pedestrians=4, n_steps=8)

    def short_source(n_pedestrians: int, split_index: int) -> np.ndarray:
        del n_pedestrians, split_index
        return np.asarray([0, 1, 2], dtype=np.intp)

    with pytest.raises(ValueError, match="must have shape"):
        split_half_null(scenes, "ade", seed=1, n_splits=1, permutations=short_source)


def test_stride_of_one_is_exactly_the_unstrided_null() -> None:
    """The default must not move any existing floor."""
    scenes = _counterfactual_scenes(n_scenes=2, n_pedestrians=6, n_steps=12)
    unstrided = split_half_null(scenes, "ade", seed=7, n_splits=8)
    stride_one = split_half_null(scenes, "ade", seed=7, n_splits=8, stride_steps=1)
    assert np.array_equal(unstrided, stride_one)


def test_a_larger_stride_shifts_the_null_upward() -> None:
    """Subsampling is not free, and the docstring promises which way it moves.

    Sparser clouds have larger nearest-neighbour distances, so the whole null rises with the
    stride. That is why the stride is recorded on the result and why two floors measured at
    different strides must never be shown side by side — this test is what keeps that claim from
    being folklore.
    """
    scenes = _counterfactual_scenes(n_scenes=2, n_pedestrians=8, n_steps=24)
    rows: list[list[int]] = []
    rng = np.random.default_rng(11)
    for _ in range(12):
        row: list[int] = []
        for index in rng.permutation(16):
            row.append(int(index))
        rows.append(row)

    means: list[float] = []
    for stride in (1, 2, 4, 8):
        samples = split_half_null(
            scenes,
            "ade",
            seed=0,
            n_splits=12,
            permutations=_fixed_permutations(rows),
            stride_steps=stride,
        )
        means.append(float(np.mean(samples)))

    for index in range(1, len(means)):
        assert means[index] > means[index - 1]


def test_stride_must_be_a_positive_number_of_steps() -> None:
    scenes = _counterfactual_scenes(n_scenes=1, n_pedestrians=4, n_steps=8)
    with pytest.raises(ValueError, match="stride_steps must be >= 1"):
        split_half_null(scenes, "ade", seed=1, n_splits=1, stride_steps=0)
