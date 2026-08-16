"""Debiased entropic-regularised 2-Wasserstein distance between empirical point clouds, computed
with a log-domain Sinkhorn solver implemented directly in numpy (no external OT library
dependency)."""

from __future__ import annotations

import numpy as np
from scipy.special import logsumexp

from mirn.divergence.base import DIVERGENCES, Divergence, validate_cloud, validate_path


@DIVERGENCES.register("sinkhorn_w2")
class SinkhornW2(Divergence):
    """Debiased entropic-regularised 2-Wasserstein distance between two point clouds with
    uniform marginals.

    Cost is squared Euclidean distance between points. The dual potentials for each pairwise
    OT solve are updated in the log domain via `scipy.special.logsumexp` so the solver stays
    finite even at small `epsilon` on large clouds — a plain (non-log) Sinkhorn update would
    overflow/underflow in that regime.

    Plain entropic OT is not a proper metric: `OT_epsilon(a, a)` is not 0 in general (the
    maximum-entropy plan spreads mass off the zero-cost diagonal), so it carries an
    epsilon-dependent self-distance bias that does not vanish even when `a` and `b` are drawn
    from the same distribution. This class returns the debiased Sinkhorn divergence (Genevay et
    al. / Feydy et al.):

        S(a, b) = OT(a, b) - 0.5 * OT(a, a) - 0.5 * OT(a, a)

    with all three terms solved by the same log-domain Sinkhorn loop, at the same `epsilon`,
    `max_iter`, and `tol`, so the bias correction is exact rather than approximate. `S` can come
    out very slightly negative from floating-point error; it is clamped to `0.0` before the
    final square root, so the return value is always a non-negative distance in metres.
    """

    name = "sinkhorn_w2"

    def __init__(self, epsilon: float = 0.05, max_iter: int = 500, tol: float = 1e-9) -> None:
        if epsilon <= 0:
            raise ValueError(f"SinkhornW2 epsilon must be > 0, got {epsilon}")
        if max_iter < 1:
            raise ValueError(f"SinkhornW2 max_iter must be >= 1, got {max_iter}")
        if tol <= 0:
            raise ValueError(f"SinkhornW2 tol must be > 0, got {tol}")
        self.epsilon = epsilon
        self.max_iter = max_iter
        self.tol = tol

    def between_paths(self, a: np.ndarray, b: np.ndarray) -> float:
        """Treats the two paths as unordered clouds of their points."""
        path_a = validate_path(a, "SinkhornW2.between_paths a")
        path_b = validate_path(b, "SinkhornW2.between_paths b")
        if path_a.shape[0] != path_b.shape[0]:
            raise ValueError(
                "SinkhornW2.between_paths requires equal-length paths, got "
                f"{path_a.shape[0]} != {path_b.shape[0]}"
            )
        return self.between_clouds(path_a, path_b)

    def between_clouds(self, a: np.ndarray, b: np.ndarray) -> float:
        cloud_a = validate_cloud(a, "SinkhornW2.between_clouds a")
        cloud_b = validate_cloud(b, "SinkhornW2.between_clouds b")

        cost_ab = self._sinkhorn_transport_cost(cloud_a, cloud_b)
        cost_aa = self._sinkhorn_transport_cost(cloud_a, cloud_a)
        cost_bb = self._sinkhorn_transport_cost(cloud_b, cloud_b)

        debiased_cost = cost_ab - 0.5 * cost_aa - 0.5 * cost_bb
        debiased_cost = max(debiased_cost, 0.0)
        return float(np.sqrt(debiased_cost))

    def _sinkhorn_transport_cost(self, cloud_x: np.ndarray, cloud_y: np.ndarray) -> float:
        """Run log-domain Sinkhorn between two `(*, 2)` point clouds with uniform marginals and
        return the raw (un-rooted) entropic transport cost `sum_ij P_ij * C_ij`, using this
        instance's `epsilon`, `max_iter`, and `tol`. Shared by all three terms of the debiased
        divergence so they provably use identical convergence settings."""
        n_points = cloud_x.shape[0]
        m_points = cloud_y.shape[0]

        cost = np.empty((n_points, m_points), dtype=np.float64)
        for i in range(n_points):
            diff = cloud_y - cloud_x[i]
            cost[i, :] = np.sum(diff * diff, axis=1)

        log_mu = -np.log(n_points)
        log_nu = -np.log(m_points)

        f_potential = np.zeros(n_points, dtype=np.float64)
        g_potential = np.zeros(m_points, dtype=np.float64)

        for iteration in range(self.max_iter):
            f_previous = f_potential

            row_exponent = (g_potential[np.newaxis, :] - cost) / self.epsilon
            log_row_sum = logsumexp(row_exponent, axis=1)
            f_potential = self.epsilon * (log_mu - log_row_sum)

            col_exponent = (f_potential[:, np.newaxis] - cost) / self.epsilon
            log_col_sum = logsumexp(col_exponent, axis=0)
            g_potential = self.epsilon * (log_nu - log_col_sum)

            f_change = np.max(np.abs(f_potential - f_previous))
            if f_change < self.tol:
                break

        log_plan = (f_potential[:, np.newaxis] + g_potential[np.newaxis, :] - cost) / self.epsilon
        plan = np.exp(log_plan)
        transport_cost = float(np.sum(plan * cost))
        return transport_cost
