"""The Experiment extension point. `resolve` is the single place parameters are validated and
defaulted, so every experiment rejects an unknown parameter identically and the UI can generate
its controls from `parameters()` without knowing which experiment it is rendering."""

from __future__ import annotations

import pandas as pd
import pytest

from mirn.experiments.base import (
    EXPERIMENTS,
    Experiment,
    ExperimentParameter,
    ExperimentResult,
)


def _float_param() -> ExperimentParameter:
    return ExperimentParameter(
        name="influence",
        label="Robot influence",
        kind="float",
        default=1.0,
        minimum=0.0,
        maximum=2.0,
        step=0.1,
        help_text="Strength of the robot's lateral displacement on nearby pedestrians.",
    )


def _choice_param() -> ExperimentParameter:
    return ExperimentParameter(
        name="divergence",
        label="Divergence",
        kind="choice",
        default="ade",
        choices=("ade", "fde"),
        help_text="Which distance function to measure with.",
    )


class _Dummy(Experiment):
    name = "dummy"
    title = "Dummy"
    claim = "Nothing at all."

    def parameters(self) -> tuple[ExperimentParameter, ...]:
        return (_float_param(), _choice_param())

    def run(self, params, seed: int) -> ExperimentResult:
        resolved = self.resolve(params)
        frame = pd.DataFrame([{"influence": resolved["influence"], "seed": seed}])
        payload: dict[str, object] = {}
        payload["influence"] = resolved["influence"]
        return ExperimentResult(
            experiment_name=self.name,
            seed=seed,
            frame=frame,
            payload=payload,
            method_keys=("paired",),
        )


def test_resolve_fills_defaults() -> None:
    resolved = _Dummy().resolve({})
    assert resolved["influence"] == 1.0
    assert resolved["divergence"] == "ade"


def test_resolve_coerces_a_string_to_the_declared_numeric_kind() -> None:
    """The CLI passes --param influence=0.5 as a string; resolve is where it becomes a float."""
    resolved = _Dummy().resolve({"influence": "0.5"})
    assert resolved["influence"] == 0.5
    assert type(resolved["influence"]) is float


def test_resolve_rejects_an_unknown_parameter_naming_the_declared_ones() -> None:
    with pytest.raises(ValueError, match="influence, divergence"):
        _Dummy().resolve({"nonsense": 1})


def test_resolve_rejects_a_value_below_the_minimum() -> None:
    with pytest.raises(ValueError, match="influence"):
        _Dummy().resolve({"influence": -1.0})


def test_resolve_rejects_a_value_above_the_maximum() -> None:
    with pytest.raises(ValueError, match="influence"):
        _Dummy().resolve({"influence": 99.0})


def test_resolve_rejects_a_choice_outside_the_declared_set() -> None:
    with pytest.raises(ValueError, match="frechet"):
        _Dummy().resolve({"divergence": "frechet"})


def test_resolve_rejects_an_uncoercible_numeric() -> None:
    with pytest.raises(ValueError, match="influence"):
        _Dummy().resolve({"influence": "not-a-number"})


def test_duplicate_parameter_names_are_rejected_by_resolve() -> None:
    class _Duplicated(_Dummy):
        def parameters(self) -> tuple[ExperimentParameter, ...]:
            return (_float_param(), _float_param())

    with pytest.raises(ValueError, match="duplicate"):
        _Duplicated().resolve({})


def test_describe_is_json_safe_and_lists_every_parameter() -> None:
    import json

    described = _Dummy().describe()
    assert described["name"] == "dummy"
    assert described["claim"] == "Nothing at all."
    assert len(described["parameters"]) == 2
    json.dumps(described)


def test_choice_parameter_with_no_choices_raises() -> None:
    with pytest.raises(ValueError, match="choices"):
        ExperimentParameter(name="d", label="D", kind="choice", default="a", choices=())


def test_choice_parameter_whose_default_is_not_a_choice_raises() -> None:
    with pytest.raises(ValueError, match="default"):
        ExperimentParameter(name="d", label="D", kind="choice", default="z", choices=("a", "b"))


def test_numeric_parameter_without_bounds_raises() -> None:
    with pytest.raises(ValueError, match="minimum"):
        ExperimentParameter(name="n", label="N", kind="int", default=1)


def test_numeric_parameter_with_inverted_bounds_raises() -> None:
    with pytest.raises(ValueError, match="minimum"):
        ExperimentParameter(
            name="n", label="N", kind="int", default=1, minimum=10.0, maximum=1.0, step=1.0
        )


def test_unknown_parameter_kind_raises() -> None:
    with pytest.raises(ValueError, match="float, int, choice"):
        ExperimentParameter(name="n", label="N", kind="colour", default=1)


def test_experiment_result_rejects_an_empty_frame() -> None:
    with pytest.raises(ValueError, match="frame"):
        ExperimentResult(
            experiment_name="dummy",
            seed=0,
            frame=pd.DataFrame(),
            payload={},
            method_keys=("paired",),
        )


def test_experiment_result_rejects_empty_method_keys() -> None:
    with pytest.raises(ValueError, match="method_keys"):
        ExperimentResult(
            experiment_name="dummy",
            seed=0,
            frame=pd.DataFrame([{"a": 1}]),
            payload={},
            method_keys=(),
        )


def test_experiment_result_as_json_carries_rows_and_payload() -> None:
    import json

    result = _Dummy().run({}, seed=4)
    blob = result.as_json()
    assert blob["experiment_name"] == "dummy"
    assert blob["seed"] == 4
    assert blob["rows"][0]["seed"] == 4
    assert blob["method_keys"] == ["paired"]
    json.dumps(blob)


def test_registry_is_wired() -> None:
    assert EXPERIMENTS.names() == tuple(sorted(EXPERIMENTS.names()))
