"""The calibration layer: converts raw-metre divergence into detection-floor (MDP) units.

`mirn.calibration.null` measures the split-half null distribution of a divergence and turns it
into a minimum-detectable-perturbation (MDP) floor. Perturbation estimates are reported against
that floor, never in raw metres, per the project's working agreement.
"""

from __future__ import annotations

from mirn.calibration.null import (
    calibration_report,
    minimum_detectable_perturbation,
    solver_settings_for,
    split_half_null,
)

__all__ = [
    "calibration_report",
    "minimum_detectable_perturbation",
    "solver_settings_for",
    "split_half_null",
]
