---
id: e3-robot-speed
page: 6
part: 3
title: Hurry up or slow down
subtitle: The one dial where both answers sound obvious
introduces: []
uses: [run, seed, deviation, control-input, disturbance, recovery, uncertainty, near-miss, time-lost]
reader_can: >
  State what this room did when the robot was allowed to go faster, and say why that is not the
  same as saying what a robot should do. Read a curve that goes up and then comes down without
  reading a story into any single pair of points. Separate the robot's own clock from the crowd's
  deviation, and name which of the two this page measures well.
---

A robot has to get across a room with people in it. You get one dial, and the dial is a ceiling on
how fast the robot is allowed to go. It does not steer for the robot: the control input is still
the planner's, and the dial only caps the speed the planner is allowed to ask for.

Both answers sound obvious, which is the problem. Slow down and you are being careful: gentler
pushes, more room for everyone to see you coming, nobody hurried out of the way. Speed up and you
are being considerate in the other direction: the robot stops being in the room. It is a courtesy
either way, and the two courtesies point in opposite directions.

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
  Commit before you scroll. Being wrong here is free. Skipping the guess is what costs you.
```

## The dial

```mirn:scene
id: speed-sweep
preset: corridor-11
controls: [play, scrub, robotSpeed]
caption: >
  The same room, the same crowd, the same seed, the same robot going to the same place. The dial
  is the only thing that changes between one viewing and the next.
```

The dial runs from {{lit:0.4 m/s}} up to {{lit:1.8 m/s}}. At the bottom of it the robot crosses
the room slower than the people around it are walking. At the top it goes faster than they do.

Every setting on the dial was run eight times, each time with a different crowd, and each crowd
was run twice — once with the robot, once with the room to itself. At a top speed of
{{lit:1.0 m/s}}, and averaged over every moment of the crossing, the typical person is
{{q:e3[maxSpeed=1.0].meanDeviationM}} from where they would have been. The eight runs behind that
figure spread by {{q:e3[maxSpeed=1.0].meanDeviationM.sd}}.

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

The curve goes up and then it comes down. The largest reading sits at a middling setting rather
than at either end of the dial, and both ends sit under it. Which of the middle settings is the
top of the hump is not something eight runs can settle, and nothing here needs it to. The
disturbance a robot causes in this room is not something you turn down by turning the dial down.

So neither answer to the question survives. This crowd was not left alone by a slow robot, and it
was not left alone by a fast one. "Slow down to be polite" is not what this room did.

That shape is what you get when two things pull against each other. A slow robot spends longer in
the room, so more people meet it, and the ones who do have it beside them for longer. A fast robot
is gone, and the people it did shove have the rest of the run in which to come back.

This page does not separate those two effects. It measures their sum, which is the curve above,
and the shape of that curve is the only thing in this section I would put weight on.

:::caveat
The gaps between neighbouring settings on that curve are about the size of the band drawn on a
single point, and the band is the uncertainty across the eight seeds. Read the shape. Do not read
a pair. If somebody says this evidence makes {{lit:1.3 m/s}} politer than {{lit:1.0 m/s}}, they
are reading the noise, and so are you if you nod along.
:::

## The robot's own clock

The crowd is half the question. The robot also has somewhere to be, and the dial does something to
that journey which is much easier to see.

```mirn:sweep
experiment: e3_robot_speed
x: maxSpeed
series:
  - key: robotArrivalS
    label: when the robot reached the far side
    accent: true
caption: >
  The slowest setting has no point on this plot. The robot had not finished crossing when the run
  ended, so there is no arrival time to draw.
```

At that same top speed of {{lit:1.0 m/s}} the robot reaches the far side at
{{q:e3[maxSpeed=1.0].robotArrivalS}}. At the slowest setting on the dial there is nothing to
report: the clock ran out with the robot still crossing, in all eight runs.

This curve falls at every step where it has two points to join, and never turns back. The
deviation curve did turn back. One step in the middle of the dial is the size of the band on the
point it starts from, so that pair on its own settles nothing; the fall from one end of the plot
to the other sits far outside every band on it. Every notch up buys the robot time, and it keeps
buying.

That asymmetry is the finding worth carrying off this page. The robot's clock and the crowd's
deviation are not the same curve, and one of them is much better behaved than the other.

```mirn:quantity
id: e3-time-lost
metric: timeLost
caption: >
  Click the number. It is one subtraction, done for one person: the moment they stopped moving in
  the run with the robot, minus the moment they stopped moving in the run without it.
```

The people lose time too, and unlike the gap in space the seconds do not come back. At the same
{{lit:1.0 m/s}} setting the crowd's figure reads {{q:e3[maxSpeed=1.0].pedTimeLostS}}, with a seed
spread of {{q:e3[maxSpeed=1.0].pedTimeLostS.sd}}.

Everywhere on the dial, that spread lands in the same range as the figure it belongs to. So the
number is on this page because it was measured, and nothing on this page rests on it.

## What this page did not measure

Speed and safety are not the same question, and only one of them is on the plot. The worry about
a robot moving faster than the people around it is not really that it pushes them further. It is
that it arrives beside them with less warning.

A near miss here would be any moment the robot came within some distance of somebody, and that
distance is chosen rather than measured. Counting near misses means choosing it first, and nothing
on this page chooses it. Deviation says how far people were moved. It says nothing about how close
anything came, and a dial that lowers one of those can raise the other.

:::caveat
The hump belongs to this crowd, not to the world. How people react to a robot bearing down on them
faster than they walk is exactly the part of the model that is invented: nobody in this room looks
up, or freezes, or stops to let the robot past, and a real person does all three. The ruler is
sound — the two runs differ by the robot and nothing else, so the gap between them is measured
rather than guessed. The room is made up. What survives the trip out of it is not a recommended
speed. It is that speed has two ends and the polite one is not obviously either.
:::
