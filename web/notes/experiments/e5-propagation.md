---
id: e5-propagation
page: 6
part: 3
title: Somebody it never went near
subtitle: corridor-11, except everybody is filed by how close the robot got to them
introduces: []
uses: [run, trajectory, deviation, seed, nominal-trajectory, disturbance, perturbation, uncertainty]
reader_can: >
  Work out a person's closest approach, and say why it is measured against the path they would
  have walked rather than the one they walked. Predict whether deviation falls away with distance,
  then say what the plot did instead. Walk the chain by which somebody the robot never came near
  gets moved anyway. Say which points on this plot carry enough people to be worth reading, and
  which one is a handful.
---

corridor-11, except the room is fuller, and everybody in it is filed by a single number: how close
the robot ever got to them.

That number comes out of the pair, one person at a time. Take the path the person walked in the
run with no robot in it, take the robot's path from the run it was in, and at every tick of the
clock measure the distance between the two. Keep the smallest value the whole run produced. Call
it their closest approach. Somebody whose robot-free path ran down the middle, straight into the
robot's lane, has a small one. Somebody who would have crossed along the far wall, never broken
stride, and could not have told you afterwards what colour the robot was has a large one.

Filing people by a path they did not walk looks like a mistake and is the only defensible choice
here. File them by where they actually went and the filing is decided partly by the shove being
measured: the robot moves people, and moving somebody changes how close they came to it.

One thing about the room was changed, and it is the size of the crowd. The ordinary corridor-11
does not contain enough people who stayed well away to fill the outer groups, so the room is
filled up until it does. The filing itself is not a setting. It is how the answers get sorted once
they exist, and that distinction comes back at the end of this page.

## What you would expect

You already know how the robot's shove behaves. It falls off with distance: close in it dominates,
a few metres out it is nothing. Nothing else in the room is aimed at anybody in particular.

So the prediction almost writes itself. Sort people by closest approach, average the deviation
inside each group, and the near groups move while the far groups sit at nothing. A cliff, and then
a flat line along the bottom.

Decide which of these you expect before you scroll. Writing it down is the whole point; a
prediction you only felt is one you can claim afterwards to have had.

- the effect stops once the robot is a few metres off
- the effect fades steadily as you go outward
- the effect barely fades at all

```mirn:scene
id: watch-a-bystander
preset: corridor-11
controls: [play, scrub, showControl]
showControl: false
caption: >
  The ordinary room, before the crowd is filled up. Turn on the robot-free run, then pick somebody
  the robot never goes near — one of the people crossing wide of it — and watch their pair of
  paths instead of the scrum in the middle.
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
  Each point is one group of people, drawn at the near edge of the group: 0-1 m, 1-2 m, and so on,
  out to a last group of 5-7 m. The people are pooled across every run rather than averaged run by
  run, so no band is drawn here. What stands in for a band is how many people are behind each
  point, and that falls from 224 at the left to 4 at the right.
```

People the robot came within {{lit:1 m}} of ended up {{q:e5_propagation@0.meanDeviationM}} from
where they would have been. People who kept between {{lit:4 m}} and {{lit:5 m}} clear of it ended
up {{q:e5_propagation@4.meanDeviationM}} from where they would have been.

Nothing falls away. Out to {{lit:5 m}}, sorting people by how close the robot got to them barely
sorts them at all: knowing that somebody stayed on the other side of the room tells you almost
nothing about whether their two paths came apart. The groups do not line up in order of distance,
and there is no band under them that would let you put two of them in order anyway. What the plot
rules out is the prediction. A cliff and then a flat line along the bottom is not what happened.

One point sits above the others. The group who kept between {{lit:3 m}} and {{lit:4 m}} out
averages {{q:e5_propagation@3.meanDeviationM}}, on {{q:e5_propagation@3.nPeople}} people. Nothing
on this plot says whether that gap is real, and I have no account of it either way. One point I
cannot explain is not a finding.

## How a push reaches somebody it never touched

The robot is not the only thing shoving people in this room. Everybody is being pushed away from
whoever is nearest to them, all the time, and the robot arrives into that as one more push among
many.

So follow the chain. The robot moves somebody. That somebody is now standing where they would not
otherwise have been standing. Whoever was walking through that patch of floor in the robot-free
run now finds a person in it, and goes around. That third person is now somewhere new as well, and
so on, outward, until the room runs out of people.

Nothing in that chain needs the robot to have been anywhere near the third person. The disturbance
the third person feels is a human being. The machine is upstream of it.

This is also why a reading out at the far wall is not the room's own churn. Both runs in every
pair share a seed, so nobody's random wobble differs between them: a person alone in an empty room
would trace the same two paths exactly. If somebody at the far wall ends up off their nominal
trajectory, the difference reached them through the crowd. There is nowhere else in this room it
could have come from. That is an argument about where one person's displacement came from. It is
not an argument that the average of a thin group is pinned down.

## How much of this to believe

The groups are not the same size, and the plot does not show it. The nearest group holds
{{q:e5_propagation@0.nPeople}} people, pooled over all the runs. The group between {{lit:4 m}} and
{{lit:5 m}} holds {{q:e5_propagation@4.nPeople}}. The outermost group holds
{{q:e5_propagation@5.nPeople}}.

That outermost point sits high, at {{q:e5_propagation@5.meanDeviationM}}. Read nothing into it. On
a group that size, a single person who happened to get caught in a knot of others drags the whole
point upward, and had the crowds rolled differently the point would have landed somewhere else
entirely. That is what uncertainty means here, and the plot is showing you none of it.

So the claim this page makes is that the effect does not fall away out to {{lit:5 m}}, and no
claim at all beyond that — and no claim about which of the six groups is highest, either. The rise
at the right-hand edge is not a rise. It is the last group, and it is nearly empty.

Within that limit the claim is worth something, because perturbation is the total across the room
rather than the worst case in the middle of it. Everybody in the outer groups enters that total on
exactly the same terms as somebody the robot squeezed past. They are part of the answer, not a
correction to it.

:::caveat
Nobody was assigned to a group. People ended up in one, and where somebody ends up is decided
partly by the same crowd that pushed them: a person who walks through the thick of the room is
likely both to pass close to the robot at some point and to be jostled by everybody else. The
groups therefore differ in more ways than their distance to the robot. Read the curve as a
description of what happened to each kind of person, not as the effect of distance with all else
held equal.
:::

## Why this page comes before the check

Later on this site the measurement gets handed a question whose answer ought to be nothing: take
somebody the robot never went near, take them out of the room, and see whether the answer moves.

If you arrive at that check believing distance protects people, you will read any answer other
than zero as a broken instrument, and you will be wrong about which part is broken. This page is
the correction. In a crowd, the honest answer to *can the robot affect somebody it never went
near* is yes — and, out to {{lit:5 m}} in this room, how far away they stayed barely narrows it
down.

:::caveat
In this crowd, how far a push travels is a property of a social-force model in which everybody
reacts to whoever is nearest, with no thought and no manners. Change the personal space in that
model and the reach of the chain changes with it; take away people's reaction to each other and
there is no chain at all, by construction. The reach is invented. The mechanism is not:
displacement has to go somewhere, and in a full room the somewhere is already occupied. The ruler
is real. The room is invented.
:::
