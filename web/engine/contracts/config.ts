import { fail, requireFinite } from "../core/errors.js";
import type { TreatmentSpec } from "./pairedRun.js";

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
    readonly startXY: readonly [number, number];
    readonly goalXY: readonly [number, number];
  };
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
    startXY: Object.freeze([2, 6.5] as [number, number]),
    goalXY: Object.freeze([20, 6.5] as [number, number]),
  }),
  pedestriansSeeRobot: true,
  treatment: Object.freeze({ kind: "robot-presence" as const }),
});

export function makeRunConfig(overrides: Partial<Omit<RunConfig, "kind">> = {}): RunConfig {
  const merged: RunConfig = Object.freeze({
    ...DEFAULT_CONFIG,
    ...overrides,
    kind: "runConfig" as const,
    crowd: Object.freeze({ ...DEFAULT_CONFIG.crowd, ...(overrides.crowd ?? {}) }),
    robot: Object.freeze({ ...DEFAULT_CONFIG.robot, ...(overrides.robot ?? {}) }),
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
  requireFinite(merged.robot.reactionTimeS, "RunConfig.robot.reactionTimeS");
  if (merged.robot.reactionTimeS <= 0) {
    fail(
      `RunConfig.robot.reactionTimeS must be > 0, got ${merged.robot.reactionTimeS}; it is a time ` +
        `constant, and zero would mean the robot reaches its chosen velocity instantly`,
    );
  }
  return merged;
}
