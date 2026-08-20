---
id: the-guess
page: 8
part: 4
title: The run you cannot have
subtitle: What is left when the second world goes away
introduces: [counterfactual, estimator, confound]
uses: [run, trajectory, nominal-trajectory, deviation, state, seed, recovery, divergence, perturbation, the-null, detection-floor]
reader_can: >
  Say in one sentence why the measurement used on every earlier page is unavailable in a real
  corridor. Describe the forecaster that stands in for it, and name what its number contains
  besides the robot. Read the squeeze chart and say why no choice of forecast horizon rescues it.
---

Everything you have done on this site has depended on something you cannot have.

Every deviation you have read, every peak, every recovery you have watched settle back down: all of
it came from holding one person's two paths side by side and measuring the gap between them. That
needs the second path. You have had it because this room is invented and I can invent it twice —
the same people, the same starting states, the same seed, and no robot in it.

Nobody has it outside a simulation. A person walks past a robot in a real corridor once. There is
no second corridor.

So take it away. Delete the faint dashed paths from every canvas you have looked at. What is left
is one trajectory per person: where they went, with a robot in the room, and nothing to hold it
against.

The thing that just disappeared has a name.

:::term{id=counterfactual}

The nominal trajectory was the counterfactual, handed over for free. On this site it is a line on
a canvas. In a corridor it is not a hard measurement. It is not a measurement at all — nothing
recorded that day contains it, and no amount of care with the cameras would have caught it.

## The stand-in

A number still has to be reported. So the missing path gets built rather than observed.

Watch each person for a moment. Fit a velocity to the last stretch of their trajectory, roll it
forward on the assumption that they carry straight on, and you have a predicted path sitting where
the nominal trajectory used to be. Then measure the gap between the prediction and the path they
actually walked, using the same divergence you have used all along, and report that.

The ruler has not changed. What changed is the second path you hold it against: not the run without
the robot, which nobody has, but a guess about where the person was going.

A rule of that shape has a name.

:::term{id=estimator}

The paired comparison from the earlier pages is an estimator too, and an odd one, because it does
not estimate anything — it observes both paths and subtracts. The forecaster has to guess, so the
question worth asking is what the guess contains.

It contains the robot. It also contains every other reason a person does not walk in a straight
line: turning toward a door, slowing to let somebody through, stepping around a bag on the floor,
changing their mind. All of that would be in the number with no robot in the room at all. The
measurements of robot-induced perturbation we have read take this shape, in one form or another.

## Point it somewhere the answer is already known

The previous page took a reading where there was definitely nothing to find, and the ruler said
something anyway. Do that again, to this estimator specifically.

There is a version of this room where the robot crosses exactly as it always does and nobody
responds to it: the people are given no sight of it. They walk their nominal trajectories, every
one of them, to the last step. The robot's effect on that crowd is zero — by construction, not by
measurement.

Now point the forecaster at that run. Every metre it reports there is its own error and nothing
else. Call that its zero-effect floor. It is a null in the sense the previous page gave that word —
a reading taken where the answer is known to be nothing — though it is built differently: there the
room had no robot in it, here the robot crosses and nobody responds. The detection floor that comes
out of it belongs to this one estimator rather than to the measurement as a whole.

That leaves one knob. The forecast horizon is how far ahead the prediction is rolled before it is
checked against what happened. Sweep it, and take three numbers at every setting: what the
forecaster reports on the ordinary run, what it reports on the run nobody responded to, and what
the paired comparison says the robot actually did.

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

The coloured line is the truth, and it is flat. The robot's effect on this crowd is
{{q:confounding_squeeze@first.trueEffectM}}, and it does not depend on the horizon, because the horizon
is a setting on the measurement and not a fact about the room.

The other two lines run close together for the whole width of the chart.

At the short end the ratio of what the forecaster reports to its own zero-effect floor sits
furthest from one. At {{lit:0.2 s}} it reads
{{q:confounding_squeeze@first.reportsOverFloor}}. That is not evidence of the robot
showing through. No seed spread was recorded for this sweep, and along the axis the ratio lands on
both sides of one, so wandering off one is what the ratio does anyway. Then look at the quantity
itself: at that setting the forecaster reports
{{q:confounding_squeeze@first.reportsM}}, on a crowd whose actual deviation is
{{q:confounding_squeeze@first.trueEffectM}}. Nothing anybody would write down comes out of that end of
the axis.

At the long end the number finally looks like a result. The forecaster reports
{{q:confounding_squeeze@last.reportsM}} at {{lit:3 s}}. On the run where nobody
responded to the robot, the same forecaster at the same horizon reports
{{q:confounding_squeeze@last.zeroEffectFloorM}}.

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

Across every horizon on this axis the ratio takes values from
{{q:confounding_squeeze.reportsOverFloor.min}} to {{q:confounding_squeeze.reportsOverFloor.max}}.
There is no horizon at which the forecaster both resolves the effect and reports something worth
having.

## Not inflated. Unhooked.

It would be easier if the number were simply too big. A number that is too big by a known factor is
still usable: work out the factor, divide, publish the quotient with an apology in the appendix.

This one does not carry a factor. Read the two charts together. The truth held still across the
entire axis — same crowd, same robot, same seeds, and the paired comparison returns the same value
at every point. The reported number moved anyway, and what it moved with was the forecaster.

That is a specific kind of failure, and it has a name.

:::term{id=confound}

The forecaster's own error is the confound. It is inside the reported number, it responds to a knob
on the measurement rather than to anything in the room, and nothing about it distinguishes a robot
from a doorway.

Which matters most when somebody tries to improve the robot against it. There are two ways to drive
a forecast residual down. One is to stop pushing people, so they carry straight on and the
straight-line prediction comes true. The other is to push them along paths a straight-line
predictor happens to get right: approach steadily from in front, take the wide smooth arc, be
boring. The second is easier, and it is the one the residual rewards.

A robot tuned to make that number small would not be learning to bother people less. It would be
learning to move predictably.

## What this does not settle

It is not a criticism of the forecaster as a forecaster. Predicting where a walking person will be
in a second is a reasonable thing to be good at. It is being asked a
different question — what would this person have done — and a single observed trajectory does not
contain the answer to that question, no matter who is holding it.

Nor does this hand anybody a replacement. The paired comparison is not available in a corridor
either; that was the first paragraph on this page. What the chart rules out is treating the
forecast residual as a stand-in for it and reporting the result as the robot's effect. What to do
instead has to come from somewhere else: a control condition you actually arrange, rather than one
you compute after the fact.

:::caveat
In this crowd the forecaster is the simplest one there is — fit a velocity to the last two
observations and extend the line. A stronger predictor may sit on a different floor; we have not
measured one here. What does not depend on the choice of predictor is the arithmetic: the reported
number is what happened minus what was predicted, so the predictor's error is inside it whichever
predictor you use, and the only way to know how much of the number is error is to take a reading
where the answer is known to be nothing.
:::
