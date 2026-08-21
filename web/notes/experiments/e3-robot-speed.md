---
id: e3-robot-speed
page: 6
part: 3
title: Hurry up or slow down
subtitle: The one dial where both answers sound obvious
introduces: []
uses: [run, seed, deviation, control-input, disturbance, recovery, uncertainty, near-miss, time-lost]
shows: >
  An invented crowd crossed by a robot whose top speed you set, and two curves — what the crowd
  does, and when the robot arrives — that answer the same question differently.
try: >
  Push the dial marked "robot top speed" to each end of its range and watch how long the robot
  takes to reach the far side: at the bottom of the range the run ends with it still crossing.
reader_can: >
  State what this room did when the robot was allowed to go faster, and say why that is not the
  same as saying what a robot should do. Read a curve that goes up and then comes down without
  reading a story into any single pair of points. Separate the robot's own clock from the crowd's
  deviation, and name which of the two this page measures well.
---

A robot has to get across a room with people in it. You get one dial: a ceiling on how fast it is
allowed to go. It does not steer for the robot — the control input is still the planner's. Both
answers sound obvious, which is the problem. Slow down and you are being careful; speed up and the
robot stops being in the room. Two courtesies, pointing opposite ways.

```mirn:predict
id: e3-guess
question: Should a robot in a crowd hurry up or slow down?
options:
  - id: slower
    label: Slower is politer. Gentler pushes, more time for everyone to react.
  - id: faster
    label: Faster is politer. The robot is out of the room sooner.
  - id: neither
    label: No clear relationship. Speed is not the lever.
caption: >
  Commit before you scroll. Being wrong here is free; skipping the guess is what costs you.
```

## The dial

```mirn:scene
id: speed-sweep
preset: corridor-11
controls: [play, scrub, robotSpeed]
caption: >
  The same room, the same crowd, the same seed, the same robot going to the same place. The dial is
  all that changes.
```

The dial runs from {{lit:0.4 m/s}} to {{lit:1.8 m/s}} — at the bottom the robot crosses the room
slower than the people around it walk, at the top faster. Every setting was run eight times with a
different crowd, each crowd twice: once with the robot, once with the room to itself. At
{{lit:1.0 m/s}}, averaged over the whole crossing, the typical person is
{{q:e3[maxSpeed=1.0].meanDeviationM}} from where they would have been — zero, if the robot had
moved nobody — and the eight runs behind that figure spread by
{{q:e3[maxSpeed=1.0].meanDeviationM.sd}}.

## What the sweep says

```mirn:sweep
experiment: e3_robot_speed
x: maxSpeed
series:
  - key: meanDeviationM
    label: averaged over everybody, all run
    accent: true
  - key: maxDeviationM
    label: the crowd at its one worst moment
caption: >
  Eight seeds per setting. The band on each point is the spread across those eight.
```

The curve goes up and then comes down. The largest reading sits at a middling setting rather than
at either end of the dial, and both ends sit under it. Which middle setting tops the hump is not
something eight runs can settle.

So neither answer survives. This crowd was not left alone by a slow robot, and it was not left
alone by a fast one: the disturbance a robot makes in this room is not something you turn down by
turning the dial down. That is the shape you get when two things pull against each other — a slow
robot is beside people for longer, a fast one is gone and leaves them the rest of the run in which
to come back. This page measures the sum, not the two apart.

:::caveat
The gaps between neighbouring settings on that curve are about the size of the band drawn on a
single point, and the band is the uncertainty across the eight seeds. Read the shape, not a pair.
If somebody says this evidence makes {{lit:1.3 m/s}} politer than {{lit:1.0 m/s}}, they are reading
the noise.
:::

## The robot's own clock

The crowd is half the question. The robot also has somewhere to be, and the dial does something to
that journey far easier to read than the hump.

```mirn:sweep
experiment: e3_robot_speed
x: maxSpeed
series:
  - key: robotArrivalS
    label: when the robot reached the far side
    accent: true
caption: >
  The slowest setting has no point on this plot: the robot had not finished crossing when the run
  ended, so there is no arrival time to draw.
```

At that same {{lit:1.0 m/s}} the robot reaches the far side at
{{q:e3[maxSpeed=1.0].robotArrivalS}}; at the slowest setting there is nothing to report, because the
clock ran out with the robot still crossing in all eight runs. This curve falls at every step where
it has two points to join and never turns back, and the fall from one end of the plot to the other
sits far outside every band on it.

The deviation curve did turn back. That asymmetry is what to carry off this page: the robot's clock
and the crowd's deviation are not the same curve, and only one of them is well behaved.

```mirn:quantity
id: e3-time-lost
metric: timeLost
caption: >
  Click the number. It is the robot's own crossing: the moment it stopped moving, and how far it
  travelled getting there. A person's time lost is that same subtraction done on their arrival.
```

The people lose time too, and unlike the gap in space the seconds do not come back. At
{{lit:1.0 m/s}} the crowd's figure reads {{q:e3[maxSpeed=1.0].pedTimeLostS}}, with a seed spread of
{{q:e3[maxSpeed=1.0].pedTimeLostS.sd}} — everywhere on the dial, that spread lands in the same range
as the figure. It is here because it was measured. Nothing on this page rests on it.

## What this page did not measure

Speed and safety are not the same question, and only one of them is on the plot. The worry about a
fast robot is not that it pushes people further; it is that it arrives with less warning.

A near miss here would be any moment the robot came within some distance of somebody, and that
distance is chosen rather than measured. Nothing on this page chooses it. Deviation says how far
people were moved, not how close anything came — and a dial that lowers one can raise the other.

:::caveat
The hump belongs to this crowd, not to the world. How people react to a robot bearing down on them
faster than they walk is exactly the part of the model that is invented: nobody in this room looks
up, or freezes, or stops to let the robot past, and a real person does all three. The ruler is
sound — the two runs differ by the robot and nothing else. The room is made up. What survives the
trip out is not a recommended speed, but that speed has two ends and neither is obviously polite.
:::
