# The second simulator backend, as a file — design

**Status:** approved for implementation, 2026-09-09.

## What changed above this document

Guardrail 11 refused eight things. On 2026-08-27 the owner lifted three — a bring-your-own-method
path, a comparison of several methods, and **a second simulator backend** — and separately narrowed a
fourth, the dataset loader, to permit a real pedestrian recording to be read in **for fitting and for
checking a fit, never for measurement**.

On 2026-09-09 the owner extended that fourth narrowing: **externally simulated trajectories may be
read in and measured.** This document specifies that path.

It is deliberately the smaller half of the lifted second-backend refusal. MIRN does not gain a second
crowd model, a second physics implementation, or a dependency on anybody's engine. It gains the
ability to **read the output of one** and run its existing rulers over it.

## Why the refusal that governs the fit page does not govern this one

Guardrail 11 forbids a real recording from ever producing a disturbance number, and the reason it
gives is arithmetic rather than caution:

> A corridor cannot be filmed twice. There is no second recording in which the same people, on the
> same day, in the same mood, walked past no robot. Real trajectories have exactly one arm, so the
> quantity this whole site is built to measure does not exist in them.

**That reasoning does not transfer.** A simulator can be run twice, from the same seed and the same
initial state, with one declared change. It has two arms. The quantity MIRN measures therefore exists
in its output, and every paired invariant in `web/engine/contracts/pairedRun.ts` keeps its meaning.

This is the whole justification, and it is why `web/engine/adapter/` is a **new** path rather than a
widening of `web/engine/fit/`. The fit module's narrowness is a guarantee asserted over its own
source by `fit-dom.test.ts`. Nothing here touches it, imports it, or relaxes it. A reader who
conflates the two will import a restriction that does not apply.

**And no physics-engine dependency is created.** MIRN parses numbers a different process wrote. It
does not link, import, install or execute an engine. Guardrail 11's retained refusals — ROS, a
planner benchmark, a trained model, a physics-engine dependency — are all untouched.

## Answering the spec that scoped this out

`2026-08-27-bring-your-own-ruler-design.md` scoped the second backend out and listed six hardwirings
as evidence. CLAUDE.md says to read that before assuming the lift was careless. Taken in order:

| Hardwiring it found | Where it stands now |
|---|---|
| `RunConfig` has no model selector; `SweepJob` cannot carry one | **Resolved by someone else.** `crowdModel: CrowdModelKey` and `CROWD_MODEL_ORDER` shipped with the second crowd kernel. |
| `"social-force model"` is a hardcoded disclosure clause asserted by `disclosure.test.ts` | **Resolved by someone else,** same day. The clause was narrowed to `"invented model of pedestrians"`, and `CROWD_MODEL_LINE` now names the producing kernel on anything carrying results. |
| `SIM_CONSTANTS` leaks `pedRadiusM` / `robotRadiusM` into `job/` | **This document fixes it.** They become `ReportContext.bodies`. |
| `Scene.source` is a literal `"sfm"` read by nothing in production | **This document uses it.** It becomes the backend identity it was always the hole for. |
| `cost.ts` prices Run with a quadratic fitted to the social-force step | **Out of scope, and stays out.** Nothing here adds a console control, so nothing re-prices the button. |
| `axes.slow.test.ts` requires every knob to be a real `RunConfig` leaf | **Out of scope, and stays out.** No new axis. An adapted run is not a knob. |

Four of six are gone. The two that remain are avoided by scope rather than solved, and the scope
boundary is stated in *What this does not build*, below. The earlier judgement was correct when it
was made; what changed is that two of its six obstacles were removed by unrelated work.

## The one decision everything else follows from

**The adapter reconciles; the contracts do not relax.**

`makePairedRun` asserts bit-identical starting positions, identical agent sets, identical `dt` and
identical lengths. Every one of those survives this document unchanged and untightened. Where a third
party cannot meet them exactly, the **adapter** is what closes the gap, in named functions with
stated tolerances, before it constructs anything.

The alternative — a second, laxer `PairedRun` constructor for adapted data — was considered and
rejected. It makes the strict guarantee conditional on which constructor a caller happened to use,
and the whole value of that assertion is that it admits no exceptions. Python's `RolloutPair` already
allows 1e-9 *specifically to accommodate third-party adapters*, and its comment says so; the browser
tightened it to bitwise on the ground that both arms came from one function. That ground is exactly
what an adapter removes, so the tolerance moves to the adapter rather than back into the contract.

## What is being decoupled, and why it is small

The report layer currently holds the simulator's config. It turns out to barely use it.

`ctx.config` is read in exactly three ways: `dt` (three call sites), `treatment.kind` (two, inside one
assumption string), and the robot's start and goal — which `buildContext` already reduces to the
separate `straightLineM` field. `treatment` is **already on `PairedRun`**, put there by `runPair` from
the same config value.

So three changes retire it:

1. `ReportContext.config: RunConfig` becomes `ReportContext.dt: number`.
2. `ReportContext.run: RunResult` becomes `run: MeasuredRun`, a new narrow record
   `{ pair, treated, control }`. `RunResult` is structurally assignable to it, so `runPair` and every
   existing caller change not at all.
3. `ReportContext.bodies: { robotRadiusM, pedRadiusM }` replaces the two `SIM_CONSTANTS` reads in
   `minClearanceM` and `nearMissEpisodes`.

`web/engine/job/report.ts` then imports no `RunConfig`. **No number moves.** The simulator path passes
`SIM_CONSTANTS.robotRadiusM` and `pedRadiusM`, which is what those columns read today, so every
existing test asserts the same value it asserted before. That is the check that this refactor is
behaviour-preserving, and it is why it is done as its own commit ahead of anything new.

### What is deliberately NOT added

The readiness audit proposed splitting `ColumnNeeds`' `"run"` into portable and non-portable cases.
**Dropped.** Once `dt` and `bodies` are inputs, the only genuinely un-adaptable column group is the
band, and `needs: "band"` already says so. A second flag would be an extension point, and the
TypeScript convention here is plain typed records and no invitations. The partition is instead
asserted by a test over an adapted fixture, which is a fact about behaviour rather than a field
somebody has to remember to set.

## The contract

### The format

One JSON document per **run set**, not per run. Pairing metadata cannot then be separated from the
data it describes, which is the failure mode of shipping loose per-run CSVs.

```jsonc
{
  "mirnTrajectoryFormat": 1,
  "scenario": {
    "scenarioId": "corridor-crossing",
    "widthM": 22.0, "heightM": 13.0,
    "dt": 0.05, "nSteps": 801
  },
  "provenance": {
    "producer": "omnisim", "producerVersion": "...",
    "simulator": "...", "crowdModel": "...", "build": "..."
  },
  "bodies": { "pedestrianRadiusM": 0.24, "robotRadiusM": 0.32 },
  "treatment": { "kind": "robot-presence" },
  "runs": [
    {
      "runId": "...", "role": "treated", "seed": 20260816, "robotPresent": true,
      "completion": { "outcome": "reachedGoal", "atSample": 512 },
      "robot":  { "positions": [2.0, 6.5, 2.05, 6.5, "..."] },
      "agents": [ { "id": "ped-0", "positions": [1.1, 3.4, "..."] } ]
    }
  ]
}
```

`completion.atSample` is a **sample index** — a position in the run's own recorded arrays — and not
a tick. The two are off by one: MIRN's simulator sets a tick after moving the robot on it, and the
position that motion produced lands in the *next* sample, so `arrivedTick = atSample - 1`. A
producer writes the index it has (where in its recorded path the robot is first at its goal) and the
adapter does the conversion, once, in `build.ts`. `completion` may be `null`, or omitted, for a run
that did not finish. `completion.outcome` is free text and nothing branches on it.

`positions` is flat `[x0,y0,x1,y1,…]`, matching `Trajectory.positions` exactly and halving the
document against a nested form. A row-oriented variant (`agent_id, frame, x, y`) is a second parser
over the same builder if OmniSim emits one; the deleted `PeroiAdapter` is the working sketch.

### The roles, which are the point

`role` is one of `treated`, `control`, `zeroTreated`, `zeroControl`, `replicate`.

The last three exist so **the format itself asks for the nulls**. Guardrail 6 forbids showing a
perturbation number without saying what it reads when the answer is zero, and for externally supplied
data the zero-reference and the run-to-run band are precisely what a single pair cannot carry. Making
them roles in the schema turns "can you also run the null conditions?" from a conversation into a
field that is either present or absent — and when absent, MIRN says `notApplicable` with the existing
`NO_BAND` and `NO_ZERO_RUN` strings rather than inventing a floor.

`replicate` runs are robot-absent and differ only in exogenous noise, matching what `replicateBand`
produces today.

### The version stamp

`mirnTrajectoryFormat: 1` is refused if it is anything else. A format that will be renegotiated on a
call needs a version before its first byte is written, not after the first disagreement.

## The four reconciliation policies

Each is a named function with its own test, because each is a decision somebody will later want to
find and argue with.

**Identity.** External ids are sorted, then mapped by position: index *n* becomes `agentUid = n` and
`agentId = "ext" + n`. Deterministic, charset-legal, and identical across both arms provided both
arms carry the same id set — which `makePairedRun` asserts anyway, so a mismatch fails there with a
message naming both sets. `ext` rather than `ped` because an adapted agent is not one of MIRN's, and
the prefix is the cheapest place to keep that visible. (`makeTrajectory` enforces only the charset;
the `ped{uid}` convention is not asserted anywhere, though `trajectory.ts`'s comment claims it is —
that comment is corrected in this work.)

**Initial positions.** Verified equal within `1e-9` — Python's stated third-party allowance — and then
**snapped**: the control arm's sample 0 is set to the treated arm's. `makePairedRun`'s bitwise check
then passes because the values genuinely are identical, not because it was loosened. The observed
maximum disagreement is returned on the adapter's result so a surface can report it. Outside the
tolerance it fails, naming both positions.

Snapping edits data, which deserves saying out loud: it is a documented reconciliation with a stated
bound and a reported residual, not a silent repair. The alternative was a laxer constructor, rejected
above.

**Lengths.** Unequal `nSteps` between arms is **rejected**, with both lengths in the message.
Truncating to the shorter would move every maximum-style metric — `worstMomentM`, `minClearanceM`,
`nearMissEpisodes` — by an amount nobody could see. A real simulator will hit this, and when it does
the fix belongs in the scenario or in an agreed truncation policy, not in a quiet default.

**Completion.** `completion.atSample`, minus one, becomes `ArmResult.arrivedTick`; absent or
non-arriving becomes
`-1`, which `arrivalSecondsOf` already turns into `NaN` and `robotArrivalS` already renders as
`censored`. No new machinery: the honest rendering for "this run did not finish" already exists.

## Guardrail 1 gains a third kind of number

Guardrail 1 keeps two kinds apart today: readings about MIRN's invented crowd, which carry
`INVENTED_CROWD_DISCLOSURE`, and goodness-of-fit figures with real people on one side, which carry the
three-clause `FIT_DISCLOSURE`.

An adapted reading is **neither**. Reusing the invented-crowd sentence would be almost right and wrong
in the direction that matters: it says *invented*, which is true, but it implies MIRN invented it and
therefore knows what it is. It does not. It has not characterised the physics, cannot reproduce it,
and has run no property test against it.

So `EXTERNAL_CROWD_DISCLOSURE` carries three clauses, asserted individually by content the way
`fitVerdict.test.ts` asserts the fit page's:

1. the crowd is simulated, by a simulator MIRN did not write;
2. MIRN has not characterised its physics and cannot vouch for it;
3. a number here is a fact about **that simulator**, not about robots and not about people.

The third is the load-bearing one, for the reason guardrail 1 already gives about calibration: a
reader shown output from a real robotics simulator is exactly the reader most likely to over-believe
the next number. A toy that looks like an instrument is the hazard, and an external engine looks far
more like an instrument than a social-force sketch does.

`Scene.source` carries the producer, and `CROWD_MODEL_LINE`'s existing arrangement — anything carrying
results names the model that produced them — is the precedent this follows rather than a new
invention.

## The gate

A committed fixture, `web/engine/adapter/__tests__/fixtures/`, holding a treated/control pair and a
`zeroTreated`/`zeroControl` pair, generated from MIRN's own simulator so the expected answers are
known independently.

**The zero pair must read exactly `0`.** Not `toBeCloseTo`. The socially-invisible world has a true
effect of exactly nothing, and the paired estimator over two arms that differ nowhere returns exactly
nothing; any other value means the ingestion mis-mapped an identity, desynchronised a timestep, or
lost precision in serialisation. The real pair must read non-zero, so the gate cannot be passed by an
adapter that returns zero for everything.

This is the same shape as `placebo.test.ts`: an analytic case where the answer is known, used as a
gate rather than as a measurement. **Nothing proceeds past it red.**

## What this does not build

Named so the boundary is a decision rather than an omission:

- **No sixth page.** `disclosure.test.ts` reads the page list from the Vite input map and requires
  every page to link every other; a new page is a change to five files' navigation and belongs with a
  decision about where adapted results are read. `EXTERNAL_CROWD_DISCLOSURE` ships as a tested
  constant and as line one of adapted CSV.
- **No console control, no axis, no preset, no permalink field.** An adapted run is not a knob.
  `cost.ts`'s social-force pricing is therefore not touched.
- **No second crowd model, no engine dependency, no scenario emitter.** MIRN reads; it does not drive.
- **No Python adapter.** Guardrail 9 keeps the shared surface small, and a parser in two languages is
  two things to keep in step for no oracle benefit. If a formula later lands in both, guardrail 8
  attaches and it gets a fixture.
- **No band from a config for adapted runs.** `replicateBand(config, n)` is split into simulating and
  `bandFrom(paths)`; adapted data reaches the second only, and only when `replicate` runs are present.

## Guardrails this touches

- **1** — extended, and this is the substantive change. A third kind of number, with its own
  three-clause disclosure and its own content-asserting test.
- **2** — untouched and doing more work than before. A crowd simulated by somebody else is still not a
  real crowd; a metric that fails on it has failed on a simulation.
- **3, 12** — no new axis and no new column, so the closed catalogues are unchanged. Every new
  reader-facing string passes the identifier regex.
- **4, 5** — strengthened rather than threatened. The adapter is held to the same assertions, and the
  gate is a determinism test in the `toBe(0)` form the codebase requires.
- **6** — the reason the null roles exist in the schema. A reading whose zero was not supplied says so.
- **8** — not engaged. Nothing here exists in both languages.
- **9** — respected. `web/engine/measure/` gains nothing; the adapter lives outside it.
- **10** — respected absolutely. A file the reader opens, via `FileReader`, exactly as `web/fit.ts`
  already does. No network, no storage, and no trajectory in a permalink.
- **11** — this document is the thing it now permits.

## The honest limitation

A disturbance number measured on adapted trajectories is a fact about the simulator that produced
them. It says nothing about real crowds, nothing about effect sizes for real robots, and nothing
about which published method is better — guardrail 11 still refuses a planner benchmark, and a
comparison that reads as a leaderboard is the failure mode.

What it does buy is the thing the bring-your-own-ruler spec named as its own strongest limitation:
that a method shown not to fail *here* was only ever shown not to fail on one invented crowd under
one simulator. A second, independently written world does not remove that bound. It moves it, by
exactly one world, and the honest sentence remains that the bound is real.
