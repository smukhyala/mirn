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

Three families are exported, and they cover everything the table in CLAUDE.md claims Python is the
oracle for:

* `divergence.*` — the distance functions, path form and cloud form.
* `estimator.*` — the paired estimator and the constant-velocity residual, each fed a whole
  `RolloutPair` as literal arrays so the two languages compare the estimator and not their
  scene-building code.
* `calibration.*` — the split-half detection floor. Its permutations travel in the fixture as
  data, because numpy's PCG64 cannot be reproduced in JavaScript without reimplementing a numpy
  internal; both sides therefore run the identical splits and compare only the arithmetic.

Sinkhorn is deliberately absent. Every step of it is `exp`/`log`, neither of which is bit-portable,
and a tolerance-based stopping rule halts at different iteration counts in the two languages — the
class's own measured table shows ~1.2e-3 relative between adjacent stopping points. It stays
Python-only and the browser uses ADE, which is what the demo used anyway.

What these fixtures deliberately do NOT pin is recorded in CLAUDE.md's two-implementation table:
bootstrap CIs, and the two `Estimate` fields whose definitions differ by design.
"""

from __future__ import annotations

import json
import math
from collections.abc import Callable
from pathlib import Path

import numpy as np

from mirn.calibration.null import (
    PermutationSource,
    minimum_detectable_perturbation,
    split_half_null,
)
from mirn.contracts import RolloutPair, Scene, Trajectory
from mirn.divergence import DIVERGENCES
from mirn.estimator import ESTIMATORS

# Bumped from 1 when the estimator and calibration families landed: a case body is no longer
# always `{a, b, expected}`, so a reader that assumed the old shape must stop rather than
# misparse.
SCHEMA_VERSION = 2

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
    # Both estimators are a mean over agents of an ADE, so they inherit ADE's accumulation error
    # and add one more pairwise mean on top. Same order of magnitude, same reasoning.
    "estimator.paired.per_run": {"kind": "relative", "value": 1e-15},
    "estimator.cvm_residual.per_run": {"kind": "relative", "value": 1e-15},
    # Each split is a cloud-form ADE; the floor is `np.quantile(..., method="linear")` over the
    # sorted splits, which the browser reimplements index-for-index. Nothing new accumulates.
    "calibration.split_half_null.floor": {"kind": "relative", "value": 1e-15},
}


# --- divergence family --------------------------------------------------------------------------


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


def _build_divergence_cases(subject: str) -> list[dict[str, object]]:
    _, divergence_name, form = subject.split(".")

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
    return rows


# --- the shared toy crowd -------------------------------------------------------------------------
#
# A generator, not a simulator: pedestrians cross at constant speed with seeded jitter and never
# look at each other. It exists only to produce plausible numbers to freeze into a fixture, and no
# value it produces is a result. The arms are built the same way the analytic placebo fixture
# builds its arms — control first, then the push added on top — so the push is the only difference
# between them and `RolloutPair` accepts the pairing on both sides of the language boundary.

_CROWD_DT = 0.1
_ROBOT_X = 10.0
_ROBOT_Y = 6.0
_PUSH_DECAY_M = 3.0


def _pushed_path(control: np.ndarray, amplitude: float) -> np.ndarray:
    """`control` with a sideways push away from the robot, decaying with distance to it.

    The push is purely lateral (everyone walks along +x), and it is forced to exactly zero at
    step 0. Both arms must agree bitwise at t=0 or `makePairedRun` rejects the pair — its
    first-position check is exact, deliberately stricter than `RolloutPair`'s 1e-9.
    """
    pushed = np.empty_like(control)
    for step in range(control.shape[0]):
        offset_x = control[step, 0] - _ROBOT_X
        offset_y = control[step, 1] - _ROBOT_Y
        distance = math.sqrt(offset_x * offset_x + offset_y * offset_y)

        if offset_y < 0.0:
            lateral_sign = -1.0
        else:
            lateral_sign = 1.0

        push_y = lateral_sign * amplitude * math.exp(-distance / _PUSH_DECAY_M)
        if step == 0:
            push_y = 0.0

        pushed[step, 0] = control[step, 0]
        pushed[step, 1] = control[step, 1] + push_y
    return pushed


def _crowd_arms(
    seed: int,
    n_agents: int,
    n_steps: int,
    amplitude: float,
    parked_from: int | None = None,
) -> tuple[list[np.ndarray], list[np.ndarray], np.ndarray]:
    """`(control_paths, treated_paths, robot_path)` for one toy scene.

    `parked_from` freezes every pedestrian at the position they held on that step. It exists for
    the constant-velocity residual: once a crowd has arrived and stopped, a constant-velocity
    forecast of a stationary person is exactly right and the residual reads exactly 0.0, which is
    a property both languages must reproduce rather than a number either may round away.
    """
    rng = np.random.default_rng(seed)

    control_paths: list[np.ndarray] = []
    treated_paths: list[np.ndarray] = []
    for _ in range(n_agents):
        start_y = float(rng.uniform(1.0, 11.0))
        speed = 1.2 + float(rng.normal(0.0, 0.15))
        if speed < 0.3:
            speed = 0.3
        jitter = rng.normal(0.0, 0.03, size=(n_steps, 2))

        control = np.empty((n_steps, 2), dtype=np.float64)
        for step in range(n_steps):
            control[step, 0] = speed * _CROWD_DT * step + jitter[step, 0]
            control[step, 1] = start_y + jitter[step, 1]

        if parked_from is not None:
            for step in range(parked_from, n_steps):
                control[step, 0] = control[parked_from, 0]
                control[step, 1] = control[parked_from, 1]

        control_paths.append(control)
        treated_paths.append(_pushed_path(control, amplitude))

    robot_path = np.empty((n_steps, 2), dtype=np.float64)
    for step in range(n_steps):
        robot_path[step, 0] = _ROBOT_X
        robot_path[step, 1] = _ROBOT_Y

    return control_paths, treated_paths, robot_path


# --- estimator family ---------------------------------------------------------------------------


def _rollout_pair(
    case_id: str,
    control_paths: list[np.ndarray],
    treated_paths: list[np.ndarray],
    robot_path: np.ndarray,
) -> RolloutPair:
    """Build the oracle's `RolloutPair` from the same arrays the fixture will carry.

    Agent ids are `ped<uid>` because `contracts/trajectory.ts` asserts that spelling: the id is
    the pairing key on both sides and `paired_agents()` sorts by it, so the two languages must
    agree on the name as well as the number.
    """
    factual_pedestrians: list[Trajectory] = []
    counterfactual_pedestrians: list[Trajectory] = []
    for agent_index in range(len(control_paths)):
        agent_id = f"ped{agent_index}"
        factual_pedestrians.append(
            Trajectory(
                agent_id=agent_id,
                positions=treated_paths[agent_index],
                t0=0.0,
                dt=_CROWD_DT,
            )
        )
        counterfactual_pedestrians.append(
            Trajectory(
                agent_id=agent_id,
                positions=control_paths[agent_index],
                t0=0.0,
                dt=_CROWD_DT,
            )
        )

    robot = Trajectory(agent_id="robot", positions=robot_path, t0=0.0, dt=_CROWD_DT)
    factual = Scene(
        scene_id=f"parity_{case_id}",
        pedestrians=tuple(factual_pedestrians),
        robot=robot,
        robot_present=True,
        source="fixture",
        seed=0,
    )
    counterfactual = Scene(
        scene_id=f"parity_{case_id}",
        pedestrians=tuple(counterfactual_pedestrians),
        robot=None,
        robot_present=False,
        source="fixture",
        seed=0,
    )
    return RolloutPair(factual=factual, counterfactual=counterfactual)


def _estimator_case_body(
    case_id: str,
    control_paths: list[np.ndarray],
    treated_paths: list[np.ndarray],
    robot_path: np.ndarray,
) -> dict[str, object]:
    """The literal inputs shared by both estimator subjects, minus the expected value."""
    agents: list[dict[str, object]] = []
    for agent_index in range(len(control_paths)):
        agents.append(
            {
                "agentId": f"ped{agent_index}",
                "agentUid": agent_index,
                "treated": _flatten(treated_paths[agent_index]),
                "control": _flatten(control_paths[agent_index]),
            }
        )

    body: dict[str, object] = {}
    body["id"] = case_id
    body["dt"] = _CROWD_DT
    body["robot"] = _flatten(robot_path)
    body["agents"] = agents
    return body


def _straight_line_scene(n_steps: int) -> tuple[list[np.ndarray], list[np.ndarray], np.ndarray]:
    """One pedestrian walking at exactly constant velocity, with no push at all.

    Pins the estimators' zero points from opposite directions in the same scene: the arms are
    identical so `paired` must read exactly 0.0, and the motion is exactly constant-velocity so
    the residual must read exactly 0.0 too. A tolerance cannot rescue either one.
    """
    path = np.empty((n_steps, 2), dtype=np.float64)
    for step in range(n_steps):
        path[step, 0] = 0.5 * step
        path[step, 1] = 3.0

    robot_path = np.empty((n_steps, 2), dtype=np.float64)
    for step in range(n_steps):
        robot_path[step, 0] = _ROBOT_X
        robot_path[step, 1] = _ROBOT_Y

    return [path], [path.copy()], robot_path


def _hand_checked_scene() -> tuple[list[np.ndarray], list[np.ndarray], np.ndarray]:
    """One agent, three steps, offsets of 0, 1 and 1 metre: `paired` must read exactly 2/3."""
    control = np.array([[0.0, 0.0], [1.0, 0.0], [2.0, 0.0]])
    treated = np.array([[0.0, 0.0], [1.0, 1.0], [2.0, 1.0]])
    robot_path = np.array([[_ROBOT_X, _ROBOT_Y], [_ROBOT_X, _ROBOT_Y], [_ROBOT_X, _ROBOT_Y]])
    return [control], [treated], robot_path


def _estimator_scenes() -> list[tuple[str, list[np.ndarray], list[np.ndarray], np.ndarray]]:
    """The scenes both estimator subjects are measured on, in a fixed order."""
    scenes: list[tuple[str, list[np.ndarray], list[np.ndarray], np.ndarray]] = []

    control, treated, robot = _hand_checked_scene()
    scenes.append(("hand-checked-3-steps", control, treated, robot))

    control, treated, robot = _straight_line_scene(n_steps=12)
    scenes.append(("straight-line-no-push", control, treated, robot))

    control, treated, robot = _crowd_arms(seed=3000, n_agents=3, n_steps=20, amplitude=0.0)
    scenes.append(("identical-arms", control, treated, robot))

    control, treated, robot = _crowd_arms(seed=3001, n_agents=3, n_steps=20, amplitude=1.5)
    scenes.append(("crowd-3x20", control, treated, robot))

    control, treated, robot = _crowd_arms(seed=3002, n_agents=5, n_steps=32, amplitude=0.8)
    scenes.append(("crowd-5x32", control, treated, robot))

    control, treated, robot = _crowd_arms(
        seed=3003, n_agents=4, n_steps=24, amplitude=1.2, parked_from=14
    )
    scenes.append(("crowd-4x24-parked-from-14", control, treated, robot))

    return scenes


# The measurement window for each scene under the constant-velocity residual, as
# `(horizon_steps, end_step)`. Two of these are the point of the whole subject:
# `crowd-4x24-parked-from-14` parks at step 14, so a window ending at 23 sits entirely inside the
# motionless tail and must read exactly 0.0, while the same scene measured at 13 — a window that
# closes before anybody has stopped — reads the residual the estimator would actually report. A
# fixture that only ever measured the end of an episode would agree across languages while
# testing nothing.
_CVM_WINDOWS: dict[str, tuple[int, int]] = {
    "hand-checked-3-steps": (1, 2),
    "straight-line-no-push": (4, 11),
    "identical-arms": (6, 19),
    "crowd-3x20": (6, 19),
    "crowd-5x32": (10, 31),
    "crowd-4x24-parked-from-14": (6, 13),
}

# Measured a second time at the end of the episode, where the crowd has stopped. Separate from
# `_CVM_WINDOWS` because it is the same scene twice, and the pair of readings is the lesson.
_CVM_PARKED_TAIL_SCENE = "crowd-4x24-parked-from-14"
_CVM_PARKED_TAIL_WINDOW = (6, 23)


def _build_estimator_cases(subject: str) -> list[dict[str, object]]:
    _, estimator_name, form = subject.split(".")
    if form != "per_run":
        raise ValueError(f"unknown fixture form '{form}' in subject '{subject}'")

    rows: list[dict[str, object]] = []
    for case_id, control_paths, treated_paths, robot_path in _estimator_scenes():
        pair = _rollout_pair(case_id, control_paths, treated_paths, robot_path)

        if estimator_name == "paired":
            estimator = ESTIMATORS.create("paired", divergence="ade")
            body = _estimator_case_body(case_id, control_paths, treated_paths, robot_path)
            body["expected"] = estimator.estimate([pair], seed=0).value
            rows.append(body)
            continue

        if estimator_name != "cvm_residual":
            raise ValueError(f"unknown fixture subject '{subject}'")

        windows: list[tuple[str, int, int]] = []
        horizon_steps, end_step = _CVM_WINDOWS[case_id]
        windows.append((case_id, horizon_steps, end_step))
        if case_id == _CVM_PARKED_TAIL_SCENE:
            tail_horizon, tail_end = _CVM_PARKED_TAIL_WINDOW
            windows.append((f"{case_id}-measured-in-the-parked-tail", tail_horizon, tail_end))

        for window_id, window_horizon, window_end in windows:
            estimator = ESTIMATORS.create(
                "cvm_residual",
                horizon_steps=window_horizon,
                divergence="ade",
                end_step=window_end,
            )
            body = _estimator_case_body(window_id, control_paths, treated_paths, robot_path)
            body["horizonSteps"] = window_horizon
            body["endStep"] = window_end
            body["expected"] = estimator.estimate([pair], seed=0).value
            rows.append(body)

    return rows


# --- calibration family -------------------------------------------------------------------------


def _literal_permutations(seed: int, n_pedestrians: int, n_splits: int) -> list[list[int]]:
    """Draw the splits once, here, so they can travel in the fixture as data.

    They are drawn from numpy and then written down rather than being reproduced on the other
    side, because reproducing PCG64 in JavaScript would mean reimplementing a numpy internal. The
    splits are therefore not what the parity check is checking — the divergence arithmetic over a
    fixed split is.
    """
    rng = np.random.default_rng(seed)
    permutations: list[list[int]] = []
    for _ in range(n_splits):
        drawn = rng.permutation(n_pedestrians)
        row: list[int] = []
        for index in drawn:
            row.append(int(index))
        permutations.append(row)
    return permutations


def _permutation_source(permutations: list[list[int]]) -> PermutationSource:
    def source(n_pedestrians: int, split_index: int) -> np.ndarray:
        row = permutations[split_index]
        if len(row) != n_pedestrians:
            raise ValueError(
                f"fixture permutation for split {split_index} has {len(row)} entries but the "
                f"pool holds {n_pedestrians} pedestrians"
            )
        return np.asarray(row, dtype=np.intp)

    return source


def _pool_scene(case_id: str, paths: list[np.ndarray]) -> Scene:
    """A robot-absent scene holding the whole pool. The floor is measured on this arm only."""
    pedestrians: list[Trajectory] = []
    for agent_index in range(len(paths)):
        pedestrians.append(
            Trajectory(
                agent_id=f"ped{agent_index}",
                positions=paths[agent_index],
                t0=0.0,
                dt=_CROWD_DT,
            )
        )
    return Scene(
        scene_id=f"parity_{case_id}",
        pedestrians=tuple(pedestrians),
        robot=None,
        robot_present=False,
        source="fixture",
        seed=0,
    )


# `(id, crowd seed, pedestrians, steps, stride, splits, alpha)`.
#
# The alphas and split counts are chosen to land `(n_splits - 1) * (1 - alpha)` on both sides of
# every branch in `np.quantile(method="linear")`: exactly on an index (no interpolation at all),
# below the halfway point, and above it. numpy's lerp is written asymmetrically around 0.5 and the
# browser's is not, so the case that lands above it is the one that would catch the difference.
#
# The strides are not decoration either. A floor measured at stride 3 is a different number from
# the same floor at stride 1 — sparser clouds have larger nearest-neighbour distances — so if the
# two languages ever disagreed about which points survive subsampling, only a fixture that
# subsamples would notice. Both strided cases run a stride that does NOT divide the trajectory
# length (20 % 3 and 21 % 2), because the two sides reach the ragged tail by different routes:
# Python slices `[::stride]` and the browser sizes its buffer with `ceil(nSteps / stride)`. Pick
# lengths that divide evenly and the last-kept-index question never gets asked.
_NULL_CASES: tuple[tuple[str, int, int, int, int, int, float], ...] = (
    ("pool-8-stride1-21-splits", 4000, 8, 18, 1, 21, 0.05),
    ("pool-8-stride3-ragged-12-splits-alpha10", 4001, 8, 20, 3, 12, 0.10),
    ("pool-9-odd-one-dropped-stride2-ragged", 4002, 9, 21, 2, 16, 0.05),
    ("pool-2-smallest-legal-pool", 4003, 2, 10, 1, 4, 0.05),
)


def _build_calibration_cases(subject: str) -> list[dict[str, object]]:
    _, method_name, form = subject.split(".")
    if method_name != "split_half_null" or form != "floor":
        raise ValueError(f"unknown fixture subject '{subject}'")

    rows: list[dict[str, object]] = []
    for case_id, seed, n_pedestrians, n_steps, stride, n_splits, alpha in _NULL_CASES:
        control_paths, _, _ = _crowd_arms(
            seed=seed, n_agents=n_pedestrians, n_steps=n_steps, amplitude=0.0
        )
        permutations = _literal_permutations(seed + 1, n_pedestrians, n_splits)
        scene = _pool_scene(case_id, control_paths)

        samples = split_half_null(
            [scene],
            "ade",
            seed=0,
            n_splits=n_splits,
            permutations=_permutation_source(permutations),
            stride_steps=stride,
        )
        floor = minimum_detectable_perturbation(samples, alpha=alpha)

        paths: list[list[float]] = []
        for path in control_paths:
            paths.append(_flatten(path))

        body: dict[str, object] = {}
        body["id"] = case_id
        body["dt"] = _CROWD_DT
        body["paths"] = paths
        body["permutations"] = permutations
        body["strideSteps"] = stride
        body["alpha"] = alpha
        body["expectedSamples"] = _flatten(samples)
        body["expectedMean"] = float(np.mean(samples))
        body["expected"] = floor
        rows.append(body)

    return rows


# --- assembly ------------------------------------------------------------------------------------

_BUILDERS: dict[str, Callable[[str], list[dict[str, object]]]] = {
    "divergence": _build_divergence_cases,
    "estimator": _build_estimator_cases,
    "calibration": _build_calibration_cases,
}


def build_subject(subject: str) -> dict[str, object]:
    """Compute every case for one subject and return the JSON-safe fixture body."""
    parts = subject.split(".")
    if len(parts) != 3 or parts[0] not in _BUILDERS or subject not in _TOLERANCES:
        known = ", ".join(sorted(_TOLERANCES.keys()))
        raise ValueError(f"unknown fixture subject '{subject}'; known subjects are: {known}")

    build = _BUILDERS[parts[0]]
    rows = build(subject)

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
