---
id: e4-recovery
page: 6
part: 3
title: Once it has gone past
subtitle: What comes back, and what does not
introduces: []
uses: [run, trajectory, nominal-trajectory, deviation, state, seed, recovery, uncertainty, time-lost]
reader_can: >
  Read a recovery figure as three separate numbers — the peak, what is left at the end, and the
  fraction of the peak that went — and say which of the three is fixed by a threshold somebody
  chose. Say why a person's position can come back and their arrival time cannot. Say what a
  measurement decides, without announcing it, when it reports only the part that heals.
---

corridor-11, except the robot no longer drives down the middle of the room. Its lane slides
sideways, towards one wall and away from the middle, and everything else is held.

## The dial

The robot enters at one wall and leaves at the other, and both ends of its lane move together, so
the lane stays a straight line across the room and only its height changes. The dial is how far
that line sits from the middle. At zero it runs down the centre, with people passing on both
sides of it. At the far end it is {{lit:3 m}} off centre, still inside a room {{lit:13 m}} deep
and still short of a wall.

Nothing else moves. Same room, same crowd, same starting state for every person, same seed for the
run with the robot in it and the run without.

```mirn:predict
id: e4-guess
question: Once the robot has gone past, is everything back to normal?
options:
  - id: yes-reset
    label: Yes. The push ends, people steer back, and the room closes the gap it opened.
  - id: mostly
    label: Mostly. Something comes back and something does not.
  - id: no
    label: No. The people it moved end up somewhere else and stay there.
caption: >
  Commit before you scroll. If the second answer tempts you, name the something.
```

## One push, start to finish

Play a crossing and follow a single person and their faint copy from the run with no robot in it.

```mirn:scene
id: recovery-pass
preset: corridor-11
controls: [play, scrub, showControl, passingOffset]
caption: >
  Solid paths are the run with the robot in it; faint dashed ones are the same people, same seed,
  with the room to themselves. Watch the gap between one pair of them rather than either path on
  its own. The dial moves the robot's lane sideways.
```

The gap opens as the robot comes past. Then it closes. Then it stops closing.

Up, down, and flat. Not up, down, and gone.

The closing part has a name you already have: recovery. Nobody in this room is trying to get back
to their nominal trajectory — they are trying to get to a door, and the door is what put them on
that line in the first place. The gap shrinks because the steering that was always there stops
having a robot in front of it.

Three numbers come out of that shape, and they are three different numbers. Take the gap averaged
over everybody in the room, tick by tick, and read all three off that one curve. The peak: the
widest that average ever gets. The residual: how wide it still is at the last tick of a clock that
runs for {{lit:40 s}}. And the fraction of the peak that had gone by then.

## One line moves with the dial

```mirn:sweep
experiment: e4_recovery
x: passingOffsetM
series:
  - key: peakDeviationM
    label: the crowd's average gap at its widest
    accent: true
  - key: finalDeviationM
    label: what is still there at the last tick
caption: >
  Every point is eight runs of corridor-11 at eight seeds, with the robot's lane moved sideways by
  the amount on the axis, drawn with the spread across those seeds.
```

Start where the dial starts, with the lane down the middle at an offset of {{lit:0 m}}. There the
peak reads {{q:e4_recovery[passingOffsetM=0].peakDeviationM}} and the residual reads
{{q:e4_recovery[passingOffsetM=0].finalDeviationM}}. Now turn the dial through its whole travel.
The upper line comes down across it: the lane is the only thing being changed, and it changes how
hard people get shoved. The lower line does not follow it. It wanders inside a band and stays in
the band.

Take the two ends of the axis. The centre setting is one of them, and its two numbers are the two
just quoted. At the other end, with the lane {{lit:3 m}} off centre, the peak is
{{q:e4_recovery[passingOffsetM=3].peakDeviationM}} and the residual is
{{q:e4_recovery[passingOffsetM=3].finalDeviationM}}.

The two ends are the only comparison on the upper line this plot supports. Step from one setting
to the next one along and the change in the peak sits inside the band drawn on the point it lands
on, and the steps do not even keep one direction. Read the two ends against each other. Do not
read a pair of neighbours.

The residual is measured at the last tick and nowhere else. It is not a claim that anybody is
still being pushed. It says that two copies of one person have not landed on the same spot, which
can happen because the person is still off their line, or because they reached the same door from
a slightly different angle and stopped there.

## How much came back

```mirn:sweep
experiment: e4_recovery
x: passingOffsetM
series:
  - key: fractionRecovered
    label: how much of the peak had gone by the end
    accent: true
caption: >
  The residual divided by the peak, subtracted from one, per run, then averaged over the eight
  seeds.
```

With the lane down the middle the fraction reads
{{q:e4_recovery[passingOffsetM=0].fractionRecovered}}. Put the dial wherever you like: the eight
runs do not average to one. Recovery in this room is partial, at every setting on the axis.

What closing there is takes time — at that same centre setting,
{{q:e4_recovery[passingOffsetM=0].recoveryS}}, counted from the moment the gap is at its widest.
That average is over the runs that came inside the tolerance at all. A run that never gets there
reports nothing rather than a long time, so it leaves the average instead of lengthening it. The
tolerance is a quarter of the run's own peak, and at the settings furthest from the centre the
residual on the plot above sits outside it.

That fraction is not independent evidence, either. It is built out of the two lines on the plot
above, so if the residual holds still while the peak comes down, the fraction has to come down
with it, and nothing about anybody's walking has changed. Read it as a summary of the first plot,
not as a second opinion on it.

:::caveat
Recovery only becomes a number once somebody says how close counts as back, and we chose: inside a
quarter of that run's own peak. A fixed tolerance of a few centimetres was tried first, and it sat
underneath the residual, so every run reported that recovery never happened — which reads like a
fact about the room and is a fact about the rule. We have not found a standard rule for this to
defer to. Ours is a choice like anyone else's. The difference is that it is printed here.
:::

## The clock does not run backwards

Now the same runs, measured on the clock instead of the floor. Time lost is the other quantity
from the last page, and this is the page where it and deviation say different things about the
same crossing.

```mirn:sweep
experiment: e4_recovery
x: passingOffsetM
series:
  - key: pedTimeLostS
    label: how much later people arrived
    accent: true
caption: >
  The same runs, measured on the clock instead of the floor: when each person arrived, against
  when their copy in the run with no robot arrived.
```

With the lane down the middle this reads {{q:e4_recovery[passingOffsetM=0].pedTimeLostS}}, and the
eight runs behind it spread by {{q:e4_recovery[passingOffsetM=0].pedTimeLostS.sd}}. Move the dial
anywhere on its travel. The average of the eight runs stays on the same side of zero.

That spread is wide enough that eight runs cannot put the settings in order, and this plot does
not try to. Uncertainty that size is a result about the measurement rather than a blemish on it.
What it leaves standing is the sign, and the sign is all the rest of this section asks of it.

Deviation heals because something is pulling it back. Time lost has nothing pulling it back. There
is no mechanism in this room, and none in a corridor, that hands a person back a second they spent
stepping around a robot. You could imagine repaying it by walking faster than you meant to for a
while — that is not the delay disappearing, that is the person paying for it in another currency.

A gap in space is a state, and a state can return to a value it held before. A delay is a running
total, and totals only grow. The two quantities behave differently because of what they are, not
because of how this crowd happens to be written.

## What reporting deviation decides

Deviation is a gap in space, and so is nearly everything else that is easy to measure about a
crossing: deviation, clearance, how far off the shortest path somebody ended up. All of them
are quantities that can return to where they started. The one this page measured did: most of the
way back, and not all of it.

Reporting the peak and stopping there is a decision. The peak is not a wrong number — it is
measured, and measured correctly. It is a decision about which cost counts, taken without being
announced: that the cost worth reporting is the one the person absorbs for you afterwards, on
their own time. Put the residual and the fraction recovered beside the peak and the decision is
still yours, but it is no longer silent.

One last thing, and it is the thing the word invites. When the fraction recovered climbs, nothing
has ended. One measurement went back towards zero. The person still went where they had not chosen
to go, still spent the seconds, and would still tell you a robot came past. Recovery is a property
of the number, not of the event.

:::caveat
In this crowd, how much comes back is set by how strongly the model pulls people back towards
their goal, which is a number somebody chose, and by a room with enough clock left after the
robot leaves for any pulling back to happen at all. Neither of those is a fact about corridors. The
asymmetry is: any quantity you build out of positions can heal, and any quantity you build out of
elapsed time cannot, because the seconds are already spent. The ruler is real. The room is
invented, and this page is the one where the difference between them matters most.
:::
