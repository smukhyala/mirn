---
id: two-worlds
page: 2
part: 1
title: The same room, twice
subtitle: Where deviation comes from
introduces: [nominal-trajectory, deviation, state, seed]
uses: [run, trajectory]
reader_can: >
  Explain why the second run is available here and nowhere else. Point at any moment and say what
  the gap between a person's two paths means. Read a deviation figure and reproduce the arithmetic
  behind it from two coordinates and a distance formula.
---

Here is the move that makes the question answerable, and it is available to us for exactly one
reason: this room is not real.

Run it again. The same people, the same starting positions, the same speeds, the same stream of
random numbers — and no robot in it at all. Nothing else changed. Nothing else *can* change: a run
of this room is decided entirely by where everybody starts and which random numbers get drawn, and
both of those are being held fixed.

```mirn:scene
id: ghost-reveal
preset: corridor-11
controls: [play, scrub, showControl]
caption: >
  The solid paths are the run with a robot in it. The faint dashed ones are the same people, in
  the same room, with no robot at all.
```

Now every person has two paths. The faint one is where they went with nothing interfering. Call it
the nominal trajectory — the path they would have walked if the robot had never been there.

:::term{id=nominal-trajectory}

The gap between a person's two paths is the robot's effect on that person. Not an estimate of it.
It, exactly, with nothing guessed at, because the only difference between the two runs is the
thing we are asking about.

That gap is what this whole site is about, so it gets a name, and the one colour on these pages
that is not black or grey.

:::term{id=deviation}

```mirn:quantity
id: worked
metric: deviation
caption: >
  Click the number. The working opens underneath it, and the two points it came from light up on
  the canvas above.
```

Every number on this site opens like that. If one does not, it is a bug and I would like to know.

The distance between two points is the one piece of school mathematics this site assumes, and it
is doing all of the work:

$$
d \;=\; \lVert p - q \rVert \;=\; \sqrt{(p_x - q_x)^2 + (p_y - q_y)^2}
$$

That is the entire definition of deviation. Everything harder that follows is about *which* pairs
of points to measure between, and what to do with the several hundred numbers you get.

## Why the second run is trustworthy

Two things had to be held fixed, and it is worth knowing which.

The first is where everybody started — not just their positions, but how fast they were already
going.

:::term{id=state}

Both runs began from the same state for every person in the room. The second is the randomness.
People do not walk in perfectly straight lines, and this model gives each of them a small
unpredictable wobble.

:::term{id=seed}

Change either one and the two rooms start drifting apart on their own, and the gap you measure
stops being the robot's doing. That is not a hypothetical: two runs of this room that differ only
in their seed end up further apart than the robot ever pushes anybody. You will meet that number
again, and it is the reason the second run has to be a copy rather than a rerun.

:::caveat
In this crowd the wobble is a number drawn from a bell curve, which is a convenient lie. What the
seed is *for* — making a run repeatable, so that two of them can be compared — is not a lie, and
is how every simulation study that has ever established a baseline has done it.
:::
