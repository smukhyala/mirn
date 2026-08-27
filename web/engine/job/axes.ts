import { DEFAULT_CONFIG, type RunConfigOverrides } from "../contracts/config.js";
import type { ColumnKey, UnitKey } from "./columns.js";
import type { MeasurementParams } from "./report.js";

/**
 * The closed axis catalogue: one table behind both the control panel and the sweep picker.
 *
 * A closed catalogue is not a registry. There is no `registerAxis`, nothing is added at runtime,
 * and an axis cannot be built from a config path supplied by a caller. It is a table so a test
 * can iterate it and prove the set is total, and so the label, unit, range and behaviour of one
 * knob live in one place instead of drifting across a switch and a template.
 *
 * `apply` is a function and functions do not survive `postMessage`, so a job carries the axis KEY
 * and the worker looks the entry up in its own copy of this module. One table, no serialised
 * behaviour.
 *
 * The `worldAxis` / `measurementAxis` split is a correctness statement, not an optimisation: a
 * measurement axis changes only how a ruler is applied to a run that already happened. Re-running
 * the simulation for it would be wrong as well as slow, because the point is that the robot has
 * not changed.
 */

export type AxisKey =
  | "pushStrength"
  | "crowdSize"
  | "holdingLine"
  | "crowdFidget"
  | "walkingPace"
  | "robotSpeed"
  | "reactionTime"
  | "politeness"
  | "perceptionError"
  | "passingOffset"
  | "episodeSeconds"
  | "forecastHorizon"
  | "forecastWindowEnd";

/** The half of an axis entry that does not depend on what it writes. Exported because both
 *  variants below extend it and a reader following `WorldAxis` has nowhere else to find these
 *  ten fields. */
export interface AxisCommon {
  readonly key: AxisKey;
  readonly label: string;
  readonly unit: UnitKey;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  readonly note: string;
  /** Dotted config paths this axis writes. A test diffs the produced config against it. */
  readonly writes: readonly string[];
  /** The readouts this axis was MEASURED to move, not the ones it sounds like it should. */
  readonly movesColumns: readonly ColumnKey[];
}

export interface WorldAxis extends AxisCommon {
  readonly kind: "worldAxis";
  readonly apply: (base: RunConfigOverrides, value: number) => RunConfigOverrides;
}

export interface MeasurementAxis extends AxisCommon {
  readonly kind: "measurementAxis";
  readonly apply: (params: MeasurementParams, value: number) => MeasurementParams;
}

export type AxisEntry = WorldAxis | MeasurementAxis;

/** The centre line the robot crosses on, which `passingOffset` walks it away from. */
const CENTRE_LINE_Y = 6.5;

export const AXES: Readonly<Record<AxisKey, AxisEntry>> = Object.freeze({
  pushStrength: Object.freeze({
    kind: "worldAxis" as const,
    key: "pushStrength" as const,
    label: "How much space the robot demands",
    unit: "ratio" as const,
    min: 0,
    max: 3,
    step: 0.25,
    defaultValue: 1,
    note: "At zero the robot is socially invisible: people walk as if it were not there, and the effect on them is exactly nothing.",
    writes: Object.freeze(["robot.repulsionScale"]),
    movesColumns: Object.freeze(["trueEffectM", "worstMomentM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      robot: { ...(base.robot ?? {}), repulsionScale: value },
    }),
  }),

  crowdSize: Object.freeze({
    kind: "worldAxis" as const,
    key: "crowdSize" as const,
    label: "How many people are in the room",
    unit: "people" as const,
    min: 4,
    max: 44,
    step: 1,
    defaultValue: 18,
    note: "A fuller room gives the robot more to push against, and it also makes two runs of the same room differ more, so both the reading and the floor it is judged against move together.",
    writes: Object.freeze(["crowd.nPedestrians"]),
    movesColumns: Object.freeze(["trueEffectM", "forecastReportM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      crowd: { ...(base.crowd ?? {}), nPedestrians: Math.round(value) },
    }),
  }),

  holdingLine: Object.freeze({
    kind: "worldAxis" as const,
    key: "holdingLine" as const,
    label: "How stubbornly people hold their line",
    unit: "seconds" as const,
    min: 0.2,
    max: 1.5,
    step: 0.05,
    defaultValue: 0.5,
    note: "How long a person takes to get back to the speed and direction they wanted. Larger values mean they give way more slowly and recover more slowly.",
    writes: Object.freeze(["crowd.relaxationTimeS"]),
    movesColumns: Object.freeze(["trueEffectM", "worstMomentM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      crowd: { ...(base.crowd ?? {}), relaxationTimeS: value },
    }),
  }),

  crowdFidget: Object.freeze({
    kind: "worldAxis" as const,
    key: "crowdFidget" as const,
    label: "Random wobble",
    unit: "none" as const,
    min: 0,
    max: 3,
    step: 0.1,
    defaultValue: 1.1,
    note: "How much people wander for no reason at all. It barely touches what the robot actually did, and it moves what a forecaster reports, which is the point.",
    writes: Object.freeze(["crowd.noiseAmplitude"]),
    movesColumns: Object.freeze(["forecastReportM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      crowd: { ...(base.crowd ?? {}), noiseAmplitude: value },
    }),
  }),

  walkingPace: Object.freeze({
    kind: "worldAxis" as const,
    key: "walkingPace" as const,
    label: "How fast people want to walk",
    unit: "none" as const,
    min: 0.4,
    max: 2,
    // 0.01, not 0.05. A range input snaps whatever it is given to its own notches, and 1.34 is
    // not a multiple of 0.05 above 0.4 — so in a real browser (though not in jsdom, which does not
    // sanitise) this slider opened at 1.35 and the console simulated a crowd walking at 1.35 while
    // `DEFAULT_CONFIG.crowd.desiredSpeed` and every test used 1.34. The default is the measured
    // mean preferred walking speed and is not the thing to move; the notch spacing is.
    // `axes.slow.test.ts` now asserts every axis's default, minimum and maximum sit on its grid.
    step: 0.01,
    defaultValue: 1.34,
    note: "In metres per second. It is not monotone: the effect peaks around a strolling pace, so a sentence claiming faster always means more would be false at one end of this dial.",
    writes: Object.freeze(["crowd.desiredSpeed"]),
    movesColumns: Object.freeze(["trueEffectM", "forecastReportM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      crowd: { ...(base.crowd ?? {}), desiredSpeed: value },
    }),
  }),

  robotSpeed: Object.freeze({
    kind: "worldAxis" as const,
    key: "robotSpeed" as const,
    label: "How fast the robot may go",
    unit: "none" as const,
    min: 0.2,
    max: 1.8,
    step: 0.05,
    defaultValue: 1.1,
    note: "In metres per second. A slow robot barely gets across the room in the time available, which is why the distance it covers moves far more than the effect it has.",
    writes: Object.freeze(["robot.maxSpeed"]),
    movesColumns: Object.freeze(["robotPathM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      robot: { ...(base.robot ?? {}), maxSpeed: value },
    }),
  }),

  reactionTime: Object.freeze({
    kind: "worldAxis" as const,
    key: "reactionTime" as const,
    label: "How slowly the robot changes its mind",
    unit: "seconds" as const,
    min: 0.05,
    max: 1,
    step: 0.05,
    defaultValue: 0.15,
    note: "A sluggish robot commits to a heading and carries it further, which lengthens its route and brings it closer to people. It leaves the crowd's overall displacement almost untouched.",
    writes: Object.freeze(["robot.reactionTimeS"]),
    movesColumns: Object.freeze(["robotPathM", "minClearanceM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      robot: { ...(base.robot ?? {}), reactionTimeS: value },
    }),
  }),

  politeness: Object.freeze({
    kind: "worldAxis" as const,
    key: "politeness" as const,
    label: "How hard the robot tries to go around",
    unit: "none" as const,
    min: 0,
    max: 6,
    step: 0.25,
    defaultValue: 0,
    note: "It buys a longer route, and at the top of this dial the robot may wander so much that it never reaches its goal at all, which is reported as not having arrived rather than as a time.",
    writes: Object.freeze(["robot.deflectionWeight"]),
    movesColumns: Object.freeze(["robotPathM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      robot: { ...(base.robot ?? {}), deflectionWeight: value },
    }),
  }),

  perceptionError: Object.freeze({
    kind: "worldAxis" as const,
    key: "perceptionError" as const,
    label: "How badly the robot mis-sees people",
    unit: "metres" as const,
    min: 0,
    max: 0.8,
    step: 0.05,
    defaultValue: 0,
    note: "Error here does not make the robot bump into anyone. It makes it swerve away from people who are not there, which brings it closer to the ones who are.",
    writes: Object.freeze(["perception.positionSigmaM"]),
    movesColumns: Object.freeze(["minClearanceM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      perception: { ...(base.perception ?? {}), positionSigmaM: value },
    }),
  }),

  passingOffset: Object.freeze({
    kind: "worldAxis" as const,
    key: "passingOffset" as const,
    label: "How wide a berth the robot takes",
    unit: "metres" as const,
    min: 0,
    max: 3,
    step: 0.25,
    defaultValue: 0,
    note: "How far off the middle of the room the robot's whole crossing is shifted. It moves the start and the goal together, because exposing four raw coordinates is the fastest way to put a goal outside the wall.",
    writes: Object.freeze(["robot.goalXY", "robot.startXY"]),
    movesColumns: Object.freeze(["worstMomentM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      robot: {
        ...(base.robot ?? {}),
        startXY: [DEFAULT_CONFIG.robot.startXY[0], CENTRE_LINE_Y - value],
        goalXY: [DEFAULT_CONFIG.robot.goalXY[0], CENTRE_LINE_Y - value],
      },
    }),
  }),

  episodeSeconds: Object.freeze({
    kind: "worldAxis" as const,
    key: "episodeSeconds" as const,
    label: "How long the episode runs",
    unit: "seconds" as const,
    min: 10,
    max: 80,
    step: 5,
    defaultValue: 40,
    note: "A short episode ends before the robot has crossed the room. It is also the fastest way to make a worst-moment reading look smaller without changing the physics at all.",
    writes: Object.freeze(["nTicks"]),
    movesColumns: Object.freeze(["robotPathM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => {
      const dt = base.dt ?? DEFAULT_CONFIG.dt;
      return { ...base, nTicks: Math.round(value / dt) };
    },
  }),

  forecastHorizon: Object.freeze({
    kind: "measurementAxis" as const,
    key: "forecastHorizon" as const,
    label: "How far ahead the forecaster guesses",
    unit: "seconds" as const,
    min: 0.2,
    max: 3,
    step: 0.1,
    defaultValue: 3,
    note: "This changes only how the ruler is applied to a run that already happened. The robot has not changed, and re-running the room for it would be wrong as well as slow.",
    writes: Object.freeze(["forecastHorizonSteps"]),
    movesColumns: Object.freeze(["forecastReportM"] as ColumnKey[]),
    apply: (params: MeasurementParams, value: number): MeasurementParams => ({
      ...params,
      forecastHorizonSteps: Math.round(value / DEFAULT_CONFIG.dt),
    }),
  }),

  forecastWindowEnd: Object.freeze({
    kind: "measurementAxis" as const,
    key: "forecastWindowEnd" as const,
    label: "When the forecaster is checked",
    unit: "seconds" as const,
    min: 5,
    max: 40,
    step: 0.5,
    defaultValue: 10,
    note: "Late in the episode everyone has arrived and stopped, and a guess that a stationary person carries straight on is exactly right, so the forecaster reads almost nothing however bad it is. It does not fall smoothly on the way there, because the whole reading rests on one instant: one notch can halve it or grow it by half.",
    writes: Object.freeze(["forecastEndStep"]),
    movesColumns: Object.freeze(["forecastReportM"] as ColumnKey[]),
    apply: (params: MeasurementParams, value: number): MeasurementParams => ({
      ...params,
      forecastEndStep: Math.round(value / DEFAULT_CONFIG.dt),
    }),
  }),
});

export const AXIS_ORDER: readonly AxisKey[] = Object.freeze([
  "crowdSize",
  "holdingLine",
  "walkingPace",
  "crowdFidget",
  "pushStrength",
  "robotSpeed",
  "reactionTime",
  "politeness",
  "perceptionError",
  "passingOffset",
  "episodeSeconds",
  "forecastHorizon",
  "forecastWindowEnd",
] as const);
