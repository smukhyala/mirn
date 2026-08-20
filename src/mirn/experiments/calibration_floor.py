"""Experiment 1 — the detection floor.

Splits a robot-free pedestrian population in half at random, repeatedly, and measures the
divergence between the halves. Both halves are drawn from the same population, so the resulting
distribution is pure measurement noise: it is the number a divergence reports when there is no
robot in the scene at all. Its 95th percentile is the minimum detectable perturbation, and every
estimate elsewhere in the project is only interpretable against it.

Wayfinder §11 measurement 1 notes that nobody has published this, and that everything downstream
is uninterpretable without it.
"""

from __future__ import annotations

import functools
import threading
from collections.abc import Mapping

import numpy as np
import pandas as pd

from mirn.calibration.null import (
    minimum_detectable_perturbation,
    solver_settings_for,
    split_half_null,
)
from mirn.data.synthetic import SyntheticAdapter
from mirn.experiments.base import (
    EXPERIMENTS,
    Experiment,
    ExperimentParameter,
    ExperimentResult,
)

DEFAULT_N_PEDESTRIANS = 12
DEFAULT_N_STEPS = 60
FLOOR_N_SPLITS = 200
CLOUD_DIVERGENCES: tuple[str, ...] = ("ade", "fde", "sinkhorn_w2")

CALIBRATION_COLUMNS: tuple[str, ...] = (
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
)


def divergence_parameter() -> ExperimentParameter:
    """The cloud-capable divergence control, shared by every experiment that calibrates a floor.

    `frechet` is deliberately absent: it is order-dependent and its `between_clouds` raises, so
    offering it would turn a design decision into a runtime error.
    """
    return ExperimentParameter(
        name="divergence",
        label="Divergence",
        kind="choice",
        default="ade",
        choices=CLOUD_DIVERGENCES,
        help_text=(
            "Which distance function to measure with. Frechet is excluded because it is "
            "order-dependent and has no point-cloud form, so it cannot be calibrated."
        ),
    )


def n_scenes_parameter() -> ExperimentParameter:
    """The scene-count control, shared by every experiment."""
    return ExperimentParameter(
        name="n_scenes",
        label="Scenes",
        kind="int",
        default=8,
        minimum=2.0,
        maximum=32.0,
        step=1.0,
        help_text="How many independent synthetic crossings to generate.",
    )


def build_adapter(n_scenes: int, seed: int) -> SyntheticAdapter:
    """The one place synthetic data is constructed, so every experiment measures the same
    population shape and their numbers stay comparable."""
    return SyntheticAdapter(
        n_scenes=n_scenes,
        n_pedestrians=DEFAULT_N_PEDESTRIANS,
        n_steps=DEFAULT_N_STEPS,
        seed=seed,
    )


@functools.lru_cache(maxsize=128)
def cached_null_samples(
    divergence: str, n_scenes: int, seed: int, n_splits: int = FLOOR_N_SPLITS
) -> tuple[float, ...]:
    """The split-half null sample itself, memoised on its determining inputs.

    Returns an immutable `tuple`, not the `ndarray` `split_half_null` returns: an `lru_cache`
    hands the exact same object out to every caller sharing a key, so returning a mutable array
    would let one caller's in-place edit corrupt every other caller's — and every experiment
    section's readout — silently. Build it with an explicit loop rather than a bulk conversion so
    the values that land in the tuple are the same Python floats every other payload in this
    project already carries.

    This is the single computation `CalibrationFloor.run()`, `cached_floor()` (and therefore
    `estimator_comparison` and `confounding_sweep`) all now share. Before this existed,
    `CalibrationFloor.run()` called `split_half_null` directly while the other three experiments
    went through `cached_floor`'s own separate cache, so a page load fired the identical 200-split
    null computation up to three times over — once uncached from experiment 1's own request, and
    at least once more from whichever of experiments 2/3 lost the race to populate `cached_floor`.
    Routing every caller through this one cache means the first request anywhere on the page pays
    the ~73s split-half cost once, and every other section — and every reload — reads it back
    instantly.

    Deliberately not keyed on `influence`: the counterfactual arm returned by
    `SyntheticAdapter.load("counterfactual")` is `base_positions` — drawn from the per-scene RNG
    before `influence` is ever multiplied in (see `mirn.data.synthetic._generate_pair`). The
    robot-free population is therefore identical at every influence level, so the null it produces
    is identical too. `test_cached_floor_matches_every_influence` in `tests/test_experiments.py`
    asserts that equivalence directly rather than assuming it; do not widen this cache key to
    include `influence` without re-deriving that proof, and do not add `influence` as a
    silently-ignored keyword either.
    """
    adapter = build_adapter(n_scenes, seed)
    scenes = adapter.load("counterfactual")
    null_samples = split_half_null(scenes, divergence, seed, n_splits=n_splits)
    values: list[float] = []
    for sample_index in range(null_samples.shape[0]):
        values.append(float(null_samples[sample_index]))
    return tuple(values)


_NULL_SAMPLES_LOCK = threading.Lock()


def null_samples_for(
    divergence: str, n_scenes: int, seed: int, n_splits: int = FLOOR_N_SPLITS
) -> tuple[float, ...]:
    """`cached_null_samples`, serialised so concurrent cold-load misses compute once.

    The page fires every section at boot, and three of them (this experiment's own request, plus
    `estimator_comparison` and `confounding_sweep` via `cached_floor`) need the identical null at
    declared defaults. `functools.lru_cache` alone does not prevent two threads from both missing
    the same key at the same time and each running the ~49s computation to completion before
    either writes back — measured directly: three concurrent misses on a cold server took 66.7s
    wall (all three finishing within 0.1s of each other) versus 49.3s for one alone, i.e. they
    were genuinely contending for CPU, not queued. This lock fixes that: the first caller computes
    while the rest block on `_NULL_SAMPLES_LOCK`, then every blocked caller re-enters
    `cached_null_samples` and gets the now-warm cache entry back immediately.

    Deliberately one lock for every key, not a lock per `(divergence, n_scenes, seed, n_splits)`
    combination. A per-key lock would need its own registry (itself a shared mutable structure
    needing synchronised creation) to buy concurrency between *different* keys — and at this
    project's scale there is exactly one key that ever matters at boot (the declared defaults),
    so that machinery would add complexity for no measured benefit. Serialising everything through
    one lock costs nothing once the cache is warm, since the critical section then only runs a
    dict lookup.

    Every caller that wants the null sample — `cached_floor` and `CalibrationFloor.run()` — goes
    through this wrapper, never `cached_null_samples` directly, so the lock is never bypassed.
    """
    with _NULL_SAMPLES_LOCK:
        return cached_null_samples(divergence, n_scenes, seed, n_splits)


@functools.lru_cache(maxsize=128)
def cached_floor(
    divergence: str, n_scenes: int, seed: int, n_splits: int = FLOOR_N_SPLITS
) -> float:
    """The detection floor for a synthetic population, memoised on its determining inputs.

    Derives from `null_samples_for` rather than recomputing the split-half null itself, so this
    function's cache and `CalibrationFloor.run()`'s own data source are backed by the identical
    underlying (and now lock-serialised) computation — see `null_samples_for`'s docstring for why
    that matters.
    """
    samples = null_samples_for(divergence, n_scenes, seed, n_splits)
    null_array = np.array(samples, dtype=np.float64)
    return minimum_detectable_perturbation(null_array, alpha=0.05)


@EXPERIMENTS.register("calibration_floor")
class CalibrationFloor(Experiment):
    """The split-half null and the detection floor derived from it."""

    name = "calibration_floor"
    title = "The detection floor"
    claim = "A divergence reports a non-zero number even when no robot is present."
    order = 1
    primary_parameters = ("divergence", "n_splits")

    def parameters(self) -> tuple[ExperimentParameter, ...]:
        n_splits = ExperimentParameter(
            name="n_splits",
            label="Split-half draws",
            kind="int",
            default=200,
            minimum=20.0,
            maximum=500.0,
            step=10.0,
            help_text="How many random balanced partitions of the pedestrian pool to measure.",
        )
        return (divergence_parameter(), n_scenes_parameter(), n_splits)

    def run(self, params: Mapping[str, object], seed: int) -> ExperimentResult:
        resolved = self.resolve(params)
        divergence = str(resolved["divergence"])
        n_scenes = int(resolved["n_scenes"])  # type: ignore[call-overload]
        n_splits = int(resolved["n_splits"])  # type: ignore[call-overload]

        # Routed through null_samples_for (not cached_null_samples directly), which both shares
        # the cache cached_floor reads from and serialises concurrent cold-load misses. This is
        # the identical (divergence, n_scenes, seed, n_splits) computation cached_floor derives
        # its scalar from, so at the declared defaults this section's own request is the same
        # cache entry estimator_comparison and confounding_sweep read from too. See
        # null_samples_for's docstring for why the lock matters here.
        samples = null_samples_for(divergence, n_scenes, seed, n_splits)
        null_array = np.array(samples, dtype=np.float64)
        mdp_95 = minimum_detectable_perturbation(null_array, alpha=0.05)

        row: dict[str, object] = {}
        row["divergence"] = divergence
        row["n_scenes"] = n_scenes
        row["n_splits"] = n_splits
        row["null_mean"] = float(np.mean(null_array))
        row["null_sd"] = float(np.std(null_array))
        row["mdp_95"] = mdp_95
        row["seed"] = seed
        # The floor is the scale every other number on the page is expressed as a multiple of, so
        # the row has to say how it was computed. For `ade` and `fde` these are empty strings
        # rather than absent columns: a CSV whose columns depend on a parameter value is a CSV
        # nothing can concatenate.
        settings = solver_settings_for(divergence, None)
        row["epsilon"] = settings["epsilon"]
        row["max_iter"] = settings["max_iter"]
        row["tol"] = settings["tol"]
        frame = pd.DataFrame([row], columns=list(CALIBRATION_COLUMNS))

        sample_list: list[float] = []
        for sample in samples:
            sample_list.append(float(sample))

        payload: dict[str, object] = {}
        payload["null_samples"] = sample_list
        payload["mdp_95"] = mdp_95
        payload["null_mean"] = float(np.mean(null_array))
        payload["null_sd"] = float(np.std(null_array))
        payload["divergence"] = divergence
        payload["units"] = "metres"
        payload["note"] = (
            "Synthetic data. Both halves are drawn from the same robot-free population, so every "
            "metre shown here is measurement noise."
        )

        return ExperimentResult(
            experiment_name=self.name,
            seed=seed,
            frame=frame,
            payload=payload,
            method_keys=(divergence, "split_half_null", "minimum_detectable_perturbation"),
        )
