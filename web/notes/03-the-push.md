---
id: the-push
page: 3
part: 1
title: What the robot actually does
subtitle: The part you chose and the part done to you
introduces: [control-input, disturbance, recovery]
uses: [run, trajectory, nominal-trajectory, deviation, state, seed]
shows: >
  The same invented crowd, and one person's gap opening and closing again as the robot passes.
try: >
  Drag the slider under the figure slowly through the middle of the run, following one person
  rather than the whole crowd, and switch "Show the gap" off and back on to see which two marks it
  joins.
reader_can: >
  Split any moment of somebody's walking into the part they steered and the part that was done to
  them. Predict, before pressing play, that a deviation curve rises to a top and then falls. Say
  what is still there after the robot has gone, and why this room leaves anything there at all.
---

Pick one person out of the crowd and watch only them. Their gap opens while the robot comes on,
then closes again. Deviation is not a step from one value to another. It is a curve with a top, and
you can work out why before running anything.

## Two terms, and only one of them is theirs

Two things move that person, and separating them is the whole job of this page.

The first is steering: at every tick they are pulled toward wherever they are going, at the speed
they meant to walk, from their state and nothing else.

:::term{id=control-input}

The second is everything in the room shoving them — the people beside them, the wall, the robot.
They did not ask for it and cannot switch it off.

:::term{id=disturbance}

A trajectory is the running sum of those two, and the robot enters only through the second.

## Why the curve has to come back down

The robot's shove depends on how far away it is. It crosses the long way over a {{lit:22 m}} room,
so its distance to any one person falls and then rises again, and the shove does the opposite. That
gives the curve its top.

Once the shove has gone, the person is not where they would have been — and steering is worked out
from state. The pull now aims them across the gap the robot opened. The term the robot never
touched is the term that undoes it.

:::term{id=recovery}

So the prediction is up, over, down. Make it before you watch.

```mirn:scene
id: push-and-recover
preset: corridor-11
controls: [play, scrub, showGaps]
caption: >
  The same room as the last page. Follow one person's gap rather than the whole crowd.
```

## What the curve is worth

Measured instead of watched, the curve is the average gap over everybody in the invented room, not
the one person you followed. Both runs in every pair share a seed, so if the robot changed nothing
it would sit flat at zero the whole way.

With the robot aimed straight down the middle the top is {{q:e4_recovery@0.peakDeviationM}}, a mean
over eight runs with different crowds, and it takes {{q:e4_recovery@0.recoveryS}} to fall to a
quarter of that top and stay under for a second. Both thresholds are ones I picked, and a run that
never got under the quarter leaves that average instead of lengthening it: it is an average over
the crowds that recovered, not over all of them.

By the last tick the fraction of the top that has closed again is
{{q:e4_recovery@0.fractionRecovered}}, and the gap is still {{q:e4_recovery@0.finalDeviationM}}.
Recovery here is partial for a modelling reason rather than a law: steering aims at the goal, not at
the nominal trajectory, so a pushed-aside walker takes a new line to the destination and never
rejoins the old path. They also stop steering within {{lit:0.7 m}} of the goal, so two runs can park
in different spots inside the same disc.

## Moving the line

Slide the robot's line sideways and the whole story replays at a different closest distance.

```mirn:sweep
experiment: e4_recovery
x: passingOffsetM
series:
  - key: peakDeviationM
    label: the top of the curve
    accent: true
  - key: finalDeviationM
    label: what is still there at the last tick
caption: >
  Eight runs per point, the robot aimed {{lit:0}} to {{lit:3 m}} off the centre line. They scatter
  by {{q:e4_recovery[passingOffsetM=0].peakDeviationM.sd}} around the leftmost peak and
  {{q:e4_recovery[passingOffsetM=3].peakDeviationM.sd}} around the rightmost, wide enough to
  overlap the neighbouring settings, so read the two ends against each other rather than any
  single point.
```

Read that way, the top of the curve sits lower at the far end than at the near one, which is what a
shove depending on distance would predict. It does not fall step by step — one middle setting sits
above the setting before it — and what is left at the last tick does not track the offset at all.

:::caveat
In this crowd, the pace at which steering wins a pushed-aside walker back is one invented number: a
{{lit:0.5 s}} relaxation time, chosen because it produces something that looks like people. What does not depend on it is
that the curve has a top and comes down at all, which follows from the robot leaving — and every
robot leaves. The ruler is real. The room is invented.
:::
