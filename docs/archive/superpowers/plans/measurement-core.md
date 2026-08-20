# Plan — MIRN measurement core (Milestones 3–5)

**Spec authority:** `docs/research/mirn-research-wayfinder.md` §15b (build scope) and §16 (milestones).
**Conventions authority:** `CLAUDE.md` at repo root. Read it before writing code.

Builds the measurement instrument only: contracts, divergences, the PeRoI adapter, the naive and paired
estimators, and the calibration procedure that produces the detection floor. **Out of scope for this plan:**
the trajectory predictor (Milestone 6), the MPPI policy (Milestone 10), and any simulator harness.

## Global Constraints

Binding on every task. A violation is a spec failure, not a style note.

1. **Python 3.11+.** Dependencies limited to: `numpy`, `scipy`, `pandas`, `matplotlib`, `python-dotenv`,
   and for dev `pytest`, `hypothesis`, `ruff`. Do not add others. Implement Sinkhorn directly in numpy —
   do not depend on POT/`ot`.
2. **Explicit `for` loops with named intermediates.** No list/dict/set comprehensions, no generator
   expressions, no chained or compounded statements. Vectorised numpy is encouraged and is not a
   comprehension; the ban is on Python-level comprehension syntax.
3. **Never use `isinstance()`.** Dispatch via registry lookup, ABC method, or an explicit `kind: str` field.
4. **Every extension point is an ABC in `<package>/base.py` plus a registry entry.** No `if name == ...`
   dispatch chains anywhere.
5. **Frozen dataclasses** — `@dataclass(frozen=True, slots=True)` — for all contract types. Validate in
   `__post_init__` and `raise ValueError`; never warn, never silently coerce.
6. **Full type hints on every public function and method.** `from __future__ import annotations` at the top
   of every module.
7. **Determinism.** Every stochastic function takes an explicit `seed: int` parameter and constructs its own
   `numpy.random.Generator` via `numpy.random.default_rng(seed)`. Never touch global RNG state.
8. **Tests ship in the same commit as the code they cover.** `pytest -q` must pass.
9. **No network access in tests.** Tests use synthetic fixtures only.
10. **No `print()` in library code.** CLI entry points may print; library modules may not.

---

## Task 1 — Package foundation and contracts

Depends on: nothing.

Create `pyproject.toml`, the package skeleton, the typed contracts, and the registry. Everything downstream
imports from here, so the signatures below are exact and must be reproduced verbatim.

### Files

- `pyproject.toml` — project name `mirn`, version `0.1.0`, requires-python `>=3.11`, dependencies and
  optional `dev` extra per Global Constraint 1. Configure `[tool.pytest.ini_options]` with
  `testpaths = ["tests"]`, and `[tool.ruff]` with `line-length = 100`. Use a `src` layout:
  `[tool.setuptools.packages.find] where = ["src"]`.
- `src/mirn/__init__.py` — exports `__version__ = "0.1.0"`.
- `src/mirn/registry.py`
- `src/mirn/contracts.py`
- `src/mirn/paths.py`
- `tests/test_contracts.py`
- `tests/test_registry.py`

### `src/mirn/registry.py`

```python
class Registry:
    def __init__(self, kind: str) -> None: ...
    def register(self, name: str) -> Callable[[type], type]: ...   # decorator
    def get(self, name: str) -> type: ...
    def names(self) -> tuple[str, ...]: ...                        # sorted
    def create(self, name: str, **kwargs: object) -> object: ...   # get(name)(**kwargs)
```

`register` raises `ValueError` on duplicate name. `get` raises `KeyError` whose message lists available
names sorted. `kind` is used only in error messages (e.g. `"divergence"`).

### `src/mirn/contracts.py`

Four frozen dataclasses. Store arrays as `numpy.ndarray` with `dtype=float64`.

```python
@dataclass(frozen=True, slots=True)
class Trajectory:
    agent_id: str
    positions: np.ndarray   # shape (T, 2)
    t0: float
    dt: float
```
Validation: `positions.ndim == 2`, `positions.shape[1] == 2`, `positions.shape[0] >= 1`, `dt > 0`,
all values finite. Properties: `n_steps -> int`, `duration -> float` (`n_steps * dt`),
`times -> np.ndarray` (shape `(T,)`, `t0 + dt * arange(T)`).
Method: `resample_to(self, dt: float) -> Trajectory` — linear interpolation onto the new grid,
preserving `agent_id` and `t0`.

```python
@dataclass(frozen=True, slots=True)
class Scene:
    scene_id: str
    pedestrians: tuple[Trajectory, ...]
    robot: Trajectory | None
    robot_present: bool
    source: str
    seed: int
```
Validation: `robot_present` must be `True` if and only if `robot is not None`; all pedestrian `dt` equal;
pedestrian `agent_id` values unique. Property: `n_pedestrians -> int`.
Method: `pedestrian_by_id(self, agent_id: str) -> Trajectory` — raises `KeyError` if absent.

```python
@dataclass(frozen=True, slots=True)
class RolloutPair:
    factual: Scene
    counterfactual: Scene
```
Validation, all raising `ValueError` with a message naming the violated invariant:
- `factual.seed == counterfactual.seed`
- `factual.robot_present is True`
- `counterfactual.robot_present is False`
- identical pedestrian `agent_id` sets
- for every shared agent, identical first position within `1e-9` and identical `dt`

Method: `paired_agents(self) -> tuple[tuple[Trajectory, Trajectory], ...]` — pairs ordered by `agent_id`.

```python
@dataclass(frozen=True, slots=True)
class PerturbationEstimate:
    value: float
    ci_low: float
    ci_high: float
    units: str                 # "metres" or "mdp"
    identification: str        # non-empty prose naming the assumption
    n_samples: int
    divergence_name: str
    estimator_name: str
```
Validation: `units` in `("metres", "mdp")`; `ci_low <= value <= ci_high`; `identification` non-empty after
strip; `n_samples >= 1`; `value` finite and `>= 0`.
Method: `as_row(self) -> dict[str, object]` — flat dict for CSV writing, keys exactly the field names.

### `src/mirn/paths.py`

Loads `.env` via `python-dotenv` (`load_dotenv()` tolerating a missing file). Functions:
`data_root() -> Path` (from `MIRN_DATA_ROOT`, raises `RuntimeError` with a message telling the user to copy
`.env.example` if unset), `results_dir() -> Path` (from `MIRN_RESULTS_DIR`, default `./results`, created if
missing), `default_seed() -> int` (from `MIRN_SEED`, default `0`).

### Tests

`tests/test_contracts.py` covers: every validation branch above raises `ValueError` (or `KeyError` where
specified); `RolloutPair` rejects a mismatched seed, a robot-present counterfactual, a disjoint agent set,
and a differing initial position; `paired_agents` ordering; `resample_to` round-trips a straight line
exactly; `as_row` keys match the dataclass fields.
`tests/test_registry.py` covers: register/get/create round-trip, duplicate registration raises, unknown
name raises `KeyError` listing available names, `names()` is sorted.

---

## Task 2 — Divergence layer

Depends on: Task 1 (`contracts`, `registry`).

Implements the distance functions the estimators are built from. Pure functions over arrays plus a
registered ABC.

### Files

- `src/mirn/divergence/__init__.py` — exposes `DIVERGENCES` registry and imports the submodules so
  registration happens on package import.
- `src/mirn/divergence/base.py`
- `src/mirn/divergence/displacement.py`
- `src/mirn/divergence/frechet.py`
- `src/mirn/divergence/wasserstein.py`
- `tests/test_divergence.py`

### `base.py`

```python
DIVERGENCES = Registry("divergence")

class Divergence(ABC):
    name: str
    @abstractmethod
    def between_paths(self, a: np.ndarray, b: np.ndarray) -> float: ...
    @abstractmethod
    def between_clouds(self, a: np.ndarray, b: np.ndarray) -> float: ...
```
`between_paths` takes two `(T, 2)` arrays of equal length and returns a non-negative float.
`between_clouds` takes `(N, 2)` and `(M, 2)` point sets, N and M need not match.
Both must return exactly `0.0` for identical inputs and must be invariant to a shared rigid transform.
Where a subclass has no meaningful cloud form, it may raise `NotImplementedError` — but every subclass in
this task implements both.

### `displacement.py`

`@DIVERGENCES.register("ade")` → `AverageDisplacement`: `between_paths` is the mean per-timestep Euclidean
distance; `between_clouds` is the mean distance from each point in `a` to its nearest neighbour in `b`,
symmetrised as the mean of both directions.

`@DIVERGENCES.register("fde")` → `FinalDisplacement`: `between_paths` is the distance at the last timestep;
`between_clouds` uses the centroid distance.

### `frechet.py`

`@DIVERGENCES.register("frechet")` → `DiscreteFrechet`: standard dynamic-programming discrete Fréchet
distance, iterative (not recursive) to avoid stack limits, `O(T·T)` over an explicit DP table.
`between_clouds` raises `NotImplementedError` with a message saying Fréchet is order-dependent.
Correction to the ABC contract for this one class only: `between_clouds` raising here is intended.

### `wasserstein.py`

`@DIVERGENCES.register("sinkhorn_w2")` → `SinkhornW2`, constructor
`__init__(self, epsilon: float = 0.05, max_iter: int = 500, tol: float = 1e-9)`.
Entropic-regularised 2-Wasserstein between empirical point clouds with uniform marginals. Implement in
numpy: squared-Euclidean cost matrix, log-domain Sinkhorn iterations for numerical stability, return the
square root of the resulting transport cost. `between_paths` treats the two paths as clouds of their
points. Must converge and stay finite for `epsilon` down to `0.01` on 200-point clouds.

### Tests

`tests/test_divergence.py` — property tests over every registered divergence, using `hypothesis` where it
fits and explicit loops over `DIVERGENCES.names()` otherwise:
- identity: `d(x, x) == 0.0` exactly
- non-negativity on random inputs
- translation invariance: adding the same constant vector to both inputs leaves the value unchanged
  within `1e-6`
- rotation invariance: applying the same rotation to both inputs leaves the value unchanged within `1e-6`
- monotonicity: for `ade`, translating `b` by `k` units gives exactly `k`
- `SinkhornW2` against a closed form: two clouds each collapsed to a single repeated point separated by
  distance `k` must give `k` within `2e-2` at `epsilon = 0.01`
- `DiscreteFrechet` on a known small example with a hand-computed answer
- `DiscreteFrechet.between_clouds` raises `NotImplementedError`

---

## Task 3 — Dataset layer and PeRoI adapter

Depends on: Task 1 (`contracts`, `registry`, `paths`).

Do **not** download anything. The adapter parses an already-present directory; tests use a synthetic
fixture written to `tmp_path`.

### Files

- `src/mirn/data/__init__.py` — exposes `DATASETS` registry, imports submodules.
- `src/mirn/data/base.py`
- `src/mirn/data/peroi.py`
- `src/mirn/data/synthetic.py`
- `tests/test_data_peroi.py`
- `tests/test_data_synthetic.py`

### `base.py`

```python
DATASETS = Registry("dataset")

class DatasetAdapter(ABC):
    name: str
    @abstractmethod
    def conditions(self) -> tuple[str, ...]: ...
    @abstractmethod
    def load(self, condition: str) -> tuple[Scene, ...]: ...
    @abstractmethod
    def characterize(self) -> pd.DataFrame: ...
```
`characterize` returns one row per condition with columns exactly:
`condition, n_scenes, n_trajectories, n_points, mean_duration_s, mean_speed_ms, median_speed_ms,
frac_robot_present`.

### `peroi.py`

`@DATASETS.register("peroi")` → `PeroiAdapter`, `__init__(self, root: Path | None = None)` defaulting to
`paths.data_root() / "peroi"`.

Conditions are exactly `("PD", "PD-SR", "PD-MR")` — pedestrians only, stationary robot, moving robot.
Sampling rate is **15 Hz** (`dt = 1.0 / 15.0`).

Because the on-disk schema is not yet confirmed, `peroi.py` must isolate it behind a single documented
module-level constant block and one function `_read_condition_frame(self, condition: str) -> pd.DataFrame`
returning a long-format frame with columns `agent_id, frame, x, y, scene_id`. Everything else in the module
works off that frame. Write a module docstring stating the assumed layout, marking it
`UNVERIFIED — confirm against the Zenodo release`, and raise `FileNotFoundError` with an actionable message
when the root is missing.

Also provide `to_rollout_pairs` **only as a documented `NotImplementedError`**: PeRoI's conditions are
different pedestrian populations, not paired counterfactual twins, so a `RolloutPair` cannot be constructed
from it. The error message must say exactly that. This is a deliberate guard against the most likely
misuse of the dataset.

CLI: `python -m mirn.data.peroi characterize --out PATH` writes the `characterize()` frame to CSV.

### `synthetic.py`

`@DATASETS.register("synthetic")` → `SyntheticAdapter`,
`__init__(self, n_scenes: int = 8, n_pedestrians: int = 12, n_steps: int = 60, seed: int = 0)`.

Generates paired data that genuinely satisfies the `RolloutPair` invariants: pedestrians crossing a 20×12 m
box under a constant-velocity model plus seeded Gaussian noise, and a robot that displaces nearby
pedestrians laterally by an amount decaying with distance. Both arms draw the **same** noise from the same
seed, so the only difference is robot influence.

Method `rollout_pairs(self) -> tuple[RolloutPair, ...]`, plus
`rollout_pairs_with_influence(self, influence: float) -> tuple[RolloutPair, ...]` where `influence = 0.0`
must produce pairs whose factual and counterfactual arms are **bitwise identical** in pedestrian positions.
This is the fixture the placebo test depends on, so it must hold exactly.

### Tests

`tests/test_data_synthetic.py`: `influence=0.0` gives exactly-equal arms; increasing `influence` strictly
increases mean paired displacement; all generated pairs construct without raising; determinism — same seed
gives identical arrays.
`tests/test_data_peroi.py`: build a synthetic on-disk fixture matching the documented layout in `tmp_path`,
then assert `conditions()`, `load()` shapes, `characterize()` column names and row count, that `PD` scenes
have `robot_present is False`, that a missing root raises `FileNotFoundError`, and that
`to_rollout_pairs` raises `NotImplementedError`.

---

## Task 4 — Estimators and calibration

Depends on: Task 1 and Task 2. May assume `SyntheticAdapter` from Task 3 exists for tests; if it does not
yet, generate an equivalent local fixture rather than blocking.

This is the scientific core. Two estimators — the naive one we are critiquing and the paired one we
propose — plus the calibration that converts metres into detection-floor units.

### Files

- `src/mirn/estimator/__init__.py` — exposes `ESTIMATORS` registry, imports submodules.
- `src/mirn/estimator/base.py`
- `src/mirn/estimator/residual.py`
- `src/mirn/estimator/paired.py`
- `src/mirn/calibration/__init__.py`
- `src/mirn/calibration/null.py`
- `tests/test_estimator.py`
- `tests/test_placebo.py`
- `tests/test_calibration.py`

### `base.py`

```python
ESTIMATORS = Registry("estimator")

class PerturbationEstimator(ABC):
    name: str
    @abstractmethod
    def identification(self) -> str: ...
    @abstractmethod
    def estimate(self, pairs: Sequence[RolloutPair], seed: int) -> PerturbationEstimate: ...
```
Every `estimate` must bootstrap its confidence interval: 1000 resamples over pairs at the 2.5/97.5
percentiles, using `numpy.random.default_rng(seed)`. Provide a shared helper
`bootstrap_ci(values: np.ndarray, seed: int, n_boot: int = 1000, alpha: float = 0.05) -> tuple[float, float]`
in `base.py` and use it from both estimators.

### `residual.py` — the estimator we are critiquing

`@ESTIMATORS.register("cvm_residual")` → `ConstantVelocityResidual`,
`__init__(self, horizon_steps: int = 16, divergence: str = "ade")`.

Reproduces standard practice: for each pedestrian in the **factual** arm only, fit a constant-velocity
forecast from the two positions at `t - horizon_steps` and roll it forward `horizon_steps`; the residual
against the observed position is reported as perturbation. The counterfactual arm is never consulted.

`identification()` returns a string that explicitly states the assumption is unmet — that the estimate
conflates causal effect with forecast error and is reported for comparison, not belief.

### `paired.py` — the estimator we propose

`@ESTIMATORS.register("paired")` → `PairedCounterfactual`,
`__init__(self, divergence: str = "ade")`.

Uses `RolloutPair.paired_agents()` and the named divergence's `between_paths` over each agent's factual and
counterfactual paths, averaged over agents then over pairs. `identification()` names the assumption:
shared seed and shared exogenous noise across arms, so the only difference is the robot.

Also `@ESTIMATORS.register("paired_debiased")` → `DebiasedPairedCounterfactual`,
`__init__(self, divergence: str = "ade", floor: float = 0.0)` — subtracts a supplied detection floor and
clips at zero, reporting `units="mdp"` by dividing by the floor when `floor > 0`. When `floor == 0.0` it
must raise `ValueError` telling the caller to calibrate first.

### `calibration/null.py`

```python
def split_half_null(scenes: Sequence[Scene], divergence: str, seed: int,
                    n_splits: int = 200) -> np.ndarray: ...
def minimum_detectable_perturbation(null_samples: np.ndarray, alpha: float = 0.05) -> float: ...
def calibration_report(scenes: Sequence[Scene], divergence: str, seed: int) -> pd.DataFrame: ...
```
`split_half_null` repeatedly partitions the pedestrian population into two disjoint halves and computes the
divergence between the halves treated as clouds, returning the sample of null values.
`minimum_detectable_perturbation` returns the `1 - alpha` quantile of that sample.
`calibration_report` returns one row with columns exactly
`divergence, n_scenes, n_splits, null_mean, null_sd, mdp_95, seed`.

### Tests

`tests/test_estimator.py`: `PairedCounterfactual` returns exactly `0.0` on zero-influence synthetic pairs;
its value increases strictly with influence; the bootstrap CI brackets the point estimate; `n_samples`
equals the number of pairs; `identification()` is non-empty for every registered estimator (loop over
`ESTIMATORS.names()`); `DebiasedPairedCounterfactual` raises `ValueError` when `floor == 0.0`.

`tests/test_placebo.py` — **first-class gate.** On zero-influence synthetic pairs the paired estimator must
return `0.0` and its CI must contain `0.0`. Then, with influence enabled, delete one pedestrian that is
never within 6 m of the robot from both arms and assert the estimate changes by less than `1e-9`: removing
a non-interacting agent must not move the estimate. Include a docstring explaining that this test exists
because CausalAgents showed forecasters shift 25–38% relative minADE when provably non-causal agents are
removed.

`tests/test_calibration.py`: null samples are all finite and non-negative; `mdp_95` is greater than the
null median; `calibration_report` column names and single row; determinism under a fixed seed.
