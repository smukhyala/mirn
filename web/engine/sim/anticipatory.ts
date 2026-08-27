import { SIM_CONSTANTS, type RunConfig } from "../contracts/config.js";
import type { WorldState } from "./state.js";

/**
 * The anticipatory kernel: a second crowd, so a finding can be asked whether it survives one.
 *
 * `forces.ts` repels on PRESENT DISTANCE — a person pushes away from whoever is near them now,
 * and pushes just as hard at someone standing behind them as at someone walking into them. This
 * one repels on PREDICTED TIME TO CLOSEST APPROACH: it extrapolates both people at their current
 * velocities, finds when they would be nearest, and steers away from that. Somebody close but
 * already moving away produces no force at all, because there is no collision coming.
 *
 * That is a real and long-standing split in the pedestrian literature — reactive-distance models
 * against anticipatory ones — and the difference is the whole reason this file exists. A confound
 * that shows up under both kernels is not an artifact of one kernel's shape. A confound that shows
 * up under only one is a fact about that kernel, and the bench has to be able to tell them apart.
 *
 * WHAT IS DELIBERATELY SHARED WITH `forces.ts`, and why sharing it is not laziness:
 *
 *   - the goal term, the walls, the arrived-agent skip, and the noise added at the end. Those are
 *     properties of the ROOM and the experiment rather than of the crowd kernel. Changing them too
 *     would mean the two models differ in several ways at once, and a difference in a readout
 *     could no longer be attributed to the thing this file changes.
 *   - the noise, drawn by the caller from the same tape at the same `(tick, uid, channel)`. That
 *     is what makes guardrail 4's determinism and guardrail 5's paired invariant hold here without
 *     a single new assertion: this function reaches for no randomness of its own, and
 *     `Math.random` throws in the engine suite if anything ever does.
 *
 * Writes into caller-owned scratch arrays. Returns nothing, allocates nothing.
 */

/** Beyond this the prediction is worthless: people change direction long before it arrives. */
const HORIZON_S = 3.0;

/** How hard an imminent collision pushes, before the time-to-collision falloff. */
const STRENGTH = 4.2;

/**
 * The falloff is 1/t², not 1/t.
 *
 * A collision twice as far off is felt a quarter as hard rather than half as hard, which is what
 * keeps a distant crowd from summing into a wall of force that stops anybody moving. It is also
 * the exponent the anticipatory literature settles on, and picking it by feel would have been
 * inventing physics to taste.
 */
/**
 * The ceiling, and it is not a taste decision.
 *
 * 1/t² has a singularity at t = 0, and clamping t at a tenth of a second still left the magnitude
 * at 420 m/s² — against the social-force kernel's peak of about 9.4, which is what it reaches at
 * zero separation. Measured, that spike did not read as a more careful crowd; it read as a noisier
 * one. The run-to-run band went to 1.008 m against the social-force model's 0.303 m, which would
 * have shipped a second crowd whose only visible property was being three times twitchier than the
 * first, and that is a property of an unbounded force rather than of anticipation.
 *
 * The ceiling is set to the other kernel's own peak so the two crowds differ in WHAT they respond
 * to and not in how hard they are able to shove.
 */
export const MAX_AVOIDANCE = 9.4;

function avoidanceMagnitude(timeToCollisionS: number): number {
  const t = timeToCollisionS < 0.1 ? 0.1 : timeToCollisionS;
  const raw = STRENGTH / (t * t);
  return raw > MAX_AVOIDANCE ? MAX_AVOIDANCE : raw;
}

/**
 * When two agents on straight lines are nearest, and how near.
 *
 * Returns a negative time when they are already separating, which the caller reads as "no
 * collision is coming" rather than as a collision in the past.
 */
function closestApproach(
  rx: number,
  ry: number,
  dvx: number,
  dvy: number,
): { readonly timeS: number; readonly distanceM: number } {
  const closingSpeed2 = dvx * dvx + dvy * dvy;
  if (closingSpeed2 < 1e-12) {
    // Moving together at the same velocity: they never get nearer than they already are.
    return { timeS: -1, distanceM: Math.sqrt(rx * rx + ry * ry) };
  }
  const timeS = -(rx * dvx + ry * dvy) / closingSpeed2;
  const nx = rx + dvx * timeS;
  const ny = ry + dvy * timeS;
  return { timeS, distanceM: Math.sqrt(nx * nx + ny * ny) };
}

export function accumulateAnticipatory(
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
  const twoPedRadius = 2 * SIM_CONSTANTS.pedRadiusM;
  const robotReach = SIM_CONSTANTS.pedRadiusM + SIM_CONSTANTS.robotRadiusM;

  for (let i = 0; i < n; i++) {
    // Same rule as the social-force kernel, for the same measured reason: an arrived pedestrian
    // that kept integrating would be pushed by the exogenous noise and random-walk out of the room.
    if (arrived[i] === 1) {
      outFx[i] = 0;
      outFy[i] = 0;
      continue;
    }

    const gdx = (gx[i] as number) - (x[i] as number);
    const gdy = (gy[i] as number) - (y[i] as number);
    const goalDistance = Math.sqrt(gdx * gdx + gdy * gdy);
    const safe = goalDistance === 0 ? 1 : goalDistance;
    let fx = ((v0 * gdx) / safe - (vx[i] as number)) / tau;
    let fy = ((v0 * gdy) / safe - (vy[i] as number)) / tau;

    // Anticipated pedestrian avoidance.
    for (let j = 0; j < n; j++) {
      if (j === i) {
        continue;
      }
      const rx = (x[j] as number) - (x[i] as number);
      const ry = (y[j] as number) - (y[i] as number);
      const dvx = (vx[j] as number) - (vx[i] as number);
      const dvy = (vy[j] as number) - (vy[i] as number);
      const meeting = closestApproach(rx, ry, dvx, dvy);

      // Already separating, or too far off to be worth predicting.
      if (meeting.timeS <= 0 || meeting.timeS > HORIZON_S) {
        continue;
      }
      // They will pass each other with room to spare.
      if (meeting.distanceM > twoPedRadius * 2) {
        continue;
      }

      // Steer away from where the other person WILL be, not from where they are. This is the
      // whole difference from the social-force kernel and it is one line: the direction comes
      // from the predicted meeting point rather than from the present offset.
      const futureX = rx + dvx * meeting.timeS;
      const futureY = ry + dvy * meeting.timeS;
      const away = Math.sqrt(futureX * futureX + futureY * futureY);
      if (away < 1e-6) {
        // EXACTLY head-on, and this branch declines to invent a direction.
        //
        // When two people close on a perfectly collinear course the predicted meeting point sits
        // at zero offset, so there is no "away" to steer towards: any direction chosen here would
        // be one this kernel made up, and a crowd whose avoidance depends on an arbitrary
        // tie-break is a crowd whose numbers depend on it too.
        //
        // Left as a real property rather than papered over. Exact collinearity is a measure-zero
        // case that the per-tick exogenous noise breaks within a step, and the goal and wall terms
        // still act meanwhile — but a reader building a head-on fixture BY HAND will hit it, and
        // would otherwise conclude this kernel does not anticipate at all. It is the one state
        // where it is quieter than the social-force kernel, which pushes straight back along the
        // present offset.
        continue;
      }
      const magnitude = avoidanceMagnitude(meeting.timeS);
      fx -= (magnitude * futureX) / away;
      fy -= (magnitude * futureY) / away;
    }

    // The robot, anticipated the same way. `seeRobot === false` is the robot-blind lesson and it
    // works here for the identical reason: the robot is physically present, nobody predicts
    // against it, and the true effect collapses to exactly zero.
    const robot = state.robot;
    if (robot !== null && seeRobot) {
      const rx = robot.x - (x[i] as number);
      const ry = robot.y - (y[i] as number);
      const dvx = robot.vx - (vx[i] as number);
      const dvy = robot.vy - (vy[i] as number);
      const meeting = closestApproach(rx, ry, dvx, dvy);
      if (meeting.timeS > 0 && meeting.timeS <= HORIZON_S && meeting.distanceM <= robotReach * 3) {
        const futureX = rx + dvx * meeting.timeS;
        const futureY = ry + dvy * meeting.timeS;
        const away = Math.sqrt(futureX * futureX + futureY * futureY);
        if (away > 1e-6) {
          const magnitude = config.robot.repulsionScale * avoidanceMagnitude(meeting.timeS);
          fx -= (magnitude * futureX) / away;
          fy -= (magnitude * futureY) / away;
        }
      }
    }

    // The walls are the room's, not the kernel's, and are shared verbatim so the two models
    // differ in one thing rather than several.
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
