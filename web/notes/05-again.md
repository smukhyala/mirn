---
id: again
page: 5
part: 2
title: Again, with a different crowd
subtitle: How well you know it, and whether it holds
introduces: [uncertainty, robustness]
uses: [run, seed, deviation, perturbation]
reader_can: >
  Say what a second seed changes and what it leaves alone. Read the robot-free line on a density
  plot and say what it is reporting when there is nothing to report. Give uncertainty and
  robustness one plain sentence each, and say which of the two a ninth run would improve.
---

Change one thing about the run you have been watching. Not the robot, not the room, not how fast
anybody walks. Change the seed.

```mirn:scene
id: seed-swing
preset: corridor-11
controls: [play, scrub, seed]
caption: >
  The seed dial rebuilds both runs from nothing: a new crowd, new starting corners, a new stream
  of wobbles, the same room and the same robot driving the same line. Both runs are rebuilt
  together, so the pair still differs in exactly one thing.
```

Everybody on the canvas is now somebody else. The room is untouched — same width, same doors, same
robot on the same errand — and what happens inside it is a different afternoon.

The ruler did not move. The distance between two points is the same formula it was when we met it,
applied to the same pairs of points in the same way. What changed is the room, and the room is
invented. So the number coming out is partly a fact about the robot and partly a fact about which
afternoon we happened to simulate.

```mirn:quantity
id: this-seed
metric: perturbation
caption: The robot's whole effect on the crowd, for the seed currently on screen.
```

For the seed on screen, the robot's whole effect on the crowd comes to {{q:this-seed}}. That is one
afternoon, in one room, with those particular strangers in it.

Turn the dial one click and it reads otherwise.

:::term{id=uncertainty}

This is not the instrument failing. One run answers a question about one afternoon, honestly and
exactly. The question we actually asked was about the robot, and no single afternoon can answer it.

## What the room does on its own

Here is how to find out how much of a reading is the afternoon, with no theory involved at all.

Take the robot out of the room. Run it twice with the same people starting in the same places,
changing nothing but the stream of wobbles. There is now nothing whatsoever to measure: no robot,
so no effect, so the correct answer is nothing. Measure anyway. Every person still has a path in
each run, the distance between those two paths is still a distance, and the deviations still add
up into a number.

That number is what the measurement reports when the truth is nothing.

```mirn:sweep
experiment: e2_density
x: nPedestrians
series:
  - key: meanDeviationM
    label: deviation per person
    accent: true
  - key: runToRunBandM
    label: how much two robot-free runs differ
caption: >
  Every point on the first line is the mean of eight runs with different seeds. The second line
  has no robot in it anywhere — every run behind it is robot-free — so everything it reports is
  the room disagreeing with itself.
```

Read the second line. It is not zero at any crowd size on the plot, and it climbs at every step
across it. At several crowd sizes the two lines nearly touch: in those rooms, the room disagrees
with itself by about as much as the robot moved the average person.

That is the honest condition of this instrument. It is also not repaired by measuring more
carefully. It is repaired by arithmetic — the reading you can defend is the average over many
rooms, not the reading from one, and eight is not many. Later pages turn that into a rule about
which effects are too small to see at all.

## The other thing people mean

Ask whether a robot's effect is reliable and you have asked two questions at once. They come apart,
and keeping them apart is most of what this page is for.

:::term{id=robustness}

Uncertainty is about you. It is a statement about your evidence, and more runs shrink it. Robustness
is about the robot. It is a statement about the machine, and it does not care how many runs you did.

Picture two robots whose effect you have pinned down equally well. Under one of them the deviation
per person holds steady as the corridor fills. Under the other it climbs with every person added.
Your knowledge of the two numbers is identical. What the two machines will do at rush hour is not.

Now look again at the robot-free line on that plot. The room's disagreement with itself gets worse
as the room gets busier, and none of that is the robot's doing. A robot whose effect held perfectly
steady at every crowd size on the plot would still get harder to see as the corridor filled:
robust, and going invisible. Those are two different sentences about the same afternoon, and the
second one is where Part IV begins.

:::caveat
In this crowd every person obeys one rule with one set of constants, so how fast the room's
disagreement with itself grows as it fills is a fact about that rule. That two runs of a room
disagree at all is not. Film any real corridor twice and you have two different afternoons — and we
have not found a published perturbation figure that reports how far apart two of its own robot-free
afternoons would have been.
:::
