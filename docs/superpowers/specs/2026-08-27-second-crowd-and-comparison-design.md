# A second crowd, and a comparison — design

**Status:** approved for implementation.

Completes the 2026-08-27 lift. The bring-your-own-method path shipped in `670280b`; this is the
other two refusals guardrail 11 gave up — **a comparison of several methods** and **a second
simulator backend**.

## Part one: the comparison

Every ruler the bench can run, on the same rooms, at the same seeds, in one table: the four
described families, plus the reader's own method when they have supplied one.

**Ordered by false positives at zero, and never called a ranking of methods.** Guardrail 2 is
unamended and is what does the refusing now that guardrail 11 does not. What the table establishes
is which ruler is confounded *on this invented crowd*. It does not establish which method wins in a
corridor, which published method is wrong, or that a ruler with no false positives here is sound.

The failure mode is a table that reads like a leaderboard of published work. Two things prevent it,
both mechanical rather than editorial:

- the column is **"rooms where it cleared the line while the truth was nothing"** — a count of
  mistakes, not a score. There is no total, no percentage-correct, no winner marked.
- nothing is named after a paper or an author. The rows are shapes of measurement, and the
  reader's own row is called theirs.

The refusal sits where the reader meets the ordering, not in a footnote.

## Part two: a second crowd

A finding that holds on one crowd model might be a property of that model. The honest answer is to
run a second one and see whether the finding survives.

### The seam, which already exists

`accumulateForces(state, config, seeRobot, noiseX, noiseY, outFx, outFy)` writes accelerations into
caller-owned scratch. The world owns everything else — integration, the speed cap, the wall clamp,
arrival. So a crowd model is exactly "how does a person accelerate", and a second one is a second
function with that signature.

**Determinism and the paired invariant come for free, and that is why this seam and not another.**
Both models are handed the same noise, drawn by address from the same tape at the same
`(tick, uid, channel)`. Guardrail 4's "one addressable tape, two consumers" and guardrail 5's
`makePairedRun` assertions hold for any model that does not reach for randomness of its own — and
`Math.random` throws in the engine suite, so one that did would fail rather than drift.

### The second model: anticipation instead of proximity

The social-force model repels on **present distance**: a person pushes away from whoever is near
them now. The second model repels on **predicted time to closest approach**: a person steers away
from whoever they are *going to* collide with, and ignores someone close but moving away.

That is a real and different class — reactive-distance versus anticipatory — and the difference is
the point. A confound that appears under both is not an artifact of one kernel's shape. A confound
that appears under only one is a finding about the kernel, and the page must be able to say so.

`crowdModel` is a closed union on `RunConfig`, defaulting to `socialForce`, so every existing
fixture, test and permalink means exactly what it meant before.

### It is not an axis, and that is deliberate

`AXES` entries are numeric knobs with a min, a max, a step and a grid, and `axes.slow.test.ts` walks
every notch. A model choice has no notches. Making it an axis would mean inventing a numeric scale
between two kernels that are not points on a scale — so it is a control of its own, and the
axis table stays what it is.

## The disclosure, which is guardrail 1 and cannot be got wrong

`"social-force model"` is currently a clause of the invented-crowd disclosure on all four pages and
in the CSV, and `disclosure.test.ts` asserts that exact literal. The moment a second model can run,
that sentence is **false on every page that shows a number from it**.

Guardrail 1 requires the disclosure in the STATIC HTML, in document order, before any number — so it
cannot name a model chosen at runtime. The split:

- **The static disclosure says what is true of both**: the crowd is invented, the people are
  invented, no number is a measurement of real pedestrians. It stops naming one kernel.
- **Anything carrying results names the kernel that produced them.** The CSV is generated after a
  run and knows; it gains a line. The console names the selected model beside its own controls.

What survives untouched is the load-bearing half: a beginner is told the crowd is invented before
they see a number. What changes is that the sentence stops asserting a specific kernel it can no
longer promise.

`DISCLOSURE_CLAUSES` loses `"social-force model"` and gains a clause that is true of any crowd this
bench can run. That is a **narrowing of a claim, not a weakening of a disclosure**, and the test
that pins the clause list is updated to the new list rather than deleted.

## What must not happen

- No claim that a finding holding under both models holds for real pedestrians. Two invented crowds
  are two invented crowds; guardrail 2 is unmoved.
- No ranking of methods, no leaderboard, no winner.
- No second oracle. Guardrail 9 stands: the simulator is TypeScript-only and the second model gets
  no parity fixture, because the first does not have one either.
- No numeric literal in copy, and no wording written before its measurement has been run.

## The honest limitation

A second invented crowd tests whether a finding depends on one kernel's shape. It does not test
whether it depends on the *class* of assumption both kernels share — both put a person in a plane
with a goal and neighbours and no memory, no groups, no culture, and no reason to be anywhere. A
finding that survives both is better supported and still comes from a toy.
