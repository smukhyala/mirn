import { SIM_CONSTANTS, type RunConfig } from "../contracts/config.js";
import type { WorldState } from "./state.js";

/**
 * The social-force kernel, ported from demo/perturbation-playground.html.
 *
 * Two changes from the original. The dead wall term — `fx += wall * Math.exp(...) * 0;`, literally
 * multiplied by zero — is gone rather than carried. And the pedestrian cutoff is tested on the
 * SQUARED distance before any square root, so the large majority of pairs never touch a
 * transcendental; the demo called `Math.hypot` on every pair and then discarded most results.
 *
 * Writes into caller-owned scratch arrays. Returns nothing, allocates nothing.
 */
export function accumulateForces(
  state: WorldState,
  config: RunConfig,
  seeRobot: boolean,
  noiseX: Float64Array,
  noiseY: Float64Array,
  outFx: Float64Array,
  outFy: Float64Array,
): void {
  const { n, x, y, vx, vy, gx, gy, arrived } = state;
  const v0 = config.crowd.desiredSpeed;
  const tau = config.crowd.relaxationTimeS;
  const cutoff2 = SIM_CONSTANTS.pedCutoffM * SIM_CONSTANTS.pedCutoffM;
  const twoPedRadius = 2 * SIM_CONSTANTS.pedRadiusM;

  for (let i = 0; i < n; i++) {
    // Goal attraction. An arrived pedestrian stops steering rather than being deleted, so its
    // trajectory stays the full length the paired contract requires — and, usefully, arriving at
    // different ticks in the two arms is exactly the "time lost" signal.
    // An arrived pedestrian is skipped entirely: it stands where it stopped, still exerting
    // repulsion on everyone else but no longer integrating. The obvious alternative — keep
    // integrating with the goal force replaced by damping — looks right and is not: the
    // exogenous noise keeps pushing, damping only bounds the drift rate rather than removing it,
    // and an "arrived" pedestrian random-walks metres away from its goal over the rest of the
    // episode. That was visible in the browser as people wandering out through the wall.
    if (arrived[i] === 1) {
      outFx[i] = 0;
      outFy[i] = 0;
      continue;
    }

    const dx = (gx[i] as number) - (x[i] as number);
    const dy = (gy[i] as number) - (y[i] as number);
    const d = Math.sqrt(dx * dx + dy * dy);
    const safe = d === 0 ? 1 : d;
    let fx = ((v0 * dx) / safe - (vx[i] as number)) / tau;
    let fy = ((v0 * dy) / safe - (vy[i] as number)) / tau;

    // Pedestrian repulsion.
    for (let j = 0; j < n; j++) {
      if (j === i) {
        continue;
      }
      const rx = (x[i] as number) - (x[j] as number);
      const ry = (y[i] as number) - (y[j] as number);
      const r2 = rx * rx + ry * ry;
      if (r2 > cutoff2 || r2 < 1e-12) {
        continue;
      }
      const r = Math.sqrt(r2);
      const magnitude =
        SIM_CONSTANTS.pedRepulsionA * Math.exp((twoPedRadius - r) / SIM_CONSTANTS.pedRepulsionB);
      fx += (magnitude * rx) / r;
      fy += (magnitude * ry) / r;
    }

    // Robot repulsion. `seeRobot === false` is the robot-blind lesson: the robot is physically
    // there, nobody responds to it, and the true effect collapses to exactly zero.
    const robot = state.robot;
    if (robot !== null && seeRobot) {
      const rx = (x[i] as number) - robot.x;
      const ry = (y[i] as number) - robot.y;
      const r2 = rx * rx + ry * ry;
      if (r2 < SIM_CONSTANTS.robotCutoffM * SIM_CONSTANTS.robotCutoffM && r2 > 1e-12) {
        const r = Math.sqrt(r2);
        const magnitude =
          SIM_CONSTANTS.robotRepulsionA *
          Math.exp(
            (SIM_CONSTANTS.pedRadiusM + SIM_CONSTANTS.robotRadiusM - r) /
              SIM_CONSTANTS.robotRepulsionB,
          );
        fx += (magnitude * rx) / r;
        fy += (magnitude * ry) / r;
      }
    }

    // Soft walls on all four sides. The demo had only top and bottom — it carried a disabled
    // x-term multiplied by zero — because its agents were meant to walk out of the ends and be
    // respawned. This roster is fixed for the whole episode, so the room has to contain people.
    const wall = SIM_CONSTANTS.wallStrength;
    const scale = SIM_CONSTANTS.wallScaleM;
    fy += wall * Math.exp(-((y[i] as number) - 0.3) / scale);
    fy -= wall * Math.exp(-(config.heightM - 0.3 - (y[i] as number)) / scale);
    fx += wall * Math.exp(-((x[i] as number) - 0.3) / scale);
    fx -= wall * Math.exp(-(config.widthM - 0.3 - (x[i] as number)) / scale);

    outFx[i] = fx + (noiseX[i] as number);
    outFy[i] = fy + (noiseY[i] as number);
  }
}
