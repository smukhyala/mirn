---
id: one-number
page: 4
part: 2
title: One number
subtitle: What the squeezing throws away
introduces: [divergence, perturbation]
uses: [run, trajectory, nominal-trajectory, deviation, seed, disturbance, recovery]
reader_can: >
  Say what a divergence is and name two of them without looking. Read a sweep with two summaries
  drawn on it and describe how the two lines part company. Explain to somebody else why "how much
  did the robot disturb people" needs a second question before it has an answer.
---

By the end of the last page every person in the room had a deviation, and they had one at every
tick of the clock — a fresh reading every {{lit:0.05 s}}, for all eighteen of them, for the whole
crossing. That is thousands of numbers for one run of one room.

Nobody can read thousands of numbers. So you squeeze them into one, and the squeezing has a name.

:::term{id=divergence}

Two rules do nearly all of the work in this field, and you already know both, because they are the
two summaries anybody reaches for when handed a pile of numbers.

The first is the *average*. Take every person's deviation at every moment and average the lot.
It answers: how far off was an ordinary person, at an ordinary moment?

The second is the *worst moment*. Follow the crowd's average deviation as the run goes on. It
sits near zero, climbs as the robot arrives, tops out, and settles back down as people recover.
Report the height of the top of that curve. It answers: how bad did it get?

Both are divergences. Both take paths in and give one number out. Once you have that number, the
thing it describes has a name of its own.

:::term{id=perturbation}

Perturbation is what this whole site is asking about, and it does not exist until you have picked
a divergence. Pick the other rule and you get another number about the very same run.

```mirn:quantity
id: both-summaries
metric: deviation-summary
caption: >
  One run of the room, squeezed twice. Click either number and the working opens underneath it:
  the average over the whole curve, and the single tick where that curve tops out.
```

Same paths, same arithmetic underneath, two answers: {{q:both-summaries.mean}} and
{{q:both-summaries.max}}.

Neither of those is a mistake. Each is the honest output of a rule, and the two rules were built
to answer separate questions. What makes it a problem is that a number stops carrying its rule
around with it the moment it leaves the room. Somebody reads it, sets it beside a number from
another study, and the two were squeezed by different rules.

A caution about the word maximum, while it is in front of you. The top of that curve is the
crowd's average at its worst instant. It is not the worst-affected person at their worst instant.
Those are two quantities, and the word "maximum" on its own does not say which one was meant.

## Pushing harder

Start with the knob nobody would argue about. The robot is the disturbance in this room, and how
hard it shoves people aside as it passes is a single setting. Turn it up.

```mirn:sweep
experiment: e1_push_strength
x: repulsionScale
series:
  - key: meanDeviationM
    label: averaged over everybody, all run
    accent: true
  - key: maxDeviationM
    label: the crowd at its one worst moment
caption: >
  Push strength along the bottom, and nothing else changing. Every point is eight runs with
  different seeds, averaged.
```

Both lines go up. That is the sanity check passing: shove people harder and they end up further
from their nominal trajectories, whichever way you squeeze.

They also go up together. Rank the seven push settings by the average and then rank them again by
the worst moment, and you get the same list both times. Put each line on its own scale and the two
have the same shape as well: at every setting on the sweep, each has climbed roughly the same
fraction of its own total rise, and what daylight there is between those fractions sits inside the
run-to-run scatter. Whatever bending there is, both rules bend the same way.

What the two rules do not agree on is the size of the answer. The worst moment sits well above the
average everywhere the sweep is off zero, because it is the height of a peak and the average has
the quiet stretches of the run in it. The eight runs behind both lines are the same eight runs, and
the same crossing reads as one figure or the other depending on nothing but which rule you reached
for.

Read the sweep step by step rather than end to end and there is less in it than the lines suggest.
Across the right-hand half, the move from one setting to the next sits inside the run-to-run
scatter at either of them, on both lines. The sweep establishes the direction. It does not
establish that any one setting on it can be told apart from its neighbour.

## The same speeds, two orderings

Push strength is the gentle case. The two summaries agree there on the direction, on the shape and
on the order of the settings, and part company only over how big to call the answer — which is
exactly why the trap is easy to miss. A sweep like that one gives you no warning that the choice of
rule was doing anything at all. Speed is not the gentle case. Here the robot's push is fixed and
the only change is a cap on how fast it is allowed to travel.

```mirn:sweep
experiment: e3_robot_speed
x: maxSpeed
series:
  - key: meanDeviationM
    label: averaged over everybody, all run
    accent: true
  - key: maxDeviationM
    label: the crowd at its one worst moment
caption: >
  A speed limit on the robot along the bottom. Same crowd, same push, eight seeds per point.
```

Neither line is a ramp. On both, the largest reading sits at a middling speed rather than at either
end of the range. The obvious story is that a robot creeping across never has to shove anybody hard
and a robot that hurries is past before much can happen, leaving the trouble in between — a story
this plot is consistent with rather than one it establishes. Every move from one speed setting to
the next, on both lines, sits inside the run-to-run scatter at the points it joins, so the arch is
as much as can be read off it.

Then rank the speed settings. Put them in order using the average, then put them in order again
using the worst moment. You do not get the same list. The first four places come out the same on
both; the last two do not, because the slowest robot and the second-fastest change places. Which of
those two you would call the well-behaved one is settled by the rule you reached for rather than by
anything the robots did.

This is the whole page in one figure. Not "the model is wrong", not "the rules were applied badly" —
two defensible rules, applied to identical paths, handing back different orderings of the same six
robots.

:::caveat
The two settings that change places sit inside the run-to-run scatter of each other, on both
lines, and both orderings rest on eight runs, which is not many. How much of an ordering like this
survives more runs is a real question and it gets its own page later. It does not rescue the
number, though: a summary that cannot separate two settings is telling you the same thing as a
summary that ranks them backwards, which is that one number was never going to settle it.
:::

## So which one

Neither, alone. The rest of this site reports both, every time, and where a single number is
unavoidable the rule is that the divergence gets named right next to it — the way a length gets
"metres" written after it. A perturbation quoted without its divergence is a length quoted
without its unit, and it should be read with the same suspicion.

The ruler is real and the room is invented. What this page adds is that there is more than one
ruler in the drawer, they are not marked in the same units, and choosing between them is part of
the measurement rather than a detail underneath it.

:::caveat
Where the two summaries part company on this page — one pair of speed settings, at the ends of the
range — is a property of this model's push: a short, sharp shove as the robot goes by, then
recovery. A crowd that got leaned on gently for a long stretch need not part company in the same
place, or on the same knob, and we have not measured one that does. What is not a
property of this model is that every divergence throws information away on purpose, and that two
of them can order the same settings differently. That is arithmetic, and it will happen to real
pedestrians too.
:::
