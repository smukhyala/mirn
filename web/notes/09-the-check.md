---
id: the-check
page: 9
part: 4
title: Trying to make it lie
subtitle: The one check that leaves this room, and the assumption hiding inside it
introduces: [placebo-test]
uses: [run, nominal-trajectory, deviation, seed, perturbation, the-null, detection-floor, counterfactual, estimator, confound]
reader_can: >
  Run a placebo test against a measurement they did not build. State out loud the assumption any
  particular placebo test is resting on, and recognise the case — a crowd — where that assumption
  quietly fails. Explain why deleting a distant bystander from this room does not leave the number
  alone.
---

Everything up to here has been about getting a number out of a room. This page is about the one
move that tells you whether to believe one, and it is the part of this site that survives leaving
the room.

:::term{id=placebo-test}

It comes from drug trials. Half the patients get the drug and half get a pill with nothing in it.
Nobody expects the pill with nothing in it to cure anybody — that is the entire point of putting it
there. If those patients get better too, the trial was measuring something other than the drug, and
you find that out before you publish rather than after.

The version for a measurement like ours is a deletion. Every run of the crowd loses one bystander:
a pedestrian who stayed well away from the robot the whole time, deleted from both versions of the
world. Then the measurement is taken again. Nothing about the robot has changed, so the perturbation
the estimator reports afterwards should be the perturbation it reported before.

What would be damning is a large shift. That would mean the number is being driven by people the
robot never went near.

## Checking the premise first

The test needs a bystander, and "bystander" needs a definition, so pick one: somebody who never came
within {{lit:5 m}} of the robot at any moment of the run. Before deleting anyone, it is worth asking
whether such a person is actually untouched. File every person in the crowd by how close they ever
got, and look at how far each group ended up from their nominal trajectories.

```mirn:sweep
experiment: e5_propagation
x: closestApproachFromM
series:
  - key: meanDeviationM
    label: how far that group ended up from where they would have been
    accent: true
caption: >
  Nobody has been deleted here. Each person is filed by their own closest approach to the robot,
  measured on the run with no robot in it — the leftmost group came within 1 m of it, the rightmost
  never came within 5 m — and the height is that group's mean deviation. This sweep fills the room
  fuller than the rest of the site does, which is the only way the far bins get anybody in them at
  all; even so, in a 22 x 13 m room with a robot crossing the middle, almost nobody manages to stay
  away from it. The rightmost bin is four people, pooled over every run.
```

The line does not fall away. People who never came within {{lit:4 m}} of the robot ended up about as
far from their nominal trajectories as the people it walked straight past. The bins jump around as
they thin out, and this sweep records no seed-to-seed spread to judge the jumping against, so the
only thing worth reading off the chart is what is missing from it: no bin drops toward zero as you
walk to the right. And the group that clears the {{lit:5 m}} bar is four people in the whole set —
in a room this size, the bystander the test asks for barely exists, and the few who qualify have
been moved anyway.

So "well away" is not the same as "untouched", and the deletion has nothing inert to delete.

## Why a crowd has no bystanders

A crowd is not a set of independent walkers. It is a chain. The robot leans on the person in front
of it. That person leans on somebody beside them, who shortens their stride, so the person behind
them goes around. By the time the effect reaches the far bin it has been handed along several times,
and not one of the handoffs required anybody to see the robot.

Deleting a person joins that chain rather than stepping outside it. Remove someone and the space
they were occupying is empty, so somebody else walks through it, arrives somewhere new, and leans on
somebody who was previously left alone. The robot's planner sees a different crowd in front of it
and steers a different course. What you compare after the deletion is still one room with a robot
and one room without — the counterfactual is intact, the seed is intact — but it is not the same
room as before, and the robot in it is not doing the same thing. The number that comes back is a
measurement of somewhere else.

There is a smaller trap folded into the same test, and it is easy to get wrong in the direction that
flatters you. To pick a bystander you have to decide who stayed away from the robot, and you have to
decide it on the run with no robot in it. Judge it on the run with the robot and you are selecting
people partly by how far they moved, which is the quantity you are about to measure — a confound,
manufactured by the test that was supposed to catch confounds.

This is the honest lesson, and it is a harder one than the usual telling. A placebo test does not
check that a measurement is trustworthy. It checks that a measurement is trustworthy given one
assumption you supplied: that the thing you deleted had no causal role. In a crowd, almost nobody
qualifies. The assumption is where the whole argument lives; the arithmetic after it is bookkeeping.

## The version that still works

Turn the robot's push down to nothing and measure again. There is no rewiring to worry about,
because nothing has been removed from the room. With no push there is nothing anybody could be
carrying a trace of, and the answer comes back as nothing — not nearly nothing, exactly nothing,
since the two runs are then the same seed drawing the same numbers in the same room, and the
deviation of a path from itself is zero.

That check passes here, and it is worth knowing precisely how little it establishes. It says the two
worlds really are copies and the seed really is shared. It tests the apparatus. It says nothing
about whether the estimator's answer is the right answer.

It does establish one thing that is easy to undervalue: the measurement is capable of reporting
nothing at all. A number near zero can mean "no effect" or it can mean "under my detection floor",
and a measurement that can never return nothing tells you neither.

## What to keep

The ruler is real. The room is invented. Every result on this site — the counterfactual run, the
null, the detection floor, the estimator that reported a robot's effect on a crowd it had not moved
— was measured inside a model somebody wrote, and a model can be talked into agreeing with you.

The placebo test is the part that does not need the room. Hand it to a measurement built by somebody
else, on data you did not collect, in a place you cannot rerun: name something you are certain has
no effect, feed it in, and check that the answer is nothing. If an effect comes back, you have
learned something about the instrument. If nothing comes back, you have learned that nothing is
something it can say — not that it is right, but the only version of "not obviously broken" anybody
can actually hand you.

And when you sit down to name the thing you are certain has no effect and find that you cannot, as
happened here, that is not a reason to skip the test. That is the result of it.

:::caveat
In this crowd the chain that carries the robot's effect outward is a social-force model, and how far
it reaches is a modelling choice; this site does not know how far it reaches in a real corridor. The
shape of the argument is not a modelling choice. A placebo test is worth exactly as much as the
claim that the deleted thing was inert, and that claim is in trouble wherever people react to each
other, which is everywhere people walk. We have not found this test reported for a perturbation
measurement on an interacting crowd, and would like to be shown one.
:::
