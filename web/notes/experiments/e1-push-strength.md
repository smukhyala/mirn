---
id: e1-push-strength
page: 6
part: 3
title: Push harder
subtitle: The experiment whose answer you already know
introduces: []
uses: [run, trajectory, nominal-trajectory, deviation, state, seed, disturbance, perturbation]
reader_can: >
  Say why the first thing to do with a new measurement is ask it a question whose answer is
  already known. Read a dose-response curve and describe its shape without claiming either that it
  has flattened or that it is still climbing. Explain why the reading at zero is exactly zero
  rather than nearly zero, and what it would mean about the apparatus if it were not.
---

Before you trust a ruler you lay it against something whose length you already know. If it reads
wrong there, nothing else it says is worth reading, and you will not find that out by measuring
things you cannot check.

This page is that measurement. The robot pushes people out of its way; we are going to turn the
pushing up and watch what the crowd does. Everybody already expects the answer. That is exactly
why it goes first — it is the only kind of result you could recognise as wrong.

## The dial

One number changes on this page, and it is how much space the robot demands: how hard somebody
stops steering toward their goal and starts steering around the robot. In the model it is called
`repulsionScale`, and it multiplies the push a person feels away from the robot when the robot is
near them. It does not change how far off that push starts being felt — only how strong it is
once it is.

Turn it to zero and the robot asks for nothing. Turn it to three and it asks for three times what
it asks for elsewhere on this site — the setting behind every other number here is one, so this
dial sweeps from the robot being ignorable to the robot being three times its usual self.

Nothing else moves. Same room, same crowd, same starting state for every person, same seed for
the run with the robot in it and the run without.

```mirn:scene
id: push-dial
preset: corridor-11
controls: [play, scrub, showControl, repulsionScale]
caption: >
  Solid paths are the run with the robot in it; faint dashed ones are the same people, same seed,
  with no robot at all. Drag the dial to zero and watch the two sets of paths lie on top of each
  other. Drag it to three and watch them come apart.
```

## Guess first

The canvas will not settle this for you. One run at one dial setting is one roll of the dice, and
the thing being asked about is what happens to the whole crowd across many of them. So commit to
an answer before you scroll. Nothing is scored, and your answer goes no further than this browser
— it is kept only so it can be shown back to you beside the result. The only thing a guess buys
you is that you will notice when you are wrong.

```mirn:predict
id: shape-of-the-rise
question: >
  As the robot demands more space, what does the crowd's average deviation do?
options:
  - id: keeps-rising
    label: It rises, and goes on rising.
  - id: levels-off
    label: It rises, then levels off.
  - id: no-effect
    label: Nothing much happens.
```

```mirn:sweep
id: e1-sweep
experiment: e1_push_strength
x: repulsionScale
series:
  - key: meanDeviationM
    label: average deviation per person
    accent: true
  - key: maxDeviationM
    label: the crowd's worst moment in the run
caption: >
  Seven settings of the dial, eight runs at each, one seed per run. Every point is the mean of its
  eight runs; the band around it reaches one spread of those eight either side of the mean.
```

## The zero is exact

Start at the left-hand end of the plot. With the dial at zero, the average deviation across the
crowd is {{q:e1_push_strength.meanDeviationM@0}}.

Not nearly zero. Zero, in all eight runs, to every decimal the readout has.

That reading is worth sitting with, because the robot has not gone anywhere. It is in the room, it
is moving, it drives the length of the corridor, and people walk straight through the space it is
crossing. What the dial turned off is not the robot. It is everybody's response to the robot.

And with the response off, nobody's motion depends on where the robot is. The two runs draw the
same random numbers in the same order from the same seed and produce the same trajectory for
every person — the same, not similar. Each person's nominal trajectory is the path they actually
walked, so the gap between them has nothing to be. A robot nobody responds to is not a
disturbance. It is scenery.

So this zero is not a lucky cancellation that eight runs happened to land on. It is a fact about
the two runs being one computation. Any other reading here would mean the apparatus was leaking:
a random draw consumed on one side and not the other, a difference in the order things are
updated, some arithmetic that changes when there is a robot on screen. That makes it the cleanest
zero on the site, and the first thing to re-run when a later number looks suspicious.

## What the rise looks like

With the dial at half, the average deviation is {{q:e1_push_strength.meanDeviationM@0.5}}. At one
— the setting behind every other number on this site — it is
{{q:e1_push_strength.meanDeviationM@1}}. At the top of the dial,
{{q:e1_push_strength.meanDeviationM@3}}.

The line climbs, and it climbs unevenly. Most of the rise happens in the first two notches — zero
to half, then half to one. Both of those steps stand well outside the scatter of the eight runs
behind them, so neither is an accident of which seeds came up.

From one onward the plot goes quiet. The means keep drifting upward, notch by notch, and they
never turn back. But no step from one setting to the next is even as large as the run-to-run
spread at the setting it lands on, and the steps do not shrink in an orderly way either: of the
final two, the last one is the longer. Eight runs to a setting cannot separate those five points
from each other.

So the honest reading of the right-hand half is that it rises slowly, and that this sweep cannot
tell slow rising apart from flat. Hold its two ends against each other, one against three, and
the climb is there. Cut it into notches and it stops being readable. What the dial does past
three is not something this page knows either, because three is where the sweep stops. A line
that has stopped climbing in a way you can measure has not been shown to have levelled off; it
has been shown to have gone quieter than the measurement.

The second line on the plot is a different reading of the same runs. At every tick, take the gap
between a person's two paths and average it over everybody in the room; the second line is the
worst that average ever gets, at the single moment in a run when the crowd is furthest from where
it would have been. It is a mean of eight, like the first line — a mean of eight worst moments.

With the dial at three, that worst moment is {{q:e1_push_strength.maxDeviationM@3}}. With the
dial at zero it is {{q:e1_push_strength.maxDeviationM@0}}, for the same reason the average was:
with no response there is no gap anywhere in the room, at any moment, to take the worst of.

One run is not this curve. From one and a half onward, the eight runs at a setting spread wide
enough to cover the means of the settings on either side of it, so moving the dial by a single
notch up there and watching one pair of paths would not reliably show you anything. At the bottom
of the dial it would: the step from zero to half is far outside anything the seeds do on their
own. Everywhere above that, the shape lives in the means of eight, and only there.

## Why this one goes first

None of the experiments after this one has an answer you already know. That is what makes them
worth running, and it is also what makes them dangerous: a broken measurement reports nonsense
with exactly the confidence it reports a result, and there is nothing in the number itself to tell
you which you are holding.

So the first job is to hand the instrument a question you could catch it failing. Push harder,
people move further. A reading that stayed flat as the dial turned, or wandered up and down
without pattern, or read the same at zero as at three, would have been a reason to stop and fix
something before reporting anything else on this site. That did not happen. The dial the model
says governs how people respond to the robot is the dial that moves the number this site reports,
and across the seven settings the means never turn back.

That is the whole of what this experiment establishes, and it is the precondition for the rest.
When a later page shows perturbation doing something you did not expect — sitting still where you
thought it would climb, or climbing while the robot is trying to be considerate — the reason to
take it seriously is that the same measurement, in the same room, behaved itself here.

:::caveat
In this crowd, the shape of the curve is the model's doing. A person here responds to the robot
through a single repulsion term with a single length scale, and whatever the top of the dial is
doing — to the extent eight runs a setting can see it at all — is a property of that term, not a
finding about people. What is not the model's doing is the zero, which is exact because two runs
with no response are the same computation, and the reason for running this first, which holds for
any instrument in any room. The ruler is real. The room is invented.
:::
