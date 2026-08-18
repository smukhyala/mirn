"""The divergence layer: distance functions the perturbation estimators are built from.

Importing this package registers every concrete `Divergence` into `DIVERGENCES` as a side effect,
so callers can do `DIVERGENCES.get("ade")` without importing the submodules directly.
"""

from __future__ import annotations

from mirn.divergence import (
    displacement,  # noqa: F401
    frechet,  # noqa: F401
    wasserstein,  # noqa: F401
)
from mirn.divergence.base import DIVERGENCES, Divergence

__all__ = ["DIVERGENCES", "Divergence"]
