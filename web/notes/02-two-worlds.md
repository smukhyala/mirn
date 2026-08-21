---
id: two-worlds
page: 2
part: 1
title: The same room, twice
subtitle: Where deviation comes from
introduces: [nominal-trajectory, deviation, state, seed]
uses: [run, trajectory]
shows: >
  The same invented crowd walking twice — once with a robot crossing the room, once with no robot
  in it at all — and the gap between a person's two paths.
try: >
  Switch "Show the robot-free run" off and on under the figure, and follow one person's two paths.
reader_can: >
  Explain why the second run is available here and nowhere else. Point at any moment and say what
  the gap between a person's two paths means. Read a deviation figure and reproduce the arithmetic
  behind it from two coordinates and a distance formula.
---

The move that makes the question answerable is available for one reason: this room is not real. Run
it again with the same people, the same starting positions, the same speeds, the same stream of
random numbers — and no robot in it at all. Nothing else *can* change: a run of this room is decided
entirely by where everybody starts and which numbers get drawn.

```mirn:scene
id: ghost-reveal
preset: corridor-11
controls: [play, scrub, showControl]
caption: >
  Solid paths: the run with a robot in it. Faint dashed paths: the same people, in the same room,
  with no robot at all.
```

Now every person has two paths, and the faint one has a name.

:::term{id=nominal-trajectory}

The gap between a person's two paths is the robot's effect on that person — not an estimate of it
but the thing itself, because the only difference between the two runs is the robot. So it gets a
name.

:::term{id=deviation}

```mirn:quantity
id: worked
metric: deviation
caption: >
  Click the number. The working opens underneath, and the two points it came from light up on the
  canvas.
```

Every number on this site opens like that. If one does not, it is a bug and I would like to know.

The distance between two points is the only school mathematics this site assumes:

$$
d \;=\; \lVert p - q \rVert \;=\; \sqrt{(p_x - q_x)^2 + (p_y - q_y)^2}
$$

That is the entire definition of deviation. Everything harder is about which pairs of points to
measure between.

## Why the second run is trustworthy

Two things had to be held fixed. The first is where everybody started.

:::term{id=state}

Both runs began from the same state. The second is randomness: people do not walk in straight
lines, so each of them gets a small unpredictable wobble.

:::term{id=seed}

Change either one and the two rooms drift apart on their own, and the gap stops being the robot's
doing. Two runs of this room that differ only in their seed end up further apart than the robot
ever pushes anybody. The second run has to be a copy, not a rerun.

:::caveat
In this crowd the wobble is drawn from a bell curve, which is a convenient lie. What the seed is
*for* — making a run repeatable, so two of them can be compared — is not a lie, and is how every
simulation study that has ever established a baseline has done it.
:::
