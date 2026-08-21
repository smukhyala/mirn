---
id: the-guess
page: 8
part: 4
title: The run you cannot have
subtitle: What is left when the second world goes away
introduces: [counterfactual, estimator, confound]
uses: [run, trajectory, nominal-trajectory, deviation, state, seed, recovery, divergence, perturbation, the-null, detection-floor]
shows: >
  The invented crowd with its second world taken away, and what is left to measure against when
  each person has walked exactly one path.
try: >
  Click one of the numbers with a dotted underline in the text below the first chart. A note opens
  under that line, naming the sweep the number came from and how many runs went into it.
reader_can: >
  Say in one sentence why the measurement used on every earlier page is unavailable in a real
  corridor. Describe the forecaster that stands in for it, and name what its number contains
  besides the robot. Read the squeeze chart and say why no choice of forecast horizon rescues it.
---

Everything on this site has depended on something you cannot have. Every deviation you have read,
every recovery you have watched settle back down, came from holding one person's two paths side by
side. You have had the second path only because this room is invented and I can invent it twice:
same people, same states, same seed, no robot. A person walks past a robot in a real corridor once.
Take that path away and one trajectory per person is left, with nothing to hold it against.

The thing that just disappeared has a name.

:::term{id=counterfactual}

The nominal trajectory was the counterfactual, handed over for free. Nothing recorded in a real
corridor contains it, and no care with the cameras would have caught it.

## The stand-in

A number still has to be reported, so the missing path gets built rather than observed. Fit a
velocity to the last stretch of somebody's trajectory, roll it forward on the assumption that they
carry straight on, and the predicted path sits where the nominal trajectory used to be. Measure the
gap between that prediction and the path they actually walked, with the same divergence as before.
The ruler has not changed. The second path you hold it against is now a guess.

A rule of that shape has a name.

:::term{id=estimator}

The paired comparison from the earlier pages is an estimator too, and an odd one, because it does
not estimate anything — it observes both paths and subtracts. The forecaster has to guess, so the
question is what the guess contains. It contains the robot. It also contains every other
reason a person does not walk in a straight line: turning toward a door, stepping around a bag,
changing their mind. All of that would be in the number with no robot in the room. The measurements
of robot-induced perturbation we have read take this shape.

## Point it somewhere the answer is already known

There is a version of this room where the robot crosses as it always does and the people are given
no sight of it. Its effect on that crowd is zero by construction, so every metre the forecaster
reports there is its own error. Call that its zero-effect floor. It is the null of the last page in
a different shape, and the detection floor that comes out of it belongs to this one estimator.

One knob is left: the forecast horizon, how far ahead the prediction is rolled before it is
checked. Sweep it, and take three numbers at every setting — what the forecaster reports, what it
reports on the run nobody responded to, and what the paired comparison says the robot actually
did.

```mirn:sweep
experiment: confounding_squeeze
x: horizonS
series:
  - key: trueEffectM
    label: what the robot actually did
    accent: true
  - key: reportsM
    label: what the forecaster reports
  - key: zeroEffectFloorM
    label: what it reports with nobody responding
caption: >
  Eight seeds per point. The same crowd, the same robot and the same seeds at every point on the
  axis; the only thing changing left to right is how far ahead the forecast is rolled.
```

The coloured line is the truth, and it is flat: the robot's effect on this crowd is
{{q:confounding_squeeze@first.trueEffectM}} at every horizon, because the horizon is a setting on
the measurement rather than a fact about the room.

The other two lines run close together for the whole width of the chart. At {{lit:0.2 s}} the
forecaster reports {{q:confounding_squeeze@first.reportsM}} on a crowd whose actual deviation is
{{q:confounding_squeeze@first.trueEffectM}}. At {{lit:3 s}} it reports
{{q:confounding_squeeze@last.reportsM}}, which finally looks like a result — and where nobody
responded, it reports {{q:confounding_squeeze@last.zeroEffectFloorM}}.

```mirn:sweep
experiment: confounding_squeeze
x: horizonS
series:
  - key: reportsOverFloor
    label: reported effect, divided by the same forecaster's zero-effect floor
caption: >
  One line, and it is the argument. A value of one means the reported number is entirely the
  forecaster's own error, with no contribution from the robot at all.
```

Across this axis the ratio takes values from {{q:confounding_squeeze.reportsOverFloor.min}} to
{{q:confounding_squeeze.reportsOverFloor.max}}. No seed spread was recorded for this sweep, so its
wander is not something to read. What is readable is that no horizon both resolves the effect and
reports something worth having.

## Not inflated. Unhooked.

A number too big by a known factor can be divided out. This one carries no factor: the truth held
still across the whole axis and the reported number moved anyway, with the forecaster. That is a
specific kind of failure, and it has a name.

:::term{id=confound}

The forecaster's own error is the confound. It is inside the reported number, it responds to a knob
on the measurement rather than to anything in the room, and nothing about it distinguishes a robot
from a doorway.

That matters most when somebody tunes a robot against it. There are two ways to drive a forecast
residual down. One is to stop pushing people, so they carry straight on and the straight-line
prediction comes true. The other is to push them along paths a straight-line predictor happens to
get right: approach steadily from in front, take the wide smooth arc, be boring. The second is
easier, and it is the one the residual rewards. A robot tuned to make that number small would be
learning to move predictably rather than to bother people less.

## What this does not settle

It is not a criticism of the forecaster as a forecaster. Predicting where a walking person will be
in a second is a reasonable thing to be good at. It is being asked a different question — what
would this person have done — and a single observed trajectory does not contain the answer, no
matter who is holding it.

So the chart rules out treating that residual as a stand-in for the run you cannot have. It hands
nobody a replacement: the paired comparison is not available in a corridor either. What to do
instead has to come from somewhere else — a control condition you actually arrange, rather than one
you compute after the fact.

:::caveat
In this crowd the forecaster is the simplest one there is, and a stronger predictor may sit on a
different floor; we have not measured one. What does not depend on the predictor is the arithmetic.
The reported number is what happened minus what was predicted, so the predictor's error is inside
it whichever predictor you use, and the only way to know how much of it is error is to take a
reading where the answer is already known to be nothing.
:::
