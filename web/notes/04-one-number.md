---
id: one-number
page: 4
part: 2
title: One number
subtitle: What the squeezing throws away
introduces: [divergence, perturbation]
uses: [run, trajectory, nominal-trajectory, deviation, seed, disturbance, recovery]
shows: >
  An invented crowd squeezed into a single number two different ways, and a sweep where the two
  ways put the same robots in a different order.
try: >
  Click the button in the first figure — its label carries both numbers — and read the working
  that opens underneath it.
reader_can: >
  Say what a divergence is and name two of them without looking. Read a sweep with two summaries
  drawn on it and describe how the two lines part company. Explain to somebody else why "how much
  did the robot disturb people" needs a second question before it has an answer.
---

By the end of the last page every person in the room had a deviation, and a fresh one every
{{lit:0.05 s}} of the crossing. Nobody can read thousands of numbers, so you squeeze them into one.
The squeezing has a name.

:::term{id=divergence}

Two rules do nearly all of the work here, and you know both already. The *average*: every person's
deviation at every moment, averaged. How far off was an ordinary person at an ordinary moment? The
*worst moment*: the crowd's average deviation sits near zero, climbs as the robot arrives, tops
out, and settles back as people recover, and you report the height of that peak. How bad did it
get?

Both are divergences: paths in, one number out. What that number describes has a name of its own.

:::term{id=perturbation}

Perturbation is what this whole site asks about, and it does not exist until you have picked a
divergence.

```mirn:quantity
id: both-summaries
metric: deviation-summary
caption: >
  One run of the invented room, squeezed twice. Click either number and the working opens
  underneath it: the average over the whole curve, and the tick where that curve tops out.
```

Same paths, same arithmetic underneath, two answers: {{q:both-summaries.mean}} and
{{q:both-summaries.max}}.

Neither is a mistake; each is the honest output of a rule. What makes it a problem is that a number
stops carrying its rule around with it the moment it leaves the room: somebody sets it beside a
number from another study, and the two were squeezed by different rules.

A caution about the word maximum, while it is in front of you. The top of that curve is the crowd's
average at its worst instant, not the worst-affected person at theirs, and the word on its own does
not say which was meant.

## Pushing harder

The robot is the disturbance here, and how hard it shoves people aside is one setting. Turn it up.

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
  Push strength along the bottom. Every point is eight runs of the invented crowd with different
  seeds, averaged.
```

Both lines go up: shove people harder and they end up further from their nominal trajectories,
whichever way you squeeze. At the left-hand end the robot shoves nobody at all and both rules read
zero, which is what either should read when there is nothing to report.

They rank the seven push settings identically too, and disagree only on how big to call the
answer. The worst moment sits well above the average everywhere the sweep is off zero, because it
is the height of a peak and the average has the quiet stretches of the run in it.

Read it step by step, though, and across the right-hand half each move to the next setting sits
inside the run-to-run scatter at the setting it lands on, on both lines: over that stretch the
sweep establishes the direction and nothing finer.

## The same speeds, two orderings

Push strength is the gentle case, which is why the trap is easy to miss. Now fix the push and
change only the cap on how fast the robot may travel.

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
  A speed limit on the robot along the bottom. Same invented crowd, same push, eight seeds per
  point.
```

Neither line is a ramp. On both, the largest reading sits at a middling speed rather than at either
end: a robot creeping across never has to shove anybody hard, and one that hurries is past before
much can happen — a story the plot is consistent with rather than one it establishes.

Now rank the speed settings by the average, and rank them again by the worst moment. You do not get
the same list: the first four places agree, and then the slowest robot and the second-fastest
change places. Two defensible rules, identical paths, and a different ordering of the same six
robots — which of them you would call well-behaved is settled by the rule you reached for, not by
anything the robots did.

:::caveat
The two settings that change places sit inside the run-to-run scatter of each other, and both
orderings rest on eight runs, which is not many. That does not rescue the number: a summary that
cannot separate two settings is saying what one that ranks them backwards says, which is that one
number was never going to settle it.
:::

## So which one

Neither, alone. The rest of this site reports both, and where a single number is unavoidable the
divergence gets named beside it: a perturbation quoted without its divergence is a length quoted
without its unit. The ruler is real and the room is invented — and there is more than one ruler in
the drawer, not all marked in the same units.

:::caveat
Where the two summaries part company here is a property of this model's push: a short, sharp shove
as the robot goes by, then recovery. A crowd leaned on gently for a long stretch need not part
company in the same place, and we have not measured one that does. What is not a property of this
model is that every divergence throws information away on purpose, so two of them can order the
same settings differently. That is arithmetic, and it happens to real pedestrians too.
:::
