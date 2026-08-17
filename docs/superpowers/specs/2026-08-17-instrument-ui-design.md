# Design — the MIRN instrument UI

**Date:** 2026-08-17
**Status:** approved in chat, pending spec review
**Spec authority:** `docs/research/mirn-research-wayfinder.md` §11 (MVP measurements), §15b (build scope), §16 (milestones 4–5).
**Conventions authority:** `CLAUDE.md` at repo root.
**Predecessor:** `docs/superpowers/plans/measurement-core.md` (Tasks 1–4, complete; 102 tests passing).

---

## 1. Purpose

The measurement core computes the right numbers and shows them to nobody. `identification()` returns
carefully-written prose that no artifact displays, `calibration_report()` returns a DataFrame no caller
invokes, `results/` is never written, and `mirn.viz` — mandated by `CLAUDE.md` — does not exist.

This design adds the layer that makes the instrument legible: a local web application that runs the real
estimators and presents, in order, the four claims the project rests on, with the mathematics of each claim
displayed beside its own output.

The intended reader arrives knowing nothing about the project and leaves understanding why published
perturbation numbers are not trustworthy. The same code path produces the CSVs and figures for the paper.

## 2. Non-goals

- **Not a replacement for `demo/perturbation-playground.html`.** That file stays as it is: a toy social-force
  intuition pump, explicitly not science, explicitly not infrastructure. This application shares no code with
  it and does not supersede it.
- **Not a simulator.** No new physics. The only trajectory generator involved is the existing
  `SyntheticAdapter`.
- **Not a trajectory predictor.** Milestone 6 remains out of scope. The one new estimator introduced here is a
  diagnostic, described in §6.
- **Not a hosted service.** It binds to localhost, it has no authentication, and it is never deployed.

## 3. Architecture and the library/app boundary

```
src/mirn/                    pure library — numpy, scipy, pandas, matplotlib, python-dotenv only
  viz/__init__.py
  viz/theme.py               single source of truth for palette and typography
  viz/figures.py             the two paper figures
  method/__init__.py
  method/cards.py            MethodCard dataclass
  method/catalog.py          one card per registered divergence, estimator, and calibration step
  experiments/__init__.py    EXPERIMENTS registry
  experiments/base.py        Experiment ABC, ExperimentParameter, ExperimentResult
  experiments/calibration_floor.py
  experiments/estimator_comparison.py
  experiments/confounding_sweep.py
  experiments/placebo.py
  estimator/noisy_oracle.py  the diagnostic estimator (§6)
  cli.py                     `mirn run`, `mirn list`, `mirn serve`

src/mirn_app/                a separate top-level package; imports mirn, mirn never imports it
  __init__.py
  server.py                  FastAPI application, routing and serialisation only
  static/index.html
  static/app.js
  static/style.css
  static/vendor/katex/       vendored KaTeX (see §5)
```

**The boundary rule:** `src/mirn/` must remain importable and fully functional with the `app` extra
uninstalled. FastAPI, uvicorn, and every other web dependency appear only under `src/mirn_app/`. This
preserves the intent of the measurement-core plan's Global Constraint 1 — the estimator that gets cited in a
paper must not acquire a web-framework dependency — while allowing the interface to be built properly.

`mirn_app` is a sibling package rather than a subpackage of `mirn` so that the boundary is a namespace
boundary and not a convention. It is always installed; without the `app` extra, `import mirn_app` raises
`ModuleNotFoundError` on FastAPI, which `mirn serve` catches and turns into an actionable message. Nothing
else in the codebase imports it.

`tests/test_boundary.py` enforces the rule by walking every module under `src/mirn/` and asserting that none
of them import a web package or `mirn_app`, and that `import mirn` succeeds. The test reads source with
`ast.parse` rather than importing, so it holds even when the `app` extra happens to be installed.

### `pyproject.toml` changes

```toml
[project.optional-dependencies]
app = ["fastapi", "uvicorn[standard]"]
dev = ["pytest", "hypothesis", "ruff", "httpx"]

[project.scripts]
mirn = "mirn.cli:main"

[tool.setuptools.package-data]
mirn_app = ["static/**/*"]
```

`[tool.setuptools.packages.find] where = ["src"]` is unchanged and picks up both `mirn` and `mirn_app`.
`httpx` joins `dev` because FastAPI's `TestClient` requires it. No other dependency is added.

## 4. `mirn.viz.theme` — one theme, two renderers

`CLAUDE.md` requires that all plot styling live in `mirn.viz.theme` and that nothing set colours or fonts
inline. The application must obey the same rule, so the theme is defined once in Python and consumed twice.

```python
@dataclass(frozen=True, slots=True)
class Palette:
    background: str
    surface: str
    ink: str
    ink_muted: str
    grid: str
    factual: str        # robot present
    counterfactual: str # robot absent
    naive: str          # the estimator being critiqued
    paired: str         # the estimator being proposed
    floor: str          # the MDP band
    accent: str

PALETTE: Palette                                  # module-level constant, dark mode
def matplotlib_rc() -> dict[str, object]: ...     # rcParams for the CSV/paper path
def apply_matplotlib() -> None: ...               # mutates matplotlib.rcParams from matplotlib_rc()
def as_css_tokens() -> dict[str, str]: ...        # {"--mirn-background": "#0b0d10", ...}
def series_colors() -> tuple[str, ...]: ...       # ordered categorical sequence
```

`server.py` calls `as_css_tokens()` and injects the result into the served page as a `:root { ... }` block, so
the browser and matplotlib render the identical palette from the identical constants. Changing a colour is a
one-line edit in `theme.py` that moves both.

Register: dark, minimal, high contrast on data ink, muted chrome. No gradients, no shadows, no chart junk.
Type is a single sans stack for the interface and a mono stack for numerals, so digits align in tables.

`tests/test_viz_theme.py` asserts every `Palette` field is a valid 7-character hex string, that
`as_css_tokens()` covers every field with a `--mirn-` prefix, and that `matplotlib_rc()` sets figure and axes
facecolour from the palette rather than from a literal.

### `mirn.viz.figures`

Exactly two functions in v1, both returning `matplotlib.figure.Figure` and both calling `apply_matplotlib()`
first:

- `null_distribution_figure(null_samples, mdp_95, divergence_name)` — histogram of the split-half null with the
  MDP₉₅ quantile marked. This is the plot §15b calls "the thing other people will cite".
- `confounding_sweep_figure(sweep_frame)` — reported vs true perturbation against predictor error, with the
  MDP band shaded.

Interactive plots in the browser are drawn in JS from the JSON payload; these two exist for the paper and for
`mirn run --figure`. Both consume the same `ExperimentResult`, so a figure cannot disagree with its CSV.

## 5. `mirn.method` — the mathematics as a testable object

The problem this solves: the assumptions are already written, in `identification()`, and are invisible.

```python
@dataclass(frozen=True, slots=True)
class MethodCard:
    key: str                        # exactly a DIVERGENCES or ESTIMATORS registry name, or a
                                    # calibration step key
    kind: str                       # "divergence" | "estimator" | "calibration"
    title: str
    one_liner: str
    estimand_tex: str               # what we are trying to measure
    formula_tex: str                # what the code actually computes
    assumptions: tuple[str, ...]
    breaks_when: tuple[str, ...]
    citation: str | None
```

Validation in `__post_init__`: `key`, `title`, `one_liner`, `estimand_tex`, and `formula_tex` non-empty after
strip; `kind` in `("divergence", "estimator", "calibration")`; `assumptions` and `breaks_when` each non-empty.
`raise ValueError`, never warn. `kind` is an explicit string field precisely so no consumer needs `isinstance`.

`catalog.py` exposes `CARDS: dict[str, MethodCard]` and `card_for(key: str) -> MethodCard`, raising `KeyError`
listing available keys when absent. For estimator cards, the `assumptions` tuple's first element is the
estimator's own `identification()` string, read from the registry rather than retyped, so the assumption text
has exactly one home.

**The coverage gate.** `tests/test_method.py` loops over `DIVERGENCES.names()` and `ESTIMATORS.names()` and
fails if any registered name lacks a card. Registering a new divergence without explaining it becomes a test
failure. It further asserts that every `cvm_residual` and `noisy_oracle_residual` card names the
confounding failure in `breaks_when`, that no `estimand_tex` or `formula_tex` is empty, and that every card
key round-trips through `card_for`.

`breaks_when` is the honest half and the reason the cards are worth building. The `cvm_residual` card's
`breaks_when` states the project's central claim, and the UI renders it directly beneath that estimator's own
number.

### Rendering

Cards store LaTeX because the same strings are reused verbatim in the paper. The page renders them with
**KaTeX, vendored under `src/mirn_app/static/vendor/katex/`** — no CDN, no build step, no network at run time.
Vendoring costs roughly 300 KB committed and buys correct typography with zero toolchain, which is the same
trade the no-build-step frontend decision already made.

## 6. `noisy_oracle_residual` — the one new estimator

Experiment 3 needs a forecaster whose error is a directly settable parameter. `cvm_residual`'s only quality
knob is `horizon_steps`, which is realistic but coarse and non-linear.

`@ESTIMATORS.register("noisy_oracle_residual")` → `NoisyOracleResidual(predictor_error_std: float,
divergence: str = "ade")`. Its forecast for each pedestrian is that pedestrian's **true counterfactual path
plus i.i.d. `N(0, σ²)` per coordinate**, drawn from `numpy.random.default_rng(seed)` inside `estimate`. It
then reports the divergence between that forecast and the observed factual path, exactly as a residual
estimator would.

This is a perfect causal predictor corrupted by a known amount, and it makes the mechanism analytic. Under
`influence = 0.0` the factual and counterfactual arms are bitwise identical, so the true perturbation is
exactly zero and the reported value is entirely predictor error. With the `ade` divergence, the expected
reported value is the mean of a Rayleigh distribution:

    E[reported] = σ · sqrt(π / 2) ≈ 1.2533 · σ

That closed form is a property test, not just a plot annotation.

**It is a diagnostic, never a proposal.** Its `identification()` opens with `UNMET:` in the same register as
`ConstantVelocityResidual`, states that it consults the counterfactual arm only to construct a deliberately
corrupted forecast, and says it exists to demonstrate the confounding rather than to measure anything.
`tests/test_estimator.py` gains an assertion that its `identification()` starts with `UNMET:`.

## 7. `mirn.experiments`

```python
@dataclass(frozen=True, slots=True)
class ExperimentParameter:
    name: str
    label: str
    kind: str                    # "float" | "int" | "choice"
    default: object
    minimum: float | None = None
    maximum: float | None = None
    step: float | None = None
    choices: tuple[str, ...] = ()
    help_text: str = ""

@dataclass(frozen=True, slots=True)
class ExperimentResult:
    experiment_name: str
    seed: int
    frame: pd.DataFrame              # written to results/<name>.csv
    payload: dict[str, object]       # JSON-safe, sent to the browser
    method_keys: tuple[str, ...]     # cards to display alongside

class Experiment(ABC):
    name: str
    title: str
    claim: str                       # the one-sentence claim this experiment establishes
    @abstractmethod
    def parameters(self) -> tuple[ExperimentParameter, ...]: ...
    @abstractmethod
    def run(self, params: Mapping[str, object], seed: int) -> ExperimentResult: ...

EXPERIMENTS = Registry("experiment")
```

`parameters()` is what makes the frontend generic: controls are generated from the Python declaration, so
adding an experiment requires no JavaScript change and no `if name == ...` dispatch on either side of the
wire. `kind` is an explicit string field for the same reason it is on `MethodCard`.

`ExperimentResult.frame` and `ExperimentResult.payload` are derived from the same computation in the same
call, which is the mechanism that keeps the CSV and the on-screen plot in agreement.

Validation: `parameters()` names must be unique; `run` must raise `ValueError` on an unknown parameter name
rather than silently ignoring it; `payload` must survive `json.dumps` (asserted in tests).

### The four experiments

All four construct their data from `SyntheticAdapter`. Only `n_scenes` is exposed as a control; `n_pedestrians`
and `n_steps` are held at module constants (`12` and `60`, the adapter's own defaults) so that a
`confounding_sweep` curve and a `calibration_floor` histogram are always measured on comparable populations.
Raising them to controls later is additive and breaks nothing.

**1. `calibration_floor`** — *A divergence reports a nonzero number even with no robot present.*
Parameters: `divergence` (choice over `ade`, `fde`, `sinkhorn_w2`), `n_scenes` (int), `n_splits` (int).
Builds robot-absent scenes from `SyntheticAdapter(...).load("counterfactual")`, calls the existing
`split_half_null` and `minimum_detectable_perturbation`, and returns the null sample plus MDP₉₅. Frame columns
are exactly those of the existing `calibration_report`: `divergence, n_scenes, n_splits, null_mean, null_sd,
mdp_95, seed`. Payload additionally carries the raw null sample for the histogram.
Method keys: the selected divergence, plus `split_half_null`.

**2. `estimator_comparison`** — *On identical data the naive and paired estimators disagree, and only one
consults the counterfactual arm.*
Parameters: `influence` (float, 0.0–2.0), `divergence` (choice), `horizon_steps` (int), `n_scenes` (int).
Runs `cvm_residual`, `paired`, and `paired_debiased` over the same `RolloutPair`s. The floor
`paired_debiased` needs is computed inside this experiment by calling `minimum_detectable_perturbation` on
the counterfactual arm of those same pairs, at the module constant `_FLOOR_N_SPLITS = 200` and the same seed
— it is **not** read from experiment 1's result, so each experiment is independently runnable and
reproducible from its own row. Frame has one row per estimator with columns
`estimator, divergence, value, ci_low, ci_high, units, n_samples, influence, seed`. Payload adds each
estimator's `identification()` and the MDP₉₅ used.
Method keys: `cvm_residual`, `paired`, `paired_debiased`.

**3. `confounding_sweep`** — *True perturbation pinned at zero; reported perturbation climbs with predictor
error and crosses the detection floor.* This is the wayfinder's "killer plot".
Parameters: `influence` (float, default **0.0**), `axis` (choice: `predictor_noise` | `forecast_horizon`),
`n_points` (int), `n_scenes` (int), `divergence` (choice).
- On the `predictor_noise` axis it sweeps `NoisyOracleResidual(predictor_error_std=σ)` over a σ grid.
- On the `forecast_horizon` axis it sweeps `ConstantVelocityResidual(horizon_steps=h)` over an h grid, using
  a real forecaster degraded the way forecasters actually degrade.

At every sweep point it also runs `paired` on the same pairs, which at `influence = 0.0` returns exactly
`0.0`. `mdp_95` is computed once for the whole sweep, the same way experiment 2 computes it — from the
counterfactual arm of the sweep's own pairs, at `_FLOOR_N_SPLITS` and the sweep's seed — and repeated on
every row so a single CSV row is self-contained.

Frame columns: `axis, axis_value, reported_value, reported_ci_low, reported_ci_high, true_value,
mdp_95, exceeds_floor, influence, divergence, seed`. The payload additionally reports
`floor_crossing_axis_value` — the linearly-interpolated axis value at which `reported_value` first exceeds
`mdp_95`, or `None` if no sweep point exceeds it — which is the single number this experiment exists to
produce: *the predictor error at which a zero-perturbation world reads as a detected perturbation.* The page
renders `None` as "does not cross within the swept range" rather than as a number.
`influence` is exposed as a live control so a reader can watch the reported curve barely move as the true
effect changes, which is the contrast that makes the point.
Method keys: `noisy_oracle_residual` or `cvm_residual` per axis, `paired`, `split_half_null`.

**4. `placebo`** — *Deleting a non-interacting pedestrian does not move the estimate.*
Parameters: `influence` (float), `exclusion_radius_m` (float, default 6.0), `divergence` (choice).
Estimates with the full population, then deletes from both arms one pedestrian never within
`exclusion_radius_m` of the robot, and re-estimates. Frame columns: `variant, n_pedestrians, value, ci_low,
ci_high, delta_vs_full, influence, seed`. Reuses the selection logic from `tests/test_placebo.py`, which is
lifted into `experiments/placebo.py` and imported by the test so the two cannot drift.
Method keys: `paired`.

### CLI

```
mirn list                                          # experiments and their parameters
mirn run <name> [--param k=v ...] [--seed N] [--out PATH] [--figure PATH]
mirn serve [--host 127.0.0.1] [--port 8000]
```

`mirn run` writes the frame to `paths.results_dir() / f"{name}.csv"` by default. `mirn serve` imports
`app.server` lazily and raises a clear actionable error naming `pip install -e ".[app]"` if the extra is
absent — the only place in the codebase aware that `app` exists, and it imports it inside the function body so
the boundary test still passes. `cli.py` is the sole module permitted to `print()`.

## 8. The API

`src/mirn_app/server.py` contains routing and serialisation only. Any logic that appears there is a design failure.

| Route | Returns |
|---|---|
| `GET /` | the page, with `theme.as_css_tokens()` injected as a `:root` block |
| `GET /api/meta` | theme tokens, `default_seed()`, and every experiment's `name/title/claim/parameters()` |
| `POST /api/experiment/{name}` | body `{params: {...}, seed: int}` → `ExperimentResult.payload` plus the frame as records |
| `GET /api/method/{key}` | one `MethodCard` as JSON |
| `GET /api/scene` | query `influence`, `seed`, `scene_index` → factual and counterfactual trajectories for the viewer |
| `POST /api/export` | runs every experiment at the supplied parameters and writes CSVs to `results/`, returning the written paths |

Unknown experiment or method names return HTTP 404 with the available names listed, mirroring the registry's
`KeyError` message. A `ValueError` from a parameter validation becomes HTTP 400 with the message passed
through — the estimators already raise well-written errors, and the UI shows them verbatim rather than
inventing its own copy.

Scene payload size is bounded: 8 scenes × 12 pedestrians × 60 steps × 2 floats is roughly 11.5k numbers,
which is a trivial JSON response. Parameter maxima in `parameters()` keep it that way.

## 9. The page

A single dark scrolling narrative. No framework, no bundler, no build step — one hand-written HTML file, one
stylesheet driven entirely by the injected `--mirn-*` custom properties, and one JS module.

**Header — the scene viewer.** A canvas showing one synthetic scene twice over: counterfactual pedestrian
paths in one colour, factual in another, with displacement vectors between corresponding points and the robot
marked at the box centre. An `influence` slider drives it. This is the visual anchor that makes "paired
counterfactual" concrete before any number appears.

**Four numbered sections**, one per experiment, each with the same internal structure:

1. the claim, as a sentence;
2. controls, generated from `parameters()`;
3. the number with its confidence interval, in a mono face, with units labelled and MDP units used wherever a
   floor is available;
4. the plot, drawn in JS from the payload;
5. **"The mathematics"** — a disclosure panel rendering that step's `MethodCard`s: estimand, formula,
   assumptions, and `breaks_when`.

Section 2's naive-estimator card sits directly under the naive estimator's own output. Section 3 is the
climax: true perturbation flat at zero, reported perturbation rising through the shaded floor band, with the
crossing value called out.

**Interaction.** Controls are debounced at 250 ms and POST to the API; the server runs the real estimators.
Nothing is computed in JavaScript — every number on the page came out of `src/mirn/`. A pending request shows
a subtle inline indicator; a failed one shows the server's error text. Motion is confined to numeric
transitions and plot redraws.

**Footer.** An Export button hitting `POST /api/export`, and the seed, printed, so any screenshot is
reproducible.

## 10. Testing

`pytest -q` must pass at every commit, as it does now (102 tests). New files:

- `tests/test_boundary.py` — `ast`-based check that no module under `src/mirn/` imports a web package; `import
  mirn` succeeds.
- `tests/test_viz_theme.py` — palette hex validity, CSS token coverage, matplotlib rcParams sourced from the
  palette. Golden-file test on `as_css_tokens()` so the theme cannot drift silently.
- `tests/test_method.py` — the coverage gate of §5.
- `tests/test_experiments.py` — for every registered experiment: determinism under a fixed seed (two runs
  produce identical frames), `payload` survives `json.dumps`, declared parameter names are unique, an unknown
  parameter raises `ValueError`, and frame columns match the documented list exactly. Plus, specific to
  `confounding_sweep`, that `true_value` is exactly `0.0` at every sweep point when `influence = 0.0`.
- `tests/test_noisy_oracle.py` — the Rayleigh closed form of §6 within tolerance at several σ; monotonicity in
  σ; `identification()` starts with `UNMET:`.
- `tests/test_app_api.py` — FastAPI `TestClient`, no network: every route returns 200 on valid input, 404 with
  available names on an unknown experiment, 400 with the underlying message on a bad parameter, and
  `/api/meta` lists every registered experiment.
- `tests/test_placebo.py` — extended to import the shared selection logic from `experiments/placebo.py`.

Golden-file tests on calibration outputs, required by `CLAUDE.md`, already exist and are unaffected.

## 11. Phases

Each phase ends green and is committed separately.

| Phase | Content | Gate |
|---|---|---|
| 1 | `viz/theme.py`, `viz/figures.py`, `method/cards.py`, `method/catalog.py` | coverage gate passes for all currently-registered names |
| 2 | `estimator/noisy_oracle.py`, `experiments/*`, `cli.py`, `pyproject` script entry | `mirn run` writes all four CSVs; Rayleigh test passes |
| 3 | `src/mirn_app/server.py`, the `app` extra, `mirn serve` | `test_app_api.py` passes; boundary test passes |
| 4 | `src/mirn_app/static/*`, vendored KaTeX | page renders all four sections against the live API |

## 12. Risks and open items

- **`sinkhorn_w2` cost in an interactive loop.** Sinkhorn over pooled clouds at 200 splits is the slowest path
  in the codebase; the current suite takes 96 s largely because of it. Mitigation: `ade` is the default
  divergence in every experiment's `parameters()`, `n_splits` has a conservative default and a bounded
  maximum, and the UI shows a pending indicator. If interactive latency is still poor, a
  `functools.lru_cache` on `(divergence, n_scenes, n_splits, seed)` inside the calibration experiment is the
  next step — deterministic inputs make caching safe. Not implemented in v1.
- **Vendored KaTeX size.** ~300 KB committed. Accepted; revisit only if the repo becomes distribution-sensitive.
- **`confounding_sweep` on the `predictor_noise` axis is close to tautological by construction.** That is
  intentional — it establishes the mechanism analytically. The `forecast_horizon` axis, using a real
  forecaster, is what establishes that the mechanism bites in practice. Both ship; the page presents them in
  that order and says which is which. Neither is a claim about real pedestrians, and the page states that the
  data is synthetic wherever a number is shown.
- **Synthetic data only.** Every number in v1 comes from `SyntheticAdapter`. The PeRoI path exists but the
  on-disk schema is still `UNVERIFIED`, so it is not wired into the UI. When the schema is confirmed, the
  dataset becomes another `ExperimentParameter` choice and nothing else changes. The page must label its
  numbers synthetic; nothing here is a publishable result.

## 13. Guardrail compliance

| `CLAUDE.md` guardrail | How this design satisfies it |
|---|---|
| Never write a simulator | No new physics; `SyntheticAdapter` only |
| Never fit separate robot-free and robot-conditioned models | No model is fit at all |
| Never report metres outside `mirn.calibration` | UI reports MDP units wherever a floor exists; raw metres are labelled and confined to the pre-calibration section |
| Never return an estimate without `identification` and a CI | Unchanged; the UI now *displays* both |
| Δ_H never in a hard constraint | No planner in scope |
| λ weights stay runtime config | No planner in scope |
| Never report minADE alone | No prediction metrics are reported |
| Never soften an UNVERIFIED marker | PeRoI stays unwired and marked; §12 restates it |
| Plots dark-mode, styling only in `mirn.viz.theme` | §4; the page's CSS is generated from the same constants |
| ABC + registry for every extension point | `Experiment` ABC + `EXPERIMENTS` registry; UI controls generated from `parameters()` so no dispatch chain exists on either side |
| No `isinstance` | Explicit `kind: str` on `MethodCard` and `ExperimentParameter`; registry lookup elsewhere |
| Explicit loops, no comprehensions | Applies to all new code |
| CSV for results | Every experiment writes a flat CSV to `results/` |
| Determinism, explicit seeds | Every experiment takes `seed: int`; determinism is a test |
| `demo/` is not infrastructure | No shared code; `demo/` untouched |
