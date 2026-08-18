"""The `PerturbationEstimator` extension point: turns `RolloutPair`s into a `PerturbationEstimate`.

Every concrete estimator registers itself into `ESTIMATORS` via the `@ESTIMATORS.register("name")`
decorator. Callers look implementations up by name — never by an `if name == ...` dispatch chain.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

import numpy as np

from mirn.contracts import PerturbationEstimate, RolloutPair
from mirn.registry import Registry

ESTIMATORS = Registry("estimator")


class PerturbationEstimator(ABC):
    """A method for turning a batch of `RolloutPair`s into a single `PerturbationEstimate`.

    `identification()` must state, in prose, the assumption under which the estimator's output
    identifies the causal effect of robot presence — including, where applicable, that the
    assumption is unmet.
    """

    name: str

    @abstractmethod
    def identification(self) -> str:
        """Name the identifying assumption this estimator relies on."""
        raise NotImplementedError

    @abstractmethod
    def estimate(self, pairs: Sequence[RolloutPair], seed: int) -> PerturbationEstimate:
        """Estimate perturbation from `pairs`, bootstrapping the CI with `seed`."""
        raise NotImplementedError


def bootstrap_ci(
    values: np.ndarray, seed: int, n_boot: int = 1000, alpha: float = 0.05
) -> tuple[float, float]:
    """A percentile bootstrap confidence interval for the mean of `values`.

    Resamples `values` with replacement `n_boot` times using `numpy.random.default_rng(seed)`
    (never the global RNG), computes the mean of each resample, and returns the
    `alpha / 2` and `1 - alpha / 2` percentiles of that bootstrap distribution. Shared by every
    `PerturbationEstimator.estimate` implementation so the resampling logic is defined exactly
    once.
    """
    if values.ndim != 1:
        raise ValueError(f"bootstrap_ci values must be 1-D, got ndim={values.ndim}")
    if values.shape[0] < 1:
        raise ValueError("bootstrap_ci values must be non-empty")
    if n_boot < 1:
        raise ValueError(f"bootstrap_ci n_boot must be >= 1, got {n_boot}")
    if not (0.0 < alpha < 1.0):
        raise ValueError(f"bootstrap_ci alpha must be in (0, 1), got {alpha}")

    rng = np.random.default_rng(seed)
    n_values = values.shape[0]

    boot_means = np.empty(n_boot, dtype=np.float64)
    for boot_index in range(n_boot):
        sample_indices = rng.integers(0, n_values, size=n_values)
        resample = values[sample_indices]
        boot_means[boot_index] = np.mean(resample)

    low_percentile = 100.0 * (alpha / 2.0)
    high_percentile = 100.0 * (1.0 - alpha / 2.0)
    ci_low = float(np.percentile(boot_means, low_percentile))
    ci_high = float(np.percentile(boot_means, high_percentile))
    return ci_low, ci_high
