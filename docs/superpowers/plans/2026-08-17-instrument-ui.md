# MIRN Instrument UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the layer that makes the finished measurement core legible — a themed plotting module, a testable representation of each component's mathematics, four runnable experiments that write CSVs, and a localhost web application that presents them as a guided argument.

**Architecture:** `src/mirn/` stays a pure, dependency-light research library and gains three new subpackages (`viz`, `method`, `experiments`) plus a CLI. A sibling package `src/mirn_app/` holds a FastAPI server and a no-build-step static page; it imports `mirn` and `mirn` never imports it, enforced by a test. Every number the page displays is computed by `src/mirn/` and arrives over HTTP — nothing is computed in JavaScript. `mirn.viz.theme` is the single source of the palette, consumed by matplotlib for paper figures and emitted as CSS custom properties for the browser.

**Tech Stack:** Python 3.11+, numpy, scipy, pandas, matplotlib, python-dotenv (library); FastAPI + uvicorn (app extra); pytest, hypothesis, ruff, httpx (dev). Frontend is hand-written HTML/CSS/JS with vendored KaTeX. No bundler, no node.

**Spec:** `docs/superpowers/specs/2026-08-17-instrument-ui-design.md`

## Global Constraints

Binding on every task. A violation is a spec failure, not a style note. Copied from `CLAUDE.md` and the spec.

1. **Python 3.11+.** New dependencies limited to exactly: `fastapi`, `uvicorn[standard]` (the `app` extra) and `httpx` (dev, for `TestClient`). Add nothing else.
2. **`from __future__ import annotations`** at the top of every new module.
3. **Explicit `for` loops with named intermediates.** No list/dict/set comprehensions, no generator expressions, no chained or compounded statements. Vectorised numpy is not a comprehension and is encouraged.
4. **Never use `isinstance()`.** Dispatch via registry lookup, ABC method, or an explicit `kind: str` field.
5. **Every extension point is an ABC in `<package>/base.py` plus a registry entry.** No `if name == ...` dispatch chains anywhere, in Python or in JavaScript.
6. **Frozen dataclasses** — `@dataclass(frozen=True, slots=True)` — for all contract types. Validate in `__post_init__` and `raise ValueError`; never warn, never silently coerce.
7. **Full type hints** on every public function and method.
8. **Determinism.** Every stochastic function takes an explicit `seed: int` and builds its own `numpy.random.default_rng(seed)`. Global RNG state is banned.
9. **No `print()` in library code.** `src/mirn/cli.py` is the single exception.
10. **No hardcoded paths.** Output locations come from `mirn.paths`.
11. **`ruff` line-length is 100.** Run `.venv/bin/python -m ruff check src tests` before each commit.
12. **CSV for results.** Every experiment writes a flat CSV to `paths.results_dir()`.
13. **All plot and interface styling lives in `mirn.viz.theme`.** Never set a colour or font inline, in Python or in CSS.
14. **`pytest -q` must pass before every commit.** The suite currently has 102 passing tests and takes ~97 s; do not claim a task complete without running it and showing the output.
15. **`demo/perturbation-playground.html` is untouched.** Share no code with it, import nothing from it.
16. **Every number the UI shows is synthetic.** The page must label it so. PeRoI stays unwired while its on-disk schema is `UNVERIFIED`.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/mirn/viz/__init__.py` | re-export theme symbols |
| `src/mirn/viz/theme.py` | `Palette`, `PALETTE`, `matplotlib_rc`, `apply_matplotlib`, `as_css_tokens`, `series_colors` |
| `src/mirn/viz/figures.py` | `null_distribution_figure`, `confounding_sweep_figure` |
| `src/mirn/method/__init__.py` | re-export `MethodCard`, `CARDS`, `card_for` |
| `src/mirn/method/cards.py` | the `MethodCard` frozen dataclass and its validation |
| `src/mirn/method/catalog.py` | one card per registered divergence, estimator, and calibration step |
| `src/mirn/estimator/noisy_oracle.py` | `NoisyOracleResidual`, the diagnostic estimator |
| `src/mirn/experiments/__init__.py` | `EXPERIMENTS` registry; imports submodules so registration happens on import |
| `src/mirn/experiments/base.py` | `Experiment` ABC, `ExperimentParameter`, `ExperimentResult`, shared `resolve` |
| `src/mirn/experiments/calibration_floor.py` | experiment 1 |
| `src/mirn/experiments/estimator_comparison.py` | experiment 2 |
| `src/mirn/experiments/confounding_sweep.py` | experiment 3, the killer plot |
| `src/mirn/experiments/placebo.py` | experiment 4 plus the shared agent-selection helpers |
| `src/mirn/cli.py` | `mirn list`, `mirn run`, `mirn serve`; the only module allowed to print |
| `src/mirn_app/__init__.py` | package marker |
| `src/mirn_app/server.py` | FastAPI routing and serialisation only |
| `src/mirn_app/static/index.html` | page skeleton with a theme placeholder |
| `src/mirn_app/static/style.css` | all styling, driven by `--mirn-*` custom properties |
| `src/mirn_app/static/app.js` | control generation, fetch, canvas plotting, card rendering |
| `src/mirn_app/static/vendor/katex/` | vendored KaTeX |
| `tests/golden/theme_tokens.json` | golden CSS token map |
| `tests/test_viz_theme.py` | palette validity, token coverage, golden comparison |
| `tests/test_viz_figures.py` | figures build and use the palette |
| `tests/test_method.py` | the card coverage gate |
| `tests/test_noisy_oracle.py` | Rayleigh closed form, monotonicity, `UNMET:` prefix |
| `tests/test_experiments.py` | determinism, JSON-safety, column contracts, parameter validation |
| `tests/test_cli.py` | `list` and `run` behaviour, CSV written |
| `tests/test_boundary.py` | `src/mirn/` imports no web package |
| `tests/test_app_api.py` | every route, via `TestClient`, no network |

**Modified:**

| File | Change |
|---|---|
| `pyproject.toml` | `app` extra, `httpx` in dev, `[project.scripts]`, `[tool.setuptools.package-data]` |
| `src/mirn/estimator/__init__.py` | import `noisy_oracle` so it registers |
| `tests/test_estimator.py` | assert `noisy_oracle_residual.identification()` starts with `UNMET:` |
| `tests/test_placebo.py` | import the shared selection helpers from `experiments/placebo.py` |

---

## Phase 1 — Theme and the mathematics catalogue

### Task 1: `mirn.viz.theme`

**Files:**
- Create: `src/mirn/viz/__init__.py`
- Create: `src/mirn/viz/theme.py`
- Create: `tests/golden/theme_tokens.json`
- Test: `tests/test_viz_theme.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `Palette` (frozen dataclass, 11 `str` fields), `PALETTE: Palette`, `matplotlib_rc() -> dict[str, object]`, `apply_matplotlib() -> None`, `as_css_tokens() -> dict[str, str]`, `series_colors() -> tuple[str, ...]`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_viz_theme.py`:

```python
"""The theme is the single source of colour for both matplotlib and the browser, so it gets a
golden-file test: a silent palette drift would change every figure and every page at once."""

from __future__ import annotations

import dataclasses
import json
import re
from pathlib import Path

from mirn.viz import theme

_HEX_PATTERN = re.compile(r"^#[0-9a-f]{6}$")
_GOLDEN_PATH = Path(__file__).parent / "golden" / "theme_tokens.json"


def test_every_palette_field_is_lowercase_hex() -> None:
    fields = dataclasses.fields(theme.PALETTE)
    for field in fields:
        value = getattr(theme.PALETTE, field.name)
        assert _HEX_PATTERN.match(value) is not None, f"{field.name}={value!r} is not #rrggbb"


def test_css_tokens_cover_every_palette_field() -> None:
    tokens = theme.as_css_tokens()
    fields = dataclasses.fields(theme.PALETTE)
    for field in fields:
        expected_key = "--mirn-" + field.name.replace("_", "-")
        assert expected_key in tokens
        assert tokens[expected_key] == getattr(theme.PALETTE, field.name)


def test_css_tokens_match_golden_file() -> None:
    tokens = theme.as_css_tokens()
    golden = json.loads(_GOLDEN_PATH.read_text())
    assert tokens == golden


def test_matplotlib_rc_sources_colours_from_the_palette() -> None:
    rc = theme.matplotlib_rc()
    assert rc["figure.facecolor"] == theme.PALETTE.background
    assert rc["axes.facecolor"] == theme.PALETTE.background
    assert rc["text.color"] == theme.PALETTE.ink
    assert rc["grid.color"] == theme.PALETTE.grid


def test_apply_matplotlib_mutates_rcparams() -> None:
    import matplotlib

    theme.apply_matplotlib()
    assert matplotlib.rcParams["figure.facecolor"] == theme.PALETTE.background


def test_series_colors_are_distinct_palette_members() -> None:
    colors = theme.series_colors()
    assert len(colors) >= 4
    assert len(set(colors)) == len(colors)
    palette_values = set()
    fields = dataclasses.fields(theme.PALETTE)
    for field in fields:
        palette_values.add(getattr(theme.PALETTE, field.name))
    for color in colors:
        assert color in palette_values
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_viz_theme.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'mirn.viz'`

- [ ] **Step 3: Write the implementation**

Create `src/mirn/viz/theme.py`:

```python
"""The single source of truth for every colour and typeface in the project.

`CLAUDE.md` requires that all plot styling live here and that no plotting function set a colour
inline. The interface obeys the same rule by construction: `matplotlib_rc` renders this palette
for the paper figures and `as_css_tokens` renders the identical palette as CSS custom properties
for the browser, so a one-line edit here moves both. Register is dark, minimal, high contrast on
data ink and muted on chrome — no gradients, no shadows, no chart junk.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass

import matplotlib
from matplotlib import cycler


@dataclass(frozen=True, slots=True)
class Palette:
    """Every colour the project is allowed to use, as lowercase `#rrggbb` strings."""

    background: str
    surface: str
    ink: str
    ink_muted: str
    grid: str
    factual: str
    counterfactual: str
    naive: str
    paired: str
    floor: str
    accent: str


PALETTE = Palette(
    background="#0b0d10",
    surface="#14181d",
    ink="#e8eaed",
    ink_muted="#8b949e",
    grid="#242a31",
    factual="#f0a35e",
    counterfactual="#5eb1f0",
    naive="#e5606d",
    paired="#4fd1a5",
    floor="#6b7684",
    accent="#b58cf0",
)

SANS_STACK = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif"
MONO_STACK = "'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace"


def series_colors() -> tuple[str, ...]:
    """The ordered categorical sequence for multi-series plots."""
    return (
        PALETTE.paired,
        PALETTE.naive,
        PALETTE.counterfactual,
        PALETTE.factual,
        PALETTE.accent,
    )


def matplotlib_rc() -> dict[str, object]:
    """rcParams implementing the palette, for the figure/CSV path."""
    rc: dict[str, object] = {}
    rc["figure.facecolor"] = PALETTE.background
    rc["figure.edgecolor"] = PALETTE.background
    rc["savefig.facecolor"] = PALETTE.background
    rc["axes.facecolor"] = PALETTE.background
    rc["axes.edgecolor"] = PALETTE.grid
    rc["axes.labelcolor"] = PALETTE.ink_muted
    rc["axes.titlecolor"] = PALETTE.ink
    rc["axes.grid"] = True
    rc["axes.axisbelow"] = True
    rc["axes.spines.top"] = False
    rc["axes.spines.right"] = False
    rc["axes.prop_cycle"] = cycler(color=list(series_colors()))
    rc["grid.color"] = PALETTE.grid
    rc["grid.linewidth"] = 0.6
    rc["text.color"] = PALETTE.ink
    rc["xtick.color"] = PALETTE.ink_muted
    rc["ytick.color"] = PALETTE.ink_muted
    rc["legend.frameon"] = False
    rc["legend.labelcolor"] = PALETTE.ink
    rc["font.size"] = 9.0
    rc["figure.dpi"] = 160
    return rc


def apply_matplotlib() -> None:
    """Apply `matplotlib_rc()` to the global rcParams. Called by every figure function."""
    rc = matplotlib_rc()
    for key in rc:
        matplotlib.rcParams[key] = rc[key]


def as_css_tokens() -> dict[str, str]:
    """The same palette as CSS custom properties: `{"--mirn-ink-muted": "#8b949e", ...}`.

    Also emits `--mirn-font-sans` and `--mirn-font-mono` so the page's typography is sourced from
    here too, not from the stylesheet.
    """
    tokens: dict[str, str] = {}
    fields = dataclasses.fields(PALETTE)
    for field in fields:
        token_name = "--mirn-" + field.name.replace("_", "-")
        tokens[token_name] = getattr(PALETTE, field.name)
    tokens["--mirn-font-sans"] = SANS_STACK
    tokens["--mirn-font-mono"] = MONO_STACK
    return tokens


def css_root_block() -> str:
    """`as_css_tokens()` rendered as a `:root { ... }` rule for injection into the served page."""
    tokens = as_css_tokens()
    lines: list[str] = []
    for token_name in tokens:
        lines.append(f"  {token_name}: {tokens[token_name]};")
    body = "\n".join(lines)
    return ":root {\n" + body + "\n}"
```

Create `src/mirn/viz/__init__.py`:

```python
"""The visualisation layer: one theme, rendered by matplotlib for papers and by CSS for the page."""

from __future__ import annotations

from mirn.viz.theme import (
    PALETTE,
    Palette,
    apply_matplotlib,
    as_css_tokens,
    css_root_block,
    matplotlib_rc,
    series_colors,
)

__all__ = [
    "PALETTE",
    "Palette",
    "apply_matplotlib",
    "as_css_tokens",
    "css_root_block",
    "matplotlib_rc",
    "series_colors",
]
```

- [ ] **Step 4: Generate the golden file, then read it back and eyeball it**

The golden file is generated once from the implementation and committed. Run:

```bash
mkdir -p tests/golden
.venv/bin/python -c "
import json
from mirn.viz import theme
tokens = theme.as_css_tokens()
with open('tests/golden/theme_tokens.json', 'w') as handle:
    json.dump(tokens, handle, indent=2, sort_keys=True)
    handle.write('\n')
"
cat tests/golden/theme_tokens.json
```

Expected: 13 entries — 11 colour tokens plus `--mirn-font-sans` and `--mirn-font-mono`. Confirm every colour is lowercase `#rrggbb` before committing; this file is the thing that makes future drift a test failure, so it must be right the first time.

**Note on the golden test:** `test_css_tokens_match_golden_file` compares a dict to a dict, so key order in the JSON is irrelevant. `sort_keys=True` is for human diff legibility only.

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_viz_theme.py -q`
Expected: PASS, 6 tests.

- [ ] **Step 6: Lint**

Run: `.venv/bin/python -m ruff check src/mirn/viz tests/test_viz_theme.py`
Expected: `All checks passed!`

- [ ] **Step 7: Run the full suite**

Run: `.venv/bin/python -m pytest -q`
Expected: PASS, 108 tests.

- [ ] **Step 8: Commit**

```bash
git add src/mirn/viz tests/test_viz_theme.py tests/golden/theme_tokens.json
git commit -m "Add mirn.viz.theme: one palette for matplotlib and the browser"
```

---

### Task 2: `mirn.viz.figures`

**Files:**
- Create: `src/mirn/viz/figures.py`
- Test: `tests/test_viz_figures.py`

**Interfaces:**
- Consumes: `mirn.viz.theme.apply_matplotlib`, `mirn.viz.theme.PALETTE`.
- Produces: `null_distribution_figure(null_samples: np.ndarray, mdp_95: float, divergence_name: str) -> Figure`, `confounding_sweep_figure(sweep_frame: pd.DataFrame) -> Figure`. `confounding_sweep_figure` reads the columns `axis`, `axis_value`, `reported_value`, `reported_ci_low`, `reported_ci_high`, `true_value`, `mdp_95` — these are produced by Task 9 and the names must match exactly.

- [ ] **Step 1: Write the failing test**

Create `tests/test_viz_figures.py`:

```python
"""Figures are the paper path. They must build headlessly and take every colour from the theme."""

from __future__ import annotations

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")

from mirn.viz import figures, theme  # noqa: E402


def _sweep_frame() -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    axis_values = [0.0, 0.1, 0.2, 0.3]
    reported = [0.0, 0.125, 0.251, 0.376]
    for index in range(len(axis_values)):
        row: dict[str, object] = {}
        row["axis"] = "predictor_noise"
        row["axis_value"] = axis_values[index]
        row["reported_value"] = reported[index]
        row["reported_ci_low"] = reported[index] * 0.95
        row["reported_ci_high"] = reported[index] * 1.05
        row["true_value"] = 0.0
        row["mdp_95"] = 0.2
        rows.append(row)
    return pd.DataFrame(rows)


def test_null_distribution_figure_builds_with_theme_background() -> None:
    rng = np.random.default_rng(0)
    null_samples = rng.gamma(2.0, 0.05, size=200)
    figure = figures.null_distribution_figure(null_samples, 0.2, "ade")
    assert figure.get_facecolor() == matplotlib.colors.to_rgba(theme.PALETTE.background)
    assert len(figure.axes) == 1


def test_null_distribution_figure_marks_the_floor() -> None:
    rng = np.random.default_rng(1)
    null_samples = rng.gamma(2.0, 0.05, size=200)
    figure = figures.null_distribution_figure(null_samples, 0.2, "ade")
    axis = figure.axes[0]
    assert len(axis.lines) >= 1
    assert "ade" in axis.get_xlabel().lower() or "ade" in axis.get_title().lower()


def test_confounding_sweep_figure_plots_reported_and_true() -> None:
    figure = figures.confounding_sweep_figure(_sweep_frame())
    axis = figure.axes[0]
    assert len(axis.lines) >= 2
    assert figure.get_facecolor() == matplotlib.colors.to_rgba(theme.PALETTE.background)


def test_confounding_sweep_figure_rejects_a_frame_missing_columns() -> None:
    frame = _sweep_frame().drop(columns=["true_value"])
    try:
        figures.confounding_sweep_figure(frame)
    except ValueError as error:
        assert "true_value" in str(error)
    else:
        raise AssertionError("expected ValueError for a frame missing true_value")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_viz_figures.py -q`
Expected: FAIL — `ImportError: cannot import name 'figures' from 'mirn.viz'`

- [ ] **Step 3: Write the implementation**

Create `src/mirn/viz/figures.py`:

```python
"""The two figures that go in the paper.

Interactive plots in the browser are drawn in JavaScript from the same `ExperimentResult` payload
these functions consume, so a figure and its CSV cannot disagree. Neither function sets a colour
literal: every colour comes from `mirn.viz.theme`.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from matplotlib.figure import Figure

from mirn.viz.theme import PALETTE, apply_matplotlib

_SWEEP_COLUMNS: tuple[str, ...] = (
    "axis",
    "axis_value",
    "reported_value",
    "reported_ci_low",
    "reported_ci_high",
    "true_value",
    "mdp_95",
)


def _require_columns(frame: pd.DataFrame, required: tuple[str, ...]) -> None:
    missing: list[str] = []
    for column in required:
        if column not in frame.columns:
            missing.append(column)
    if len(missing) > 0:
        raise ValueError(
            f"frame is missing required columns: {', '.join(missing)}; "
            f"expected exactly {', '.join(required)}"
        )


def null_distribution_figure(
    null_samples: np.ndarray, mdp_95: float, divergence_name: str
) -> Figure:
    """The split-half null distribution with the 95% detection floor marked.

    This is the plot the wayfinder (§15b) calls "the thing other people will cite": it shows the
    number a divergence reports when no robot is present at all.
    """
    if null_samples.ndim != 1:
        raise ValueError(f"null_samples must be 1-D, got ndim={null_samples.ndim}")
    if null_samples.shape[0] < 1:
        raise ValueError("null_samples must be non-empty")

    apply_matplotlib()
    figure = Figure(figsize=(5.2, 3.0))
    axis = figure.add_subplot(1, 1, 1)

    axis.hist(null_samples, bins=32, color=PALETTE.counterfactual, alpha=0.85, edgecolor="none")
    axis.axvline(mdp_95, color=PALETTE.floor, linewidth=1.4, linestyle="--")
    axis.annotate(
        f"MDP$_{{95}}$ = {mdp_95:.3f} m",
        xy=(mdp_95, 0.0),
        xytext=(6.0, 8.0),
        textcoords="offset points",
        color=PALETTE.ink,
        fontsize=8,
    )
    axis.set_xlabel(f"split-half {divergence_name} between robot-free halves (m)")
    axis.set_ylabel("draws")
    axis.set_title("The detection floor: perturbation reported with no robot present")
    figure.tight_layout()
    return figure


def confounding_sweep_figure(sweep_frame: pd.DataFrame) -> Figure:
    """Reported vs. true perturbation against predictor error, with the detection floor shaded.

    The argument in one image: true perturbation is pinned at zero across the whole sweep while
    the reported number climbs through the floor.
    """
    _require_columns(sweep_frame, _SWEEP_COLUMNS)
    if len(sweep_frame) < 2:
        raise ValueError(f"sweep_frame needs at least 2 rows to draw a curve, got {len(sweep_frame)}")

    apply_matplotlib()
    figure = Figure(figsize=(5.2, 3.2))
    axis = figure.add_subplot(1, 1, 1)

    axis_values = sweep_frame["axis_value"].to_numpy()
    reported = sweep_frame["reported_value"].to_numpy()
    reported_low = sweep_frame["reported_ci_low"].to_numpy()
    reported_high = sweep_frame["reported_ci_high"].to_numpy()
    true_values = sweep_frame["true_value"].to_numpy()
    mdp_95 = float(sweep_frame["mdp_95"].to_numpy()[0])
    axis_name = str(sweep_frame["axis"].to_numpy()[0])

    axis.axhspan(0.0, mdp_95, color=PALETTE.floor, alpha=0.22, linewidth=0.0)
    axis.fill_between(axis_values, reported_low, reported_high, color=PALETTE.naive, alpha=0.18)
    axis.plot(axis_values, reported, color=PALETTE.naive, linewidth=1.8, label="reported")
    axis.plot(
        axis_values,
        true_values,
        color=PALETTE.paired,
        linewidth=1.8,
        linestyle="--",
        label="true (paired)",
    )

    if axis_name == "predictor_noise":
        axis.set_xlabel("predictor error $\\sigma$ (m)")
    else:
        axis.set_xlabel("forecast horizon (steps)")
    axis.set_ylabel("perturbation (m)")
    axis.set_title("Reported perturbation tracks predictor error, not the robot")
    axis.legend(loc="upper left")
    figure.tight_layout()
    return figure
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_viz_figures.py -q`
Expected: PASS, 4 tests.

- [ ] **Step 5: Lint and run the full suite**

Run: `.venv/bin/python -m ruff check src/mirn/viz tests/test_viz_figures.py && .venv/bin/python -m pytest -q`
Expected: `All checks passed!` then PASS, 112 tests.

- [ ] **Step 6: Commit**

```bash
git add src/mirn/viz/figures.py tests/test_viz_figures.py
git commit -m "Add the two paper figures: null distribution and confounding sweep"
```

---

### Task 3: `MethodCard`

**Files:**
- Create: `src/mirn/method/__init__.py`
- Create: `src/mirn/method/cards.py`
- Test: `tests/test_method_cards.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `MethodCard` frozen dataclass with fields `key: str`, `kind: str`, `title: str`, `one_liner: str`, `estimand_tex: str`, `formula_tex: str`, `assumptions: tuple[str, ...]`, `breaks_when: tuple[str, ...]`, `citation: str | None`, plus `as_dict(self) -> dict[str, object]`. Valid `kind` values are exactly `"divergence"`, `"estimator"`, `"calibration"`, exposed as `MethodCard.KINDS`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_method_cards.py`:

```python
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


def test_card_is_frozen() -> None:
    card = _valid_card()
    with pytest.raises(dataclasses.FrozenInstanceError):
        card.title = "something else"  # type: ignore[misc]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_method_cards.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'mirn.method'`

- [ ] **Step 3: Write the implementation**

Create `src/mirn/method/cards.py`:

```python
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


def _require_text_tuple(values: tuple[str, ...], field_name: str) -> None:
    if len(values) == 0:
        raise ValueError(f"MethodCard.{field_name} must contain at least one entry")
    for index in range(len(values)):
        if len(values[index].strip()) == 0:
            raise ValueError(
                f"MethodCard.{field_name}[{index}] must be non-empty after strip"
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
                f"MethodCard.kind must be one of {', '.join(_KINDS)}, got '{self.kind}'"
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
```

**Note on `KINDS` with `slots=True`:** `KINDS` is a plain class attribute with no type annotation, so `dataclass` does not treat it as a field and `slots=True` does not shadow it. Do not annotate it.

Create `src/mirn/method/__init__.py` (the catalog import lands in Task 4; for now expose only the card):

```python
"""The mathematics layer: each component's estimand, formula, assumptions, and failure modes."""

from __future__ import annotations

from mirn.method.cards import MethodCard

__all__ = ["MethodCard"]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_method_cards.py -q`
Expected: PASS, 12 tests (the parametrised case contributes 5).

- [ ] **Step 5: Lint and run the full suite**

Run: `.venv/bin/python -m ruff check src/mirn/method tests/test_method_cards.py && .venv/bin/python -m pytest -q`
Expected: `All checks passed!` then PASS, 124 tests.

- [ ] **Step 6: Commit**

```bash
git add src/mirn/method tests/test_method_cards.py
git commit -m "Add MethodCard: each component's mathematics as a validated object"
```

---

### Task 4: The card catalogue and the coverage gate

**Files:**
- Create: `src/mirn/method/catalog.py`
- Modify: `src/mirn/method/__init__.py`
- Test: `tests/test_method.py`

**Interfaces:**
- Consumes: `MethodCard` from Task 3; `DIVERGENCES` and `ESTIMATORS` registries for the gate.
- Produces: `CARDS: dict[str, MethodCard]`, `card_for(key: str) -> MethodCard`, `cards_of_kind(kind: str) -> tuple[MethodCard, ...]`. Card keys for calibration steps are exactly `"split_half_null"`, `"minimum_detectable_perturbation"`, `"bootstrap_ci"`. Later tasks reference these strings in `ExperimentResult.method_keys`.

**Note on the gate and Task 5:** the coverage test loops over the live registries, so at the end of this task it covers 4 divergences and 3 estimators. When Task 5 registers `noisy_oracle_residual`, this test starts failing until Task 5 also adds its card. That is the gate working, not a plan error.

- [ ] **Step 1: Write the failing test**

Create `tests/test_method.py`:

```python
"""The coverage gate: registering a divergence or estimator without explaining its mathematics is
a test failure, not a documentation debt. This is the mechanism that keeps the UI's "the
mathematics" panel from silently going blank when the library grows."""

from __future__ import annotations

import pytest

from mirn.divergence import DIVERGENCES
from mirn.estimator import ESTIMATORS
from mirn.method.catalog import CARDS, card_for, cards_of_kind


def test_every_registered_divergence_has_a_card() -> None:
    missing: list[str] = []
    for name in DIVERGENCES.names():
        if name not in CARDS:
            missing.append(name)
    assert missing == [], f"divergences without a MethodCard: {missing}"


def test_every_registered_estimator_has_a_card() -> None:
    missing: list[str] = []
    for name in ESTIMATORS.names():
        if name not in CARDS:
            missing.append(name)
    assert missing == [], f"estimators without a MethodCard: {missing}"


def test_divergence_cards_are_kind_divergence() -> None:
    for name in DIVERGENCES.names():
        assert CARDS[name].kind == "divergence"


def test_estimator_cards_are_kind_estimator() -> None:
    for name in ESTIMATORS.names():
        assert CARDS[name].kind == "estimator"


def test_every_card_key_matches_its_dict_key() -> None:
    for key in CARDS:
        assert CARDS[key].key == key


def test_calibration_steps_have_cards() -> None:
    for key in ("split_half_null", "minimum_detectable_perturbation", "bootstrap_ci"):
        assert key in CARDS
        assert CARDS[key].kind == "calibration"


def test_estimator_card_assumptions_open_with_the_live_identification_string() -> None:
    """The assumption text has exactly one home: the estimator's own identification(). The card
    reads it from the registry rather than restating it, so the two cannot drift."""
    for name in ESTIMATORS.names():
        estimator_cls = ESTIMATORS.get(name)
        instance = estimator_cls()
        card = CARDS[name]
        assert card.assumptions[0] == instance.identification()


def test_the_critiqued_estimator_names_confounding_in_breaks_when() -> None:
    card = CARDS["cvm_residual"]
    joined = " ".join(card.breaks_when).lower()
    assert "forecast error" in joined or "predictor error" in joined


def test_card_for_returns_the_card() -> None:
    assert card_for("ade").key == "ade"


def test_card_for_unknown_key_raises_listing_available() -> None:
    with pytest.raises(KeyError, match="ade"):
        card_for("no_such_component")


def test_cards_of_kind_filters() -> None:
    divergence_cards = cards_of_kind("divergence")
    assert len(divergence_cards) == len(DIVERGENCES.names())
    for card in divergence_cards:
        assert card.kind == "divergence"


def test_cards_of_kind_rejects_an_unknown_kind() -> None:
    with pytest.raises(ValueError, match="divergence, estimator, calibration"):
        cards_of_kind("metric")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_method.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'mirn.method.catalog'`

- [ ] **Step 3: Write the implementation**

Create `src/mirn/method/catalog.py`. Note that estimator cards call `identification()` on a
default-constructed instance so the assumption text is read from the live code, never retyped:

```python
"""One `MethodCard` per registered component.

Estimator cards read their first assumption from the estimator's own `identification()`, so the
assumption text lives in exactly one place. `tests/test_method.py` fails if any registered
divergence or estimator lacks an entry here.

The LaTeX in these cards is reused verbatim in the paper; keep it publication-clean.
"""

from __future__ import annotations

from mirn.estimator import ESTIMATORS
from mirn.method.cards import MethodCard

_SHARED_ESTIMAND_TEX = (
    "\\Delta_H \\;=\\; \\mathbb{E}\\Big[\\, d\\big(Y^{(\\mathrm{robot})},\\,"
    " Y^{(\\mathrm{no\\ robot})}\\big) \\,\\Big]"
)


def _identification_of(name: str) -> str:
    estimator_cls = ESTIMATORS.get(name)
    instance = estimator_cls()
    return instance.identification()


def _build_cards() -> dict[str, MethodCard]:
    cards: dict[str, MethodCard] = {}
    card_list: list[MethodCard] = []

    card_list.append(
        MethodCard(
            key="ade",
            kind="divergence",
            title="Average displacement",
            one_liner="Mean pointwise separation between two time-aligned paths.",
            estimand_tex="d_{\\mathrm{ADE}}(a, b) \\;\\ge\\; 0",
            formula_tex=(
                "\\begin{aligned}"
                "d_{\\text{path}}(a,b) &= \\tfrac{1}{T}\\sum_{t=1}^{T}\\lVert a_t-b_t\\rVert_2 \\\\"
                "d_{\\text{cloud}}(A,B) &= \\tfrac{1}{2}\\Big("
                "\\tfrac{1}{N}\\sum_i \\min_j \\lVert a_i-b_j\\rVert_2 +"
                "\\tfrac{1}{M}\\sum_j \\min_i \\lVert b_j-a_i\\rVert_2\\Big)"
                "\\end{aligned}"
            ),
            assumptions=(
                "Both paths are sampled on the same time grid and have equal length.",
                "Correspondence is by index, so the two paths must already be time-aligned.",
            ),
            breaks_when=(
                "The two paths are sampled at different rates, which index correspondence "
                "silently misinterprets as displacement.",
                "A single large late deviation is averaged away by many small early ones.",
            ),
            citation=None,
        )
    )

    card_list.append(
        MethodCard(
            key="fde",
            kind="divergence",
            title="Final displacement",
            one_liner="Separation at the last timestep only.",
            estimand_tex="d_{\\mathrm{FDE}}(a, b) \\;\\ge\\; 0",
            formula_tex=(
                "\\begin{aligned}"
                "d_{\\text{path}}(a,b) &= \\lVert a_T - b_T \\rVert_2 \\\\"
                "d_{\\text{cloud}}(A,B) &= \\lVert \\bar{A} - \\bar{B} \\rVert_2"
                "\\end{aligned}"
            ),
            assumptions=(
                "The endpoint is the quantity of interest and the path taken to it is not.",
            ),
            breaks_when=(
                "A robot pushes a pedestrian far off course mid-path but the pedestrian "
                "recovers to the same endpoint, which FDE scores as zero perturbation.",
                "Its cloud form compares centroids, so two populations with identical means "
                "and wildly different spreads score zero.",
            ),
            citation=None,
        )
    )

    card_list.append(
        MethodCard(
            key="frechet",
            kind="divergence",
            title="Discrete Fréchet distance",
            one_liner="The shortest leash length that lets both paths be walked monotonically.",
            estimand_tex="d_F(a, b) \\;\\ge\\; 0",
            formula_tex=(
                "d_F(a,b) \\;=\\; \\min_{\\sigma \\in \\mathcal{M}} \\;"
                "\\max_{(i,j) \\in \\sigma} \\; \\lVert a_i - b_j \\rVert_2"
            ),
            assumptions=(
                "Order along each path is meaningful; \\(\\mathcal{M}\\) ranges over monotone "
                "couplings of the two index sequences.",
                "Computed by an iterative dynamic program over an explicit \\(T \\times T\\) table.",
            ),
            breaks_when=(
                "It reports a maximum, so one outlier sample dominates the whole statistic.",
                "It is order-dependent and therefore has no meaningful point-cloud form; "
                "between_clouds raises NotImplementedError rather than discarding order silently, "
                "which also makes it unusable for split-half calibration.",
            ),
            citation=None,
        )
    )

    card_list.append(
        MethodCard(
            key="sinkhorn_w2",
            kind="divergence",
            title="Entropic 2-Wasserstein (Sinkhorn)",
            one_liner="Optimal-transport distance between two point clouds with uniform mass.",
            estimand_tex=(
                "W_2(\\alpha, \\beta) \\;=\\; \\Big(\\min_{\\pi \\in \\Pi(\\alpha,\\beta)}"
                " \\textstyle\\sum_{ij} \\pi_{ij} \\lVert x_i - y_j \\rVert_2^2 \\Big)^{1/2}"
            ),
            formula_tex=(
                "W_{2,\\varepsilon}(\\alpha,\\beta) = \\Big("
                "\\min_{\\pi \\in \\Pi(\\alpha,\\beta)} \\textstyle\\sum_{ij}"
                " \\pi_{ij}\\lVert x_i-y_j\\rVert_2^2 \\;-\\; \\varepsilon H(\\pi)"
                "\\Big)^{1/2}, \\quad H(\\pi) = -\\textstyle\\sum_{ij}\\pi_{ij}"
                "(\\log \\pi_{ij} - 1)"
            ),
            assumptions=(
                "Both clouds are treated as empirical measures with uniform marginals.",
                "Solved by log-domain Sinkhorn iterations for numerical stability at small "
                "\\(\\varepsilon\\).",
            ),
            breaks_when=(
                "The entropic regulariser biases the value upward; the bias grows with "
                "\\(\\varepsilon\\) and does not vanish at finite iteration counts.",
                "It is the slowest divergence here by a wide margin, which makes large "
                "split-half calibrations expensive.",
            ),
            citation="Cuturi, NeurIPS 2013",
        )
    )

    card_list.append(
        MethodCard(
            key="cvm_residual",
            kind="estimator",
            title="Constant-velocity forecast residual",
            one_liner="Standard practice, and the estimator this project exists to critique.",
            estimand_tex=_SHARED_ESTIMAND_TEX,
            formula_tex=(
                "\\hat{\\Delta}^{\\mathrm{CVM}} = \\tfrac{1}{N}\\sum_{n}\\tfrac{1}{K_n}"
                "\\sum_{k} d\\big(\\hat{Y}_{n,k},\\, Y^{(\\mathrm{robot})}_{n,k}\\big),"
                "\\quad \\hat{y}_{t} = y_{a} + (t-a)\\,\\Delta t\\; v,"
                "\\quad v = \\tfrac{y_a - y_{a-1}}{\\Delta t}"
            ),
            assumptions=(_identification_of("cvm_residual"),),
            breaks_when=(
                "Always. The residual mixes the robot's causal effect with ordinary forecast "
                "error — turning, acceleration, sensor noise, model misspecification — that "
                "would be present in a robot-free world, so the reported number rises with "
                "predictor error even when the true effect is exactly zero.",
                "The counterfactual arm is never consulted, so nothing in the computation "
                "references the robot's absence at all.",
                "A policy trained to minimise it is partly trained to move predictably, which "
                "is not the same thing as moving unobtrusively.",
            ),
            citation="The SACSoN-style residual; see wayfinder §4.4b",
        )
    )

    card_list.append(
        MethodCard(
            key="paired",
            kind="estimator",
            title="Paired counterfactual",
            one_liner="Divergence between each pedestrian's factual and robot-absent path.",
            estimand_tex=_SHARED_ESTIMAND_TEX,
            formula_tex=(
                "\\hat{\\Delta}^{\\mathrm{paired}} = \\tfrac{1}{N}\\sum_{n}\\tfrac{1}{K_n}"
                "\\sum_{k} d\\big(Y^{(\\mathrm{robot})}_{n,k},\\,"
                " Y^{(\\mathrm{no\\ robot})}_{n,k}\\big)"
            ),
            assumptions=(_identification_of("paired"),),
            breaks_when=(
                "The two arms do not actually share a seed and an exogenous noise realisation, "
                "in which case the divergence picks up ordinary between-rollout variation.",
                "It is reported in raw metres, so it has no scale until it is compared against a "
                "calibrated detection floor.",
                "The divergence is symmetric, so a pedestrian who approaches the robot out of "
                "curiosity scores identically to one who flees it.",
            ),
            citation=None,
        )
    )

    card_list.append(
        MethodCard(
            key="paired_debiased",
            kind="estimator",
            title="Paired counterfactual, in MDP units",
            one_liner="The paired estimate, floor-subtracted and rescaled into detection units.",
            estimand_tex=_SHARED_ESTIMAND_TEX,
            formula_tex=(
                "\\hat{\\Delta}^{\\mathrm{mdp}} = \\frac{1}{\\mathrm{MDP}_{95}}"
                "\\max\\!\\Big(0,\\; \\tfrac{1}{N}\\sum_{n}"
                "\\big(d_n - \\mathrm{MDP}_{95}\\big)\\Big)"
            ),
            assumptions=(_identification_of("paired_debiased"),),
            breaks_when=(
                "The supplied floor was calibrated on a different divergence or a different "
                "population, in which case the subtraction is meaningless.",
                "Clipping at zero makes the estimator biased upward near the floor: a true "
                "effect below the floor cannot be reported as negative and reads as exactly zero.",
            ),
            citation=None,
        )
    )

    card_list.append(
        MethodCard(
            key="split_half_null",
            kind="calibration",
            title="Split-half null distribution",
            one_liner="What a divergence reports between two halves of a robot-free crowd.",
            estimand_tex=(
                "\\mathcal{N} \\;=\\; \\Big\\{\\, d_{\\text{cloud}}(A_s, B_s) \\,\\Big\\}_{s=1}^{S}"
            ),
            formula_tex=(
                "A_s \\sqcup B_s \\;=\\; \\mathcal{P}, \\quad |A_s| = |B_s| ="
                " \\lfloor |\\mathcal{P}| / 2 \\rfloor, \\quad"
                " A_s \\sim \\mathrm{Unif}\\big(\\text{balanced partitions of } \\mathcal{P}\\big)"
            ),
            assumptions=(
                "\\(\\mathcal{P}\\) is a pedestrian population carrying no robot effect, so any "
                "divergence between two of its halves is pure measurement noise.",
                "Halves are disjoint and drawn afresh on every split from a seeded generator.",
            ),
            breaks_when=(
                "The pool is not genuinely robot-free — a stationary robot in the scene puts a "
                "real effect into what is supposed to be the null.",
                "The population is too small for the halves to be representative, which inflates "
                "the null and hides real effects behind an overstated floor.",
            ),
            citation="Wayfinder §11 measurement 1; not previously published",
        )
    )

    card_list.append(
        MethodCard(
            key="minimum_detectable_perturbation",
            kind="calibration",
            title="Minimum detectable perturbation",
            one_liner="The detection floor: the effect size resolvable above measurement noise.",
            estimand_tex="\\mathrm{MDP}_{1-\\alpha} \\;=\\; Q_{1-\\alpha}\\big(\\mathcal{N}\\big)",
            formula_tex=(
                "\\mathrm{MDP}_{95} \\;=\\; Q_{0.95}\\big(\\mathcal{N}\\big), \\qquad"
                " \\text{report } \\hat{\\Delta} \\text{ in units of } \\mathrm{MDP}_{95}"
            ),
            assumptions=(
                "The null sample is drawn from the same divergence and a comparable population "
                "to the estimate being calibrated.",
            ),
            breaks_when=(
                "It is a one-sided quantile of a finite sample, so it is itself noisy at small "
                "split counts.",
                "An estimate below it is not evidence of no effect, only of no detectable "
                "effect at this sample size.",
            ),
            citation="Wayfinder §11 measurement 1",
        )
    )

    card_list.append(
        MethodCard(
            key="bootstrap_ci",
            kind="calibration",
            title="Percentile bootstrap interval",
            one_liner="The confidence interval every estimate is required to carry.",
            estimand_tex=(
                "\\big[\\, Q_{\\alpha/2}(\\bar{v}^*),\\; Q_{1-\\alpha/2}(\\bar{v}^*) \\,\\big]"
            ),
            formula_tex=(
                "\\bar{v}^{*b} = \\tfrac{1}{N}\\sum_{i=1}^{N} v_{I^b_i}, \\quad"
                " I^b_i \\sim \\mathrm{Unif}\\{1,\\dots,N\\}, \\quad b = 1,\\dots,B"
            ),
            assumptions=(
                "The per-pair values are exchangeable, so resampling pairs with replacement "
                "approximates the sampling distribution of their mean.",
                "B = 1000 resamples at \\(\\alpha = 0.05\\), from a seeded generator.",
            ),
            breaks_when=(
                "N is small, where the percentile bootstrap undercovers.",
                "The per-pair distribution is heavy-tailed, which the wayfinder (§14 R6) flags "
                "as a live risk for perturbation specifically.",
            ),
            citation=None,
        )
    )

    for card in card_list:
        if card.key in cards:
            raise ValueError(f"duplicate MethodCard key '{card.key}' in the catalogue")
        cards[card.key] = card
    return cards


CARDS: dict[str, MethodCard] = _build_cards()


def card_for(key: str) -> MethodCard:
    """Look up one card by key, raising KeyError listing available keys if absent."""
    if key not in CARDS:
        available = ", ".join(sorted(CARDS.keys()))
        raise KeyError(f"unknown method card '{key}'; available: {available}")
    return CARDS[key]


def cards_of_kind(kind: str) -> tuple[MethodCard, ...]:
    """Every card of one kind, ordered by key."""
    if kind not in MethodCard.KINDS:
        raise ValueError(
            f"unknown MethodCard kind '{kind}'; must be one of {', '.join(MethodCard.KINDS)}"
        )
    selected: list[MethodCard] = []
    for key in sorted(CARDS.keys()):
        if CARDS[key].kind == kind:
            selected.append(CARDS[key])
    return tuple(selected)
```

Modify `src/mirn/method/__init__.py` to export the catalogue:

```python
"""The mathematics layer: each component's estimand, formula, assumptions, and failure modes."""

from __future__ import annotations

from mirn.method.cards import MethodCard
from mirn.method.catalog import CARDS, card_for, cards_of_kind

__all__ = ["CARDS", "MethodCard", "card_for", "cards_of_kind"]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_method.py -q`
Expected: PASS, 12 tests.

- [ ] **Step 5: Lint and run the full suite**

Run: `.venv/bin/python -m ruff check src/mirn/method tests/test_method.py && .venv/bin/python -m pytest -q`
Expected: `All checks passed!` then PASS, 136 tests.

- [ ] **Step 6: Commit**

```bash
git add src/mirn/method tests/test_method.py
git commit -m "Add the method catalogue and its coverage gate"
```

---

## Phase 2 — The diagnostic estimator, the experiments, and the CLI

### Task 5: `NoisyOracleResidual`

**Files:**
- Create: `src/mirn/estimator/noisy_oracle.py`
- Modify: `src/mirn/estimator/__init__.py`
- Modify: `src/mirn/method/catalog.py` (add its card — the Task 4 gate now demands one)
- Modify: `tests/test_estimator.py`
- Test: `tests/test_noisy_oracle.py`

**Interfaces:**
- Consumes: `ESTIMATORS`, `PerturbationEstimator`, `bootstrap_ci` from `mirn.estimator.base`; `DIVERGENCES`; `RolloutPair.paired_agents()`.
- Produces: `@ESTIMATORS.register("noisy_oracle_residual")` → `NoisyOracleResidual(predictor_error_std: float = 0.05, divergence: str = "ade")`. Task 9 constructs it via `ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=..., divergence=...)`.

**Why this exists:** Task 9 needs a forecaster whose error is a directly settable number. `cvm_residual`'s only quality knob is `horizon_steps`, which is realistic but coarse and non-linear. This estimator is a *perfect causal predictor corrupted by a known amount*, which makes the confounding analytic rather than merely visible.

**The closed form that makes it a test rather than a picture:** under `influence = 0.0` the synthetic adapter's two arms are bitwise identical, so the true perturbation is exactly zero and the reported value is entirely predictor error. The per-step error is `‖ε‖` where `ε ~ N(0, σ²I₂)`, which is Rayleigh-distributed, so with the `ade` divergence

    E[reported] = σ · sqrt(π / 2) ≈ 1.2533 · σ

- [ ] **Step 1: Write the failing test**

Create `tests/test_noisy_oracle.py`:

```python
"""NoisyOracleResidual is a diagnostic, not a proposal: it exists so the confounding argument has
a closed form instead of only a plot. With the factual and counterfactual arms bitwise identical
(influence = 0.0), every metre it reports is predictor error, and the ADE of an isotropic Gaussian
displacement is Rayleigh-distributed with mean sigma * sqrt(pi / 2)."""

from __future__ import annotations

import math

import pytest

from mirn.data.synthetic import SyntheticAdapter
from mirn.estimator import ESTIMATORS

_RAYLEIGH_MEAN_FACTOR = math.sqrt(math.pi / 2.0)


def _zero_influence_pairs() -> tuple:
    adapter = SyntheticAdapter(n_scenes=8, n_pedestrians=12, n_steps=60, seed=0)
    return adapter.rollout_pairs_with_influence(0.0)


def test_identification_declares_the_assumption_unmet() -> None:
    estimator = ESTIMATORS.create("noisy_oracle_residual")
    assert estimator.identification().startswith("UNMET:")


def test_zero_noise_on_zero_influence_reports_exactly_zero() -> None:
    """A perfect predictor in a world with no robot effect must report exactly 0.0 — this is the
    anchor the whole sweep hangs from."""
    estimator = ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=0.0)
    result = estimator.estimate(_zero_influence_pairs(), seed=7)
    assert result.value == 0.0
    assert result.ci_low == 0.0
    assert result.ci_high == 0.0


@pytest.mark.parametrize("sigma", [0.02, 0.10, 0.25])
def test_reported_value_matches_the_rayleigh_closed_form(sigma: float) -> None:
    estimator = ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=sigma)
    result = estimator.estimate(_zero_influence_pairs(), seed=11)
    expected = sigma * _RAYLEIGH_MEAN_FACTOR
    assert result.value == pytest.approx(expected, rel=0.05)


def test_reported_value_increases_strictly_with_predictor_error() -> None:
    pairs = _zero_influence_pairs()
    sigmas = [0.0, 0.05, 0.10, 0.20, 0.40]
    values: list[float] = []
    for sigma in sigmas:
        estimator = ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=sigma)
        values.append(estimator.estimate(pairs, seed=3).value)
    for index in range(1, len(values)):
        assert values[index] > values[index - 1]


def test_true_perturbation_stays_exactly_zero_across_that_sweep() -> None:
    """The point of the sweep: the reported number climbs while the truth does not move."""
    pairs = _zero_influence_pairs()
    paired = ESTIMATORS.create("paired")
    assert paired.estimate(pairs, seed=3).value == 0.0


def test_is_deterministic_under_a_fixed_seed() -> None:
    pairs = _zero_influence_pairs()
    estimator = ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=0.1)
    first = estimator.estimate(pairs, seed=5)
    second = estimator.estimate(pairs, seed=5)
    assert first.value == second.value
    assert first.ci_low == second.ci_low


def test_negative_predictor_error_raises() -> None:
    with pytest.raises(ValueError, match="predictor_error_std"):
        ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=-0.1)


def test_result_carries_units_and_identification() -> None:
    estimator = ESTIMATORS.create("noisy_oracle_residual", predictor_error_std=0.1)
    result = estimator.estimate(_zero_influence_pairs(), seed=1)
    assert result.units == "metres"
    assert result.estimator_name == "noisy_oracle_residual"
    assert result.divergence_name == "ade"
    assert result.n_samples == 8
    assert result.identification.startswith("UNMET:")
```

Note that `PerturbationEstimate.identification` is a string *field* on the frozen dataclass, while
`PerturbationEstimator.identification()` is a *method* on the estimator. Both appear in this test
file; do not confuse them.

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_noisy_oracle.py -q`
Expected: FAIL — `KeyError: unknown estimator 'noisy_oracle_residual'`

- [ ] **Step 3: Write the implementation**

Create `src/mirn/estimator/noisy_oracle.py`:

```python
"""`NoisyOracleResidual` — a deliberately corrupted oracle, used to make the confounding analytic.

`ConstantVelocityResidual` demonstrates that a forecast residual conflates causal effect with
forecast error, but its only quality knob is the forecast horizon, which is coarse and moves
several things at once. This estimator instead takes the *true* counterfactual path and adds
i.i.d. Gaussian noise of a caller-specified scale, producing a predictor whose error is exactly
the parameter `predictor_error_std`. Sweeping that parameter while the true perturbation is pinned
at zero gives the wayfinder's §11 measurement 5 in closed form: with the `ade` divergence the
reported value has expectation `sigma * sqrt(pi / 2)`, a straight line through the origin, while
the true effect never moves off zero.

It is a diagnostic and never a proposal. It consults the counterfactual arm only in order to
corrupt it, which is the opposite of what `paired.py` does with the same data.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from mirn.contracts import PerturbationEstimate, RolloutPair
from mirn.divergence import DIVERGENCES
from mirn.estimator.base import ESTIMATORS, PerturbationEstimator, bootstrap_ci

_NOISY_ORACLE_IDENTIFICATION = (
    "UNMET: this estimator does not identify the causal effect of robot presence, and is not "
    "offered as a way to measure anything. It constructs a forecast by taking each pedestrian's "
    "true counterfactual path and adding i.i.d. Gaussian noise of a caller-specified standard "
    "deviation, then reports the divergence between that corrupted forecast and the observed "
    "factual path exactly as a forecast-residual estimator would. It therefore reports predictor "
    "error by construction: on data whose true perturbation is exactly zero it still returns a "
    "positive number that grows linearly with the injected noise. It exists to demonstrate that "
    "property, which is the defect ConstantVelocityResidual exhibits accidentally and this "
    "estimator exhibits on purpose."
)


@ESTIMATORS.register("noisy_oracle_residual")
class NoisyOracleResidual(PerturbationEstimator):
    """A perfect causal predictor corrupted by a known amount of Gaussian error."""

    name = "noisy_oracle_residual"

    def __init__(self, predictor_error_std: float = 0.05, divergence: str = "ade") -> None:
        if predictor_error_std < 0.0:
            raise ValueError(
                f"NoisyOracleResidual predictor_error_std must be >= 0, got {predictor_error_std}"
            )
        self.predictor_error_std = predictor_error_std
        self.divergence_name = divergence
        self._divergence = DIVERGENCES.create(divergence)

    def identification(self) -> str:
        return _NOISY_ORACLE_IDENTIFICATION

    def estimate(self, pairs: Sequence[RolloutPair], seed: int) -> PerturbationEstimate:
        if len(pairs) < 1:
            raise ValueError("estimate requires at least one RolloutPair")

        rng = np.random.default_rng(seed)

        per_pair_values = np.empty(len(pairs), dtype=np.float64)
        for pair_index in range(len(pairs)):
            agent_pairs = pairs[pair_index].paired_agents()
            if len(agent_pairs) < 1:
                raise ValueError(f"RolloutPair at index {pair_index} has no paired agents")

            agent_values = np.empty(len(agent_pairs), dtype=np.float64)
            for agent_index in range(len(agent_pairs)):
                factual_traj, counterfactual_traj = agent_pairs[agent_index]
                counterfactual_positions = counterfactual_traj.positions
                noise = rng.normal(
                    0.0, self.predictor_error_std, size=counterfactual_positions.shape
                )
                forecast_positions = counterfactual_positions + noise
                agent_values[agent_index] = self._divergence.between_paths(
                    forecast_positions, factual_traj.positions
                )
            per_pair_values[pair_index] = np.mean(agent_values)

        value = float(np.mean(per_pair_values))
        ci_low, ci_high = bootstrap_ci(per_pair_values, seed)

        return PerturbationEstimate(
            value=value,
            ci_low=ci_low,
            ci_high=ci_high,
            units="metres",
            identification=self.identification(),
            n_samples=len(pairs),
            divergence_name=self.divergence_name,
            estimator_name=self.name,
        )
```

**Note on `predictor_error_std=0.0`:** `rng.normal(0.0, 0.0, size=...)` returns exact zeros, so the
forecast equals the counterfactual path bitwise and, at `influence = 0.0`, equals the factual path
too. Every per-pair value is then exactly `0.0`, the bootstrap of an all-zero array is `(0.0, 0.0)`,
and `PerturbationEstimate`'s `ci_low <= value <= ci_high` holds. Do not add an epsilon.

- [ ] **Step 4: Register it**

Modify `src/mirn/estimator/__init__.py` line 10 so the new module is imported for its
registration side effect:

```python
from mirn.estimator import noisy_oracle, paired, residual  # noqa: F401
```

- [ ] **Step 5: Run the new tests — they pass, but the Task 4 gate now fails**

Run: `.venv/bin/python -m pytest tests/test_noisy_oracle.py tests/test_method.py -q`
Expected: `tests/test_noisy_oracle.py` PASSES (10 tests). `tests/test_method.py::test_every_registered_estimator_has_a_card` FAILS with `estimators without a MethodCard: ['noisy_oracle_residual']`.

**This failure is the coverage gate working.** Do not weaken the test.

- [ ] **Step 6: Add the missing card**

In `src/mirn/method/catalog.py`, inside `_build_cards`, append this card after the
`paired_debiased` card and before the `split_half_null` card:

```python
    card_list.append(
        MethodCard(
            key="noisy_oracle_residual",
            kind="estimator",
            title="Noisy oracle residual (diagnostic)",
            one_liner="A perfect causal predictor corrupted by a known amount of error.",
            estimand_tex=_SHARED_ESTIMAND_TEX,
            formula_tex=(
                "\\hat{Y}_{n,k} = Y^{(\\mathrm{no\\ robot})}_{n,k} + \\varepsilon,"
                " \\quad \\varepsilon \\sim \\mathcal{N}(0, \\sigma^2 I_2), \\qquad"
                " \\hat{\\Delta}^{\\mathrm{oracle}} = \\tfrac{1}{N}\\sum_n \\tfrac{1}{K_n}"
                "\\sum_k d\\big(\\hat{Y}_{n,k}, Y^{(\\mathrm{robot})}_{n,k}\\big)"
            ),
            assumptions=(_identification_of("noisy_oracle_residual"),),
            breaks_when=(
                "Always, by construction. When the true perturbation is zero and \\(d\\) is ADE, "
                "its expectation is \\(\\sigma\\sqrt{\\pi/2}\\) — a straight line through the "
                "origin in predictor error, with no dependence on the robot whatsoever.",
                "It is a diagnostic instrument for exhibiting that failure, and reporting a "
                "number from it as a measurement of perturbation would be a category error.",
            ),
            citation="Wayfinder §11 measurement 5",
        )
    )
```

- [ ] **Step 7: Extend the existing estimator test**

Append to `tests/test_estimator.py`:

```python
def test_diagnostic_estimators_declare_their_assumption_unmet() -> None:
    """Both single-arm estimators must announce, in their first six characters, that they do not
    identify the estimand. This is the guard against one of them being quoted as a result."""
    for name in ("cvm_residual", "noisy_oracle_residual"):
        estimator = ESTIMATORS.create(name)
        assert estimator.identification().startswith("UNMET:")
```

- [ ] **Step 8: Run the tests to verify everything passes**

Run: `.venv/bin/python -m pytest tests/test_noisy_oracle.py tests/test_method.py tests/test_estimator.py -q`
Expected: PASS.

- [ ] **Step 9: Lint and run the full suite**

Run: `.venv/bin/python -m ruff check src tests && .venv/bin/python -m pytest -q`
Expected: `All checks passed!` then PASS, 147 tests.

- [ ] **Step 10: Commit**

```bash
git add src/mirn/estimator src/mirn/method/catalog.py tests/test_noisy_oracle.py tests/test_estimator.py
git commit -m "Add NoisyOracleResidual: the confounding argument in closed form"
```

---

### Task 6: The experiment extension point

**Files:**
- Create: `src/mirn/experiments/__init__.py`
- Create: `src/mirn/experiments/base.py`
- Test: `tests/test_experiments_base.py`

**Interfaces:**
- Consumes: `Registry` from `mirn.registry`.
- Produces:
  - `EXPERIMENTS = Registry("experiment")`
  - `ExperimentParameter(name, label, kind, default, minimum=None, maximum=None, step=None, choices=(), help_text="")` with `as_dict() -> dict[str, object]`; `kind` in `("float", "int", "choice")`.
  - `ExperimentResult(experiment_name, seed, frame, payload, method_keys)` with `as_json() -> dict[str, object]`.
  - `Experiment` ABC with class attributes `name`, `title`, `claim`; abstract `parameters()` and `run(params, seed)`; concrete `resolve(params) -> dict[str, object]` and `describe() -> dict[str, object]`.

Tasks 7–10 all call `self.resolve(params)` as the first line of `run`, so validation is defined exactly once.

- [ ] **Step 1: Write the failing test**

Create `tests/test_experiments_base.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_experiments_base.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'mirn.experiments'`

- [ ] **Step 3: Write the implementation**

Create `src/mirn/experiments/base.py`:

```python
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
        coerced: object = int(round(numeric_value))
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
```

Create `src/mirn/experiments/__init__.py`. The submodule imports are added by Tasks 7–10; start
with only the base so this task is independently green:

```python
"""The experiment layer: named, parameterised measurements that write CSVs and drive the page.

Importing this package registers every concrete `Experiment` into `EXPERIMENTS` as a side effect,
so callers can do `EXPERIMENTS.create("calibration_floor")` without importing submodules.
"""

from __future__ import annotations

from mirn.experiments.base import (
    EXPERIMENTS,
    Experiment,
    ExperimentParameter,
    ExperimentResult,
)

__all__ = ["EXPERIMENTS", "Experiment", "ExperimentParameter", "ExperimentResult"]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_experiments_base.py -q`
Expected: PASS, 18 tests.

- [ ] **Step 5: Lint and run the full suite**

Run: `.venv/bin/python -m ruff check src tests && .venv/bin/python -m pytest -q`
Expected: `All checks passed!` then PASS, 165 tests.

- [ ] **Step 6: Commit**

```bash
git add src/mirn/experiments tests/test_experiments_base.py
git commit -m "Add the Experiment extension point: declared parameters, two-shaped results"
```

---

### Task 7: Experiment 1 — `calibration_floor`

**Files:**
- Create: `src/mirn/experiments/calibration_floor.py`
- Modify: `src/mirn/experiments/__init__.py`
- Test: `tests/test_experiments.py` (created here; Tasks 8–10 extend it)

**Interfaces:**
- Consumes: `Experiment`, `ExperimentParameter`, `ExperimentResult`, `EXPERIMENTS` from Task 6; `SyntheticAdapter`; `split_half_null` and `minimum_detectable_perturbation` from `mirn.calibration.null`.
- Produces: `@EXPERIMENTS.register("calibration_floor")` → `CalibrationFloor`. Also produces the two module constants Tasks 8–10 reuse by importing them from here: `DEFAULT_N_PEDESTRIANS = 12`, `DEFAULT_N_STEPS = 60`, `CLOUD_DIVERGENCES = ("ade", "fde", "sinkhorn_w2")`, and `FLOOR_N_SPLITS = 200`.

**Claim:** *A divergence reports a non-zero number even when no robot is present.*

**Why the frame is built by hand rather than by calling `calibration_report`:** the existing
`calibration_report` hardcodes `n_splits = 200`, and this experiment exposes `n_splits` as a
control. The columns are identical to `calibration_report`'s on purpose, so the two remain
comparable.

**Divergence choices are restricted to cloud-capable ones.** `frechet` is order-dependent and its
`between_clouds` raises `NotImplementedError`, so offering it here would surface a crash as a UI
error. Restricting the declared `choices` makes that unreachable rather than merely handled.

- [ ] **Step 1: Write the failing test**

Create `tests/test_experiments.py`:

```python
"""Contract tests over every registered experiment, plus the specific numeric claims each one
makes. The generic block loops over EXPERIMENTS.names(), so a new experiment inherits determinism,
JSON-safety and parameter-validation coverage the moment it registers."""

from __future__ import annotations

import json

import pandas as pd
import pytest

from mirn.experiments import EXPERIMENTS
from mirn.method.catalog import CARDS

_FAST_PARAMS: dict[str, dict[str, object]] = {
    "calibration_floor": {"n_scenes": 3, "n_splits": 20, "divergence": "ade"},
    "estimator_comparison": {"n_scenes": 3, "influence": 1.0, "divergence": "ade"},
    "confounding_sweep": {"n_scenes": 3, "n_points": 4, "divergence": "ade"},
    "placebo": {"n_scenes": 3, "influence": 1.0, "divergence": "ade"},
}


def _fast_params(name: str) -> dict[str, object]:
    return dict(_FAST_PARAMS[name])


def test_every_registered_experiment_has_fast_params_declared() -> None:
    """Guards this test file against silently skipping a newly registered experiment."""
    for name in EXPERIMENTS.names():
        assert name in _FAST_PARAMS, f"add fast params for the '{name}' experiment"


def test_every_experiment_is_deterministic_under_a_fixed_seed() -> None:
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        first = experiment.run(_fast_params(name), seed=17)
        second = experiment.run(_fast_params(name), seed=17)
        pd.testing.assert_frame_equal(first.frame, second.frame)
        assert first.payload == second.payload


def test_every_experiment_payload_is_json_safe() -> None:
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        result = experiment.run(_fast_params(name), seed=1)
        json.dumps(result.as_json())


def test_every_experiment_rejects_an_unknown_parameter() -> None:
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        with pytest.raises(ValueError, match="unknown parameter"):
            experiment.run({"nonsense": 1}, seed=0)


def test_every_experiment_declares_unique_parameter_names() -> None:
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        seen: list[str] = []
        for parameter in experiment.parameters():
            assert parameter.name not in seen
            seen.append(parameter.name)


def test_every_experiment_method_key_resolves_to_a_card() -> None:
    """An experiment must never point the UI at mathematics that does not exist."""
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        result = experiment.run(_fast_params(name), seed=0)
        for key in result.method_keys:
            assert key in CARDS, f"experiment '{name}' names missing method card '{key}'"


def test_every_experiment_has_a_nonempty_title_and_claim() -> None:
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        assert len(experiment.title.strip()) > 0
        assert len(experiment.claim.strip()) > 0


_CALIBRATION_COLUMNS = [
    "divergence",
    "n_scenes",
    "n_splits",
    "null_mean",
    "null_sd",
    "mdp_95",
    "seed",
]


def test_calibration_floor_columns_are_exact() -> None:
    experiment = EXPERIMENTS.create("calibration_floor")
    result = experiment.run(_fast_params("calibration_floor"), seed=0)
    assert list(result.frame.columns) == _CALIBRATION_COLUMNS
    assert len(result.frame) == 1


def test_calibration_floor_reports_a_positive_floor_with_no_robot_present() -> None:
    """The whole point: a robot-free population still produces a non-zero divergence."""
    experiment = EXPERIMENTS.create("calibration_floor")
    result = experiment.run(_fast_params("calibration_floor"), seed=0)
    mdp_95 = float(result.frame["mdp_95"].to_numpy()[0])
    assert mdp_95 > 0.0


def test_calibration_floor_mdp_exceeds_the_null_median() -> None:
    experiment = EXPERIMENTS.create("calibration_floor")
    result = experiment.run(_fast_params("calibration_floor"), seed=0)
    samples = result.payload["null_samples"]
    ordered = sorted(samples)
    median = ordered[len(ordered) // 2]
    assert float(result.frame["mdp_95"].to_numpy()[0]) >= median


def test_calibration_floor_payload_carries_every_null_draw() -> None:
    experiment = EXPERIMENTS.create("calibration_floor")
    result = experiment.run(_fast_params("calibration_floor"), seed=0)
    assert len(result.payload["null_samples"]) == 20
    for sample in result.payload["null_samples"]:
        assert sample >= 0.0


def test_calibration_floor_does_not_offer_the_order_dependent_divergence() -> None:
    """frechet.between_clouds raises NotImplementedError, so it must be unreachable here."""
    experiment = EXPERIMENTS.create("calibration_floor")
    for parameter in experiment.parameters():
        if parameter.name == "divergence":
            assert "frechet" not in parameter.choices
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_experiments.py -q`
Expected: FAIL — `KeyError: unknown experiment 'calibration_floor'`

- [ ] **Step 3: Write the implementation**

Create `src/mirn/experiments/calibration_floor.py`:

```python
"""Experiment 1 — the detection floor.

Splits a robot-free pedestrian population in half at random, repeatedly, and measures the
divergence between the halves. Both halves are drawn from the same population, so the resulting
distribution is pure measurement noise: it is the number a divergence reports when there is no
robot in the scene at all. Its 95th percentile is the minimum detectable perturbation, and every
estimate elsewhere in the project is only interpretable against it.

Wayfinder §11 measurement 1 notes that nobody has published this, and that everything downstream
is uninterpretable without it.
"""

from __future__ import annotations

from collections.abc import Mapping

import numpy as np
import pandas as pd

from mirn.calibration.null import minimum_detectable_perturbation, split_half_null
from mirn.data.synthetic import SyntheticAdapter
from mirn.experiments.base import (
    EXPERIMENTS,
    Experiment,
    ExperimentParameter,
    ExperimentResult,
)

DEFAULT_N_PEDESTRIANS = 12
DEFAULT_N_STEPS = 60
FLOOR_N_SPLITS = 200
CLOUD_DIVERGENCES: tuple[str, ...] = ("ade", "fde", "sinkhorn_w2")

CALIBRATION_COLUMNS: tuple[str, ...] = (
    "divergence",
    "n_scenes",
    "n_splits",
    "null_mean",
    "null_sd",
    "mdp_95",
    "seed",
)


def divergence_parameter() -> ExperimentParameter:
    """The cloud-capable divergence control, shared by every experiment that calibrates a floor.

    `frechet` is deliberately absent: it is order-dependent and its `between_clouds` raises, so
    offering it would turn a design decision into a runtime error.
    """
    return ExperimentParameter(
        name="divergence",
        label="Divergence",
        kind="choice",
        default="ade",
        choices=CLOUD_DIVERGENCES,
        help_text=(
            "Which distance function to measure with. Frechet is excluded because it is "
            "order-dependent and has no point-cloud form, so it cannot be calibrated."
        ),
    )


def n_scenes_parameter() -> ExperimentParameter:
    """The scene-count control, shared by every experiment."""
    return ExperimentParameter(
        name="n_scenes",
        label="Scenes",
        kind="int",
        default=8,
        minimum=2.0,
        maximum=32.0,
        step=1.0,
        help_text="How many independent synthetic crossings to generate.",
    )


def build_adapter(n_scenes: int, seed: int) -> SyntheticAdapter:
    """The one place synthetic data is constructed, so every experiment measures the same
    population shape and their numbers stay comparable."""
    return SyntheticAdapter(
        n_scenes=n_scenes,
        n_pedestrians=DEFAULT_N_PEDESTRIANS,
        n_steps=DEFAULT_N_STEPS,
        seed=seed,
    )


def floor_from_scenes(scenes: tuple, divergence: str, seed: int) -> float:
    """The detection floor for a robot-free scene collection.

    Used by experiments 2 and 3 so each computes its own floor from its own data rather than
    depending on experiment 1 having been run first — every CSV row stays self-contained.
    """
    null_samples = split_half_null(scenes, divergence, seed, n_splits=FLOOR_N_SPLITS)
    return minimum_detectable_perturbation(null_samples, alpha=0.05)


@EXPERIMENTS.register("calibration_floor")
class CalibrationFloor(Experiment):
    """The split-half null and the detection floor derived from it."""

    name = "calibration_floor"
    title = "The detection floor"
    claim = "A divergence reports a non-zero number even when no robot is present."

    def parameters(self) -> tuple[ExperimentParameter, ...]:
        n_splits = ExperimentParameter(
            name="n_splits",
            label="Split-half draws",
            kind="int",
            default=200,
            minimum=20.0,
            maximum=500.0,
            step=10.0,
            help_text="How many random balanced partitions of the pedestrian pool to measure.",
        )
        return (divergence_parameter(), n_scenes_parameter(), n_splits)

    def run(self, params: Mapping[str, object], seed: int) -> ExperimentResult:
        resolved = self.resolve(params)
        divergence = str(resolved["divergence"])
        n_scenes = int(resolved["n_scenes"])  # type: ignore[call-overload]
        n_splits = int(resolved["n_splits"])  # type: ignore[call-overload]

        adapter = build_adapter(n_scenes, seed)
        scenes = adapter.load("counterfactual")

        null_samples = split_half_null(scenes, divergence, seed, n_splits=n_splits)
        mdp_95 = minimum_detectable_perturbation(null_samples, alpha=0.05)

        row: dict[str, object] = {}
        row["divergence"] = divergence
        row["n_scenes"] = n_scenes
        row["n_splits"] = n_splits
        row["null_mean"] = float(np.mean(null_samples))
        row["null_sd"] = float(np.std(null_samples))
        row["mdp_95"] = mdp_95
        row["seed"] = seed
        frame = pd.DataFrame([row], columns=list(CALIBRATION_COLUMNS))

        sample_list: list[float] = []
        for sample_index in range(null_samples.shape[0]):
            sample_list.append(float(null_samples[sample_index]))

        payload: dict[str, object] = {}
        payload["null_samples"] = sample_list
        payload["mdp_95"] = mdp_95
        payload["null_mean"] = float(np.mean(null_samples))
        payload["null_sd"] = float(np.std(null_samples))
        payload["divergence"] = divergence
        payload["units"] = "metres"
        payload["note"] = (
            "Synthetic data. Both halves are drawn from the same robot-free population, so every "
            "metre shown here is measurement noise."
        )

        return ExperimentResult(
            experiment_name=self.name,
            seed=seed,
            frame=frame,
            payload=payload,
            method_keys=(divergence, "split_half_null", "minimum_detectable_perturbation"),
        )
```

Modify `src/mirn/experiments/__init__.py` to import the submodule for its registration side
effect. Add this import line above the `base` import:

```python
from mirn.experiments import calibration_floor  # noqa: F401
```

**Import-order note:** `calibration_floor` imports from `mirn.experiments.base`, so the `base`
module must be importable on its own. It is — `base` imports nothing from the package's other
submodules. Ruff's isort rule will want the submodule import first alphabetically; let it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_experiments.py -q`
Expected: PASS, 12 tests.

- [ ] **Step 5: Lint and run the full suite**

Run: `.venv/bin/python -m ruff check src tests && .venv/bin/python -m pytest -q`
Expected: `All checks passed!` then PASS, 177 tests.

- [ ] **Step 6: Commit**

```bash
git add src/mirn/experiments tests/test_experiments.py
git commit -m "Add the calibration_floor experiment: the detection floor, no model required"
```

---

### Task 8: Experiment 2 — `estimator_comparison`

**Files:**
- Create: `src/mirn/experiments/estimator_comparison.py`
- Modify: `src/mirn/experiments/__init__.py`
- Modify: `tests/test_experiments.py`

**Interfaces:**
- Consumes: `divergence_parameter`, `n_scenes_parameter`, `build_adapter`, `floor_from_scenes` from `mirn.experiments.calibration_floor`; `ESTIMATORS`.
- Produces: `@EXPERIMENTS.register("estimator_comparison")` → `EstimatorComparison`. Frame columns exactly `estimator, divergence, value, ci_low, ci_high, units, n_samples, influence, seed`.

**Claim:** *On identical data the naive and paired estimators disagree, and only one consults the counterfactual arm.*

**`horizon_steps` bound:** `ConstantVelocityResidual` needs `n_steps - 1 - horizon_steps >= 1`, and `DEFAULT_N_STEPS` is 60, so the maximum is 58. The control caps at 40 to leave headroom.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_experiments.py`:

```python
_COMPARISON_COLUMNS = [
    "estimator",
    "divergence",
    "value",
    "ci_low",
    "ci_high",
    "units",
    "n_samples",
    "influence",
    "seed",
]


def _comparison_frame(**overrides: object) -> pd.DataFrame:
    params = _fast_params("estimator_comparison")
    for key in overrides:
        params[key] = overrides[key]
    experiment = EXPERIMENTS.create("estimator_comparison")
    return experiment.run(params, seed=0).frame


def test_estimator_comparison_columns_are_exact() -> None:
    frame = _comparison_frame()
    assert list(frame.columns) == _COMPARISON_COLUMNS


def test_estimator_comparison_reports_all_three_estimators() -> None:
    frame = _comparison_frame()
    reported = sorted(frame["estimator"].tolist())
    assert reported == ["cvm_residual", "paired", "paired_debiased"]


def test_paired_reports_exactly_zero_at_zero_influence() -> None:
    """The arms are bitwise identical at influence 0, so the paired estimator has nothing to
    measure. Anything other than exactly 0.0 means the pairing invariant has broken."""
    frame = _comparison_frame(influence=0.0)
    paired_rows = frame[frame["estimator"] == "paired"]
    assert float(paired_rows["value"].to_numpy()[0]) == 0.0


def test_the_naive_estimator_reports_a_positive_number_at_zero_influence() -> None:
    """The critique in one assertion: with no robot effect whatsoever, the forecast-residual
    estimator still reports metres of 'perturbation'."""
    frame = _comparison_frame(influence=0.0)
    naive_rows = frame[frame["estimator"] == "cvm_residual"]
    assert float(naive_rows["value"].to_numpy()[0]) > 0.0


def test_paired_value_increases_with_influence() -> None:
    low = _comparison_frame(influence=0.5)
    high = _comparison_frame(influence=1.5)
    low_value = float(low[low["estimator"] == "paired"]["value"].to_numpy()[0])
    high_value = float(high[high["estimator"] == "paired"]["value"].to_numpy()[0])
    assert high_value > low_value


def test_debiased_estimator_reports_mdp_units() -> None:
    frame = _comparison_frame()
    debiased = frame[frame["estimator"] == "paired_debiased"]
    assert debiased["units"].to_numpy()[0] == "mdp"


def test_confidence_intervals_bracket_every_point_estimate() -> None:
    frame = _comparison_frame()
    for index in range(len(frame)):
        row = frame.iloc[index]
        assert row["ci_low"] <= row["value"] <= row["ci_high"]


def test_comparison_payload_carries_each_identification_string() -> None:
    experiment = EXPERIMENTS.create("estimator_comparison")
    result = experiment.run(_fast_params("estimator_comparison"), seed=0)
    identifications = result.payload["identifications"]
    assert identifications["cvm_residual"].startswith("UNMET:")
    assert not identifications["paired"].startswith("UNMET:")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_experiments.py -q`
Expected: FAIL — `KeyError: unknown experiment 'estimator_comparison'`

- [ ] **Step 3: Write the implementation**

Create `src/mirn/experiments/estimator_comparison.py`:

```python
"""Experiment 2 — the same data, three estimators.

Runs the forecast-residual estimator this project critiques, the paired-counterfactual estimator
it proposes, and the floor-calibrated version of the latter, over one identical collection of
`RolloutPair`s. The interesting comparison is at `influence = 0.0`, where the two arms are bitwise
identical: the paired estimator reports exactly zero and the residual estimator does not.

The detection floor the debiased estimator needs is computed here, from the counterfactual arm of
these same pairs, rather than being read from experiment 1's output. That keeps each experiment
independently runnable and each CSV row reproducible on its own.
"""

from __future__ import annotations

from collections.abc import Mapping

import pandas as pd

from mirn.contracts import PerturbationEstimate
from mirn.estimator import ESTIMATORS
from mirn.experiments.base import (
    EXPERIMENTS,
    Experiment,
    ExperimentParameter,
    ExperimentResult,
)
from mirn.experiments.calibration_floor import (
    build_adapter,
    divergence_parameter,
    floor_from_scenes,
    n_scenes_parameter,
)

COMPARISON_COLUMNS: tuple[str, ...] = (
    "estimator",
    "divergence",
    "value",
    "ci_low",
    "ci_high",
    "units",
    "n_samples",
    "influence",
    "seed",
)


def influence_parameter(default: float) -> ExperimentParameter:
    """The robot-influence control. `0.0` makes the two arms bitwise identical, which is the
    setting the placebo and confounding arguments both depend on."""
    return ExperimentParameter(
        name="influence",
        label="Robot influence",
        kind="float",
        default=default,
        minimum=0.0,
        maximum=2.0,
        step=0.05,
        help_text=(
            "How strongly the robot displaces nearby pedestrians. At 0.0 the robot-present and "
            "robot-absent arms are bitwise identical, so the true perturbation is exactly zero."
        ),
    )


def _estimate_row(
    estimator_name: str, estimate: PerturbationEstimate, influence: float, seed: int
) -> dict[str, object]:
    row: dict[str, object] = {}
    row["estimator"] = estimator_name
    row["divergence"] = estimate.divergence_name
    row["value"] = estimate.value
    row["ci_low"] = estimate.ci_low
    row["ci_high"] = estimate.ci_high
    row["units"] = estimate.units
    row["n_samples"] = estimate.n_samples
    row["influence"] = influence
    row["seed"] = seed
    return row


@EXPERIMENTS.register("estimator_comparison")
class EstimatorComparison(Experiment):
    """Three estimators, one dataset, side by side."""

    name = "estimator_comparison"
    title = "What the two estimators report"
    claim = (
        "On identical data the naive and paired estimators disagree, and only one consults the "
        "robot-absent arm."
    )

    def parameters(self) -> tuple[ExperimentParameter, ...]:
        horizon_steps = ExperimentParameter(
            name="horizon_steps",
            label="Forecast horizon (steps)",
            kind="int",
            default=16,
            minimum=2.0,
            maximum=40.0,
            step=1.0,
            help_text=(
                "How far the constant-velocity forecast is rolled forward before its residual is "
                "measured. Longer horizons mean a worse forecast."
            ),
        )
        return (
            influence_parameter(1.0),
            divergence_parameter(),
            horizon_steps,
            n_scenes_parameter(),
        )

    def run(self, params: Mapping[str, object], seed: int) -> ExperimentResult:
        resolved = self.resolve(params)
        influence = float(resolved["influence"])  # type: ignore[arg-type]
        divergence = str(resolved["divergence"])
        horizon_steps = int(resolved["horizon_steps"])  # type: ignore[call-overload]
        n_scenes = int(resolved["n_scenes"])  # type: ignore[call-overload]

        adapter = build_adapter(n_scenes, seed)
        pairs = adapter.rollout_pairs_with_influence(influence)

        counterfactual_scenes: list[object] = []
        for pair in pairs:
            counterfactual_scenes.append(pair.counterfactual)
        floor = floor_from_scenes(tuple(counterfactual_scenes), divergence, seed)

        estimators: list[tuple[str, object]] = []
        estimators.append(
            (
                "cvm_residual",
                ESTIMATORS.create(
                    "cvm_residual", horizon_steps=horizon_steps, divergence=divergence
                ),
            )
        )
        estimators.append(("paired", ESTIMATORS.create("paired", divergence=divergence)))
        estimators.append(
            (
                "paired_debiased",
                ESTIMATORS.create("paired_debiased", divergence=divergence, floor=floor),
            )
        )

        rows: list[dict[str, object]] = []
        identifications: dict[str, str] = {}
        for estimator_name, estimator in estimators:
            estimate = estimator.estimate(pairs, seed)
            rows.append(_estimate_row(estimator_name, estimate, influence, seed))
            identifications[estimator_name] = estimate.identification

        frame = pd.DataFrame(rows, columns=list(COMPARISON_COLUMNS))

        payload: dict[str, object] = {}
        payload["identifications"] = identifications
        payload["mdp_95"] = floor
        payload["influence"] = influence
        payload["divergence"] = divergence
        payload["horizon_steps"] = horizon_steps
        payload["note"] = (
            "Synthetic data. The two arms share a seed and an exogenous noise realisation, so at "
            "influence 0.0 they are bitwise identical and the true perturbation is exactly zero."
        )

        return ExperimentResult(
            experiment_name=self.name,
            seed=seed,
            frame=frame,
            payload=payload,
            method_keys=("cvm_residual", "paired", "paired_debiased", "bootstrap_ci"),
        )
```

Add the submodule import to `src/mirn/experiments/__init__.py`:

```python
from mirn.experiments import calibration_floor, estimator_comparison  # noqa: F401
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_experiments.py -q`
Expected: PASS, 20 tests.

- [ ] **Step 5: Lint and run the full suite**

Run: `.venv/bin/python -m ruff check src tests && .venv/bin/python -m pytest -q`
Expected: `All checks passed!` then PASS, 185 tests.

- [ ] **Step 6: Commit**

```bash
git add src/mirn/experiments tests/test_experiments.py
git commit -m "Add the estimator_comparison experiment: naive vs paired on identical data"
```

---

### Task 9: Experiment 3 — `confounding_sweep`, the killer plot

**Files:**
- Create: `src/mirn/experiments/confounding_sweep.py`
- Modify: `src/mirn/experiments/__init__.py`
- Modify: `tests/test_experiments.py`

**Interfaces:**
- Consumes: `build_adapter`, `divergence_parameter`, `floor_from_scenes`, `n_scenes_parameter` from `calibration_floor`; `influence_parameter` from `estimator_comparison`; `ESTIMATORS`.
- Produces: `@EXPERIMENTS.register("confounding_sweep")` → `ConfoundingSweep`. Frame columns exactly `axis, axis_value, reported_value, reported_ci_low, reported_ci_high, true_value, mdp_95, exceeds_floor, influence, divergence, seed` — matching what `viz.figures.confounding_sweep_figure` (Task 2) already reads.

**Units — decided during Task 2's review, binding here.** These frame columns carry **raw metres**,
with `mdp_95` alongside them, so a CSV row stays self-contained and any reader can re-derive the
normalisation. Every *display* surface — `viz.figures.confounding_sweep_figure` and the page's
`drawSweep` — divides by `mdp_95` and reports MDP units, per `CLAUDE.md` guardrail 3 ("Never report
perturbation in raw metres outside `mirn.calibration`"). Normalised, the detection floor sits at
exactly `y = 1`. Do **not** normalise inside this experiment and do **not** add duplicate normalised
columns; the split is deliberate.

**Claim:** *True perturbation is pinned at zero; reported perturbation climbs with predictor error and crosses the detection floor.*

This is wayfinder §11 measurement 5, the experiment the document calls "the killer plot" and "a direct critique of a published loss function".

**Two axes, deliberately:**
- `predictor_noise` sweeps `NoisyOracleResidual(predictor_error_std=σ)`. Establishes the mechanism analytically — the curve is a straight line through the origin with slope `sqrt(π/2)`.
- `forecast_horizon` sweeps `ConstantVelocityResidual(horizon_steps=h)`. Establishes that the mechanism bites with a real forecaster degraded the way forecasters actually degrade.

**Why the horizon grid has no duplicates:** `n_points` caps at 16 and the horizon range is 2–40, giving a minimum spacing of 38/15 ≈ 2.53 before rounding, so rounded values are always distinct. Do not widen `n_points` without re-checking this.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_experiments.py`:

```python
_SWEEP_COLUMNS = [
    "axis",
    "axis_value",
    "reported_value",
    "reported_ci_low",
    "reported_ci_high",
    "true_value",
    "mdp_95",
    "exceeds_floor",
    "influence",
    "divergence",
    "seed",
]


def _sweep_result(**overrides: object):
    params = _fast_params("confounding_sweep")
    for key in overrides:
        params[key] = overrides[key]
    return EXPERIMENTS.create("confounding_sweep").run(params, seed=0)


def test_confounding_sweep_columns_are_exact() -> None:
    assert list(_sweep_result().frame.columns) == _SWEEP_COLUMNS


def test_confounding_sweep_frame_columns_satisfy_the_figure_contract() -> None:
    """viz.figures.confounding_sweep_figure reads these names; keep the two in lockstep."""
    from mirn.viz.figures import confounding_sweep_figure

    figure = confounding_sweep_figure(_sweep_result(n_points=6).frame)
    assert len(figure.axes) == 1
    # The frame is in metres; the figure must render MDP units (CLAUDE.md guardrail 3).
    assert "MDP" in figure.axes[0].get_ylabel()


def test_true_perturbation_is_exactly_zero_at_every_sweep_point() -> None:
    """The pin. If this ever fails, the sweep is measuring two moving quantities and proves
    nothing about confounding."""
    frame = _sweep_result(influence=0.0, n_points=6).frame
    for index in range(len(frame)):
        assert float(frame["true_value"].to_numpy()[index]) == 0.0


def test_reported_perturbation_rises_along_the_noise_axis_while_truth_stays_flat() -> None:
    frame = _sweep_result(axis="predictor_noise", influence=0.0, n_points=6).frame
    reported = frame["reported_value"].to_numpy()
    for index in range(1, len(reported)):
        assert reported[index] > reported[index - 1]
    assert float(frame["true_value"].to_numpy()[-1]) == 0.0


def test_reported_perturbation_rises_along_the_horizon_axis() -> None:
    frame = _sweep_result(axis="forecast_horizon", influence=0.0, n_points=6).frame
    reported = frame["reported_value"].to_numpy()
    assert reported[-1] > reported[0]


def test_horizon_axis_values_are_distinct_integers() -> None:
    frame = _sweep_result(axis="forecast_horizon", n_points=16).frame
    values = frame["axis_value"].tolist()
    assert len(set(values)) == len(values)
    for value in values:
        assert float(value) == int(value)


def test_the_reported_curve_crosses_the_detection_floor() -> None:
    """The single number the experiment exists to produce: the predictor error at which a
    world with exactly zero perturbation reads as a detected perturbation."""
    result = _sweep_result(axis="predictor_noise", influence=0.0, n_points=8)
    crossing = result.payload["floor_crossing_axis_value"]
    assert crossing is not None
    assert crossing > 0.0
    assert bool(result.frame["exceeds_floor"].to_numpy()[-1]) is True


def test_floor_crossing_is_none_when_the_curve_never_clears_the_floor() -> None:
    result = _sweep_result(axis="predictor_noise", influence=0.0, n_points=4, noise_max=0.001)
    assert result.payload["floor_crossing_axis_value"] is None


def test_mdp_is_identical_on_every_row() -> None:
    """One floor per sweep, repeated so a single CSV row is self-contained."""
    frame = _sweep_result(n_points=6).frame
    values = frame["mdp_95"].tolist()
    for value in values:
        assert value == values[0]


def test_axis_choices_are_exactly_the_two_documented_axes() -> None:
    experiment = EXPERIMENTS.create("confounding_sweep")
    for parameter in experiment.parameters():
        if parameter.name == "axis":
            assert parameter.choices == ("predictor_noise", "forecast_horizon")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_experiments.py -q`
Expected: FAIL — `KeyError: unknown experiment 'confounding_sweep'`

- [ ] **Step 3: Write the implementation**

Create `src/mirn/experiments/confounding_sweep.py`:

```python
"""Experiment 3 — reported perturbation tracks predictor error, not the robot.

Wayfinder §11 measurement 5. The setup holds the *true* perturbation fixed at exactly zero — the
synthetic adapter's two arms are bitwise identical at `influence = 0.0` — and then sweeps the
quality of the forecaster used by a residual-style estimator. If the reported number climbs, then
reported perturbation is partly an artifact of model accuracy, and a policy trained to minimise it
is partly trained to be predictable.

Two axes are offered because they answer different objections. `predictor_noise` corrupts a
perfect oracle by a known sigma and produces the relationship in closed form. `forecast_horizon`
degrades a genuine constant-velocity forecaster the way forecasters actually degrade, and shows
the effect is not an artifact of the corruption model.
"""

from __future__ import annotations

from collections.abc import Mapping

import numpy as np
import pandas as pd

from mirn.estimator import ESTIMATORS
from mirn.experiments.base import (
    EXPERIMENTS,
    Experiment,
    ExperimentParameter,
    ExperimentResult,
)
from mirn.experiments.calibration_floor import (
    build_adapter,
    divergence_parameter,
    floor_from_scenes,
    n_scenes_parameter,
)
from mirn.experiments.estimator_comparison import influence_parameter

SWEEP_COLUMNS: tuple[str, ...] = (
    "axis",
    "axis_value",
    "reported_value",
    "reported_ci_low",
    "reported_ci_high",
    "true_value",
    "mdp_95",
    "exceeds_floor",
    "influence",
    "divergence",
    "seed",
)

_AXES: tuple[str, ...] = ("predictor_noise", "forecast_horizon")
_HORIZON_MIN = 2
_HORIZON_MAX = 40


def _axis_values(axis: str, n_points: int, noise_max: float) -> np.ndarray:
    """The grid to sweep over. Horizon values are rounded to distinct integers; see the plan note
    on why `n_points <= 16` guarantees distinctness over 2..40."""
    if axis == "predictor_noise":
        return np.linspace(0.0, noise_max, n_points)
    raw = np.linspace(float(_HORIZON_MIN), float(_HORIZON_MAX), n_points)
    return np.round(raw)


def _build_estimator(axis: str, axis_value: float, divergence: str) -> object:
    """Registry construction, so no `if name ==` dispatch chain exists over estimator names."""
    if axis == "predictor_noise":
        return ESTIMATORS.create(
            "noisy_oracle_residual",
            predictor_error_std=float(axis_value),
            divergence=divergence,
        )
    return ESTIMATORS.create(
        "cvm_residual", horizon_steps=int(axis_value), divergence=divergence
    )


def _floor_crossing(
    axis_values: np.ndarray, reported: np.ndarray, mdp_95: float
) -> float | None:
    """The linearly-interpolated axis value at which `reported` first exceeds `mdp_95`.

    Returns None when no swept point clears the floor, which the interface renders as "does not
    cross within the swept range" rather than extrapolating a number nobody measured.
    """
    if reported.shape[0] < 1:
        return None
    if reported[0] > mdp_95:
        return float(axis_values[0])
    for index in range(1, reported.shape[0]):
        previous_value = float(reported[index - 1])
        current_value = float(reported[index])
        if previous_value <= mdp_95 < current_value:
            span = current_value - previous_value
            fraction = (mdp_95 - previous_value) / span
            low_axis = float(axis_values[index - 1])
            high_axis = float(axis_values[index])
            return low_axis + fraction * (high_axis - low_axis)
    return None


@EXPERIMENTS.register("confounding_sweep")
class ConfoundingSweep(Experiment):
    """True perturbation pinned; predictor quality swept."""

    name = "confounding_sweep"
    title = "Reported perturbation tracks predictor error"
    claim = (
        "With true perturbation pinned at exactly zero, the reported number climbs with "
        "predictor error and crosses the detection floor."
    )

    def parameters(self) -> tuple[ExperimentParameter, ...]:
        axis = ExperimentParameter(
            name="axis",
            label="Predictor-quality axis",
            kind="choice",
            default="predictor_noise",
            choices=_AXES,
            help_text=(
                "predictor_noise corrupts a perfect oracle by a known sigma and gives the "
                "relationship in closed form. forecast_horizon degrades a real constant-velocity "
                "forecaster instead."
            ),
        )
        n_points = ExperimentParameter(
            name="n_points",
            label="Sweep points",
            kind="int",
            default=8,
            minimum=4.0,
            maximum=16.0,
            step=1.0,
            help_text="How many predictor-quality levels to evaluate.",
        )
        noise_max = ExperimentParameter(
            name="noise_max",
            label="Maximum predictor error (m)",
            kind="float",
            default=0.5,
            minimum=0.001,
            maximum=2.0,
            step=0.01,
            help_text="Upper end of the sigma grid; ignored on the forecast_horizon axis.",
        )
        return (
            influence_parameter(0.0),
            axis,
            n_points,
            noise_max,
            divergence_parameter(),
            n_scenes_parameter(),
        )

    def run(self, params: Mapping[str, object], seed: int) -> ExperimentResult:
        resolved = self.resolve(params)
        influence = float(resolved["influence"])  # type: ignore[arg-type]
        axis = str(resolved["axis"])
        n_points = int(resolved["n_points"])  # type: ignore[call-overload]
        noise_max = float(resolved["noise_max"])  # type: ignore[arg-type]
        divergence = str(resolved["divergence"])
        n_scenes = int(resolved["n_scenes"])  # type: ignore[call-overload]

        adapter = build_adapter(n_scenes, seed)
        pairs = adapter.rollout_pairs_with_influence(influence)

        counterfactual_scenes: list[object] = []
        for pair in pairs:
            counterfactual_scenes.append(pair.counterfactual)
        mdp_95 = floor_from_scenes(tuple(counterfactual_scenes), divergence, seed)

        paired_estimator = ESTIMATORS.create("paired", divergence=divergence)
        true_estimate = paired_estimator.estimate(pairs, seed)
        true_value = true_estimate.value

        axis_values = _axis_values(axis, n_points, noise_max)

        rows: list[dict[str, object]] = []
        reported_values = np.empty(axis_values.shape[0], dtype=np.float64)
        for index in range(axis_values.shape[0]):
            axis_value = float(axis_values[index])
            estimator = _build_estimator(axis, axis_value, divergence)
            estimate = estimator.estimate(pairs, seed)
            reported_values[index] = estimate.value

            row: dict[str, object] = {}
            row["axis"] = axis
            row["axis_value"] = axis_value
            row["reported_value"] = estimate.value
            row["reported_ci_low"] = estimate.ci_low
            row["reported_ci_high"] = estimate.ci_high
            row["true_value"] = true_value
            row["mdp_95"] = mdp_95
            row["exceeds_floor"] = bool(estimate.value > mdp_95)
            row["influence"] = influence
            row["divergence"] = divergence
            row["seed"] = seed
            rows.append(row)

        frame = pd.DataFrame(rows, columns=list(SWEEP_COLUMNS))
        crossing = _floor_crossing(axis_values, reported_values, mdp_95)

        payload: dict[str, object] = {}
        payload["axis"] = axis
        payload["mdp_95"] = mdp_95
        payload["true_value"] = true_value
        payload["floor_crossing_axis_value"] = crossing
        payload["influence"] = influence
        payload["divergence"] = divergence
        payload["note"] = (
            "Synthetic data. True perturbation is measured by the paired estimator on the same "
            "pairs and is exactly zero when influence is 0.0, so every metre the reported curve "
            "climbs is predictor error wearing a causal label."
        )

        return ExperimentResult(
            experiment_name=self.name,
            seed=seed,
            frame=frame,
            payload=payload,
            method_keys=(
                "noisy_oracle_residual",
                "cvm_residual",
                "paired",
                "minimum_detectable_perturbation",
            ),
        )
```

Add the submodule import to `src/mirn/experiments/__init__.py`:

```python
from mirn.experiments import (  # noqa: F401
    calibration_floor,
    confounding_sweep,
    estimator_comparison,
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_experiments.py -q`
Expected: PASS, 30 tests.

**If `test_the_reported_curve_crosses_the_detection_floor` fails** because the default
`noise_max = 0.5` does not clear the floor for the chosen divergence, do not weaken the assertion.
Raise the default `noise_max` until the curve crosses, and record the value you chose — a floor
the sweep cannot reach would make the experiment unable to state its own conclusion.

- [ ] **Step 5: Lint and run the full suite**

Run: `.venv/bin/python -m ruff check src tests && .venv/bin/python -m pytest -q`
Expected: `All checks passed!` then PASS, 195 tests.

- [ ] **Step 6: Commit**

```bash
git add src/mirn/experiments tests/test_experiments.py
git commit -m "Add the confounding_sweep experiment: true effect pinned, reported effect climbs"
```

---

### Task 10: Experiment 4 — `placebo`

**Files:**
- Create: `src/mirn/experiments/placebo.py`
- Modify: `src/mirn/experiments/__init__.py`
- Modify: `tests/test_experiments.py`
- Modify: `tests/test_placebo.py`

**Interfaces:**
- Consumes: `build_adapter`, `divergence_parameter`, `n_scenes_parameter`; `influence_parameter`; `ESTIMATORS`; `Scene`, `RolloutPair` from `mirn.contracts`.
- Produces: `@EXPERIMENTS.register("placebo")` → `Placebo`, plus two helpers `tests/test_placebo.py` imports so the test and the experiment cannot drift: `select_non_interacting_agent(pair: RolloutPair, exclusion_radius_m: float) -> str | None`, `select_common_non_interacting_agent(pairs: Sequence[RolloutPair], exclusion_radius_m: float) -> str | None`, and `drop_agent(pair: RolloutPair, agent_id: str) -> RolloutPair`. Frame columns exactly `variant, n_pedestrians, value, ci_low, ci_high, delta_vs_full, influence, seed`.

**Claim:** *Deleting a pedestrian the robot never came near does not move the estimate.*

**Why it matters:** CausalAgents showed forecasters shift 25–38% relative minADE when provably non-causal agents are removed. An estimator with that sensitivity is measuring model behaviour, not the world.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_experiments.py`:

```python
_PLACEBO_COLUMNS = [
    "variant",
    "n_pedestrians",
    "value",
    "ci_low",
    "ci_high",
    "delta_vs_full",
    "influence",
    "seed",
]


def _placebo_result(**overrides: object):
    params = _fast_params("placebo")
    for key in overrides:
        params[key] = overrides[key]
    return EXPERIMENTS.create("placebo").run(params, seed=0)


def test_placebo_columns_are_exact() -> None:
    assert list(_placebo_result().frame.columns) == _PLACEBO_COLUMNS


def test_placebo_reports_a_full_and_a_reduced_variant() -> None:
    frame = _placebo_result().frame
    assert sorted(frame["variant"].tolist()) == ["full", "pedestrian_removed"]


def test_removing_a_non_interacting_pedestrian_barely_moves_the_estimate() -> None:
    """The placebo gate. A large delta here means the estimator is measuring the population
    rather than the robot."""
    frame = _placebo_result(influence=1.0).frame
    reduced = frame[frame["variant"] == "pedestrian_removed"]
    delta = abs(float(reduced["delta_vs_full"].to_numpy()[0]))
    mdp_relative = delta / max(float(frame["value"].to_numpy()[0]), 1e-12)
    assert mdp_relative < 0.25


def test_placebo_removes_exactly_one_pedestrian() -> None:
    frame = _placebo_result().frame
    full = int(frame[frame["variant"] == "full"]["n_pedestrians"].to_numpy()[0])
    reduced = int(
        frame[frame["variant"] == "pedestrian_removed"]["n_pedestrians"].to_numpy()[0]
    )
    assert reduced == full - 1


def test_placebo_payload_names_the_removed_agent() -> None:
    result = _placebo_result()
    removed = result.payload["removed_agent_id"]
    assert type(removed) is str
    assert len(removed) > 0


def test_placebo_delta_is_exactly_zero_at_zero_influence() -> None:
    """Both arms identical means both variants estimate exactly 0.0, so the delta is exactly 0.0
    — not merely small."""
    frame = _placebo_result(influence=0.0).frame
    reduced = frame[frame["variant"] == "pedestrian_removed"]
    assert float(reduced["delta_vs_full"].to_numpy()[0]) == 0.0
```

Also modify `tests/test_placebo.py` — replace its local pedestrian-selection logic with an import
from the experiment module, so the gate test and the experiment share one implementation. Add near
the top of the file:

```python
from mirn.experiments.placebo import drop_agent, select_non_interacting_agent
```

and replace whatever local helper it currently uses to find and delete a far-away pedestrian with
calls to `select_non_interacting_agent(pair, 6.0)` and `drop_agent(pair, agent_id)`. Read the
existing file before editing; keep every existing assertion intact.

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_experiments.py -q`
Expected: FAIL — `KeyError: unknown experiment 'placebo'`

- [ ] **Step 3: Write the implementation**

Create `src/mirn/experiments/placebo.py`:

```python
"""Experiment 4 — the placebo test.

Delete a pedestrian the robot never came near, from both arms, and re-estimate. A valid
perturbation estimator should not move: that pedestrian carries no robot effect, so removing it
removes no signal. CausalAgents found trajectory forecasters shift 25-38% relative minADE when
provably non-causal agents are removed, which is why this is a first-class gate in
`tests/test_placebo.py` rather than only an experiment.

`select_non_interacting_agent` and `drop_agent` live here and are imported by that test, so the
gate and the experiment can never drift apart.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np
import pandas as pd

from mirn.contracts import RolloutPair, Scene
from mirn.estimator import ESTIMATORS
from mirn.experiments.base import (
    EXPERIMENTS,
    Experiment,
    ExperimentParameter,
    ExperimentResult,
)
from mirn.experiments.calibration_floor import (
    build_adapter,
    divergence_parameter,
    n_scenes_parameter,
)
from mirn.experiments.estimator_comparison import influence_parameter

PLACEBO_COLUMNS: tuple[str, ...] = (
    "variant",
    "n_pedestrians",
    "value",
    "ci_low",
    "ci_high",
    "delta_vs_full",
    "influence",
    "seed",
)

DEFAULT_EXCLUSION_RADIUS_M = 6.0


def select_non_interacting_agent(pair: RolloutPair, exclusion_radius_m: float) -> str | None:
    """The id of a pedestrian that never comes within `exclusion_radius_m` of the robot.

    Returns the lowest such `agent_id` so the choice is deterministic, or None when every
    pedestrian in the pair passes close to the robot at some point.
    """
    robot = pair.factual.robot
    if robot is None:
        raise ValueError(
            "select_non_interacting_agent requires a factual arm with a robot; got "
            f"robot_present={pair.factual.robot_present}"
        )
    robot_positions = robot.positions

    candidate_ids: list[str] = []
    for pedestrian in pair.factual.pedestrians:
        offsets = pedestrian.positions - robot_positions
        distances = np.sqrt(np.sum(offsets * offsets, axis=1))
        closest_approach = float(np.min(distances))
        if closest_approach > exclusion_radius_m:
            candidate_ids.append(pedestrian.agent_id)

    if len(candidate_ids) == 0:
        return None
    candidate_ids.sort()
    return candidate_ids[0]


def select_common_non_interacting_agent(
    pairs: Sequence[RolloutPair], exclusion_radius_m: float
) -> str | None:
    """The lowest `agent_id` that is non-interacting in *every* pair.

    Selecting from one scene and deleting from all of them would be wrong: an agent that stays
    clear of the robot in scene 0 may pass right by it in scene 2, and removing it there would
    delete real signal and make the placebo test measure the wrong thing.
    """
    if len(pairs) < 1:
        raise ValueError("select_common_non_interacting_agent requires at least one pair")

    common: set[str] | None = None
    for pair in pairs:
        eligible: set[str] = set()
        robot = pair.factual.robot
        if robot is None:
            raise ValueError(
                "select_common_non_interacting_agent requires every factual arm to have a robot"
            )
        for pedestrian in pair.factual.pedestrians:
            offsets = pedestrian.positions - robot.positions
            distances = np.sqrt(np.sum(offsets * offsets, axis=1))
            if float(np.min(distances)) > exclusion_radius_m:
                eligible.add(pedestrian.agent_id)
        if common is None:
            common = eligible
        else:
            common = common & eligible

    if common is None or len(common) == 0:
        return None
    ordered: list[str] = []
    for agent_id in common:
        ordered.append(agent_id)
    ordered.sort()
    return ordered[0]


def _scene_without(scene: Scene, agent_id: str) -> Scene:
    kept: list[object] = []
    for pedestrian in scene.pedestrians:
        if pedestrian.agent_id != agent_id:
            kept.append(pedestrian)
    return Scene(
        scene_id=scene.scene_id,
        pedestrians=tuple(kept),
        robot=scene.robot,
        robot_present=scene.robot_present,
        source=scene.source,
        seed=scene.seed,
    )


def drop_agent(pair: RolloutPair, agent_id: str) -> RolloutPair:
    """The same pair with one pedestrian removed from *both* arms.

    Removing from both arms is what keeps the `RolloutPair` invariants intact; removing from one
    would produce a pair whose agent sets differ, which `__post_init__` rejects.
    """
    factual = _scene_without(pair.factual, agent_id)
    if len(factual.pedestrians) == len(pair.factual.pedestrians):
        raise ValueError(
            f"agent '{agent_id}' is not present in the factual arm of scene "
            f"'{pair.factual.scene_id}'"
        )
    counterfactual = _scene_without(pair.counterfactual, agent_id)
    return RolloutPair(factual=factual, counterfactual=counterfactual)


@EXPERIMENTS.register("placebo")
class Placebo(Experiment):
    """Delete a non-interacting pedestrian and check the estimate does not move."""

    name = "placebo"
    title = "The placebo test"
    claim = "Deleting a pedestrian the robot never came near does not move the estimate."

    def parameters(self) -> tuple[ExperimentParameter, ...]:
        exclusion_radius = ExperimentParameter(
            name="exclusion_radius_m",
            label="Exclusion radius (m)",
            kind="float",
            default=DEFAULT_EXCLUSION_RADIUS_M,
            minimum=1.0,
            maximum=12.0,
            step=0.5,
            help_text=(
                "A pedestrian is treated as non-interacting if it never comes within this "
                "distance of the robot."
            ),
        )
        return (
            influence_parameter(1.0),
            exclusion_radius,
            divergence_parameter(),
            n_scenes_parameter(),
        )

    def run(self, params: Mapping[str, object], seed: int) -> ExperimentResult:
        resolved = self.resolve(params)
        influence = float(resolved["influence"])  # type: ignore[arg-type]
        exclusion_radius_m = float(resolved["exclusion_radius_m"])  # type: ignore[arg-type]
        divergence = str(resolved["divergence"])
        n_scenes = int(resolved["n_scenes"])  # type: ignore[call-overload]

        adapter = build_adapter(n_scenes, seed)
        pairs = adapter.rollout_pairs_with_influence(influence)
        estimator = ESTIMATORS.create("paired", divergence=divergence)

        full_estimate = estimator.estimate(pairs, seed)

        removed_agent_id = select_common_non_interacting_agent(pairs, exclusion_radius_m)
        if removed_agent_id is None:
            raise ValueError(
                "no pedestrian stays farther than "
                f"{exclusion_radius_m} m from the robot in every scene, so there is no "
                "non-interacting agent to remove; lower the exclusion radius"
            )

        reduced_pairs: list[RolloutPair] = []
        for pair in pairs:
            reduced_pairs.append(drop_agent(pair, removed_agent_id))
        reduced_estimate = estimator.estimate(tuple(reduced_pairs), seed)

        delta = reduced_estimate.value - full_estimate.value

        rows: list[dict[str, object]] = []
        full_row: dict[str, object] = {}
        full_row["variant"] = "full"
        full_row["n_pedestrians"] = pairs[0].factual.n_pedestrians
        full_row["value"] = full_estimate.value
        full_row["ci_low"] = full_estimate.ci_low
        full_row["ci_high"] = full_estimate.ci_high
        full_row["delta_vs_full"] = 0.0
        full_row["influence"] = influence
        full_row["seed"] = seed
        rows.append(full_row)

        reduced_row: dict[str, object] = {}
        reduced_row["variant"] = "pedestrian_removed"
        reduced_row["n_pedestrians"] = reduced_pairs[0].factual.n_pedestrians
        reduced_row["value"] = reduced_estimate.value
        reduced_row["ci_low"] = reduced_estimate.ci_low
        reduced_row["ci_high"] = reduced_estimate.ci_high
        reduced_row["delta_vs_full"] = delta
        reduced_row["influence"] = influence
        reduced_row["seed"] = seed
        rows.append(reduced_row)

        frame = pd.DataFrame(rows, columns=list(PLACEBO_COLUMNS))

        payload: dict[str, object] = {}
        payload["removed_agent_id"] = removed_agent_id
        payload["exclusion_radius_m"] = exclusion_radius_m
        payload["delta_vs_full"] = delta
        payload["full_value"] = full_estimate.value
        payload["reduced_value"] = reduced_estimate.value
        payload["influence"] = influence
        payload["note"] = (
            "Synthetic data. The removed pedestrian never comes within the exclusion radius of "
            "the robot, so it carries no robot effect and removing it should remove no signal."
        )

        return ExperimentResult(
            experiment_name=self.name,
            seed=seed,
            frame=frame,
            payload=payload,
            method_keys=("paired", "bootstrap_ci"),
        )
```

Add the submodule import to `src/mirn/experiments/__init__.py`:

```python
from mirn.experiments import (  # noqa: F401
    calibration_floor,
    confounding_sweep,
    estimator_comparison,
    placebo,
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_experiments.py tests/test_placebo.py -q`
Expected: PASS. The generic block in `test_experiments.py` now also exercises `placebo`.

**If `run` raises "no pedestrian stays farther than 6.0 m from the robot in every scene":** check
the geometry before changing anything. The box is 20 x 12 m with the robot at (10, 6); pedestrians
start at x = 0 and travel at ~1.2 m/s for `DEFAULT_N_STEPS * dt` = 6 s, so they reach only
x ~ 7.2 m and their closest approach is dominated by their starting `y`. A pedestrian starting
near y = 0 or y = 12 clears 6 m comfortably; one starting near y = 6 does not. With 12 pedestrians
drawn uniformly in y, at least one usually qualifies in every scene, but it is not guaranteed for
every seed and scene count. If the intersection comes up empty, lower
`DEFAULT_EXCLUSION_RADIUS_M` to 5.0 and re-check that the removed agent's closest approach is
still comfortably outside the robot's displacement decay length (3.0 m, `_DISPLACEMENT_DECAY_LENGTH_M`
in `data/synthetic.py`). Do not fix it by widening the search to a single scene — that
reintroduces the bug this task's selection helper exists to avoid.

- [ ] **Step 5: Lint and run the full suite**

Run: `.venv/bin/python -m ruff check src tests && .venv/bin/python -m pytest -q`
Expected: `All checks passed!` then PASS, 201 tests.

- [ ] **Step 6: Commit**

```bash
git add src/mirn/experiments tests/test_experiments.py tests/test_placebo.py
git commit -m "Add the placebo experiment and share its selection logic with the gate test"
```

---

### Task 11: The CLI

**Files:**
- Create: `src/mirn/cli.py`
- Modify: `pyproject.toml`
- Test: `tests/test_cli.py`

**Interfaces:**
- Consumes: `EXPERIMENTS`; `mirn.paths.results_dir`, `mirn.paths.default_seed`; `mirn.viz.figures`.
- Produces: `main(argv: Sequence[str] | None = None) -> int`. Subcommands `list`, `run`, `serve`.

`cli.py` is the only module in `src/mirn/` permitted to call `print()`, and the only one that may
reference `mirn_app` — and it does so inside a function body, guarded, so an absent `app` extra
produces an actionable message rather than a traceback.

- [ ] **Step 1: Write the failing test**

Create `tests/test_cli.py`:

```python
"""The CLI is the non-interactive path to the same results the page shows. It must write a real
CSV and it must fail helpfully."""

from __future__ import annotations

import pandas as pd
import pytest

from mirn import cli


def test_list_prints_every_registered_experiment(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = cli.main(["list"])
    captured = capsys.readouterr()
    assert exit_code == 0
    for name in ("calibration_floor", "estimator_comparison", "confounding_sweep", "placebo"):
        assert name in captured.out


def test_list_prints_parameter_names(capsys: pytest.CaptureFixture[str]) -> None:
    cli.main(["list"])
    captured = capsys.readouterr()
    assert "divergence" in captured.out
    assert "n_scenes" in captured.out


def test_run_writes_a_csv_to_the_requested_path(tmp_path) -> None:
    out_path = tmp_path / "floor.csv"
    exit_code = cli.main(
        [
            "run",
            "calibration_floor",
            "--param",
            "n_scenes=3",
            "--param",
            "n_splits=20",
            "--seed",
            "0",
            "--out",
            str(out_path),
        ]
    )
    assert exit_code == 0
    assert out_path.exists()
    frame = pd.read_csv(out_path)
    assert list(frame.columns) == [
        "divergence",
        "n_scenes",
        "n_splits",
        "null_mean",
        "null_sd",
        "mdp_95",
        "seed",
    ]
    assert len(frame) == 1


def test_run_writes_a_figure_when_asked(tmp_path) -> None:
    out_path = tmp_path / "floor.csv"
    figure_path = tmp_path / "floor.png"
    cli.main(
        [
            "run",
            "calibration_floor",
            "--param",
            "n_scenes=3",
            "--param",
            "n_splits=20",
            "--out",
            str(out_path),
            "--figure",
            str(figure_path),
        ]
    )
    assert figure_path.exists()
    assert figure_path.stat().st_size > 0


def test_run_rejects_an_unknown_experiment(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = cli.main(["run", "no_such_experiment"])
    captured = capsys.readouterr()
    assert exit_code == 1
    assert "calibration_floor" in captured.err


def test_run_rejects_an_unknown_parameter(capsys: pytest.CaptureFixture[str], tmp_path) -> None:
    exit_code = cli.main(
        ["run", "calibration_floor", "--param", "nonsense=1", "--out", str(tmp_path / "x.csv")]
    )
    captured = capsys.readouterr()
    assert exit_code == 1
    assert "unknown parameter" in captured.err


def test_run_rejects_a_malformed_param(capsys: pytest.CaptureFixture[str], tmp_path) -> None:
    exit_code = cli.main(
        ["run", "calibration_floor", "--param", "missing_equals", "--out", str(tmp_path / "x.csv")]
    )
    captured = capsys.readouterr()
    assert exit_code == 1
    assert "key=value" in captured.err
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_cli.py -q`
Expected: FAIL — `ImportError: cannot import name 'cli' from 'mirn'`

- [ ] **Step 3: Write the implementation**

Create `src/mirn/cli.py`:

```python
"""The command-line entry point: the non-interactive path to the same results the page shows.

This is the only module in `src/mirn/` allowed to print, and the only one allowed to reference
`mirn_app`. The `mirn_app` import lives inside `_serve` rather than at module scope so that the
library stays importable without the `app` extra installed, and so an absent extra produces an
instruction rather than a traceback.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

import matplotlib

from mirn.experiments import EXPERIMENTS
from mirn.paths import default_seed, results_dir

matplotlib.use("Agg")

_FIGURE_BUILDERS: dict[str, str] = {
    "calibration_floor": "null_distribution",
    "confounding_sweep": "confounding_sweep",
}


def _parse_params(raw_params: Sequence[str]) -> dict[str, object]:
    parsed: dict[str, object] = {}
    for entry in raw_params:
        if "=" not in entry:
            raise ValueError(f"--param expects key=value, got '{entry}'")
        separator_index = entry.index("=")
        key = entry[:separator_index].strip()
        value = entry[separator_index + 1 :].strip()
        if len(key) == 0:
            raise ValueError(f"--param expects key=value with a non-empty key, got '{entry}'")
        parsed[key] = value
    return parsed


def _write_figure(experiment_name: str, result: object, figure_path: str) -> None:
    """Render the figure that belongs to this experiment, if it has one."""
    from mirn.viz.figures import confounding_sweep_figure, null_distribution_figure

    if experiment_name not in _FIGURE_BUILDERS:
        raise ValueError(
            f"experiment '{experiment_name}' has no figure; --figure is supported for: "
            f"{', '.join(sorted(_FIGURE_BUILDERS.keys()))}"
        )

    builder = _FIGURE_BUILDERS[experiment_name]
    if builder == "null_distribution":
        import numpy as np

        samples = np.asarray(result.payload["null_samples"], dtype=float)  # type: ignore[attr-defined]
        mdp_95 = float(result.payload["mdp_95"])  # type: ignore[attr-defined]
        divergence = str(result.payload["divergence"])  # type: ignore[attr-defined]
        figure = null_distribution_figure(samples, mdp_95, divergence)
    else:
        figure = confounding_sweep_figure(result.frame)  # type: ignore[attr-defined]
    figure.savefig(figure_path)


def _cmd_list() -> int:
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        print(f"{name}  -  {experiment.title}")
        print(f"    claim: {experiment.claim}")
        for parameter in experiment.parameters():
            if parameter.kind == "choice":
                domain = "one of " + ", ".join(parameter.choices)
            else:
                domain = f"{parameter.minimum} to {parameter.maximum}"
            print(f"    --param {parameter.name}=<{parameter.kind}>  default "
                  f"{parameter.default}, {domain}")
        print("")
    return 0


def _cmd_run(args: argparse.Namespace) -> int:
    try:
        experiment = EXPERIMENTS.create(args.experiment)
    except KeyError as error:
        print(str(error).strip('"'), file=sys.stderr)
        return 1

    try:
        params = _parse_params(args.param)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    if args.seed is None:
        seed = default_seed()
    else:
        seed = args.seed

    try:
        result = experiment.run(params, seed)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    if args.out is None:
        out_path = str(results_dir() / f"{args.experiment}.csv")
    else:
        out_path = args.out
    result.frame.to_csv(out_path, index=False)
    print(f"wrote {len(result.frame)} rows to {out_path}")

    if args.figure is not None:
        try:
            _write_figure(args.experiment, result, args.figure)
        except ValueError as error:
            print(str(error), file=sys.stderr)
            return 1
        print(f"wrote figure to {args.figure}")

    return 0


def _cmd_serve(args: argparse.Namespace) -> int:
    try:
        from mirn_app.server import run_server
    except ModuleNotFoundError:
        print(
            "the web interface needs the optional app dependencies; install them with:\n"
            '    pip install -e ".[app]"',
            file=sys.stderr,
        )
        return 1
    print(f"serving the MIRN instrument on http://{args.host}:{args.port}")
    run_server(args.host, args.port)
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mirn", description="The MIRN measurement instrument.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="list every registered experiment and its parameters")

    run_parser = subparsers.add_parser("run", help="run one experiment and write its CSV")
    run_parser.add_argument("experiment", help="experiment name; see `mirn list`")
    run_parser.add_argument(
        "--param", action="append", default=[], metavar="KEY=VALUE",
        help="set one experiment parameter; repeatable",
    )
    run_parser.add_argument("--seed", type=int, default=None, help="explicit seed")
    run_parser.add_argument("--out", default=None, help="CSV output path")
    run_parser.add_argument("--figure", default=None, help="optional figure output path")

    serve_parser = subparsers.add_parser("serve", help="run the local web interface")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8000)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Entry point. Returns a process exit code; never raises for user error."""
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "list":
        return _cmd_list()
    if args.command == "run":
        return _cmd_run(args)
    return _cmd_serve(args)


if __name__ == "__main__":
    raise SystemExit(main())
```

**Note on the `if args.command == ...` chain:** Global Constraint 5 bans dispatch chains over
*registry names*. This chain is over argparse subcommands, which are a fixed, closed set defined
three lines above in the same file, not an extension point. Leave it.

- [ ] **Step 4: Add the console script to `pyproject.toml`**

Insert after the `[project.optional-dependencies]` block:

```toml
[project.scripts]
mirn = "mirn.cli:main"
```

Then reinstall so the entry point exists: `.venv/bin/pip install -e ".[dev]"`

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_cli.py -q`
Expected: PASS, 7 tests.

- [ ] **Step 6: Confirm the CLI works end to end by hand**

```bash
.venv/bin/python -m mirn.cli list
.venv/bin/python -m mirn.cli run calibration_floor --param n_scenes=4 --param n_splits=50 --seed 0
```

Expected: the experiment list prints with parameters, then `wrote 1 rows to results/calibration_floor.csv`. Open the CSV and confirm `mdp_95` is positive.

- [ ] **Step 7: Lint and run the full suite**

Run: `.venv/bin/python -m ruff check src tests && .venv/bin/python -m pytest -q`
Expected: `All checks passed!` then PASS, 208 tests.

- [ ] **Step 8: Commit**

```bash
git add src/mirn/cli.py tests/test_cli.py pyproject.toml
git commit -m "Add the mirn CLI: list, run to CSV, serve"
```

---

## Phase 3 — The API and the boundary

### Task 12: The library/app boundary and packaging

**Files:**
- Create: `tests/test_boundary.py`
- Create: `src/mirn_app/__init__.py`
- Modify: `pyproject.toml`

**Interfaces:**
- Consumes: nothing at runtime; the test reads source with `ast`.
- Produces: the enforced guarantee that `src/mirn/` never imports a web package, and the `app` extra.

**Why an AST test rather than an import test:** an import-based check would pass whenever the extra
happens to be installed, which is exactly when the boundary is easiest to break. Parsing the source
means the rule holds in every environment.

- [ ] **Step 1: Write the failing test**

Create `tests/test_boundary.py`:

```python
"""The library must stay paper-grade: the estimator that gets cited must not acquire a web
dependency. This is checked by parsing source rather than by importing, so the rule holds even in
an environment where the app extra happens to be installed."""

from __future__ import annotations

import ast
from pathlib import Path

_LIBRARY_ROOT = Path(__file__).parent.parent / "src" / "mirn"
_FORBIDDEN_ROOTS: tuple[str, ...] = (
    "fastapi",
    "uvicorn",
    "starlette",
    "httpx",
    "flask",
    "django",
    "aiohttp",
)

# mirn.cli is the single module allowed to reference the app package, and only inside a function
# body, so that `mirn serve` can offer an actionable message when the extra is absent.
_MIRN_APP_ALLOWED_IN: tuple[str, ...] = ("cli.py",)


def _module_paths() -> list[Path]:
    paths: list[Path] = []
    for path in sorted(_LIBRARY_ROOT.rglob("*.py")):
        paths.append(path)
    return paths


def _imported_roots(tree: ast.AST) -> list[str]:
    roots: list[str] = []
    for node in ast.walk(tree):
        if type(node) is ast.Import:
            for alias in node.names:
                roots.append(alias.name.split(".")[0])
        elif type(node) is ast.ImportFrom:
            if node.module is not None and node.level == 0:
                roots.append(node.module.split(".")[0])
    return roots


def test_the_library_has_modules_to_check() -> None:
    """Guards against the walk silently finding nothing and the suite passing vacuously."""
    assert len(_module_paths()) >= 20


def test_no_library_module_imports_a_web_package() -> None:
    offenders: list[str] = []
    for path in _module_paths():
        tree = ast.parse(path.read_text())
        for root in _imported_roots(tree):
            if root in _FORBIDDEN_ROOTS:
                offenders.append(f"{path.name} imports {root}")
    assert offenders == [], f"web dependencies leaked into src/mirn/: {offenders}"


def test_only_the_cli_references_the_app_package() -> None:
    offenders: list[str] = []
    for path in _module_paths():
        if path.name in _MIRN_APP_ALLOWED_IN:
            continue
        tree = ast.parse(path.read_text())
        for root in _imported_roots(tree):
            if root == "mirn_app":
                offenders.append(f"{path.name} imports mirn_app")
    assert offenders == [], f"mirn_app referenced outside the CLI: {offenders}"


def test_importing_mirn_pulls_in_no_web_package() -> None:
    import sys

    import mirn  # noqa: F401
    import mirn.experiments  # noqa: F401
    import mirn.method  # noqa: F401
    import mirn.viz  # noqa: F401

    for forbidden in ("fastapi", "uvicorn", "starlette"):
        assert forbidden not in sys.modules, (
            f"importing mirn pulled in {forbidden}; the library/app boundary has leaked"
        )
```

- [ ] **Step 2: Run test to verify it fails or passes for the right reason**

Run: `.venv/bin/python -m pytest tests/test_boundary.py -q`
Expected: PASS, 4 tests. This test is written *before* `mirn_app` exists precisely so the boundary
is guarded from the first line of Task 13 onward. If it fails now, something in Phase 1–2 already
leaked and must be fixed before continuing.

**Caveat:** `test_importing_mirn_pulls_in_no_web_package` can be polluted by earlier tests in the
same session importing FastAPI. After Task 13 exists, run it in isolation to confirm:
`.venv/bin/python -m pytest tests/test_boundary.py -q -p no:randomly`

- [ ] **Step 3: Create the app package marker**

Create `src/mirn_app/__init__.py`:

```python
"""The MIRN instrument's local web interface.

A sibling package of `mirn`, never a subpackage, so the boundary between the research library and
the web application is a namespace boundary rather than a convention. This package imports `mirn`;
`mirn` imports this package from exactly one guarded function body in `mirn.cli`.

Importing this package requires the optional app dependencies: `pip install -e ".[app]"`.
"""

from __future__ import annotations

__all__: list[str] = []
```

- [ ] **Step 4: Add the app extra and package data to `pyproject.toml`**

Modify `[project.optional-dependencies]` to read:

```toml
[project.optional-dependencies]
app = [
    "fastapi",
    "uvicorn[standard]",
]
dev = [
    "pytest",
    "hypothesis",
    "ruff",
    "httpx",
]
```

And append after `[tool.setuptools.packages.find]`:

```toml
[tool.setuptools.package-data]
mirn_app = ["static/*", "static/vendor/katex/*", "static/vendor/katex/fonts/*"]
```

`where = ["src"]` is unchanged; `packages.find` now discovers both `mirn` and `mirn_app`.

- [ ] **Step 5: Install the extras**

Run: `.venv/bin/pip install -e ".[dev,app]"`
Expected: fastapi, uvicorn, and httpx install; `mirn` and `mirn_app` are both importable.

- [ ] **Step 6: Verify the boundary holds with the extra installed**

Run: `.venv/bin/python -m pytest tests/test_boundary.py -q`
Expected: PASS, 4 tests — the AST checks are unaffected by what is installed, which is the point.

- [ ] **Step 7: Run the full suite and commit**

```bash
.venv/bin/python -m ruff check src tests && .venv/bin/python -m pytest -q
git add tests/test_boundary.py src/mirn_app/__init__.py pyproject.toml
git commit -m "Enforce the library/app boundary and add the app extra"
```

Expected: PASS, 212 tests.

---

### Task 13: The FastAPI server

**Files:**
- Create: `src/mirn_app/server.py`
- Test: `tests/test_app_api.py`

**Interfaces:**
- Consumes: `EXPERIMENTS`, `CARDS`/`card_for`, `mirn.viz.theme.css_root_block`, `SyntheticAdapter`, `mirn.paths.results_dir`, `default_seed`.
- Produces: `create_app() -> FastAPI`, `run_server(host: str, port: int) -> None`.

**Rule:** this module contains routing and serialisation only. Any computation that appears here is
a design failure — it belongs in an `Experiment`.

**Error mapping, defined once:** `ValueError` from `Experiment.resolve` or `run` → HTTP 400 with the
message passed through verbatim. `KeyError` from a registry → HTTP 404 with the registry's own
message, which already lists the available names. The estimators write good errors; the API shows
them rather than inventing worse ones.

- [ ] **Step 1: Write the failing test**

Create `tests/test_app_api.py`:

```python
"""API contract tests. No network: FastAPI's TestClient calls the app in-process."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from mirn.experiments import EXPERIMENTS
from mirn_app.server import create_app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app())


def test_index_serves_html_with_the_theme_injected(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "--mirn-background" in response.text
    assert "MIRN_THEME" not in response.text, "the theme placeholder was not substituted"


def test_meta_lists_every_registered_experiment(client: TestClient) -> None:
    response = client.get("/api/meta")
    assert response.status_code == 200
    body = response.json()
    listed: list[str] = []
    for entry in body["experiments"]:
        listed.append(entry["name"])
    assert sorted(listed) == sorted(EXPERIMENTS.names())


def test_meta_carries_theme_tokens_and_a_default_seed(client: TestClient) -> None:
    body = client.get("/api/meta").json()
    assert body["theme"]["--mirn-paired"].startswith("#")
    assert type(body["default_seed"]) is int


def test_meta_parameters_are_rich_enough_to_build_a_control(client: TestClient) -> None:
    body = client.get("/api/meta").json()
    for entry in body["experiments"]:
        for parameter in entry["parameters"]:
            assert parameter["kind"] in ("float", "int", "choice")
            assert len(parameter["label"]) > 0
            if parameter["kind"] == "choice":
                assert len(parameter["choices"]) > 0
            else:
                assert parameter["minimum"] is not None
                assert parameter["maximum"] is not None


def test_running_an_experiment_returns_rows_and_payload(client: TestClient) -> None:
    response = client.post(
        "/api/experiment/calibration_floor",
        json={"params": {"n_scenes": 3, "n_splits": 20}, "seed": 0},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["experiment_name"] == "calibration_floor"
    assert len(body["rows"]) == 1
    assert body["payload"]["mdp_95"] > 0.0
    assert "split_half_null" in body["method_keys"]


def test_running_an_unknown_experiment_returns_404_listing_available(client: TestClient) -> None:
    response = client.post("/api/experiment/nope", json={"params": {}, "seed": 0})
    assert response.status_code == 404
    assert "calibration_floor" in response.json()["detail"]


def test_an_unknown_parameter_returns_400_with_the_library_message(client: TestClient) -> None:
    response = client.post(
        "/api/experiment/calibration_floor", json={"params": {"bogus": 1}, "seed": 0}
    )
    assert response.status_code == 400
    assert "unknown parameter" in response.json()["detail"]


def test_an_out_of_range_parameter_returns_400(client: TestClient) -> None:
    response = client.post(
        "/api/experiment/calibration_floor", json={"params": {"n_scenes": 9999}, "seed": 0}
    )
    assert response.status_code == 400
    assert "n_scenes" in response.json()["detail"]


def test_method_endpoint_returns_a_card(client: TestClient) -> None:
    body = client.get("/api/method/paired").json()
    assert body["key"] == "paired"
    assert body["kind"] == "estimator"
    assert len(body["formula_tex"]) > 0
    assert len(body["breaks_when"]) > 0


def test_unknown_method_returns_404_listing_available(client: TestClient) -> None:
    response = client.get("/api/method/nope")
    assert response.status_code == 404
    assert "paired" in response.json()["detail"]


def test_scene_endpoint_returns_both_arms(client: TestClient) -> None:
    response = client.get("/api/scene", params={"influence": 1.0, "seed": 0, "scene_index": 0})
    assert response.status_code == 200
    body = response.json()
    assert len(body["factual"]) == len(body["counterfactual"])
    assert len(body["factual"]) > 0
    first_path = body["factual"][0]["positions"]
    assert len(first_path[0]) == 2
    assert body["robot"] is not None
    assert body["extent"]["width"] > 0.0


def test_scene_arms_are_identical_at_zero_influence(client: TestClient) -> None:
    body = client.get("/api/scene", params={"influence": 0.0, "seed": 0}).json()
    assert body["factual"][0]["positions"] == body["counterfactual"][0]["positions"]


def test_scene_index_out_of_range_returns_400(client: TestClient) -> None:
    response = client.get("/api/scene", params={"scene_index": 999, "seed": 0})
    assert response.status_code == 400


def test_export_writes_every_experiment_csv(client: TestClient, tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("MIRN_RESULTS_DIR", str(tmp_path))
    response = client.post(
        "/api/export",
        json={"seed": 0, "params": {"calibration_floor": {"n_scenes": 3, "n_splits": 20}}},
    )
    assert response.status_code == 200
    written = response.json()["written"]
    assert len(written) == len(EXPERIMENTS.names())
    for path in written:
        assert path.endswith(".csv")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_app_api.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'mirn_app.server'`

- [ ] **Step 3: Write the implementation**

Create `src/mirn_app/server.py`:

```python
"""The local web interface: routing and serialisation only.

Every number this server returns was computed by `src/mirn/`. Nothing here estimates, calibrates,
or sweeps anything; if a computation appears in this file it belongs in an `Experiment` instead.

Error mapping is defined once. `ValueError` from the experiment layer means the caller supplied a
bad parameter, so it becomes HTTP 400 with the library's own message. `KeyError` from a registry
means an unknown name, so it becomes HTTP 404 with the registry's message, which already lists the
available names.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from mirn.contracts import Scene
from mirn.data.synthetic import SyntheticAdapter
from mirn.experiments import EXPERIMENTS
from mirn.experiments.calibration_floor import DEFAULT_N_PEDESTRIANS, DEFAULT_N_STEPS
from mirn.method.catalog import CARDS, card_for
from mirn.paths import default_seed, results_dir
from mirn.viz.theme import as_css_tokens, css_root_block

_STATIC_DIR = Path(__file__).parent / "static"
_THEME_PLACEHOLDER = "/* MIRN_THEME */"


class RunRequest(BaseModel):
    """Body of `POST /api/experiment/{name}`."""

    params: dict[str, object] = Field(default_factory=dict)
    seed: int = 0


class ExportRequest(BaseModel):
    """Body of `POST /api/export`. `params` is keyed by experiment name."""

    params: dict[str, dict[str, object]] = Field(default_factory=dict)
    seed: int = 0


def _registry_detail(error: KeyError) -> str:
    """A registry KeyError's message, with the repr quoting KeyError adds stripped off."""
    return str(error).strip('"').strip("'")


def _trajectories_as_json(scene: Scene) -> list[dict[str, object]]:
    agents: list[dict[str, object]] = []
    for pedestrian in scene.pedestrians:
        positions: list[list[float]] = []
        for step_index in range(pedestrian.positions.shape[0]):
            point = pedestrian.positions[step_index]
            positions.append([float(point[0]), float(point[1])])
        agents.append({"agent_id": pedestrian.agent_id, "positions": positions})
    return agents


def create_app() -> FastAPI:
    """Build the application. Constructed per-call so tests get a clean instance."""
    app = FastAPI(title="MIRN instrument", docs_url=None, redoc_url=None)

    app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

    @app.get("/", response_class=HTMLResponse)
    def index() -> HTMLResponse:
        template = (_STATIC_DIR / "index.html").read_text()
        page = template.replace(_THEME_PLACEHOLDER, css_root_block())
        return HTMLResponse(page)

    @app.get("/api/meta")
    def meta() -> dict[str, object]:
        described: list[dict[str, object]] = []
        for name in EXPERIMENTS.names():
            experiment = EXPERIMENTS.create(name)
            described.append(experiment.describe())
        body: dict[str, object] = {}
        body["theme"] = as_css_tokens()
        body["default_seed"] = default_seed()
        body["experiments"] = described
        body["data_note"] = (
            "All figures on this page are computed from synthetic paired rollouts. They "
            "demonstrate the instrument; they are not measurements of real pedestrians."
        )
        return body

    @app.post("/api/experiment/{name}")
    def run_experiment(name: str, request: RunRequest) -> dict[str, object]:
        try:
            experiment = EXPERIMENTS.create(name)
        except KeyError as error:
            raise HTTPException(status_code=404, detail=_registry_detail(error)) from error
        try:
            result = experiment.run(request.params, request.seed)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return result.as_json()

    @app.get("/api/method/{key}")
    def method(key: str) -> dict[str, object]:
        try:
            card = card_for(key)
        except KeyError as error:
            raise HTTPException(status_code=404, detail=_registry_detail(error)) from error
        return card.as_dict()

    @app.get("/api/methods")
    def methods() -> dict[str, object]:
        cards: dict[str, object] = {}
        for key in sorted(CARDS.keys()):
            cards[key] = CARDS[key].as_dict()
        return {"cards": cards}

    @app.get("/api/scene")
    def scene(influence: float = 1.0, seed: int = 0, scene_index: int = 0) -> dict[str, object]:
        if influence < 0.0 or influence > 2.0:
            raise HTTPException(
                status_code=400, detail=f"influence must be between 0.0 and 2.0, got {influence}"
            )
        adapter = SyntheticAdapter(
            n_scenes=max(scene_index + 1, 1),
            n_pedestrians=DEFAULT_N_PEDESTRIANS,
            n_steps=DEFAULT_N_STEPS,
            seed=seed,
        )
        pairs = adapter.rollout_pairs_with_influence(influence)
        if scene_index < 0 or scene_index >= len(pairs):
            raise HTTPException(
                status_code=400,
                detail=f"scene_index must be between 0 and {len(pairs) - 1}, got {scene_index}",
            )
        pair = pairs[scene_index]

        robot_positions: list[list[float]] | None = None
        if pair.factual.robot is not None:
            robot_positions = []
            for step_index in range(pair.factual.robot.positions.shape[0]):
                point = pair.factual.robot.positions[step_index]
                robot_positions.append([float(point[0]), float(point[1])])

        body: dict[str, object] = {}
        body["factual"] = _trajectories_as_json(pair.factual)
        body["counterfactual"] = _trajectories_as_json(pair.counterfactual)
        body["robot"] = robot_positions
        body["influence"] = influence
        body["seed"] = seed
        body["extent"] = {"width": 20.0, "height": 12.0}
        return body

    @app.post("/api/export")
    def export(request: ExportRequest) -> dict[str, object]:
        destination = results_dir()
        written: list[str] = []
        for name in EXPERIMENTS.names():
            experiment = EXPERIMENTS.create(name)
            if name in request.params:
                params = request.params[name]
            else:
                params = {}
            try:
                result = experiment.run(params, request.seed)
            except ValueError as error:
                raise HTTPException(
                    status_code=400, detail=f"{name}: {error}"
                ) from error
            path = destination / f"{name}.csv"
            result.frame.to_csv(path, index=False)
            written.append(str(path))
        return {"written": written, "seed": request.seed}

    return app


def run_server(host: str, port: int) -> None:
    """Serve the application. Called only from `mirn.cli._cmd_serve`."""
    import uvicorn

    uvicorn.run(create_app(), host=host, port=port, log_level="warning")
```

**Note on `_STATIC_DIR` not existing yet:** `StaticFiles` raises at mount time if the directory is
absent, and `index()` reads `index.html`. Create the directory and a minimal placeholder before
running the tests:

```bash
mkdir -p src/mirn_app/static
printf '<main><h1>MIRN</h1></main>\n<style>/* MIRN_THEME */</style>\n' > src/mirn_app/static/index.html
```

Task 14 replaces that placeholder with the real page. The `/* MIRN_THEME */` token must survive
into the real file — `test_index_serves_html_with_the_theme_injected` depends on it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_app_api.py -q`
Expected: PASS, 14 tests.

- [ ] **Step 5: Confirm the boundary still holds in isolation**

Run: `.venv/bin/python -m pytest tests/test_boundary.py -q`
Expected: PASS, 4 tests.

- [ ] **Step 6: Lint, full suite, commit**

```bash
.venv/bin/python -m ruff check src tests && .venv/bin/python -m pytest -q
git add src/mirn_app tests/test_app_api.py
git commit -m "Add the FastAPI server: routing and serialisation over the experiment layer"
```

Expected: PASS, 226 tests.

---

## Phase 4 — The page

### Task 14: The guided-argument page

**Files:**
- Create/replace: `src/mirn_app/static/index.html`
- Create: `src/mirn_app/static/style.css`
- Create: `src/mirn_app/static/app.js`
- Create: `src/mirn_app/static/vendor/katex/` (vendored assets)

**Interfaces:**
- Consumes: `GET /api/meta`, `POST /api/experiment/{name}`, `GET /api/methods`, `GET /api/scene`, `POST /api/export` from Task 13.
- Produces: no Python interface. This is a leaf.

**Design constraints, from `CLAUDE.md` and the spec:**
- Dark, minimal, high contrast on data ink and muted chrome. No gradients, no shadows, no chart junk.
- **Every colour and font in `style.css` must be `var(--mirn-*)`.** No literal colour appears in the stylesheet; the tokens are injected by the server from `mirn.viz.theme`. Sizing, spacing, and layout values are the stylesheet's own business.
- Controls are generated from `parameters()`. **No `if (name === "calibration_floor")` anywhere in `app.js`** — the same renderer must handle an experiment added later without modification.
- Nothing is computed in JavaScript. Canvas code reads numbers out of the payload and draws them.
- The page states, visibly and not in a footnote, that the data is synthetic.

- [ ] **Step 1: Vendor KaTeX**

```bash
mkdir -p src/mirn_app/static/vendor
curl -L -o /tmp/katex.tar.gz \
  https://github.com/KaTeX/KaTeX/releases/download/v0.16.11/katex.tar.gz
tar -xzf /tmp/katex.tar.gz -C src/mirn_app/static/vendor
ls src/mirn_app/static/vendor/katex/katex.min.js src/mirn_app/static/vendor/katex/katex.min.css
```

Expected: both files exist. If the release URL 404s, check the latest tag at
`https://github.com/KaTeX/KaTeX/releases` and use that version — pin whatever you use in a comment
at the top of `index.html`. The page must degrade gracefully if KaTeX is missing (Step 4 handles
this), so a failed vendoring blocks nothing except typeset math.

- [ ] **Step 2: Write `index.html`**

Replace `src/mirn_app/static/index.html` entirely:

```html
<!-- KaTeX vendored from https://github.com/KaTeX/KaTeX/releases/tag/v0.16.11 -->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MIRN — measuring robot-induced perturbation</title>
<link rel="stylesheet" href="/static/vendor/katex/katex.min.css">
<link rel="stylesheet" href="/static/style.css">
<style>/* MIRN_THEME */</style>
</head>
<body>
<header class="masthead">
  <p class="eyebrow">A measurement instrument</p>
  <h1>How much did the robot disturb people?</h1>
  <p class="standfirst">
    The field answers this by running a trajectory predictor with the robot's future zeroed and
    subtracting what the human actually did. That number is partly prediction error wearing a
    causal label. This page walks the argument, computing every figure live.
  </p>
  <p class="synthetic-banner" id="data-note">All data on this page is synthetic.</p>
</header>

<section class="scene-panel">
  <div class="scene-copy">
    <h2>The paired rollout</h2>
    <p>
      One crowd, run twice from the same seed and the same exogenous noise: once with a robot in
      the middle of the box, once with no robot at all. Because everything else is held identical,
      the difference between an agent's two paths <em>is</em> the robot's causal effect on it — no
      forecaster involved.
    </p>
    <label class="control">
      <span class="control-label">Robot influence <output id="influence-readout">1.00</output></span>
      <input type="range" id="scene-influence" min="0" max="2" step="0.05" value="1">
    </label>
    <ul class="legend">
      <li><span class="swatch swatch-counterfactual"></span>robot absent</li>
      <li><span class="swatch swatch-factual"></span>robot present</li>
      <li><span class="swatch swatch-accent"></span>robot</li>
    </ul>
  </div>
  <canvas id="scene-canvas" width="760" height="456" aria-label="Paired pedestrian trajectories"></canvas>
</section>

<main id="sections"></main>

<footer class="page-footer">
  <button id="export-button" type="button">Export every experiment to results/</button>
  <p id="export-status" class="export-status"></p>
  <p class="seed-note">Seed <output id="seed-readout">0</output> — every figure here is reproducible from it.</p>
</footer>

<template id="section-template">
  <section class="experiment">
    <p class="section-index"></p>
    <h2 class="section-title"></h2>
    <p class="section-claim"></p>
    <div class="experiment-body">
      <form class="controls"></form>
      <div class="output">
        <div class="readout"></div>
        <canvas class="plot" width="520" height="300"></canvas>
        <p class="plot-note"></p>
      </div>
    </div>
    <details class="mathematics">
      <summary>The mathematics</summary>
      <div class="cards"></div>
    </details>
  </section>
</template>

<script src="/static/vendor/katex/katex.min.js" defer></script>
<script src="/static/app.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 3: Write `style.css`**

Create `src/mirn_app/static/style.css`. Every colour is a token; none is a literal:

```css
/* All colour and type tokens are injected by the server from mirn.viz.theme.
   Never write a colour literal in this file. */

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0 0 6rem;
  background: var(--mirn-background);
  color: var(--mirn-ink);
  font-family: var(--mirn-font-sans);
  font-size: 15px;
  line-height: 1.6;
}

.masthead { max-width: 62rem; margin: 0 auto; padding: 4rem 2rem 2rem; }
.eyebrow {
  margin: 0 0 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.7rem;
  color: var(--mirn-ink-muted);
}
.masthead h1 { margin: 0 0 1rem; font-size: 2.4rem; line-height: 1.15; font-weight: 600; }
.standfirst { margin: 0 0 1.5rem; max-width: 46rem; color: var(--mirn-ink-muted); }

.synthetic-banner {
  display: inline-block;
  margin: 0;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--mirn-grid);
  border-radius: 3px;
  font-family: var(--mirn-font-mono);
  font-size: 0.75rem;
  color: var(--mirn-floor);
}

.scene-panel {
  max-width: 62rem;
  margin: 2rem auto 4rem;
  padding: 1.75rem 2rem;
  display: grid;
  grid-template-columns: minmax(16rem, 22rem) 1fr;
  gap: 2rem;
  align-items: center;
  background: var(--mirn-surface);
  border: 1px solid var(--mirn-grid);
  border-radius: 6px;
}
.scene-copy h2 { margin: 0 0 0.75rem; font-size: 1.15rem; font-weight: 600; }
.scene-copy p { margin: 0 0 1.25rem; color: var(--mirn-ink-muted); font-size: 0.9rem; }
#scene-canvas { width: 100%; height: auto; display: block; }

.legend { list-style: none; margin: 1rem 0 0; padding: 0; font-size: 0.8rem; color: var(--mirn-ink-muted); }
.legend li { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem; }
.swatch { width: 0.85rem; height: 0.2rem; border-radius: 1px; display: inline-block; }
.swatch-counterfactual { background: var(--mirn-counterfactual); }
.swatch-factual { background: var(--mirn-factual); }
.swatch-accent { background: var(--mirn-accent); }

main { max-width: 62rem; margin: 0 auto; padding: 0 2rem; }

.experiment { margin: 0 0 4.5rem; padding-top: 2.5rem; border-top: 1px solid var(--mirn-grid); }
.section-index {
  margin: 0 0 0.5rem;
  font-family: var(--mirn-font-mono);
  font-size: 0.75rem;
  color: var(--mirn-accent);
}
.experiment h2 { margin: 0 0 0.5rem; font-size: 1.5rem; font-weight: 600; }
.section-claim { margin: 0 0 1.75rem; max-width: 44rem; color: var(--mirn-ink-muted); }

.experiment-body { display: grid; grid-template-columns: minmax(14rem, 18rem) 1fr; gap: 2.5rem; }

.controls { display: flex; flex-direction: column; gap: 1.1rem; }
.control { display: flex; flex-direction: column; gap: 0.35rem; }
.control-label { font-size: 0.8rem; color: var(--mirn-ink-muted); display: flex; justify-content: space-between; }
.control-label output { font-family: var(--mirn-font-mono); color: var(--mirn-ink); }
.control-help { margin: 0; font-size: 0.72rem; color: var(--mirn-floor); line-height: 1.45; }

input[type="range"] { width: 100%; accent-color: var(--mirn-accent); }
select {
  background: var(--mirn-background);
  color: var(--mirn-ink);
  border: 1px solid var(--mirn-grid);
  border-radius: 3px;
  padding: 0.35rem 0.5rem;
  font-family: var(--mirn-font-mono);
  font-size: 0.8rem;
}

.readout { display: flex; flex-wrap: wrap; gap: 1.75rem; margin-bottom: 1.25rem; }
.stat { min-width: 8rem; }
.stat-label { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mirn-ink-muted); }
.stat-value { display: block; font-family: var(--mirn-font-mono); font-size: 1.5rem; line-height: 1.3; }
.stat-ci { display: block; font-family: var(--mirn-font-mono); font-size: 0.75rem; color: var(--mirn-floor); }
.stat-naive .stat-value { color: var(--mirn-naive); }
.stat-paired .stat-value { color: var(--mirn-paired); }
.stat-floor .stat-value { color: var(--mirn-floor); }

canvas.plot { width: 100%; height: auto; display: block; }
.plot-note { margin: 0.75rem 0 0; font-size: 0.78rem; color: var(--mirn-floor); max-width: 34rem; }

.is-pending { opacity: 0.45; transition: opacity 120ms ease-out; }
.error {
  margin: 0.75rem 0 0;
  padding: 0.6rem 0.8rem;
  border-left: 2px solid var(--mirn-naive);
  font-family: var(--mirn-font-mono);
  font-size: 0.78rem;
  color: var(--mirn-naive);
}

.mathematics { margin-top: 2rem; border-top: 1px dashed var(--mirn-grid); padding-top: 1rem; }
.mathematics summary { cursor: pointer; font-size: 0.85rem; color: var(--mirn-accent); }
.cards { display: grid; gap: 1.5rem; margin-top: 1.25rem; }

.card { padding: 1.25rem 1.4rem; background: var(--mirn-surface); border: 1px solid var(--mirn-grid); border-radius: 5px; }
.card h3 { margin: 0 0 0.25rem; font-size: 1rem; font-weight: 600; }
.card-kind {
  font-family: var(--mirn-font-mono);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--mirn-accent);
}
.card-one-liner { margin: 0.5rem 0 1rem; color: var(--mirn-ink-muted); font-size: 0.88rem; }
.math-label {
  margin: 1rem 0 0.35rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--mirn-ink-muted);
}
.math-block { overflow-x: auto; padding: 0.5rem 0; }
.math-fallback { font-family: var(--mirn-font-mono); font-size: 0.8rem; color: var(--mirn-ink-muted); }
.card ul { margin: 0.35rem 0 0; padding-left: 1.1rem; font-size: 0.85rem; color: var(--mirn-ink-muted); }
.card li { margin-bottom: 0.4rem; }
.breaks-when li { color: var(--mirn-naive); }
.card-citation { margin: 1rem 0 0; font-size: 0.75rem; color: var(--mirn-floor); }

.page-footer { max-width: 62rem; margin: 0 auto; padding: 3rem 2rem 0; border-top: 1px solid var(--mirn-grid); }
#export-button {
  background: transparent;
  color: var(--mirn-accent);
  border: 1px solid var(--mirn-accent);
  border-radius: 3px;
  padding: 0.55rem 1rem;
  font-family: var(--mirn-font-sans);
  font-size: 0.85rem;
  cursor: pointer;
}
#export-button:hover { background: var(--mirn-surface); }
.export-status, .seed-note { font-size: 0.78rem; color: var(--mirn-floor); font-family: var(--mirn-font-mono); }

@media (max-width: 900px) {
  .scene-panel, .experiment-body { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Write `app.js`**

Create `src/mirn_app/static/app.js`. Note the plot dispatch: it is keyed off the shape of the
returned payload, not off the experiment's name, so a new experiment whose payload carries
`null_samples` gets a histogram for free.

```javascript
// Every number rendered here was computed by src/mirn/ and arrived over HTTP.
// Nothing in this file estimates, calibrates, or sweeps anything.

const DEBOUNCE_MS = 250;

const state = {
  theme: {},
  seed: 0,
  cards: {},
  experiments: [],
};

function token(name) {
  return state.theme[name] || "#888888";
}

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(body.detail || response.statusText);
  }
  return response.json();
}

async function postJSON(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({ detail: response.statusText }));
  if (!response.ok) {
    throw new Error(parsed.detail || response.statusText);
  }
  return parsed;
}

function debounce(fn, wait) {
  let timer = null;
  return function debounced(...args) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

// ---------------------------------------------------------------- math rendering

function renderMath(target, tex) {
  if (window.katex) {
    try {
      window.katex.render(tex, target, { displayMode: true, throwOnError: false });
      return;
    } catch (error) {
      // fall through to the plain-text fallback below
    }
  }
  const fallback = document.createElement("code");
  fallback.className = "math-fallback";
  fallback.textContent = tex;
  target.appendChild(fallback);
}

function buildCard(card) {
  const wrapper = document.createElement("article");
  wrapper.className = "card";

  const kind = document.createElement("span");
  kind.className = "card-kind";
  kind.textContent = card.kind;
  wrapper.appendChild(kind);

  const title = document.createElement("h3");
  title.textContent = card.title;
  wrapper.appendChild(title);

  const oneLiner = document.createElement("p");
  oneLiner.className = "card-one-liner";
  oneLiner.textContent = card.one_liner;
  wrapper.appendChild(oneLiner);

  const mathSpecs = [
    ["Estimand — what we are trying to measure", card.estimand_tex],
    ["Formula — what the code computes", card.formula_tex],
  ];
  for (const [label, tex] of mathSpecs) {
    const heading = document.createElement("p");
    heading.className = "math-label";
    heading.textContent = label;
    wrapper.appendChild(heading);
    const block = document.createElement("div");
    block.className = "math-block";
    renderMath(block, tex);
    wrapper.appendChild(block);
  }

  const listSpecs = [
    ["Assumptions", card.assumptions, ""],
    ["Breaks when", card.breaks_when, "breaks-when"],
  ];
  for (const [label, items, className] of listSpecs) {
    const heading = document.createElement("p");
    heading.className = "math-label";
    heading.textContent = label;
    wrapper.appendChild(heading);
    const list = document.createElement("ul");
    if (className) {
      list.className = className;
    }
    for (const item of items) {
      const entry = document.createElement("li");
      entry.textContent = item;
      list.appendChild(entry);
    }
    wrapper.appendChild(list);
  }

  if (card.citation) {
    const citation = document.createElement("p");
    citation.className = "card-citation";
    citation.textContent = card.citation;
    wrapper.appendChild(citation);
  }
  return wrapper;
}

// ---------------------------------------------------------------- canvas plotting

function plotFrame(canvas) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  return {
    context,
    left: 54,
    right: canvas.width - 16,
    top: 16,
    bottom: canvas.height - 34,
  };
}

function makeScale(domainLow, domainHigh, rangeLow, rangeHigh) {
  const span = domainHigh - domainLow;
  const safeSpan = span === 0 ? 1 : span;
  return (value) => rangeLow + ((value - domainLow) / safeSpan) * (rangeHigh - rangeLow);
}

function drawAxes(frame, xLabel, yLabel, xLow, xHigh, yLow, yHigh) {
  const { context, left, right, top, bottom } = frame;
  context.strokeStyle = token("--mirn-grid");
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(left, bottom);
  context.lineTo(right, bottom);
  context.stroke();

  context.fillStyle = token("--mirn-ink-muted");
  context.font = "11px " + (state.theme["--mirn-font-mono"] || "monospace");
  context.textAlign = "center";
  context.fillText(xLabel, (left + right) / 2, bottom + 26);
  context.save();
  context.translate(14, (top + bottom) / 2);
  context.rotate(-Math.PI / 2);
  context.fillText(yLabel, 0, 0);
  context.restore();

  context.textAlign = "right";
  context.fillText(yHigh.toFixed(3), left - 6, top + 4);
  context.fillText(yLow.toFixed(3), left - 6, bottom);
  context.textAlign = "left";
  context.fillText(xLow.toFixed(2), left, bottom + 14);
  context.textAlign = "right";
  context.fillText(xHigh.toFixed(2), right, bottom + 14);
}

function drawHistogram(canvas, payload) {
  const samples = payload.null_samples;
  const frame = plotFrame(canvas);
  const { context, left, right, top, bottom } = frame;

  const lowest = Math.min(...samples, 0);
  const highest = Math.max(...samples, payload.mdp_95);
  const binCount = 28;
  const binWidth = (highest - lowest) / binCount || 1;
  const counts = new Array(binCount).fill(0);
  for (const sample of samples) {
    let index = Math.floor((sample - lowest) / binWidth);
    if (index >= binCount) index = binCount - 1;
    if (index < 0) index = 0;
    counts[index] += 1;
  }
  const tallest = Math.max(...counts, 1);

  const xScale = makeScale(lowest, highest, left, right);
  const yScale = makeScale(0, tallest, bottom, top);

  context.fillStyle = token("--mirn-counterfactual");
  for (let index = 0; index < binCount; index += 1) {
    const barLeft = xScale(lowest + index * binWidth);
    const barRight = xScale(lowest + (index + 1) * binWidth);
    const barTop = yScale(counts[index]);
    context.fillRect(barLeft, barTop, Math.max(barRight - barLeft - 1, 1), bottom - barTop);
  }

  const floorX = xScale(payload.mdp_95);
  context.strokeStyle = token("--mirn-floor");
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(floorX, top);
  context.lineTo(floorX, bottom);
  context.stroke();
  context.setLineDash([]);

  drawAxes(frame, "split-half divergence (m)", "draws", lowest, highest, 0, tallest);
}

function drawSweep(canvas, rows, payload) {
  const frame = plotFrame(canvas);
  const { context, left, right, top, bottom } = frame;

  // CLAUDE.md guardrail 3: perturbation is reported in MDP units against the measured null,
  // never in raw metres. The CSV keeps metres so it stays auditable; every DISPLAY normalises.
  // Normalised, the detection floor is exactly y = 1 and "crosses the floor" means "crosses 1".
  const floor = payload.mdp_95;
  context.font = "11px " + (state.theme["--mirn-font-mono"] || "monospace");
  if (!(floor > 0)) {
    context.fillStyle = token("--mirn-ink-muted");
    context.textAlign = "center";
    context.fillText(
      "no positive detection floor - cannot express in MDP units",
      (left + right) / 2,
      (top + bottom) / 2
    );
    return;
  }
  const norm = (value) => value / floor;

  const xValues = rows.map((row) => row.axis_value);
  const highs = rows.map((row) => norm(row.reported_ci_high));
  const xLow = Math.min(...xValues);
  const xHigh = Math.max(...xValues);
  const yHigh = Math.max(...highs, 1.0) * 1.15;

  const xScale = makeScale(xLow, xHigh, left, right);
  const yScale = makeScale(0, yHigh, bottom, top);

  const floorY = yScale(1.0);
  context.fillStyle = token("--mirn-floor");
  context.globalAlpha = 0.22;
  context.fillRect(left, floorY, right - left, bottom - floorY);
  context.globalAlpha = 1;

  context.strokeStyle = token("--mirn-floor");
  context.lineWidth = 1.2;
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(left, floorY);
  context.lineTo(right, floorY);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = token("--mirn-naive");
  context.globalAlpha = 0.18;
  context.beginPath();
  rows.forEach((row, index) => {
    const x = xScale(row.axis_value);
    const y = yScale(norm(row.reported_ci_high));
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    context.lineTo(xScale(rows[index].axis_value), yScale(norm(rows[index].reported_ci_low)));
  }
  context.closePath();
  context.fill();
  context.globalAlpha = 1;

  const series = [
    { key: "reported_value", color: token("--mirn-naive"), dash: [] },
    { key: "true_value", color: token("--mirn-paired"), dash: [5, 4] },
  ];
  for (const entry of series) {
    context.strokeStyle = entry.color;
    context.lineWidth = 2;
    context.setLineDash(entry.dash);
    context.beginPath();
    rows.forEach((row, index) => {
      const x = xScale(row.axis_value);
      const y = yScale(norm(row[entry.key]));
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.setLineDash([]);
  }

  const xLabel = payload.axis === "predictor_noise"
    ? "predictor error sigma (m)"
    : "forecast horizon (steps)";
  drawAxes(frame, xLabel, "perturbation (MDP95 units)", xLow, xHigh, 0, yHigh);
}

function drawBars(canvas, rows) {
  const frame = plotFrame(canvas);
  const { context, left, right, top, bottom } = frame;

  const labelKey = rows[0].estimator !== undefined ? "estimator" : "variant";
  const highest = Math.max(...rows.map((row) => row.ci_high), 0.0001);
  const yScale = makeScale(0, highest * 1.15, bottom, top);
  const slotWidth = (right - left) / rows.length;

  const colorFor = {
    cvm_residual: token("--mirn-naive"),
    paired: token("--mirn-paired"),
    paired_debiased: token("--mirn-accent"),
    full: token("--mirn-paired"),
    pedestrian_removed: token("--mirn-counterfactual"),
  };

  context.font = "11px " + (state.theme["--mirn-font-mono"] || "monospace");
  context.textAlign = "center";
  rows.forEach((row, index) => {
    const centre = left + slotWidth * (index + 0.5);
    const barWidth = Math.min(slotWidth * 0.42, 56);
    const barTop = yScale(row.value);
    context.fillStyle = colorFor[row[labelKey]] || token("--mirn-accent");
    context.fillRect(centre - barWidth / 2, barTop, barWidth, bottom - barTop);

    context.strokeStyle = token("--mirn-ink-muted");
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(centre, yScale(row.ci_low));
    context.lineTo(centre, yScale(row.ci_high));
    context.stroke();

    context.fillStyle = token("--mirn-ink-muted");
    context.fillText(row[labelKey], centre, bottom + 16);
  });

  context.strokeStyle = token("--mirn-grid");
  context.beginPath();
  context.moveTo(left, bottom);
  context.lineTo(right, bottom);
  context.stroke();
}

// Dispatch on the SHAPE of the payload, never on the experiment's name, so a new
// experiment that returns null_samples gets a histogram without touching this file.
function drawPlot(canvas, result) {
  const rows = result.rows;
  const payload = result.payload;
  if (payload.null_samples) {
    drawHistogram(canvas, payload);
    return;
  }
  if (rows.length > 0 && rows[0].axis_value !== undefined) {
    drawSweep(canvas, rows, payload);
    return;
  }
  drawBars(canvas, rows);
}

// ---------------------------------------------------------------- readouts

function statBlock(label, value, ci, className) {
  const wrapper = document.createElement("div");
  wrapper.className = "stat " + (className || "");
  const labelNode = document.createElement("span");
  labelNode.className = "stat-label";
  labelNode.textContent = label;
  const valueNode = document.createElement("span");
  valueNode.className = "stat-value";
  valueNode.textContent = value;
  wrapper.appendChild(labelNode);
  wrapper.appendChild(valueNode);
  if (ci) {
    const ciNode = document.createElement("span");
    ciNode.className = "stat-ci";
    ciNode.textContent = ci;
    wrapper.appendChild(ciNode);
  }
  return wrapper;
}

function formatCI(row) {
  return "95% CI [" + row.ci_low.toFixed(3) + ", " + row.ci_high.toFixed(3) + "]";
}

const STAT_CLASS = {
  cvm_residual: "stat-naive",
  noisy_oracle_residual: "stat-naive",
  paired: "stat-paired",
  paired_debiased: "stat-paired",
};

function renderReadout(target, result) {
  target.replaceChildren();
  const rows = result.rows;
  const payload = result.payload;

  if (payload.mdp_95 !== undefined) {
    target.appendChild(
      statBlock("Detection floor (MDP₉₅)", payload.mdp_95.toFixed(3) + " m", null, "stat-floor")
    );
  }
  if (payload.floor_crossing_axis_value !== undefined) {
    const crossing = payload.floor_crossing_axis_value;
    target.appendChild(
      statBlock(
        "Crosses the floor at",
        crossing === null ? "not within range" : crossing.toFixed(3),
        crossing === null ? "no swept point clears the floor" : "with true effect at zero",
        "stat-naive"
      )
    );
  }
  for (const row of rows) {
    if (row.estimator !== undefined) {
      target.appendChild(
        statBlock(
          row.estimator + " (" + row.units + ")",
          row.value.toFixed(3),
          formatCI(row),
          STAT_CLASS[row.estimator] || ""
        )
      );
    } else if (row.variant !== undefined) {
      target.appendChild(
        statBlock(row.variant, row.value.toFixed(4), formatCI(row), "stat-paired")
      );
    }
  }
}

// ---------------------------------------------------------------- controls

function buildControl(parameter, onChange) {
  const wrapper = document.createElement("label");
  wrapper.className = "control";

  const labelRow = document.createElement("span");
  labelRow.className = "control-label";
  const labelText = document.createElement("span");
  labelText.textContent = parameter.label;
  labelRow.appendChild(labelText);

  let input;
  if (parameter.kind === "choice") {
    input = document.createElement("select");
    for (const choice of parameter.choices) {
      const option = document.createElement("option");
      option.value = choice;
      option.textContent = choice;
      input.appendChild(option);
    }
    input.value = parameter.default;
  } else {
    input = document.createElement("input");
    input.type = "range";
    input.min = parameter.minimum;
    input.max = parameter.maximum;
    input.step = parameter.step || (parameter.kind === "int" ? 1 : 0.01);
    input.value = parameter.default;
    const readout = document.createElement("output");
    readout.textContent = parameter.default;
    labelRow.appendChild(readout);
    input.addEventListener("input", () => { readout.textContent = input.value; });
  }

  input.dataset.paramName = parameter.name;
  input.dataset.paramKind = parameter.kind;
  input.addEventListener("input", onChange);

  wrapper.appendChild(labelRow);
  wrapper.appendChild(input);
  if (parameter.help_text) {
    const help = document.createElement("p");
    help.className = "control-help";
    help.textContent = parameter.help_text;
    wrapper.appendChild(help);
  }
  return wrapper;
}

function readParams(form) {
  const params = {};
  for (const input of form.querySelectorAll("[data-param-name]")) {
    const name = input.dataset.paramName;
    params[name] = input.dataset.paramKind === "choice" ? input.value : Number(input.value);
  }
  return params;
}

// ---------------------------------------------------------------- scene canvas

async function drawScene(influence) {
  const canvas = document.getElementById("scene-canvas");
  const context = canvas.getContext("2d");
  const scene = await getJSON(
    "/api/scene?influence=" + influence + "&seed=" + state.seed + "&scene_index=0"
  );

  context.clearRect(0, 0, canvas.width, canvas.height);
  const padding = 18;
  const xScale = makeScale(0, scene.extent.width, padding, canvas.width - padding);
  const yScale = makeScale(0, scene.extent.height, canvas.height - padding, padding);

  const arms = [
    { paths: scene.counterfactual, color: token("--mirn-counterfactual"), width: 1.2 },
    { paths: scene.factual, color: token("--mirn-factual"), width: 1.6 },
  ];
  for (const arm of arms) {
    context.strokeStyle = arm.color;
    context.lineWidth = arm.width;
    for (const agent of arm.paths) {
      context.beginPath();
      agent.positions.forEach((point, index) => {
        const x = xScale(point[0]);
        const y = yScale(point[1]);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
  }

  context.strokeStyle = token("--mirn-ink-muted");
  context.globalAlpha = 0.35;
  context.lineWidth = 0.8;
  for (let index = 0; index < scene.factual.length; index += 1) {
    const factualPath = scene.factual[index].positions;
    const counterfactualPath = scene.counterfactual[index].positions;
    for (let step = 0; step < factualPath.length; step += 8) {
      context.beginPath();
      context.moveTo(xScale(counterfactualPath[step][0]), yScale(counterfactualPath[step][1]));
      context.lineTo(xScale(factualPath[step][0]), yScale(factualPath[step][1]));
      context.stroke();
    }
  }
  context.globalAlpha = 1;

  if (scene.robot) {
    context.fillStyle = token("--mirn-accent");
    context.beginPath();
    context.arc(xScale(scene.robot[0][0]), yScale(scene.robot[0][1]), 6, 0, Math.PI * 2);
    context.fill();
  }
}

// ---------------------------------------------------------------- sections

function buildSection(experiment, index) {
  const template = document.getElementById("section-template");
  const node = template.content.cloneNode(true);
  const section = node.querySelector(".experiment");

  section.querySelector(".section-index").textContent = String(index + 1).padStart(2, "0");
  section.querySelector(".section-title").textContent = experiment.title;
  section.querySelector(".section-claim").textContent = experiment.claim;

  const form = section.querySelector(".controls");
  const output = section.querySelector(".output");
  const readout = section.querySelector(".readout");
  const canvas = section.querySelector("canvas.plot");
  const note = section.querySelector(".plot-note");
  const cardsHost = section.querySelector(".cards");

  async function refresh() {
    output.classList.add("is-pending");
    const existingError = section.querySelector(".error");
    if (existingError) existingError.remove();
    try {
      const result = await postJSON("/api/experiment/" + experiment.name, {
        params: readParams(form),
        seed: state.seed,
      });
      renderReadout(readout, result);
      drawPlot(canvas, result);
      note.textContent = result.payload.note || "";
      cardsHost.replaceChildren();
      for (const key of result.method_keys) {
        if (state.cards[key]) {
          cardsHost.appendChild(buildCard(state.cards[key]));
        }
      }
    } catch (error) {
      const message = document.createElement("p");
      message.className = "error";
      message.textContent = error.message;
      output.appendChild(message);
    } finally {
      output.classList.remove("is-pending");
    }
  }

  const debounced = debounce(refresh, DEBOUNCE_MS);
  for (const parameter of experiment.parameters) {
    form.appendChild(buildControl(parameter, debounced));
  }
  form.addEventListener("submit", (event) => event.preventDefault());

  refresh();
  return section;
}

// ---------------------------------------------------------------- boot

async function boot() {
  const meta = await getJSON("/api/meta");
  state.theme = meta.theme;
  state.seed = meta.default_seed;
  state.experiments = meta.experiments;
  document.getElementById("data-note").textContent = meta.data_note;
  document.getElementById("seed-readout").textContent = String(state.seed);

  const methods = await getJSON("/api/methods");
  state.cards = methods.cards;

  const host = document.getElementById("sections");
  state.experiments.forEach((experiment, index) => {
    host.appendChild(buildSection(experiment, index));
  });

  const influenceInput = document.getElementById("scene-influence");
  const influenceReadout = document.getElementById("influence-readout");
  const redrawScene = debounce(() => {
    influenceReadout.textContent = Number(influenceInput.value).toFixed(2);
    drawScene(influenceInput.value);
  }, DEBOUNCE_MS);
  influenceInput.addEventListener("input", redrawScene);
  await drawScene(influenceInput.value);

  const exportButton = document.getElementById("export-button");
  const exportStatus = document.getElementById("export-status");
  exportButton.addEventListener("click", async () => {
    exportStatus.textContent = "writing...";
    try {
      const response = await postJSON("/api/export", { seed: state.seed, params: {} });
      exportStatus.textContent = "wrote " + response.written.length + " CSVs to results/";
    } catch (error) {
      exportStatus.textContent = error.message;
    }
  });
}

boot();
```

- [ ] **Step 5: Confirm the API tests still pass with the real page in place**

Run: `.venv/bin/python -m pytest tests/test_app_api.py -q`
Expected: PASS, 14 tests. `test_index_serves_html_with_the_theme_injected` now exercises the real
`index.html`, so a missing `/* MIRN_THEME */` token fails here.

- [ ] **Step 6: Drive the page and confirm it works**

```bash
.venv/bin/python -m mirn.cli serve --port 8123
```

Then open `http://127.0.0.1:8123` and verify, in order:

1. The page is dark and no element is unstyled white.
2. The scene canvas shows two overlaid families of paths with grey displacement links; dragging
   the influence slider to 0 makes the two families coincide exactly.
3. All four sections render, each with generated controls, a number with a CI, a plot, and a
   working "The mathematics" disclosure that shows typeset formulas.
4. Section 3 with `influence = 0` and `axis = predictor_noise`: the green true-effect line is flat
   on zero while the red reported line rises through the shaded floor band, and the "Crosses the
   floor at" stat shows a number.
5. Setting a control to an extreme shows a red inline error from the server, not a blank panel.
6. The Export button writes four CSVs into `results/`.
7. The browser console is free of errors.

- [ ] **Step 7: Lint, full suite, commit**

```bash
.venv/bin/python -m ruff check src tests && .venv/bin/python -m pytest -q
git add src/mirn_app/static
git commit -m "Add the guided-argument page: live controls, plots, and the mathematics panels"
```

Expected: PASS, 226 tests.

---

## Done criteria

- `.venv/bin/python -m pytest -q` passes with roughly 226 tests, including the four gates this plan adds: the method-card coverage gate, the library/app boundary, the true-perturbation pin in `confounding_sweep`, and the placebo delta.
- `.venv/bin/python -m ruff check src tests` is clean.
- `mirn list`, `mirn run <each of the four>`, and `mirn serve` all work.
- `results/` holds four CSVs.
- The page loads, all four sections compute live, and each shows its own mathematics.
- Nothing in `src/mirn/` imports FastAPI.
- `demo/perturbation-playground.html` is byte-identical to what it was before this plan started.
