"""`MethodCard` — one component's mathematics, as a validated object the UI can render.

The estimators already state their identifying assumptions, in `identification()`, and nothing
displays them. A card pairs that prose with the estimand the component targets, the formula the
code actually computes, and — the honest half — the conditions under which the component is
wrong. `breaks_when` is not optional, because a card that only says what a method does is
marketing.

`kind` is an explicit string field rather than a class hierarchy so that no consumer needs
`isinstance` to decide how to group or render a card.
"""

from __future__ import annotations

from dataclasses import dataclass

_KINDS: tuple[str, ...] = ("divergence", "estimator", "calibration")


def _require_text(value: str, field_name: str) -> None:
    if len(value.strip()) == 0:
        raise ValueError(f"MethodCard.{field_name} must be non-empty after strip")


def _require_text_tuple(
    values: tuple[str, ...], field_name: str
) -> None:
    """Every entry must be non-empty prose, with no notation in it.

    The notation check is the same rule `plain_summary` already carries, applied to the two
    fields the interface also renders as plain text. `assumptions` and `breaks_when` are inserted
    into the page as text nodes and never passed through KaTeX, so a `\\(...\\)` delimiter in one
    of them reaches the reader verbatim — which is exactly what happened to the split-half null
    card. Making it a construction error means it cannot come back silently.
    """
    if len(values) == 0:
        raise ValueError(
            f"MethodCard.{field_name} must contain at least one entry"
        )
    for index in range(len(values)):
        if len(values[index].strip()) == 0:
            raise ValueError(
                f"MethodCard.{field_name}[{index}] must be non-empty "
                "after strip"
            )
        if "\\" in values[index] or "$" in values[index]:
            raise ValueError(
                f"MethodCard.{field_name}[{index}] must be plain English, not notation; it is "
                "rendered as text and never passed through a maths renderer, so a LaTeX "
                "delimiter would reach the reader verbatim. Move the maths to formula_tex."
            )


@dataclass(frozen=True, slots=True)
class MethodCard:
    """The mathematics of one divergence, estimator, or calibration step."""

    key: str
    kind: str
    title: str
    one_liner: str
    plain_summary: str
    estimand_tex: str
    formula_tex: str
    assumptions: tuple[str, ...]
    breaks_when: tuple[str, ...]
    citation: str | None

    KINDS = _KINDS

    def __post_init__(self) -> None:
        _require_text(self.key, "key")
        _require_text(self.title, "title")
        _require_text(self.one_liner, "one_liner")
        _require_text(self.plain_summary, "plain_summary")
        if "\\" in self.plain_summary or "$" in self.plain_summary:
            raise ValueError(
                "MethodCard.plain_summary must be plain English, not notation; it is what a "
                "reader meets before any formula. Move the maths to formula_tex."
            )
        _require_text(self.estimand_tex, "estimand_tex")
        _require_text(self.formula_tex, "formula_tex")
        if self.kind not in _KINDS:
            raise ValueError(
                f"MethodCard.kind must be one of "
                f"{', '.join(_KINDS)}, got '{self.kind}'"
            )
        _require_text_tuple(self.assumptions, "assumptions")
        _require_text_tuple(self.breaks_when, "breaks_when")
        if self.citation is not None:
            _require_text(self.citation, "citation")

    def as_dict(self) -> dict[str, object]:
        """A JSON-safe dict for the API. Tuples become lists; `citation` stays nullable."""
        row: dict[str, object] = {}
        row["key"] = self.key
        row["kind"] = self.kind
        row["title"] = self.title
        row["one_liner"] = self.one_liner
        row["plain_summary"] = self.plain_summary
        row["estimand_tex"] = self.estimand_tex
        row["formula_tex"] = self.formula_tex
        row["assumptions"] = list(self.assumptions)
        row["breaks_when"] = list(self.breaks_when)
        row["citation"] = self.citation
        return row
