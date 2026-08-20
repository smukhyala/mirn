---
id: e7-politeness
page: 6
part: 3
title: It could go around
subtitle: The trade-off that did not turn up
introduces: []
uses: [run, seed, deviation, control-input, uncertainty, near-miss]
reader_can: >
  Say what this room charged the robot for keeping out of people's way, and why only the distance
  half of that bill is reportable. Take a curve whose axis says seconds and show, from the figures
  printed beside it, that it cannot be counting seconds of journey. Name the things this room
  forgot to bill for, and say why a dial that rewards keeping clear needs a separate check that the
  robot still got anywhere.
---

The robot in corridor-11 drives at its goal. If somebody is in the way it slows, edges past, and
carries on. It could do something else: swing wide, leave the person the space they were walking
into, and come back to its line once they have gone by.

Going around is further. Further is slower. That is the whole intuition, and it is why a robot
like this usually ships with the behaviour switched off — consideration is assumed to be something
you buy with the robot's own time.

So: corridor-11, except the robot is asked to weigh other people's space against its own arrival.
One number in the planner's cost decides what that space is worth. At zero the robot steers as if
the room held nothing worth avoiding. Turn it up and the planner will accept a longer route to
keep clear of somebody.

The dial does not touch the people. Nobody in the crowd is told the robot has become polite, and
they react to where it is exactly as they did before. What changes is what the planner is trying
to minimise, and therefore the control input it settles on.

```mirn:predict
id: e7-guess
question: The robot could go around people instead of pressing through them. What does that cost?
options:
  - id: expensive
    label: Politeness is expensive. Whatever it saves the crowd is paid back on the robot's clock.
  - id: diminishing
    label: Politeness is cheap at first and expensive later. A little costs nothing, a lot costs plenty.
  - id: free
    label: Politeness is free. Getting out of the way does not slow the robot down at all.
caption: >
  Commit before you scroll. One of the three above is the shape this experiment was set up to
  find. What the room handed back is not on the list.
```

## The dial

```mirn:scene
id: politeness-sweep
preset: corridor-11
controls: [play, scrub, deflectionWeight]
caption: >
  The same crowd and the same seed at every setting. Turn the dial up and watch the robot's path
  bend around people instead of through them.
```

The dial runs from zero to six. Everything else is held: the same doors, the same walk speeds, the
same seed, and the same paired re-run with the robot deleted from the room.

Every setting was run eight times, each time with a different crowd, and each crowd was run twice
— once with the robot in it, once with the room to itself. With the dial at zero, which is the
robot the earlier pages watched, the average person finishes
{{q:e7[deflectionWeight=0].meanDeviationM}} from where they would have been, the eight runs behind
that figure spread by {{q:e7[deflectionWeight=0].meanDeviationM.sd}}, and the robot's route
measures {{q:e7[deflectionWeight=0].robotPathM}}.

## What the dial did to the crowd

```mirn:sweep
experiment: e7_politeness
x: deflectionWeight
series:
  - key: meanDeviationM
    label: deviation per person
    accent: true
caption: >
  Eight seeds per setting. The band on each point is the spread across those eight.
```

The curve leans down. It leans down from the first notch and it is still down at the far end of
the dial, with a couple of settings along the way that step back up before it carries on.

How far it leans is the part to be careful about. The whole descent, from the zero setting to the
far end of the dial, is about the size of the spread across eight seeds at a single setting. The
direction is what this sweep has; the size is not. So the dial did not move people further from
where they would have been, and that is the whole of what the curve establishes — considerably weaker than a dial called
politeness was supposed to earn.

:::caveat
The band drawn on each point is the uncertainty across the eight seeds: it reaches one spread
either side of the mean, and it is taller than the step between any two neighbouring settings.
Read the lean of the whole curve, and read it as a direction rather than an amount. Do not read
one pair of points and call it a dose response. Nothing further down this page rests on a single
notch of this dial.
:::

## The bill, in metres

```mirn:sweep
experiment: e7_politeness
x: deflectionWeight
series:
  - key: robotPathM
    label: how far the robot drove
    accent: true
caption: >
  The robot's own odometer, summed over the run. Eight seeds per setting, with the spread.
```

Now the price. The robot's route grows. The curve climbs over the first few notches and then stops
climbing, and each of the upper settings sits inside the band of the others, so whether the price
is level up there or still drifting is not something eight seeds can separate. With the dial at the
top of its travel the robot drove {{q:e7[deflectionWeight=6].robotPathM}}, and the eight seeds
spread by {{q:e7[deflectionWeight=6].robotPathM.sd}}.

That is the part of the prediction that held. Going around is extra ground and the robot covers
it. If the page stopped here, politeness would cost what everybody assumes it costs, and the only
question left would be whether the deviation it saves is worth the detour.

## The other half of the bill

```mirn:sweep
experiment: e7_politeness
x: deflectionWeight
yLabel: seconds
series:
  - key: robotArrivalS
    label: the first moment the robot's motion stopped
    accent: true
caption: >
  The clock at the first instant the robot came to a standstill. Eight seeds per setting, with the
  spread.
```

This was going to be the other half of the bill. It is the column this page cannot use.

With the dial at the top of its travel it reads {{q:e7[deflectionWeight=6].robotArrivalS}}. Across
the dial it wanders over the first few notches and then falls, and behind each of the upper
settings the eight seeds disagree by enough to cover that fall over and over again.

The spread on its own would be reason enough to report nothing from it. There is a harder reason,
and it needs only the two figures this page prints for the top of the dial. Take the distance the
robot drove there and divide it by the seconds printed for that same setting: that is the speed it
would have had to hold to cover the one in the other. This planner chooses from a fixed grid of
speeds, and the fastest of them is {{lit:1.1 m/s}}. The bottom three settings of the dial pass that
check. Every setting above them fails it.

So whatever the column is counting, it is not a journey. What the code behind it records is the
first instant at which the robot's own motion stopped, and to a measurement like that, a robot
that halts once in the middle of a corridor and then carries on is indistinguishable from a robot
that has arrived and parked. Turning this dial up is asking the robot to yield. A yield is a
standstill.

The figure stays on the page. A curve that reads like a result and is not one is the thing this
whole site is about.

## The trade-off that did not turn up

The middle option on the box above is that shape. This room cannot say whether it is there.

The option is a bending curve. Politeness nearly free at the first notch, the two costs crossing
near the middle of the dial, and a far end where the robot defers to everybody and barely gets
anywhere. Diminishing returns, then a wall.

Neither half of that shape is here, and not because the room refuted it. The distance curve climbs
and then stops climbing, which is the first half of the shape and is equally what eight seeds look
like when they cannot resolve a slow climb. The deviation curve leans down by about its own
spread. The clock was counting standstills. Three columns, and not one of them prices the thing
the guess was about.

A failed prediction is worth a page. The belief behind this one — that getting out of the way is
something a robot pays for — is why a dial like this ships at zero. This sweep did not weigh that
belief. It measured its own apparatus instead, and a sweep that does that is worth showing at full
size rather than quietly re-running.

## What this room is not charging for

The distance bill is the one price this page managed to put a figure on. Before anybody carries it
anywhere, here is what this room forgot to add to it.

Swerving costs the robot nothing but distance. There is no battery, no motor wear, no cargo to
keep level, no passenger to keep comfortable, no map to stay localised against. A real machine
pays for a detour in things that are not metres, and this dial has never heard of any of them.

The goal is always reachable. The robot knows where it is going, from anywhere in the room, with
nothing between it and the far wall except people. No door closes. No corridor forces it back into
the traffic. Put a wall where the detour wants to go and the detour stops being on offer.

Nothing is waiting for it, either. The robot has a goal and no deadline, so the only thing a
detour can cost it is its own arrival. A robot with a schedule is solving a different problem: it
does not need the detour to be quick on average, it needs the detour to never be slow, and a worst
case is settled by the spread rather than by the mean. Give the robot somewhere to be and a time
to be there, and the far end of this dial needs a far better clock than this page has.

There is also one failure this page turns out to be unable to rule out. The cheapest way to
disturb nobody is to stop moving. A robot parked against the wall has a deviation of zero,
forever, at every seed, and any dial that rewards keeping out of the way is a dial pointing at
that parked robot. Turn such a dial far enough and it will eventually hand you one.

The obvious reassurance is that the clock curve has a point drawn at every setting, so the robot
must have gone on reaching the far side. That reassurance is worth nothing. The point is an
average over whichever seeds produced a number at all, the number is the first instant the robot's
motion stopped, and a robot that stopped short of where it was going produces exactly such a
number. A deviation curve that leans down and a clock that falls are also what a robot quietly
giving up looks like, and no column on this page tells the two apart. If you build this dial, go and look at
where the robot actually ended up before you believe anything a curve says about it.

And this page counts no near misses. Deviation says where people ended up. It says nothing
about how close the robot came to any of them, and a dial that lowers one of those can raise the
other.

:::caveat
In this crowd the size of the distance bill belongs to a social-force model that somebody wrote
down. People here yield smoothly, never step the wrong way, and never wait for the robot to go
first, so what a detour is worth in this room is a property of that model rather than a fact about
corridors. Half the ruler is sound: the same crowd ran twice from the same seed, once with the
robot and once without, so the deviation is measured rather than guessed. The other half was
not, and the section above says which half and why. What survives the trip out of here
is not a price for politeness. It is that the cost side of this trade-off has to be measured
before it is assumed, and that a column can carry the right units on its axis and still be
counting something else.
:::
