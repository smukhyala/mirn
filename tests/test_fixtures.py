"""The parity fixtures are the seam between the two languages, so the seam itself gets tests.

A fixture that is stale, non-deterministic, or silently empty makes every TypeScript parity
assertion vacuous while still reporting green. These tests exist so that failure mode is loud.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from mirn.fixtures import SCHEMA_VERSION, build_subject, subjects, write_fixtures

_COMMITTED = Path(__file__).parent / "golden" / "parity"


def test_every_subject_declares_a_tolerance_and_at_least_one_case() -> None:
    for subject in subjects():
        body = build_subject(subject)
        assert body["schemaVersion"] == SCHEMA_VERSION
        assert body["subject"] == subject
        tolerance = body["tolerance"]
        assert isinstance(tolerance, dict)
        assert tolerance["kind"] in ("relative", "exact")
        cases = body["cases"]
        assert isinstance(cases, list)
        assert len(cases) >= 1


def test_generation_is_idempotent(tmp_path: Path) -> None:
    """Same inputs, same bytes.

    If regeneration were not byte-stable the CI diff step would fail on every run and would very
    quickly be deleted by whoever was on call, taking the whole parity guarantee with it.
    """
    first = tmp_path / "a"
    second = tmp_path / "b"
    write_fixtures(first)
    write_fixtures(second)

    for subject in subjects():
        name = f"{subject}.json"
        assert (first / name).read_bytes() == (second / name).read_bytes()


def test_committed_fixtures_are_current(tmp_path: Path) -> None:
    """The committed fixtures must be what the current code produces.

    This is the Python half of the two-file rule: changing a formula without regenerating the
    fixture fails here, and changing the fixture without changing the formula fails in TypeScript.
    Neither can be done alone.
    """
    fresh = tmp_path / "fresh"
    write_fixtures(fresh)

    for subject in subjects():
        name = f"{subject}.json"
        committed_path = _COMMITTED / name
        assert committed_path.exists(), (
            f"no committed fixture for '{subject}'. Regenerate with:\n"
            f"    .venv/bin/python -m mirn.cli fixtures --out tests/golden/parity"
        )
        assert committed_path.read_bytes() == (fresh / name).read_bytes(), (
            f"committed fixture for '{subject}' is stale. Regenerate with:\n"
            f"    .venv/bin/python -m mirn.cli fixtures --out tests/golden/parity"
        )


def test_cases_carry_literal_inputs_rather_than_a_recipe() -> None:
    """Inputs are literal so that an input-generation bug cannot hide.

    If each language built its own inputs from a shared seed, a divergence in the generators would
    look exactly like agreement in the measurements.
    """
    for subject in subjects():
        body = build_subject(subject)
        for case in body["cases"]:  # type: ignore[union-attr]
            assert isinstance(case["a"], list)
            assert isinstance(case["b"], list)
            assert len(case["a"]) % 2 == 0
            assert len(case["b"]) % 2 == 0
            assert len(case["a"]) >= 2
            assert isinstance(case["expected"], float)


def test_floats_round_trip_through_json_exactly() -> None:
    """json.dumps/loads must not lose a bit, or the inputs the two languages see differ.

    Python's float repr and JSON.parse both round-trip IEEE-754 binary64, which is what lets the
    fixture compare formulas rather than parsers.
    """
    body = build_subject("divergence.ade.between_paths")
    round_tripped = json.loads(json.dumps(body))
    for original, parsed in zip(body["cases"], round_tripped["cases"], strict=True):  # type: ignore[arg-type]
        assert original["a"] == parsed["a"]
        assert original["expected"] == parsed["expected"]


def test_unknown_subject_is_rejected_rather_than_silently_empty() -> None:
    with pytest.raises(ValueError, match="unknown fixture subject"):
        build_subject("divergence.nope")
