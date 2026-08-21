---
id: colophon
page: 10
title: What is real here and what is not
subtitle: What survives leaving this room
introduces: []
uses:
  [
    run,
    seed,
    deviation,
    disturbance,
    recovery,
    perturbation,
    uncertainty,
    the-null,
    detection-floor,
    counterfactual,
    estimator,
    confound,
    placebo-test,
  ]
shows: >
  Everything in this invented room sorted into the part that would still hold in a real corridor
  and the part that is only my code.
reader_can: >
  Sort what they have just read into the part that would still hold in a real corridor and the part
  that would not. State the objection to this whole site in one sentence, and say why it is fatal to
  a finding and harmless to a lesson. Find the research these pages were cut down from.
---

Nothing here is real except the arithmetic, and the arithmetic is the part worth taking with you.

The room is {{lit:22 m}} long and does not exist. The people in it are dots that steer toward a
goal, push away from each other, and take a small random nudge every {{lit:0.05 s}}. The robot is a
dot with a planner. I wrote all of it and chose every constant in it.

## Mechanism and model

A **mechanism** is a fact about the measuring apparatus. A measurement has a floor, because two
runs of the same crowd with no robot anywhere already disagree, and an effect smaller than that
disagreement cannot be told apart from it. A number built by subtracting a forecast from what
happened grows when the forecast gets worse, even where the true effect is zero by construction. A
measurement never handed a question whose answer was already known has not been checked. None of
those sentences mentions a crowd; they hold wherever you point an estimator.

A **model** is a fact about this crowd: how hard people push away from each other, the width of the
room, the shape of the noise, what the planner is trying to do. I picked all of it. So the
detection floor, the confound and the placebo test travel, and every magnitude on these pages stays
here. Repeat one of my figures about a real robot and you are repeating a choice I made about how
fast a force falls off.

Directions are the mixed case. Make the forecast worse and the reported perturbation climbs,
because that number is a distance between a guess and a fact: carry that one. Whether deviation
grows or shrinks as the room fills up, and how much of it recovery takes back, follow from the
force law I wrote — and real people are not a force law.

## What a made-up crowd is for

A real corridor never tells you what the answer was. You get the version of events that happened,
and the counterfactual does not exist to be measured, so a wrong measurement looks exactly like a
right one. An invented crowd hands you both versions. It is the one place where a way of measuring
can be given a question whose answer is already known and caught getting it wrong, which is why the
null, the floor and the placebo test are here rather than in a field study.

:::caveat
The price of that is total. I wrote the rule that decides how a person in this room responds to a
robot, and then I measured how people in this room respond to robots. The answer was in the code
before the measurement ran. That turns the research question into a circle, and more seeds do not
get you out of a circle. This is a teaching device and not a finding. Nothing on this site may be
cited as one.
:::

## Where this came from

MIRN began as a research measurement instrument rather than a lesson. Its argument was that the
disturbance a robot causes is misestimated three ways, and those three ways are the
counterfactual, the confound and the detection floor you have just spent nine pages on, with the
citations taken out and a crowd put in. The reading sits in `docs/archive/`, with anything that
could not be traced to a primary source marked unverified rather than tidied away.

Every plotted curve here is a sweep out of `web/data/experiment-facts.json`, which you can read
without me: each point is a mean over repeated runs of the same room, eight wherever an uncertainty
is quoted, and that spread is all the uncertainty means. Each canvas is one run, rebuilt in your
browser from the seed on the dial.

The ruler is real. The room is invented. Learn the ruler.
