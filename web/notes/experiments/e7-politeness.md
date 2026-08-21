---
id: e7-politeness
page: 6
part: 3
title: It could go around
subtitle: The trade-off that did not turn up
introduces: []
uses: [run, seed, deviation, control-input, uncertainty, near-miss]
shows: >
  An invented crowd in a corridor while the robot is asked to swing wide around people, and the
  bill this room could and could not put a figure on.
try: >
  Drag the slider marked "how hard it tries to stay out of the way" up, and watch the robot's path
  bend around people instead of through them.
reader_can: >
  Say what this room charged the robot for keeping out of people's way, and why only the distance
  half of that bill is reportable. Take a curve whose axis says seconds and show, from the figures
  printed beside it, that it cannot be counting seconds of journey. Name the things this room
  forgot to bill for, and say why a dial that rewards keeping clear needs a separate check that the
  robot still got anywhere.
---

The robot in corridor-11 drives at its goal. If somebody is in the way it slows, edges past, and
carries on. It could instead swing wide, leave the person the space they were walking into, and
come back to its line once they have gone by.

Going around is further. Further is slower. That is the whole intuition, and it is why a robot like
this usually ships with the behaviour switched off.

So: the same corridor, except one number in the planner's cost decides what other people's space is
worth. At zero the robot steers as if the room held nothing worth avoiding; turn it up and it will
accept a longer route to keep clear. Nobody in the crowd is told the robot has become polite. What
changes is the control input the planner settles on.

```mirn:predict
id: e7-guess
question: The robot could go around people instead of pressing through them. What does that cost?
options:
  - id: expensive
    label: Politeness is expensive. Whatever it saves the crowd is paid back on the robot's clock.
  - id: diminishing
    label: Politeness is cheap at first and expensive later. A little costs nothing, a lot costs plenty.
  - id: free
    label: Politeness is free. Getting out of the way does not slow the robot down at all.
caption: >
  Commit before you scroll. One of the three above is the shape this experiment was set up to
  find. What the room handed back is not on the list.
```

## The dial

```mirn:scene
id: politeness-sweep
preset: corridor-11
controls: [play, scrub, deflectionWeight]
caption: >
  The same invented crowd and the same seed at every setting. Turn the dial up and watch the
  robot's path bend around people instead of through them.
```

The dial runs from zero to six; the doors, the walk speeds and the seed are held. Every setting was
run eight times with a different crowd, each crowd both ways: once with the robot in it, once with
the room to itself. At zero the average person finishes
{{q:e7[deflectionWeight=0].meanDeviationM}} from where they would have been — zero, if the robot
had moved nobody — the eight runs spread by {{q:e7[deflectionWeight=0].meanDeviationM.sd}}, and the
robot's route measures {{q:e7[deflectionWeight=0].robotPathM}}.

## What the dial did to the crowd

```mirn:sweep
experiment: e7_politeness
x: deflectionWeight
series:
  - key: meanDeviationM
    label: deviation per person
    accent: true
caption: >
  Eight seeds per setting. The band on each point is the spread across those eight.
```

The curve leans down, from the first notch to the far end of the dial, with a couple of settings
that step back up on the way. The whole descent is about the size of the spread across eight seeds
at one setting. The direction is what this sweep has; the size is not. So the dial did not move
people further from where they would have been, and that is the whole of what the curve
establishes.

:::caveat
The band on each point is the uncertainty across the eight seeds, and it is taller than the step
between any two neighbouring settings. Read the lean of the whole curve as a direction rather than
an amount. Nothing on this page rests on a single notch of this dial.
:::

## The bill, in metres

```mirn:sweep
experiment: e7_politeness
x: deflectionWeight
series:
  - key: robotPathM
    label: how far the robot drove
    accent: true
caption: >
  The robot's own odometer, summed over the run. Eight seeds per setting, with the spread.
```

The robot's route grows. The curve climbs over the first few notches and then stops, and each of
the upper settings sits inside the band of the others, so whether the price is level up there or
still drifting is not something eight seeds can separate. At the top of the dial the robot drove
{{q:e7[deflectionWeight=6].robotPathM}}, the eight seeds spread by
{{q:e7[deflectionWeight=6].robotPathM.sd}}. That is the part of the prediction that held: going
around is extra ground, and the robot covers it.

## The other half of the bill

```mirn:sweep
experiment: e7_politeness
x: deflectionWeight
yLabel: seconds
series:
  - key: robotArrivalS
    label: the first moment the robot's motion stopped
    accent: true
caption: >
  The clock at the first instant the robot came to a standstill. Eight seeds per setting, with the
  spread.
```

This was going to be the other half of the bill. It is the column this page cannot use.

At the top of the dial it reads {{q:e7[deflectionWeight=6].robotArrivalS}}, and behind each upper
setting the eight seeds disagree by enough to cover the whole fall over and over. That alone would
be reason enough to report nothing from it.

The harder reason needs only the two figures printed for the top of the dial. Divide the distance
the robot drove there by the seconds printed beside it: that is the speed it would have had to
hold. This planner chooses from a fixed grid of speeds, and the fastest is {{lit:1.1 m/s}}. The
bottom three settings pass that check. Every setting above them fails it.

So the column is not counting a journey. What the code records is the first instant the robot's own
motion stopped, and to a measurement like that, a robot that halts once mid-corridor and carries on
is indistinguishable from one that has arrived and parked. Turning this dial up is asking the robot
to yield, and a yield is a standstill. The figure stays on the page: a curve that reads like a
result and is not one is the thing this whole site is about.

## The trade-off that did not turn up

The middle option on the box above — politeness cheap at first and expensive later — is a shape
this room cannot speak to. A distance curve that climbs and then levels off is equally what eight
seeds look like when they cannot resolve a slow climb; the deviation curve leans down by about its
own spread; the clock was counting standstills. The belief behind that guess is why a dial like
this ships at zero. This sweep measured its own apparatus instead.

## What this room is not charging for

Swerving costs the robot nothing but distance here. No battery, no motor wear, no cargo to keep
level, no passenger to keep comfortable, no map to stay localised against, no wall standing where
the detour wants to go, no deadline to miss. A real machine pays for a detour in things that are
not metres, and this dial has never heard of any of them. A robot with a schedule is solving a
different problem: it does not need the detour to be quick on average, it needs the detour to never
be slow, and a worst case is settled by the spread rather than by the mean.

One failure this page cannot rule out: the cheapest way to disturb nobody is to stop moving. A
robot parked against the wall has a deviation of zero, forever, at every seed, and any dial that
rewards keeping out of the way points at that parked robot. That the clock curve has a point at
every setting is no reassurance — the number is the first instant the robot's motion stopped, which
is exactly what a robot that gave up short of its goal would produce. A deviation curve that leans
down and a clock that falls are also what a robot quietly giving up looks like, and no column on
this page tells the two apart. If you build this dial, go and look at where the robot actually
ended up before you believe anything a curve says about it.

It also counts no near misses. Deviation says where people ended up, not how close the robot came
to any of them, and a dial that lowers one can raise the other.

:::caveat
In this crowd the size of the distance bill belongs to a social-force model that somebody wrote
down: people here yield smoothly, never step the wrong way, and never wait for the robot to go
first. Half the ruler is sound — the same crowd ran twice from the same seed, once with the robot
and once without, so the deviation is measured rather than guessed. The other half was not. What
survives the trip out of here is not a price for politeness. It is that the cost side of this
trade-off has to be measured before it is assumed, and that a column can carry the right units on
its axis and still be counting something else.
:::
