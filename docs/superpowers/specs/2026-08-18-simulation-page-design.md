# Design — the MIRN simulation page

**Date:** 2026-08-18
**Status:** approved in chat, pending spec review
**Supersedes the presentation layer of:** `docs/superpowers/specs/2026-08-17-instrument-ui-design.md` (its computation layer stands unchanged)
**Conventions authority:** `CLAUDE.md`, with two deliberate amendments recorded in §10.

---

## 1. Purpose

The current page presents four sections, each with controls, a number, and a static plot. It is correct and it is hard to read. A visitor sees trajectories drawn as lines and metrics whose names assume they already know the field.

The four-section page is **replaced outright**, not kept behind a second route — two presentations of the same argument would guarantee they drift apart.

This design replaces that presentation with **one configurable scene you watch**, and an argument told around it in plain English. The success criterion is not test count. It is that a reader with no robotics background finishes the page able to say, in their own words:

1. what is wrong with how perturbation is currently measured and reported,
2. how this project addresses it,
3. why watching this particular simulation demonstrates both.

## 2. Non-goals

- **Not a new crowd model.** No pedestrian reacts to anything. No robot moves. See §5.
- **Not a replacement for `demo/perturbation-playground.html`.** That file stays untouched.
- **Not a change to any estimator, divergence, contract, or experiment.** Every number keeps coming from the code that already computes it.
- **Not a dark page with lighter colours.** The page is cream and black; see §8.

## 3. What does not change

The whole computation layer: `contracts`, `divergence`, `data`, `estimator`, `calibration`, all four registered experiments, `mirn.cli`, CSV output to `results/`, and the enforced library/app boundary. `viz.figures` keeps producing dark paper figures.

If a change in this design would alter a number that the current code produces, it is out of scope and I have got the design wrong.

## 4. The thing you watch

One canvas. **The same crowd twice**: the robot-present run drawn solid, the robot-absent run drawn as a faint ghost, both from the same seed with the same starting positions and the same noise draw.

So as a person walks toward the robot, the viewer sees **one person separate into two paths**. The gap between them is the robot's effect on that person. No forecaster is involved and nothing is estimated — with both worlds in hand it can simply be measured.

That image is the project's thesis. It is also exactly what `PairedCounterfactual` computes, so the picture and the number are the same claim.

**Controls:** play, pause, scrub, and a step clock. **Readout:** the widening gap for the person currently nearest the robot.

**That gap number is computed server-side**, not in JavaScript. `/api/scene` returns a per-agent `gap_series` (the per-timestep distance between an agent's two arms) alongside the trajectories; the page indexes into it. This preserves the existing rule that the browser renders numbers and never derives them.

## 5. What is configurable, and the line we do not cross

Four robot settings, **all of which already exist in the model**. Exposing them is configuration; it is not new physics, and guardrail 1 stands.

| Control | Model quantity today | Plain meaning shown to the reader |
|---|---|---|
| Strength | `influence` | how forcefully it pushes people aside |
| Reach | `DISPLACEMENT_DECAY_LENGTH_M` = 3.0 | how far away people start moving out of the way |
| Push size | `DISPLACEMENT_AMPLITUDE_M` = 1.5 | how far it shoves someone at closest range |
| Position | `_ROBOT_POSITION_M`, fixed centre | where in the room it stands |

Plus crowd size and seed, which the adapter already accepts.

**The robot does not move, and no pedestrian reacts to anything.** The displacement is analytic — `influence · amplitude · exp(−distance / decay)` applied laterally to an undisturbed straight-line path. A moving robot, or pedestrians that steer, would be a simulator and would cross guardrail 1. The page's copy must not imply otherwise: it says the robot *displaces* people, never that people *avoid* it.

### Adapter change

`SyntheticAdapter.__init__` gains four optional keyword arguments defaulting to today's constants:

```python
robot_position: tuple[float, float] | None = None,   # None -> box centre, as now
displacement_amplitude_m: float = DISPLACEMENT_AMPLITUDE_M,
displacement_decay_length_m: float = DISPLACEMENT_DECAY_LENGTH_M,
```

Validation in `__init__`: amplitude `>= 0`, decay length `> 0` (it divides), and a supplied position inside the box. `raise ValueError`, never warn.

**A test must assert that the defaults reproduce today's trajectories bitwise** (`np.array_equal`, not `allclose`) so that nothing already built changes behaviour, and every existing determinism and estimator test stays green untouched.

## 6. The argument, as five beats

The four-section structure is replaced. Each beat is: one plain sentence, the thing you just watched, one number, one consequence. Each is backed by the experiment that already computes it — the endpoints do not change.

| Beat | Backed by | The point, in the register the page uses |
|---|---|---|
| 0 · Two worlds | `/api/scene` | Same crowd, twice, one seed. The gap between a person's two paths *is* the robot's effect. Real life only ever hands you one of these worlds. |
| 1 · The problem | `estimator_comparison` | Because you only get one world, papers estimate the other with a forecaster. **Switch the robot off entirely.** The honest answer is zero. The standard method still reports about half a metre. |
| 2 · The floor | `calibration_floor` | With no robot anywhere, split the crowd in half and compare the halves. Still not zero. That is the measurement's own noise, and nobody publishes it — so published numbers have no scale. |
| 3 · The confound | `confounding_sweep` | Make the forecaster worse and watch the reported number climb through that floor, while the true effect stays pinned at exactly zero. |
| 4 · The check | `placebo` | Delete a bystander who never went near the robot. A valid measure should not twitch. |

### Keeping the page free of per-experiment branching

Beats 1–4 each want to foreground a couple of controls and tuck the rest away. To do that without the page learning experiment names, `Experiment` gains:

```python
primary_parameters: tuple[str, ...]   # class attribute, names drawn from parameters()
```

The page renders those prominently and the remainder under a "more settings" disclosure. A test asserts every registered experiment declares `primary_parameters`, that each name matches a declared parameter, and that the tuple is non-empty. Selection stays declared in Python; the browser stays generic.

### First paint

The hero simulation needs only `/api/scene`, which is fast, so the page is alive and interactive immediately. The beats populate as their experiments return, keeping the existing pending state and its honest "about a minute on first load, instant afterwards" message. This is a real improvement on the current page, where the slowest experiment gated the whole view.

## 7. Data flow for the animation

One fetch per configuration change, debounced; playback is local.

`GET /api/scene` gains `robot_x`, `robot_y`, `amplitude`, `decay`, `n_pedestrians` alongside the existing `influence`, `seed`, `scene_index`. It returns, as now, both arms' trajectories plus `robot`, `extent` and `seed`, and additionally:

- `dt` — so the page can play back in real time rather than guessing,
- `gap_series` — per agent, the per-timestep distance between its two arms,
- `n_steps`.

Payload size stays bounded by the existing parameter maxima. No per-frame requests.

## 8. Look

Cream page, black text, one accent, generous measure. Minimal to the point of plainness: this page is mostly prose and one moving picture.

`mirn.viz.theme` gains two named palettes:

- `LIGHT_PALETTE` — the browser. `as_css_tokens()` and `css_root_block()` serve it.
- `DARK_PALETTE` — matplotlib paper figures. `matplotlib_rc()` and `apply_matplotlib()` serve it; `viz.figures` reads it.

The single-source rule survives: still one module, still no colour literal anywhere else, still a golden-file test — now over both palettes. The existing `tests/golden/theme_tokens.json` currently records the dark palette's CSS tokens; because `as_css_tokens()` will now serve the light palette, that file must be regenerated, and a second golden added for the dark palette's matplotlib rcParams. `Palette`'s validation is unchanged and applies to both.

**`CLAUDE.md` line 42 is amended** to record the split rather than contradict the code. See §10.

## 9. Writing standard, enforced rather than aspirational

- No term is used before it is defined in plain words. "Divergence", "estimator", "counterfactual", "null", "detection floor" each get one sentence of English at first use.
- Every formula is preceded by a sentence saying what it does in words.
- The mathematics panels stay — they are the part explicitly asked for — but they open in English.

To make this a build error rather than a good intention, `MethodCard` gains:

```python
plain_summary: str    # what this does, in one sentence, no notation
```

Validation: non-empty after strip, and **contains no `\` or `$`** — i.e. it cannot be LaTeX wearing a prose label. The existing coverage gate already fails when a registered component lacks a card; this extends it so a card without plain English fails too. All eleven existing cards must be filled in.

## 10. Deliberate deviations from `CLAUDE.md`, to be recorded in the file

Both were chosen explicitly and both amend the file so it stops contradicting the code:

1. **Line 42, dark-mode plots.** Amended to: paper figures stay dark (DeepMind/Anthropic register); the browser page is light; both palettes live in `mirn.viz.theme` and no colour is set outside it.
2. **Nothing else.** Guardrail 1 (never write a simulator) is *not* amended — this design deliberately stays inside it, which is why the robot does not move.

The `demo/` section of `CLAUDE.md` stands: the playground remains a teaching artifact and this page shares no code with it.

## 11. Honesty constraints

- Every number on the page comes from the real estimators on synthetic data, labelled synthetic exactly as now.
- The animation is a teaching surface. It is not evidence, and no figure derived from it may be reported as a result.
- Perturbation is displayed in MDP units wherever a floor exists (guardrail 3), unchanged.
- The `forecast_horizon` caveat already in the payload note stays.
- Beat 0's copy must not describe the model as pedestrians avoiding the robot. They are displaced by a field; saying otherwise would overclaim the fixture.

## 12. Testing

- Adapter defaults reproduce existing trajectories **bitwise**; new settings validate and reject bad input.
- `gap_series` matches, per agent and per step, a direct computation from the two arms.
- `primary_parameters` declared, non-empty, and every name resolves to a real parameter, for every registered experiment.
- `plain_summary` present, non-empty and notation-free on every card — enforced by the existing coverage gate.
- Golden-file tests over **both** palettes.
- All existing tests stay green with no edits beyond the palette rename.
- The library/app boundary test is unaffected and must stay green.

## 13. Risks

- **The page overclaims what the model is.** The single biggest risk. An animation is persuasive, and this one shows a displacement field, not avoidance behaviour. Mitigated by §11's copy constraint and by keeping the maths panels, which state each component's failure modes.
- **The rewrite loses tested behaviour.** Mitigated by leaving the computation layer untouched and by the bitwise-defaults test.
- **Cold load still costs ~50 s** for the floor. Unchanged and unmitigated by design: the honest fix is not to thin the null. The hero simulation now renders immediately, so the page no longer looks dead while it waits.
- **Two palettes could drift.** Mitigated by golden files over both and by `Palette`'s shared validation.

## 14. Blast radius — measured, not estimated

Counted against the current tree so the plan can be sized honestly. Three of these changes add a
required field to a type that already has callers, which is the main source of churn.

| Change | Sites it touches | Notes |
|---|---|---|
| `_ROBOT_POSITION_M` → instance attribute | **2**, both inside `data/synthetic.py` | Nothing outside the module references it. Clean. |
| `PALETTE` → `DARK_PALETTE` / `LIGHT_PALETTE` | **26**: 11 in `viz/figures.py`, 2 in `viz/__init__.py`, 13 in tests | Mechanical and fully test-covered. No alias is kept — two names for one palette would invite exactly the drift the split is meant to avoid. |
| `Experiment.primary_parameters` (new required) | **5** subclasses: the four experiments plus `_Dummy` in `tests/test_experiments_base.py` | Same shape as the `order` field added earlier; that precedent worked. |
| `MethodCard.plain_summary` (new required) | **12**: 11 cards in `method/catalog.py`, 1 helper in `tests/test_method_cards.py` | The largest *content* task in this design — eleven pieces of real plain-English writing, which is precisely what was asked for. `as_dict()` must include it and the page must render it. |
| `/api/scene` new query params and response fields | 1 route, 1 test file | Additive; existing callers unaffected. |

## 15. Phasing

Two phases, because the second is worthless if the first is wrong and the first is independently
verifiable.

**Phase A — foundations, no visible change.** Adapter settings with the bitwise-defaults test; the
palette split with both golden files; `primary_parameters`; `plain_summary` and the eleven
summaries; `/api/scene`'s new params and `gap_series`. At the end of Phase A the existing page still
works, still dark, and the full suite is green — every change is additive or a mechanical rename.

**Phase B — the page.** The light theme applied, the animated two-world canvas, the five beats, the
rewritten copy, and deletion of the four-section layout. `CLAUDE.md` line 42 amended in this phase,
alongside the change that makes it true.

Splitting this way means a failure in Phase B never leaves the repository in a state where the
computation layer is half-migrated.
