---
id: e2-density
page: 6
part: 3
title: Fill the corridor
subtitle: Two true answers, pointing opposite ways
introduces: []
uses: [run, deviation, seed, perturbation, uncertainty]
reader_can: >
  Say what happens to one person's deviation as the room fills, and what happens to the room's
  total, without pretending those are the same question. Explain why a robot can be reaching more
  people and be no easier to catch doing it. Refuse a deviation figure that arrives without the
  run-to-run band beside it.
---

How many people are in the corridor has been a setting all along, sitting quietly underneath every
number on this site. Here it becomes the question. Drag it down to {{lit:4 people}} and the room is
nearly empty; the robot crosses it and meets almost nobody. Drag it up to {{lit:44 people}} and
there is barely a gap to walk through.

Guess before you touch it. In the packed corridor, is the robot's effect on any one person bigger
or smaller than in the empty one?

```mirn:scene
id: density-dial
preset: corridor-11
controls: [play, crowdSize, showControl]
caption: >
  The same corridor with the crowd size on a dial. The robot's route and the robot's speed do not
  change. Turn the dial up and watch how much of the movement on screen has nothing to do with it.
```

## What one person does

Here is the per-person answer, and it is the one most people guess.

At {{lit:4 people}} the average deviation across the crowd is
{{q:e2_density[nPedestrians=4].meanDeviationM}}. At {{lit:32 people}} it is
{{q:e2_density[nPedestrians=32].meanDeviationM}}, the largest reading anywhere on the sweep. At the
top of the dial, {{lit:44 people}}, it reads {{q:e2_density[nPedestrians=44].meanDeviationM}}, and
the last section of this page is about that turn.

Deviation is one person at one moment. Average it over the whole crossing for each person, then add
those up across everybody in the room, and you have the robot's perturbation of that room, counted
in person-metres. At {{lit:4 people}} that total is
{{q:e2_density[nPedestrians=4].totalPersonMetres}}. At {{lit:44 people}} it is
{{q:e2_density[nPedestrians=44].totalPersonMetres}}.

From one end of the dial to the other the intuitive answer holds, and both readings agree on it. A
robot in a busy corridor reaches many people and shifts each of them a good deal; a robot in an
empty one has hardly anybody to reach. If the story ended here it would be a short page.

## The second reading

Every figure above is an average over eight runs of this corridor, each with a different crowd and
a different seed. Those runs do not agree with each other, and how much they disagree is a
measurement in its own right.

Take the robot out of the room entirely. Run the same crowd again from the same starting places,
changing nothing but the stream of small wobbles. The same person at the same moment ends up
somewhere slightly different in the two runs, because a different set of wobbles piled up along the
way. Average that distance over everybody and across the whole crossing, do it for every pair of
robot-free runs you have, and take the high end of what comes back. Call it the band: how far apart
two runs of this room land for no reason at all. It is the uncertainty attached to every deviation
figure on this page — how much the answer would have moved if the world had rolled differently.

The band is a measurement of the room, not of the robot, so it has its own curve.

At {{lit:4 people}} the band is {{q:e2_density[nPedestrians=4].runToRunBandM}}. At
{{lit:44 people}} it is {{q:e2_density[nPedestrians=44].runToRunBandM}}.

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
  Two measurements of the same room at each crowd size, both in metres. Every point on either
  line is a mean across eight different crowds. The second line is built from robot-free runs
  only, and the robot therefore appears in one of these curves and not the other.
```

Now divide one curve by the other. The metres cancel and what is left is a plain count: how much
effect there is per unit of ordinary variation. It is the only form in which a deviation figure
means anything by itself, and this page is where that stops being a pedantic remark.

At {{lit:4 people}} the effect, counted in bands, is {{q:e2_density[nPedestrians=4].signalToBand}}.
At {{lit:8 people}} it is {{q:e2_density[nPedestrians=8].signalToBand}}. It stays where it started
as the room fills: {{q:e2_density[nPedestrians=12].signalToBand}} at {{lit:12 people}},
{{q:e2_density[nPedestrians=32].signalToBand}} at {{lit:32 people}}. At {{lit:44 people}} it is
{{q:e2_density[nPedestrians=44].signalToBand}}.

Every point on that line sits near one, and the sweep records no run-to-run spread for this ratio,
so the movements between neighbouring points are not worth reading. What the plot supports is a
flat line at about one, all the way across: at every crowd size on the sweep, the robot's effect on
the average person and the room's own churn come out about the same size.

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

In a nearly empty corridor the robot is the only thing that happens, and two runs of that room do
land closer together than two runs of any other room on the sweep. That still does not hand you the
robot's effect by elimination, because the robot's effect in that room is the smallest reading on
the sweep as well. Fill the corridor and people spend the entire crossing shoving each other. Two
runs of the packed room already look quite different from one another before you put a robot
anywhere near them.

The robot's contribution grew. Taken from one end of the sweep to the other, the pile of everything
else it has to be picked out of grew faster — though not at every step along the way.

That is worth saying in the other direction too, because it is the part that stings: the rooms
where a robot matters most to the people in them are not rooms where its effect is any easier to
demonstrate. The effect climbs most of the way across the dial and the ratio does not follow it up.
Crowded corridors are not an edge case for this measurement. They are the deployment.

:::caveat
In this crowd, how hard two people push each other apart is one constant in a social-force model,
and that constant sets the rate at which crowding manufactures variation. Change it and the two
curves sit differently against each other. What does not depend on the model is the shape of the
problem: every person you add is another source of movement that has nothing to do with the robot,
and every one of them lands in the same measurement as the robot's own effect.
:::

## The last point on the curve

The per-person curve turns down at the right-hand end. Do not read it as a finding.

The dip is the gap between the last two points on the accent line. The scatter between individual
runs is {{q:e2_density[nPedestrians=44].meanDeviationM_sd}} at {{lit:44 people}} and
{{q:e2_density[nPedestrians=32].meanDeviationM_sd}} at {{lit:32 people}}, and the dip is the same
size as those. Eight runs per point cannot settle a gap of that size. A packed corridor holding
people in place is a physically sensible story, and this measurement is not evidence for it. The
wiggles in a curve like this one are not the curve.

## Where this leaves the number

You have already met the band once, as a second line on a plot with no robot behind it. This page
is where it stops being a curiosity. The same deviation figure means one thing in an empty room and
something else in a packed one, and nothing in the figure tells you which room it came from.

So the figure needs a companion, and the companion is the band. From here on, a deviation
reported without one is not a result. It is a number.

Which raises the obvious question, and Part IV is about nothing else. If everything now rests on
the band, how do you measure the band honestly? You take the robot out of the room altogether,
split the crowd into two halves, and ask the measurement to report on a difference you already know
is nothing. Then you find out that it does not answer zero.
