---
id: e5-propagation
page: 6
part: 3
title: Somebody it never went near
subtitle: corridor-11, except everybody is filed by how close the robot got to them
introduces: []
uses: [run, trajectory, deviation, seed, nominal-trajectory, disturbance, perturbation, uncertainty]
shows: >
  An invented crowd sorted into groups by how close the robot ever came to each person, and what
  the people it never went near did anyway.
try: >
  Switch "Show the robot-free run" on under the first figure, then pick somebody crossing wide of
  the robot and watch their pair of paths.
reader_can: >
  Work out a person's closest approach, and say why it is measured against the path they would
  have walked rather than the one they walked. Predict whether deviation falls away with distance,
  then say what the plot did instead. Walk the chain by which somebody the robot never came near
  gets moved anyway. Say which points on this plot carry enough people to be worth reading, and
  which one is a handful.
---

corridor-11, except the room is fuller, and everybody in it is filed by a single number: how close
the robot ever got to them.

That number comes out of the pair, one person at a time. Take the path the person walked in the run
with no robot in it, take the robot's path, and at every tick measure centre to centre. The
smallest value the whole run produced is their closest approach.

Filing people by a path they did not walk looks like a mistake and is the only defensible choice.
File them by where they actually went and the filing is decided partly by the shove being measured,
because moving somebody changes how close they came to the robot.

One thing about the room was changed: the crowd is filled up until the outer groups have enough
people to average. The filing is not a setting, only how the answers get sorted once they exist.

## What you would expect

The robot's shove falls off with distance, and nothing else in the room is aimed at anybody in
particular. So the prediction almost writes itself. Sort people by closest approach, average the
deviation inside each group, and the near groups move while the far groups sit at nothing: a cliff,
then a flat line.

Decide which of these you expect before you scroll.

- the effect stops once the robot is a few metres off
- the effect fades steadily as you go outward
- the effect barely fades at all

```mirn:scene
id: watch-a-bystander
preset: corridor-11
controls: [play, scrub, showControl]
showControl: false
caption: >
  The ordinary room, before the crowd is filled up. Turn on the robot-free run, pick somebody the
  robot never goes near, and watch their pair of paths instead of the scrum in the middle.
```

## What the room did

```mirn:sweep
experiment: e5_propagation
x: closestApproachFromM
yLabel: metres
series:
  - key: meanDeviationM
    label: mean deviation of the people in this group
    accent: true
caption: >
  Each point is one group, drawn at its near edge: 0-1 m, 1-2 m, and so on, out to a last group of
  5-7 m. People are pooled across every run rather than averaged run by run, so there is no band.
  What stands in for one is how many people are behind each point: 224 at the left, 4 at the right.
```

Had the robot left everybody alone, every point would read zero. People it came within {{lit:1 m}}
of ended up {{q:e5_propagation@0.meanDeviationM}} from where they would have been. People who kept
between {{lit:4 m}} and {{lit:5 m}} clear of it ended up
{{q:e5_propagation@4.meanDeviationM}}.

Nothing falls away. Out to {{lit:5 m}}, sorting people by how close the robot got to them barely
sorts them at all: the groups do not line up in order of distance, and there is no band under them
that would let you put two of them in order anyway. What the plot rules out is the prediction.

Inside {{lit:5 m}}, one group sits above the others. Between {{lit:3 m}} and {{lit:4 m}} out the
average is {{q:e5_propagation@3.meanDeviationM}}, on {{q:e5_propagation@3.nPeople}} people. I have
no account of it, and one point I cannot explain is not a finding.

## How a push reaches somebody it never touched

The robot is not the only thing shoving people. Everybody is pushed away from whoever is nearest to
them, all the time, and the robot arrives into that as one more push.

So follow the chain. The robot moves somebody. That somebody is now standing where they would not
otherwise have been. Whoever was walking through that patch of floor in the robot-free run now
finds a person in it, and goes around. That third person is somewhere new as well, and so on,
outward, until the room runs out of people. Nothing in that chain needs the robot to have been near
the third person: the disturbance they feel is a human being, and the machine is upstream of it.

This is also why a reading at the far wall is not the room's own churn. Both runs in every pair
share a seed, so nobody's random wobble differs between them: a person alone in an empty room would
trace the same two paths exactly. If somebody at the far wall ends up off their nominal trajectory,
it reached them through the crowd. That is an argument about where one person's deviation came
from. It is not an argument that the average of a thin group is pinned down.

## How much of this to believe

The groups are not the same size, and the plot does not show it. The nearest holds
{{q:e5_propagation@0.nPeople}} people, pooled over all the runs. The outermost holds
{{q:e5_propagation@5.nPeople}}, and it sits high, at {{q:e5_propagation@5.meanDeviationM}}. Read
nothing into that: on a group that size, one person caught in a knot of others drags the whole
point upward. That is what uncertainty means here, and the plot shows you none of it.

So the claim is that the effect does not fall away out to {{lit:5 m}}, and no claim beyond that,
and none about which group is highest. Within that limit it is worth something, because
perturbation is the total across the room rather than the worst case in the middle of it. The outer
groups enter that total on the same terms as somebody the robot squeezed past.

:::caveat
Nobody was assigned to a group. Where somebody ends up is decided partly by the same crowd that
pushed them: a person who walks through the thick of the room is likely both to pass close to the
robot and to be jostled by everybody else. Read the curve as a description of what happened to each
kind of person, not as the effect of distance with all else held equal.
:::

## Why this page comes before the check

Later on this site the measurement is handed a question whose answer ought to be nothing: take
somebody the robot never went near out of the room and see whether the answer moves. Arrive
believing distance protects people and you will read anything other than zero as a broken
instrument, and be wrong about which part is broken.

This page is the correction. In a crowd, the honest answer to *can the robot affect somebody it
never went near* is yes — and, out to {{lit:5 m}} in this room, how far away they stayed barely
narrows it down.

:::caveat
In this crowd, how far a push travels is a property of a social-force model in which everybody
reacts to whoever is nearest. Change the personal space in that model and the reach of the chain
changes with it; take that reaction away and there is no chain at all. The reach is invented. The
mechanism is not: a person pushed aside has to go somewhere, and in a full room the somewhere is
already occupied. The ruler is real. The room is invented.
:::
