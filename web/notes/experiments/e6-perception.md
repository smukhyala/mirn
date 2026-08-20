---
id: e6-perception
page: 6
part: 3
title: Blur the picture
subtitle: Whatever moved, it was not the number everybody reports
introduces: []
uses: [run, seed, deviation, control-input, disturbance, uncertainty, robustness, near-miss]
reader_can: >
  Say what a blurred picture of the room did to the crowd and what the same runs say about the
  robot's margins, and name which of the two the obvious measurement cannot see. Explain how a
  clearance figure in this room comes out below zero, and what that does and does not mean. Take a
  near-miss count apart into the part that was measured and the part that was chosen, and say what
  would have to be shown before a threshold conclusion is worth reporting.
---

Every number on this site so far was produced by a robot that knows exactly where everybody is. It
reads the room straight off the simulator: every position, every instant, exact. No robot has ever
had that.

This page corrupts it. Before the planner is allowed to look at the room, each person's position is
nudged by a random amount in a random direction, and the dial sets how big that nudge typically is.
It runs from {{lit:0 m}}, the perfect reading every earlier page assumed, up to {{lit:0.8 m}}, wide
enough that the robot's idea of where somebody is standing can land on the wrong side of them.

Nothing about the people changes. They walk as they have walked on every page. They are not told
anything and they do not become clumsier. The only thing degraded is what the robot believes, and
therefore the control input it settles on.

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
  The same corridor, the same crowd, the same seed, the same robot going to the same place. The
  dial does not touch anybody's walking. It only blurs what the robot believes about where they
  are.
```

The scene opens at {{lit:0 m}}, the sharp end of the dial, where the robot's picture of the room is
exact. At that setting the average person finishes
{{q:e6_perception[positionSigmaM=0].meanDeviationM}} from where they would have been.

Every setting on the dial was run eight times, each time with a different crowd, and each crowd was
run both ways — once with the robot in it, once with the room to itself. The blur exists only in
the run with the robot. In the other run there is nobody to misperceive.

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

With a perfect picture of the room, the average person ends up
{{q:e6_perception[positionSigmaM=0].meanDeviationM}} from where they would have been. At the
blurriest setting the reading is {{q:e6_perception[positionSigmaM=0.8].meanDeviationM}}. The spread
across the eight crowds at the sharp end of the dial is
{{q:e6_perception[positionSigmaM=0].meanDeviationM_sd}}.

That spread covers the whole range this curve travels across the dial, so read the curve as flat
and do not read anything into which end sits marginally where.

The robot's own journey held still too. Its path length with a perfect picture averages
{{q:e6_perception[positionSigmaM=0].robotPathM}}. At the blurriest setting it averages
{{q:e6_perception[positionSigmaM=0.8].robotPathM}}.

Bad information did not make this robot clumsier with people, and it did not send it wandering. If
deviation is what you came to measure, the honest report is that the dial does nothing — and that
report would be missing something the report itself has no way to see.

## The number nobody was watching

Clearance is the gap between the robot's outside edge and the nearest person's outside edge.
Surface to surface, not centre to centre, so zero means the two of them are touching. A negative
figure means they overlapped, which the soft bodies in this model are allowed to do. The smallest
clearance in a run is the closest the robot ever came to anybody during it, and it is a different
question from deviation: deviation asks how far the robot moved somebody, clearance asks how near
it got.

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
  The same runs, measured two ways, both in metres. One of these curves is the one from the
  previous figure, drawn again so the two can be read against each other.
```

With a perfect picture of the room the smallest clearance in a run averages
{{q:e6_perception[positionSigmaM=0].minClearanceM}}. At the blurriest setting it averages
{{q:e6_perception[positionSigmaM=0.8].minClearanceM}}. The spread across the eight crowds at that
setting is {{q:e6_perception[positionSigmaM=0.8].minClearanceM_sd}}.

The four settings in between sit in order between those two, and no notch on the dial moves the
number back the other way. Six points landing in order is the strongest thing on this page, and it
is still not much. Hold that spread up against the whole distance this curve travels from one end
of the dial to the other: the spread covers it, with room left over. Where the worst moment of a
run falls depends mostly on which crowd the robot drew, and eight crowds cannot lift a step this
size out from under that.

Deviation did not move. The ordering that did appear, appeared somewhere else entirely, on a
quantity no deviation figure can see. A robot can hold its deviation steady while giving up its
margins, and these six points are the shape that would make. Calling a robot robust to a blurred
picture is therefore not one claim: the deviation figure and the clearance figure answer it
differently, on the same eight crowds.

One mechanism fits these curves. The planner steers to hold a distance from where it believes
people are. Blur the belief and it is sometimes nearer than the truth and sometimes further; the
planner leaves a little too much room and then a little too little, over and over, across a whole
crossing. Averaged over the crossing those errors cancel, which is why the path length and the
deviation stay put. A minimum does not average. The smallest clearance in a run is the single
worst instant in it, and giving the error more chances to fall the wrong way makes the worst
instant worse without touching the mean of anything.

There is a comparison that would settle this, and this page has not run it. Every setting used the
same eight crowds, so the two ends of the dial can be subtracted crowd by crowd, and the
crowd-to-crowd spread cancels in the subtraction instead of swamping what is left. Until that is
done, the ordering is a direction to go looking in, and the mechanism above is a story that fits
it.

## Below zero

Every clearance figure on this page is negative, at every setting, including the one where the
robot sees perfectly.

The overlap comes from the bodies. A person here is a soft disc and so is the robot; they do not
stop when they meet, they push each other apart with a force that grows as they close, and nothing
in the model forbids them from occupying the same patch of floor for a moment while that force does
its work. Real bodies do
not do this. Discs in a force model do.

So do not read these numbers as collisions. Read a negative clearance as *uncomfortably close*, and
a number sliding further below zero as *more uncomfortable*. A machine with a bumper and a brake
would have registered something here that this model has no parts to register.

It is also worth noticing where the baseline sits. The overlap is already there with a perfect
picture of the room, which says the planner in this corridor was driving close before anybody
touched the dial. Whatever the blur did here, it did to something already present rather than
creating it.

:::caveat
This is the one number on the page where the ruler and the room come apart. The comparison is still
sound — the blurred run and the sharp run differ by the blur and nothing else, so whatever change
there is in clearance across the dial is measured rather than guessed. What is invented is the
floor the number sits on. A room that let two bodies overlap chose where zero falls, so the level
of these figures is a modelling artefact and only their movement could ever be evidence.
:::

## The threshold you chose

There is a second safety column in this experiment, and it is the one a report would print. A near
miss here is any occasion on which the robot's clearance dropped below {{lit:0.5 m}}.

Occasions, not instants. An approach that stays close for a while counts once. Counting instants
would make the number depend on how finely the simulator chops up time, and a safety figure that
climbs when you shrink the timestep is measuring the simulator.

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

With a perfect picture of the room a run contains, on average,
{{q:e6_perception[positionSigmaM=0].nearMissEpisodes}} of them. At the blurriest setting,
{{q:e6_perception[positionSigmaM=0.8].nearMissEpisodes}}. The spread across the eight crowds at
that setting is {{q:e6_perception[positionSigmaM=0.8].nearMissEpisodes_sd}}.

The count never moves outside its own spread anywhere on the dial. The clearance curve at least
went one way. Both were computed from the same runs, by the same code, on the same eight crowds,
and they do not point at the same conclusion.

A count can disagree with a distance because a count throws distance away. Crossing the line at
{{lit:0.5 m}} is the same event whether the robot ends up a hand's width from somebody or on top of
them. Nothing in these runs suggests the blur sent the robot across that line on new occasions.
What shifted, to the extent anything shifted, was how far past the line the worst instant went —
and a threshold cannot see that, by construction.

Two things went into that count. One of them was measured: the distance between the robot and the
nearest person, at every instant, in every run. The other was chosen: {{lit:0.5 m}}. Nothing in the
room proposed that number. Somebody picked it, and every conclusion the count supports is a
conclusion about the pick as much as about the robot.

A metric with a threshold in it is part measurement and part opinion, and the two arrive unlabelled
in the same numeral.

```mirn:quantity
id: e6-threshold
metric: nearMiss
caption: >
  The threshold is a control, not a constant. Move it and the count is recomputed from the same
  run — the same robot, the same crowd, the same instants. Only the line moves.
```

The repair is not to find the correct threshold, because there is not one. Arm's length is
defensible, a hand's width is defensible, and the distance a wheelchair user or a child would
choose is a third answer that nobody in this simulator was asked. The repair is to report the count
at a range of thresholds and see which conclusions survive all of them. A finding that holds from a
hand's width out to arm's length is a finding. A finding that appears at {{lit:0.5 m}} and nowhere
else is a fact about {{lit:0.5 m}}.

The sweep above has one column, at one threshold, so it does not do that. It cannot tell you
whether the flat count stays flat when the line is drawn at arm's length instead, and neither can
I. Read it as one threshold's worth of evidence and go and get the others before anybody acts on
it.

:::caveat
In this crowd, the size of any erosion belongs to a social-force model and to a planner that was
already driving close before the dial was touched. Change either and the curve steepens or flattens
and the crossing point of any threshold moves with it. The ruler is sound: the blurred run and the
sharp run differ by the blur and nothing else. The room is invented, and eight crowds is not many.
What survives the trip out of it is not a tolerance for how blurry a robot's perception may be. It
is that the measurement you would reach for first can hold perfectly still while a second reading
of the same runs moves, and that a metric with a threshold in it will keep even that much
disagreement quiet.
:::
