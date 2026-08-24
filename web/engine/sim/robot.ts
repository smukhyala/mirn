import { SIM_CONSTANTS, type RunConfig } from "../contracts/config.js";
import type { PerceivedWorld } from "./perceive.js";
import type { RobotState } from "./state.js";

/**
 * The grid-sampled planner from the demo, cleaned up.
 *
 * Its virtue is that it is a GRID, not a sample: 4 speeds x 9 headings, enumerated in a fixed
 * order, with no RNG anywhere. So it is deterministic for free and identical across arms given
 * identical perception, and no seed has to be threaded into it.
 *
 * It receives a `PerceivedWorld`, never a `WorldState`. That is a type-level guarantee that the
 * robot cannot cheat by reading true positions, and it is what makes the perception-noise lesson
 * mean anything: the robot swerves away from people who are not where it believes they are.
 *
 * Two things are deliberate. Ties break by strict `<` over the fixed enumeration order, never
 * `<=`, because `<=` would make the winner depend on floating-point equality and that is not
 * portable. And the first-order lag lives in the caller, not here, so this stays a pure map from
 * a view of the world to a desired command, and the actuation dynamics are separately explainable.
 */
export interface Command {
  readonly vx: number;
  readonly vy: number;
}

/** Points sampled along each candidate arc when scoring collisions. */
const COLLISION_SAMPLES = 4;

export function planRobot(view: PerceivedWorld, robot: RobotState, config: RunConfig): Command {
  const maxSpeed = config.robot.maxSpeed;
  if (maxSpeed <= 0.001) {
    return { vx: 0, vy: 0 };
  }

  const goalDx = robot.gx - robot.x;
  const goalDy = robot.gy - robot.y;
  const goalDistance = Math.sqrt(goalDx * goalDx + goalDy * goalDy);
  if (goalDistance < SIM_CONSTANTS.goalReachedM) {
    // Stop. The demo returned the current velocity here because its robot patrolled back and
    // forth forever; ported unchanged, that made the robot sail straight through its goal and
    // coast into the far wall. Every time-to-goal came back NaN and the robot logged 26 m of
    // travel on an 18 m journey, which quietly corrupted three of the seven experiments.
    return { vx: 0, vy: 0 };
  }

  const base = Math.atan2(goalDy, goalDx);
  const lookahead = SIM_CONSTANTS.lookaheadS;
  const halfHeadings = (SIM_CONSTANTS.headingOffsets - 1) / 2;

  let bestVx = 0;
  let bestVy = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  let found = false;

  for (let speedIndex = 0; speedIndex < SIM_CONSTANTS.speedLevels; speedIndex++) {
    const speed = (maxSpeed * speedIndex) / (SIM_CONSTANTS.speedLevels - 1);
    for (let k = -halfHeadings; k <= halfHeadings; k++) {
      const heading = base + k * SIM_CONSTANTS.headingStepRad;
      const vx = speed * Math.cos(heading);
      const vy = speed * Math.sin(heading);
      const px = robot.x + vx * lookahead;
      const py = robot.y + vy * lookahead;
      if (py < 0.5 || py > config.heightM - 0.5 || px < 0.4 || px > config.widthM - 0.4) {
        continue;
      }

      const goalCost = Math.sqrt((robot.gx - px) ** 2 + (robot.gy - py) ** 2);

      // Collision is evaluated at several points ALONG the candidate arc, not only at its end.
      // Sampling only the endpoint let the robot plan straight through somebody and arrive on the
      // far side with a clean score: measured minimum clearance was -0.39 m, i.e. it was walking
      // through people. Four samples is enough to close that and costs nothing measurable.
      let collisionCost = 0;
      let deflectionCost = 0;
      const clearanceRadius = SIM_CONSTANTS.pedRadiusM + SIM_CONSTANTS.robotRadiusM;
      for (let sub = 1; sub <= COLLISION_SAMPLES; sub++) {
        const frac = sub / COLLISION_SAMPLES;
        const sx = robot.x + vx * lookahead * frac;
        const sy = robot.y + vy * lookahead * frac;
        for (let i = 0; i < view.n; i++) {
          const dx = (view.x[i] as number) - sx;
          const dy = (view.y[i] as number) - sy;
          const r2 = dx * dx + dy * dy;
          if (r2 < SIM_CONSTANTS.collisionRadiusM * SIM_CONSTANTS.collisionRadiusM) {
            const r = Math.sqrt(r2);
            // Quadratic rather than linear, and unbounded as the gap closes, so that "pass
            // through a person" is never merely expensive — it is ruled out.
            const overlap = SIM_CONSTANTS.collisionRadiusM - r;
            collisionCost += overlap * overlap * SIM_CONSTANTS.collisionPenalty;
            if (r < clearanceRadius) {
              collisionCost += SIM_CONSTANTS.collisionPenalty * 10;
            }
          }
        }
      }
      for (let i = 0; i < view.n; i++) {
        if (config.robot.deflectionWeight === 0) {
          break;
        }
        const dx = (view.x[i] as number) - px;
        const dy = (view.y[i] as number) - py;
        const r2 = dx * dx + dy * dy;
        if (r2 < SIM_CONSTANTS.robotCutoffM ** 2) {
          const r = Math.sqrt(r2);
          deflectionCost += Math.exp(
            (SIM_CONSTANTS.pedRadiusM + SIM_CONSTANTS.robotRadiusM - r) /
              SIM_CONSTANTS.robotRepulsionB,
          );
        }
      }

      const cost = goalCost + config.robot.deflectionWeight * deflectionCost + collisionCost;
      if (cost < bestCost) {
        bestCost = cost;
        bestVx = vx;
        bestVy = vy;
        found = true;
      }
    }
  }

  if (!found) {
    return { vx: robot.vx, vy: robot.vy };
  }
  return { vx: bestVx, vy: bestVy };
}

/**
 * Reaction time as an actual time constant.
 *
 * The demo hard-coded `robot.vx += (best - robot.vx) * 0.35`. That 0.35 is `dt / tau` with
 * tau ~= 0.143 s, so exposing tau directly gives the reader a knob in units they already own:
 * "the robot takes 0.4 seconds to act on what it decided" needs no explanation, and the lag is
 * literally measurable on the plot with the scrubber.
 */
export function applyCommand(robot: RobotState, command: Command, config: RunConfig): void {
  let alpha = config.dt / config.robot.reactionTimeS;
  if (alpha > 1) {
    alpha = 1;
  }
  if (alpha < 0) {
    alpha = 0;
  }
  robot.vx += (command.vx - robot.vx) * alpha;
  robot.vy += (command.vy - robot.vy) * alpha;
}
