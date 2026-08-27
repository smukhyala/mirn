# Precision and provenance — design

**Status:** approved for implementation.

Three changes that move the method card from a demonstration towards an instrument. None of them
adds a new measurement; all three are about saying how well the existing ones are known and letting
a reader take them away.

## 1. A count of eight has an interval, and it is wide

The page reports "cleared the line on 8 of 8 rooms" and says nothing about how well eight rooms pin
a rate down. They pin it down poorly: **8 of 8 is consistent with a true rate anywhere from about
two-thirds to certainty.** A reader comparing "8 of 8" against "6 of 8" is, at this sample size,
comparing two numbers whose intervals overlap heavily — and nothing on the page tells them so.

That is guardrail 6's own argument one level up. A value with nothing to judge it against is the
error this site exists to teach; a *rate* with no interval is the same error wearing a fraction.

**Wilson score interval, at 95%.** Not Wald: Wald collapses to zero width at 0 of n and n of n,
which are precisely the counts this bench produces most often, and a zero-width interval on eight
observations would be a worse lie than no interval at all. Wilson is closed form, needs no
distribution table, and stays inside nought and one at every count.

It is a new formula and it owes no parity fixture: Python computes no proportion interval, so
guardrail 8's two-implementation rule is not engaged. Recorded here so the next audit does not
re-derive it.

**The interval is not a new reading and does not get its own zero.** It is a qualifier on a figure
that already carries one. Rendering it as a separate figure with a separate zero would imply a
second measurement that was not made.

## 2. The reader chooses how many rooms

`makeFamilyProbeSettings` already accepts a seed list; every page calls it with `{}` and gets eight.
So the precision of every number on the method card is fixed at whatever eight rooms happen to give.

A control offers a few counts. The seeds stay derived — `BASE_SEED + i * SEED_STRIDE`, the existing
scheme — which buys a property worth having: **the first eight rooms of thirty-two are the same
eight rooms.** Turning precision up refines an answer rather than replacing it with a different one,
and a reader who does so can see the interval narrow around a number that does not jump.

### This is not the sample size the method-card spec refuses

`docs/superpowers/specs/2026-08-25-method-card-design.md` says the page must not claim "a sample
size, a power calculation, or a recommendation for the reader's study." That prohibition stands
unamended and this does not touch it.

What it forbids is the page telling a reader **how many observations their own experiment needs**.
That is a statement about a study MIRN knows nothing about — the effect size they care about, their
corridor, their robot — and the page still refuses to make it.

What this adds is a control over **how many rooms MIRN runs for its own count**, which is a property
of this bench's measurement and nothing else. The page must not present it as guidance: no
recommended count, no "enough rooms for significance", no marked default beyond the one it opens at.
More rooms buy a narrower interval on MIRN's own number, and that is the whole of what is claimed.

## 3. A result can be taken away, and says what produced it

Nothing on the method card or the comparison can be exported. A number a reader cannot carry off is
not a result they can cite, check later, or hand to somebody else.

A CSV, following the console's existing export exactly:

- **The invented-crowd disclosure is line one.** Guardrail 1: a file outlives the page it came from,
  and a row of numbers with no disclosure is a claim about pedestrians the moment it is opened
  somewhere else.
- **The crowd that produced it is named**, using the line the second-crowd change already added.
  The static disclosure cannot name a kernel; a file generated after a run can and must.
- **The settings that produced it travel with it**: how many rooms, how many replicates behind the
  drift line, which crowd, and the seeds themselves. A CSV that records its own inputs can be
  reproduced; one that does not is a number with a story attached.
- **A bench version.** When a formula changes, every number taken before the change becomes wrong,
  and a file with no version is wrong silently. The version lives in one place and a test asserts it
  matches `package.json`, because two version strings that must agree and are checked by nobody is
  the drift this repo has now removed twice.

**The export is still an export, never an input.** Guardrail 11's surviving clause holds: the CSV is
not an input format for trajectories, and nothing reads one back.

## What must not happen

- No claim that a narrower interval makes a method sound. Guardrail 2 is untouched: the interval
  says how well this bench knows its own count, not whether the count transfers.
- No recommended room count, and no language implying one count is adequate and another is not.
- No numeric literal in copy — every figure, bound and count renders from data.
- No new parity fixture, and no second version string.

## The honest limitation

A confidence interval describes sampling error and nothing else. It says how much the count would
move if the same bench ran the same rulers on more rooms of the same invented crowd. It says nothing
about the two things that actually bound these numbers: that the crowd is calibrated against
nothing, and that a room is not a corridor. Narrowing an interval makes a number more precise, not
more true, and the page has to keep saying so where the interval appears.
