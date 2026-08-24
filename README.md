# MIRN

**A bench for one question: how much did a robot move a crowd, and how would you know?**

A robot crosses a room full of people. Some of them move differently than they would have. MIRN is
a console for measuring how much — set up an invented crowd, press Run, and compare what different
rulers say about what the robot did to it.

You need no robotics background. The mathematics goes no further than the distance between two
points.

```bash
npm install
npm run dev          # then open the address it prints
```

---

## The idea in ninety seconds

Run one crowd twice. Same people, same starting positions, same random wobble — once with a robot
in the room and once without. Because everything else is held identical, **the gap between a
person's two paths is the robot's effect on them**, with nothing predicted or guessed at.

Then measure it the way you would have to in a real corridor, where the second run does not exist:
guess where each person was about to walk, and call the error the robot's doing.

Now switch the robot off — leave it crossing the room but let nobody respond to it — so the true
answer is exactly zero, and watch what the second method says. At the console's default forecast
horizon it reports 0.334 m on a run whose true effect is exactly zero, and 0.285 m on a run whose
true effect is 0.352 m. Its number is essentially unrelated to the truth.

---

## What is on the page

One page. A settings panel, an arena you can scrub, seven headline readouts with a column picker
for everything else, a sweep curve, and a ledger of every result you have kept. Five of the seven
show before you press Run: the other two need the run-to-run band, which a live preview does not
buy, and a number with no zero beside it is not shown at all.

One press of Run executes **(N axis values × M seeds)**; a single run is the degenerate 1×1 case of
the same mechanism. A 72-run sweep takes about 4.8 seconds; with a per-axis-value run-to-run band
switched on, a 9-value × 8-seed sweep is about 10 seconds. Editing a setting re-simulates a live
1×1 preview at about 38 ms; Run is what commits a result to the ledger and what buys seeds, sweeps,
bands and floors.

**Every number is one interaction from what it assumes and from what it would read if the answer
were zero.** The zero reference is not optional and is never collapsible — it is rendered beside
the value, measured at the same settings, because a value with nothing to judge it against is the
exact error this thing exists to show.

Nothing persists. The ledger does not survive a reload and there is no storage of any kind. A
permalink carries the settings, never the results: Copy link writes them into the address bar, and
opening that link sets every control back where it was, with an empty ledger and a primed Run that
reproduces the sweep exactly. A hand-edited link never throws — anything it asks for that this
bench does not have, or that no control here can be set to, is printed above the settings panel
rather than silently rounded off.

---

## How it is built

The browser owns the simulation. A frozen configuration goes in and a complete paired result comes
out, so the renderer is a scrubber over a finished run rather than a live loop — which is what
keeps the physics, the measurement and the drawing separable. Both arms of a pair are driven by one
addressable noise tape, so they share their randomness by construction and there is nothing to keep
in step. Sweeps run in a Worker that returns numbers only, never trajectories; selecting a row for
playback rebuilds that run from its key and re-simulates it, which is legal only because the same
seed gives the same bytes, and a test asserts that bitwise rather than assuming it.

Python is the oracle. `src/mirn/` holds the reference implementations of the divergences,
estimators and calibration, and `.venv/bin/python -m mirn.cli fixtures` writes their answers to
`tests/golden/parity/`. The TypeScript has to reproduce them, at a tolerance the oracle author
declares in the fixture itself. Fréchet is compared bitwise and is the canary.

Nothing from the virtualenv is on PATH, so the Python commands are spelled out in full.

```bash
npm run check                                     # typecheck, tests, site build — 28 s
npm run test                                      # 511 tests in 22 s
npx vitest run --exclude '**/*.slow.test.ts'      # 506 of them in 14 s
.venv/bin/python -m pytest -q                     # the oracle: 298 tests, roughly 6 minutes
.venv/bin/python -m pytest -q -m "not slow"       # 275 of them, minus the heavy nulls, in 22 s
.venv/bin/python -m mirn.cli fixtures --out tests/golden/parity
```

The axes and the columns are two closed tables, and the build checks four mechanical shadows of the
promise that a knob you can turn changes something you can see: every axis produces a legal
configuration at both ends and every step between; every axis moves the measurement it declares by
more than the seed noise on that move; the console shows an axis's declared measurement whenever
that axis is on screen; and every axis and column has a plain-English name and a unit, with no bare
code identifier anywhere a reader can see one.

The second check is deliberately *not* made against the run-to-run band, which is the more
interesting half. It runs the axis at both ends under the same eight seeds and asks whether the
mean of the eight paired differences clears twice their own standard error. The band is the spread
between two runs of the same room with nothing held in common but the settings — and both ends of
this comparison share their seeds, so that spread is precisely what the pairing already removed.
Judging a paired difference against an unpaired floor is the confounded comparison this whole
console exists to teach against, and doing it in our own test suite would be the same mistake in
the same building.

None of the four knows whether an expander's wording is *true*, and three of the axes are
measurably non-monotone. Reading the console at both ends of every dial is still a person's job.

---

## Layout

```
web/            the product
  index.html    the console — one page, hand-written, no build step
  engine/       sim, contracts, measurement, job — no DOM anywhere in here
  app/          the worker boundary and the console's own state
  ui/           canvas renderers and the palette
src/mirn/       the oracle: divergences, estimators, calibration, paper figures
tests/golden/   parity fixtures and theme goldens
docs/archive/   the research assessment this project began as. Not maintained
```

---

## What this is not

**Not a research result.** The crowd is a model. A toy crowd is exactly the kind of environment
that would make the underlying research question circular — we decided how people respond to
robots and then measured how people respond to robots. Nothing here may be cited as a finding.

**Not a benchmark.** The CSV is an export, never an input format. The moment something else can be
read in and scored, the numbers stop being about this toy and start being about someone else's
robot. There is no user-defined column and no formula field.

**Not a robotics simulator to build on.** It is deliberately narrow. Every request to widen it has
to answer one question: which readout does this move, and what does that readout say when the
answer is zero?

---

## Provenance

MIRN began as a research measurement instrument for robot-induced perturbation of pedestrian
motion — an estimator with an identification strategy, a calibration procedure and a detection
floor. That assessment, its literature review, and its `UNVERIFIED` markers are preserved unchanged
in `docs/archive/`. It is not maintained and it does not govern current work.

It then spent a while as a teaching notebook, which explained the thesis faster than the paper did.
The console explains it faster still, because the reader stops reading and starts turning the dial.

> The ruler is real. The room is invented. Turn the dial.
