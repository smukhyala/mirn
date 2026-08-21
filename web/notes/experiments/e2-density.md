---
id: e2-density
page: 6
part: 3
title: Fill the corridor
subtitle: Two true answers, pointing opposite ways
introduces: []
uses: [run, deviation, seed, perturbation, uncertainty]
shows: >
  An invented crowd growing from {{lit:4 people}} to {{lit:44 people}} in one corridor, and two
  measurements of that room — the robot's effect, and the room's own churn — moving differently as
  it fills.
try: >
  Turn the people dial up to {{lit:44 people}} and watch how much of the movement on screen has
  nothing to do with the robot.
reader_can: >
  Say what happens to one person's deviation as the room fills, and what happens to the room's
  total, without pretending those are the same question. Explain why a robot can be reaching more
  people and be no easier to catch doing it. Refuse a deviation figure that arrives without the
  run-to-run band beside it.
---

How many people are in the corridor has been a setting all along, underneath every number on this
site. Here it is the question. Drag it down to {{lit:4 people}} and the robot crosses a nearly empty
room; drag it up to {{lit:44 people}} and there is barely a gap to walk through. Guess first: does
the robot shift any one person further in the packed corridor, or in the empty one?

```mirn:scene
id: density-dial
preset: corridor-11
controls: [play, crowdSize, showControl]
caption: >
  The same corridor with the crowd size on a dial. The robot's route and speed do not change. Turn
  the dial up and watch how much of the movement has nothing to do with it.
```

## What one person does

At {{lit:4 people}} the average deviation across the crowd is
{{q:e2_density[nPedestrians=4].meanDeviationM}}. At {{lit:32 people}} it is
{{q:e2_density[nPedestrians=32].meanDeviationM}}, the largest reading anywhere on the sweep. At the
top of the dial, {{lit:44 people}}, it reads {{q:e2_density[nPedestrians=44].meanDeviationM}} — a
turn down eight runs per point cannot settle. The scatter between individual runs is
{{q:e2_density[nPedestrians=44].meanDeviationM_sd}} at {{lit:44 people}} and
{{q:e2_density[nPedestrians=32].meanDeviationM_sd}} at {{lit:32 people}}, and the dip is the same
size as those. A packed corridor holding people in place is a physically sensible story, and this
measurement is not evidence for it. The wiggles in a curve like this one are not the curve.

Deviation is one person at one moment. Average it over the crossing for each person, add those up
across the room, and you have the robot's perturbation of that room, counted in person-metres:
{{q:e2_density[nPedestrians=4].totalPersonMetres}} at {{lit:4 people}},
{{q:e2_density[nPedestrians=44].totalPersonMetres}} at {{lit:44 people}}. Both readings agree with
the intuitive answer. If the story ended here, so would the page.

## The second reading

Every figure above is a mean over eight runs, each with a different crowd and a different seed, and
those runs disagree with each other.

Take the robot out of the room and run the same crowd again, changing nothing but the stream of
small wobbles: the same person at the same moment ends up somewhere slightly different. Average that
distance over everybody and the whole crossing, do it for every pair of robot-free runs, and take
the high end. Call it the band — how far apart two runs of this room land for no reason at all, and
the uncertainty attached to every deviation figure here: how much the answer would have moved if the
world had rolled differently.

The band measures the room, not the robot, so it has its own curve:
{{q:e2_density[nPedestrians=4].runToRunBandM}} at {{lit:4 people}},
{{q:e2_density[nPedestrians=44].runToRunBandM}} at {{lit:44 people}}.

```mirn:sweep
experiment: e2_density
x: nPedestrians
series:
  - key: meanDeviationM
    label: what the robot does to the average person
    accent: true
  - key: runToRunBandM
    label: how far apart two robot-free runs land
caption: >
  Two measurements of the same room at each crowd size, both in metres, each a mean across eight
  crowds. The second line is built from robot-free runs, so the robot appears in one of these curves
  and not the other.
```

Now divide one curve by the other. The metres cancel and what is left is a plain count: how much
effect there is per unit of ordinary variation, the only form in which a deviation figure means
anything by itself. Counted in bands, the effect is {{q:e2_density[nPedestrians=4].signalToBand}} at
{{lit:4 people}}, {{q:e2_density[nPedestrians=12].signalToBand}} at {{lit:12 people}}, and
{{q:e2_density[nPedestrians=44].signalToBand}} at {{lit:44 people}}. The sweep records no spread for
this ratio, so a step from one point to its neighbour is not worth reading; the span from one end of
the dial to the other is. Across that span the ratio sags rather than climbs, and it sits near one
the whole way: the robot's effect on the average person and the room's own churn come out about the
same size at every crowd size on the dial.

```mirn:sweep
experiment: e2_density
x: nPedestrians
series:
  - key: signalToBand
    label: effect per unit of ordinary variation
    accent: true
caption: >
  The first curve divided by the second, at each crowd size. The units cancel, so this axis has
  none. A value of one means the robot's effect and the room's own churn are the same size.
```

## Both answers are true

Take this section and the one before it as a single finding, not as two rival ones. The robot is
reaching more people, and it is no easier to catch doing it in a full room than in an empty one.
Those two sentences do not contradict each other, and neither one has to give way.

In a nearly empty corridor the robot is the only thing that happens, but its effect there is the
smallest reading on the sweep as well. Fill the corridor and people spend the entire crossing
shoving each other: two runs of the packed room already look quite different from one another before
you put a robot anywhere near them. The robot's contribution grew. Taken from one end of the sweep
to the other, the pile of everything else it has to be picked out of grew faster — though not at
every step along the way.

So the rooms where a robot matters most to the people in them are not rooms where its effect is any
easier to demonstrate. Crowded corridors are not an edge case for this measurement. They are the
deployment.

:::caveat
In this crowd, how hard two people push each other apart is one constant in a social-force model,
and that constant sets the rate at which crowding manufactures variation. What does not depend on
the model is the shape of the problem: every person you add is another source of movement that has
nothing to do with the robot, and lands in the same measurement as the robot's effect.
:::

## Where this leaves the number

The same deviation figure means one thing in an empty room and something else in a packed one, and
nothing in the figure tells you which room it came from. It needs a companion, and the companion is
the band: from here on, a deviation reported without one is not a result. It is a number.

Which leaves one question — how do you measure the band honestly? Take the robot out of the room,
split the crowd into two halves, ask for a difference you already know is nothing, and find that it
does not answer zero.
