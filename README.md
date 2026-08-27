# MIRN

**A bench for one question: how much did a robot move a crowd, and how would you know?**

A robot crosses a room full of people. Some of them walk differently than they would have. MIRN is
a browser console for measuring how much — set up an invented crowd, press Run, and compare what
different rulers say about what the robot did to it.

The crowd is a social-force model I wrote. Nobody in it is real. That is the point: because the
room is invented, the true answer is available, and every ruler on the page can be scored against
it.

**[Open the console →](https://smukhyala.github.io/mirn/)**

[![CI](https://github.com/smukhyala/mirn/actions/workflows/ci.yml/badge.svg)](https://github.com/smukhyala/mirn/actions/workflows/ci.yml)
[![Deploy](https://github.com/smukhyala/mirn/actions/workflows/pages.yml/badge.svg)](https://github.com/smukhyala/mirn/actions/workflows/pages.yml)

![Three views of the console: the room being simulated, the readouts with their zero-effect
references, and a sweep curve plotted against the run-to-run noise band](docs/media/mirn-console.gif)

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

Four pages, and the console is the one you land on. A settings panel, an arena you can scrub,
seven headline readouts with a column picker for the rest, a sweep curve, and a ledger of every
result you kept. The other three are the referee drill, the method card and the working, all
described below; none is a step in a sequence, and every one of them is reachable from every other
at any time.

One press of Run executes N axis values × M seeds; a single run is the degenerate 1×1 case of the
same mechanism. Editing a setting re-simulates a live preview in about 38 ms. A 72-run sweep takes
about 4.8 seconds.

Every number is one interaction from what it assumes and from what it would read if the answer
were zero. The zero reference is never collapsible and never optional — it is rendered beside the
value, measured at the same settings. A value with nothing to judge it against is the exact error
this thing exists to show. Two of the seven readouts are withheld from the live preview, with the
reason stated, because they need a run-to-run band a preview does not buy.

---

## The referee drill

**[Try the drill →](https://smukhyala.github.io/mirn/drill.html)**

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

**[Score a method →](https://smukhyala.github.io/mirn/method.html)**

The drill scores a reader. This scores a *method*. If you have written a disturbance metric, or are
about to, answer five closed questions about how it is computed and press one button. You leave with
what a method of that shape reads on a world where the robot's true effect on every person is
exactly zero — not nearly zero, exactly, because the crowd is told not to react and the paired
construction makes the answer identically nought — and, for the three families that compare against
something, on how many of eight rooms it clears the run-to-run band anyway. That second figure is a
false-positive rate, and nothing else here reports one.

**Nothing of yours is read in.** No code, no file, no dataset, no free text — the page has no
textarea, no file input and no text field, and a test asserts that about the booted page rather than
trusting the markup. You supply a *description*, in multiple choice; a closed table maps it onto one
of four families this bench already implements; and MIRN runs its own estimator on its own rooms.
What leaves the page is a claim about a shape of measurement, never a claim about your robot.

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

**The numbers.** 773 browser tests across 64 files, of which 742 run without the five that re-run
the simulator. 298 Python tests, of which 275 run without the heavy nulls. Timings are left out
here on purpose: the last set was measured on one machine and re-measured on another that disagreed
by 70%, so a single number would be a claim rather than a figure. CI checks the two languages
independently, then runs a third job for the check no human remembers: that the committed fixtures
are current and the browser still reproduces them. The built site is four HTML files (8.96, 56.44,
6.98 and 5.13 kB), one 19 kB stylesheet, about 164 kB of script across six chunks, and two workers
of 49 and 42 kB.

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
npm run check        # typecheck, 773 tests, production build
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

**Not a benchmark.** The CSV is an export, never an input format. The moment something else can be
read in and scored, the numbers stop being about this toy and start being about someone else's
robot.

**Not a robotics platform.** No ROS, no planner, no dataset loader, no trained model, no physics
engine. Every request to widen it answers one question: which readout does this move, and what does
that readout say when the answer is zero?

---

## Provenance

MIRN began as a research measurement instrument for robot-induced perturbation of pedestrian
motion — an estimator, an identification strategy, a calibration procedure, a detection floor. That
assessment, its literature review and its `UNVERIFIED` markers are preserved unchanged in
`docs/archive/`. It is not maintained and it governs nothing here. It then spent a while as a
teaching notebook, which explained the thesis faster than the paper did. The console explains it
faster still, because the reader stops reading and starts turning the dial.

> The ruler is real. The room is invented. Turn the dial.
