---
id: the-push
page: 3
part: 1
title: What the robot actually does
subtitle: The part you chose and the part done to you
introduces: [control-input, disturbance, recovery]
uses: [run, trajectory, nominal-trajectory, deviation, state, seed]
reader_can: >
  Split any moment of somebody's walking into the part they steered and the part that was done to
  them. Predict, before pressing play, that a deviation curve rises to a top and then falls. Say
  what is still there after the robot has gone, and why this room leaves anything there at all.
---

Pick one person out of the crowd and watch only them.

Their gap opens. It keeps opening while the robot comes on. Then it stops opening, and closes
again. Deviation is not a step from one value to another. It is a curve with a top.

That shape is not an accident of this crowd, and you can work out why before running anything.

## Two terms, and only one of them is theirs

Two things move that person, and separating them is the whole job of this page.

The first is steering. At every tick they are pointed at wherever they are going and pulled toward
it at whatever speed they meant to walk. The pull is worked out from their state and nothing else:
where they are, how fast they are already going, and where the goal is.

:::term{id=control-input}

The second is everything in the room shoving them — the people beside them, the wall, and the
robot. They did not ask for any of it and they cannot switch it off.

:::term{id=disturbance}

A trajectory is the running sum of those two terms, tick by tick. The robot enters only through
the second one. It reaches the first one later, and only by having already moved the person.

## Why the curve has to come back down

The robot's shove depends on how far away it is. Close in, it dominates. A few metres off, it is
nothing. The robot is crossing the long way over a {{lit:22 m}} room, so its distance to any one
person falls and then rises again — and the shove does the opposite, growing as the robot closes
and dying away as it leaves. That alone gives the curve its top.

Now the part that is worth slowing down for. Once the shove has gone, the person is not where they
would have been — and steering is worked out from state. Their state has changed, so the pull has
changed with it. It is now aiming them across the gap the robot opened. The term the robot never
touched directly is the term that undoes it.

:::term{id=recovery}

So the prediction is: up, over, down. You should be able to make it without watching, and then
check yourself against the canvas.

```mirn:scene
id: push-and-recover
preset: corridor-11
controls: [play, scrub, showGaps]
caption: >
  The same room as the last page. Scrub slowly through the middle of the run and follow one
  person's gap rather than the whole crowd: it opens as the robot comes on, reaches a top, and
  then closes.
```

## What the curve is worth

Here is the same crossing, measured instead of watched. The curve being measured is not the one
person you were just following: at every tick it is the average gap over everybody in the room.
Both runs in every pair share a seed, so none of what follows is the crowd having a different day.

On the default crossing — the robot aimed straight down the middle of the room — the top of that
curve is {{q:e4_recovery@0.peakDeviationM}}. Every figure on this page is a mean over eight runs
with different crowds.

Measured from the top, that average takes {{q:e4_recovery@0.recoveryS}} to fall to a quarter of
the peak and stay under for a second. Both the quarter and the second are thresholds I picked, and
the seconds move if you pick others. Some of the eight runs never got under the quarter before the
clock ran out, and those runs are not in the average — so it is an average over the crowds that
recovered, not over all of them.

By the last tick of the run, the fraction of the top that has closed again is
{{q:e4_recovery@0.fractionRecovered}}.

Which leaves the rest of it standing. The two paths do not land back on top of each other: at the
last tick the gap is still {{q:e4_recovery@0.finalDeviationM}}. Recovery here is partial, not
complete, and the reason is a modelling choice rather than a law.

Steering aims at the goal, not at the nominal trajectory. Once somebody has been pushed aside, the
quickest way to where they were going is a new line, not the old one. They converge on the
destination and never rejoin the path. On top of that, a person in this room stops steering as
soon as they are within {{lit:0.7 m}} of their goal, so two runs can park in different spots
inside the same disc and simply stay there.

## Moving the line

The crossing does not have to go through the middle. Slide the robot's line sideways and the
whole story replays at a different closest distance.

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
  Eight runs per point. The robot is aimed {{lit:0}} to {{lit:3 m}} off the centre line of the
  room, everything else held as it was. The eight runs scatter by
  {{q:e4_recovery[passingOffsetM=0].peakDeviationM.sd}} around the leftmost peak and
  {{q:e4_recovery[passingOffsetM=3].peakDeviationM.sd}} around the rightmost, wide enough to
  overlap the neighbouring settings, so read the two ends against each other rather than any
  single point.
```

Across the sweep as a whole, the top of the curve sits lower at the far end than at the near one,
which is what the shove depending on distance would predict. It does not come down step by step,
though. From one setting to the next the tops move by a fraction of the run-to-run scatter at
either of them, and one middle setting sits above the setting before it. The two ends are the only
comparison this sweep supports.

The second series does not give even that. What is left at the last tick does not track the offset,
and the run-to-run scatter is wide enough that I would not read a trend into it either way.

:::caveat
In this crowd, the pace at which steering wins a pushed-aside walker back is one invented number — a
{{lit:0.5 s}} relaxation time, chosen because it produces something that looks like people. Change
it and the curve gets steeper or slacker. What does not depend on it is that the curve has a top
and comes down at all: that follows from the robot leaving, which every robot does. The ruler is
real. The room is invented.
:::
