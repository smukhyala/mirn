import { fail, requireFinite } from "../core/errors.js";
import type { TreatmentSpec } from "./pairedRun.js";

export type DisturbanceKind = "impulse" | "goal-shift" | "sensor-dropout";

/**
 * One scheduled event.
 *
 * `atTick` rather than a timestamp: a user clicking "shove" does not mutate the running world, it
 * appends a spec and the engine re-simulates from tick 0. Every displayed run therefore stays
 * exactly reproducible from (config, seed) with no hidden history — which is the only form in
 * which the paired comparison survives someone poking at it.
 */
export interface DisturbanceSpec {
  readonly kind: DisturbanceKind;
  readonly id: string;
  readonly atTick: number;
  readonly durationTicks: number;
  readonly magnitude: number;
  readonly headingRad: number;
  /** -1 targets the robot. */
  readonly targetUid: number;
}

/**
 * Every constant of the world, frozen. A run is a pure function of `(RunConfig)` — the seed lives
 * inside it — so a displayed frame is always reproducible from a config alone, with no hidden
 * history. That is what makes an interactive disturbance a variable in an experiment rather than
 * an accident of when the user clicked.
 */
export interface RunConfig {
  readonly kind: "runConfig";
  readonly seed: number;
  /** 0 is the shown run. >=1 are the null-band replicates: same world, different exogenous noise. */
  readonly replicate: number;
  readonly widthM: number;
  readonly heightM: number;
  readonly dt: number;
  readonly nTicks: number;
  readonly crowd: {
    readonly nPedestrians: number;
    readonly noiseAmplitude: number;
    readonly desiredSpeed: number;
    readonly relaxationTimeS: number;
  };
  readonly robot: {
    readonly maxSpeed: number;
    readonly reactionTimeS: number;
    readonly deflectionWeight: number;
    /** Multiplier on how much space the robot demands. 0 makes it socially invisible. */
    readonly repulsionScale: number;
    readonly startXY: readonly [number, number];
    readonly goalXY: readonly [number, number];
  };
  /**
   * What the robot believes about where people are. Error here does not make it bump into
   * anyone; it makes it swerve away from people who are not there, which disturbs people it
   * never came close to.
   */
  readonly perception: {
    readonly positionSigmaM: number;
    readonly latencyTicks: number;
  };
  /** Scheduled by tick, never by wall clock — so a shove is a variable, not an accident. */
  readonly disturbances: readonly DisturbanceSpec[];
  /**
   * The demo's robot-blind toggle. Kept because it is the cleanest demonstration on the whole
   * site: switch it off and the true effect is EXACTLY zero while the measured one is not.
   */
  readonly pedestriansSeeRobot: boolean;
  readonly treatment: TreatmentSpec;
}

/** Constants that are not knobs. They appear in the notes, with provenance, and never in the UI. */
export const SIM_CONSTANTS = {
  /** Social-force parameters, carried over from demo/perturbation-playground.html. */
  pedRepulsionA: 2.1,
  pedRepulsionB: 0.32,
  pedCutoffM: 3.2,
  robotRepulsionA: 3.4,
  robotRepulsionB: 0.55,
  robotCutoffM: 4.5,
  pedRadiusM: 0.24,
  robotRadiusM: 0.32,
  wallStrength: 1.6,
  wallScaleM: 0.4,
  speedCapFactor: 1.35,
  wallRestitution: 0.4,
  /** Robot controller. */
  lookaheadS: 0.6,
  speedLevels: 4,
  headingOffsets: 9,
  headingStepRad: 0.28,
  collisionRadiusM: 0.75,
  collisionPenalty: 30,
  goalReachedM: 1.1,
} as const;

export const DEFAULT_CONFIG: RunConfig = Object.freeze({
  kind: "runConfig" as const,
  seed: 20260816,
  replicate: 0,
  widthM: 22,
  heightM: 13,
  dt: 0.05,
  nTicks: 800,
  crowd: Object.freeze({
    nPedestrians: 18,
    noiseAmplitude: 1.1,
    desiredSpeed: 1.34,
    relaxationTimeS: 0.5,
  }),
  robot: Object.freeze({
    maxSpeed: 1.1,
    reactionTimeS: 0.15,
    deflectionWeight: 0,
    repulsionScale: 1,
    startXY: Object.freeze([2, 6.5] as [number, number]),
    goalXY: Object.freeze([20, 6.5] as [number, number]),
  }),
  perception: Object.freeze({ positionSigmaM: 0, latencyTicks: 0 }),
  disturbances: Object.freeze([] as DisturbanceSpec[]),
  pedestriansSeeRobot: true,
  treatment: Object.freeze({ kind: "robot-presence" as const }),
});

/**
 * Overrides are shallow per group rather than all-or-nothing.
 *
 * `Partial<RunConfig>` would force every caller that wants to change one robot knob to restate
 * the whole robot object, which is how a default silently diverges from what a test thinks it is
 * testing. Each group is independently partial instead.
 */
export interface RunConfigOverrides {
  kind?: "runConfig";
  seed?: number;
  replicate?: number;
  widthM?: number;
  heightM?: number;
  dt?: number;
  nTicks?: number;
  crowd?: Partial<RunConfig["crowd"]>;
  robot?: Partial<RunConfig["robot"]>;
  perception?: Partial<RunConfig["perception"]>;
  disturbances?: readonly DisturbanceSpec[];
  pedestriansSeeRobot?: boolean;
  treatment?: TreatmentSpec;
}

export function makeRunConfig(overrides: RunConfigOverrides = {}): RunConfig {
  const merged: RunConfig = Object.freeze({
    ...DEFAULT_CONFIG,
    ...overrides,
    kind: "runConfig" as const,
    crowd: Object.freeze({ ...DEFAULT_CONFIG.crowd, ...(overrides.crowd ?? {}) }),
    robot: Object.freeze({ ...DEFAULT_CONFIG.robot, ...(overrides.robot ?? {}) }),
    perception: Object.freeze({ ...DEFAULT_CONFIG.perception, ...(overrides.perception ?? {}) }),
    disturbances: Object.freeze([...(overrides.disturbances ?? DEFAULT_CONFIG.disturbances)]),
  });

  if (!Number.isInteger(merged.seed)) {
    fail(`RunConfig.seed must be an integer, got ${merged.seed}`);
  }
  if (!Number.isInteger(merged.replicate) || merged.replicate < 0) {
    fail(`RunConfig.replicate must be a non-negative integer, got ${merged.replicate}`);
  }
  if (!Number.isInteger(merged.nTicks) || merged.nTicks < 1) {
    fail(`RunConfig.nTicks must be a positive integer, got ${merged.nTicks}`);
  }
  if (merged.nTicks > 1600) {
    fail(
      `RunConfig.nTicks is capped at 1600 (80 s at dt=0.05); a longer episode makes every ` +
        `maximum-style metric creep upward for no change in the physics. Got ${merged.nTicks}`,
    );
  }
  requireFinite(merged.dt, "RunConfig.dt");
  if (merged.dt <= 0) {
    fail(`RunConfig.dt must be > 0, got ${merged.dt}`);
  }
  if (!Number.isInteger(merged.crowd.nPedestrians) || merged.crowd.nPedestrians < 1) {
    fail(
      `RunConfig.crowd.nPedestrians must be a positive integer, got ${merged.crowd.nPedestrians}`,
    );
  }
  requireFinite(merged.crowd.noiseAmplitude, "RunConfig.crowd.noiseAmplitude");
  if (merged.crowd.noiseAmplitude < 0) {
    fail(`RunConfig.crowd.noiseAmplitude must be >= 0, got ${merged.crowd.noiseAmplitude}`);
  }
  requireFinite(merged.robot.maxSpeed, "RunConfig.robot.maxSpeed");
  if (merged.robot.maxSpeed < 0) {
    fail(`RunConfig.robot.maxSpeed must be >= 0, got ${merged.robot.maxSpeed}`);
  }
  requireFinite(merged.robot.repulsionScale, "RunConfig.robot.repulsionScale");
  if (merged.robot.repulsionScale < 0) {
    fail(`RunConfig.robot.repulsionScale must be >= 0, got ${merged.robot.repulsionScale}`);
  }
  requireFinite(merged.perception.positionSigmaM, "RunConfig.perception.positionSigmaM");
  if (merged.perception.positionSigmaM < 0) {
    fail(
      `RunConfig.perception.positionSigmaM must be >= 0, got ${merged.perception.positionSigmaM}`,
    );
  }
  if (!Number.isInteger(merged.perception.latencyTicks) || merged.perception.latencyTicks < 0) {
    fail(
      `RunConfig.perception.latencyTicks must be a non-negative integer, got ` +
        `${merged.perception.latencyTicks}`,
    );
  }
  const seenDisturbanceIds = new Set<string>();
  for (const spec of merged.disturbances) {
    if (seenDisturbanceIds.has(spec.id)) {
      fail(`RunConfig.disturbances has duplicate id '${spec.id}'`);
    }
    seenDisturbanceIds.add(spec.id);
    if (!Number.isInteger(spec.atTick) || spec.atTick < 0 || spec.atTick >= merged.nTicks) {
      fail(
        `disturbance '${spec.id}' must fire at an integer tick in [0, ${merged.nTicks}), got ` +
          `${spec.atTick}`,
      );
    }
    if (!Number.isInteger(spec.durationTicks) || spec.durationTicks < 1) {
      fail(`disturbance '${spec.id}' durationTicks must be >= 1, got ${spec.durationTicks}`);
    }
  }
  requireFinite(merged.robot.reactionTimeS, "RunConfig.robot.reactionTimeS");
  if (merged.robot.reactionTimeS <= 0) {
    fail(
      `RunConfig.robot.reactionTimeS must be > 0, got ${merged.robot.reactionTimeS}; it is a time ` +
        `constant, and zero would mean the robot reaches its chosen velocity instantly`,
    );
  }
  return merged;
}
