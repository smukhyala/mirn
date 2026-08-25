# The Referee Drill — design

**Status:** approved for implementation, gated on Task 1's measurement.

## What this is

Eight cards. Each shows a robot crossing a simulated crowd, with the control arm **withheld** — the
reader sees only what a real corridor would give them, plus the numbers a published paper would
report. They call whether the robot actually disturbed anyone. Then the control arm fades in and
they find out, because the truth is known by construction.

The point is not the quiz. The point is being wrong out loud, on a system where wrongness is
provable, about a class of number the field publishes.

## Why this and not the alternatives

Three product shapes were considered and researched before this was chosen.

**Paste-your-own-estimator is dead**, and not on technical grounds. Pyodide was measured at 8.70 MiB
cold, 1.7–5.2 s to first number, 0.64 ms per metric call — it works. It dies on structure and
demand: every successful browser research tool takes the artifact in the form the user already has,
or takes none. Observable was the one counterexample, asked users to translate into a dialect, and
removed the dialect in 2025. Demand is low tens — the CausalBench Challenge offered £10,500, a
starter repo, cached datasets and free compute, and drew 11 participants across 6 institutions.

**The robotics-specialist framing cannot carry a product.** Measured: 58 social-navigation papers a
year, 94 distinct groups over two years, 77 of which published exactly once. Roughly 30–60 people a
year would ever design a disturbance metric, and their own consensus group already ships a browser
simulator.

**The closed-menu shape reaches millions.** The NYT's 2-4-6 game and FiveThirtyEight's p-hacking
machine are fixed knobs, a choice, and a consequence. That is the shape MIRN already is.

## What the reader carries away

> "A disturbance number computed without a control run is not distinguishable, by a careful reader,
> from the noise of running the same room twice — I got N of 8 wrong. Pairing removes the ambiguity
> by construction, not by being a better estimator."

This survives the crowd being invented, because the crowd being invented is what makes truth
knowable. The claim is about what a class of number licenses a reader to infer. That is a claim
about a design, not about pedestrians, and claims about designs transfer.

## The gate

**The riskiest unknown is whether enough genuinely fooling cards exist.** A card where the
confounded number is obviously noise teaches nothing; one where it is obviously right teaches
nothing. The drill needs roughly four cards where the true effect is below the floor while the
forecaster clears the band, and roughly four the other way.

Task 1 measures this against the real engine, before any UI exists.

**Kill criterion: fewer than four of each and the drill has no cards.** Stop, report, and do not
build the rest. That is a real stop, not a formality.

## Screens

### Card (×8)

Reached from a fifth item in the existing ways-in nav, or a permalink. The masthead and the
invented-crowd disclosure are unchanged, so guardrail 1 is satisfied by markup that already exists.

- **Arena in withheld mode.** Treated pedestrians and the robot are drawn. Control ghosts and gap
  segments are not.
- **The key becomes dynamic here.** It currently lists six marks statically. A key naming a mark the
  reader cannot find is precisely what that file's own comment forbids, so in withheld mode it lists
  only the marks actually drawn.
- **Five unpaired readouts**, each keeping its full `(reading, zeroRendering)` pair — these are the
  measurements a real corridor could produce: what a forecaster would report, closest approach,
  near-miss count, robot distance, and time until the crowd settled.
- **The four paired readouts render as a label and the word "withheld"**, with no value slot.
- **One question, three buttons:** bigger than two runs of this room differ by / smaller than that /
  cannot tell from what is shown.

### Reveal

Control ghosts and gap segments fade in on the same frozen frame. The withheld tiles fill, plus the
run-to-run band. One line states the call, the true effect, the band, and what the forecaster said.

### Tally

Eight dots above the ledger, in memory only, with a line saying it does not survive a reload.
Guardrail 10 stated rather than worked around.

### Verdict

After card 8: how many were called wrong, and whether the ones called wrong shared a direction. Copy
link carries the eight recipes and never the results. Export CSV carries the disclosure on line one.

Then: "Now open the settings and try to build a card that fools it worse," dropping the reader into
the normal console with the last card's settings loaded.

## What this must not become

Guardrail 11 stands unamended. No method import path, no dataset loader, no leaderboard. The card
table is closed, in the style of `AXES` and `COLUMNS`, and no user-defined card can enter it.

The drill scores a **reader**, never a robot and never someone else's method.

## Guardrails this touches

- **1** — the disclosure precedes every number, including on the drill's own screens.
- **6** — every readout keeps its zero reference. Withholding a *value* is allowed; showing a value
  with no zero is not.
- **10** — the tally is in memory. No storage API. The permalink carries recipes, never results.
- **11** — unamended. The card table is closed.
- **12** — no bare code identifier on any drill surface.

## Known argument against, recorded

It is a quiz, and quizzes read as demos. A specialist takes it once, scores 8 of 8 because they
already know the trick, and leaves. It converts the site's best asset — a real, measured
methodological failure — into entertainment, and the person it convinces may be the person who was
never going to publish a disturbance metric anyway. It produces no artifact anyone uses in their own
work beyond a sentence.

The counter is that the sentence is the point, and that the alternative products serve 30–60 people
a year or nobody. But if Task 1's measurement is marginal, this argument should be re-read before
continuing.

## Prediction this product rests on

Naive readers call the direction wrong on at least half of the hard cards, **and readers who have
read the site's existing explanation first still get at least a quarter of them wrong.**

The second clause is load-bearing. If reading the confound in prose already inoculates people, the
drill is redundant and the site should just write the sentence better. Task 1 cannot test this —
only humans can — but Task 1 determines whether there are cards to test it with.
