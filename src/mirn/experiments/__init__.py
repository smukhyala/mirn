"""The experiment layer: named, parameterised measurements that write CSVs and drive the page.

Importing this package registers every concrete `Experiment` into `EXPERIMENTS` as a side effect,
so callers can do `EXPERIMENTS.create("calibration_floor")` without importing submodules.
"""

from __future__ import annotations

from mirn.experiments.base import (
    EXPERIMENTS,
    Experiment,
    ExperimentParameter,
    ExperimentResult,
)

__all__ = ["EXPERIMENTS", "Experiment", "ExperimentParameter", "ExperimentResult"]
