---
id: e1-push-strength
page: 6
part: 3
title: Push harder
subtitle: The experiment whose answer you already know
introduces: []
uses: [run, trajectory, nominal-trajectory, deviation, state, seed, disturbance, perturbation]
shows: >
  An invented crowd in a {{lit:22 m}} corridor with one dial on it — how much space the robot
  demands — and what the crowd's deviation does as that dial turns.
try: >
  Drag the dial marked "space the robot demands" down to zero and watch the two sets of paths lie
  on top of each other.
reader_can: >
  Say why the first thing to do with a new measurement is ask it a question whose answer is
  already known. Read a dose-response curve and describe its shape without claiming either that it
  has flattened or that it is still climbing. Explain why the reading at zero is exactly zero
  rather than nearly zero, and what it would mean about the apparatus if it were not.
---

Before you trust a ruler you lay it against something whose length you already know. The robot
pushes people out of its way; here we turn the pushing up and watch what the crowd does. Everybody
expects the answer, which is why it goes first — it is the only kind of result you could recognise
as wrong.

## The dial

One number changes here: how much space the robot demands — how hard somebody stops steering
toward their goal and starts steering around the robot. At zero it asks for nothing; at three,
three times what it asks for elsewhere on this site. Nothing else moves: same room, same crowd,
same starting state for every person, same seed for the run with the robot in it and the run
without.

```mirn:scene
id: push-dial
preset: corridor-11
controls: [play, scrub, showControl, repulsionScale]
caption: >
  Solid paths are the run with the robot in it; faint dashed ones are the same people, same seed,
  with no robot at all. Drag the dial to zero and watch the two sets lie on top of each other; drag
  it to three and watch them come apart.
```

## Guess first

```mirn:predict
id: shape-of-the-rise
question: >
  As the robot demands more space, what does the crowd's average deviation do?
options:
  - id: keeps-rising
    label: It rises, and goes on rising.
  - id: levels-off
    label: It rises, then levels off.
  - id: no-effect
    label: Nothing much happens.
caption: >
  One run at one setting is one roll of the dice. Commit before you scroll: a guess is how you
  notice you were wrong.
```

```mirn:sweep
id: e1-sweep
experiment: e1_push_strength
x: repulsionScale
series:
  - key: meanDeviationM
    label: average deviation per person
    accent: true
  - key: maxDeviationM
    label: the crowd's worst moment in the run
caption: >
  Seven settings of the dial, eight runs at each. Every point is the mean of its eight runs; the
  band reaches one spread of those eight either side of it.
```

## The zero is exact

With the dial at zero, the average deviation across the crowd is
{{q:e1_push_strength.meanDeviationM@0}}. Not nearly zero. Zero, in all eight runs, to every
decimal the readout has.

The robot has not gone anywhere. It is in the room, still driving the length of the corridor. What
the dial turned off is everybody's response to it, so nobody's motion depends on where the robot
is. The two runs draw the same random numbers in the same order from the same seed and produce the
same trajectory for every person — the same, not similar. Each person's nominal trajectory is the
path they actually walked, so the gap between them has nothing to be. A robot nobody responds to is
not a disturbance. It is scenery.

The zero is not a lucky cancellation, then. Any other reading here would mean the apparatus was
leaking: a random draw consumed on one side and not the other, a difference in the order things are
updated, some arithmetic that changes when there is a robot on screen. That makes it the cleanest
zero on the site, and the first thing to re-run when a later number looks odd.

## What the rise looks like

With the dial at half, the average deviation is {{q:e1_push_strength.meanDeviationM@0.5}}. At
one — the setting behind every other number here — it is
{{q:e1_push_strength.meanDeviationM@1}}. At the top of the dial,
{{q:e1_push_strength.meanDeviationM@3}}.

The line climbs unevenly. Most of the rise is in the first two notches, and both of those steps
stand well outside the scatter of the eight runs behind them. From one onward the plot goes quiet:
the means keep drifting upward and never turn back, but no step from one setting to the next is
even as large as the run-to-run spread at the setting it lands on.

So the honest reading of the right-hand half is that it rises slowly, and that this sweep cannot
tell slow rising apart from flat. A line that has stopped climbing in a way you can measure has not
been shown to have levelled off; it has been shown to have gone quieter than the measurement. Past
three the sweep stops, and so does what this page knows.

The second line reads the same runs differently: the worst the room's average gap ever gets. At
three it is {{q:e1_push_strength.maxDeviationM@3}}; at zero, {{q:e1_push_strength.maxDeviationM@0}},
because with no response there is no gap to take the worst of.

One run is not this curve. From one and a half onward, the eight runs at a setting spread wide
enough to cover the means of the settings on either side of it, so moving the dial a single notch up
there and watching one pair of paths would not reliably show you anything. At the bottom of the dial
it would: the step from zero to half is far outside anything the seeds do on their own. Above that,
the shape lives in the means of eight, and only there.

## Why this one goes first

None of the experiments after this one has an answer you already know, and a broken measurement
reports nonsense with exactly the confidence it reports a result. Push harder, people move further:
a reading that stayed flat as the dial turned would have been a reason to stop before reporting
anything else here. That did not happen, which is why perturbation behaving oddly on a later page
is worth taking seriously rather than blaming on the apparatus.

:::caveat
In this crowd, the shape of the curve is the model's doing: a person here responds to the robot
through a single repulsion term, and whatever the top of the dial is doing is a property of that
term, not a finding about people. The zero is not — it is exact because two runs with no response
are the same computation. Nor is the reason for going first, which holds for any instrument in any
room. The ruler is real. The room is invented.
:::
