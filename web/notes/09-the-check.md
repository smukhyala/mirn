---
id: the-check
page: 9
part: 4
title: Trying to make it lie
subtitle: The one check that leaves this room, and the assumption hiding inside it
introduces: [placebo-test]
uses: [run, nominal-trajectory, deviation, seed, perturbation, the-null, detection-floor, counterfactual, estimator, confound]
shows: >
  A search through the invented crowd for somebody the robot never touched, and what the
  measurement does when that person is deleted.
reader_can: >
  Run a placebo test against a measurement they did not build. State out loud the assumption any
  particular placebo test is resting on, and recognise the case — a crowd — where that assumption
  quietly fails. Explain why deleting a distant bystander from this room does not leave the number
  alone.
---

One move tells you whether to believe a number, and it is the part of this site that survives
leaving the room.

:::term{id=placebo-test}

It comes from drug trials. Half the patients get the drug and half get a pill with nothing in it,
and if the second group gets better too, the trial was measuring something other than the drug.

The version here is a deletion. Every run of the crowd loses one bystander — a pedestrian who
stayed well away from the robot, deleted from both versions of the world — and the measurement is
taken again. Nothing about the robot changed, so the perturbation the estimator reports should be
the perturbation it reported before. What would be damning is a large shift. That would mean the
number is being driven by people the robot never went near.

## Checking the premise first

That needs a bystander, so pick a definition: somebody who never came within {{lit:5 m}} of the
robot. Before deleting anyone, ask whether such a person is untouched. File every person by how
close they ever got, and look at how far each group ended up from their nominal trajectories.

```mirn:sweep
experiment: e5_propagation
x: closestApproachFromM
series:
  - key: meanDeviationM
    label: how far that group ended up from where they would have been
    accent: true
caption: >
  Nobody has been deleted here. Each person is filed by their own closest approach to the robot,
  measured on the run with no robot in it — the leftmost group came within {{lit:1 m}}, the
  rightmost never came within {{lit:5 m}} — and the height is that group's mean deviation. This
  sweep fills the room fuller than the rest of the site does, which is the only way the far bins
  get anybody in them: in a {{lit:22 x 13 m}} room with a robot crossing the middle, almost nobody
  stays away from it. The rightmost bin is four people, pooled over every run.
```

The line does not fall away. People who never came within {{lit:4 m}} of the robot ended up about
as far from their nominal trajectories as the people it walked straight past. The bins jump around
as they thin out and no seed-to-seed spread was recorded, so the only thing worth reading off the
chart is what is missing: no bin drops toward zero as you walk right.

So "well away" is not the same as "untouched", and the deletion has nothing inert to delete.

## Why a crowd has no bystanders

A crowd is a chain. The robot leans on the person in front of it. That person leans on somebody
beside them, who shortens their stride, so the person behind them goes around. By the time the
effect reaches the far bin it has been handed along several times, and no handoff required anybody
to see the robot.

Deleting a person joins that chain rather than stepping outside it. The space they occupied is now
empty, so somebody else walks through it and leans on somebody previously left alone, and the
robot's planner steers a different course through a different crowd. The counterfactual is intact
and the seed is intact, but the room is not, and the number that comes back is a measurement of
somewhere else.

So a placebo test does not check that a measurement is trustworthy. It checks that it is
trustworthy given one assumption you supplied: that the thing you deleted had no causal role. In a
crowd, almost nobody qualifies. The assumption is where the whole argument lives; the arithmetic
after it is bookkeeping. There is a smaller trap in the same choice: decide who the bystander is on
the run with no robot in it, or you are selecting people by how far they moved — a confound
manufactured by the test meant to catch confounds.

## The version that still works

Turn the robot's push down to nothing and measure again. There is no rewiring to worry about,
because nothing has been removed from the room. The answer comes back as nothing — not nearly
nothing, exactly nothing, since the two runs are then the same seed drawing the same numbers in the
same room, and the deviation of a path from itself is zero. That only tests the apparatus, but it
establishes something easy to undervalue: the measurement is capable of reporting nothing at all. A
number near zero can mean "no effect" or "under my detection floor", and a measurement that can
never return nothing tells you neither.

## What to keep

The ruler is real. The room is invented. The null, the detection floor and every estimate on these
pages were measured inside a model I wrote. The placebo test is the part that does not need the
room: hand it to a measurement built by somebody else, name something you are certain has no
effect, feed it in, and check that the answer is nothing. If an effect comes back, you have learned
something about the instrument. If nothing comes back, you have learned that nothing is something
it can say — not that it is right, but the only version of "not obviously broken" anybody can
actually hand you.

And when you sit down to name the thing you are certain has no effect and find that you cannot, as
happened here, that is not a reason to skip the test. That is the result of it.

:::caveat
In this crowd the chain that carries the robot's effect outward is a social-force model, and how
far it reaches is a modelling choice; this site does not know how far it reaches in a real
corridor. The shape of the argument is not a modelling choice. A placebo test is worth exactly as
much as the claim that the deleted thing was inert, and that claim is in trouble wherever people
react to each other, which is everywhere people walk. We have not found this test reported for a
perturbation measurement on an interacting crowd, and would like to be shown one.
:::
