# MIRN

**A bench for one question: how much did a robot move a crowd, and how would you know?**

A robot crosses a room full of people. Some of them walk differently than they would have. MIRN is
a browser console for measuring how much — set up an invented crowd, press Run, and compare what
different rulers say about what the robot did to it.

The crowd is a model I wrote — two of them, in fact: people who push away from whoever is near them
right now, and people who steer around whoever they are about to walk into. Nobody in either is
real. That is the point: because the room is invented, the true answer is available, and every
ruler on the page can be scored against it. The second crowd is there so a finding can be asked
whether it survives one — a result that holds under only one set of invented rules is a fact about
those rules.

**Run it locally:** `npm ci && npm run dev`, then open the address it prints. There is no hosted
copy — the whole site is static files, so a build also opens straight from `dist/`.

[![CI](https://github.com/smukhyala/mirn/actions/workflows/ci.yml/badge.svg)](https://github.com/smukhyala/mirn/actions/workflows/ci.yml)

![Three views: the room being simulated with each person's two paths drawn against each other, the
readouts each carrying the zero it would read if the answer were nothing, and every ruler measured
on one shared set of rooms — where the forecast method reports 0.369 m and clears the drift line on
six of eight rooms, and the paired construction reports 0.000 m and clears it on none, with the
true effect in every one of those rooms exactly nothing](docs/media/mirn-console.gif)

---

## The finding

Run one crowd twice. Same people, same starting positions, same random wobble — once with a robot
in the room and once without. Everything else is held identical, so the gap between a person's two
paths **is** the robot's effect on them. Nothing is predicted and nothing is guessed at.

Then measure it the way you would have to in a real corridor, where the second run does not exist:
guess where each person was about to walk, and call the error the robot's doing.

At the console's default settings, on one run:

| | |
|---|---|
| What the crowd really did, from the paired run | **0.352 m** |
| What the forecast method reports | **0.285 m** |
| What the forecast method reports on a run where nobody can see the robot, so the true answer is exactly zero | **0.334 m** |

It reports more disturbance for a robot that did nothing than for one that did something.

Sweep the forecast horizon from 0.2 s to 3.0 s, averaged over eight seeds, and the reported number
climbs from 0.005 m to 0.367 m while the true effect sits still at 0.317 m. At every horizon on
that sweep, what the method reports on the real run is between **0.90× and 1.23×** what it reports
on a run with no effect at all. It is not inflating the answer. It is unrelated to it.

What this can and cannot support: a toy crowd can show *that* a measurement can be confounded and
*why* the paired design removes the confound. It cannot tell you how large that error is for real
robots, or which published method is wrong. Nothing here is a research result.

---

## What is on the page

Five pages, and the console is the one you land on. A settings panel, an arena you can scrub,
seven headline readouts with a column picker for the rest, a sweep curve, and a ledger of every
result you kept. The other four are the referee drill, the method card, the fit page and the
working, all described below; none is a step in a sequence, and every one of them is reachable from
every other at any time.

One press of Run executes N axis values × M seeds; a single run is the degenerate 1×1 case of the
same mechanism. Editing a setting re-simulates a live preview in about 38 ms. A 72-run sweep takes
about 4.8 seconds.

The settings panel picks which crowd runs. One steers on present distance, the other on predicted
time to closest approach — different rules, different numbers — and the picker exists so a finding
can be re-asked under rules it was not derived from. The confound survives the swap: on eight rooms
whose true effect is exactly nothing, the forecast method reports 0.369 m under the first crowd and
0.442 m under the second. What does *not* survive is the size of it — it clears the run-to-run band
on six of those eight rooms under one crowd and two of eight under the other. So the finding
transfers and the number does not, which is the more useful half of the answer and the reason this
is a switch rather than a footnote.

Every number is one interaction from what it assumes and from what it would read if the answer
were zero. The zero reference is never collapsible and never optional — it is rendered beside the
value, measured at the same settings. A value with nothing to judge it against is the exact error
this thing exists to show. Two of the seven readouts are withheld from the live preview, with the
reason stated, because they need a run-to-run band a preview does not buy.

---

## The referee drill

**`drill.html`**

A second page, built from the same formulas and computing nothing new: one room, run once, with
the second run withheld, and a question — did the robot disturb this crowd by more than the
ordinary difference between two runs of it, or by less? Call it, and the second run is shown.

Eight rooms, each answered with the same room run twice under the paired construction above, so
the honest answer is known rather than guessed at. Five of the eight are built so that the one
number a real corridor could hand you — a forecaster's report, computed from the run with the
robot and nothing else — points the wrong way. Three are built so it happens to point the right
way, and that is not a softening of the point: a drill where the number always misled would let a
reader score perfectly by inverting it, and would teach that it is systematically backwards rather
than what it actually is, which is unrelated to the answer. Which readings are even eligible to
appear on a withheld card is not decided by a name sounding safe — it is proved, per reading, by
swapping the withheld run for a decoy from an unrelated crowd and checking whether anything
changes.

At the end it says how many you called wrong and whether the misses went the same way, then hands
the drill back two ways: a link, which carries the eight rooms and never your calls or your score,
and a file, which carries one row per card and opens with the sentence saying the crowd is invented.

**The transferable claim is not about this crowd.** It is that a paired comparison — the same
situation, run twice, differing in one thing — settles a question a single observation cannot,
and settles it by construction rather than by a cleverer estimate. The crowd is invented and the
robot is a toy; the shape of the argument is not specific to either.

---

## The method card

**`method.html`**

The drill scores a reader. This scores a *method*. If you have written a disturbance metric, or are
about to, answer five closed questions about how it is computed and press one button. You leave with
what a method of that shape reads on a world where the robot's true effect on every person is
exactly zero — not nearly zero, exactly, because the crowd is told not to react and the paired
construction makes the answer identically nought — and, for the three families that compare against
something, on how many of the rooms it clears the run-to-run band anyway. That second figure is a
false-positive rate, and nothing else here reports one.

The questionnaire reads nothing of yours in. You supply a *description*, in multiple choice; a
closed table maps it onto one of four families this bench already implements; and MIRN runs its own
estimator on its own rooms. What leaves the page is a claim about a shape of measurement, never a
claim about your robot.

**Or you can hand it the metric itself.** Paste a function and the bench runs it, on the same rooms,
under the same drift line. It goes into a Worker with no DOM, no network and no storage; it is
handed one arm — the run *with* the robot, the people's paths, the robot's path, the time step —
and there is no parameter through which the control arm could arrive, so the restriction is a
property of the signature rather than of anybody remembering it. Every buffer it receives is a copy,
because a method that wrote into the live ones would corrupt every room after it and the corruption
would look like physics. Anything it returns that is not a finite distance is a failed method,
reported as one, in its own words. Every room is put to it twice on identical numbers and the two
answers compared exactly, because a method that answers differently to the same question is
answering a different question each time. And it never enters a permalink: a link may name a
built-in method, never carry a function body, because a shareable link that runs a stranger's code
in your browser is a shareable exploit and this site has no server to put it behind.

**A method that always returns the same number is called out rather than congratulated.** It is the
one defect the counts cannot report: `() => 0` fails on no room, contradicts itself on no room, and
clears the drift line on no room, so it posts the best false-positive rate the page can print — the
same one a sound ruler posts. A supplied method declares no ruler, so the only evidence available is
whether its answers move when the rooms do. If they never move, the page says so above the figures,
and the export carries the same sentence, because the file outlives the page.

**Every ruler on the same rooms, and it refuses to call that a ranking.** The comparison runs all
four families and your own method across one shared set of rooms, so the numbers are commensurable.
What it will not do is order them into a leaderboard: the crowd is invented, so the comparison
establishes which ruler is confounded *on this toy*, never which method wins in a corridor.

**And the other half of the question: when there was something to notice, did it?** Everything
above is measured on one world — the one where the robot moves nobody — and counts how often a
ruler says otherwise. That is a false-positive rate, and it is half of what decides whether a ruler
is any use. A method that always answers "nothing happened" scores perfectly on it.

So the bench also sweeps the dial that decides how much space the robot demands, from none up to
the largest the console offers, and runs the same rooms again at every setting. The first row of
that table is the world the counts above were taken on — not a similar world, the same one: the
test asserts the two are identical bit for bit, on every room, for every ruler. So the sweep's zero
is the number already on the page rather than a phrase asking to be trusted.

What it finds: the paired construction goes from finding nothing where there is nothing to finding
all eight rooms of eight where the robot pushes hardest, with no misses and no false alarms at any
setting. The forecast method calls more than half the rooms at *every* setting, including the one
where the true effect is exactly nothing, and what it reports barely moves between the two ends
while the truth underneath it goes from nought to nearly half a metre. That is worse than a high
false-positive rate and it is a different fault: a ruler firing at about the same rate whatever
happened is not reporting on what happened, so neither its alarms nor its silences carry
information.

Hits, misses and false alarms are three counts and never one rate. Whether a room had anything to
find is decided room by room rather than by the setting, so pooling them would let a ruler that
calls every room look like a perfect detector at exactly the settings where most rooms happen to
contain something. The export is one row per room per setting rather than the six aggregated
levels, so every count on the page can be re-derived from the file instead of taken on trust, and
each row names which of the four things happened in that room in words.

**How well the rate is known, and what it cost to know it better.** Run 8, 16 or 32 rooms — the
first 8 of 32 are the same 8, so the count buys precision rather than a different measurement — and
every false-positive rate is printed with a Wilson score interval beside it. Wilson rather than
Wald, because Wald collapses to zero width at 0 of n and at n of n, which are the two counts this
bench produces most often and precisely where a confident-looking interval would be a lie. A
narrower interval is a more precise number and not a truer one, and the page says that where the
interval appears.

The mapping is many-to-few and the page says so where you meet the verdict rather than in a
footnote. A learned trajectory predictor and a hand-specified intended path both run as the
constant-velocity stand-in, because that is the family this bench can honestly run, and a reader who
believed their own predictor had been simulated would have been misled — which would be worse than
the page not existing. Three of the five questions decide nothing at all, and that is said out loud
too.

The fourth family is not scored as a detector. An absolute quantity — closest approach, distance
travelled — reads about eighteen metres against a line measured in centimetres and clears it every
time, and clearing it says nothing whatever about the robot. So it renders in a different shape with
no headline numeral, and which shape a family gets is read off its own ruler rather than off its
name.

**What it can and cannot show:** that a method is untrustworthy, never that one is sound. The crowd
is invented, so passing this battery is necessary and not sufficient — a counterexample refutes a
universal, and that is the only shape of claim a simulator has to offer.

---

## The fit page

**`fit.html`**

Every number elsewhere on this site comes from a crowd calibrated against nothing at all. The
parameters came from a demonstration and from being measured against each other, and that is the
largest thing standing between this bench and an instrument: it can show a measurement is
confounded and it cannot say by how much, because the crowd it says that about was tuned to look
plausible and fitted to no observation.

So this page takes a recording of real people walking — the four-column format the public
pedestrian datasets ship in — and asks how far the invented crowd's distribution of walking speeds
sits from theirs, at each of a range of paces and wobbles. The file is read in your browser and
goes nowhere. Who each person is groups the samples and is then discarded before anything is
measured; no name from the file can reach the page and no individual's path is drawn or reported.

**It says which settings your recording actually decides, and that turned out to be the interesting
part.** A parameter counts as pinned only if moving it across its whole range changes the fit by
more than the invented crowd differs from *itself* — the same test the console applies to every
dial. Feed it a recording written out of the simulator at a known walking pace and the fit recovers
that pace exactly, every time, and reports it as pinned. It reports the wobble as **not** pinned,
because it isn't: recordings made at a wobble of 1.5 and of 2.5 both fit best near nought, and the
grid's winner there is an artefact of where the grid was finest. A first version reported that
winner as a fitted parameter. It was a number that looked measured and was not, which is the exact
failure the rest of this site argues against.

**It shows no disturbance number, and it cannot compute one.** That is arithmetic, not restraint.
Every figure this bench reports is a difference between two runs of one room, once with a robot and
once without — and a corridor cannot be filmed twice. There is no second recording in which the
same people, on the same day, in the same mood, walked past no robot. A recording has one arm, so
the quantity this site exists to measure is not in it, and a number claiming otherwise would be the
confound this project teaches against wearing real data, which makes it worse rather than better.

So the two kinds of number are kept apart by living on different pages, behind different workers,
over message protocols that cannot carry each other's payloads. A test asserts it over the page's
source rather than its output, so the guarantee survives whatever the page later renders.

Three sentences sit above every figure there, and the third is the one that matters: a close fit is
not permission to read this bench's disturbance numbers as measurements of anybody. The whole
hazard of calibration is that it makes a toy feel like an instrument, and the reader who has just
been shown that the invented crowd walks like a real one is precisely the reader most likely to
believe the next number they see.

---

## How it is kept honest

**Two implementations, one oracle.** Python in `src/mirn/` is the reference for every formula the
browser quotes. `mirn.cli fixtures` writes its answers to `tests/golden/parity/`; the TypeScript
has to reproduce them. Tolerances are declared *in the fixture*, by the oracle author, so loosening
one is a visible diff in a committed file rather than an invisible edit in a test. Fréchet's
tolerance is `exact` — bitwise — and it is the canary. Three float traps are pinned by tests rather
than by comments: numpy's pairwise summation, its linear quantile convention, and a ban on
`Math.hypot` inside the measurement directory. V8's `hypot` is *more* accurate than numpy's naive
`sqrt(sum(d*d))`, so it disagrees in the last bits; a test greps that directory's own source,
because a comment is not a build error.

**Determinism by construction, not by discipline.** Both arms of a pair are driven by one
addressable noise tape: one tape, two consumers, nothing to keep in step. Same seed, same bytes,
every reload. Determinism tests compare bytes — `toBe(0)`, never `toBeCloseTo(0)` — because the
shared tape makes exactness available and inexactness means the arms have drifted. A global RNG
throws in the engine suite. Sweeps run in a Worker that returns numbers and never trajectories, so
selecting a row for playback re-simulates that run from its key; a test asserts the rebuild is
bitwise identical on *both* arms, which is the only thing making that architecture legal.

**A gate that blocks all other work when it is red.** CausalAgents ([arXiv:2207.03586](https://arxiv.org/abs/2207.03586))
found that standard forecasters move their error by 25–38% when agents that provably could not have
influenced a scene are deleted from it. The paired estimator computes each person's divergence from
their own two paths and nothing else, so it cannot do that, and `placebo.test.ts` plus
`tests/test_placebo.py` are what keep it that way. The gate runs on an analytic fixture and not on
the crowd, deliberately: delete a bystander who never came within 5 m of the robot and the estimate
moves by up to 37%, because removing anyone rewires the interaction chain and the robot then takes
a different path. That is the crowd being a crowd. Re-pointing the gate at it would make it
permanently red for a good reason, and the natural repair — loosening the tolerance until it passes
— leaves a test that asserts nothing.

**Property tests over the divergences.** Non-negativity, exactly zero on identical inputs, symmetry,
translation and rotation invariance, monotonicity under injected deviation, generated with
fast-check. Bitwise translation invariance is asserted only for integer coordinates, because for
arbitrary doubles it is false.

**Every knob must change something you can see.** The suite fails if an axis produces an illegal
configuration anywhere in its range, or moves its declared readout by less than the seed noise, or
puts a bare code identifier on a surface a reader sees. That check deliberately does *not* judge a
paired difference against the unpaired run-to-run band: doing so is the confounded comparison this
console exists to teach against, and committing it in our own test suite would be the same mistake
in the same building.

**No server, no storage.** Static files, zero runtime dependencies, no backend, no analytics, no
accounts. A permalink is a query string carrying the settings and never the results, so opening one
re-runs the simulation at today's code instead of resurrecting an answer from a formula that may
since have changed. A hand-edited link never throws; anything it asks for that this bench does not
have is named in plain English above the panel rather than silently rounded off. A test greps the
source for `localStorage`, `IndexedDB`, cookies, `fetch` and `WebSocket`, and carries a canary and
a meta-test so the guard cannot rot.

**The numbers.** 1,160 browser tests across 85 files, of which 1,118 run without the seven that
re-run the simulator. 298 Python tests, of which 275 run without the heavy nulls. Timings are left
out here on purpose: the last set was measured on one machine and re-measured on another that
disagreed by 70%, so a single number would be a claim rather than a figure. CI checks the two
languages independently, then runs a third job for the check no human remembers: that the committed
fixtures are current and the browser still reproduces them. The built site is four HTML files (8.98,
58.01, 7.13 and 15.24 kB), one 23.5 kB stylesheet, about 220 kB of script across six chunks, and
three workers of 46, 47 and 51 kB.

---

## Prior work

Agrawal, Dengler & Bennewitz, *Evaluating Robot Influence on Pedestrian Behavior Models for Crowd
Simulation and Benchmarking* ([arXiv:2409.14844](https://arxiv.org/abs/2409.14844); ICSR 2024,
Springer LNCS *Social Robotics*) independently does the paired thing this simulator does. They
extend a social force model with a learned robot force term, run the benchmark once with that term
active and once with it disabled, and take the deviation by Fréchet distance. Their force
parameters are fit to real pedestrian trajectories from JRDB; mine are fit to nothing. Their code
is MIT-licensed at [HumanoidsBonn/SRFM-Pedestrian-Deviation-Benchmark](https://github.com/HumanoidsBonn/SRFM-Pedestrian-Deviation-Benchmark).

The paired construction is theirs and others' before mine, and MIRN claims no novelty in it. What
differs is what the paired run is used for. Theirs is a benchmark: it scores navigation algorithms
against each other. MIRN uses the same construction as a known ground truth for scoring the
**rulers** — the paired difference is the answer, and the question on screen is what a method that
cannot see the second run reports against it, including on a run where the answer is known to be
exactly zero. Every effect is printed beside its own run-to-run band. And it is interactive:
you turn the dial and watch the number move rather than reading a table of someone else's.

---

## What I found building it

**A default setting that refuted the site's own argument.** The instrument shipped with a forecast
horizon at which the forecast method reported 0.026 m on a run whose true effect was exactly zero,
against a run-to-run band of 0.311 m. In other words, at the settings a first-time reader saw, the
method looked impeccable — while the page's entire claim is that it is not. Found by re-measuring
the design's numbers rather than quoting them. The default is now 3.0 s, where the same method
reports 0.334 m against a true zero.

**A slider default that was not on the slider's own grid.** The walking-pace control had a minimum
of 0.4 and a step of 0.05, which puts its notches at 1.30 and 1.35. Its default is 1.34 m/s, the
measured mean preferred walking speed. A real browser snaps a range input to its own notches, so
the console had been simulating a crowd walking at 1.35 while every test and the Python oracle used
1.34 — and the label above the slider rendered 1.34, so it read correct. jsdom does not sanitise
range inputs, so no test could see it and neither could I: I checked the label, and the label was
right. Fixed by moving the notch spacing, not the default, which would have put the console at odds
with the oracle. The axis test now asserts every control's default, minimum and maximum sit on its
own grid.

**A readout that never moved.** The minimum-clearance number was measured from the first frame,
where the robot and everybody else are still standing on their spawn points — so it reported the
same −0.550 m at every setting on the panel. A knob that changes nothing visible is a broken
lesson here, not a cosmetic complaint. Measuring from the moment both bodies have moved farther
than their own body radius made the same four settings read −0.050 / 0.236 / 0.113 / 0.047. The
test pins the property — two settings the old ruler could not tell apart, which the new one can —
rather than the four numbers, which any simulator change would break for the wrong reason.

A number of assertions in this repo turned out to be incapable of failing. Every one was found the same
way: break the code on purpose and check whether the suite notices.

---

## Run it

```bash
npm install
npm run dev          # open the address it prints
npm run check        # typecheck, 1160 tests, production build
```

The oracle lives in a virtualenv and nothing from it is on PATH, so its commands are spelled out in
full:

```bash
.venv/bin/python -m pytest -q -m "not slow"                       # 275 tests
.venv/bin/python -m pytest -q                                     # all 298, about 6 minutes
.venv/bin/python -m mirn.cli fixtures --out tests/golden/parity    # after any formula change
```

Changing a formula is a two-file commit minimum: the implementation and the regenerated fixture.
Changing one side alone is a red test, not a judgement call.

---

## Layout

```
web/            the product
  index.html    the console; how.html, drill.html, method.html the other three
  engine/       sim, contracts, measurement, job — no DOM anywhere in here
  app/          the worker boundary and the console's own state
  ui/           canvas renderers and the palette
src/mirn/       the oracle: divergences, estimators, calibration, paper figures
tests/golden/   parity fixtures and theme goldens
docs/archive/   the research assessment this began as. Read-only, not maintained
```

---

## What this is not

**Not a research result.** The crowd is a model. A toy crowd is exactly the environment that would
make the underlying research question circular — we decided how people respond to robots and then
measured how people respond to robots. Nothing here may be cited as a finding.

**Not a benchmark, even though a method can now be read in.** That sentence used to be simpler —
"the CSV is an export, never an input format" — and the bring-your-own path is the thing it was
written to refuse. What makes the distinction hold is not what gets read in but what gets held
fixed: the rooms are ours, the crowd in them is invented, and the true effect in every one of them
is exactly nothing. So a supplied method is scored on how it behaves *here*, which is a fact about
the method's shape and never about anyone's robot. The moment the *rooms* came from somewhere else,
this would be a benchmark and the numbers would be about somebody's hardware. The CSV is still an
export and still never an input format.

**Not a robotics platform.** No ROS, no planner, no trained model, no physics engine. It does now
read a dataset, which that list used to refuse — and the refusal was narrowed rather than dropped:
a recording may fit the crowd and check the fit, and may never produce a disturbance number,
because a corridor cannot be filmed twice. Every request to widen it still answers one question:
which readout does this move, and what does that readout say when the answer is zero?

---

## Provenance

MIRN began as a research measurement instrument for robot-induced perturbation of pedestrian
motion — an estimator, an identification strategy, a calibration procedure, a detection floor. That
assessment, its literature review and its `UNVERIFIED` markers are preserved unchanged in
`docs/archive/`. It is not maintained and it governs nothing here. It then spent a while as a
teaching notebook, which explained the thesis faster than the paper did. The console explains it
faster still, because the reader stops reading and starts turning the dial.

> The ruler is real. The room is invented. Turn the dial.
