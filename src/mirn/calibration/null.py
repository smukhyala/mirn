"""The split-half null: the detection floor perturbation estimates are calibrated against.

`split_half_null` repeatedly partitions a pedestrian population that carries no robot effect
(e.g. counterfactual, robot-absent scenes) into two disjoint halves and measures the divergence
between the halves treated as unordered point clouds. Because both halves are drawn from the same
population, this divergence is pure measurement noise — the null distribution of "perturbation"
a divergence would report even with no robot present. `minimum_detectable_perturbation` turns that
null sample into a single detection-floor number, and `calibration_report` packages both into one
CSV-ready row.

Only cloud-capable divergences can serve this: `between_clouds` treats its input as an unordered
point set, and `frechet` is deliberately order-dependent (see `divergence/frechet.py`), so it
raises `NotImplementedError` rather than silently discarding order. That failure must not
propagate as a bare `NotImplementedError` from deep inside a bootstrap loop — it is validated up
front here instead, with an error message naming the offending divergence and listing the
cloud-capable alternatives.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np
import pandas as pd

from mirn.contracts import Scene
from mirn.divergence import DIVERGENCES

_CLOUD_CAPABLE_DIVERGENCES: tuple[str, ...] = ("ade", "fde", "sinkhorn_w2")
_DEFAULT_N_SPLITS = 200


def _validate_cloud_capable(divergence: str) -> None:
    if divergence not in _CLOUD_CAPABLE_DIVERGENCES:
        available = ", ".join(_CLOUD_CAPABLE_DIVERGENCES)
        raise ValueError(
            f"split_half_null cannot use divergence '{divergence}': its between_clouds is "
            f"undefined (Fréchet distance is order-dependent and has no meaningful cloud form). "
            f"Cloud-capable divergences: {available}"
        )


def split_half_null(
    scenes: Sequence[Scene],
    divergence: str,
    seed: int,
    n_splits: int = 200,
    *,
    divergence_kwargs: Mapping[str, object] | None = None,
) -> np.ndarray:
    """Sample the null distribution of `divergence` under random half-population splits.

    Pools every pedestrian trajectory across `scenes`, then `n_splits` times draws a random
    partition of that pedestrian population into two disjoint halves (via
    `numpy.random.default_rng(seed)`, re-permuted fresh on every split) and computes
    `divergence.between_clouds` between the two halves' pooled position points. Returns the
    `(n_splits,)` array of null divergence values.
    """
    _validate_cloud_capable(divergence)
    if len(scenes) < 1:
        raise ValueError("split_half_null requires at least one scene")
    if n_splits < 1:
        raise ValueError(f"split_half_null n_splits must be >= 1, got {n_splits}")

    if divergence_kwargs is None:
        resolved_kwargs: dict[str, object] = {}
    else:
        resolved_kwargs = dict(divergence_kwargs)
    divergence_instance = DIVERGENCES.create(divergence, **resolved_kwargs)

    pedestrian_positions: list[np.ndarray] = []
    for scene in scenes:
        for pedestrian in scene.pedestrians:
            pedestrian_positions.append(pedestrian.positions)

    n_pedestrians = len(pedestrian_positions)
    if n_pedestrians < 2:
        raise ValueError(
            "split_half_null requires at least 2 pedestrians pooled across scenes to form two "
            f"disjoint halves, got {n_pedestrians}"
        )

    rng = np.random.default_rng(seed)
    half_size = n_pedestrians // 2

    null_values = np.empty(n_splits, dtype=np.float64)
    for split_index in range(n_splits):
        permutation = rng.permutation(n_pedestrians)
        group_a_indices = permutation[:half_size]
        group_b_indices = permutation[half_size : 2 * half_size]

        group_a_parts: list[np.ndarray] = []
        for pedestrian_index in group_a_indices:
            group_a_parts.append(pedestrian_positions[pedestrian_index])
        group_b_parts: list[np.ndarray] = []
        for pedestrian_index in group_b_indices:
            group_b_parts.append(pedestrian_positions[pedestrian_index])

        cloud_a = np.concatenate(group_a_parts, axis=0)
        cloud_b = np.concatenate(group_b_parts, axis=0)

        null_values[split_index] = divergence_instance.between_clouds(cloud_a, cloud_b)

    return null_values


def minimum_detectable_perturbation(null_samples: np.ndarray, alpha: float = 0.05) -> float:
    """The `1 - alpha` quantile of a split-half null sample: the detection floor.

    A perturbation estimate at or below this value is indistinguishable from the measurement
    noise a divergence reports even when no robot is present.
    """
    if null_samples.ndim != 1:
        raise ValueError(
            f"minimum_detectable_perturbation null_samples must be 1-D, got "
            f"ndim={null_samples.ndim}"
        )
    if null_samples.shape[0] < 1:
        raise ValueError("minimum_detectable_perturbation null_samples must be non-empty")
    if not (0.0 < alpha < 1.0):
        raise ValueError(f"minimum_detectable_perturbation alpha must be in (0, 1), got {alpha}")

    quantile_level = 1.0 - alpha
    return float(np.quantile(null_samples, quantile_level))


def solver_settings_for(
    divergence: str, divergence_kwargs: Mapping[str, object] | None
) -> dict[str, object]:
    """The solver parameters a run actually used, resolved from the class defaults plus overrides.

    Reported alongside every floor so the number can be reproduced. Divergences with no solver
    (`ade`, `fde`) report empty strings rather than being omitted, because a CSV whose columns
    depend on a parameter value is a CSV nothing can concatenate.
    """
    if divergence_kwargs is None:
        overrides: dict[str, object] = {}
    else:
        overrides = dict(divergence_kwargs)

    instance = DIVERGENCES.create(divergence, **overrides)
    settings: dict[str, object] = {}
    for name in ("epsilon", "max_iter", "tol"):
        if hasattr(instance, name):
            settings[name] = getattr(instance, name)
        else:
            settings[name] = ""
    return settings


def calibration_report(
    scenes: Sequence[Scene],
    divergence: str,
    seed: int,
    *,
    divergence_kwargs: Mapping[str, object] | None = None,
) -> pd.DataFrame:
    """One-row calibration summary: null mean/sd and the 95% minimum detectable perturbation.

    Columns are exactly `divergence, n_scenes, n_splits, null_mean, null_sd, mdp_95, seed,
    epsilon, max_iter, tol`. The last three record the solver settings the floor was computed
    under: the floor is the scale every other number is judged against, so a report that does not
    say how it was computed is not reproducible.
    """
    n_splits = _DEFAULT_N_SPLITS
    null_samples = split_half_null(
        scenes, divergence, seed, n_splits=n_splits, divergence_kwargs=divergence_kwargs
    )
    mdp_95 = minimum_detectable_perturbation(null_samples, alpha=0.05)

    row: dict[str, object] = {}
    row["divergence"] = divergence
    row["n_scenes"] = len(scenes)
    row["n_splits"] = n_splits
    row["null_mean"] = float(np.mean(null_samples))
    row["null_sd"] = float(np.std(null_samples))
    row["mdp_95"] = mdp_95
    row["seed"] = seed

    settings = solver_settings_for(divergence, divergence_kwargs)
    row["epsilon"] = settings["epsilon"]
    row["max_iter"] = settings["max_iter"]
    row["tol"] = settings["tol"]

    columns = [
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
    return pd.DataFrame([row], columns=columns)
