# CLAUDE.md — working agreement for MIRN

MIRN is an **interactive learning environment** for perturbation in robotics. Read
`docs/teaching/authoring.md` before writing any page copy. This file is the operational contract.

If you are looking for the research measurement instrument this project used to be, it is in
`docs/archive/`. It governs nothing here.

---

## What this project is

One exceptionally good place to learn one difficult idea: what it means to disturb a moving
system, and how you would know how much.

The reader is **a curious person with no robotics background, willing to read carefully for twenty
minutes.** Every decision resolves against that person. They are not a roboticist, not a student
on a course, and not someone who will look up a term you left undefined.

The shape of every explanation is the same, and it never runs backwards:

> intuition → visualization → measurement → mathematics → interpretation

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
   this crowd is invented. A lesson that lets a reader think they are watching real pedestrians has
   failed, however good the number is.

2. **Never teach a conclusion the toy cannot support.** The crowd is a social-force model. It can
   demonstrate *that* a measurement can be confounded and *why* the paired design removes the
   confound. It cannot establish how large the effect is for real robots, which method wins in the
   field, or that any published paper is wrong. Where the copy wants one of those, it says instead
   what would have to be measured to find out.

3. **Every knob a reader can turn must change something they can see, and the copy must survive
   every position of it.** No sentence may assert a relation a rendered control could falsify.
   Where the lesson wants the reader at a particular setting, it says so imperatively and names the
   control. Enforced by the comparative lint in `scripts/build-notes.ts`.

4. **Determinism is a feature.** Every stochastic path takes an explicit seed. No global RNG in
   either language — `Math.random` throws in the engine test suite. The paired world's two arms
   share exogenous noise **by construction**: one addressable tape, two consumers, nothing to keep
   aligned. Same seed, same pixels, every reload.

5. **The paired invariant is the whole lesson.** Both arms share seed, initial state and exogenous
   noise, and differ only in the treatment. `makePairedRun` asserts it, more strictly than the
   Python original. A feature that cannot satisfy it is the wrong feature.

6. **Never show a perturbation number without saying what it would read if the answer were zero.**
   A value with no stated assumption and nothing to judge it against is the exact error this site
   exists to teach. This binds the readout tiles, not just the return type.

7. **Raw metres may appear, but never alone.** A beginner needs to see metres once, early, or a
   ratio means nothing to them. Every metre is shown next to something that gives it scale — a
   body-scale anchor, a zero-effect floor, or the run-to-run band.

8. **Python is the oracle; the browser is the product.** Any formula that exists in both languages
   has a parity fixture in `tests/golden/parity/`. Changing a formula is a **two-file commit
   minimum**: the implementation plus the regenerated fixture. Changing one side alone is a red
   test, not a judgement call.

9. **Keep the shared surface small.** Only `web/engine/measure/` has an oracle. Do not port the
   simulator to Python "so we can check it" — that doubles the drift surface to check a component
   whose correctness is behavioural, not numerical. The oracle covers the measurement, not the
   world.

10. **No server, no backend, no account, no persistence beyond the URL.** Static files only. This
    includes analytics, saved sessions, comment threads and share endpoints. A permalink is a query
    string.

11. **Not a robotics platform.** No ROS, no planner benchmark, no dataset loader, no trained model,
    no physics-engine dependency, no second simulator backend, no adapter layer for simulators we
    do not have. Every request answers "which page does this make clearer?" — no answer, no
    feature.

12. **Prose assumes nothing.** A term is defined in plain English at first use, before any
    notation, and the vocabulary ladder in `web/vocab.ts` fixes the order. Using a term before its
    page fails the build. No bare code identifiers on any surface a reader sees.

13. **`docs/archive/` is read-only.** Never delete or soften an `UNVERIFIED` marker in it, never
    cite it as current, and never quietly update a claim in it to match something we now believe.
    Any claim the lesson takes from the archive cites the primary source directly; if the archive
    marks it UNVERIFIED, the copy either verifies it independently or does not make it.

---

## The two-implementation rule

| Layer | Owner | How it is kept honest |
|---|---|---|
| The crowd, the robot, the world | **TypeScript only** | Property tests. There is no oracle and there should not be one |
| Divergences, estimators, calibration | **Python is the oracle** | `mirn fixtures` writes the answers; `web/engine/measure/__tests__/parity.test.ts` reproduces them |
| Paper figures, CSV export | **Python only** | Unchanged from the research era |

Tolerances are declared **in the fixture**, by the oracle author, so loosening one is a visible
diff in a committed file rather than an invisible edit in a test. A subject with no TypeScript
entry point is a failure, not a skip.

Three float traps, learned the hard way:

- **`Math.hypot` is banned in `web/engine/measure/`.** V8's is *more* accurate than numpy's naive
  `sqrt(sum(d*d))`, so it disagrees with the oracle in the last bits. Fine in `sim/`, a landmine in
  `measure/`.
- **numpy sums pairwise.** `web/engine/measure/kernels.ts` reimplements that rather than folding
  left, and the comment saying why must survive any tidy-up.
- **`np.quantile` defaults to `method="linear"` at index `(n-1)q`.** Reimplemented exactly; there
  are nine conventions and picking another silently shifts every floor on the site.

`bootstrap_ci` is the one place the two languages are **intentionally** not bit-comparable:
reproducing numpy's PCG64 would be a dependency on a numpy internal. It is checked by invariant.

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
- Metrics **may not do arithmetic**: they compose traced combinators so that a number and its
  explanation come from the same call and cannot drift. Fast numeric work lives in `kernels.ts`.

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
passes — which destroys the gate. The finding itself is taught on page 9 instead.

**Property tests** over the divergences: non-negativity, exactly zero on identical inputs, symmetry,
translation and rotation invariance, monotonicity under injected deviation. Note that bitwise
translation invariance holds only for integer coordinates; asserting it for arbitrary doubles is
asserting something false.

**Determinism tests** compare bytes, not approximations. `toBe(0)`, never `toBeCloseTo(0)` — the
shared-tape construction makes exactness available, and inexactness means the arms have drifted.

**Pedagogy is a functional requirement.** For a teaching product, "the demonstration is legible" is
behaviour, and a physics change that breaks it should fail a test rather than be noticed three
weeks later.

### Commands

Bare `python` is not on PATH; use `.venv/bin/python`.

```bash
npm run check                       # typecheck, vitest, notes build, vite build
.venv/bin/python -m pytest -q       # ~5 min; the Sinkhorn nulls dominate
.venv/bin/python -m ruff check src tests
.venv/bin/python -m mirn.cli fixtures --out tests/golden/parity   # after any formula change
npm run measure                     # re-measure the experiments; rewrites web/data/
```

Pre-commit: `npm run typecheck && npm run test && ruff check src tests` — under 20 seconds, so it
actually gets run. Full `npm run check` plus `pytest -q` before any push. **Never claim work is
complete without running it and showing the output.**

---

## Content

`web/notes/*.md` is the product. `web/data/experiment-facts.json` is the only permitted source of
numeric claims, and it is regenerated by `npm run measure`.

**No explanation paragraph may be written before its experiment has been run.** Prose asserting a
phenomenon the reader is watching not happen is the worst failure this site has. Four sim bugs and
two badly-posed measurements were found by running the experiments first; none would have been
caught by writing the copy first.

Voice: short declaratives, concrete nouns before abstract ones, a defined term introduced in one
plain sentence and then used. Self-limitation stated as flatly as the claims — "we have not found"
rather than "nobody has published". The recurring metaphor is **the ruler and the room**: the ruler
is real, the room is invented.

Never use the word *estimand*. Never write "Beat 1/2/3" in prose — that is a structure the author
can see and the reader cannot.

---

## Working style

- Prefer editing existing files to creating new ones. Do not create documentation files unless
  asked.
- When a claim needs a citation, fetch the primary source. Do not cite from memory.
- When something cannot be verified, write **UNVERIFIED** and move on.
- Surface disagreement early. The guardrails above exist because the obvious version of this
  project is worse than this one, and several of them were written after a measurement contradicted
  an assumption.
