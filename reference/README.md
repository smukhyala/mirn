# Frozen reference — not built, not linted, not tested

`perturbation-playground.html` is the provenance of `web/engine/sim/`. It is the only artifact
that has ever exhibited the reactive crowd behaviour the teaching product is built on, and it is
kept here, unchanged, while that behaviour is ported — so the port can be run side by side against
the thing it is replacing.

It is **not** part of the build. Nothing imports it, no test covers it, and the lint and typecheck
do not see it.

## Why it is a rewrite and not a copy

Three defects make it unusable as-is once the physics has to be tested:

- `forces()` mixes goal, pedestrian, robot, wall and noise terms in one function, and contains a
  dead term multiplied by zero (`fx += wall * Math.exp(-(self.y - 0.3) / 0.35) * 0;`).
- Physics, measurement and rendering read each other's state through the DOM: `driveRobot()`
  reads `ui.sp.value`, `measure()` writes `innerHTML`, and the draw functions read checkboxes.
  A run is therefore not reproducible from a seed and a config alone.
- Pairing is maintained by side effect — `g.rng(); g.rng(); // keep streams aligned` — which is a
  correct invariant in a fragile mechanism. Any third draw desynchronises the two worlds silently.

## Deletion trigger

**Delete this directory at the end of Phase 2**, once the ported engine is proven at parity.
Last commit that touched the original file, for `git show`:

    8407b12bf79e29f71c75943fb8d2cb5b075dab60

