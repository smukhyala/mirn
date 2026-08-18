"""The `Divergence` extension point: distance functions over trajectories and point clouds.

Every concrete divergence registers itself into `DIVERGENCES` (defined in `__init__.py`) via the
`@DIVERGENCES.register("name")` decorator. Callers look implementations up by name — never by an
`if name == ...` dispatch chain.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np

from mirn.registry import Registry

DIVERGENCES = Registry("divergence")


class Divergence(ABC):
    """A non-negative distance between two paths, or between two point clouds.

    `between_paths` takes two `(T, 2)` arrays of equal length and returns a non-negative float.
    `between_clouds` takes `(N, 2)` and `(M, 2)` point sets; N and M need not match.

    Both must return exactly `0.0` for identical inputs and must be invariant to a shared rigid
    transform (translation and rotation) applied to both arguments.

    Where a subclass has no meaningful cloud form, it may raise `NotImplementedError` from
    `between_clouds` — but every subclass introduced in this task implements both.
    """

    name: str

    @abstractmethod
    def between_paths(self, a: np.ndarray, b: np.ndarray) -> float:
        """Distance between two equal-length `(T, 2)` paths."""
        raise NotImplementedError

    @abstractmethod
    def between_clouds(self, a: np.ndarray, b: np.ndarray) -> float:
        """Distance between two `(N, 2)` / `(M, 2)` point clouds."""
        raise NotImplementedError


def validate_path(array: np.ndarray, label: str) -> np.ndarray:
    """Coerce `array` to a float64 `(T, 2)` ndarray, raising ValueError if it is not shaped that
    way. Shared by every `Divergence.between_paths` implementation."""
    coerced = np.asarray(array, dtype=np.float64)
    if coerced.ndim != 2 or coerced.shape[1] != 2:
        raise ValueError(
            f"{label} must have shape (T, 2), got shape={coerced.shape}"
        )
    return coerced


def validate_cloud(array: np.ndarray, label: str) -> np.ndarray:
    """Coerce `array` to a float64 `(N, 2)` ndarray, raising ValueError if it is not shaped that
    way. Shared by every `Divergence.between_clouds` implementation."""
    coerced = np.asarray(array, dtype=np.float64)
    if coerced.ndim != 2 or coerced.shape[1] != 2:
        raise ValueError(
            f"{label} must have shape (N, 2), got shape={coerced.shape}"
        )
    return coerced
