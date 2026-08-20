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
reader_can: >
  Sort what they have just read into the part that would still hold in a real corridor and the part
  that would not. State the objection to this whole site in one sentence, and say why it is fatal to
  a finding and harmless to a lesson. Find the research these pages were cut down from.
---

Nothing here is real except the arithmetic, and the arithmetic is the part worth taking with you.

The room is {{lit:22 m}} long and does not exist. The people in it are dots that steer toward a
goal, push away from each other, and take a small random nudge every {{lit:0.05 s}}. The robot is a
dot with a planner. I wrote all of it and I chose every constant in it.

## Mechanism and model

Two different kinds of claim have gone past you, and they leave with different standing.

A **mechanism** is a fact about the measuring apparatus. A measurement has a floor, because two runs
of the same crowd with no robot anywhere already disagree, and an effect smaller than that
disagreement cannot be told apart from it. A number built by subtracting a forecast from what
happened grows when the forecast gets worse, including on a run where nobody responded to the robot
and the true effect is exactly zero by construction. A measurement that has never been handed a
question whose answer was already known has not been checked. None of those three sentences mentions
a crowd. They are facts about estimators, and they hold wherever you point one — at people in a real
corridor, at cars, at anything you cannot rerun.

A **model** is a fact about this crowd. How hard people push away from each other and how fast that
push fades with distance, the width of the room, the shape of the noise, what the robot's planner is
trying to do: I picked them. They are as arbitrary as they look.

The detection floor, the confound and the placebo test are mechanisms. Everything you can read off a
curve is model.

## Direction and magnitude

Magnitude does not survive the trip. No number on this site is an estimate of anything outside this
site. If you carry one figure out of these pages and repeat it about a real robot, you are repeating
a choice I made about how fast a force falls off.

Direction is the interesting case, because it splits in two.

Some directions are arithmetic. Make the forecast worse and the reported perturbation climbs, because
that number is a distance between a guess and a fact, and a worse guess is further from the fact
whatever the crowd is doing. Roll the same forecast further ahead and its error on a crowd nobody
was pushing climbs with it, because a straight line extended further leaves the walker further
behind. Those you can carry.

Other directions are mine. Whether deviation grows or shrinks as the room fills up, how much of it
recovery takes back, how far from the robot the effect still reaches: each of those is a consequence
of the force law I wrote. Change the law and the curve changes. Real people are not a force law at
all. Watching a line bend on this site tells you the shape of my code, which is worth exactly as much
as my code is.

## What a made-up crowd is for

A real corridor never tells you what the answer was. You get one version of events, the one that
happened, and the counterfactual — the same walk with the robot absent — does not exist to be
measured. So there is nothing to grade the measurement against, and a wrong measurement in a real
corridor looks exactly like a right one. An invented crowd hands you both versions. That makes it the
one place where a way of measuring can be given a question whose answer is already known, and caught
getting it wrong. It is why the null, the floor and the placebo test are here rather than in a field
study, and every method on these pages was graded that way before you were shown it.

:::caveat
The price of that is total, and it is worth saying plainly. I wrote the rule that decides how a
person in this room responds to a robot, and then I measured how people in this room respond to
robots. The answer was in the code before the measurement ran. A crowd I designed is exactly the kind
of environment that turns the research question into a circle, and more seeds do not get you out of a
circle. This is a teaching device and not a finding. Nothing on this site may be cited as one.
:::

## Where this came from

MIRN began as a research measurement instrument rather than a lesson. The argument it was built to
make is that the disturbance a robot causes is currently misestimated three ways: the comparison is
against a robot standing still rather than a robot absent, the usual number mixes the robot's effect
together with the forecaster's error, and no floor has been established to say when a reported effect
is big enough to be worth believing. Those are the counterfactual, the confound and the detection
floor you have just spent nine pages on, with the citations taken out and a crowd put in.

The reading and the literature assessment are in `docs/research/`, the design decisions in
`docs/superpowers/`. They are unedited, they are written for someone who already knows the field, and
where a claim could not be traced to a primary source it is marked as unverified rather than tidied
away. If something here matters to you, that is where to check it.

Every plotted curve on these pages is a sweep out of `results/experiment-facts.json`, and you can
read that file without me. Each point on one is a mean over repeated runs of the same room at that
setting — eight of them wherever a spread is quoted — and the uncertainty you saw quoted is that
spread across those runs and nothing else. The canvases are the exception: each of those is one run,
rebuilt in your browser from the seed on the dial. No figure was drawn by hand.

The ruler is real. The room is invented. Learn the ruler.
