"""The estimator layer: perturbation estimators built from paired (and single-arm) rollouts.

Importing this package registers every concrete `PerturbationEstimator` into `ESTIMATORS` as a
side effect, so callers can do `ESTIMATORS.create("paired")` without importing the submodules
directly.
"""

from __future__ import annotations

from mirn.estimator import paired, residual  # noqa: F401
from mirn.estimator.base import ESTIMATORS, PerturbationEstimator, bootstrap_ci

__all__ = ["ESTIMATORS", "PerturbationEstimator", "bootstrap_ci"]
