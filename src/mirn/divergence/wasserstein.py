"""Debiased entropic-regularised 2-Wasserstein distance between empirical point clouds, computed
with a log-domain Sinkhorn solver implemented directly in numpy (no external OT library
dependency)."""

from __future__ import annotations

import numpy as np
from scipy.special import logsumexp

from mirn.divergence.base import DIVERGENCES, Divergence, validate_cloud, validate_path


class SinkhornConvergenceError(RuntimeError):
    """Raised when `SinkhornW2`'s log-domain Sinkhorn loop fails to drive its row-marginal
    violation below `tol` within `max_iter` iterations.

    This helper defines the calibration layer's null distribution (Task 4), so a silently
    unconverged transport cost would corrupt the project's detection floor. Falling through
    `max_iter` and returning the last iterate anyway is never acceptable; this exception makes
    non-convergence observable instead.
    """


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

        S(a, b) = OT(a, b) - 0.5 * OT(a, a) - 0.5 * OT(b, b)

    with all three terms solved by the same log-domain Sinkhorn loop, at the same `epsilon`,
    `max_iter`, and `tol`, so the bias correction is exact rather than approximate. `S` can come
    out very slightly negative from floating-point error; it is clamped to `0.0` before the
    final square root, so the return value is always a non-negative distance in metres.
    """

    name = "sinkhorn_w2"

    # Defaults. `epsilon=0.05` is the specified value and is restored here. `tol` is PROVISIONAL
    # at 1e-5 rather than the specified 1e-9, and `max_iter` is 50000 rather than the specified
    # 20000; this comment is the flag saying so. Everything below is measured, not argued; full
    # tables in `.superpowers/sdd/measurement-core/fix-wave-1-report.md`.
    #
    # Why epsilon is the parameter worth protecting: the cost matrix is squared Euclidean distance
    # in metres, so epsilon is an entropic blur length squared — it smears the transport plan over
    # roughly sqrt(epsilon) metres. MIRN measures perturbations of 0.1-0.5 m, and this divergence
    # feeds `mirn.calibration.split_half_null`, which defines the detection floor. epsilon=0.05 is
    # a 0.22 m blur length; epsilon=2.0 would be 1.4 m, wider than the whole signal band.
    #
    # Why `tol` had to move instead. On real split-half pedestrian clouds from
    # `mirn.data.synthetic` (30 points per half, 25 splits x 3 Sinkhorn solves = 75 solves,
    # max_iter=20000), the fraction of solves reaching each tol:
    #
    #     epsilon    tol=1e-5    tol=1e-6    tol=1e-7    tol=1e-8    tol=1e-9
    #     0.05         75/75       52/75       50/75       50/75       50/75
    #     0.10         75/75       52/75       50/75       50/75       37/75
    #     0.25         75/75       52/75       50/75       45/75       20/75
    #     0.50         75/75       58/75       53/75       44/75       41/75
    #     1.00         75/75       63/75       56/75       52/75       37/75
    #
    # tol=1e-9 is not reachable at ANY epsilon in that range — raising epsilon to 1.0 buys 37/75
    # instead of 50/75, i.e. nothing. So the specified escape hatch ("use the smallest epsilon
    # that converges") has no solution: the wall is `tol`, not `epsilon`. tol=1e-5 is reached by
    # every solve at every epsilon, worst case 7762 iterations at epsilon=0.05. Raising epsilon
    # would therefore have bought blur and nothing else, which is why it is not what moved.
    #
    # `max_iter=50000` rather than the specified 20000, for margin on tiny clouds. Over 900
    # property-test-shaped solves (5 x 7 uniform clouds, one third with forced duplicate points)
    # at epsilon=0.05, tol=1e-5: zero non-convergences, worst case 2440 iterations. But a
    # hypothesis-generated pathological pair — O(1) coordinates mixed with subnormal ones around
    # 1e-188, i.e. an extreme cluster — needed 21969, just over 20000. max_iter costs nothing when
    # unused (every converging solve stops early), so the budget is set well clear of that tail.
    #
    # Which solves fail, and why. The 50/75 that do reach 1e-9 at epsilon=0.05 are exactly the 50
    # self-terms (2 per split); the 25 that never do are the 25 cross terms. So the blocker is the
    # ORDINARY cross term, not the degenerate self-term: its violation decays like 1/iteration at
    # small cost-scale / epsilon (9.4e-7 at 20000 iterations, 4.1e-7 at 40000 on a 50 x 50 pair),
    # so tol=1e-9 would need order 1e7 iterations. That is a property of entropic OT, not a bug in
    # the criterion.
    #
    # This corrects the diagnosis this fix started from, which was that an exact self-pair's duals
    # drift indefinitely along the constant-shift direction and so never settle. That is not what
    # the numbers do. Measured side by side after 20000 iterations at epsilon=0.05 —
    # max|f - f_previous| (the old criterion) against the row-marginal violation (the new one):
    #
    #     real 30-point self-pair OT(a,a)      drift 0.000e+00     violation 1.388e-17
    #     real 30-point cross-pair OT(a,b)     drift 4.902e-06     violation 3.268e-06
    #     gaussian 50-point self-pair          drift 1.622e-07     violation 6.489e-08
    #     gaussian 50-point cross-pair         drift 4.937e-06     violation 1.975e-06
    #
    # Potential drift settles perfectly well on a self-pair — exactly zero on the real one — and
    # the two criteria track each other to within a factor of about two everywhere. The row
    # marginal is still the right criterion, but for a plainer reason than degeneracy: it bounds
    # the constraint violation of the plan this method actually returns, in units of transported
    # mass, whereas potential drift only measures how much the bookkeeping moved on the last step
    # and can be made arbitrarily small by a slow solver. Do not expect the switch alone to buy
    # convergence it did not previously have; it buys a criterion that means something.
    #
    # What tol=1e-5 costs, measured on the 90 x 90 cross term at epsilon=0.1, transport cost by
    # violation level: 5.1092740751 at 1e-5 (4127 iters), 5.1154112545 at 1e-6 (31134),
    # 5.1160080668 at 1e-7 (258014). So tol=1e-5 costs ~1.3e-3 relative on the transport cost,
    # ~6.7e-4 on the returned distance, for 60x less work than 1e-7. Against a null distribution
    # whose own spread is orders of magnitude wider, that is free.
    #
    # And the reassurance that epsilon is genuinely the right thing to have protected: because
    # this class returns the DEBIASED divergence, the entropic bias largely cancels. For a rigid
    # translation of d metres (true value exactly d) the returned value is d to 4 decimal places
    # at every epsilon from 0.05 to 2.0. For a non-rigid, robot-shaped perturbation (only points
    # within 1.5 m of a robot displaced) the returned value varies by under 3% with no monotone
    # trend across epsilon 0.02 to 2.0. Keeping epsilon at 0.05 is therefore cheap insurance
    # rather than a measured necessity — but it is the value with physical meaning, so it is the
    # one that should not drift silently.
    #
    # Highest-value follow-up, not in scope here: use the symmetric (averaged) Sinkhorn update for
    # the two self-terms, as Feydy et al. / geomloss do. It would not rescue tol=1e-9 — the cross
    # term is the binding constraint — but it removes a slow oscillatory mode that makes small
    # self-pairs erratic (measured: at epsilon=1.0, 6 of 120 random 5-point solves still miss
    # tol=1e-9 inside 20000 iterations).
    #
    # `tol` is an ABSOLUTE L-infinity bound on the row-marginal violation, compared against a row
    # mass of 1/n, so it is stricter for small clouds than for large ones. Explicit-epsilon/tol
    # call sites elsewhere in this codebase are unaffected by either default.
    def __init__(self, epsilon: float = 0.05, max_iter: int = 50000, tol: float = 1e-5) -> None:
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

        # Convergence is measured as row-marginal violation, NOT as drift of the dual potentials.
        # A full Sinkhorn iteration updates `f` from `g` and then `g` from `f`; the second
        # half-update satisfies the *column* marginal exactly by construction, so the column
        # violation is identically zero at the top of the loop and would be a useless criterion.
        # The row marginal is the one left violated. Two reasons it is the right thing to test.
        # First, it bounds the constraint violation of the plan this method actually returns, in
        # units of transported mass, rather than measuring how far the bookkeeping moved on the
        # last step — a slow solver can make potential drift small without being near a solution.
        # Second, it is invariant to the constant-shift direction in the duals (f -> f - c,
        # g -> g + c leaves the plan, and therefore both marginals, untouched), so it cannot be
        # confused by the non-unique dual of a near-degenerate self-pair. See the measured
        # comparison of the two criteria in the class comment above.
        #
        # The row sums are read off the potentials the loop already has, for free: with the
        # current `(f, g)`, plan row sum i is
        #     sum_j exp((f_i + g_j - C_ij) / epsilon) = exp(f_i / epsilon + log_row_sum_i)
        # where `log_row_sum` is exactly the logsumexp the `f` update needs anyway. Measuring it
        # *before* overwriting `f` is what makes it the not-just-updated marginal.
        row_target = np.full(n_points, 1.0 / n_points, dtype=np.float64)

        converged = False
        marginal_violation = float("inf")
        iterations_run = 0
        for iteration in range(self.max_iter):
            row_exponent = (g_potential[np.newaxis, :] - cost) / self.epsilon
            log_row_sum = logsumexp(row_exponent, axis=1)

            row_marginal = np.exp(f_potential / self.epsilon + log_row_sum)
            marginal_violation = float(np.max(np.abs(row_marginal - row_target)))
            if marginal_violation < self.tol:
                converged = True
                break

            f_potential = self.epsilon * (log_mu - log_row_sum)

            col_exponent = (f_potential[:, np.newaxis] - cost) / self.epsilon
            log_col_sum = logsumexp(col_exponent, axis=0)
            g_potential = self.epsilon * (log_nu - log_col_sum)

            iterations_run = iteration + 1

        if not converged:
            raise SinkhornConvergenceError(
                "SinkhornW2's log-domain Sinkhorn loop did not converge: ran "
                f"{iterations_run} iteration(s) without reaching tol; final row-marginal "
                f"violation (L-inf) marginal_violation={marginal_violation!r}, "
                f"tol={self.tol!r}, epsilon={self.epsilon!r}. Raise max_iter to give the solver "
                "more iterations, or raise epsilon (more entropic regularisation converges "
                "faster, at the cost of blurring the transport plan over a length scale of "
                "about sqrt(epsilon) metres)."
            )

        log_plan = (f_potential[:, np.newaxis] + g_potential[np.newaxis, :] - cost) / self.epsilon
        plan = np.exp(log_plan)
        transport_cost = float(np.sum(plan * cost))
        return transport_cost
