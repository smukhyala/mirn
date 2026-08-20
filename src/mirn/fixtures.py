"""Cross-language parity fixtures: the mechanism that makes "Python is the oracle" enforceable.

The browser owns the simulation and the teaching product; `src/mirn/` owns the measurement. Those
two facts only stay consistent if the agreement is checked mechanically, so this module writes the
oracle's answers to disk as JSON and the TypeScript suite reproduces them.

Three decisions in the format carry the weight:

* **Tolerance is declared in the fixture, by the oracle author.** "We loosened the tolerance to get
  it green" then shows up as a diff in a committed golden file rather than as an invisible edit in
  a test.
* **Inputs are literal and are never regenerated on the TypeScript side.** If the two languages
  each built their own inputs, an input-generation bug would be invisible. Floats are written with
  `repr`, which round-trips IEEE-754 binary64 exactly through `json.loads` and `JSON.parse`, so the
  inputs are bit-identical and any mismatch is genuinely the formula.
* **A subject with no TypeScript entry point is a failure, not a skip.** That is what stops "we
  will port it later" from being silent.

Sinkhorn is deliberately absent. Every step of it is `exp`/`log`, neither of which is bit-portable,
and a tolerance-based stopping rule halts at different iteration counts in the two languages — the
class's own measured table shows ~1.2e-3 relative between adjacent stopping points. It stays
Python-only and the browser uses ADE, which is what the demo used anyway.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from mirn.divergence import DIVERGENCES

SCHEMA_VERSION = 1

# Which quantities can honestly be compared, and how closely. See docs in the module docstring.
_TOLERANCES: dict[str, dict[str, object]] = {
    # ADE and FDE are sums of correctly-rounded square roots. numpy sums pairwise and the
    # TypeScript side reimplements pairwise summation to match, so this is "differs only in the
    # last bit of the accumulation".
    "divergence.ade.between_paths": {"kind": "relative", "value": 1e-15},
    "divergence.fde.between_paths": {"kind": "relative", "value": 1e-15},
    "divergence.ade.between_clouds": {"kind": "relative", "value": 1e-15},
    "divergence.fde.between_clouds": {"kind": "relative", "value": 1e-15},
    # The Frechet DP is min/max over a precomputed table: no accumulation, so every intermediate
    # already appears in the inputs. Bitwise. This is the canary — if it ever disagrees, the cause
    # is a logic difference, never rounding.
    "divergence.frechet.between_paths": {"kind": "exact", "value": 0.0},
}


def _rng_paths(seed: int, n_steps: int, count: int) -> list[np.ndarray]:
    rng = np.random.default_rng(seed)
    paths: list[np.ndarray] = []
    for _ in range(count):
        paths.append(rng.uniform(-12.0, 12.0, size=(n_steps, 2)))
    return paths


def _cases_for_paths() -> list[dict[str, object]]:
    """Small, hand-checkable cases first, then random ones at realistic magnitudes."""
    cases: list[dict[str, object]] = []

    identical = np.array([[0.0, 0.0], [1.0, 1.0], [2.0, 2.0]])
    cases.append({"id": "identical", "a": identical, "b": identical})

    cases.append(
        {
            "id": "unit-offset",
            "a": np.array([[0.0, 0.0], [1.0, 0.0], [2.0, 0.0]]),
            "b": np.array([[0.0, 1.0], [1.0, 1.0], [2.0, 1.0]]),
        }
    )
    cases.append(
        {
            "id": "single-late-excursion",
            "a": np.array([[0.0, 0.0], [0.0, 0.0], [0.0, 0.0]]),
            "b": np.array([[0.0, 0.0], [0.0, 10.0], [0.0, 0.0]]),
        }
    )

    for index, n_steps in enumerate((2, 5, 16, 32)):
        pair = _rng_paths(seed=1000 + index, n_steps=n_steps, count=2)
        cases.append({"id": f"random-t{n_steps}", "a": pair[0], "b": pair[1]})

    return cases


def _cases_for_clouds() -> list[dict[str, object]]:
    cases: list[dict[str, object]] = []
    cases.append(
        {
            "id": "two-points-offset",
            "a": np.array([[0.0, 0.0], [10.0, 0.0]]),
            "b": np.array([[1.0, 0.0], [11.0, 0.0]]),
        }
    )
    cases.append(
        {
            "id": "same-centroid-different-spread",
            "a": np.array([[-1.0, 0.0], [1.0, 0.0]]),
            "b": np.array([[-100.0, 0.0], [100.0, 0.0]]),
        }
    )
    for index, (n, m) in enumerate(((4, 4), (7, 11), (20, 20))):
        rng = np.random.default_rng(2000 + index)
        cases.append(
            {
                "id": f"random-{n}x{m}",
                "a": rng.uniform(-12.0, 12.0, size=(n, 2)),
                "b": rng.uniform(-12.0, 12.0, size=(m, 2)),
            }
        )
    return cases


def _flatten(array: np.ndarray) -> list[float]:
    flat: list[float] = []
    for value in np.asarray(array, dtype=np.float64).reshape(-1):
        flat.append(float(value))
    return flat


def build_subject(subject: str) -> dict[str, object]:
    """Compute every case for one subject and return the JSON-safe fixture body."""
    parts = subject.split(".")
    if len(parts) != 3 or parts[0] != "divergence":
        raise ValueError(
            f"unknown fixture subject '{subject}'; expected 'divergence.<name>.<form>'"
        )
    _, divergence_name, form = parts

    instance = DIVERGENCES.create(divergence_name)
    if form == "between_paths":
        raw_cases = _cases_for_paths()
        compute = instance.between_paths
    elif form == "between_clouds":
        raw_cases = _cases_for_clouds()
        compute = instance.between_clouds
    else:
        raise ValueError(f"unknown fixture form '{form}' in subject '{subject}'")

    rows: list[dict[str, object]] = []
    for case in raw_cases:
        a = case["a"]
        b = case["b"]
        expected = float(compute(a, b))  # type: ignore[arg-type]
        rows.append(
            {
                "id": case["id"],
                "a": _flatten(a),  # type: ignore[arg-type]
                "b": _flatten(b),  # type: ignore[arg-type]
                "expected": expected,
            }
        )

    body: dict[str, object] = {}
    body["schemaVersion"] = SCHEMA_VERSION
    body["subject"] = subject
    body["generator"] = "mirn.fixtures"
    body["numpy"] = np.__version__
    body["tolerance"] = _TOLERANCES[subject]
    body["cases"] = rows
    return body


def subjects() -> tuple[str, ...]:
    """Every subject the oracle exports, sorted so the file listing is stable."""
    return tuple(sorted(_TOLERANCES.keys()))


def write_fixtures(out_dir: Path) -> tuple[Path, ...]:
    """Write one JSON file per subject. Returns the paths written, in sorted order."""
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for subject in subjects():
        body = build_subject(subject)
        path = out_dir / f"{subject}.json"
        # sort_keys plus a fixed indent keeps the diff of a regenerated fixture readable, which is
        # the whole point of committing them.
        path.write_text(json.dumps(body, indent=2, sort_keys=True) + "\n")
        written.append(path)
    return tuple(written)
