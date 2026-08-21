import type { DisturbanceSpec, RunConfig } from "../contracts/config.js";
import type { WorldState } from "./state.js";

/**
 * Scheduled events, applied in a total order before the forces are computed for that tick, so a
 * trace can say "at tick 300 an impulse of 4.5 m/s at 30 degrees was added, then the usual step
 * ran".
 *
 * Ordering is by (atTick, id) rather than array position: two disturbances sharing a tick must
 * resolve the same way regardless of how the config was assembled.
 */
export function orderedDisturbances(config: RunConfig): readonly DisturbanceSpec[] {
  const sorted = [...config.disturbances];
  sorted.sort((a, b) => {
    if (a.atTick !== b.atTick) {
      return a.atTick - b.atTick;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return sorted;
}

export function applyDisturbances(
  state: WorldState,
  specs: readonly DisturbanceSpec[],
  tick: number,
): void {
  for (const spec of specs) {
    if (tick < spec.atTick || tick >= spec.atTick + spec.durationTicks) {
      continue;
    }
    if (spec.kind === "impulse") {
      // One tick, one kick. Only fires on the opening tick even for a longer window, because an
      // impulse repeated every tick is a force, and the lesson about recovery needs a single
      // identifiable moment the deviation curve can be measured from.
      if (tick !== spec.atTick) {
        continue;
      }
      if (spec.targetUid === -1 && state.robot !== null) {
        state.robot.vx += spec.magnitude * Math.cos(spec.headingRad);
        state.robot.vy += spec.magnitude * Math.sin(spec.headingRad);
      }
      continue;
    }
    if (spec.kind === "goal-shift") {
      if (tick !== spec.atTick) {
        continue;
      }
      if (spec.targetUid === -1 && state.robot !== null) {
        state.robot.gy += spec.magnitude;
        if (state.robot.gy < 1) {
          state.robot.gy = 1;
        }
        if (state.robot.gy > 12) {
          state.robot.gy = 12;
        }
      }
      continue;
    }
    // Impulse and goal-shift are the whole of DisturbanceKind, so nothing reaches here and there
    // is nothing left to apply. The assignment is what makes that true tomorrow as well: adding a
    // kind to the union without a branch above would otherwise compile, and the new disturbance
    // would silently do nothing — a control the reader turns that changes no number, which is the
    // hardest kind of wrong for this site. `never` accepts nothing, so the union member and its
    // branch land together or the build stops. A comment saying so was here first, and comments
    // do not fail builds. Compile-time only, deliberately: a throw would be a runtime change on a
    // line that cannot be reached, inside the loop the whole simulator steps through.
    const unhandledKind: never = spec.kind;
    void unhandledKind;
  }
}
