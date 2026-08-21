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


def _cases_of(subject: str) -> list[dict[str, object]]:
    body = build_subject(subject)
    cases = body["cases"]
    assert isinstance(cases, list)
    return cases


def _is_flat_path(value: object) -> bool:
    """A flat (T, 2) buffer: an even-length, non-empty list of floats."""
    if not isinstance(value, list):
        return False
    if len(value) < 2 or len(value) % 2 != 0:
        return False
    for entry in value:
        if not isinstance(entry, float):
            return False
    return True


def test_cases_carry_literal_inputs_rather_than_a_recipe() -> None:
    """Inputs are literal so that an input-generation bug cannot hide.

    If each language built its own inputs from a shared seed, a divergence in the generators would
    look exactly like agreement in the measurements. This walks all three families, because the
    families have three different case shapes and it would be easy to add a fourth that quietly
    carried a seed instead of an array.
    """
    for subject in subjects():
        family = subject.split(".")[0]
        for case in _cases_of(subject):
            assert isinstance(case["expected"], float), subject
            assert "seed" not in case, f"{subject} case '{case['id']}' carries a seed, not data"

            if family == "divergence":
                assert _is_flat_path(case["a"]), subject
                assert _is_flat_path(case["b"]), subject
            elif family == "estimator":
                agents = case["agents"]
                assert isinstance(agents, list)
                assert len(agents) >= 1
                assert _is_flat_path(case["robot"]), subject
                for agent in agents:
                    assert _is_flat_path(agent["treated"]), subject
                    assert _is_flat_path(agent["control"]), subject
                    assert len(agent["treated"]) == len(agent["control"])
            elif family == "calibration":
                paths = case["paths"]
                assert isinstance(paths, list)
                assert len(paths) >= 2
                for path in paths:
                    assert _is_flat_path(path), subject
            else:
                raise AssertionError(f"subject '{subject}' belongs to no known family")


def test_case_ids_are_unique_within_a_subject() -> None:
    """Duplicate ids make a parity failure unattributable.

    The TypeScript side names the failing case in its error, and two cases sharing a name send
    whoever is debugging it to the wrong inputs.
    """
    for subject in subjects():
        seen: set[str] = set()
        for case in _cases_of(subject):
            case_id = case["id"]
            assert isinstance(case_id, str)
            assert case_id not in seen, f"{subject} repeats case id '{case_id}'"
            seen.add(case_id)


def test_split_half_cases_carry_one_real_permutation_per_split() -> None:
    """The splits travel as data, so the data has to be splits.

    numpy's PCG64 cannot be reproduced in JavaScript, which is why both sides are handed the
    partition instead of drawing it. A row that repeated or omitted an index would still produce
    a plausible float — the halves would silently overlap or drop somebody — so the fixture is
    checked here rather than believed.
    """
    for case in _cases_of("calibration.split_half_null.floor"):
        n_pedestrians = len(case["paths"])  # type: ignore[arg-type]
        permutations = case["permutations"]
        assert isinstance(permutations, list)
        assert len(permutations) >= 1
        assert len(case["expectedSamples"]) == len(permutations)  # type: ignore[arg-type]
        for row in permutations:
            assert sorted(row) == list(range(n_pedestrians)), case["id"]


def test_split_half_cases_exercise_more_than_one_stride() -> None:
    """A floor at stride 3 is a different number from the same floor at stride 1.

    Subsampling is not an optimisation detail: it changes the answer, so if the two languages
    ever disagreed about which points survive it, only a fixture that actually subsamples would
    notice. A fixture set that was all stride 1 would check the pooling and none of the striding.
    """
    strides: set[int] = set()
    n_ragged = 0
    for case in _cases_of("calibration.split_half_null.floor"):
        stride = case["strideSteps"]
        assert isinstance(stride, int)
        strides.add(stride)

        n_steps = len(case["paths"][0]) // 2  # type: ignore[index]
        if stride > 1 and n_steps % stride != 0:
            n_ragged += 1

    assert len(strides) >= 2
    assert max(strides) > 1
    # And at least one stride that does not divide the trajectory length. The two sides arrive at
    # the ragged tail differently — Python slices `[::stride]`, the browser sizes its buffer with
    # `ceil(nSteps / stride)` — so a fixture whose lengths all divide evenly never asks which
    # index is kept last.
    assert n_ragged >= 1


def test_cvm_fixture_measures_a_window_that_is_not_the_end_of_the_episode() -> None:
    """The constant-velocity residual flatters itself at the end of an episode.

    Once the crowd has parked, a constant-velocity forecast of a stationary person is exactly
    right and the residual is exactly 0.0 — so a fixture that only ever anchored at the last
    timestep would agree across both languages while measuring nothing. The fixture therefore
    carries both readings of the same parked scene, and this asserts the informative one is
    still there.
    """
    n_interior_windows = 0
    for case in _cases_of("estimator.cvm_residual.per_run"):
        n_steps = len(case["agents"][0]["treated"]) // 2  # type: ignore[index]
        end_step = case["endStep"]
        assert isinstance(end_step, int)
        if end_step < n_steps - 1:
            n_interior_windows += 1

    assert n_interior_windows >= 1, "every cvm_residual case anchors at the last timestep"


def test_the_two_exact_zeros_survive_regeneration() -> None:
    """Two cases must read exactly 0.0, and no tolerance can rescue them if they drift.

    `paired` on a run whose arms are identical is the estimator's zero point; `cvm_residual`
    measured inside a parked tail is the defect being taught. Both are asserted here because a
    regeneration that quietly turned either into 1e-17 would still pass the relative tolerance
    against its own new expected value — the golden file would simply have moved with the bug.
    """
    paired_zeros: dict[str, float] = {}
    for case in _cases_of("estimator.paired.per_run"):
        paired_zeros[str(case["id"])] = float(case["expected"])  # type: ignore[arg-type]
    assert paired_zeros["identical-arms"] == 0.0
    assert paired_zeros["straight-line-no-push"] == 0.0

    cvm_values: dict[str, float] = {}
    for case in _cases_of("estimator.cvm_residual.per_run"):
        cvm_values[str(case["id"])] = float(case["expected"])  # type: ignore[arg-type]
    assert cvm_values["crowd-4x24-parked-from-14-measured-in-the-parked-tail"] == 0.0
    # The same scene, measured while people are still walking, is the number the estimator would
    # actually report. If this ever became 0.0 too, the parked-tail assertion above would be
    # asserting nothing.
    assert cvm_values["crowd-4x24-parked-from-14"] > 0.0
    # And the case that makes the whole argument: identical arms, so the true effect is exactly
    # zero, yet the forecast residual still reports a fifth of a metre of "robot effect".
    assert cvm_values["identical-arms"] > 0.1


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
