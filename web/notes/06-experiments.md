---
id: experiments
page: 6
part: 3
title: Experiments
subtitle: One question, one changed setting, one comparison
introduces: [near-miss, time-lost]
uses: [run, deviation, seed, recovery, perturbation, uncertainty]
reader_can: >
  Name the four parts of an experiment on this site and say which one people usually drop.
  Restate corridor-11 from memory: the room, the people, the robot, the clock, the paired re-run.
  Say why the prediction box sits above the plot rather than below it. Tell near miss and time
  lost apart from deviation, and say which of the three the person gets back.
---

An experiment here is four things, and it stops being an experiment if any of them is missing.

A question that could come out either way. A fixed room that every run starts from. One setting
changed, and only one. A comparison between what came out and what came out of the fixed room.

The third is the one people drop. Change the robot's speed and the size of the crowd at the same
time and you have learned something about the pair of them, and nothing about either.

## Say what you think will happen, first

Each of the seven pages puts its question, and a box to answer it in, above the plot. Nothing is
scored, and nothing leaves your browser.

The box is there because a prediction you did not record is a feeling you can retroactively claim
to have had. Written down, it can be wrong, and the moments where the room contradicts you are the
ones worth stopping on. If you skip the box, every plot will look like it agreed with you.

## corridor-11

Every experiment on this site starts from the same room, so that seven answers can be laid beside
each other and mean something together. The room is called corridor-11, and it is this.

A space {{lit:22 m}} across and {{lit:13 m}} deep. {{lit:18 people}} crossing it, some going left
to right and some going right to left, each aimed at a spot on the far side. One robot, entering
at the left-hand end and driving straight across to the right. The clock runs for {{lit:40 s}}.

Then the whole thing again at the same seed, with the robot removed and nothing else touched.

```mirn:scene
id: corridor-11-baseline
preset: corridor-11
controls: [play, scrub, showControl]
caption: >
  corridor-11 with nothing altered. Every page in this part begins from exactly this run, changes
  one setting, and runs it again.
```

Each of the seven pages names the single thing it changed before it shows you a plot. If a page
does not name it, that is a bug and I would like to know.

## Two things deviation cannot say

Deviation carries these pages, and the page about a filling corridor adds perturbation beside it.
Two questions need something neither of them measures.

The first is about the robot coming close to somebody, which is not the same as moving them. A
person can be passed at arm's length and hold their line perfectly.

:::term{id=near-miss}

The second is about what the push costs the person once the pushing is over.

:::term{id=time-lost}

Recovery pulls the gap in space back toward the line the person was on. It does not give the
seconds back, so deviation and time lost can disagree about the same run. Whether they disagree by
enough to see is a separate question: in this crowd the seed-to-seed spread on time lost is
comparable to the time lost itself.

## The seven questions

1. [Does pushing harder move people further?](/experiments/push-strength) — corridor-11, except
   the robot demands more space, or less.
2. [A fuller room: bigger effect, or harder to see?](/experiments/density) — corridor-11, except
   the number of people in it changes.
3. [Should it hurry, or should it slow down?](/experiments/robot-speed) — corridor-11, except the
   robot's top speed changes.
4. [Once it has gone past, is everything back to normal?](/experiments/recovery) — corridor-11,
   except the robot's lane shifts away from the middle of the room.
5. [Can it affect somebody it never went near?](/experiments/propagation) — corridor-11, except
   the room is fuller and each person is filed by how close the robot ever got to them.
6. [What if it cannot see properly?](/experiments/perception) — corridor-11, except the robot's
   picture of where people are is blurred.
7. [It could go around. Is that worth it?](/experiments/politeness) — corridor-11, except the
   robot is asked to weigh other people's space against its own arrival.

Most points on those plots are eight runs of corridor-11 at eight different seeds, drawn with the
spread of the eight around them. One run is an anecdote. Eight runs with the spread shown is a
measurement, and the spread is the uncertainty you are entitled to before you believe the middle.

The propagation question is the exception. It sorts people by how close the robot came to them
rather than turning a dial, so its points pool people across runs and carry no spread of their
own, and a point with no spread beside it is one to believe less.

:::caveat
In this crowd, the size of every answer in this part is a property of a social-force model that
somebody wrote down, including the answers that look decisive. What does not depend on the model
is the procedure: one question, one changed setting, one paired re-run at the same seed, and a
prediction recorded before the plot was drawn. The ruler is real. The room is invented, and it
stays invented on all seven pages.
:::
