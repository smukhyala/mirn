"""Displacement-based divergences: average displacement error (ADE) and final displacement error
(FDE), each with a path form and a point-cloud form."""

from __future__ import annotations

import numpy as np

from mirn.divergence.base import DIVERGENCES, Divergence, validate_cloud, validate_path


def _pairwise_distance_matrix(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Return the `(N, M)` matrix of Euclidean distances between rows of `a` and rows of `b`."""
    n_points = a.shape[0]
    m_points = b.shape[0]
    distances = np.empty((n_points, m_points), dtype=np.float64)
    for i in range(n_points):
        diff = b - a[i]
        row_distances = np.sqrt(np.sum(diff * diff, axis=1))
        distances[i, :] = row_distances
    return distances


@DIVERGENCES.register("ade")
class AverageDisplacement(Divergence):
    """Average displacement error: mean per-timestep Euclidean distance between two paths, or the
    symmetrised mean nearest-neighbour distance between two point clouds."""

    name = "ade"

    def between_paths(self, a: np.ndarray, b: np.ndarray) -> float:
        path_a = validate_path(a, "AverageDisplacement.between_paths a")
        path_b = validate_path(b, "AverageDisplacement.between_paths b")
        if path_a.shape[0] != path_b.shape[0]:
            raise ValueError(
                "AverageDisplacement.between_paths requires equal-length paths, got "
                f"{path_a.shape[0]} != {path_b.shape[0]}"
            )
        diff = path_a - path_b
        per_step_distance = np.sqrt(np.sum(diff * diff, axis=1))
        return float(np.mean(per_step_distance))

    def between_clouds(self, a: np.ndarray, b: np.ndarray) -> float:
        cloud_a = validate_cloud(a, "AverageDisplacement.between_clouds a")
        cloud_b = validate_cloud(b, "AverageDisplacement.between_clouds b")

        distances = _pairwise_distance_matrix(cloud_a, cloud_b)
        a_to_b_nearest = np.min(distances, axis=1)
        b_to_a_nearest = np.min(distances, axis=0)

        mean_a_to_b = np.mean(a_to_b_nearest)
        mean_b_to_a = np.mean(b_to_a_nearest)
        return float((mean_a_to_b + mean_b_to_a) / 2.0)


@DIVERGENCES.register("fde")
class FinalDisplacement(Divergence):
    """Final displacement error: Euclidean distance at the last timestep between two paths, or
    the centroid distance between two point clouds."""

    name = "fde"

    def between_paths(self, a: np.ndarray, b: np.ndarray) -> float:
        path_a = validate_path(a, "FinalDisplacement.between_paths a")
        path_b = validate_path(b, "FinalDisplacement.between_paths b")
        if path_a.shape[0] != path_b.shape[0]:
            raise ValueError(
                "FinalDisplacement.between_paths requires equal-length paths, got "
                f"{path_a.shape[0]} != {path_b.shape[0]}"
            )
        diff = path_a[-1] - path_b[-1]
        return float(np.sqrt(np.sum(diff * diff)))

    def between_clouds(self, a: np.ndarray, b: np.ndarray) -> float:
        cloud_a = validate_cloud(a, "FinalDisplacement.between_clouds a")
        cloud_b = validate_cloud(b, "FinalDisplacement.between_clouds b")

        centroid_a = np.mean(cloud_a, axis=0)
        centroid_b = np.mean(cloud_b, axis=0)
        diff = centroid_a - centroid_b
        return float(np.sqrt(np.sum(diff * diff)))
