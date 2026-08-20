---
id: the-floor
page: 7
part: 4
title: The ruler, before the room
subtitle: What the measurement reports when nothing happened
introduces: [the-null, detection-floor]
uses: [run, trajectory, deviation, seed, divergence, perturbation, uncertainty]
reader_can: >
  Say what a measurement reports when there is nothing to report, and why that number is not zero.
  Read a floor off a robot-free crowd and name the sample it belongs to. Explain why two numbers
  judged against two different floors cannot be set side by side.
---

Start with the ruler, before measuring anything with it. Take the crowd with no robot in it at
all, split the people into two random halves, and ask how different the two halves look. The
answer comes from a divergence: a single number for how far apart two sets of paths are.

Nothing in this crowd could be responding to a robot, because there is no robot. And yet the
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

Both halves came out of one crowd, and the divergence has no way of knowing that. It is handed
two clouds of points and asked how far apart they sit. Two samples of one crowd never land on top
of each other: one half gets the person who cut the corner, the other gets the pair who walked
shoulder to shoulder. The answer arrives with a gap in it that nobody put there.

Reshuffle and the answer moves, because a different person landed on a different side. Do it a
few hundred times and the answers spread out into a shape. That shape is what this measurement
reports when there is nothing to report. The floor is drawn near the top of it, so that only a
small share of the shuffles fall outside the line at all.

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
In this crowd the wobble that produces the floor is a model's noise: a bell curve, chosen by me,
with a width I picked. The floor a real corridor has is not that one. What survives the model is
that a floor exists at all, that it has to be measured before anything is measured against it,
and that no amount of care further down the pipeline stands in for measuring it. The ruler is
real. The room is invented.
:::

## The floor belongs to your sample

There is a neighbouring question, and it is the one this project swept. Leave the crowd whole. Run
the room several times over, a different seed each time and no robot in any of them, then pair the
runs against each other. Nothing was done to a single one of them, so whatever separates them is
the room's own restlessness and not the robot's doing.

The two constructions are not the same number and are never mixed. One asks how far apart two
halves of a crowd sit. The other asks how far apart two mornings in the same room sit. What they
share is where their size comes from.

The second one has already appeared under another name. It is the run-to-run spread the experiment
pages set every deviation figure against — the band, there. The floor on this page is a different
line, and the two are never divided by one another.

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
  did either; only the size of the sample did.
```

Change how many people are in the room and the floor changes with them, and it changes a long way:
it more than halves across this sweep. Nothing about the robot changed, and nothing about how hard
people push each other changed. Only the number of them being pooled did.

Notice where that leaves this room. Across the whole of that axis the floor stays above the effect
the robot actually has here. Measured this way, in a crowd this size, the robot's effect on people
is not something you could tell apart from the shuffle. The paired comparison the earlier pages
used does not have that problem, because it never estimates anything — but a study that cannot run
the room twice has no such escape.

That is the mild version of a general complication, and the general version is worth saying
flatly. Neither of these numbers is a property of the world. Each is a property of what you
measured: how many people you pooled, how long you watched them, how finely you kept their
trajectories. Thin each trajectory before pooling and the floor moves. Nothing on this page sweeps
that, so take it as a property of how the floor is built rather than as a result.

So a floor travels with its number, or the number is not reportable. Two effects judged against
two different floors are two rulers held up in two different rooms, and the ratio between them
describes neither. A deviation means nothing on its own until you know the floor it was measured
against.

Keep the floor apart from uncertainty. Uncertainty is how much your answer would have moved if
the world had rolled differently. The floor is how small an answer can get before the measurement
stops being able to see it at all. Both are built out of the same restlessness in the room, and
they answer different questions.

One last thing, about the field rather than about this room. We have not found a published study
of robot-induced perturbation — how far a robot pushes people off the path they would otherwise
have walked — that reports this floor. If that holds, the numbers those studies do report have
nothing to be judged against. There is no way to tell a real effect from the measurement's own
wobble.
