"""Discrete Fréchet distance between two equal-length paths.

Fréchet distance is order-dependent by definition — it is the minimax distance between two
paths traversed monotonically from start to end — so it has no meaningful point-cloud form.
`DiscreteFrechet.between_clouds` raises `NotImplementedError` rather than silently discarding
order. This is a deliberate correction to the `Divergence` ABC's contract for this one class,
per the task brief.
"""

from __future__ import annotations

import numpy as np

from mirn.divergence.base import DIVERGENCES, Divergence, validate_path


@DIVERGENCES.register("frechet")
class DiscreteFrechet(Divergence):
    """Standard discrete Fréchet distance, computed by iterative (non-recursive) dynamic
    programming over an explicit `(T, T)` table, `O(T * T)`."""

    name = "frechet"

    def between_paths(self, a: np.ndarray, b: np.ndarray) -> float:
        path_a = validate_path(a, "DiscreteFrechet.between_paths a")
        path_b = validate_path(b, "DiscreteFrechet.between_paths b")
        if path_a.shape[0] != path_b.shape[0]:
            raise ValueError(
                "DiscreteFrechet.between_paths requires equal-length paths, got "
                f"{path_a.shape[0]} != {path_b.shape[0]}"
            )

        n_steps = path_a.shape[0]
        m_steps = path_b.shape[0]

        point_distance = np.empty((n_steps, m_steps), dtype=np.float64)
        for i in range(n_steps):
            diff = path_b - path_a[i]
            point_distance[i, :] = np.sqrt(np.sum(diff * diff, axis=1))

        coupling = np.empty((n_steps, m_steps), dtype=np.float64)
        coupling[0, 0] = point_distance[0, 0]

        for i in range(1, n_steps):
            coupling[i, 0] = max(coupling[i - 1, 0], point_distance[i, 0])

        for j in range(1, m_steps):
            coupling[0, j] = max(coupling[0, j - 1], point_distance[0, j])

        for i in range(1, n_steps):
            for j in range(1, m_steps):
                best_predecessor = min(
                    coupling[i - 1, j],
                    coupling[i - 1, j - 1],
                    coupling[i, j - 1],
                )
                coupling[i, j] = max(best_predecessor, point_distance[i, j])

        return float(coupling[n_steps - 1, m_steps - 1])

    def between_clouds(self, a: np.ndarray, b: np.ndarray) -> float:
        raise NotImplementedError(
            "DiscreteFrechet.between_clouds is undefined: Fréchet distance is order-dependent "
            "(it measures the minimax distance between two paths traversed in order), so an "
            "unordered point cloud has no meaningful Fréchet form."
        )
