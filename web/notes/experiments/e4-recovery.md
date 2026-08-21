---
id: e4-recovery
page: 6
part: 3
title: Once it has gone past
subtitle: What comes back, and what does not
introduces: []
uses: [run, trajectory, nominal-trajectory, deviation, state, seed, recovery, uncertainty, time-lost]
shows: >
  An invented crowd with the robot's lane slid sideways, and a gap that opens as the robot comes
  past, closes part of the way, and then stops closing.
try: >
  Move the dial marked "how far off centre it passes" out to {{lit:3 m}} and watch one pair of
  paths, solid and faint, rather than the crowd.
reader_can: >
  Read a recovery figure as three separate numbers — the peak, what is left at the end, and the
  fraction of the peak that went — and say which of the three is fixed by a threshold somebody
  chose. Say why a person's position can come back and their arrival time cannot. Say what a
  measurement decides, without announcing it, when it reports only the part that heals.
---

corridor-11, except the robot's lane slides sideways, towards one wall. Everything else is held.

## The dial

The lane stays a straight line across the room, and the dial is how far it sits from the middle. At
zero it runs down the centre. At the far end it is {{lit:3 m}} off centre, inside a room
{{lit:13 m}} deep and still short of a wall. Nothing else moves: same crowd, same starting state,
same seed for both runs.

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

```mirn:scene
id: recovery-pass
preset: corridor-11
controls: [play, scrub, showControl, passingOffset]
caption: >
  Solid paths are the run with the robot in it; faint dashed ones are the same people, same seed,
  with the room to themselves. Play it, and watch the gap between one pair rather than either path
  alone. The dial moves the robot's lane sideways.
```

The gap opens as the robot comes past. Then it closes. Then it stops closing. Up, down, and flat.
Not up, down, and gone.

The closing has a name you already have: recovery. Nobody is steering back to their nominal
trajectory; they are steering to a door, and the gap shrinks because that steering stops having a
robot in front of it.

Average the gap over everybody, tick by tick, and read three numbers off the one curve. The peak:
the widest that average ever gets. The residual: how wide it still is at the last tick of a clock
that runs for {{lit:40 s}}. And the fraction of the peak gone by then.

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
  Eight runs of corridor-11 at eight seeds per point, with the robot's lane moved sideways by the
  amount on the axis, drawn with the spread across those seeds.
```

If the robot changed nothing both lines would sit on zero: the two copies of every person share a
seed and a starting state, so they would stay on top of each other.

Down the middle, at an offset of {{lit:0 m}}, the peak reads
{{q:e4_recovery[passingOffsetM=0].peakDeviationM}} and the residual reads
{{q:e4_recovery[passingOffsetM=0].finalDeviationM}}. At {{lit:3 m}} off centre the peak is
{{q:e4_recovery[passingOffsetM=3].peakDeviationM}} and the residual is
{{q:e4_recovery[passingOffsetM=3].finalDeviationM}}. The upper line comes down across the travel;
the lower one wanders inside a band and stays in it. Read the two ends against each other, not a
pair of neighbours.

The residual is measured at the last tick and nowhere else. It is not a claim that anybody is still
being pushed. It says that two copies of one person have not landed on the same spot, which can
happen because the person is still off their line, or because they reached the same door from a
slightly different angle and stopped there.

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

Full recovery would read one. Down the middle the fraction reads
{{q:e4_recovery[passingOffsetM=0].fractionRecovered}}, and at no setting on the axis do the eight
runs average to one. Recovery here is partial. What closing there is takes time —
{{q:e4_recovery[passingOffsetM=0].recoveryS}} at that setting, counted from the widest moment, and
averaged over the runs that came inside the tolerance at all. A run that never gets there reports
nothing rather than a long time, so it leaves the average instead of lengthening it. The tolerance
is a quarter of the run's own peak, and at the settings furthest from the centre the residual on
the plot above sits outside it.

That fraction is not independent evidence either. It is built out of the two lines on the plot
above, so if the residual holds still while the peak comes down, the fraction comes down with it,
and nothing about anybody's walking has changed. Read it as a summary of the first plot, not a
second opinion on it.

:::caveat
Recovery only becomes a number once somebody says how close counts as back, and we chose: inside a
quarter of that run's own peak. A fixed tolerance of a few centimetres sat underneath the residual,
so every run reported that recovery never happened — a fact about the rule that reads like a fact
about the room. We have not found a standard rule to defer to. Ours is a choice like anyone else's,
printed here.
:::

## The clock does not run backwards

Time lost is the other quantity from the last page, and here it parts company with deviation.

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

A robot that cost nobody anything would put this line on zero. Down the middle it reads
{{q:e4_recovery[passingOffsetM=0].pedTimeLostS}}, and the eight runs spread by
{{q:e4_recovery[passingOffsetM=0].pedTimeLostS.sd}} — wide enough that they cannot put the settings
in order. Uncertainty that size is a result about the measurement rather than a blemish on it. What
it leaves standing is the sign, and the sign holds wherever the dial sits.

Deviation heals because something pulls it back. Time lost has nothing pulling it back. A gap in
space is a state, and a state can return to a value it held before. A delay is a running total, and
totals only grow.

## What reporting deviation decides

Deviation is a gap in space, and gaps in space can come back. This one did: most of the way, not
all of it. Reporting the peak alone is measured correctly, and decides something without announcing
it — that the cost worth reporting is the one the person absorbs afterwards, on their own time.
Print the residual and the fraction recovered beside the peak and the decision is still yours, but
no longer silent.

When the fraction recovered climbs, nothing has ended. The person still went where they had not
chosen to go and still spent the seconds. Recovery is a property of the number, not of the event.

:::caveat
In this crowd, how much comes back is set by how strongly the model pulls people towards their goal
— a number somebody chose — and by a room with enough clock left after the robot leaves. Neither is
a fact about corridors. The asymmetry is: any quantity built out of positions can heal, and any
quantity built out of elapsed time cannot, because the seconds are already spent. The ruler is
real. The room is invented.
:::
