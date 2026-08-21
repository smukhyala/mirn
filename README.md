# MIRN

**An interactive notebook about what a robot does to a crowd, and how you would know.**

A robot crosses a room full of people. Some of them move differently than they would have. MIRN is
about how much, how you would measure it, and why the obvious way of measuring it does not work.

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
answer is exactly zero, and watch what the second method says.

Across every forecast horizon we measured, it reports between 0.90× and 1.23× of what it reports
when there is genuinely nothing there. It is not exaggerating the effect. It is **uncorrelated with
it**.

---

## What is in it

Nine short pages in four parts, plus seven experiments you run yourself.

**I — What a robot does to a crowd.** One world, and the discovery that you cannot answer the
question from it. Then the second world. Then what the robot is actually doing to somebody.

**II — Putting a number on it.** Squeezing hundreds of samples into one figure, and watching two
reasonable summaries of the same data disagree about which robot was worse. Then changing only the
seed, and watching the answer move.

**III — The laboratory.** Seven questions with a prediction gate: commit before you run it. Does a
denser crowd mean more disturbance? Should a robot hurry or slow down? Once it has gone past, is
everything back to normal? Can it affect somebody it never went near?

**IV — Why this is harder than it looks.** The detection floor, the run you cannot have, and a
measurement handed a question whose answer is already known.

---

## How it is built

The browser owns the simulation. A frozen configuration goes in and a complete paired result comes
out, so the renderer is a scrubber over a finished run rather than a live loop — which is what
keeps the physics, the measurement and the drawing separable. Both arms of a pair are driven by one
addressable noise tape, so they share their randomness by construction and there is nothing to keep
in step.

Python is the oracle. `src/mirn/` holds the reference implementations of the divergences,
estimators and calibration, and `.venv/bin/python -m mirn.cli fixtures` writes their answers to
`tests/golden/parity/`. The TypeScript has to reproduce them, at a tolerance the oracle author
declares in the fixture itself. Fréchet is compared bitwise and is the canary.

Nothing from the virtualenv is on PATH, so the Python commands are spelled out in full.

```bash
npm run check                                     # typecheck, tests, notes build, site build
.venv/bin/python -m pytest -q                     # the oracle: 297 tests, about six minutes
.venv/bin/python -m pytest -q -m "not slow"       # 274 of them, minus the heavy nulls, in 20 s
.venv/bin/python -m mirn.cli fixtures --out tests/golden/parity
npm run measure                                   # re-run every experiment, rewrite the facts
```

The notes are Markdown compiled to real HTML at build time, with the mathematics pre-rendered.
With JavaScript disabled you lose the figures and keep the argument.

Four prose lints fail the build, because each is the mechanical form of a promise the site makes.
A bare number must be either a stated setting or a live quantity that can explain itself. A
comparative word may not sit within eighty characters of a live figure, because a slider could
falsify it. No page may use a term the vocabulary ladder does not define until a later page. And a
known synonym for a defined term — "displacement" for deviation — is rejected by name, because a
word the reader was never given is jargon however ordinary it sounds. A fifth check closes each
page's declared vocabulary against the ladder, and the renderer turns an unknown widget, an unwired
control or an unresolvable reference into the same kind of build error.

---

## Layout

```
web/            the product
  notes/        the pages, as Markdown
  engine/       sim, contracts, measurement — no DOM anywhere in here
  ui/           canvas renderers and the palette
  data/         measured experiment facts, the only permitted source of numeric claims
src/mirn/       the oracle: divergences, estimators, calibration, paper figures
tests/golden/   parity fixtures and theme goldens
docs/archive/   the research assessment this project began as. Not maintained
```

---

## What this is not

**Not a research result.** The crowd is a model. A toy crowd is exactly the kind of environment
that would make the underlying research question circular — we decided how people respond to
robots and then measured how people respond to robots. Nothing here may be cited as a finding.

**Not a robotics simulator to build on.** It is deliberately narrow, and every request to widen it
has to name the page it would make clearer.

**Not a claim about anybody's published work.** The failure modes it demonstrates are properties of
estimators, shown on data where the right answer is known. What real studies report is not
something this can settle.

---

## Provenance

MIRN began as a research measurement instrument for robot-induced perturbation of pedestrian
motion — an estimator with an identification strategy, a calibration procedure and a detection
floor. That assessment, its literature review, and its `UNVERIFIED` markers are preserved unchanged
in `docs/archive/`. It is not maintained and it does not govern current work.

The teaching artifact turned out to explain the thesis faster than the paper did. So it became the
project.

> The ruler is real. The room is invented. Learn the ruler.
