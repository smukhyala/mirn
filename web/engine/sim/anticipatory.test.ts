import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  SIM_CONSTANTS,
  makeRunConfig,
  type RunConfig,
} from "../contracts/config.js";
import { ContractError } from "../core/errors.js";
import { accumulateAnticipatory } from "./anticipatory.js";
import { accumulateForces } from "./forces.js";
import { runPair } from "./run.js";
import type { ArmResult } from "./run.js";
import type { WorldState } from "./state.js";

/**
 * The second crowd kernel, tested as a crowd kernel rather than as a copy of the first.
 *
 * Four of these tests would pass on a file that silently fell through to `accumulateForces` —
 * determinism, containment, no-NaN and the paired invariant are properties of the WORLD, and the
 * world is shared. So two of them are canaries rather than properties: "the two kernels genuinely
 * differ" fails a silent fall-through, and "close but moving apart produces no force" fails a
 * kernel that is the social-force one with different numbers on it.
 */

/** Mirrors `lockstep.test.ts`: the arms are compared as bytes, never as approximations. */
function bytesOf(arm: ArmResult): Uint8Array {
  let total = 0;
  for (const buffer of arm.positions) {
    total += buffer.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const buffer of arm.positions) {
    out.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength), offset);
    offset += buffer.byteLength;
  }
  return out;
}

function worstGap(result: ReturnType<typeof runPair>): number {
  let worst = 0;
  for (let i = 0; i < result.treated.positions.length; i++) {
    const a = result.treated.positions[i] as Float64Array;
    const b = result.control.positions[i] as Float64Array;
    for (let k = 0; k < a.length; k += 2) {
      const dx = (a[k] as number) - (b[k] as number);
      const dy = (a[k + 1] as number) - (b[k + 1] as number);
      const gap = Math.sqrt(dx * dx + dy * dy);
      if (gap > worst) {
        worst = gap;
      }
    }
  }
  return worst;
}

/** The largest distance between the same agent at the same sample under two different runs. */
function worstArmGap(a: ArmResult, b: ArmResult): number {
  let worst = 0;
  for (let i = 0; i < a.positions.length; i++) {
    const left = a.positions[i] as Float64Array;
    const right = b.positions[i] as Float64Array;
    for (let k = 0; k < left.length; k += 2) {
      const dx = (left[k] as number) - (right[k] as number);
      const dy = (left[k + 1] as number) - (right[k + 1] as number);
      const gap = Math.sqrt(dx * dx + dy * dy);
      if (gap > worst) {
        worst = gap;
      }
    }
  }
  return worst;
}

// ---------------------------------------------------------------------------------------------
// Hand-built states, for the two tests that are about the kernel's own arithmetic rather than
// about a whole episode.
// ---------------------------------------------------------------------------------------------

interface AgentSpec {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly gx: number;
  readonly gy: number;
}

type CrowdKernel = (
  state: WorldState,
  config: RunConfig,
  seeRobot: boolean,
  noiseX: Float64Array,
  noiseY: Float64Array,
  outFx: Float64Array,
  outFy: Float64Array,
) => void;

function makeState(agents: readonly AgentSpec[]): WorldState {
  const n = agents.length;
  const state: WorldState = {
    n,
    uid: new Int32Array(n),
    x: new Float64Array(n),
    y: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    gx: new Float64Array(n),
    gy: new Float64Array(n),
    arrived: new Uint8Array(n),
    robot: null,
  };
  for (let i = 0; i < n; i++) {
    const agent = agents[i] as AgentSpec;
    state.uid[i] = i;
    state.x[i] = agent.x;
    state.y[i] = agent.y;
    state.vx[i] = agent.vx;
    state.vy[i] = agent.vy;
    state.gx[i] = agent.gx;
    state.gy[i] = agent.gy;
    state.arrived[i] = 0;
  }
  return state;
}

interface Acceleration {
  readonly fx: number;
  readonly fy: number;
}

/** The acceleration one kernel writes for one agent, with the noise deliberately set to zero. */
function accelerationOf(
  kernel: CrowdKernel,
  agents: readonly AgentSpec[],
  config: RunConfig,
  index: number,
): Acceleration {
  const state = makeState(agents);
  const n = agents.length;
  const noiseX = new Float64Array(n);
  const noiseY = new Float64Array(n);
  const outFx = new Float64Array(n);
  const outFy = new Float64Array(n);
  kernel(state, config, false, noiseX, noiseY, outFx, outFy);
  return { fx: outFx[index] as number, fy: outFy[index] as number };
}

/**
 * The avoidance term alone, isolated without restating either kernel's formula.
 *
 * The goal term and the four wall terms depend only on the agent's OWN position, velocity and
 * goal, so running the identical agent with nobody else in the room reproduces them exactly.
 * Whatever is left when that is subtracted is what the neighbours contributed. Subtracting a
 * hand-written copy of the goal and wall arithmetic instead would make this test agree with a
 * kernel that had drifted, as long as the test drifted the same way.
 */
function avoidanceOnFirst(
  kernel: CrowdKernel,
  agents: readonly AgentSpec[],
  config: RunConfig,
): Acceleration {
  const together = accelerationOf(kernel, agents, config, 0);
  const alone = accelerationOf(kernel, [agents[0] as AgentSpec], config, 0);
  return { fx: together.fx - alone.fx, fy: together.fy - alone.fy };
}

function magnitudeOf(acceleration: Acceleration): number {
  return Math.sqrt(acceleration.fx * acceleration.fx + acceleration.fy * acceleration.fy);
}

/**
 * The same two people, 0.82 m apart, in the same places, differing only in which way they walk.
 *
 * `closing` walks them into one another at a combined 0.8 m/s; `opening` is the same pair at the
 * same instant walking out of one another's way. The 0.2 m of lateral offset is not decoration:
 * two people on an exactly head-on line have a predicted meeting point of zero size, there is no
 * direction to steer in, and the kernel correctly declines to invent one.
 */
const CLOSING_PAIR: readonly AgentSpec[] = [
  { x: 10.0, y: 6.4, vx: 0.4, vy: 0, gx: 21, gy: 6.4 },
  { x: 10.8, y: 6.6, vx: -0.4, vy: 0, gx: 1, gy: 6.6 },
];

const OPENING_PAIR: readonly AgentSpec[] = [
  { x: 10.0, y: 6.4, vx: -0.4, vy: 0, gx: 21, gy: 6.4 },
  { x: 10.8, y: 6.6, vx: 0.4, vy: 0, gx: 1, gy: 6.6 },
];

/**
 * The cap inside `anticipatory.ts`, restated because the module keeps it private.
 *
 * It is not a free parameter: it is the social-force kernel's own peak, so that the two crowds
 * differ in WHAT they respond to and not in how hard they can shove. An earlier uncapped version
 * reached 420 m/s² at a tenth of a second and tripled the run-to-run band, which is why the bound
 * below is a test and not a comment.
 */
const MAX_AVOIDANCE_M_PER_S2 = 9.4;

/** The largest the four soft wall terms can be at one position, summed per axis. */
function wallBoundAt(x: number, y: number, config: RunConfig): number {
  const wall = SIM_CONSTANTS.wallStrength;
  const scale = SIM_CONSTANTS.wallScaleM;
  const bottom = wall * Math.exp(-(y - 0.3) / scale);
  const top = wall * Math.exp(-(config.heightM - 0.3 - y) / scale);
  const left = wall * Math.exp(-(x - 0.3) / scale);
  const right = wall * Math.exp(-(config.widthM - 0.3 - x) / scale);
  return bottom + top + left + right;
}

// ---------------------------------------------------------------------------------------------
// 1. The paired invariant. Guardrail 5, and the most important test in this file.
// ---------------------------------------------------------------------------------------------

describe("the paired invariant holds under the anticipatory kernel", () => {
  // `toEqual` on bytes and `toBe(0)` on the gap, never `toBeCloseTo`. Both arms are handed the
  // same noise, drawn by address from one tape, so exactness is available — and inexactness would
  // mean the second kernel has reached for randomness of its own, or branched on which arm it is
  // in, or picked up an order dependence in its force loop.
  it("makes the null treatment produce bitwise identical arms", () => {
    const config = makeRunConfig({
      nTicks: 300,
      crowdModel: "anticipatory",
      treatment: { kind: "none" },
    });
    const result = runPair(config);
    expect(bytesOf(result.treated)).toEqual(bytesOf(result.control));
    expect(worstGap(result)).toBe(0);
  });

  it("collapses the robot-blind true effect to exactly zero", () => {
    // The robot is physically present and moving in the treated arm and absent in the control
    // one; nobody predicts against it; the honest answer is 0 and not merely something small.
    const config = makeRunConfig({
      nTicks: 300,
      crowdModel: "anticipatory",
      pedestriansSeeRobot: false,
    });
    const result = runPair(config);
    expect(bytesOf(result.treated)).toEqual(bytesOf(result.control));
    expect(worstGap(result)).toBe(0);
  });

  it("still produces a real effect once people do predict against the robot", () => {
    // Otherwise the test above would pass on a kernel that ignores the robot entirely, which is
    // not the robot-blind lesson but a broken kernel.
    const config = makeRunConfig({
      nTicks: 300,
      crowdModel: "anticipatory",
      pedestriansSeeRobot: true,
    });
    expect(worstGap(runPair(config))).toBeGreaterThan(0.05);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Determinism. Guardrail 4.
// ---------------------------------------------------------------------------------------------

describe("determinism under the anticipatory kernel", () => {
  it("gives byte-identical positions for the same config run twice", () => {
    const config = makeRunConfig({ nTicks: 200, crowdModel: "anticipatory" });
    const first = runPair(config);
    const second = runPair(config);
    expect(bytesOf(second.treated)).toEqual(bytesOf(first.treated));
    expect(bytesOf(second.control)).toEqual(bytesOf(first.control));
    expect(worstArmGap(first.treated, second.treated)).toBe(0);
  });

  it("survives interleaving, so no module-scope state is leaking between runs", () => {
    const a = makeRunConfig({ nTicks: 120, seed: 1, crowdModel: "anticipatory" });
    const b = makeRunConfig({ nTicks: 120, seed: 2, crowdModel: "anticipatory" });
    const firstA = bytesOf(runPair(a).treated);
    void runPair(b);
    expect(bytesOf(runPair(a).treated)).toEqual(firstA);
  });
});

// ---------------------------------------------------------------------------------------------
// 3 and 4. Containment and finiteness.
// ---------------------------------------------------------------------------------------------

describe("the room contains the anticipatory crowd", () => {
  // The room size is read from `DEFAULT_CONFIG` rather than written out here. A hardcoded bound
  // that does not match the room is a test that passes for the wrong reason, and a wrong one was
  // written by hand once already.
  const roomWidthM = DEFAULT_CONFIG.widthM;
  const roomHeightM = DEFAULT_CONFIG.heightM;
  const marginM = 0.2;
  const seeds: readonly number[] = [1, 7, 20260827];

  it("keeps every pedestrian inside the walls for the whole episode, at several seeds", () => {
    for (const seed of seeds) {
      const config = makeRunConfig({ seed, nTicks: 400, crowdModel: "anticipatory" });
      expect(config.widthM).toBe(roomWidthM);
      expect(config.heightM).toBe(roomHeightM);
      const result = runPair(config);
      for (const arm of [result.treated, result.control]) {
        for (const buffer of arm.positions) {
          for (let s = 0; s < buffer.length; s += 2) {
            const px = buffer[s] as number;
            const py = buffer[s + 1] as number;
            expect(px).toBeGreaterThanOrEqual(marginM);
            expect(px).toBeLessThanOrEqual(roomWidthM - marginM);
            expect(py).toBeGreaterThanOrEqual(marginM);
            expect(py).toBeLessThanOrEqual(roomHeightM - marginM);
          }
        }
      }
    }
  });

  it("produces no NaN anywhere, at several seeds", () => {
    for (const seed of seeds) {
      const config = makeRunConfig({ seed, nTicks: 400, crowdModel: "anticipatory" });
      const result = runPair(config);
      for (const arm of [result.treated, result.control]) {
        for (const buffer of arm.positions) {
          for (let s = 0; s < buffer.length; s++) {
            expect(Number.isFinite(buffer[s] as number)).toBe(true);
          }
        }
        const robotPositions = arm.robotPositions;
        if (robotPositions !== null) {
          for (let s = 0; s < robotPositions.length; s++) {
            expect(Number.isFinite(robotPositions[s] as number)).toBe(true);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 5. The canary: a second kernel that fell through to the first would pass everything above.
// ---------------------------------------------------------------------------------------------

describe("the two kernels are genuinely two kernels", () => {
  it("gives the same seed different trajectories under the two models", () => {
    const seed = 20260827;
    const social = runPair(makeRunConfig({ seed, nTicks: 200, crowdModel: "socialForce" }));
    const anticipatory = runPair(makeRunConfig({ seed, nTicks: 200, crowdModel: "anticipatory" }));

    // Same room, same people, same places at sample 0 — the kernels do not touch placement.
    const socialFirst = social.treated.positions[0] as Float64Array;
    const anticipatoryFirst = anticipatory.treated.positions[0] as Float64Array;
    expect(anticipatoryFirst[0] as number).toBe(socialFirst[0] as number);
    expect(anticipatoryFirst[1] as number).toBe(socialFirst[1] as number);

    expect(bytesOf(anticipatory.treated)).not.toEqual(bytesOf(social.treated));
    // Not a last-bit difference either: the two crowds walk visibly different paths.
    expect(worstArmGap(social.treated, anticipatory.treated)).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------------------------
// 6. The behavioural heart: this kernel answers a different question from the first one.
// ---------------------------------------------------------------------------------------------

describe("the kernel is actually anticipatory", () => {
  const config = makeRunConfig({ crowdModel: "anticipatory" });

  it("produces no avoidance at all for two people close together but moving apart", () => {
    const avoidance = avoidanceOnFirst(accumulateAnticipatory, OPENING_PAIR, config);
    // Exactly zero, not merely small: the predicted closest approach is in the past, so the loop
    // never reaches the force at all.
    expect(avoidance.fx).toBe(0);
    expect(avoidance.fy).toBe(0);
  });

  it("produces a substantial avoidance at the same separation when they move toward each other", () => {
    const closing = magnitudeOf(avoidanceOnFirst(accumulateAnticipatory, CLOSING_PAIR, config));
    // Measured at 4.200 m/s²: the pair meet in 1.0 s, and the 1/t² law is unclamped there, so
    // this is the anticipation itself rather than the ceiling. The same two people at the same
    // separation read 0.715 m/s² under the social-force kernel, in both directions of travel.
    expect(closing).toBeGreaterThan(3);
    expect(closing).toBeLessThanOrEqual(MAX_AVOIDANCE_M_PER_S2 + 1e-9);
  });

  it("steers away from the predicted meeting point rather than from the present offset", () => {
    // The pair converge along x and are offset along y, so the meeting point is directly across
    // the walker's path: the whole response is lateral, and pushing back along the present offset
    // — which is what a distance kernel does — would put most of it in x.
    const avoidance = avoidanceOnFirst(accumulateAnticipatory, CLOSING_PAIR, config);
    expect(Math.abs(avoidance.fy)).toBeGreaterThan(Math.abs(avoidance.fx) * 10);
    // Away from the neighbour, who sits at the greater y.
    expect(avoidance.fy).toBeLessThan(0);
  });

  it("is a different model rather than a retuned one, because the first kernel cannot tell the two cases apart", () => {
    // The social-force kernel repels on present distance, and the two states above hold the same
    // two people in the same two places. So its avoidance term is the same in both — and it
    // pushes in the case where nobody is going to collide.
    //
    // Compared to twelve places rather than bitwise, and the exception is worth stating because
    // this file otherwise insists on exactness. The quantity the kernel computes IS identical
    // across the two states; what is compared here is that quantity isolated by subtracting the
    // agent's own goal and wall terms, and the goal term depends on velocity, which is the one
    // thing the two states do not share. The last bit of the cancellation differs, at about 2e-16.
    const socialOpening = avoidanceOnFirst(accumulateForces, OPENING_PAIR, config);
    const socialClosing = avoidanceOnFirst(accumulateForces, CLOSING_PAIR, config);
    expect(socialOpening.fx).toBeCloseTo(socialClosing.fx, 12);
    expect(socialOpening.fy).toBeCloseTo(socialClosing.fy, 12);
    expect(magnitudeOf(socialOpening)).toBeGreaterThan(0.5);
    expect(magnitudeOf(socialClosing)).toBeGreaterThan(0.5);

    // The anticipatory kernel, on the same two states, reads them as opposite situations.
    const anticipatoryOpening = magnitudeOf(
      avoidanceOnFirst(accumulateAnticipatory, OPENING_PAIR, config),
    );
    const anticipatoryClosing = magnitudeOf(
      avoidanceOnFirst(accumulateAnticipatory, CLOSING_PAIR, config),
    );
    expect(anticipatoryOpening).toBe(0);
    expect(anticipatoryClosing).toBeGreaterThan(magnitudeOf(socialClosing) * 5);
  });
});

// ---------------------------------------------------------------------------------------------
// 7. The cap, which is why the second crowd is not simply a twitchier first one.
// ---------------------------------------------------------------------------------------------

describe("the anticipatory force is bounded", () => {
  const config = makeRunConfig({ crowdModel: "anticipatory" });

  /**
   * Two people 0.063 m apart closing at 2.4 m/s: the predicted collision is 25 ms away, which is
   * inside the tenth-of-a-second clamp, so the raw 1/t² magnitude is 420 m/s². This is the state
   * that produced that number before the ceiling existed.
   */
  const NEAR_COLLISION: readonly AgentSpec[] = [
    { x: 11.0, y: 6.5, vx: 1.2, vy: 0, gx: 21, gy: 6.5 },
    { x: 11.06, y: 6.52, vx: -1.2, vy: 0, gx: 1, gy: 6.52 },
  ];

  it("holds the avoidance term at the ceiling on a deliberately near-collision state", () => {
    const avoidance = magnitudeOf(avoidanceOnFirst(accumulateAnticipatory, NEAR_COLLISION, config));
    // At the ceiling, and nowhere near the 420 m/s² the uncapped form reached here.
    expect(avoidance).toBeCloseTo(MAX_AVOIDANCE_M_PER_S2, 9);
    expect(avoidance).toBeLessThanOrEqual(MAX_AVOIDANCE_M_PER_S2 + 1e-9);
  });

  it("keeps every acceleration inside the cap plus the goal and wall terms", () => {
    const v0 = config.crowd.desiredSpeed;
    const tau = config.crowd.relaxationTimeS;
    for (let i = 0; i < NEAR_COLLISION.length; i++) {
      const agent = NEAR_COLLISION[i] as AgentSpec;
      const speed = Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);
      // |(v0 * ghat - v) / tau| <= (v0 + |v|) / tau, and there is exactly one neighbour here, so
      // the avoidance term can contribute the ceiling at most once.
      const goalBound = (v0 + speed) / tau;
      const bound = goalBound + wallBoundAt(agent.x, agent.y, config) + MAX_AVOIDANCE_M_PER_S2;
      const acceleration = accelerationOf(accumulateAnticipatory, NEAR_COLLISION, config, i);
      expect(magnitudeOf(acceleration)).toBeLessThanOrEqual(bound);
      // And the bound is not vacuous: the avoidance term really is active in this state.
      expect(magnitudeOf(acceleration)).toBeGreaterThan(MAX_AVOIDANCE_M_PER_S2 * 0.5);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 8 and 9. The closed union, and the default nobody may move.
// ---------------------------------------------------------------------------------------------

describe("the crowd model is a closed union", () => {
  it("refuses a model this bench does not run", () => {
    // A hand-edited permalink naming a kernel that does not exist must say so rather than fall
    // through to whichever branch the dispatch happens to end on.
    expect(() => makeRunConfig({ crowdModel: "nonsense" as never })).toThrow(ContractError);
  });

  it("accepts both of the models it does run", () => {
    expect(makeRunConfig({ crowdModel: "socialForce" }).crowdModel).toBe("socialForce");
    expect(makeRunConfig({ crowdModel: "anticipatory" }).crowdModel).toBe("anticipatory");
  });

  it("leaves the default on the social-force kernel", () => {
    // Every fixture, permalink and pinned measurement in this repo predates the second kernel and
    // was taken under the first. Changing this default would silently restate all of them.
    expect(DEFAULT_CONFIG.crowdModel).toBe("socialForce");
    expect(makeRunConfig().crowdModel).toBe("socialForce");
  });
});
