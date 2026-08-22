# Design — the MIRN simulator console

**Date:** 2026-08-22
**Status:** approved in chat, pending spec review
**Supersedes:** the teaching notebook entirely. `docs/teaching/authoring.md` and every page it
governs are deleted by this design.
**Conventions authority:** `CLAUDE.md`, which this design rewrites in §8.

---

## 1. Decisions locked before design began

These came from the user and are not re-litigated below.

1. **The teaching notebook is deleted entirely.** One page.
2. The product is a **run-and-compare bench**: edit settings, press Run, each result lands in a
   kept list you can pin, diff and export as CSV; playback shows whichever run is selected.
3. **Six headline readouts plus a column picker** for everything else.
4. One press of Run executes **(N axis values x M seeds)**; a single run is the degenerate 1x1
   case of the same mechanism.
5. **Bare numbers, explanation on demand** — an expander per measurement, one standing
   invented-crowd line.
6. **Approach A**: extract, then build, then delete. Every intermediate commit green.
7. **Live preview, Run commits.** The arena and tiles show a live 1x1 preview of current settings;
   Run is what commits a result to the ledger and what buys seeds, sweeps and bands.
8. **Clearance is measured after both bodies have started moving**, with the rule stated on the
   tile. No simulator change.

---

## 2. What the project becomes, and what it stops being

MIRN becomes a **simulator console** for perturbation in robotics: set up an invented crowd, press
Run, and compare what different rulers say about what the robot did to it.

The operator is unchanged — a curious person with no robotics background, willing to press Run and
read carefully for twenty minutes. What changed is that they act instead of read.

That inversion has one consequence, and it is the spine of this document. The notebook carried its
explanation in seventeen pages, in a fixed order, before any number appeared. The console has no
order at all: every number is reachable in any state. So the explanation stops *preceding* the
number and starts *hanging off* it.

> **Every number on screen is one interaction from what it assumes and from what it would read if
> the answer were zero.**

That is not a weaker form of guardrails 1, 6 and 7. It is the same rule with the sequencing
removed, and it binds harder, because there is no longer a paragraph above the number doing the
work.

**It stops being** a teaching notebook. **It does not become** a robotics platform, a benchmark, a
dataset or a motion-planning framework — see the rewritten guardrail 11 in §8.

---

## 3. Architecture

### 3.1 Module map

| | |
|---|---|
| **Survives untouched** | all of `web/engine/` (sim, measure, contracts, rng, core); `web/ui/arena.ts`, `web/ui/theme.ts`, `web/app/clock.ts`; Python `src/mirn/`, `tests/`, and the parity fixtures |
| **Survives, gains new callers** | `web/ui/plot.ts` (currently called only by the doomed `notes.ts`) becomes the sweep-curve renderer; `web/ui/labels.ts` becomes the column-picker and CSV header source |
| **New** | `web/engine/job/`, `web/app/worker/`, `web/app/console/` |
| **Deleted** | `web/notes/` (17 md), `web/notes.ts`, `web/vocab.ts`, `web/build/` (5 modules + tests), `scripts/build-notes.ts`, `scripts/measure-experiments.ts`, `web/generated/`, `web/hero.ts`, `web/instrument.html`, `web/data/experiment-facts.json`, `web/app/__tests__/landing.test.ts`, `web/app/__tests__/render.test.ts` — about 6,100 lines — plus the `markdown-it`, `gray-matter`, `js-yaml`, `katex` and `jsdom` dependencies |

```
web/engine/job/
  spec.ts      SweepJob, MeasurementParams, FloorParams, makeSweepJob, configForCell, seedFor
  axes.ts      AXES - the closed axis catalogue; applyWorldAxis / applyMeasurementAxis
  columns.ts   COLUMNS - the closed measurement catalogue: extractor + label + unit + zero + assumption
  report.ts    ReportContext, buildContext, runReport, perAgentDeviationByUid, pedestrianTimeLost
  stats.ts     Aggregate, aggregate() - imports NOTHING from measure/
  plan.ts      WorkPlan, Unit, planSweep
  runner.ts    sweepUnits generator, accumulator
  __tests__/

web/app/worker/
  protocol.ts      ToWorker | FromWorker unions. No logic, no measure/ imports.
  sweep.worker.ts  the postMessage shell and the slice pump. No arithmetic.
  client.ts        main-thread wrapper: start / onProgress / cancel / recomputeForPlayback

web/app/console/
  state.ts     ConsoleState, ConsoleSettings, makeConsoleSettings
  panel.ts     the control panel, generated from AXES
  table.ts     the kept-results ledger and the column picker
  permalink.ts URL encode/decode
  csv.ts       export
```

The split is load-bearing. `web/engine/job/` lands inside the existing `engine` vitest project,
which runs `environment: "node"` with `Math.random` throwing, so a job file that reaches for
`document` or draws an unseeded random fails at import rather than at review. `web/app/worker/` is
the only place that touches worker globals and is forbidden from importing `web/engine/measure/`.

### 3.2 Two decisions that shape everything

**The Worker returns numbers only, never trajectories.** A 72-run sweep of paths is about 33 MB.
Per-seed readings are about 90 KB. Selecting a row for playback rebuilds that run's config and
re-simulates it (38 ms at 18 pedestrians). Guardrail 4's determinism is what makes the
substitution legal, so a test asserts the rebuild is bitwise rather than assuming it.

**The run-to-run band is computed per axis value, not once.** Crowd size genuinely moves the band
(0.172 m at 4 people to 0.462 m at 44), so a single band drawn across a people-sweep is a false
floor.

---

## 4. The job contract, axis catalogue and Worker boundary

### 4.1 `SweepJob`

A frozen record of numbers, strings, booleans and `RunConfigOverrides` — verified
`structuredClone`-safe. No functions, no `Map`, no class.

```ts
export interface SweepJob {
  readonly kind: "sweepJob";
  readonly base: RunConfigOverrides;
  /** null is the degenerate 1x1 case. */
  readonly axis: AxisKey | null;
  readonly axisValues: readonly number[];
  /** Explicit list, never a count. The denominator is read off this and recomputed nowhere. */
  readonly seedIndices: readonly number[];
  readonly baseSeed: number;      // 20260816
  readonly seedStride: number;    // 7919
  readonly measurement: MeasurementParams;
  readonly columns: readonly ColumnKey[];
  readonly bandReplicates: { readonly n: number; readonly scope: "perSeed" | "perCell" } | null;
  readonly floor: FloorParams | null;
  readonly zeroReferenceRun: boolean;
  readonly frechet: boolean;
}
```

`MeasurementParams.forecastEndStep` is **required and never defaulted**. Verified: `cvmResidual`
with no `endStep` reads exactly `0` on this simulator, because by the last tick everyone has
arrived and parked and a constant-velocity forecast of a stationary person is exactly right. A
defaulted field turns the console's second headline into a permanent zero.

`bandReplicates.scope` exists because `scripts/measure-experiments.ts` averages eight per-seed
six-replicate bands, while the console wants one per-cell eight-replicate band. They differ by 6%
(0.29304 vs 0.31059), which is enough to fail commit 1's byte-identical gate. Commit 1 sets
`{ n: 6, scope: "perSeed" }`; the console defaults to `{ n: 8, scope: "perCell" }`. The replicate
count rides on the cell and into the CSV so a 4-replicate band is never compared with an 8.

### 4.2 The axis catalogue, and the function-across-the-Worker problem

One frozen table is the single source of truth for the control-panel sliders **and** the sweep-axis
picker, so the two cannot drift. Each entry carries `key`, `label`, `unit`, `min`, `max`, `step`,
`defaultValue`, `note`, `writes` (the dotted config paths it sets) and `movesColumns` (the
readouts it was measured to move).

`apply` is a function, and functions throw `DataCloneError` across `postMessage`. Solution:

> **The job carries the axis key. The Worker looks the entry up in its own copy of the table.**

Both sides import `web/engine/job/axes.ts` from the same bundle, so `AXES[job.axis]` on the worker
side is the same object literal the slider was built from. There is one table and no serialisation
of behaviour. The same trick carries the column extractors and the permutation source
(`permutationSeed` crosses; `seededPermutations(seed)` is rebuilt on the far side).

Axes split by `kind`:

- `worldAxis` re-simulates. `apply(base, value) => RunConfigOverrides`.
- `measurementAxis` does not. `apply(params, value) => MeasurementParams`.

The discriminant is not an optimisation; it is a correctness statement the product already makes.
`web/main.ts:231` carries the comment that the horizon "changes only how the forecaster is applied
to an existing run, not the run itself. Re-simulating here would be wrong as well as slow: the
point is that the robot has not changed." A measurement-axis sweep of N values over M seeds costs
M simulations, not N x M.

**v1 world axes** are the ones that are genuine `RunConfig` fields: `pushStrength`
(`robot.repulsionScale`), `crowdSize`, `holdingLine` (`crowd.relaxationTimeS`), `crowdFidget`
(`crowd.noiseAmplitude`), `walkingPace`, `robotSpeed`, `reactionTime`, `politeness`
(`robot.deflectionWeight`), `perceptionError`, `passingOffset`, `episodeSeconds`. **v1 measurement
axes**: `forecastHorizon`, `forecastWindowEnd`.

`passingOffset` writes **two** config fields (`robot.startXY` and `robot.goalXY`) — which is why
`writes` exists as data and why a test diffs the produced config against it. Exposing four raw
coordinates instead is the fastest route to a goal outside the room.

### 4.3 Why a closed catalogue is not a registry

`CLAUDE.md` warns that the next agent will "fix" a table back into branches, so the argument is
written into the conventions section:

> **A closed catalogue is not a registry.** `axes.ts` and `columns.ts` are frozen object literals
> with no registration function and nothing added at runtime. They are tables so that a *test* can
> iterate them and prove the set is total — which is the opposite of an extension point.

- No `register()`, no runtime insertion. `AXES` is `Readonly<Record<AxisKey, AxisEntry>>` over a
  **literal union**, so an unknown key is a compile error.
- The compiler checks exhaustiveness: adding a member to `AxisKey` without an entry is a type error.
- The repo already has this exact shape and has never called it a registry —
  `web/engine/measure/divergence/index.ts:156` is a frozen table of records with function members.
- It is a table for **co-location**, not extensibility: a switch puts `apply` in one file and the
  label, unit and range in another, and those drift.
- **The line to hold:** if an entry ever grows an id supplied from outside, a `registerAxis` export,
  or a way to build an axis from a config path string, guardrail 11 has been violated.

### 4.4 Validation happens before the first simulation

`makeSweepJob` loops every cell x seed and calls `configForCell`, letting `makeRunConfig`'s
`ContractError` escape wrapped with the cell named. Config construction is microseconds; a 20x8
grid validates in under a millisecond. The alternative is discovering an illegal axis value forty
seconds into a sweep, which teaches the operator that Run means "wait, then lose it".

`makeRunConfig` gains the six checks it is missing, in commit 2: `widthM > 0`, `heightM > 0`,
`desiredSpeed > 0`, `relaxationTimeS > 0`, and `startXY`/`goalXY` inside the room. Without them a
room narrower than 20 m puts the robot's goal outside the wall, where it pins and the arrival
heuristic reports a journey that never completed.

---

## 5. The measurement report layer

### 5.1 One descriptor per column

`CLAUDE.md` records the failure this solves: "a panel has already once explained a different
quantity from the one printed above it, and it compiled." The notebook's answer was a hand-written
derivation builder in `web/notes.ts`, which is being deleted, and the console has no prose — so the
wording has nowhere left to live except beside the number.

Each `ColumnDescriptor` carries `extract`, `label`, `unit`, `group`, `needs`, `needsAnchor`, `zero`
and `assumption` in the same object literal. Changing a formula without changing its words becomes
a one-hunk diff you have to look at.

**This is a guarantee that the diff is visible, not that the words are right.** That sentence goes
in the file header so the next agent does not believe the build checks it.

### 5.2 Availability is three-valued

```ts
export type Availability =
  | { readonly kind: "measured" }
  | { readonly kind: "censored"; readonly why: string }
  | { readonly kind: "notApplicable"; readonly why: string };
```

A single NaN channel cannot express this. Three causes are live: a genuinely censored measurement
(recovery that never came inside tolerance); a quantity that does not exist under this design
(extra path, when the control arm has no robot); and `clearance()` returning
`nearMissEpisodes: 0` with no robot — a finite zero that averages happily as a real reading. The
reason is set where the number is produced, never inferred downstream.

`value` is NaN if and only if `availability.kind !== "measured"`, asserted by `columns.test.ts`.

### 5.3 The six headlines

| # | Readout | Zero-reference |
|---|---|---|
| 1 | How far the crowd was moved (`paired`) | exact zero: switch off "people notice the robot" and it reads 0.000 |
| 2 | What a forecaster would report (`cvmResidual`) | the zero-effect reference run **at this cell's own settings** |
| 3 | Ordinary difference between two runs (`replicateBand`) | it *is* the zero line; labelled as such |
| 4 | Worst moment (`deviation.maxM`) | the peak statistic's own null, not the band (see below) |
| 5 | The robot's crossing: distance and time to goal | the 16.90 m geometric floor |
| 6 | Closest approach, measured after both bodies move | 0 means outlines just touch |

Three corrections the review forced:

- **Headline 5 as briefed does not exist.** Verified: under the default robot-presence treatment
  `extraPathM`, `controlPathM`, `timeLostS` and `controlArrivalS` are all NaN with
  `censored: true`; only `treatedPathM` (17.78 m) and `treatedArrivalS` (17.2 s) are real, because
  the control arm has no robot to difference against. So headline 5 is the robot's **own** crossing
  against the geometric floor: start and goal are 18.00 m apart and it stops within 1.1 m, so an
  empty room needs at least 16.90 m. That is a bound and the tile says so. The differences move
  into the picker, gated on treatment kind, rendering as "not applicable" with the reason.
- **`paired(pair).value` and `deviation(pair).meanM` are the same double.** Verified `===`, both
  `0.35157013372697155`. The console must not headline both under two names. `trueEffectM` goes
  through `paired()` because that is what carries the identification sentence the expander needs.
- **The band is the wrong null for headline 4.** `replicateBand` is mean-over-steps; `deviation.maxM`
  is max-over-steps, and max >= mean for any series by construction. So each column declares its
  statistic (`meanOverSteps` | `maxOverSteps` | `perAgent` | `pathScalar`) and its zero-reference
  must declare the same one, asserted by `columns.test.ts`. `replicateBand` is generalised to
  return the pairwise peak alongside the pairwise mean — it already computes every replicate pair.

### 5.4 Cheap columns are always computed

Measured: all six cheap composers together are ~3.4 ms against a 38 ms `runPair`. So `job.columns`
controls what is **reported**, not what is **computed**, and the picker hides rather than gates.
Only three get a checkbox with its marginal cost printed beside it: `replicateBand` (267 ms at 8
replicates, 18 people; 738 ms at 44), `splitHalfNull`, and Frechet (~117 ms, O(T^2) per agent).

### 5.5 The identification string cannot be a verbatim passthrough

`PAIRED_IDENTIFICATION` opens "Both runs share a seed, a starting state and an exogenous noise
draw, and differ only in whether the robot is there." Under `treatment: { kind: "disturbance" }` the
robot is in **both** arms and the sentence is false; under `{ kind: "none" }` it is false again. The
only test on either string asserts `.length > 40`.

So `assumption` is a function of the context and switches on `ctx.config.treatment.kind`, returning
the estimator's own words only where they are true. This keeps commit 2 out of
`web/engine/measure/`. Parameterising `paired()` itself is better long-term and gets its own commit.

### 5.6 Per-agent values are keyed by uid, never by position

`deviation().perAgentM` is ordered by **string-sorted agent id**; `ArmResult.positions` is ordered
by **uid**. They agree to 10 pedestrians and diverge from 11. See §11 for the live defect this
already caused. `report.ts` exposes `perAgentDeviationByUid(pair, dev): ReadonlyMap<number, number>`
and nothing joins the two arrays positionally.

The legitimate positional join — `treated.positions[i]` against `control.positions[i]`, both
uid-ordered — stays, with a comment saying why it is the only one.

---

## 6. The console page

### 6.1 Visual language

The existing language is defended rather than replaced: cream paper `#fdfcfa`, ink `#111`, a
three-step grey ramp, and exactly one accent `#c2410c` whose token is named `perturbation` so it
cannot be spent on a button. Hairlines, no borders on content, no shadows, no radii.

"All squares and rectangles" is refused by putting four non-rectangular elements on the page:

1. **The arena** — curved trails, round bodies, accent gap-lines. Largest area on the page.
2. **The band gauge** — under every perturbation tile: a hairline scale from 0, a filled wedge
   covering the run-to-run band, one tick at the value. A one-dimensional ruler, not a box, and it
   discharges guardrails 6 and 7 in one glyph.
3. **The sweep curve** — dots, dashes, a shaded floor region.
4. **The progress rule** — a 1 px hairline filling left to right. Not a bar with a radius.

**The Run button is the only inverted element on the page.** One solid mass tells the eye where the
verb is.

The ledger is set as a well-typeset financial table: `tabular-nums`, hairline row rules, a heavier
rule under the header, no cell borders, no zebra striping. Selection is a 2 px accent rule on the
row's left edge; a pin is a filled disc against a hollow one — the same glyph pair `notes.ts`
already used for treated and control, so the ledger and the arena share one vocabulary.

### 6.2 Layout

```
  A BENCH FOR ONE QUESTION
  How much did the robot move the crowd?
  Everything on this page is simulated. The crowd is a social-force model - invented people
  obeying invented rules - and no number here is a measurement of real pedestrians. What is
  real is the ruler: the same room is run twice, once with a robot and once without, from the
  same starting positions and the same random wobble, and the difference between a person's
  two paths is the robot's effect on them.
 --------------------------------------------------------------------------------------------

  STAGE                                                    |  SETTINGS
   Simulated crowd. Every number below comes from a model. |   THE ROOM
  +-------------------------------------------------+     |    People            18
  |        .  .       ,------.                      |     |    How stubbornly    0.50
  |     .       . \  /        \     .                |     |    people hold their line
  |   .   ####### >  robot     \  .    .             |     |    Room width        22 m
  |      .   /   \    '----'    \                    |     |    How fast people   1.34
  |    . ===/==   ===\========== .   (accent gaps)   |     |    Random wobble     1.10
  +-------------------------------------------------+     |
   > Pause  |-------o----------|  t 8.4 s                  |   THE ROBOT
     typical gap 0.31 m  widest 1.04 m  seed 1 of 8  < >   |    How much space    1.0
     -- with the robot  .. without it  # the robot         |    Speed             1.10
     == the robot's effect on this person                  |    Reaction time     0.15
  ---------------------------------------------------     |    Mis-sees people   0.00
   TRUE EFFECT     WHAT A FORECASTER   ORDINARY DIFF       |    How wide a berth  0.00
                   WOULD REPORT        BETWEEN TWO RUNS    |    [x] People notice the robot
   0.352 m         0.334 m             0.311 m             |
   |---#####--|--^---|   |--#####-|------^--|  8 reps      |   THE RULER
   half a stride       half a stride    half a stride      |    Forecast horizon  3.00 s
   reads 0.000 m       reads 0.334 m    28 comparisons     |    Measured at       10.0 s
   when nobody         when the honest  of robot-free      |    Band replicates   8
   responds            answer is zero   runs, 95th pct     |    Near-miss line    0.50 m
   > show the working  > show the ...   > show the ...     |
                                                          |   ONE PRESS OF RUN
   THE ROBOT'S     CLOSEST APPROACH   WORST MOMENT         |    Vary  [how many people v]
   CROSSING        (after both move)                       |    Values 4 8 12 18 24 32 44
   17.78 m 17.2 s  0.31 m at 6.2 s   0.761 m at 10.5 s     |    Seeds  [8 v]
   straight line   0 means outlines  |-####|------^-|      |    [x] run-to-run band  +2.4 s
   is 16.90 m      just touch        reads 0.000 m when    |    [ ] detection floor  +1.5 s
                   2 near misses     nobody responds       |    [ ] Frechet ruler    +4.9 s
                   at 0.5 m                                |    [x] zero-effect reference
  ---------------------------------------------------     |
   SWEEP CURVE (only when the selected group has an axis)  |     ##############
   metres                                                  |     #    RUN     #  <- only
    0.60 |                              *=======*          |     ##############    inverted
         |                    *========/                   |    56 runs - about 6 s
    0.40 |         *=========/                             |
         |  *=====/    ...........................         |
    0.20 |:::::::::::::::::::::::::::::::::::::::          |
    0.00 +---+----+----+----+----+----+----+------          |
          4   8   12   18   24   32   44                    |
                  how many people are in the room           |
   == true effect   .. what a forecaster reports            |
   :: ordinary difference between two runs of this room     |
 --------------------------------------------------------------------------------------------

  KEPT RESULTS   [ Columns v ] [ Compare two ] [ Export CSV v ] [ Copy link ] [ Clear ]
  The link carries the settings, not the results. Pressing Run reproduces them exactly.

  (o) | zero reference - nobody notices the robot   18  1/1  0.000  0.334  0.311  ...
  ( ) | people sweep - 4 people                      4  8/8  0.153  0.201  0.172  ...
  ( ) | people sweep - 18 people      <- selected   18  8/8  0.352  0.286  0.311  ...
  ( ) | people sweep - 44 people                    44  8/8  0.383    -    0.512  ...
```

Rules, not boxes, separate every region.

### 6.3 Live preview, Run commits

Editing a setting re-simulates the 1x1 preview (38 ms at 18 people) and repaints the arena and the
tiles. That is what keeps guardrail 3 true at the moment of turning. **Run** is what commits a
result to the ledger and what buys seeds, sweeps, bands and floors.

The band cannot be live at 267 ms. During a preview its gauge reads **"not yet measured — press
Run"** rather than showing a stale floor. A perturbation tile whose zero-reference is unmeasured
shows the value greyed with the gauge empty; it never shows a value against a floor from different
settings.

Above 44 people the preview debounces to the trailing edge of the drag rather than every input
event, and the panel says so.

### 6.4 State, and whether the ledger survives a reload

**It does not.** Three reasons, in order of weight:

1. Guardrail 10 names the network but means storage. `localStorage`, `sessionStorage` and
   `IndexedDB` are exactly the loophole a reviewer reads as compliant. The rewrite names them.
2. Encoding results in the URL would forge them. A link carrying `true_effect=0.352` asserts a
   number the current code did not produce; change a formula and the old link quotes the old answer
   with the new page's authority.
3. Determinism makes the recipe sufficient. The URL carries the **recipe**, and reloading a
   permalink shows an empty ledger with a primed Run reading "Run — reproduces the sweep in this
   link · about 6 s". That is the site's central promise made operational.

Mitigation: Export CSV sits in the ledger bar, not an overflow menu.

### 6.5 The ledger

**A ledger row is a cell; the addressable unit underneath it is a run.** A cell is one axis value
aggregated over that cell's seeds, and it is what the operator reads and compares. But a cell has
no seed, so it cannot be rebuilt — and playback, pinning and the recompute trick all need
something that can. So the stored unit is a **run**, keyed `{ axisId, axisValue, seedIndex }`, and
a cell is a pure function of the runs sharing an axis value, aggregated at render time. Selecting
a row selects a cell; the transport's `seed 1 of 8` control chooses which run inside it plays.

A `status` that is derived is a `status` nobody can persist wrongly.

The worker returns **per-seed readings, not aggregates** (about 90 KB for 56 runs x 25
metrics). The aggregate is computed on the main thread by the same `aggregate()` the worker would
have used — one implementation, which kills the "table disagrees with the CSV" class of bug and
makes a per-seed CSV export free.

A mean never exists without its count: `Aggregate` carries `value`, `sd` (NaN below two survivors —
a 0 there would read as "no spread"), `nUsed`, `nAttempted` and a reason. Censored and
not-applicable render as their reason, never as a number and never blank. A bound renders as
`> 40.0 s`.

Every readout prints the setting it was measured at — `0.286 m · forecast horizon 3.00 s` — and
when any panel setting differs from the selected row's recorded settings, the ledger greys and one
line appears above it: "these numbers were measured at the settings in the link, not the ones now
in the panel."

### 6.6 CSV and permalink

The CSV opens with the invented-crowd disclosure, then the full provenance block: generation time,
row semantics, axis, axis values, seed derivation, treatment, forecast horizon and evaluation step,
band replicates and scope, floor parameters, completeness (`n of m cells`), and a legend for the
censored and not-applicable markers.

The permalink carries settings only. Unknown keys are ignored with a notice rather than throwing;
out-of-range values clamp with a notice. `makeConsoleSettings` is where UI clamps become contract
checks, because a hand-edited query string is the last line of defence.

---

## 7. Honest labelling on a page with no prose

**Guardrail 1.** The disclosure sits above the arena and above the readouts **in document order**
in the static HTML, asserted with `indexOf` against the file on disk — not against the booted DOM,
because a script could reorder it. The CSV carries it in its own first line, because a file
outlives the page it came from and a spreadsheet has no standing line. That is a surface the
guardrail has never covered.

**Guardrail 6.** The zero reading is structurally inseparable from the value: the tile component's
props are `(reading, zeroRendering)` where the zero is a rendered value plus phrase, not optional
and not collapsible. A zero-reference inside a closed `<details>` is not shown. The expander
carries only the derivation. A DOM test asserts every element carrying a number has a visible
sibling carrying its zero, and that no `<details>` wraps it.

The zero-effect reference is measured **per axis value**, not once: the forecaster's zero reading
moves from 0.0191 m at 4 people to 0.0585 m at 44, a 3.5x spread. Quoting one cell's zero beside
another cell's number is the same error already caught for the band.

**Guardrail 7.** Every metres column declares `needsAnchor` or a zero that gives scale. On a
72-row table a body-scale phrase per cell is absurd, so the anchor appears on the tiles and in the
column header, once.

**No numeric literal appears in console copy.** Every zero line, band figure and caption renders
from the cell actually on screen, in the `main.ts:134` idiom the project already uses. A test
asserts no tile string contains a literal metre value.

**The default forecast horizon is 60 steps (3.00 s), not 16.** Measured at the current default of
16, the forecaster reads 0.0262 m on a robot-blind run against a band of 0.3106 m — twelve times
below the noise floor, so the console would ship with its central argument refuted by its own
default state. At 60 steps the forecaster reports **0.334 m on a run whose true effect is exactly
zero**, and 0.286 m on a run whose true effect is 0.352 m: its number is essentially unrelated to
the truth, which is a sharper demonstration than the notebook's.

---

## 8. The rewritten guardrails

Nothing is deleted outright. Ten reword, three are rewritten (3, 11, 12), three are untouched
(5, 8, 13).

The identity sections are replaced: MIRN is a simulator console; the operator acts instead of
reads; the `intuition -> visualization -> measurement -> mathematics -> interpretation` shape is a
page ordering and there are no pages. It is replaced by the one sentence that survives its loss —
every number is one interaction from its assumption and its zero — because that is what guardrails
1, 6 and 7 now rest on.

**Guardrail 3 (rewrite).** The knobs are one closed table and each entry names, as data, the
measurement it moves. The build checks four mechanical shadows: every axis's `apply` produces a
legal `RunConfig` at both ends and every step between; every axis moves its declared measurement by
more than the band measured at the same settings; the console shows an axis's declared measurement
whenever that axis is on screen; every axis and column has a plain-English name and a unit.

The second is the check `lintComparatives` could never make — it only measured how close a
comparative word sat to a number. It immediately catches a violation already shipped:
`instrument.html` puts a reaction-time slider directly above a True-effect tile, and reaction time
is flat on true effect (0.290 to 0.269, inside seed noise) while moving minimum clearance
monotonically (-0.134 to -0.402 m). None of the four knows whether an expander's wording is *true*,
and three axes are measurably non-monotone, so reading the console at both ends of every dial is
still the author's job.

**Guardrail 11 (rewrite).** The operative half — "which page does this make clearer?" — stops
working when there are no pages, and it was the half that did the refusing. The line is not "do not
be a simulator"; it is between **this toy, measured well** and **robots, characterised**. No ROS,
no planner benchmark, no dataset loader, no trained model, no physics-engine dependency, no second
simulator backend, no leaderboard, no bring-your-own-method import path. The CSV is an export, never
an input format — the moment something else can be read in and scored, this is a benchmark and the
numbers start being about someone else's robot. A run list with pinning, diffing, a sweep and an
export is precisely the shape of a benchmark harness, and a column picker is an extension point
wearing a checkbox, so the columns are a closed table with no user-defined column and no formula
field. New refusal test: **"which readout does this move, and what does that readout say when the
answer is zero?"** — no answer, no feature. It folds guardrail 6 into the admission criterion, so a
feature cannot enter without bringing its own zero.

**Guardrail 12 (rewrite).** Half genuinely dies: `web/vocab.ts`, the `introduces`/`uses` front
matter, `checkVocabulary` and `lintForwardTerms` all go, because with one page there is no order to
fix. What survives becomes the whole rule: no bare code identifier on any surface a reader sees,
and every term defined in plain English at first use. Its only mechanical enforcement anywhere in
the repo is the identifier regex in `web/app/__tests__/render.test.ts:187`, **which is in a file
scheduled for deletion**, so it is re-homed onto the catalogues in commit 2, before commit 3
removes the original. Pointed at the catalogue rather than a rendered DOM, it also covers a column
nobody ticked.

---

## 9. Test strategy

### New

| File | Asserts |
|---|---|
| `job/__tests__/spec.test.ts` | every `makeSweepJob` validation throws `ContractError` with a plain-English message; the whole grid validates before any simulation |
| `job/__tests__/determinism.test.ts` | same job, byte-identical results (`toBe`, never `toBeCloseTo`); and a run rebuilt from its key is **bitwise** the run the worker measured |
| `job/__tests__/axes.test.ts` | `apply` legal at min, max and every step; each axis moves its declared column by more than the band at those settings; `apply` writes exactly the fields in `writes`; labels and units present and identifier-free. Marked `slow` |
| `job/__tests__/columns.test.ts` | descriptor self-consistency; NaN iff not measured; `needs` honesty with band/floor/zeroRun/frechet all null; guardrail 6 two-sided; guardrail 7; the statistic of a column and of its zero-reference match; identifier regex over labels, zeros and assumptions across all three treatment kinds |
| `job/__tests__/report.golden.json` | `{key, value, availability.kind}` for every column at one fixed config and seed |
| `job/__tests__/uidOrder.test.ts` | at >= 14 pedestrians, `byUid.get(2)` is ped2's value **and** `perAgentM[2]` is ped10's. Pinning only the correct value would stay green if someone reverted the join in a crowd of 8 |
| `job/__tests__/stats.test.ts` | censoring and survivorship: sd is NaN below two survivors; `nUsed` vs `nAttempted`; all-censored and not-applicable propagate as reasons |
| `app/worker/__tests__/clone.test.ts` | every job round-trips `structuredClone`; a job carrying a function fails loudly |
| `app/console/__tests__/permalink.test.ts` | encode/decode round-trip; unknown keys ignored with a notice; out-of-range clamps with a notice |
| `app/console/__tests__/disclosure.test.ts` | the invented-crowd line precedes every number in document order in the built HTML, by `indexOf` on the file; no `<details>` wraps a zero-reference; no tile string contains a literal metre value |
| `app/console/__tests__/csv.test.ts` | line 1 is the disclosure; the provenance block is complete; censored and not-applicable markers are legended |

### Untouched, and still gates

`web/engine/measure/__tests__/placebo.test.ts` and `tests/test_placebo.py` stay first-class gates.
The placebo test stays on the analytic fixture for the reason `CLAUDE.md` already records. The
parity fixtures in `tests/golden/parity/` are untouched because **nothing in this design enters
`web/engine/measure/`** except the `replicateBand` peak-statistic addition, which is browser-only
and has no oracle. `web/engine/job/` must not acquire an oracle — guardrails 8 and 9 — and that
temptation is declined in writing.

### Commands after the pivot

```bash
npm run check                          # typecheck, vitest, vite build (no notes step)
npm run test -- --project engine       # the fast loop
.venv/bin/python -m pytest -q -m "not slow"
.venv/bin/python -m ruff check src tests
```

`npm run notes` and `npm run measure` are deleted. `vite.config.ts` loses `generatedPages()`.

---

## 10. The three commits

**Commit 1 — extract.** `web/engine/job/aggregate.ts` and `web/engine/job/sweep.ts` only: the
numeric helpers (`meanOf`, `sdOf`, `finiteCount`) plus
`runSweep(base, values, apply, measure, seeds)` returning `readonly RunRow[]`, where `apply` and
`measure` are passed in by the caller exactly as the script passes them today. Point
`scripts/measure-experiments.ts` at it and delete its duplicates. About 120 lines, about 8 tests.

**Acceptance gate:** `npm run measure && git diff --exit-code web/data/experiment-facts.json`.
Byte-identical output is what proves the extraction preserved behaviour, and that gate exists only
during commit 1. Before commit 3 deletes the script, the job module's behaviour is pinned with a
golden fixture derived from the current facts file.

The axis catalogue, column catalogue, permalink keys and reader-facing labels are **not** in commit
1 — their only commit-1 consumer would be their own tests.

**Commit 2 — build.** The console at **`web/console.html`**, added as a second entry in
`vite.config.ts`'s `rollupOptions.input`, touching neither `web/index.html` nor `.gitignore`.

This is not fussiness. `scripts/build-notes.ts:485` is `writeFileSync("web/index.html", …)`,
unconditional, and `package.json` wires `dev`, `build` and `check` as `npm run notes && …`. In
commit 2 the notes build still exists, so the first `npm run check` would regenerate `index.html`
and destroy the hand-written console — producing a green build of the wrong page. A test asserts
`web/console.html` is tracked by git so the clobber cannot come back.

Commit 2 also: the six missing `makeRunConfig` checks; the global `:focus-visible` rule (the
stylesheet's only one today is scoped to three notes-only selectors); re-homing the identifier
regex.

**Commit 3 — delete.** Remove the teaching layer, then `git mv web/console.html web/index.html`,
remove `web/index.html` and `web/generated/` from `.gitignore`, and only then point the
disclosure-ordering test at `web/index.html`.

---

## 11. Defects found during design

**A live defect in published numbers.** `deviation().perAgentM` is ordered by string-sorted agent
id; `ArmResult.positions` is ordered by uid. They agree to 10 pedestrians and diverge from 11:

```
n=10: 10/10 aligned    n=18:  2/18 aligned
n=11:  2/11 aligned    n=40:  2/40 aligned
```

`e5_propagation` runs at 40 pedestrians and joins them positionally, so 38 of 40 people per run are
binned by a stranger's closest approach.

| closest approach | published | corrected |
|---|---|---|
| 0-1 m | 0.4196 | 0.6010 |
| 1-2 m | 0.4045 | 0.4159 |
| 2-3 m | 0.3984 | 0.2824 |
| 3-4 m | 0.4993 | 0.2017 |
| 4-5 m | 0.3752 | 0.1372 |
| 5-7 m | 0.6186 | 0.1008 |

The page asks readers to predict one of three outcomes, then reports "the effect barely fades at
all" and flags the 3-4 m bump as "one point I cannot explain". Corrected, the curve decays cleanly
six-fold — the option the page rules out — and the anomaly is an artifact of the scramble. The
page's core claim survives in weakened form (the far bin is 0.101 m, not zero).

The scrambled code is in a file this design deletes. The **trap** is in the engine being kept,
hence §5.6 and `uidOrder.test.ts`.

`bystanderDeviation` in the same script is dead code and has no call site.

**Other defects, all fixed in commit 2:** `makeRunConfig` validates neither `widthM`, `heightM`,
`goalXY`, `desiredSpeed` nor `relaxationTimeS`; the arrival-time path-freeze heuristic reports a
robot moving at 2.26 m/s from a 1.1 m/s cap under `deflectionWeight: 3`, so `RobotState.arrivedTick`
(maintained exactly in `world.ts:71-76`, discarded at the `ArmResult` boundary) is surfaced instead;
minimum clearance is -0.550 m at step 0 under nine of eleven sliders because pedestrians spawn on
the robot's start position.

---

## 12. Risks, and what was deliberately cut

**Cut:** `forecastHorizon` and `forecastWindowEnd` were nearly cut as sweep axes because there is
no horizon field on `RunConfig`; they survive only because the `measurementAxis` discriminant makes
them a legal, cheaper path rather than a second mechanism. Cut outright: a user-defined column, a
formula field, any CSV import, a worker pool (a single worker is enough at ~10 s), `localStorage`
persistence, and a `beforeunload` guard.

**Risks:**

- Sweeps cost more than the 5-7 s first estimated. Measured: 72 runs is 4.8 s; a per-axis-value
  band roughly doubles it, so a 9-value x 8-seed sweep with the band on is about 10 s and the
  7-value sweep in the wireframe about 6 s. **Band replicates is an exposed control**, defaulting
  to 8, with its marginal cost shown beside the switch and updated as it changes — 267 ms per
  axis value at 8, 190 ms at 6. The count rides on the cell and into the CSV, so a 4-replicate
  band is never silently compared with an 8-replicate one.
- Co-location makes formula/wording drift *visible*, not impossible. Nothing checks the sentence is
  true.
- The axes test is 10-20 s and marked slow. The failure mode to name in its comment: reducing
  `nTicks` to speed it up makes a genuinely real axis move less than the band, it goes red for a
  good reason, and the natural repair is loosening the threshold — which is how the placebo gate
  would have been destroyed.
- Three axes are non-monotone over plausible ranges (walking pace peaks near 0.7 m/s, room height
  near 9 m, near-miss count goes 3, 3, 2, 3, 1 as its threshold widens). Any "more X gives more Y"
  sentence beside those is falsifiable by dragging.

---

## 13. Verified measurements

Everything quoted above was measured on this machine at `nTicks=800`, `dt=0.05`, default config
unless stated.

| Quantity | Value |
|---|---|
| `runPair` | 38 ms @18 people, 92 ms @44, 210 ms @80 |
| `replicateBand(8)` | 267 ms @18, 738 ms @44; `(6)` 190 ms @18 |
| `paired().value` | 0.35157013372697155, `===` `deviation().meanM` |
| `cvmResidual` no `endStep` | exactly 0 |
| `cvmResidual` h=16 / h=60 at step 200 | 0.0394 / 0.2855 |
| zero run (`pedestriansSeeRobot: false`) `paired()` | exactly 0 |
| zero run `cvmResidual` h=16 / h=60 | 0.0262 / 0.3341 |
| `replicateBand(8)` | 0.31059 |
| `clearance().minM` / `minAtStep` | -0.5501 / step 0 |
| `robotCost` under robot-presence | `extraPathM`, `controlPathM`, `timeLostS` all NaN, `censored: true` |
| `treatedPathM` / `treatedArrivalS` | 17.78 m / 17.2 s |
| straight line / geometric floor | 18.00 m / 16.90 m |
