"""Environment-driven paths. All dataset roots and output locations come from `.env` — never
hardcode a path or a secret in library code.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def data_root() -> Path:
    """Return the dataset root from `MIRN_DATA_ROOT`.

    Raises RuntimeError if unset, telling the caller to copy `.env.example` to `.env`.
    """
    value = os.environ.get("MIRN_DATA_ROOT")
    if value is None or len(value.strip()) == 0:
        raise RuntimeError(
            "MIRN_DATA_ROOT is not set. Copy .env.example to .env and set MIRN_DATA_ROOT to the "
            "directory holding the downloaded datasets."
        )
    return Path(value)


def results_dir() -> Path:
    """Return the results directory from `MIRN_RESULTS_DIR` (default `./results`), creating it
    if it does not already exist."""
    value = os.environ.get("MIRN_RESULTS_DIR", "./results")
    path = Path(value)
    path.mkdir(parents=True, exist_ok=True)
    return path


def default_seed() -> int:
    """Return the default seed from `MIRN_SEED` (default 0).

    This is only a fallback for interactive exploration; every stochastic function still takes
    an explicit `seed: int` argument.
    """
    value = os.environ.get("MIRN_SEED", "0")
    return int(value)
