---
id: the-floor
page: 7
part: 4
title: The ruler, before the room
subtitle: What the measurement reports when nothing happened
introduces: [the-null, detection-floor]
uses: [run, trajectory, deviation, seed, divergence, perturbation, uncertainty]
shows: >
  An invented crowd with no robot anywhere in it, dealt into two halves, and the number the
  measurement still reports when there is nothing at all to report.
try: >
  Drag the slider under the first figure from one end to the other and watch the reading beside it:
  the gap it reports stays at zero wherever you put it, because there is no robot in this room to
  push anybody anywhere.
reader_can: >
  Say what a measurement reports when there is nothing to report, and why that number is not zero.
  Read a floor off a robot-free crowd and name the sample it belongs to. Explain why two numbers
  judged against two different floors cannot be set side by side.
---

Start with the ruler, before measuring anything with it. Take the crowd with no robot in it, split
the people into two random halves, and ask how far apart the halves sit, using the same divergence
as before. Nothing here could be responding to a robot, because there is no robot. And yet the
number is not zero.

That leftover has a name.

:::term{id=the-null}

The null is a range, not a single number. Its top edge has a name of its own.

:::term{id=detection-floor}

```mirn:scene
id: split-half
preset: corridor-11-control
controls: [play, scrub]
caption: >
  The room from the opening pages with the robot taken out of it. This is the population the
  halves are dealt from: no robot anywhere in it, and every path in it the path somebody would
  have walked with nothing in their way.
```

## Where the number comes from

Two samples of one crowd never land on top of each other: one half gets the person who cut the
corner, the other gets the pair who walked shoulder to shoulder. The answer arrives with a gap in
it that nobody put there.

Reshuffle a few hundred times and the answers spread out into a shape. That shape is what this
measurement reports when there is nothing to report, and the floor is drawn near its top edge, so
that only a small share of the shuffles fall outside the line.

The panel gives {{q:one-split.floor}} for the crowd it is showing. It belongs to that crowd, at that
sample size, and to nothing else.

```mirn:quantity
id: one-split
metric: detection-floor
caption: >
  The working behind the floor: the crowd that was pooled, how many times it was dealt into
  halves, the range those deals produced, and where the line was drawn through them.
```

:::caveat
In this crowd the wobble that produces the floor is a model's noise: a bell curve I chose, with a
width I picked. The floor a real corridor has is not that one. What survives the model is that a
floor exists at all, and has to be measured before anything is measured against it. The ruler is
real. The room is invented.
:::

## The floor belongs to your sample

The floor is not one number for all time. Pool a different number of people and it moves — more
than halving across the sweep below.

The run-to-run band the experiment pages set every deviation figure against — whole runs, a
different seed each, no robot in any of them — is a different line, and the two are never divided
by one another. The floor asks how far apart two halves of one crowd sit. The band asks how far
apart two mornings in the same room sit.

```mirn:sweep
experiment: detection_floor
x: nPedestrians
series:
  - key: floorM
    label: the detection floor
    accent: true
  - key: nullMeanM
    label: the middle of the null, for scale
caption: >
  The floor against how many people were pooled to build it, with no robot in any of these runs.
  It falls throughout. Nothing about the room changed along this axis and nothing about the robot
  did either. Only the size of the sample did.
```

Notice where that leaves this room. Across the whole of that axis the floor stays above the effect
the robot actually has here: in a crowd this size, measured this way, the robot's effect on people
is not something you could tell apart from the shuffle. The paired comparison the earlier pages
used does not have that problem, because it never estimates anything — but a study that cannot run
the room twice has no such escape.

So the floor is not a property of the world. It is a property of what you measured: how many people
you pooled, how long you watched them, how finely you kept their trajectories. Thin each trajectory
before pooling, or watch for longer, and the floor moves; nothing on this page sweeps either, so
take those two as properties of how the floor is built rather than as results. It travels with its
number, or the number is not reportable. Two effects judged against two different floors are two
rulers held up in two different rooms, and the ratio between them describes neither.

Keep it apart from uncertainty, which is how much your answer would have moved if the world had
rolled differently. The floor is how small an answer can get before the measurement stops being
able to see it at all.

We have not found a published study of robot-induced perturbation — how far a robot pushes people
off the path they would otherwise have walked — that reports this floor. If that holds, the numbers
those studies do report have nothing to be judged against.
