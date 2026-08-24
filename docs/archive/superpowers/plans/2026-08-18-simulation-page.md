# MIRN Simulation Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-section instrument page with one configurable scene you watch — the same crowd twice, robot-present and robot-absent on a shared seed — and retell the argument in five beats of plain English for a reader with no robotics background.

**Architecture:** Two phases. **Phase A** adds foundations with no visible change: robot settings on the synthetic adapter, a light/dark palette split, two new declared fields (`Experiment.primary_parameters`, `MethodCard.plain_summary`), and an extended `/api/scene`. At the end of Phase A the existing dark page still works and the suite is green. **Phase B** replaces the page: light theme, an animated two-world canvas, five beats, rewritten copy, and the deletion of the old layout. The computation layer — contracts, divergences, estimators, calibration, all four experiments — is untouched throughout.

**Tech Stack:** Python 3.11+, numpy, scipy, pandas, matplotlib (library); FastAPI + uvicorn (app extra); pytest, hypothesis, ruff, httpx (dev). Frontend is hand-written HTML/CSS/JS with vendored KaTeX. No bundler, no node runtime dependency.

**Spec:** `docs/superpowers/specs/2026-08-18-simulation-page-design.md`

## Global Constraints

Binding on every task. Copied from `CLAUDE.md` and the spec.

1. **Python 3.11+. Add NO new dependencies.** `threading`, `functools`, `subprocess` are stdlib and already used.
2. **`from __future__ import annotations`** at the top of every new module.
3. **Explicit `for` loops with named intermediates.** No list/dict/set comprehensions, no generator expressions, no chained or compounded statements. Vectorised numpy is not a comprehension and is encouraged. **This binds Python only** — JS array methods (`.map`, `.forEach`) are idiomatic and permitted.
4. **Never use `isinstance()`.** Dispatch via registry lookup, ABC method, or an explicit `kind: str` field.
5. **Frozen dataclasses** — `@dataclass(frozen=True, slots=True)` — for contract types. Validate in `__post_init__`, `raise ValueError`, never warn.
6. **Full type hints** on every public function and method.
7. **Determinism.** Every stochastic path takes an explicit `seed: int` and builds its own `numpy.random.default_rng(seed)`. Global RNG state is banned.
8. **No `print()` in library code.** `src/mirn/cli.py` and `src/mirn/data/peroi.py`'s `main()` are the CLI-entry-point exceptions.
9. **ruff line-length 100, with E501 and F401 enforced.** Run `.venv/bin/python -m ruff check src tests`.
10. **All colour and type styling lives in `mirn.viz.theme`.** No colour literal in any CSS, canvas, or plotting code. After Task 1 there are two palettes; neither may be bypassed.
11. **Never write a simulator (guardrail 1).** The robot does not move; no pedestrian reacts to anything. The four exposed settings already exist in the model — exposing them is configuration. Any change that makes the crowd dynamical is out of scope and must be reported, not implemented.
12. **Never report perturbation in raw metres outside `mirn.calibration` (guardrail 3).** MDP units wherever a floor exists.
13. **Nothing is computed in JavaScript.** The browser renders numbers the API supplies. The one standing exception is `drawSweep`'s division by `mdp_95` to render MDP units.
14. **No per-experiment name branching in JS**, and no branching on payload *values* either. Dispatch on payload shape or on fields the API declares.
15. **The page states its data is synthetic**, prominently.
16. **`demo/perturbation-playground.html` is untouched.**
17. **`pytest -q` must pass before every commit.** Baseline is **272 passing**, ~300 s. Use `timeout: 600000` and run it in the **FOREGROUND** — never `run_in_background`, never a Monitor.

---

## File Structure

**Modified in Phase A:**

| File | Change |
|---|---|
| `src/mirn/viz/theme.py` | `PALETTE` → `DARK_PALETTE` + new `LIGHT_PALETTE`; `as_css_tokens`/`css_root_block` serve light, `matplotlib_rc`/`apply_matplotlib` serve dark |
| `src/mirn/viz/__init__.py` | re-export both palettes |
| `src/mirn/viz/figures.py` | 11 `PALETTE` references → `DARK_PALETTE` |
| `tests/test_viz_theme.py`, `tests/test_viz_figures.py` | 13 references; golden coverage over both palettes |
| `tests/golden/theme_tokens.json` | regenerated for the light palette |
| `tests/golden/matplotlib_rc.json` | **new** — golden for the dark palette's rcParams |
| `src/mirn/method/cards.py` | `MethodCard` gains `plain_summary` |
| `src/mirn/method/catalog.py` | 11 cards gain a plain-English summary |
| `tests/test_method.py`, `tests/test_method_cards.py` | gate extended |
| `src/mirn/experiments/base.py` | `Experiment` gains `primary_parameters`; `describe()` includes it |
| the four experiment modules + `tests/test_experiments_base.py` | declare `primary_parameters` |
| `src/mirn/data/synthetic.py` | robot position/amplitude/decay become instance settings |
| `src/mirn_app/server.py` | `/api/scene` gains params and returns `dt`, `n_steps`, `gap_series` |
| `tests/test_app_api.py`, `tests/test_data_synthetic.py`, `tests/test_experiments.py` | cover the above |

**Phase B:**

| File | Change |
|---|---|
| `src/mirn_app/static/style.css` | rewritten for the light palette |
| `src/mirn_app/static/index.html` | rewritten: hero scene + five beats |
| `src/mirn_app/static/app.js` | scene player, beat rendering, `primary_parameters`, `plain_summary` |
| `CLAUDE.md` | line 42 amended to record the palette split |

---

## Phase A — foundations, no visible change

### Task 1: Split the palette into light and dark

**Files:**
- Modify: `src/mirn/viz/theme.py`, `src/mirn/viz/__init__.py`, `src/mirn/viz/figures.py`
- Modify: `tests/test_viz_theme.py`, `tests/test_viz_figures.py`
- Modify: `tests/golden/theme_tokens.json` (regenerate)
- Create: `tests/golden/matplotlib_rc.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `DARK_PALETTE: Palette`, `LIGHT_PALETTE: Palette`, both instances of the existing `Palette` dataclass with its existing validation. `matplotlib_rc()` and `apply_matplotlib()` read `DARK_PALETTE`; `as_css_tokens()` and `css_root_block()` read `LIGHT_PALETTE`. `series_colors()` gains a required `palette: Palette` argument. **The name `PALETTE` no longer exists** — no alias is kept.

**Why no alias:** two names for one palette is exactly how the two surfaces would silently drift back together. The rename touches 26 sites and every one is covered by a test.

- [ ] **Step 1: Write the failing tests**

Replace `tests/test_viz_theme.py` entirely:

```python
"""The theme is the single source of colour for both matplotlib and the browser. Since Task 1 it
carries two palettes — dark for paper figures, light for the page — and both get a golden file, so
a silent drift in either one is a test failure."""

from __future__ import annotations

import dataclasses
import json
import re
from pathlib import Path

from mirn.viz import theme

_HEX_PATTERN = re.compile(r"^#[0-9a-f]{6}$")
_GOLDEN_DIR = Path(__file__).parent / "golden"


def _palettes() -> list[tuple[str, theme.Palette]]:
    pairs: list[tuple[str, theme.Palette]] = []
    pairs.append(("dark", theme.DARK_PALETTE))
    pairs.append(("light", theme.LIGHT_PALETTE))
    return pairs


def test_both_palettes_are_lowercase_hex() -> None:
    for name, palette in _palettes():
        fields = dataclasses.fields(palette)
        for field in fields:
            value = getattr(palette, field.name)
            assert _HEX_PATTERN.match(value) is not None, f"{name}.{field.name}={value!r}"


def test_the_two_palettes_are_actually_different() -> None:
    """Guards against a copy-paste that leaves the page dark."""
    assert theme.LIGHT_PALETTE.background != theme.DARK_PALETTE.background
    assert theme.LIGHT_PALETTE.ink != theme.DARK_PALETTE.ink


def test_light_is_light_and_dark_is_dark() -> None:
    """Background luminance must actually differ in the direction the names claim."""
    light_background = _luminance(theme.LIGHT_PALETTE.background)
    dark_background = _luminance(theme.DARK_PALETTE.background)
    assert light_background > 0.8, f"light background is not light: {light_background}"
    assert dark_background < 0.2, f"dark background is not dark: {dark_background}"
    assert _luminance(theme.LIGHT_PALETTE.ink) < 0.2
    assert _luminance(theme.DARK_PALETTE.ink) > 0.8


def _luminance(hex_colour: str) -> float:
    red = int(hex_colour[1:3], 16) / 255.0
    green = int(hex_colour[3:5], 16) / 255.0
    blue = int(hex_colour[5:7], 16) / 255.0
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def test_css_tokens_come_from_the_light_palette() -> None:
    tokens = theme.as_css_tokens()
    fields = dataclasses.fields(theme.LIGHT_PALETTE)
    for field in fields:
        expected_key = "--mirn-" + field.name.replace("_", "-")
        assert tokens[expected_key] == getattr(theme.LIGHT_PALETTE, field.name)


def test_css_tokens_match_their_golden_file() -> None:
    golden = json.loads((_GOLDEN_DIR / "theme_tokens.json").read_text())
    assert theme.as_css_tokens() == golden


def test_matplotlib_rc_comes_from_the_dark_palette() -> None:
    rc = theme.matplotlib_rc()
    assert rc["figure.facecolor"] == theme.DARK_PALETTE.background
    assert rc["axes.facecolor"] == theme.DARK_PALETTE.background
    assert rc["text.color"] == theme.DARK_PALETTE.ink
    assert rc["grid.color"] == theme.DARK_PALETTE.grid


def test_matplotlib_rc_matches_its_golden_file() -> None:
    """rcParams carries non-JSON types (a cycler); compare only the colour keys."""
    golden = json.loads((_GOLDEN_DIR / "matplotlib_rc.json").read_text())
    rc = theme.matplotlib_rc()
    for key in golden:
        assert str(rc[key]) == golden[key], f"{key} drifted"


def test_apply_matplotlib_mutates_rcparams_to_dark() -> None:
    import matplotlib

    theme.apply_matplotlib()
    assert matplotlib.rcParams["figure.facecolor"] == theme.DARK_PALETTE.background


def test_font_stacks_reach_matplotlib_with_a_dejavu_fallback() -> None:
    rc = theme.matplotlib_rc()
    assert rc["font.sans-serif"][0] == "Inter"
    assert rc["font.sans-serif"][-1] == "DejaVu Sans"
    assert rc["font.monospace"][-1] == "DejaVu Sans Mono"


def test_series_colors_requires_a_palette_and_returns_its_members() -> None:
    for _name, palette in _palettes():
        colors = theme.series_colors(palette)
        assert len(colors) >= 4
        assert len(set(colors)) == len(colors)
        palette_values: set[str] = set()
        fields = dataclasses.fields(palette)
        for field in fields:
            palette_values.add(getattr(palette, field.name))
        for color in colors:
            assert color in palette_values


def test_css_root_block_wraps_the_light_tokens() -> None:
    block = theme.css_root_block()
    assert block.startswith(":root {")
    assert block.endswith("}")
    assert f"  --mirn-background: {theme.LIGHT_PALETTE.background};" in block


def test_palette_rejects_uppercase_hex() -> None:
    import pytest

    kwargs: dict[str, str] = {}
    fields = dataclasses.fields(theme.DARK_PALETTE)
    for field in fields:
        kwargs[field.name] = getattr(theme.DARK_PALETTE, field.name)
    kwargs["ink"] = "#ABCDEF"
    with pytest.raises(ValueError, match="ink"):
        theme.Palette(**kwargs)
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/python -m pytest tests/test_viz_theme.py -q`
Expected: FAIL — `AttributeError: module 'mirn.viz.theme' has no attribute 'DARK_PALETTE'`

- [ ] **Step 3: Split the palette in `theme.py`**

Rename the existing `PALETTE = Palette(...)` block to `DARK_PALETTE = Palette(...)`, keeping every
value exactly as it is. Immediately after it, add:

```python
LIGHT_PALETTE = Palette(
    background="#faf7f2",
    surface="#f3efe7",
    ink="#141414",
    ink_muted="#5c5750",
    grid="#ddd6ca",
    factual="#b4541f",
    counterfactual="#1f5fa8",
    naive="#a8261f",
    paired="#1f6b4a",
    floor="#8a8378",
    accent="#5b3fa8",
)
```

Then:
- `series_colors()` gains a required parameter: `def series_colors(palette: Palette) -> tuple[str, ...]:` and reads that palette's fields instead of the module constant.
- `matplotlib_rc()` reads `DARK_PALETTE` throughout and calls `series_colors(DARK_PALETTE)`.
- `as_css_tokens()` reads `LIGHT_PALETTE`.
- `css_root_block()` is unchanged (it calls `as_css_tokens()`).

Update the module docstring to state the split and why: paper figures stay dark in the
DeepMind/Anthropic register `CLAUDE.md` asks for; the browser page is light because it is mostly
prose; both live here so no colour is ever set outside this module.

- [ ] **Step 4: Update the three consuming sites**

- `src/mirn/viz/__init__.py` — export `DARK_PALETTE` and `LIGHT_PALETTE` in place of `PALETTE`, keeping the rest of `__all__`.
- `src/mirn/viz/figures.py` — change the import to `from mirn.viz.theme import DARK_PALETTE, apply_matplotlib` and replace all 11 `PALETTE.` occurrences with `DARK_PALETTE.`.
- `tests/test_viz_figures.py` — replace both `theme.PALETTE.background` references with `theme.DARK_PALETTE.background`.

Confirm nothing was missed: `grep -rn "\bPALETTE\b" src tests | grep -v "DARK_PALETTE\|LIGHT_PALETTE"` must return nothing.

- [ ] **Step 5: Regenerate both golden files**

```bash
.venv/bin/python -c "
import json
from mirn.viz import theme
with open('tests/golden/theme_tokens.json', 'w') as handle:
    json.dump(theme.as_css_tokens(), handle, indent=2, sort_keys=True)
    handle.write('\n')
rc = theme.matplotlib_rc()
colour_keys = [k for k in sorted(rc) if 'color' in k or 'facecolor' in k or 'edgecolor' in k]
golden = {}
for key in colour_keys:
    golden[key] = str(rc[key])
with open('tests/golden/matplotlib_rc.json', 'w') as handle:
    json.dump(golden, handle, indent=2, sort_keys=True)
    handle.write('\n')
"
cat tests/golden/theme_tokens.json
cat tests/golden/matplotlib_rc.json
```

Eyeball both before committing — these are the files that make future drift a test failure, so they
must be right the first time. `theme_tokens.json` must now show the *light* values.

**Note on the generator's list comprehension:** this is a throwaway shell one-liner, not library
code, so Global Constraint 3 does not apply to it.

- [ ] **Step 6: Run the gates**

```
.venv/bin/python -m pytest tests/test_viz_theme.py tests/test_viz_figures.py -q
.venv/bin/python -m ruff check src tests
.venv/bin/python -m pytest -q          # timeout 600000, FOREGROUND
```
Expected: all pass; full suite ≥ 272.

- [ ] **Step 7: Commit**

```bash
git add src/mirn/viz tests/test_viz_theme.py tests/test_viz_figures.py tests/golden
git commit -m "Split the theme into light and dark palettes

Paper figures stay dark; the browser page becomes light. Both palettes live
in mirn.viz.theme so no colour is set outside it, and both carry a golden
file so either drifting silently is a test failure."
```

---

### Task 2: `MethodCard.plain_summary`

**Files:**
- Modify: `src/mirn/method/cards.py`, `src/mirn/method/catalog.py`
- Modify: `tests/test_method_cards.py`, `tests/test_method.py`

**Interfaces:**
- Consumes: `MethodCard` from Task 0 of the previous plan (already exists).
- Produces: `MethodCard.plain_summary: str`, positioned immediately after `one_liner`. Included in `as_dict()`. Validated non-empty after strip **and free of `\` and `$`** so it cannot be LaTeX wearing a prose label.

**This is the largest content task in the plan.** Eleven cards need real plain-English writing aimed at someone who has never read a robotics paper. That is the point of the whole redesign, not a chore attached to it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_method_cards.py`:

```python
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
```

Also add `plain_summary` to `_valid_card`'s field dict with a short plain sentence.

Append to `tests/test_method.py`:

```python
def test_every_card_has_a_plain_english_summary() -> None:
    """The page must be readable by someone with no robotics background, so every card owes a
    sentence of English before any notation. This makes that a build error."""
    for key in CARDS:
        summary = CARDS[key].plain_summary
        assert len(summary.strip()) > 0, f"{key} has no plain_summary"
        assert "\\" not in summary, f"{key}'s plain_summary contains LaTeX"
        assert "$" not in summary, f"{key}'s plain_summary contains LaTeX"


def test_plain_summaries_are_actually_sentences_not_labels() -> None:
    """A three-word fragment is a label, not an explanation. Twenty-five characters is a low bar
    deliberately — it catches 'The ADE.' without dictating style."""
    for key in CARDS:
        assert len(CARDS[key].plain_summary.strip()) >= 25, f"{key}'s plain_summary is too terse"
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/python -m pytest tests/test_method_cards.py tests/test_method.py -q`
Expected: FAIL — `TypeError: MethodCard.__init__() got an unexpected keyword argument 'plain_summary'`

- [ ] **Step 3: Add the field**

In `src/mirn/method/cards.py`, add `plain_summary: str` immediately after `one_liner: str`. In
`__post_init__`, after the existing `_require_text(self.one_liner, "one_liner")`:

```python
        _require_text(self.plain_summary, "plain_summary")
        if "\\" in self.plain_summary or "$" in self.plain_summary:
            raise ValueError(
                "MethodCard.plain_summary must be plain English, not notation; it is what a "
                "reader meets before any formula. Move the maths to formula_tex."
            )
```

Add `row["plain_summary"] = self.plain_summary` to `as_dict()`, positioned after `one_liner`.

- [ ] **Step 4: Write the eleven summaries**

In `src/mirn/method/catalog.py`, give every card a `plain_summary` immediately after its
`one_liner`. Write for someone who has never read a robotics paper: no undefined jargon, concrete
where possible, one or two sentences. Use these:

- **ade** — "Walk two versions of the same journey side by side, measure the distance between the two walkers at every step, and average it. A small number means the two journeys stayed close the whole way."
- **fde** — "Only look at where the two journeys ended up, and measure how far apart those two endpoints are. It ignores everything that happened in between."
- **frechet** — "Imagine walking one path while a dog walks the other on a lead, both always moving forward. This is the shortest lead that would let you both finish. One bad moment sets it, so it reports the worst mismatch rather than the typical one."
- **sinkhorn_w2** — "Treat each set of positions as a pile of sand and ask the cheapest way to reshape one pile into the other. It compares two crowds as a whole, without needing to match up individual people."
- **cvm_residual** — "Guess where someone was about to walk by assuming they carry straight on at their current speed, then measure how far off the guess was. This is the method most papers use, and it is the one this project argues is broken: the error includes everything the guess got wrong, not just what the robot did."
- **paired** — "Run the same crowd twice, once with the robot and once without, and measure how far each person's two versions drifted apart. Because everything else is held identical, that gap is the robot's doing and nothing else."
- **paired_debiased** — "Take the paired measurement and subtract the amount the measurement would report even with no robot present, then express what is left as a multiple of that noise. A result of 1 means the effect is exactly as big as the measurement's own error."
- **noisy_oracle_residual** — "A deliberately spoiled predictor: it is told the correct answer and then has random error added on top. It exists to show that a method reporting prediction error will report a large number even when the robot did nothing at all."
- **split_half_null** — "Take a crowd with no robot anywhere near it, split it into two random halves, and measure how different the halves look. Repeat many times. Since nothing is influencing anybody, whatever you measure here is pure noise."
- **minimum_detectable_perturbation** — "The size of effect you would have to see before you could tell it apart from noise. Anything smaller is not evidence of no effect, only evidence that you cannot tell at this sample size."
- **bootstrap_ci** — "Re-draw the same measurements at random, over and over, to see how much the answer wobbles. The range it wobbles across is the confidence interval."

- [ ] **Step 5: Run the gates**

```
.venv/bin/python -m pytest tests/test_method_cards.py tests/test_method.py -q
.venv/bin/python -m ruff check src tests
.venv/bin/python -m pytest -q          # timeout 600000, FOREGROUND
```

- [ ] **Step 6: Commit**

```bash
git add src/mirn/method tests/test_method_cards.py tests/test_method.py
git commit -m "Add plain_summary to MethodCard and write all eleven

The page must be readable by someone with no robotics background, so every
component owes one sentence of English before any notation. Validation
rejects a summary containing a backslash or dollar sign, so a formula cannot
be pasted into the prose field."
```

---

### Task 3: `Experiment.primary_parameters`

**Files:**
- Modify: `src/mirn/experiments/base.py`
- Modify: `calibration_floor.py`, `estimator_comparison.py`, `confounding_sweep.py`, `placebo.py`
- Modify: `tests/test_experiments_base.py`, `tests/test_experiments.py`

**Interfaces:**
- Consumes: the existing `Experiment` ABC with its `name`, `title`, `claim`, `order` class attributes.
- Produces: `Experiment.primary_parameters: tuple[str, ...]` — the knobs that are the point of that experiment. `describe()` includes it, so `/api/meta` carries it and the page can foreground those controls without learning experiment names.

**Why this exists:** each beat wants two or three controls prominent and the rest tucked away. Doing that in JavaScript would mean the page knowing which experiment it is rendering, which Global Constraint 14 forbids. Declaring it in Python keeps the browser generic.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_experiments.py`:

```python
def test_every_experiment_declares_primary_parameters() -> None:
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        assert len(experiment.primary_parameters) > 0, f"{name} declares none"


def test_primary_parameters_all_resolve_to_declared_parameters() -> None:
    """A typo here would silently hide a control rather than fail."""
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        declared: list[str] = []
        for parameter in experiment.parameters():
            declared.append(parameter.name)
        for primary in experiment.primary_parameters:
            assert primary in declared, f"{name}: '{primary}' is not a declared parameter"


def test_describe_carries_primary_parameters() -> None:
    for name in EXPERIMENTS.names():
        described = EXPERIMENTS.create(name).describe()
        assert list(described["primary_parameters"]) == list(
            EXPERIMENTS.create(name).primary_parameters
        )
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/python -m pytest tests/test_experiments.py -q -k primary`
Expected: FAIL — `AttributeError: 'CalibrationFloor' object has no attribute 'primary_parameters'`

- [ ] **Step 3: Declare it on the ABC and the four experiments**

In `src/mirn/experiments/base.py`, add to the `Experiment` class body alongside `name`, `title`,
`claim`, `order`:

```python
    primary_parameters: tuple[str, ...]
```

with a docstring line explaining it names the knobs the interface should foreground, and that
everything else is shown under a "more settings" disclosure.

Add to `describe()`, after `claim`:

```python
        described["primary_parameters"] = list(self.primary_parameters)
```

Then declare on each experiment, choosing the knobs that are the point of that beat:

- `CalibrationFloor` — `("divergence", "n_splits")`
- `EstimatorComparison` — `("influence", "horizon_steps")`
- `ConfoundingSweep` — `("influence", "axis", "noise_max")`
- `Placebo` — `("influence", "exclusion_radius_m")`

Also add `primary_parameters = ("influence",)` to `_Dummy` in `tests/test_experiments_base.py` —
it subclasses `Experiment` and will otherwise fail the new attribute lookup.

- [ ] **Step 4: Run the gates**

```
.venv/bin/python -m pytest tests/test_experiments.py tests/test_experiments_base.py tests/test_app_api.py -q
.venv/bin/python -m ruff check src tests
.venv/bin/python -m pytest -q          # timeout 600000, FOREGROUND
```

- [ ] **Step 5: Commit**

```bash
git add src/mirn/experiments tests/test_experiments.py tests/test_experiments_base.py
git commit -m "Declare primary_parameters on every experiment

Each beat of the page foregrounds two or three controls and tucks the rest
away. Declaring which ones in Python keeps the browser generic — selecting
them in JS would mean the page knowing experiment names."
```

---

### Task 4: Robot settings on the synthetic adapter

**Files:**
- Modify: `src/mirn/data/synthetic.py`
- Modify: `tests/test_data_synthetic.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `SyntheticAdapter.__init__` gains three optional keyword arguments —
  `robot_position: tuple[float, float] | None = None` (None means box centre, as today),
  `displacement_amplitude_m: float = DISPLACEMENT_AMPLITUDE_M`,
  `displacement_decay_length_m: float = DISPLACEMENT_DECAY_LENGTH_M`.
  Stored as instance attributes and used in `_generate_pair` in place of the module constants.

**The critical property:** the defaults must reproduce today's trajectories **bitwise**. Every
existing test — determinism, estimators, experiments, the placebo gate — depends on the current
numbers, and this task must not move any of them.

**Guardrail 11 note:** this exposes settings that already exist in the model. The robot still does
not move and nothing reacts to it. If you find yourself adding a time index to the robot's position,
stop and report — that is a simulator and it is out of scope.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_data_synthetic.py`:

```python
def test_default_settings_reproduce_the_previous_trajectories_bitwise() -> None:
    """The whole rest of the suite depends on these exact numbers. Not allclose — array_equal."""
    adapter = SyntheticAdapter(n_scenes=3, n_pedestrians=12, n_steps=60, seed=0)
    explicit = SyntheticAdapter(
        n_scenes=3,
        n_pedestrians=12,
        n_steps=60,
        seed=0,
        robot_position=(BOX_WIDTH_M / 2.0, BOX_HEIGHT_M / 2.0),
        displacement_amplitude_m=DISPLACEMENT_AMPLITUDE_M,
        displacement_decay_length_m=DISPLACEMENT_DECAY_LENGTH_M,
    )
    default_pairs = adapter.rollout_pairs_with_influence(1.0)
    explicit_pairs = explicit.rollout_pairs_with_influence(1.0)
    for pair_index in range(len(default_pairs)):
        default_agents = default_pairs[pair_index].paired_agents()
        explicit_agents = explicit_pairs[pair_index].paired_agents()
        for agent_index in range(len(default_agents)):
            assert np.array_equal(
                default_agents[agent_index][0].positions,
                explicit_agents[agent_index][0].positions,
            )


def test_a_larger_amplitude_pushes_people_further() -> None:
    weak = SyntheticAdapter(n_scenes=2, seed=0, displacement_amplitude_m=0.5)
    strong = SyntheticAdapter(n_scenes=2, seed=0, displacement_amplitude_m=3.0)
    weak_gap = _mean_arm_gap(weak.rollout_pairs_with_influence(1.0))
    strong_gap = _mean_arm_gap(strong.rollout_pairs_with_influence(1.0))
    assert strong_gap > weak_gap


def test_a_longer_reach_pushes_more_people() -> None:
    short = SyntheticAdapter(n_scenes=2, seed=0, displacement_decay_length_m=1.0)
    long_reach = SyntheticAdapter(n_scenes=2, seed=0, displacement_decay_length_m=6.0)
    assert _mean_arm_gap(long_reach.rollout_pairs_with_influence(1.0)) > _mean_arm_gap(
        short.rollout_pairs_with_influence(1.0)
    )


def test_moving_the_robot_changes_who_is_affected() -> None:
    centre = SyntheticAdapter(n_scenes=2, seed=0)
    corner = SyntheticAdapter(n_scenes=2, seed=0, robot_position=(2.0, 1.0))
    centre_pairs = centre.rollout_pairs_with_influence(1.0)
    corner_pairs = corner.rollout_pairs_with_influence(1.0)
    centre_first = centre_pairs[0].paired_agents()[0][0].positions
    corner_first = corner_pairs[0].paired_agents()[0][0].positions
    assert not np.array_equal(centre_first, corner_first)


def test_the_counterfactual_arm_never_depends_on_robot_settings() -> None:
    """The robot-absent world must be identical no matter how the robot is configured — the floor
    cache keys on this and would silently return a wrong value otherwise."""
    baseline = SyntheticAdapter(n_scenes=2, seed=0)
    altered = SyntheticAdapter(
        n_scenes=2, seed=0, robot_position=(3.0, 9.0),
        displacement_amplitude_m=4.0, displacement_decay_length_m=1.0,
    )
    baseline_pairs = baseline.rollout_pairs_with_influence(1.0)
    altered_pairs = altered.rollout_pairs_with_influence(1.0)
    for pair_index in range(len(baseline_pairs)):
        baseline_agents = baseline_pairs[pair_index].paired_agents()
        altered_agents = altered_pairs[pair_index].paired_agents()
        for agent_index in range(len(baseline_agents)):
            assert np.array_equal(
                baseline_agents[agent_index][1].positions,
                altered_agents[agent_index][1].positions,
            )


def test_rejects_a_non_positive_decay_length() -> None:
    with pytest.raises(ValueError, match="displacement_decay_length_m"):
        SyntheticAdapter(displacement_decay_length_m=0.0)


def test_rejects_a_negative_amplitude() -> None:
    with pytest.raises(ValueError, match="displacement_amplitude_m"):
        SyntheticAdapter(displacement_amplitude_m=-1.0)


def test_rejects_a_robot_outside_the_box() -> None:
    with pytest.raises(ValueError, match="robot_position"):
        SyntheticAdapter(robot_position=(999.0, 1.0))


def _mean_arm_gap(pairs: tuple) -> float:
    totals: list[float] = []
    for pair in pairs:
        for factual_traj, counterfactual_traj in pair.paired_agents():
            offsets = factual_traj.positions - counterfactual_traj.positions
            distances = np.sqrt(np.sum(offsets * offsets, axis=1))
            totals.append(float(np.mean(distances)))
    return float(np.mean(np.asarray(totals)))
```

Add whatever imports the file is missing (`BOX_WIDTH_M`, `BOX_HEIGHT_M`,
`DISPLACEMENT_AMPLITUDE_M`, `DISPLACEMENT_DECAY_LENGTH_M`, `pytest`, `numpy as np`).

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/python -m pytest tests/test_data_synthetic.py -q`
Expected: FAIL — `TypeError: __init__() got an unexpected keyword argument 'robot_position'`

- [ ] **Step 3: Implement**

In `SyntheticAdapter.__init__`, after the existing validation, add the three parameters and:

```python
        if displacement_amplitude_m < 0.0:
            raise ValueError(
                f"displacement_amplitude_m must be >= 0, got {displacement_amplitude_m}"
            )
        if displacement_decay_length_m <= 0.0:
            raise ValueError(
                "displacement_decay_length_m must be > 0 (it is a divisor), got "
                f"{displacement_decay_length_m}"
            )
        if robot_position is None:
            resolved_position = (BOX_WIDTH_M / 2.0, BOX_HEIGHT_M / 2.0)
        else:
            resolved_position = robot_position
        if not (0.0 <= resolved_position[0] <= BOX_WIDTH_M):
            raise ValueError(
                f"robot_position x must be within 0..{BOX_WIDTH_M}, got {resolved_position[0]}"
            )
        if not (0.0 <= resolved_position[1] <= BOX_HEIGHT_M):
            raise ValueError(
                f"robot_position y must be within 0..{BOX_HEIGHT_M}, got {resolved_position[1]}"
            )
        self.robot_position = resolved_position
        self.displacement_amplitude_m = displacement_amplitude_m
        self.displacement_decay_length_m = displacement_decay_length_m
```

In `_generate_pair`, replace `robot_position = np.array(_ROBOT_POSITION_M, dtype=np.float64)` with
`robot_position = np.array(self.robot_position, dtype=np.float64)`, and use
`self.displacement_decay_length_m` and `self.displacement_amplitude_m` in the decay and magnitude
lines. Delete the now-unused `_ROBOT_POSITION_M` constant.

Add to the module docstring one line recording that the robot is still a fixed point — these are
settings, not motion — so a future reader does not mistake configurability for a simulator.

- [ ] **Step 4: Run the gates**

```
.venv/bin/python -m pytest tests/test_data_synthetic.py -q
.venv/bin/python -m ruff check src tests
.venv/bin/python -m pytest -q          # timeout 600000, FOREGROUND
```
**If any pre-existing test changes its numbers, stop and report.** The bitwise test exists to catch
exactly that, and a failure elsewhere means the defaults did not hold.

- [ ] **Step 5: Commit**

```bash
git add src/mirn/data/synthetic.py tests/test_data_synthetic.py
git commit -m "Expose the robot's existing settings on SyntheticAdapter

Position, push size and reach become optional constructor arguments
defaulting to today's constants, with a test asserting the defaults
reproduce existing trajectories bitwise. The robot still does not move and
nothing reacts to it — these are settings, not motion."
```

---

### Task 5: Extend `/api/scene` for playback

**Files:**
- Modify: `src/mirn_app/server.py`
- Modify: `tests/test_app_api.py`

**Interfaces:**
- Consumes: `SyntheticAdapter`'s new settings from Task 4.
- Produces: `GET /api/scene` accepting `influence`, `seed`, `scene_index`, `robot_x`, `robot_y`, `amplitude`, `decay`, `n_pedestrians`; returning the existing `factual`, `counterfactual`, `robot`, `extent`, `influence`, `seed`, plus **`dt: float`**, **`n_steps: int`**, and **`gap_series: list[{agent_id, gaps: list[float]}]`**.

**Why `gap_series` is computed server-side:** the page shows the widening gap as a number, and
Global Constraint 13 says the browser never derives a displayed quantity. Sending the series lets
the page index into it per frame without computing anything.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_app_api.py`:

```python
def test_scene_returns_playback_metadata(client: TestClient) -> None:
    body = client.get("/api/scene", params={"influence": 1.0, "seed": 0}).json()
    assert body["dt"] > 0.0
    assert body["n_steps"] == len(body["factual"][0]["positions"])


def test_scene_gap_series_matches_the_two_arms(client: TestClient) -> None:
    """The page displays these numbers, so they must be the server's, not the browser's."""
    import math

    body = client.get("/api/scene", params={"influence": 1.0, "seed": 0}).json()
    by_agent: dict[str, list[float]] = {}
    for entry in body["gap_series"]:
        by_agent[entry["agent_id"]] = entry["gaps"]
    for index in range(len(body["factual"])):
        agent_id = body["factual"][index]["agent_id"]
        factual_positions = body["factual"][index]["positions"]
        counterfactual_positions = body["counterfactual"][index]["positions"]
        gaps = by_agent[agent_id]
        assert len(gaps) == len(factual_positions)
        for step in range(len(factual_positions)):
            delta_x = factual_positions[step][0] - counterfactual_positions[step][0]
            delta_y = factual_positions[step][1] - counterfactual_positions[step][1]
            expected = math.sqrt(delta_x * delta_x + delta_y * delta_y)
            assert gaps[step] == pytest.approx(expected, abs=1e-12)


def test_scene_gaps_are_all_zero_at_zero_influence(client: TestClient) -> None:
    body = client.get("/api/scene", params={"influence": 0.0, "seed": 0}).json()
    for entry in body["gap_series"]:
        for gap in entry["gaps"]:
            assert gap == 0.0


def test_scene_accepts_robot_settings(client: TestClient) -> None:
    body = client.get(
        "/api/scene",
        params={"influence": 1.0, "seed": 0, "robot_x": 6.0, "robot_y": 3.0,
                "amplitude": 2.0, "decay": 5.0, "n_pedestrians": 8},
    ).json()
    assert body["robot"][0] == [6.0, 3.0]
    assert len(body["factual"]) == 8


def test_scene_rejects_a_robot_outside_the_box(client: TestClient) -> None:
    response = client.get("/api/scene", params={"robot_x": 999.0, "seed": 0})
    assert response.status_code == 400
    assert "robot" in response.json()["detail"].lower()


def test_scene_rejects_a_non_positive_decay(client: TestClient) -> None:
    response = client.get("/api/scene", params={"decay": 0.0, "seed": 0})
    assert response.status_code == 400
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/python -m pytest tests/test_app_api.py -q -k scene`
Expected: FAIL — `KeyError: 'dt'`

- [ ] **Step 3: Implement**

Extend the route signature with the new query parameters (`robot_x: float | None = None`,
`robot_y: float | None = None`, `amplitude: float | None = None`, `decay: float | None = None`,
`n_pedestrians: int | None = None`), defaulting to the adapter's own defaults when absent.

Build the adapter with them. **Wrap the construction in `try/except ValueError` and re-raise as
`HTTPException(status_code=400, detail=str(error))`** — the adapter's validation from Task 4 already
writes good messages, and this keeps the one-`ValueError`-to-400 contract the rest of the API uses.

Add a helper that builds the gap series with explicit loops:

```python
def _gap_series(pair: RolloutPair) -> list[dict[str, object]]:
    """Per-agent distance between the two arms at each timestep.

    Computed here rather than in the browser: the page displays these numbers, and the standing
    rule is that JavaScript renders numbers the API supplies and never derives them.
    """
    series: list[dict[str, object]] = []
    for factual_traj, counterfactual_traj in pair.paired_agents():
        offsets = factual_traj.positions - counterfactual_traj.positions
        distances = np.sqrt(np.sum(offsets * offsets, axis=1))
        gaps: list[float] = []
        for step_index in range(distances.shape[0]):
            gaps.append(float(distances[step_index]))
        series.append({"agent_id": factual_traj.agent_id, "gaps": gaps})
    return series
```

Add `body["dt"]`, `body["n_steps"]`, and `body["gap_series"] = _gap_series(pair)`. Take `dt` and the
step count from the pair's own trajectories, never from a literal.

- [ ] **Step 4: Run the gates**

```
.venv/bin/python -m pytest tests/test_app_api.py tests/test_boundary.py -q
.venv/bin/python -m ruff check src tests
.venv/bin/python -m pytest -q          # timeout 600000, FOREGROUND
```

- [ ] **Step 5: Commit**

```bash
git add src/mirn_app/server.py tests/test_app_api.py
git commit -m "Extend /api/scene with robot settings and playback data

Adds the four robot settings as query parameters and returns dt, n_steps and
a per-agent gap series, so the page can animate and display the widening gap
without computing anything in the browser."
```

---

**End of Phase A.** At this point the existing page still works, still dark, and the suite is green.
Every change so far is additive or a mechanical rename.

---

## Phase B — the page

**A note on how these four tasks are specified.** Phase A's tasks carry complete code because their
shape is fully determined by the existing types. Phase B's are specified by *requirement* instead —
sharp, checkable requirements, but not transcription. That is deliberate and worth stating plainly:
the last page build needed three browser-driven fix rounds no matter how complete the plan's code
was, because canvas layout and copy only reveal their problems on screen. Pre-writing 600 lines of
speculative JavaScript would create false confidence, not save work.

What that means for whoever executes this: every requirement below is a thing a reviewer can check
by reading the diff or running a grep, and the one genuinely error-prone piece — the animation loop
and the connector marks — is given as code in Task 7. Expect a browser pass after Task 8, and
budget for it rather than treating it as failure.


### Task 6: Light theme and page shell

**Files:**
- Modify: `src/mirn_app/static/style.css`, `src/mirn_app/static/index.html`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `css_root_block()` from Task 1, now serving the light palette.
- Produces: the page skeleton the remaining tasks fill — a masthead, a hero scene panel, a `<main id="beats">`, a footer, and a `<template id="beat-template">`.

- [ ] **Step 1: Rewrite `style.css` for the light palette**

Every colour stays `var(--mirn-*)` — the tokens now carry light values, so most rules need no change
at all. What does change is what suits a cream page carrying long prose:

- body text `1.05rem`, line-height `1.7`, measure capped at `38rem` for prose blocks;
- section rules become hairlines in `var(--mirn-grid)`;
- the `.synthetic-banner` keeps its mono face but sits on `var(--mirn-surface)` with a `var(--mirn-grid)` border;
- remove any rule that assumed a dark ground (glows, low-opacity whites).

**Verify no colour literal survives:** `grep -nE '#[0-9a-fA-F]{3,8}|\brgb|\bhsl' src/mirn_app/static/style.css` must return nothing.

- [ ] **Step 2: Rewrite `index.html`**

Keep `<style>/* MIRN_THEME */</style>` **exactly as-is** — the server substitutes it and
`test_index_serves_html_with_the_theme_injected` asserts both that `--mirn-background` appears and
that the raw token does not. Keep the vendored KaTeX links.

**The four-section layout is deleted, not hidden.** Nothing from the old `<main>` survives —
two presentations of the same argument would drift apart. The body becomes: masthead (title, standfirst, synthetic banner), the hero `<section class="scene">`
with a canvas and a robot-settings form, `<main id="beats"></main>`, a footer with the export button
and seed, and a `<template id="beat-template">` containing the per-beat structure (index, title,
plain claim, controls, readout, plot canvas, note, and the mathematics disclosure).

- [ ] **Step 3: Amend `CLAUDE.md`**

Replace the dark-mode line under Code conventions with:

```markdown
- **Plots are minimal and high-end** (DeepMind / Anthropic register). All styling lives in
  `mirn.viz.theme`, which carries two palettes: `DARK_PALETTE` for matplotlib paper figures and
  `LIGHT_PALETTE` for the browser page, which is mostly prose and reads better on cream. Never set
  colours or fonts inline in a plotting function or a stylesheet.
```

- [ ] **Step 4: Gates and commit**

```
.venv/bin/python -m pytest tests/test_app_api.py -q
.venv/bin/python -m ruff check src tests
```
Then `git add src/mirn_app/static CLAUDE.md` and commit.

---

### Task 7: The two-world scene player

**Files:**
- Modify: `src/mirn_app/static/app.js`

**Interfaces:**
- Consumes: `/api/scene` with its Task 5 fields.
- Produces: a scene player that fetches once per settings change and animates locally.

- [ ] **Step 1: Implement the player**

Requirements, all enforceable by reading the code:

- **Draw the same crowd twice.** Counterfactual paths in `--mirn-counterfactual` at reduced alpha (the ghost); factual in `--mirn-factual` at full weight. Draw the trail up to the current step, plus a dot at the current position for each.
- **Draw the connector.** For each agent, a hairline between its two current positions. That line *is* the robot's effect on that person, and it is the single most important mark on the page.
- **Draw the arena** from the API's `extent`, and the robot from `robot[0]`, labelled.
- **Play/pause/scrub**, driven by `requestAnimationFrame` and the API's `dt` so playback is real-time. Loop at the end.
- **Readout:** the gap for the agent whose current gap is largest, read from `gap_series` — never computed in JS.
- **Refetch** debounced at 250 ms on any settings change; keep playing across a refetch rather than resetting to step 0.
- **Every colour via `token("--mirn-*")`.** No literals.

- [ ] **Step 1b: The animation loop and the connector marks — use this**

This is the part most likely to go wrong: a `requestAnimationFrame` loop that drifts, or a redraw
that clears state it needs. Transcribe it rather than improvising.

```javascript
// The scene player. `state.scene` is the last /api/scene payload; `player` is view state only —
// no measured quantity is derived here. The gap shown comes from the API's gap_series.
const player = { step: 0, playing: true, lastFrameMs: 0, accumulatorMs: 0 };

function sceneScales(canvas, extent) {
  const pad = 22;
  return {
    x: makeScale(0, extent.width, pad, canvas.width - pad),
    y: makeScale(0, extent.height, canvas.height - pad, pad),
  };
}

function drawScene(canvas, scene, step) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  const scale = sceneScales(canvas, scene.extent);

  // The arena, so the paths read as people crossing a room rather than lines in a void.
  context.strokeStyle = token("--mirn-grid");
  context.lineWidth = 1;
  context.strokeRect(
    scale.x(0), scale.y(scene.extent.height),
    scale.x(scene.extent.width) - scale.x(0),
    scale.y(0) - scale.y(scene.extent.height)
  );

  // Trails: the robot-absent world as a ghost, the robot-present world solid.
  const arms = [
    { paths: scene.counterfactual, color: token("--mirn-counterfactual"), width: 1.0, alpha: 0.45 },
    { paths: scene.factual, color: token("--mirn-factual"), width: 1.6, alpha: 1.0 },
  ];
  for (const arm of arms) {
    context.strokeStyle = arm.color;
    context.lineWidth = arm.width;
    context.globalAlpha = arm.alpha;
    for (const agent of arm.paths) {
      context.beginPath();
      for (let index = 0; index <= step; index += 1) {
        const point = agent.positions[index];
        const x = scale.x(point[0]);
        const y = scale.y(point[1]);
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  // The connector. This mark IS the robot's effect on that person — the whole thesis in one line.
  context.strokeStyle = token("--mirn-accent");
  context.lineWidth = 1.2;
  for (let index = 0; index < scene.factual.length; index += 1) {
    const here = scene.factual[index].positions[step];
    const ghost = scene.counterfactual[index].positions[step];
    context.beginPath();
    context.moveTo(scale.x(ghost[0]), scale.y(ghost[1]));
    context.lineTo(scale.x(here[0]), scale.y(here[1]));
    context.stroke();
  }

  // Current positions.
  for (const arm of arms) {
    context.fillStyle = arm.color;
    context.globalAlpha = arm.alpha;
    for (const agent of arm.paths) {
      const point = agent.positions[step];
      context.beginPath();
      context.arc(scale.x(point[0]), scale.y(point[1]), 3, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  if (scene.robot) {
    const robot = scene.robot[0];
    context.fillStyle = token("--mirn-naive");
    context.beginPath();
    context.arc(scale.x(robot[0]), scale.y(robot[1]), 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = token("--mirn-ink-muted");
    context.font = "11px " + (state.theme["--mirn-font-mono"] || "monospace");
    context.textAlign = "left";
    context.fillText("robot", scale.x(robot[0]) + 11, scale.y(robot[1]) + 4);
  }
}

// Largest current gap, read from the API's series. Never computed here.
function widestGapAt(scene, step) {
  let widest = 0;
  for (const entry of scene.gap_series) {
    const gap = entry.gaps[step];
    if (gap > widest) widest = gap;
  }
  return widest;
}

function tick(nowMs) {
  const scene = state.scene;
  if (scene) {
    if (player.lastFrameMs === 0) player.lastFrameMs = nowMs;
    const elapsedMs = nowMs - player.lastFrameMs;
    player.lastFrameMs = nowMs;
    if (player.playing) {
      // Advance by wall-clock time against the API's dt, so playback is real-time and does not
      // drift with frame rate.
      player.accumulatorMs += elapsedMs;
      const stepMs = scene.dt * 1000;
      while (player.accumulatorMs >= stepMs) {
        player.accumulatorMs -= stepMs;
        player.step = (player.step + 1) % scene.n_steps;
      }
    }
    drawScene(document.getElementById("scene-canvas"), scene, player.step);
    document.getElementById("scene-clock").textContent =
      (player.step * scene.dt).toFixed(1) + " s";
    document.getElementById("scene-gap").textContent =
      widestGapAt(scene, player.step).toFixed(3) + " m";
    const scrub = document.getElementById("scene-scrub");
    if (document.activeElement !== scrub) {
      scrub.max = String(scene.n_steps - 1);
      scrub.value = String(player.step);
    }
  }
  window.requestAnimationFrame(tick);
}
```

On refetch, replace `state.scene` and **clamp** `player.step` to the new `n_steps - 1` rather than
resetting it to zero — a settings change should not restart playback.

- [ ] **Step 2: Verify**

```
node --check src/mirn_app/static/app.js
grep -nE '#[0-9a-fA-F]{3,8}|\brgb\(|\bhsl\(' src/mirn_app/static/app.js   # must be empty
```

- [ ] **Step 3: Commit**

---

### Task 8: The five beats

**Files:**
- Modify: `src/mirn_app/static/app.js`, `src/mirn_app/static/index.html`

**Interfaces:**
- Consumes: `/api/meta` (now carrying `order` and `primary_parameters`), `/api/experiment/{name}`, `/api/methods` (cards now carrying `plain_summary`).
- Produces: the beat renderer.

- [ ] **Step 1: Implement**

- Beats render in `order`; beat 0 is the hero scene and is not an experiment.
- Controls named in `primary_parameters` render inline; the rest go under a `<details>` labelled "more settings". **Read the field — never match an experiment name.**
- Each beat shows: its index, its title, a plain claim, the number(s) with units, the plot, the note, and the mathematics disclosure.
- The mathematics disclosure renders each card as: `plain_summary` **first, in prose**, then estimand, then formula, then assumptions, then breaks-when. Beat 1's disclosure is `open` by default.
- Keep the existing pending state and its honest first-load message.

- [ ] **Step 2: Write the beat copy**

Each beat's claim sentence, in the page's own voice, for a reader with no robotics background. Use the spec's §6 table as the source and expand each into two or three sentences. The copy must:
- never say pedestrians *avoid* or *react to* the robot — they are displaced by it (spec §11);
- define "divergence", "estimator", "counterfactual", "null", and "detection floor" in plain words at first use;
- state plainly, at beat 1, that this is the method most papers use.

- [ ] **Step 3: Verify and commit**

```
node --check src/mirn_app/static/app.js
grep -nE '===\s*"(calibration_floor|estimator_comparison|confounding_sweep|placebo)"' src/mirn_app/static/app.js   # must be empty
.venv/bin/python -m pytest tests/test_app_api.py -q
```

---

### Task 9: Final pass — verify, clean, document

**Files:**
- Modify: whatever the browser pass turns up.

- [ ] **Step 1: Full gates**

```
.venv/bin/python -m ruff check src tests
node --check src/mirn_app/static/app.js
.venv/bin/python -m pytest -q          # timeout 600000, FOREGROUND
```

- [ ] **Step 2: Live check**

Start the server on a spare port, then with `curl` confirm `/` injects the theme and substitutes the
placeholder, all static assets return 200, and `/api/scene` carries `dt`, `n_steps` and `gap_series`.
**Kill the server afterwards.** Report the actual output.

- [ ] **Step 3: Confirm the guardrails hold**

- no colour literal in `style.css` or `app.js`;
- no experiment-name branching in `app.js`;
- `demo/perturbation-playground.html` byte-identical to before this plan;
- `CLAUDE.md`'s amended line matches what the code now does.

- [ ] **Step 4: Commit**

---

## Done criteria

- `pytest -q` green, ≥ 272 tests plus this plan's additions.
- `ruff check src tests` clean; `node --check` clean.
- The page is cream and black, opens with a moving two-world scene, and reads as five beats.
- Every card shows plain English before notation.
- The robot still does not move; no pedestrian reacts to anything.
- `demo/perturbation-playground.html` untouched.
