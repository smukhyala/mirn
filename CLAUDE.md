# CLAUDE.md — working agreement for MIRN

MIRN is a **simulator console** for perturbation in robotics. This file is the operational
contract, and it is the only one — `docs/teaching/authoring.md` governed page copy and there are
no pages.

If you are looking for the research measurement instrument this project used to be, it is in
`docs/archive/`. It governs nothing here.

---

## What this project is

MIRN becomes a **simulator console** for perturbation in robotics: set up an invented crowd, press
Run, and compare what different rulers say about what the robot did to it.

The operator is unchanged — a curious person with no robotics background, willing to press Run and
read carefully for twenty minutes. What changed is that they act instead of read.

The notebook carried its explanation in seventeen pages, in a fixed order, before any number
appeared. The console has no order at all: every number is reachable in any state. So the
explanation stops *preceding* the number and starts *hanging off* it. The
`intuition → visualization → measurement → mathematics → interpretation` shape was a page ordering
and there are no pages. It is replaced by the one sentence that survives its loss, because that is
what guardrails 1, 6 and 7 now rest on:

> **Every number on screen is one interaction from what it assumes and from what it would read if
> the answer were zero.**

The simulator exists so the mathematics has something concrete to refer to. It is not the product;
the understanding is.

**It is not** a robotics platform, a motion-planning framework, a dataset, a benchmark, or a
research result. If a proposed change moves it toward any of those, say so and push back before
implementing.

---

## Hard guardrails

Violating any of these breaks the lesson, so treat them as build errors rather than preferences.

1. **The simulator is ours, and it is honestly labelled.** The engine in `web/engine/sim/` is the
   core of the product. Test it, own it, keep the physics free of the DOM. In exchange: every
   surface that shows a number from it says, in words a beginner reads *before* the number, that
   this crowd is invented. A console that lets an operator think they are watching real pedestrians
   has failed, however good the number is. The disclosure sits above the arena and above the
   readouts in document order in the static HTML, and it is line one of every CSV, because a file
   outlives the page it came from.

2. **Never teach a conclusion the toy cannot support.** The crowd is a social-force model. It can
   demonstrate *that* a measurement can be confounded and *why* the paired design removes the
   confound. It cannot establish how large the effect is for real robots, which method wins in the
   field, or that any published paper is wrong. Where a readout or an expander wants one of those,
   it says instead what would have to be measured to find out.

3. **The knobs are one closed table and each entry names, as data, the measurement it moves.** The
   build checks four mechanical shadows: every axis's `apply` produces a legal `RunConfig` at both
   ends and every step between; every axis moves its declared measurement by more than the paired
   seed noise; the console shows an axis's declared measurement whenever that axis is on screen;
   every axis and column has a plain-English name and a unit.

   **The second one is not judged against the run-to-run band, and must never be changed to be.**
   `axes.slow.test.ts` runs the axis at its minimum and at its maximum under the same eight seeds,
   takes the mean of the eight paired differences, and asserts that its size exceeds twice the
   standard error of those differences. It passes `band: null` deliberately. The run-to-run band is
   the *unpaired* spread between two runs of the same room, and both endpoints of this comparison
   share their seeds — so that spread is exactly the thing the pairing already removed, and judging
   a paired difference against an unpaired floor is the confounded comparison this whole console
   exists to teach against. An agent who reads a "more than the band" sentence, finds the test
   disagreeing and "fixes" the test has broken the lesson, which is why the sentence is written out
   at this length.

   The measured margins are recorded in that file's own header, smallest first, so a physics change
   that halves one is a visible number rather than a red test with no baseline. None of the four
   checks knows whether an expander's wording is *true*, and three axes are measurably non-monotone,
   so reading the console at both ends of every dial is still the author's job.

4. **Determinism is a feature.** Every stochastic path takes an explicit seed. No global RNG in
   either language — `Math.random` throws in the engine test suite. The paired world's two arms
   share exogenous noise **by construction**: one addressable tape, two consumers, nothing to keep
   aligned. Same seed, same pixels, every reload.

5. **The paired invariant is the whole lesson.** Both arms share seed, initial state and exogenous
   noise, and differ only in the treatment. `makePairedRun` asserts it, more strictly than the
   Python original. A feature that cannot satisfy it is the wrong feature.

6. **Never show a perturbation number without saying what it would read if the answer were zero.**
   A value with no stated assumption and nothing to judge it against is the exact error this site
   exists to teach. This binds the readout tiles, not just the return type: the tile's props are
   `(reading, zeroRendering)`, the zero is a rendered value plus phrase, and a zero-reference inside
   a closed `<details>` is not shown. The zero is measured per axis value, never quoted from another
   cell.

7. **Raw metres may appear, but never alone.** A beginner needs to see metres against something, or
   a ratio means nothing to them. On a 72-row table a body-scale phrase per cell is absurd, so the
   anchor appears on the tiles and in the column header, once. Every metre is shown next to
   something that gives it scale — a body-scale anchor, a zero-effect floor, or the run-to-run
   band.

8. **Python is the oracle; the browser is the product.** Any formula that exists in both languages
   has a parity fixture in `tests/golden/parity/`. Changing a formula is a **two-file commit
   minimum**: the implementation plus the regenerated fixture. Changing one side alone is a red
   test, not a judgement call.

9. **Keep the shared surface small.** Only `web/engine/measure/` has an oracle. Do not port the
   simulator to Python "so we can check it" — that doubles the drift surface to check a component
   whose correctness is behavioural, not numerical. The oracle covers the measurement, not the
   world.

10. **No server, no backend, no account, no persistence beyond the URL.** Static files only. This
    includes analytics, saved sessions, comment threads and share endpoints — and it names
    `localStorage`, `sessionStorage` and `IndexedDB`, which are exactly the loophole a reviewer
    reads as compliant. The ledger does not survive a reload. A permalink is a query string and it
    carries the recipe, never the results: a link asserting `true_effect=0.352` would quote an old
    answer with the new page's authority. Both halves of it are wired — `web/console.ts` reads
    `window.location.search` before it mounts the panel, and `mountPanel`'s `initial` option is the
    only seam that exists for it. A write-only permalink is worse than none: the link looks like it
    works and loses its payload in silence. What the panel cannot take (a crowd count off the
    picker's list, a slider's own notches, the three settings with no control yet) is printed above
    the controls, never rounded off quietly.

    This one used to be enforced by two prose comments, which is the position the `Math.hypot` ban
    was in before somebody wrote a test.
    `web/app/console/__tests__/nostorage.test.ts` now greps every `.ts`, `.html` and `.css` file
    under `web/` for the storage and network APIs, with the same canary and meta-test
    `hypot.test.ts` carries. `history.replaceState` is the one allowed exception and is asserted
    present rather than absent, because it is how the permalink reaches the address bar.

11. **The line is not "do not be a simulator"; it is between this toy, measured well, and robots,
    characterised.** The operative half of the old rule — "which page does this make clearer?" —
    stops working when there are no pages, and it was the half that did the refusing. No ROS, no
    planner benchmark, no dataset loader, no trained model, no physics-engine dependency, no second
    simulator backend, no leaderboard, no bring-your-own-method import path. The CSV is an export,
    never an input format — the moment something else can be read in and scored, this is a benchmark
    and the numbers start being about someone else's robot. A run list with pinning, diffing, a
    sweep and an export is precisely the shape of a benchmark harness, and a column picker is an
    extension point wearing a checkbox, so the columns are a closed table with no user-defined
    column and no formula field. The refusal test is now: **"which readout does this move, and what
    does that readout say when the answer is zero?"** — no answer, no feature. It folds guardrail 6
    into the admission criterion, so a feature cannot enter without bringing its own zero.

12. **No bare code identifier on any surface a reader sees, and every term defined in plain English
    at first use.** Half of this guardrail genuinely died: `web/vocab.ts`, the `introduces`/`uses`
    front matter, `checkVocabulary` and `lintForwardTerms` all go, because with one page there is no
    order to fix. What survives is the whole rule. Its mechanical enforcement is the identifier
    regex, re-homed from the deleted render suite onto `COLUMNS` and `AXES` in
    `web/engine/job/__tests__/columns.test.ts` and `axes.slow.test.ts`. Pointed at the catalogue
    rather than a rendered DOM, it also covers a column nobody ticked. Two more suites run variants
    of the same regex over strings the catalogue does not own: `panel.test.ts` over the whole
    booted panel's text, and `permalink.test.ts` over every sentence a hand-edited link can
    produce.

13. **`docs/archive/` is read-only.** Never delete or soften an `UNVERIFIED` marker in it, never
    cite it as current, and never quietly update a claim in it to match something we now believe.
    Any claim the lesson takes from the archive cites the primary source directly; if the archive
    marks it UNVERIFIED, the copy either verifies it independently or does not make it.

---

## The two-implementation rule

| Layer | Owner | How it is kept honest |
|---|---|---|
| The crowd, the robot, the world | **TypeScript only** | Property tests. There is no oracle and there should not be one |
| Divergences | **Python is the oracle** | `divergence.*` — five subjects, path form and cloud form |
| Estimators | **Python is the oracle** | `estimator.paired.per_run`, `estimator.cvm_residual.per_run` — each case carries a whole `RolloutPair` as literal arrays, and both sides rebuild it through the real contract factories |
| The detection floor | **Python is the oracle** | `calibration.split_half_null.floor` — pins every individual split, the null mean, and the floor those splits are quantiled into |
| Paper figures, CSV export | **Python only** | Unchanged from the research era |

`.venv/bin/python -m mirn.cli fixtures --out tests/golden/parity` writes the answers;
`web/engine/measure/__tests__/parity.test.ts` reproduces them. Tolerances are declared **in the
fixture**, by the oracle author, so loosening one is a visible diff in a committed file rather
than an invisible edit in a test. A subject with no TypeScript entry point is a failure, not a
skip.

Three Python parameters exist only because parity demanded them, and none of them changes a
default — one on `ConstantVelocityResidual` (`end_step`) and two on `split_half_null`
(`stride_steps`, `permutations`). Do not delete them as unused — the TypeScript ports have carried all three
since they were written, and without them the two languages can only be compared on the windows
and pools where the answer happens not to depend on them, which is exactly where neither
implementation is interesting.

Three float traps, learned the hard way:

- **`Math.hypot` is banned in `web/engine/measure/`.** V8's is *more* accurate than numpy's naive
  `sqrt(sum(d*d))`, so it disagrees with the oracle in the last bits. Fine in `sim/`, a landmine in
  `measure/`. The ban was a comment for a while and comments do not fail builds;
  `web/engine/measure/__tests__/hypot.test.ts` now greps the directory's own source and is the
  thing that actually stops it.
- **numpy sums pairwise.** `web/engine/measure/kernels.ts` reimplements that rather than folding
  left, and the comment saying why must survive any tidy-up.
- **`np.quantile` defaults to `method="linear"` at index `(n-1)q`.** Reimplemented exactly; there
  are nine conventions and picking another silently shifts every floor on the site.

### What the fixtures deliberately do not pin

Every row here is a quantity a reader could reasonably expect a fixture to cover, and which does
not have one. Nothing else is exempt: if you add a measurement to `web/engine/measure/` that
Python also computes, it gets a fixture or it gets a row. `paired_debiased` and
`noisy_oracle_residual` are absent from the list because they are absent from the browser
entirely — Python-only estimators are not a parity question until something ports them.

| Unchecked | Why, and what stands in for it |
|---|---|
| `bootstrap_ci` | Reproducing numpy's PCG64 would be a dependency on a numpy internal. Python checks it by invariant instead (`ci_low <= value <= ci_high`). There is nothing to compare it against: the browser's `Estimate` carries no interval at all, so a fixture would have only one side |
| *Which* split-half partitions get drawn | Same PCG64 reason. The fixture carries the permutations as data and both `split_half_null` and `splitHalfNull` take an injectable permutation source, so the two languages run identical splits and what is compared is the cloud arithmetic alone. The browser's own `seededPermutations` never appears in a parity case |
| `Estimate.nSamples` | Different by design, not by accident: the TypeScript `Estimate` describes one run and counts agents, the Python `PerturbationEstimate` describes a batch of `RolloutPair`s and counts pairs. Forcing them to agree would make one of them lie about what it measured |
| `identification`, `estimatorName`, `divergenceName` | The browser's wording is written for a reader and Python's for a paper, so the strings differ on purpose. Each suite asserts its own instead: that the paired estimator's is substantial, and that the constant-velocity residual's opens with `UNMET` |
| `sinkhorn_w2` | Every step is `exp`/`log`, neither bit-portable, and a tolerance-based stopping rule halts at different iteration counts — ~1.2e-3 relative between adjacent stopping points. Python-only; the browser uses ADE, which is what the demo used anyway |
| `replicateBand` | Not a two-implementation item at all: it re-runs the simulator, which is TypeScript-only by rule. It is also a *different* null from `split_half_null` — see the naming note in `null/band.ts` — and the two are never divided by one another |

---

## Code conventions

### TypeScript (`web/`)

- **Plain typed records, not a plugin system.** This is a deliberate reversal of the Python side's
  framework-first convention, and it must be stated or the next agent will "fix" it back. An
  extension point is an invitation, and guardrail 11 exists to decline it. Four divergences do not
  need a registry.
- Strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Frozen plain
  objects, validated in a `make*` factory that throws `ContractError` — never a class, because
  everything crosses a Worker boundary and must be structured-cloneable.
- Explicit loops with named intermediates. No chained expressions to save lines.
- An explicit `kind: string` field, never type sniffing.
- **A number and its explanation live in different files, and nothing checks that they agree.**
  `web/engine/measure/kernels.ts` is the numeric layer — pairwise summation, per-step distance,
  path length, numpy's linear quantile — and everything in `measure/` that has to match the oracle
  bottoms out there. `metrics.ts` composes those into four measurements — `deviation`, `robotCost`,
  `clearance`, `recovery` — and returns values and nothing else. The wording a reader opens
  underneath a number is written by hand, in the `assumption` and `zero` fields of each descriptor
  in `web/engine/job/columns.ts`. So changing a formula means editing its descriptor in the same
  commit: a panel has already once explained a different quantity from the one printed above it,
  and it compiled.

### Python (`src/mirn/`)

Unchanged from the research era, and still correct: ABCs plus a registry, explicit loops, no
`isinstance`, frozen dataclasses validated in `__post_init__`, full type hints, CSV for results, no
hardcoded paths or secrets.

---

## Testing

Write the test with the implementation, in the same commit.

**First-class tests.** `web/engine/measure/__tests__/placebo.test.ts` and `tests/test_placebo.py`
are gates. If either is red, nothing on the page can be trusted and no other work proceeds.

**The placebo test stays on the analytic fixture, and this is not negotiable.** On a dynamical
crowd, deleting a bystander who never came within 5 m of the robot moves the estimate by up to 37%,
because removing anyone rewires the interaction chain and the robot then takes a different path.
That is correct behaviour, not a bug. Re-pointing the gate at the social-force sim would make it
permanently red for a good reason, and the natural "fix" is to loosen the tolerance until it
passes — which destroys the gate. The finding itself is not taught anywhere now; it is why the
placebo gate is analytic, and this paragraph is the record of it.

**Property tests** over the divergences: non-negativity, exactly zero on identical inputs, symmetry,
translation and rotation invariance, monotonicity under injected deviation. Note that bitwise
translation invariance holds only for integer coordinates; asserting it for arbitrary doubles is
asserting something false.

**Determinism tests** compare bytes, not approximations. `toBe(0)`, never `toBeCloseTo(0)` — the
shared-tape construction makes exactness available, and inexactness means the arms have drifted.

**Legibility is a functional requirement.** For a console, "the demonstration is legible at every
position of every dial" is behaviour, and a physics change that breaks it should fail a test rather
than be noticed three weeks later. That is what `axes.slow.test.ts` is for, and its failure mode is
named in its own comment: reducing `nTicks` to speed it up gives the crowd less room to respond, so
a genuinely real axis moves its readout by less than the seed noise on the move, it goes red for a
good reason, and the natural repair is loosening the threshold — which is how the placebo gate
would have been destroyed.

It also owns the check nothing else can make: that every axis's default, minimum and maximum lie on
its own step grid. A range input snaps whatever it is given to `min + n * step`, and jsdom does not,
so a default off the grid is invisible to every test that mounts the panel and shows up only in a
browser. One was: `walkingPace` defaulted to 1.34 with a step of 0.05 above 0.4, so the console ran
its crowd at 1.35 while `DEFAULT_CONFIG` and the whole test suite used 1.34.

### Commands

Nothing from the virtualenv is on PATH — not `python`, not `pytest`, not `ruff`, not `mirn`. Every
command below is written so it runs as spelled from the repository root, with no activation step.

```bash
npm run check                            # typecheck, vitest, vite build — 28 s
npm run test                             # 511 tests in 22 s
npx vitest run --exclude '**/*.slow.test.ts'   # 506 of them in 14 s
.venv/bin/python -m pytest -q            # 298 tests, ~6 min; one calibration test is 132 s of it
.venv/bin/python -m pytest -q -m "not slow"   # 275 of them in 22 s, minus the heavy nulls
.venv/bin/python -m ruff check src tests
.venv/bin/python -m mirn.cli fixtures --out tests/golden/parity   # after any formula change
```

Every figure above was measured on this machine on the commit that wrote them, not estimated. Two
of them used to be wrong by a plausible-looking margin, which is the failure mode this paragraph
exists to name: a timing nobody re-ran is a claim, and the whole point of a documented fast loop is
that its cost is small enough to be worth it.

**There is no `--project engine` fast loop, and naming one was the mistake.** It runs in 17 s
against 22 s for everything, because `axes.slow.test.ts` is 14 s of the suite and lives inside the
engine project. Excluding that one file is the only cut worth making, and it is what the third line
above does — 14 s, at the cost of the guardrail-3 check, so it is a working loop and not the gate.

The fast pytest loop is real: the tests that dominate the runtime carry `@pytest.mark.slow`, and
`pyproject.toml` records the measurement the cut-off came from. It skips the divergence property
tests and the calibration suite, so it is also a loop and not a gate. `tests/test_placebo.py` is
deliberately not marked and runs in both.

Pre-commit: `npm run typecheck && npm run test && .venv/bin/python -m ruff check src tests` — 27
seconds measured. Full `npm run check` plus `.venv/bin/python -m pytest -q` before any push.
**Never claim work is complete without running it and showing the output.**

---

## Content

There is no prose file. Every word a reader sees is a `label`, a `zero`, an `assumption` or a
`note` on an entry in `web/engine/job/columns.ts` or `web/engine/job/axes.ts`, and those two
catalogues are closed.

**No numeric literal appears in console copy.** Every zero line, band figure and caption renders
from the cell actually on screen, because a hardcoded number is a claim that outlives the settings
that produced it. `tile.test.ts` renders **every column in `COLUMN_ORDER`**, not a fixture, and
fails on a literal metre or second value in any leaf that is not one of the four value slots. The
zero's own phrase, `tile-zero-how`, is scanned rather than excused: six catalogue phrases used to
end "…and this reads 0.000 m" beside a slot already printing 0.000 m, and the fixture-based version
of this test could not see them.

**No wording may be written before its measurement has been run.** Copy asserting a phenomenon the
operator is watching not happen is the worst failure this project has. Four sim bugs and two
badly-posed measurements were found by running the experiments first; none would have been caught
by writing the words first.

Voice: short declaratives, concrete nouns before abstract ones, a defined term introduced in one
plain sentence and then used. Self-limitation stated as flatly as the claims — "we have not found"
rather than "nobody has published". The recurring metaphor is **the ruler and the room**: the ruler
is real, the room is invented.

Never use the word *estimand*.

---

## Working style

- Prefer editing existing files to creating new ones. Do not create documentation files unless
  asked.
- When a claim needs a citation, fetch the primary source. Do not cite from memory.
- When something cannot be verified, write **UNVERIFIED** and move on.
- Surface disagreement early. The guardrails above exist because the obvious version of this
  project is worse than this one, and several of them were written after a measurement contradicted
  an assumption.
