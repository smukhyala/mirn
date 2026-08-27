# Bring your own ruler — design

**Status:** approved for implementation.

## What changed above this document

Guardrail 11 refused eight things. On 2026-08-27 the owner lifted three: a **bring-your-own-method
path**, a **comparison of several methods**, and a **second simulator backend**. The five nobody
lifted — ROS, a planner benchmark, a dataset loader, a trained model, a physics-engine dependency —
still stand, and nothing here approaches them.

This document specifies the first two and **scopes the third out**, with evidence, in the last
section. The reader's own *ruler* is opened. The reader's own *crowd* is not.

## The one decision everything else follows from

**A supplied method never sees the run without the robot.**

It receives what a corridor gives you: one run, the people's paths, the robot's path. Nothing else.

This is not a safety measure. It is the whole product. The site's claim is that a method which
cannot see the counterfactual must guess it, and that the guess is confounded. A supplied method
handed both arms could subtract them and return the exact truth, and every number reported about it
would then describe our harness rather than their ruler. "What does this read when the answer is
exactly nothing" only means something if the method is in the position a corridor puts it in.

**It is proved, not asserted.** `web/engine/job/__tests__/unpaired.test.ts` already establishes the
technique: swap the control arm for a decoy from an unrelated seed and fail anything that notices.
The supplied harness gets the same treatment — a supplied function is run against a real pair and
against a pair whose control arm is a decoy, and if its reading moves, the harness leaked the
control arm. That is a build error, not a review note.

## A supplied method is not a fifth family, and this is not a naming quibble

`FamilyKey` is a closed union of four and `web/engine/job/__tests__/families.test.ts:39-42` asserts
`FAMILY_ORDER` equals `Object.keys(FAMILIES)` and has length four. Widening it would break that
test, and the repair would be to loosen the assertion — which is how a closed table stops being one.

More importantly it would be false. A **family** is a *shape* that the five closed questions map a
described method onto; it exists so that a description can be answered at all. A **supplied method**
is a specific function whose behaviour is unknown until it runs. Calling it a family would put a
thing with no declared ruler into a table whose entire purpose is to declare rulers.

So: the four families are untouched, `FAMILY_ORDER` stays four, and the supplied path gets parallel
types. `aggregateProbe` already reads only `family.key` and `family.unit` off its first argument, so
its arithmetic core is extracted and shared rather than copied.

## The contract

### What the reader writes

The body of a function. One argument, returns a number in metres.

```
web/engine/job/supplied.ts

export interface SuppliedRun {
  readonly kind: "suppliedRun";
  readonly people: readonly SuppliedPath[];
  readonly robot: SuppliedPath | null;
  readonly dt: number;
  readonly nSteps: number;
}

export interface SuppliedPath {
  readonly kind: "suppliedPath";
  /** Flat [x0,y0,x1,y1,...], length 2 * nSteps. A COPY — see below. */
  readonly positions: Float64Array;
  readonly nSteps: number;
}
```

**The arrays are copies, and that is load-bearing.** `web/engine/contracts/trajectory.ts:17` records
that JS cannot freeze a TypedArray's contents, and `ArmResult.positions` wraps the *same buffers*
the Scene's trajectories wrap (`web/engine/sim/run.ts:13`). A supplied function handed the live
buffers could mutate the arms mid-probe and silently corrupt every subsequent seed. It gets copies.

`agentId` is deliberately **not** passed. It encodes uid ordering the measurement layer depends on,
and a corridor does not hand you stable person identifiers across runs.

### How the code crosses the worker boundary

**As a string, compiled inside the worker.** Functions throw `DataCloneError` at `postMessage` —
already proved by `web/app/worker/__tests__/probe.test.ts`, which plants a function member and
asserts the error name. The existing probe protocol solves this for families by sending a *key* and
looking the entry up worker-side; a supplied method has no key, so the source travels and is
compiled at the far end.

No `Blob`, no `URL.createObjectURL`. The worker stays a normal module worker constructed from the
pinned URL literal that `probe.test.ts:181` and `client.test.ts:178` assert verbatim.

## What the sandbox is, and what it is not

**What it gets:** no DOM. A wall-clock limit enforced by the *client* calling `worker.terminate()` —
a runaway function cannot be interrupted from inside the worker, so the timeout has to live outside
it. Output validation: `makeReading` already throws `ContractError` on a non-finite measured value
(`web/engine/job/columns.ts:68`), and a supplied method returning `NaN`, an infinity, a string or
nothing is reported as a failed method rather than rendered as a reading.

**What it is not:** a jail. A Worker still has `fetch`. Deleting globals before the supplied code
runs raises the cost of an accident and does not stop a determined function, and claiming otherwise
would be exactly the kind of overstatement this project exists to refuse.

**Why that is acceptable here, and the reasoning is the load-bearing part:** the permalink never
carries code. There is no server, no storage, and no link that can carry a method body, so the only
function you can ever run is one you typed into the page yourself. The sandbox protects you from
your own mistake. What protects you from an attacker is that an attacker has no delivery route.

**If a future change gives a link, a file, or a stored session the ability to carry a method body,
that reasoning collapses and the sandbox becomes the only thing standing.** That is the line, and
this document is not permission to cross it. Guardrail 10 now says so too.

A test enforces the boundary: `eval`, `new Function`, `Blob` and `createObjectURL` may appear in the
sandbox module and nowhere else under `web/`. `nostorage.test.ts` scans for storage and network APIs
today and does not scan for these — it gains a sibling that does.

## Nondeterminism is a finding, not noise

Every supplied method runs **twice per seed on identical input**, and the two results are compared
bitwise. If they differ, the method is nondeterministic and the page says so, instead of averaging
the difference away and reporting a mean of two different quantities.

Guardrail 4 makes determinism a property of this bench. A supplied method that lacks it is answering
a different question every time it is asked, and a reader deserves that stated rather than smoothed.

## What the reader leaves with

The method card's existing three-figure shape, unchanged in form:

1. **What your method reads where the true effect is exactly nothing** — not nearly nothing. The
   crowd is told not to react (`ZERO_EFFECT`), both arms are driven by the same forces from the same
   tape, and the paired estimator returns a hard zero on every seed.
2. **The run-to-run band** — how far two runs of the same room drift apart on their own.
3. **On how many of eight rooms it cleared that band while the truth sat beneath it** — a false
   positive rate.

Plus two a described method cannot produce: **whether it was deterministic**, and **whether it
failed**, with the failure in the method's own words rather than a substituted apology.

## The comparison, and the sentence that keeps it honest

The built-in rulers plus whatever the reader supplied, on the same eight rooms, same seeds.

**Ordered by false positives at zero, and never called a ranking of methods.** Guardrail 2 is
unamended and does the work guardrail 11 used to do here. What this establishes is which ruler is
confounded *on this invented crowd*. It does not establish which method wins in a corridor, which
published method is wrong, or that a method with no false positives here is sound. A counterexample
refutes a universal; a clean sheet refutes nothing.

That has to appear where the reader meets the ordering, not in a footnote — the same rule the method
card follows for its approximation. **If the ordering cannot be shown without reading as a
leaderboard of published work, it does not ship as an ordering.**

## The test that has to change, and how narrowly

`web/app/console/__tests__/method-dom.test.ts:289` — "offers no free text, no upload and no place to
paste code" — scans `web/method.html` for `<textarea`, `type="file"`, `type="text"` and
`contenteditable`. Its comment says "Guardrail 11 in one assertion".

It encodes the refusal that was lifted, so it changes. **It does not get deleted.** It gets scoped:
the *questionnaire* still offers no free text, no upload and no place to paste code, asserted over
the questions region rather than the whole document. The supplied-method surface is a separate
region, marked as such, and the test asserts the two do not overlap — the closed questionnaire stays
closed, and the one seam that exists is the one that is meant to.

Deleting the assertion would leave nothing saying where the line now is, which is worse than the
line having moved.

## The second simulator backend — scoped out, with evidence

It was lifted and it is not specified here, because measuring the seam first showed it is a
different size of job from the other two. Hardwiring found:

- `web/engine/sim/run.ts:102` sets `source: "sfm"` as a literal, and `Scene.source` is read by
  nothing in production — the only existing hole where a backend identity could live.
- `RunConfig` mixes social-force parameters (`crowd.relaxationTimeS`, `robot.repulsionScale`) flat
  alongside world parameters, with no model selector, and `SweepJob` has no model field — so nothing
  selectable can reach the worker.
- `SIM_CONSTANTS` leaks `pedRadiusM`, `robotRadiusM` and `goalReachedM` into `job/`, `measure/` and
  the UI.
- `web/app/console/cost.ts:21` prices Run with a quadratic fitted to the social-force step
  specifically, so a backend of different complexity mis-prices the button.
- `"social-force model"` is a hardcoded clause of the invented-crowd disclosure on all four pages
  and in the CSV, and `disclosure.test.ts:104` asserts that exact literal — so guardrail 1's
  disclosure becomes false the moment a second model can run.
- `axes.slow.test.ts` requires every knob to be a real `RunConfig` leaf and to move a `ColumnKey`
  from the existing closed table.

That is an architecture change touching contracts, the job layer, the UI, and guardrail 1's copy on
every surface. Specifying it from here would be guessing at an interface before anything has been
measured through it. **It gets its own spec, after this one ships**, and the honest reason to do it
in that order is that a supplied ruler measured on one crowd is still worth having, whereas a second
crowd with no way to point a reader's own ruler at it is not.

## Guardrails this touches

- **1** — untouched. The disclosure still precedes every number and still says the crowd is invented.
- **2** — untouched and doing more work than before: it is what stops the comparison being a
  leaderboard.
- **4** — extended rather than weakened. A supplied method's nondeterminism is detected and reported.
- **6, 7** — every figure keeps its zero and its scale, in the shape the method card already uses.
- **10** — a link may name a built-in method by key and may never carry a function body.
- **11** — this document is the thing it now permits, built to the constraints it now names.
- **12** — no bare identifier reaches a reader; the supplied surface is prose like every other.

## The honest limitation

A method that passes this battery has not been shown to be sound. It has been shown not to fail
*here*, on one invented crowd, at eight seeds, under one simulator. The zero-effect world is real
and exactly zero, which makes a failure meaningful; a clean sheet is bounded by everything the toy
does not model. The second backend exists as a lifted refusal precisely because that bound is real,
and until it ships this limitation is the strongest sentence on the page.
