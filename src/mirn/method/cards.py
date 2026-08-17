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


@dataclass(frozen=True, slots=True)
class MethodCard:
    """The mathematics of one divergence, estimator, or calibration step."""

    key: str
    kind: str
    title: str
    one_liner: str
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
        row["estimand_tex"] = self.estimand_tex
        row["formula_tex"] = self.formula_tex
        row["assumptions"] = list(self.assumptions)
        row["breaks_when"] = list(self.breaks_when)
        row["citation"] = self.citation
        return row
