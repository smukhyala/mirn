"""The `Experiment` extension point: a named, parameterised measurement that produces both a flat
CSV frame and a JSON-safe payload from one computation.

`parameters()` is what lets the interface stay generic. The page builds its controls from this
declaration, so adding an experiment requires no change to any JavaScript and no `if name == ...`
dispatch on either side of the wire. `resolve()` is the single place a parameter map is validated
and defaulted, so every experiment rejects an unknown or out-of-range parameter identically and
the API can turn that one exception type into one HTTP status.

`ExperimentResult` carries the frame and the payload together because they are derived from the
same call. That is the mechanism that keeps a plotted curve and its CSV from disagreeing.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass, field

import pandas as pd

from mirn.registry import Registry

EXPERIMENTS = Registry("experiment")

_PARAMETER_KINDS: tuple[str, ...] = ("float", "int", "choice")


@dataclass(frozen=True, slots=True)
class ExperimentParameter:
    """One knob an experiment exposes, declared richly enough to generate a UI control from.

    `kind` is an explicit string field rather than a subclass hierarchy so neither the resolver
    nor the frontend needs `isinstance` to decide how to render or coerce it.
    """

    name: str
    label: str
    kind: str
    default: object
    minimum: float | None = None
    maximum: float | None = None
    step: float | None = None
    choices: tuple[str, ...] = field(default_factory=tuple)
    help_text: str = ""

    def __post_init__(self) -> None:
        if len(self.name.strip()) == 0:
            raise ValueError("ExperimentParameter.name must be non-empty")
        if len(self.label.strip()) == 0:
            raise ValueError(f"ExperimentParameter.label must be non-empty for '{self.name}'")
        if self.kind not in _PARAMETER_KINDS:
            raise ValueError(
                f"ExperimentParameter.kind must be one of {', '.join(_PARAMETER_KINDS)}, "
                f"got '{self.kind}' for '{self.name}'"
            )
        if self.kind == "choice":
            if len(self.choices) == 0:
                raise ValueError(
                    f"ExperimentParameter '{self.name}' has kind 'choice' but no choices"
                )
            if self.default not in self.choices:
                raise ValueError(
                    f"ExperimentParameter '{self.name}' default {self.default!r} is not among "
                    f"its choices: {', '.join(self.choices)}"
                )
        else:
            if self.minimum is None or self.maximum is None:
                raise ValueError(
                    f"ExperimentParameter '{self.name}' has numeric kind '{self.kind}' and must "
                    "declare both a minimum and a maximum"
                )
            if self.minimum > self.maximum:
                raise ValueError(
                    f"ExperimentParameter '{self.name}' has minimum {self.minimum} greater than "
                    f"maximum {self.maximum}"
                )

    def as_dict(self) -> dict[str, object]:
        """A JSON-safe declaration the frontend turns into a control."""
        row: dict[str, object] = {}
        row["name"] = self.name
        row["label"] = self.label
        row["kind"] = self.kind
        row["default"] = self.default
        row["minimum"] = self.minimum
        row["maximum"] = self.maximum
        row["step"] = self.step
        row["choices"] = list(self.choices)
        row["help_text"] = self.help_text
        return row


@dataclass(frozen=True, slots=True)
class ExperimentResult:
    """One run's output, in both of the shapes the project needs it in."""

    experiment_name: str
    seed: int
    frame: pd.DataFrame
    payload: dict[str, object]
    method_keys: tuple[str, ...]

    def __post_init__(self) -> None:
        if len(self.experiment_name.strip()) == 0:
            raise ValueError("ExperimentResult.experiment_name must be non-empty")
        if len(self.frame) < 1:
            raise ValueError(
                f"ExperimentResult.frame for '{self.experiment_name}' must have at least one row"
            )
        if len(self.method_keys) == 0:
            raise ValueError(
                f"ExperimentResult.method_keys for '{self.experiment_name}' must name at least "
                "one MethodCard, so the interface always has mathematics to display"
            )

    def as_json(self) -> dict[str, object]:
        """The whole result as JSON-safe primitives, for the API.

        The frame round-trips through pandas' own JSON writer so numpy scalar types become plain
        numbers rather than objects `json.dumps` would reject.
        """
        rows = json.loads(self.frame.to_json(orient="records"))
        blob: dict[str, object] = {}
        blob["experiment_name"] = self.experiment_name
        blob["seed"] = self.seed
        blob["rows"] = rows
        blob["payload"] = self.payload
        blob["method_keys"] = list(self.method_keys)
        return blob


class Experiment(ABC):
    """A named measurement with declared parameters and a two-shaped result."""

    name: str
    title: str
    claim: str
    order: int
    """Where this experiment sits in the page's narrative order (1-indexed), independent of the
    registry's own alphabetical ordering. `EXPERIMENTS.names()` stays sorted by name — that is a
    lookup convenience, not the reading order — so `/api/meta` sorts on this field instead before
    handing the list to the page. Every concrete experiment must declare a unique value; see
    `test_every_registered_experiment_declares_a_unique_order` in `tests/test_experiments.py`."""

    @abstractmethod
    def parameters(self) -> tuple[ExperimentParameter, ...]:
        """Declare every knob this experiment exposes."""
        raise NotImplementedError

    @abstractmethod
    def run(self, params: Mapping[str, object], seed: int) -> ExperimentResult:
        """Run the measurement. Implementations call `self.resolve(params)` first."""
        raise NotImplementedError

    def resolve(self, params: Mapping[str, object]) -> dict[str, object]:
        """Validate `params` against `parameters()`, fill defaults, and coerce to declared kinds.

        Raises ValueError — never KeyError — on an unknown name, an uncoercible value, an
        out-of-range number, or an undeclared choice, so the API layer has exactly one exception
        type to map onto HTTP 400.
        """
        declared = self.parameters()

        by_name: dict[str, ExperimentParameter] = {}
        for parameter in declared:
            if parameter.name in by_name:
                raise ValueError(
                    f"experiment '{self.name}' declares duplicate parameter '{parameter.name}'"
                )
            by_name[parameter.name] = parameter

        for supplied_name in params:
            if supplied_name not in by_name:
                available = ", ".join(by_name.keys())
                raise ValueError(
                    f"unknown parameter '{supplied_name}' for experiment '{self.name}'; "
                    f"declared parameters: {available}"
                )

        resolved: dict[str, object] = {}
        for parameter_name in by_name:
            parameter = by_name[parameter_name]
            if parameter_name in params:
                raw_value = params[parameter_name]
            else:
                raw_value = parameter.default
            resolved[parameter_name] = _coerce(parameter, raw_value)
        return resolved

    def describe(self) -> dict[str, object]:
        """A JSON-safe description the interface builds its controls from."""
        parameter_rows: list[dict[str, object]] = []
        for parameter in self.parameters():
            parameter_rows.append(parameter.as_dict())
        described: dict[str, object] = {}
        described["name"] = self.name
        described["title"] = self.title
        described["claim"] = self.claim
        described["order"] = self.order
        described["parameters"] = parameter_rows
        return described


def _coerce(parameter: ExperimentParameter, raw_value: object) -> object:
    """Coerce one supplied value to its declared kind, or raise ValueError explaining why not."""
    if parameter.kind == "choice":
        text_value = str(raw_value)
        if text_value not in parameter.choices:
            raise ValueError(
                f"parameter '{parameter.name}' got '{text_value}', which is not among its "
                f"choices: {', '.join(parameter.choices)}"
            )
        return text_value

    if parameter.kind == "int":
        try:
            numeric_value: float = float(raw_value)  # type: ignore[arg-type]
        except (TypeError, ValueError) as error:
            raise ValueError(
                f"parameter '{parameter.name}' expects an integer, got {raw_value!r}"
            ) from error
        try:
            coerced: object = int(round(numeric_value))
        except (OverflowError, ValueError) as error:
            raise ValueError(
                f"parameter '{parameter.name}' must be a finite integer, got {raw_value!r}"
            ) from error
    else:
        try:
            coerced = float(raw_value)  # type: ignore[arg-type]
        except (TypeError, ValueError) as error:
            raise ValueError(
                f"parameter '{parameter.name}' expects a number, got {raw_value!r}"
            ) from error

    as_float = float(coerced)  # type: ignore[arg-type]
    if as_float != as_float:
        raise ValueError(f"parameter '{parameter.name}' must be finite, got {raw_value!r}")
    if parameter.minimum is not None and as_float < parameter.minimum:
        raise ValueError(
            f"parameter '{parameter.name}' must be >= {parameter.minimum}, got {as_float}"
        )
    if parameter.maximum is not None and as_float > parameter.maximum:
        raise ValueError(
            f"parameter '{parameter.name}' must be <= {parameter.maximum}, got {as_float}"
        )
    return coerced
