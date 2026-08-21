---
id: experiments
page: 6
part: 3
title: Experiments
subtitle: One question, one changed setting, one comparison
introduces: [near-miss, time-lost]
uses: [run, deviation, seed, recovery, perturbation, uncertainty]
shows: >
  An invented crowd of {{lit:18 people}} crossing a {{lit:22 m}} room while a robot drives through
  it — the room all seven experiments start from, each of them changing one setting.
try: >
  Switch "Show the robot-free run" off and on under the corridor-11 figure, and watch the faint
  paths go and come back.
reader_can: >
  Name the four parts of an experiment on this site and say which one people usually drop.
  Restate corridor-11 from memory: the room, the people, the robot, the clock, the paired re-run.
  Say why the prediction box sits above the plot rather than below it. Tell near miss and time
  lost apart from deviation, and say which of the three the person gets back.
---

An experiment here is four things, and it stops being an experiment if any is missing. A question
that could come out either way. A fixed room every run starts from. One setting changed, and only
one. A comparison against what the fixed room gives with nothing changed.

The third is the one people drop. Change the robot's speed and the crowd size at once and you
have learned about the pair of them, and nothing about either.

## Say what you think will happen, first

Each of the seven pages puts its question, and a box to answer it in, above the plot. It sits
above because a prediction you did not record is a feeling you can retroactively claim to have
had. Written down, it can be wrong. Nothing is scored, and nothing leaves your browser.

## corridor-11

Every experiment starts from the same invented room, corridor-11, so seven answers can be laid
beside each other and mean something together.

A space {{lit:22 m}} across and {{lit:13 m}} deep. {{lit:18 people}} crossing it in both
directions, each aimed at a spot on the far side. One robot, entering at the left-hand end and
driving straight across to the right. The clock runs for {{lit:40 s}}. Then the whole thing again
at the same seed, with the robot removed and nothing else touched.

```mirn:scene
id: corridor-11-baseline
preset: corridor-11
controls: [play, scrub, showControl]
caption: >
  corridor-11 with nothing altered. Every page in this part begins from this run, changes one
  setting, and runs it again.
```

## Two things deviation cannot say

Two questions need something neither deviation nor perturbation measures.

The first is coming close to somebody, which is not the same as moving them: a person can be
passed at arm's length and hold their line perfectly.

:::term{id=near-miss}

The second is what the push costs the person once the pushing is over.

:::term{id=time-lost}

Recovery pulls the gap in space back toward the line the person was on. It does not give the
seconds back, so deviation and time lost can disagree about the same run. In this crowd the
seed-to-seed spread on time lost is comparable to the time lost itself.

## The seven questions

Each is corridor-11 with one setting changed, named on the page before its plot.

1. [Does pushing harder move people further?](./e1-push-strength.html) — the space the robot
   demands.
2. [A fuller room: bigger effect, or harder to see?](./e2-density.html) — how many people are in
   the room.
3. [Should it hurry, or should it slow down?](./e3-robot-speed.html) — the robot's top speed.
4. [Once it has gone past, is everything back to normal?](./e4-recovery.html) — how far off centre
   the robot's lane passes.
5. [Can it affect somebody it never went near?](./e5-propagation.html) — a fuller room, with
   everybody in it filed by how close the robot ever got to them.
6. [What if it cannot see properly?](./e6-perception.html) — how much error there is in what the
   robot sees.
7. [It could go around. Is that worth it?](./e7-politeness.html) — how hard the robot tries to
   stay out of the way.

Most points are eight runs at eight different seeds, drawn with the spread of the eight around
them. One run is an anecdote. The spread is the uncertainty you are entitled to before you believe
the middle. The propagation question is the exception: it sorts people by how close the robot came
rather than turning a dial, so its points pool people across runs and carry no spread of their own,
and a point with no spread beside it is one to believe less. It pools sixteen runs rather than
eight, because the groups furthest from the robot are thin however many rooms you fill.

:::caveat
In this crowd, the size of every answer in this part is a property of a social-force model that
somebody wrote down, including the answers that look decisive. What does not depend on the model
is the procedure: one question, one changed setting, one paired re-run at the same seed, and a
prediction recorded before the plot was drawn. The ruler is real. The room is invented, and stays
invented on all seven pages.
:::
