"""MethodCard turns each component's mathematics into a validated object rather than a docstring
nobody renders. Its validation is strict for the same reason the other contracts' is: a card with
an empty formula would silently render as a blank panel in the UI."""

from __future__ import annotations

import dataclasses

import pytest

from mirn.method.cards import MethodCard


def _valid_card(**overrides: object) -> MethodCard:
    fields: dict[str, object] = {}
    fields["key"] = "ade"
    fields["kind"] = "divergence"
    fields["title"] = "Average displacement"
    fields["one_liner"] = "Mean pointwise separation between two time-aligned paths."
    fields["plain_summary"] = (
        "Walk two versions of the same journey side by side and measure how far apart "
        "they stay on average."
    )
    fields["estimand_tex"] = "d(a, b)"
    fields["formula_tex"] = "\\tfrac{1}{T}\\sum_t \\lVert a_t - b_t \\rVert"
    fields["assumptions"] = ("Paths are time-aligned and equal length.",)
    fields["breaks_when"] = ("Paths are sampled at different rates.",)
    fields["citation"] = None
    for name in overrides:
        fields[name] = overrides[name]
    return MethodCard(**fields)


def test_valid_card_round_trips_through_as_dict() -> None:
    card = _valid_card()
    row = card.as_dict()
    assert row["key"] == "ade"
    assert row["kind"] == "divergence"
    assert row["assumptions"] == ["Paths are time-aligned and equal length."]
    assert row["citation"] is None


def test_kinds_constant_is_exactly_the_three_allowed_values() -> None:
    assert MethodCard.KINDS == ("divergence", "estimator", "calibration")


@pytest.mark.parametrize("field_name", ["key", "title", "one_liner", "estimand_tex", "formula_tex"])
def test_empty_string_field_raises(field_name: str) -> None:
    with pytest.raises(ValueError, match=field_name):
        _valid_card(**{field_name: "   "})


def test_unknown_kind_raises_listing_allowed_kinds() -> None:
    with pytest.raises(ValueError, match="divergence, estimator, calibration"):
        _valid_card(kind="metric")


def test_empty_assumptions_raises() -> None:
    with pytest.raises(ValueError, match="assumptions"):
        _valid_card(assumptions=())


def test_empty_breaks_when_raises() -> None:
    with pytest.raises(ValueError, match="breaks_when"):
        _valid_card(breaks_when=())


def test_blank_entry_inside_assumptions_raises() -> None:
    with pytest.raises(ValueError, match="assumptions"):
        _valid_card(assumptions=("fine", "  "))


def test_blank_entry_inside_breaks_when_raises() -> None:
    with pytest.raises(ValueError, match="breaks_when"):
        _valid_card(breaks_when=("fine", "  "))


def test_card_is_frozen() -> None:
    card = _valid_card()
    with pytest.raises(dataclasses.FrozenInstanceError):
        card.title = "something else"  # type: ignore[misc]


def test_blank_citation_raises() -> None:
    with pytest.raises(ValueError, match="citation"):
        _valid_card(citation="   ")


def test_non_null_citation_round_trips() -> None:
    citation_text = "Cuturi, NeurIPS 2013"
    card = _valid_card(citation=citation_text)
    row = card.as_dict()
    assert row["citation"] == citation_text


def test_plain_summary_is_required_and_non_empty() -> None:
    with pytest.raises(ValueError, match="plain_summary"):
        _valid_card(plain_summary="   ")


def test_plain_summary_rejects_latex() -> None:
    """It exists so a reader meets English before notation. A backslash or a dollar sign means
    someone pasted a formula into the prose field."""
    with pytest.raises(ValueError, match="plain_summary"):
        _valid_card(plain_summary="the mean of \\lVert a - b \\rVert")
    with pytest.raises(ValueError, match="plain_summary"):
        _valid_card(plain_summary="defined as $d(a,b)$")


def test_plain_summary_round_trips_through_as_dict() -> None:
    card = _valid_card(plain_summary="How far apart two paths are, on average.")
    assert card.as_dict()["plain_summary"] == "How far apart two paths are, on average."
