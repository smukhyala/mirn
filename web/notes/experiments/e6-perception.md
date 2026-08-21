---
id: e6-perception
page: 6
part: 3
title: Blur the picture
subtitle: Whatever moved, it was not the number everybody reports
introduces: []
uses: [run, seed, deviation, control-input, robustness, near-miss]
shows: >
  An invented crowd walking a corridor while the robot's picture of where everybody is standing
  gets blurred, and two readings of those same runs that do not agree.
try: >
  Drag the slider marked "error in what the robot sees" to the top of its range, then let the run
  play round again and watch the robot's own line change. The blur touches nothing but the robot's
  reading of where people are — and because the robot then drives differently, some of the crowd's
  paths shift with it.
reader_can: >
  Say what a blurred picture of the room did to the crowd and what the same runs say about the
  robot's margins, and name which of the two the obvious measurement cannot see. Explain how a
  clearance figure in this room comes out below zero, and what that does and does not mean. Take a
  near-miss count apart into the part that was measured and the part that was chosen, and say what
  would have to be shown before a threshold conclusion is worth reporting.
---

Every number on this site so far came from a robot that reads the room straight off the simulator:
every position, every instant, exact. No robot has ever had that.

This page corrupts it. Before the planner is allowed to look, each person's position is nudged by a
random amount in a random direction, and the dial sets how big that nudge is — from {{lit:0 m}}, the
perfect reading every earlier page assumed, up to {{lit:0.8 m}} — wide enough to put the robot's
idea of somebody on the wrong side of them. The people are unchanged. Only the robot's belief is
degraded, and therefore the control input it settles on.

```mirn:predict
id: e6-guess
question: What happens to the crowd when the robot's picture of the room is blurred?
options:
  - id: worse
    label: People get pushed further. Bad information makes for clumsier driving.
  - id: same
    label: Nothing much. The planner has margin to spare and the errors average out.
  - id: elsewhere
    label: Deviation holds still, and something else gets worse instead.
caption: >
  Commit before you scroll. Being wrong here is free. Skipping the guess is what costs you.
```

## The dial

```mirn:scene
id: perception-blur
preset: corridor-11
controls: [play, scrub, perceptionNoise]
caption: >
  The same corridor, the same invented crowd, the same seed, the same robot going to the same
  place. The dial does not touch anybody's walking. It only blurs what the robot believes about
  where they are.
```

Every setting was run eight times with a different crowd, each crowd both ways: once with the robot
in it, once with the room to itself. Only the run with the robot is blurred.

## What the blur did not do

```mirn:sweep
experiment: e6_perception
x: positionSigmaM
series:
  - key: meanDeviationM
    label: deviation per person
    accent: true
caption: >
  Eight seeds per setting. The band on each point is the spread across those eight crowds.
```

With a perfect picture the average person ends up
{{q:e6_perception[positionSigmaM=0].meanDeviationM}} from where they would have been. At the
blurriest setting, {{q:e6_perception[positionSigmaM=0.8].meanDeviationM}}. Had the robot moved
nobody, both would read zero. The eight crowds at the sharp end spread by
{{q:e6_perception[positionSigmaM=0].meanDeviationM_sd}}, which covers the whole range this curve
travels. Read it as flat.

## The number nobody was watching

Clearance is the gap between the robot's outside edge and the nearest person's outside edge.
Surface to surface, not centre to centre, so zero means they are touching, and a negative figure
means they overlapped, which the soft bodies in this model are allowed to do. Deviation asks how
far the robot moved somebody; clearance asks how near it got.

```mirn:sweep
experiment: e6_perception
x: positionSigmaM
series:
  - key: minClearanceM
    label: smallest clearance in a run
    accent: true
  - key: meanDeviationM
    label: deviation per person
caption: >
  The same runs, measured two ways, both in metres, so the two can be read against each other.
```

The smallest clearance in a run — the closest the robot ever came to anybody — averages
{{q:e6_perception[positionSigmaM=0].minClearanceM}} with a perfect picture and
{{q:e6_perception[positionSigmaM=0.8].minClearanceM}} at the blurriest setting. The eight crowds
there spread by {{q:e6_perception[positionSigmaM=0.8].minClearanceM_sd}}, which covers the whole
distance the curve travels. The settings in between do sit in order, but where the worst moment of
a run falls depends mostly on which crowd the robot drew.

Deviation did not move, and the ordering appeared on a quantity no deviation figure can see. A
robot can hold its deviation steady while giving up its margins, so calling this robot robust to a
blurred picture is not one claim: the two figures answer it differently, on the same eight crowds.

One mechanism fits these curves. The planner steers to hold a distance from where it believes
people are. Blur the belief and it is sometimes nearer than the truth and sometimes further; the
planner leaves a little too much room and then a little too little, over and over, across a whole
crossing. Averaged over the crossing those errors cancel, which is why the deviation stays put. A
minimum does not average: the smallest clearance in a run is the single worst instant in it, and
giving the error more chances to fall the wrong way makes the worst instant worse without touching
the mean of anything.

The comparison that would settle it — subtracting the two ends of the dial crowd by crowd, so the
crowd-to-crowd spread cancels instead of swamping what is left — this page has not run. Until it
is, the ordering is a direction to go looking in, and the mechanism above is a story that fits it.

## Below zero

Every clearance figure here is negative, at every setting, including the one where the robot sees
perfectly. That is the bodies. A person here is a soft disc and so is the robot; they do not stop
when they meet, they push each other apart with a force that grows as they close, and until it wins
they share a patch of floor. Real bodies do not do this. Discs in a force model do.

So do not read these numbers as collisions. Read a negative clearance as *uncomfortably close*, and
one sliding further below zero as *more uncomfortable*. A machine with a bumper and a brake would
have registered something here that this model has no parts to register. And notice the overlap is
there with a perfect picture: this planner was driving close before anybody touched the dial.

:::caveat
This is where the ruler and the room come apart. The comparison is sound: the blurred run and the
sharp run differ by the blur and nothing else. What is invented is the floor the number sits on. A
room that lets two bodies overlap chose where zero falls, so the level of these figures is a
modelling artefact and only their movement could be evidence.
:::

## The threshold you chose

There is a second safety column here, and it is the one a report would print. A near miss is any
occasion on which the robot's clearance dropped below {{lit:0.5 m}} — occasions, not instants,
because a count of instants would climb when you shrink the timestep.

```mirn:sweep
experiment: e6_perception
x: positionSigmaM
yLabel: episodes per run
series:
  - key: nearMissEpisodes
    label: near misses per run
    accent: true
caption: >
  The same runs again, counted instead of measured. The axis is a count of occasions, not a
  distance.
```

A run contains {{q:e6_perception[positionSigmaM=0].nearMissEpisodes}} of them with a perfect
picture and {{q:e6_perception[positionSigmaM=0.8].nearMissEpisodes}} at the blurriest setting, and
the eight crowds there spread by {{q:e6_perception[positionSigmaM=0.8].nearMissEpisodes_sd}}. The
count never moves outside its own spread, on the same runs where the clearance curve at least went
one way.

A count throws distance away. Crossing the line at {{lit:0.5 m}} is the same event whether the
robot ends up a hand's width from somebody or on top of them. Nothing in these runs suggests the
blur sent the robot across that line on new occasions. What shifted, to the extent anything
shifted, was how far past the line the worst instant went — and a threshold cannot see that, by
construction.

Two things went into that count. One was measured: the distance between the robot and the nearest
person, at every instant. The other was chosen: {{lit:0.5 m}}. Nothing in the room proposed it. A
metric with a threshold in it is part measurement and part opinion, and the two arrive unlabelled
in the same numeral.

```mirn:quantity
id: e6-threshold
metric: nearMiss
caption: >
  The threshold is a choice, not a constant. Click the number to see this run counted at three of
  them — the same robot, the same crowd, the same instants. Only the line moves.
```

There is no correct threshold to go and find: arm's length, a hand's width, and whatever a child or
a wheelchair user would choose are three defensible answers. The repair is to report the count at a
range of thresholds and keep the conclusions that survive all of them. A finding that appears at
{{lit:0.5 m}} and nowhere else is a fact about {{lit:0.5 m}}. This sweep has one column, so it
cannot tell you whether the flat count stays flat at arm's length. Neither can I.

:::caveat
In this crowd, the size of any erosion belongs to a social-force model and to a planner already
driving close. The ruler is sound: the blurred run and the sharp run differ by the blur and nothing
else. The room is invented, and eight crowds is not many. What survives the trip out is not a
tolerance for blurry perception. It is that the measurement you would reach for first can hold
perfectly still while a second reading of the same runs moves, and that a threshold will keep even
that much disagreement quiet.
:::
