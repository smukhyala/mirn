# CLAUDE.md — working agreement for MIRN

MIRN is a **simulator console** for perturbation in robotics. This file is the operational
contract, and it is the only one — `docs/teaching/authoring.md` governed the notebook's ordered
pages, and there is no ordering left to govern.

Where this file says "there are no pages", it means the seventeen-page fixed reading order, which
is gone. Five HTML documents ship: `web/index.html` (the console), `web/how.html` (the arithmetic,
in sentences), `web/drill.html` (the referee drill), `web/method.html` (the method card) and
`web/fit.html` (the fit page). None of them is a step in a sequence — each is reachable at any time
from any of the others, and none has to be read before the console shows a number.

**`web/fit.html` is apart from the other four in one way that matters.** Every other page shows
numbers about an invented crowd. That one puts a real recording of real people on one side of a
comparison, so guardrail 1's second kind of number lives there and only there. It renders no
disturbance figure and cannot compute one — `fit-dom.test.ts` asserts that over its source, not its
DOM, because the guarantee has to survive whatever the page later renders.

That last promise is now a test rather than a sentence. It was a sentence for three pages and one
feature was enough to make it false: the method card shipped linked from the console and to the
console, and neither the drill nor the working page knew it existed. `disclosure.test.ts` reads the
page list from the Vite input map and asserts every page links every other, so a fifth page fails
it rather than quietly not being in it.

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
`intuition → visualization → measurement → mathematics → interpretation` shape was a page ordering,
and the ordering is gone — the two documents beside the console are places a reader chooses to go,
not steps they are marched through. It is replaced by the one sentence that survives its loss,
because that is what guardrails 1, 6 and 7 now rest on:

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

   **There is now a second kind of number, and this guardrail is about keeping the two apart.**
   Guardrail 11 was amended on 2026-08-27 to let a real pedestrian recording be read in, for fitting
   the crowd and for checking the fit, and `web/fit.html` is where that was built. A reading off the simulator is still a number about an
   invented crowd and still carries the sentence above. A goodness-of-fit figure is not: it has real
   people on one side of it, and reusing the invented-crowd disclosure over it would be false in the
   one direction that matters — it would understate what the number touches.

   A surface showing a fit says three things instead: the recording is real, the crowd being
   compared against it is still invented, and a close fit is not permission to read this bench's
   disturbance numbers as measurements of anybody. Those three are `FIT_DISCLOSURE` in
   `web/app/console/fitVerdict.ts`, rendered above every figure on that page, and
   `fitVerdict.test.ts` asserts each clause by its content rather than counting three paragraphs. The third clause is the load-bearing one. The
   whole hazard of calibration is that it makes a toy feel like an instrument, and a reader who has
   just been shown that the invented crowd walks like a real one is exactly the reader most likely
   to believe the next number they see.

2. **Never teach a conclusion the toy cannot support.** The crowd is invented, under either of
   the two kernels this bench runs, and fitting one to a real recording does not stop it being
   invented — it makes it an invented crowd that resembles one recording, in the respects that were
   fitted, on the day it was filmed. It can
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

   **One case has a phrase and no value, and it is the drill's card.** There, the zero of a shown
   number is itself the answer the reader is about to be asked for — the forecaster's report has a
   `companionColumn` zero, and that companion needs the run without the robot. Computing it and
   hiding it would be a value on the page one edit from a leak; quoting the value would hand over
   the answer. So the tile renders the zero slot as a sentence naming which run is missing and
   saying that this is the position a real corridor leaves you in, with no figure in it. Three
   conditions, all mechanical, and the exception exists only where all three hold: it is
   **derived**, from `corridorReadable` on the companion column via `zeroIsWithheld` in
   `web/drill.ts` and never from a named column; it goes through a **separately named** function,
   `withheldZeroRendering`, so `zeroRenderingFor`'s throw-on-unresolved guard is untouched and a
   caller has to ask for the withheld form on purpose; and the number it sits under still carries a
   **body-scale anchor** and a gauge, so guardrail 7 is discharged by something other than the zero.
   The sentence is not inside a `<details>`, like every other zero. Outside those three conditions
   this clause does not apply, and a tile with a bare number is still a build error.

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

    **And it carries no executable code.** Guardrail 11 opened a supplied-method path; a permalink
    that could carry a supplied method would turn a shareable link into a shareable exploit, on a
    static origin with no server to put it behind. A link may name a built-in method by key. It may
    not carry a function body, and a test asserts that rather than a comment claiming it.

    This one used to be enforced by two prose comments, which is the position the `Math.hypot` ban
    was in before somebody wrote a test.
    `web/app/console/__tests__/nostorage.test.ts` now greps every `.ts`, `.html` and `.css` file
    under `web/` for the storage and network APIs, with the same canary and meta-test
    `hypot.test.ts` carries. `history.replaceState` is the one allowed exception and is asserted
    present rather than absent, because it is how the permalink reaches the address bar.

11. **The line has moved, deliberately, and this records where it went.** This guardrail used to
    refuse eight things outright, and three of those refusals are lifted by owner's decision on
    2026-08-27: a **bring-your-own-method path**, a **comparison of several methods against each
    other**, and a **second simulator backend**. The reasoning that justified refusing them is not
    erased — it is in this file's history and in
    `docs/superpowers/specs/2026-08-25-method-card-design.md`, which argued at length that the
    method card did not cross a line that no longer exists. Read those before assuming the lift was
    careless.

    **What is still refused, because nobody lifted it:** no ROS, no planner benchmark, no trained
    model, no physics-engine dependency.

    **Real pedestrian trajectories may now be read in, for one purpose, and that purpose is not
    measurement.** Owner's decision, 2026-08-27. Both crowds here are calibrated against nothing,
    which is the single largest thing standing between this bench and an instrument: it can say a
    metric is confounded, and it cannot say by how much, because the crowd it says it about was
    tuned to look plausible and fitted to no observation at all. Real data is how that is closed.

    **It may be used to FIT the crowd, and to CHECK the fit. It may never produce a disturbance
    number.** That is not caution, it is arithmetic, and guardrail 5 is the reason. Every number
    this bench reports is a paired difference: the same room, run twice, once with the robot and
    once without, from the same starting positions and the same wobble. **A corridor cannot be
    filmed twice.** There is no second recording in which the same people, on the same day, in the
    same mood, walked past no robot. Real trajectories have exactly one arm, so the quantity this
    whole site is built to measure does not exist in them, and any number claiming otherwise would
    be the confound this project exists to teach against — dressed up in real data, which makes it
    worse rather than better.

    So a recording may answer "does the invented crowd move like this one" and may never answer
    "how much did the robot move this crowd". The first is a statement about a model; only the
    second needs a counterfactual.

    **What that costs elsewhere, stated so it is not discovered later:**

    - **Guardrail 1 gains a second kind of number and must keep them apart.** A reading off the
      simulator is a number about an invented crowd and says so. A goodness-of-fit figure has real
      people on one side of it, and a surface showing one must say *that* — that the recording is
      real, that the crowd being compared to it is still invented, and that a good fit is not a
      licence to read the simulator's disturbance numbers as measurements of anybody. The existing
      disclosure is not adequate to a fit statistic, and reusing it there would be the first lie.
    - **Guardrail 2 is unmoved and does more work.** A crowd fitted to a real recording is a crowd
      that resembles that recording, in the respects that were fitted, on the day it was filmed. It
      is not a real crowd, and a metric that fails on it has still only failed here.
    - **Guardrail 8 is engaged the moment a fitting routine exists in both languages.** A fit is a
      formula. If Python fits and TypeScript fits, they get a parity fixture like every other
      shared formula, or the two quietly disagree about what "calibrated" means.

    **The data is somebody's movements, and that is a constraint rather than a nicety.** No
    recording is committed to this repository and none is shipped with the site. A file a reader
    opens is read in their own browser, stays there, and reaches no server, which guardrail 10
    already guarantees by having no server to reach. Nothing on any surface may make an individual
    identifiable — no per-person trace held up as an example, no identifier from a source file
    carried onto a page. Fitted parameters are an aggregate and may be shown; the paths they were
    fitted to are not.

    **What replaces the blanket ban, now that code can be read in.** A supplied method is data until
    it runs, and then it is code on this origin:

    - It runs in a **Worker with no DOM**, and nothing it returns is trusted without validation.
      A number that comes back `NaN`, infinite or non-finite is a failed method, reported as one,
      never rendered as a reading.
    - **It never enters the permalink.** Guardrail 10 says a link carries the recipe and never the
      results; it now also says a link never carries executable code. A shareable link that runs a
      stranger's function in your browser is a shareable exploit, and this project has no server to
      put it behind. The link may name a *built-in* method; it may not carry a supplied one.
    - **A supplied method is never reported as a fact about robots.** Guardrail 2 is unamended and
      does the work the old refusal used to do: the crowd is still invented, so a comparison
      establishes which ruler is confounded *on this toy*, and never which method wins in a
      corridor. A ranking that reads as a leaderboard of published methods is the failure mode, and
      the wording has to refuse it where the reader meets it.

    The refusal test is unchanged and now carries more weight, not less: **"which readout does this
    move, and what does that readout say when the answer is zero?"** — no answer, no feature. It
    folds guardrail 6 into the admission criterion, so a feature cannot enter without bringing its
    own zero. A user-supplied method has to answer it too, which is the point: the site measures
    what a supplied ruler reads on a world whose true effect is exactly nothing, and that is the
    number worth having.

12. **No bare code identifier on any surface a reader sees, and every term defined in plain English
    at first use.** Half of this guardrail genuinely died: `web/vocab.ts`, the `introduces`/`uses`
    front matter, `checkVocabulary` and `lintForwardTerms` all go, because with no reading order
    there is no first use to police — a term's first use is wherever the reader happened to start.
    What survives is the whole rule. Its mechanical enforcement is the identifier regex, and it now
    lives in exactly one place: `web/testing/identifiers.ts`, which exports two patterns and a
    paragraph saying why two and not one. `CODE_IDENTIFIER_OR_SYNTAX` goes over the closed
    catalogues — `COLUMNS`, `AXES`, `cards.ts`, `families.ts`, `questions.ts` — and bans a bracket
    and a fat arrow as well, because a catalogue entry has no business containing either. Pointed at
    the catalogue rather than a rendered DOM, it also covers a column nobody ticked.
    `CODE_IDENTIFIER` goes over everything rendered, where prose legitimately parenthesises:
    `panel.test.ts` over the whole booted panel's text, `permalink.test.ts` over every sentence a
    hand-edited link can produce, `how.test.ts` and `method-dom.test.ts` over their pages' prose,
    `csv.test.ts` over the export, and `drill-dom.test.ts` over the booted drill and every branch of
    its verdict. Because a term can now be met on any of four documents, each one that uses a
    defined term glosses it where it uses it, rather than relying on the reader having been
    somewhere else first.

    **It was written out by hand in twenty places before it was hoisted, and had drifted into three
    different expressions** — so the guardrail was being enforced at three different strengths
    depending on which file you landed in. Reconciling them made the two weaker forms stronger and
    neither weaker; every surface was checked against the stronger pattern first and none of them
    had anything to fix. `web/testing/identifiers.test.ts` now asserts things ABOUT the patterns
    rather than only WITH them, including that neither carries a `g` flag, whose `lastIndex` would
    make one suite's answer depend on which suite ran before it. One known hole is pinned open and
    documented rather than quietly widened: a digit before the first capital, as in `arm2Reading`,
    is not matched. Widening it is a behaviour change across every call site and belongs in its own
    commit, where a new failure means a real leak rather than noise from a refactor.

13. **`docs/archive/` is read-only.** Never delete or soften an `UNVERIFIED` marker in it, never
    cite it as current, and never quietly update a claim in it to match something we now believe.
    Any claim the lesson takes from the archive cites the primary source directly; if the archive
    marks it UNVERIFIED, the copy either verifies it independently or does not make it.

**A note on the referee drill**, since it is the first feature built after these guardrails and is
worth checking against them rather than assumed to comply. `web/engine/job/cards.ts`'s eight cards
are a closed table, like `COLUMNS` and `AXES` — no `register`, nothing added at runtime, and
`cards.slow.test.ts` measures every one of them against the real engine rather than trusting a
hand-written label. The safety property the drill depends on — that no number needing the run
without the robot reaches a card before the call — is not a list of allowed columns checked by eye;
it is `corridorReadable` on each column descriptor, and that flag is proved rather than asserted:
`web/engine/job/__tests__/unpaired.test.ts` swaps the control arm for a decoy from an unrelated
crowd and fails any column claiming to need no control run that notices the swap. And guardrail 11
did not have to be amended for the drill: it scores a reader's call against what the room did, never
a robot's performance and never a rival method's. That was written when guardrail 11 refused a
benchmark shape outright. Guardrail 11 has since been rewritten and the refusal narrowed, so the
sentence survives as a fact about the drill rather than as a boundary the drill was tested against.

**A note on the method card**, which is the second feature built after these guardrails and the one
that came nearest guardrail 11's line as it then stood — it takes a description of somebody else's
metric and scores it. That line has since moved and a supplied method may now be run directly; what
follows describes the closed-questionnaire design as built, which remains the safest path and stays
the default. The argument that this is not a bring-your-own-method import path is in
`docs/superpowers/specs/2026-08-25-method-card-design.md`, and a design document is not the
contract, so the three facts it rests on are recorded here. **Nothing is read in, and that is
mechanical rather than intended:** the reader answers five closed multiple-choice questions and
`method-dom.test.ts` asserts the booted page carries no textarea, no file input and no text field.
No file is uploaded, no function is evaluated, no dataset is loaded, there is no leaderboard, and
MIRN runs its own estimator on its own worlds. **The question table is closed**, like `COLUMNS`,
`AXES` and `cards.ts` — no `register`, nothing added at runtime — and `questions.test.ts` walks the
whole 288-answer cross-product a reader can give rather than an option at a time, because three of
the five questions decide nothing and an option-by-option check would have passed this table having
checked nothing. **The family that compares nothing is not scored as a detector.** An absolute
quantity reads about eighteen metres against a line measured in centimetres and clears it every
time, and clearing it says nothing whatever about the robot; printing a count beside a
forecaster's would invite exactly the comparison this console exists to teach against. Which shape
a family renders in is read off its own ruler rather than off its name, so a fifth absolute family
gets the right treatment without anybody remembering.

If a future change lets a user's own code or data reach the engine, that is the line, and neither
that spec nor this note is permission to cross it.

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
  extension point is an invitation, and guardrail 11 used to decline every one. It now declines all
  but the one it names, so this convention holds everywhere except the supplied-method seam, which is
  an extension point on purpose and is the only one. Four divergences still do not need a registry.
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
npm run check                            # typecheck, vitest, vite build
npm run test                             # 1160 tests across 85 files
npx vitest run --exclude '**/*.slow.test.ts'   # 1118 of them
.venv/bin/python -m pytest -q            # 298 tests, ~6 min; one calibration test is 132 s of it
.venv/bin/python -m pytest -q -m "not slow"   # 275 of them, minus the heavy nulls
.venv/bin/python -m ruff check src tests
.venv/bin/python -m mirn.cli fixtures --out tests/golden/parity   # after any formula change
```

**The counts travel and the seconds do not, so the seconds have moved out of the block.** The
counts above are facts about the tree. The timings below were re-measured when the method card made
the old ones wrong, and they were re-measured on a *different* machine — a cloud container, not the
one that wrote the originals — so they are recorded with that said rather than written in under a
sentence claiming otherwise. Read them as shape, not as a target to hit:

| | Measured | Where |
|---|---|---|
| `npm run test`, 1098 tests | 92.3 s at 1090 tests | cloud container, 2026-08-27, after the sweep landed |
| the `.slow.test.ts` cut, 1062 tests | 28.4 s at 1054 tests | same |
| `npm run test`, 1060 tests | 45.5 s and 45.0 s | same day, before the sweep |
| the cut, 1029 tests | 27.2 s and 27.3 s | same |
| `npm run test`, back when it was 773 tests | 42.8 s | cloud container, 2026-08-26 |
| the cut, back when it was 742 tests | 35.1 s | same |
| `pytest -q -m "not slow"`, 275 tests | 35.0 s | same |
| `npm run test`, back when it was 652 tests | 22 s | the author's own machine |

The pre-sweep rows carry two samples each, taken back to back, and they agree to within half a
second — which is worth knowing given the paragraph below says these figures once varied by 70%
between repeats on one machine. The rows above them are single samples taken the same way. Every
row is kept rather than replaced, because the whole use of this table is watching a number that
several commits in a row were confident about turn out to be temporary.

Two of the original figures used to be wrong by a plausible-looking margin, which is the failure
mode this paragraph exists to name: a timing nobody re-ran is a claim, and the whole point of a
documented fast loop is that its cost is small enough to be worth it. That is also why the row
above is kept rather than deleted — two machines disagreeing by 70% is the reason a single number
here was never worth trusting.

**There is no `--project engine` fast loop, and naming one was the mistake.** Cutting the suite by
project cuts along the wrong seam: the three slowest files sit in both projects, and the engine
project alone still carries two of them. Cutting by `.slow.test.ts` is the cut worth making, and it
is what the third line above does. The seven it drops are `axes.slow.test.ts` (guardrail 3's
every-axis-moves-its-readout check), `cards.slow.test.ts` (what each of the drill's eight cards
actually does, measured), `drill-verdict.slow.test.ts` (the whole drill driven card by card),
`familyProbe.slow.test.ts` (what each method family reads on a world whose answer is exactly
nothing), `method-run.slow.test.ts` (the method card driven end to end at the shipped settings) and
`powerCurve.slow.test.ts` (the same families read on six worlds instead of one, which is why it
alone is most of a minute) and `search.slow.test.ts` (the crowd fitted to a recording, forty-two
candidates at a time). All seven re-run the simulator many times over, which is why they cost what
they cost and why none of them can be made fast. So it is a working loop and not the gate.

**The value of the cut has now moved three times, in both directions, and the third move happened
between two commits on one afternoon.** It once dropped 19 tests to save 9 seconds of 22. On the
method card's commit it dropped 31 to save about 8 of 43, and this file said so and predicted the
next feature would shrink it further. That prediction was wrong: it went back up to about 18 of 45.
Then the sweep landed one slow file, and the cut now drops 36 tests to save about 64 seconds of 92 —
the largest saving it has ever been, because that single file is most of a minute on its own.

So the line to take is not any number about the cut. It is that a documented saving is a measurement
with a shelf life, that the shelf life can be one commit, and that a prediction about it written
into this file has already been wrong once. Re-run it before quoting it.

The fast pytest loop is real: the tests that dominate the runtime carry `@pytest.mark.slow`, and
`pyproject.toml` records the measurement the cut-off came from. It skips the divergence property
tests and the calibration suite, so it is also a loop and not a gate. `tests/test_placebo.py` is
deliberately not marked and runs in both.

Pre-commit: `npm run typecheck && npm run test && .venv/bin/python -m ruff check src tests`. Its
timing is not quoted, for the reason the table above gives twice over. Timings here never survived
being run back to back — three consecutive repeats of this line once measured 38, 44 and 63 seconds
on the same commit with nothing else running — and they do not survive changing machines either, so
any single number is a floor and not an expectation. Full `npm run check` plus
`.venv/bin/python -m pytest -q` before any push.
**Never claim work is complete without running it and showing the output.**

---

## Content

**Five reader-facing surfaces, and what governs each.** This section used to open "there is no
prose file", which was true of the console alone and stopped being true the moment a second page
shipped. The rule it was protecting survives whole; what changed is that it now has to be said five
times.

| Surface | Who writes the words | What holds them honest |
|---|---|---|
| The console's tiles, columns and controls | The catalogues alone — a `label`, a `zero`, an `assumption` or a `note` on an entry in `web/engine/job/columns.ts` or `web/engine/job/axes.ts`. Both are closed | `columns.test.ts` and `axes.slow.test.ts` run the identifier regex over the catalogue itself, so a column nobody ticked is covered too. `tile.test.ts` renders every column and fails on a numeric literal |
| `web/how.html` | Hand-written prose, ~1,000 lines of it, the one place the arithmetic is set out in sentences | `web/app/how.test.ts`: the identifier regex over its visible text, and a scan that fails on any measured value in the file. It states formulas and never results, so nothing in it can go stale against a physics change |
| The drill's own strings in `web/drill.ts` — `CALL_CLAUSE`, `HONEST_CLAUSE`, `WITHHELD_ZERO_HOW`, the reveal's sentences and `verdictLines` | Hand-written, because they describe a reader's call rather than a measurement, and no catalogue entry has anywhere to put them | `drill-dom.test.ts` runs the identifier regex over the booted page and over every branch of `verdictLines`; the reveal quotes no number the tiles above it are not also showing; `COUNT_WORDS` means no sentence carries a digit for something the catalogue decides |
| The method card's own strings in `web/app/console/method.ts` — `REFUSAL`, `READING_LABEL`, `READING_ZERO_HOW`, `BAND_LABEL`, `BAND_ZERO_HOW`, `RATE_LABEL`, `RATE_NOTE`, `RATE_ZERO_HOW`, `NON_DETECTION_LABEL`, `NON_DETECTION_NOTE` — plus `suppliedVerdict.ts`'s and `powerVerdict.ts`'s own sets, and the hand-written prose in `web/method.html` | Hand-written, and for the drill's reason: they describe a question somebody arrived with rather than a measurement, so no catalogue entry has anywhere to put them | One scan per surface, and the surfaces have grown to five. `questions.test.ts` runs the identifier regex over the closed question table. `method.test.ts` runs it, and the numeric-literal scan, over every leaf of every family's rendered verdict, with a count guard and a meta-test each. `suppliedVerdict.test.ts` runs both over every branch a reader's own method can end in, including the two constant ones. `powerVerdict.test.ts` runs the identifier regex over both shapes of swept curve, with a count guard. `method-dom.test.ts` runs it over `web/method.html`'s own prose, the way `how.test.ts` does for the working page |

| The fit page's own strings in `web/app/console/fitVerdict.ts` — `FIT_DISCLOSURE`, `FIT_REFUSAL`, the two notes saying whether a recording decides a setting — plus the hand-written prose in `web/fit.html` | Hand-written, and this is the surface where that matters most: it is the only one with real people on one side of its number, so guardrail 1's ordinary disclosure is not merely absent from it, it would be **wrong** on it | `fitVerdict.test.ts` asserts each of the three required clauses by its content, asserts they render above every figure in document order, and runs the identifier regex over both shapes of verdict with a count guard. `fit-dom.test.ts` runs it over `web/fit.html`'s prose, and asserts over the page's SOURCE that it imports nothing that could compute a disturbance number |

Everything below applies to all five. A hand-written surface is not a licence to write a number
into a sentence, to name a variable at a reader, or to say something that has not been measured.

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
