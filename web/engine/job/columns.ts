import { SIM_CONSTANTS } from "../contracts/config.js";
import { fail } from "../core/errors.js";
import { cvmResidual, paired } from "../measure/estimator/index.js";
import { pathLength } from "../measure/kernels.js";
import { recovery, robotCost } from "../measure/metrics.js";
import {
  arrivalSecondsOf,
  clearanceAfterBothMove,
  pedestrianTimeLost,
  type ReportContext,
} from "./report.js";

/**
 * One descriptor per column: the arithmetic, the words, the unit and the zero, in one literal.
 *
 * This guarantees the DIFF is visible, not that the words are right. Nothing in the build checks
 * that `assumption` describes what `extract` computed. What it does guarantee is that changing a
 * formula without changing its sentence is a one-hunk diff you have to look at, which is more
 * than the arrangement it replaces managed: a panel has already once explained a different
 * quantity from the one printed above it, and it compiled.
 *
 * A closed catalogue is not a registry. There is no `register` function and nothing is added at
 * runtime. It is a table so a test can iterate it and prove the set is total, which is the
 * opposite of an extension point.
 */

export type ColumnKey =
  | "trueEffectM"
  | "worstMomentM"
  | "forecastReportM"
  | "forecastZeroM"
  | "runToRunBandM"
  | "worstMomentNullM"
  | "detectionFloorM"
  | "robotPathM"
  | "robotArrivalS"
  | "extraPathM"
  | "pedestrianTimeLostS"
  | "minClearanceM"
  | "nearMissEpisodes"
  | "recoveryS"
  | "frechetMeanM";

export type UnitKey = "metres" | "seconds" | "count" | "ratio" | "people" | "none";
export type ColumnGroup =
  | "effect"
  | "forecast"
  | "null"
  | "cost"
  | "safety"
  | "recovery"
  | "otherRulers";
export type ColumnNeeds = "run" | "zeroRun" | "band" | "floor" | "frechet";
export type Statistic = "meanOverSteps" | "maxOverSteps" | "perAgent" | "pathScalar";

export type Availability =
  | { readonly kind: "measured" }
  | { readonly kind: "censored"; readonly why: string }
  | { readonly kind: "notApplicable"; readonly why: string };

export interface Reading {
  readonly kind: "reading";
  /** NaN if and only if `availability.kind !== "measured"`. */
  readonly value: number;
  readonly availability: Availability;
}

export function makeReading(value: number, availability: Availability): Reading {
  if (availability.kind === "measured") {
    if (!Number.isFinite(value)) {
      fail(`a measured reading must be a finite number, got ${value}`);
    }
  } else if (!Number.isNaN(value)) {
    fail(`a ${availability.kind} reading must carry NaN, got ${value}`);
  }
  return Object.freeze({ kind: "reading" as const, value, availability });
}

const MEASURED: Availability = Object.freeze({ kind: "measured" as const });

function measured(value: number): Reading {
  return makeReading(value, MEASURED);
}

function censored(why: string): Reading {
  return makeReading(Number.NaN, { kind: "censored", why });
}

function notApplicable(why: string): Reading {
  return makeReading(Number.NaN, { kind: "notApplicable", why });
}

export type ZeroReference =
  | { readonly kind: "exactZero"; readonly how: string }
  | { readonly kind: "companionColumn"; readonly column: ColumnKey; readonly how: string }
  /**
   * A number the geometry of the room fixes, rather than a measurement.
   *
   * `noRunReadsBelow` is what the tile renders as a "greater than" sign in front of the value,
   * and it is a separate question from the kind. Two of these three really are floors: an empty
   * room still costs the robot the straight line to its goal, so no run can travel less far or
   * arrive sooner. The third is the coordinate zero of a clearance, where the two outlines touch
   * — a perfectly ordinary reading sits below it, because the outlines overlap. Rendering that
   * one as a floor put a "greater than zero" claim directly underneath a negative number, with
   * the phrase beside it explaining that negative numbers happen.
   */
  | { readonly kind: "geometricBound"; readonly how: string; readonly noRunReadsBelow: boolean }
  | { readonly kind: "notAPerturbation"; readonly how: string };

export interface ColumnDescriptor {
  readonly kind: "column";
  readonly key: ColumnKey;
  readonly label: string;
  readonly unit: UnitKey;
  readonly group: ColumnGroup;
  readonly needs: ColumnNeeds;
  readonly statistic: Statistic;
  readonly needsAnchor: boolean;
  readonly zero: ZeroReference;
  readonly assumption: (ctx: ReportContext) => string;
  readonly extract: (ctx: ReportContext) => Reading;
}

const NO_BAND = "The run-to-run band was not measured for this run, so there is nothing to report.";
const NO_FLOOR = "The detection floor was not measured for this run, so there is nothing to report.";
const NO_ZERO_RUN =
  "The reference run in which nobody responds to the robot was not measured for this run.";
const NO_FRECHET = "The longest-leash ruler was not switched on for this run.";
const NO_ROBOT = "This run has no robot in the treated arm, so there is nothing to measure.";
/**
 * Distinct from `NO_ROBOT`: the robot IS in this run, it just never left its own starting spot
 * (or nothing near it did), so `clearanceAfterBothMove` never got a pair to measure. Saying
 * "no robot" here would be false -- a robot that never moves is still a robot -- and this
 * project treats a reader-facing string that asserts something the simulator did not show as a
 * defect rather than a wording choice.
 */
const NEVER_BOTH_LEFT_START =
  "The robot is in this run, but a reading only starts once both the robot and a person have " +
  "left where they were standing, and that moment never came, so there is nothing to measure.";

/**
 * The paired estimator's own sentence is true only when the robot is the treatment.
 *
 * Under a shove treatment the robot is in both arms, and under the null treatment nothing differs
 * at all, so quoting "differ only in whether the robot is there" would be false on screen.
 */
function pairedAssumption(ctx: ReportContext): string {
  if (ctx.config.treatment.kind === "robot-presence") {
    return (
      "Both runs share a seed, a starting state and the same random wobble, and differ only in " +
      "whether the robot is there. Because nothing else can differ, the gap between a person's " +
      "two paths is the robot's effect on them and nothing is estimated."
    );
  }
  if (ctx.config.treatment.kind === "disturbance") {
    return (
      "Both runs share a seed, a starting state and the same random wobble, and the robot is in " +
      "both of them. They differ only in whether one scheduled shove happened, so the gap " +
      "between a person's two paths is the effect of that shove and of nothing else."
    );
  }
  return (
    "Both runs share a seed, a starting state and the same random wobble, and nothing was done " +
    "to either of them. Anything other than a flat zero here is the measurement moving, not the " +
    "room."
  );
}

function forecastAssumption(): string {
  return (
    "This does not identify the robot's effect. It guesses where each person was about to walk " +
    "from their own recent past, assuming they carry straight on, then reports how wrong the " +
    "guess was as if that were the robot's doing. The number contains every reason a person " +
    "might not walk in a straight line, all of which would be there with no robot in the room. " +
    "How far ahead it guesses and when it is checked decide how large it comes out, and neither " +
    "of those controls changes the room."
  );
}

export const COLUMNS: Readonly<Record<ColumnKey, ColumnDescriptor>> = Object.freeze({
  trueEffectM: Object.freeze({
    kind: "column" as const,
    key: "trueEffectM" as const,
    label: "How far the crowd was moved",
    unit: "metres" as const,
    group: "effect" as const,
    needs: "run" as const,
    statistic: "meanOverSteps" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "Switch off the setting that lets people notice the robot and this reads exactly zero, every time.",
    }),
    assumption: pairedAssumption,
    extract: (ctx: ReportContext): Reading => measured(paired(ctx.run.pair).value),
  }),

  worstMomentM: Object.freeze({
    kind: "column" as const,
    key: "worstMomentM" as const,
    label: "Worst moment",
    unit: "metres" as const,
    group: "effect" as const,
    needs: "run" as const,
    statistic: "maxOverSteps" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "companionColumn" as const,
      column: "worstMomentNullM" as const,
      how: "Two runs of this room with nothing done to either of them still drift apart, and this is the widest that drift ever gets.",
    }),
    assumption: pairedAssumption,
    extract: (ctx: ReportContext): Reading => measured(ctx.deviation.maxM),
  }),

  forecastReportM: Object.freeze({
    kind: "column" as const,
    key: "forecastReportM" as const,
    label: "What a forecaster would report",
    unit: "metres" as const,
    group: "forecast" as const,
    needs: "run" as const,
    statistic: "meanOverSteps" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "companionColumn" as const,
      column: "forecastZeroM" as const,
      how: "The same forecaster, on a run at these same settings in which nobody responded to the robot at all.",
    }),
    assumption: forecastAssumption,
    extract: (ctx: ReportContext): Reading =>
      measured(
        cvmResidual(ctx.run.pair, ctx.params.forecastHorizonSteps, ctx.params.forecastEndStep).value,
      ),
  }),

  forecastZeroM: Object.freeze({
    kind: "column" as const,
    key: "forecastZeroM" as const,
    label: "What the forecaster reports when the answer is zero",
    unit: "metres" as const,
    group: "forecast" as const,
    needs: "zeroRun" as const,
    statistic: "meanOverSteps" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "Nobody in this reference run responded to the robot, so the honest answer for it is zero and whatever appears here is the forecaster's own error.",
    }),
    assumption: forecastAssumption,
    extract: (ctx: ReportContext): Reading => {
      const zeroRun = ctx.zeroRun;
      if (zeroRun === null) {
        return notApplicable(NO_ZERO_RUN);
      }
      return measured(
        cvmResidual(zeroRun.pair, ctx.params.forecastHorizonSteps, ctx.params.forecastEndStep).value,
      );
    },
  }),

  runToRunBandM: Object.freeze({
    kind: "column" as const,
    key: "runToRunBandM" as const,
    label: "Ordinary difference between two runs",
    unit: "metres" as const,
    group: "null" as const,
    needs: "band" as const,
    statistic: "meanOverSteps" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "notAPerturbation" as const,
      how: "Nothing was done to any of the runs behind this number. It is the zero line itself, not a reading judged against one.",
    }),
    assumption: (): string =>
      "Several runs of this same room, all of them with no robot in them, paired against each " +
      "other. Whatever they differ by is what this room does on its own.",
    extract: (ctx: ReportContext): Reading => {
      const band = ctx.band;
      if (band === null) {
        return notApplicable(NO_BAND);
      }
      return measured(band.value);
    },
  }),

  worstMomentNullM: Object.freeze({
    kind: "column" as const,
    key: "worstMomentNullM" as const,
    label: "Widest ordinary difference between two runs",
    unit: "metres" as const,
    group: "null" as const,
    needs: "band" as const,
    statistic: "maxOverSteps" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "notAPerturbation" as const,
      how: "Nothing was done to any of the runs behind this number. It is the zero line for a worst-moment reading, not a reading itself.",
    }),
    assumption: (): string =>
      "The same robot-free runs the ordinary difference comes from, reduced the way the worst " +
      "moment is reduced: the widest the crowd ever drifted apart at any single instant.",
    extract: (ctx: ReportContext): Reading => {
      const band = ctx.band;
      if (band === null) {
        return notApplicable(NO_BAND);
      }
      return measured(band.peakValue);
    },
  }),

  detectionFloorM: Object.freeze({
    kind: "column" as const,
    key: "detectionFloorM" as const,
    label: "Smallest effect this crowd could resolve",
    unit: "metres" as const,
    group: "null" as const,
    needs: "floor" as const,
    statistic: "pathScalar" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "notAPerturbation" as const,
      how: "Both halves being compared come from the same robot-free crowd, so there is nothing to find and whatever appears is sampling noise.",
    }),
    assumption: (): string =>
      "Split one robot-free crowd into two random halves and ask how far apart the halves look. " +
      "It is a property of how many people were pooled, not of the room.",
    extract: (ctx: ReportContext): Reading => {
      const floor = ctx.floor;
      if (floor === null) {
        return notApplicable(NO_FLOOR);
      }
      return measured(floor.floor);
    },
  }),

  robotPathM: Object.freeze({
    kind: "column" as const,
    key: "robotPathM" as const,
    label: "How far the robot travelled",
    unit: "metres" as const,
    group: "cost" as const,
    needs: "run" as const,
    statistic: "pathScalar" as const,
    needsAnchor: false,
    zero: Object.freeze({
      kind: "geometricBound" as const,
      noRunReadsBelow: true,
      how: "An empty room still costs the robot the straight line from where it started to the edge of its goal, so no run can read below that.",
    }),
    assumption: (): string =>
      "The length of the line the robot actually walked. It is not a comparison with anything, " +
      "so the only thing it can be judged against is the shortest crossing that would count.",
    extract: (ctx: ReportContext): Reading => {
      const path = ctx.run.treated.robotPositions;
      if (path === null) {
        return notApplicable(NO_ROBOT);
      }
      return measured(pathLength(path));
    },
  }),

  robotArrivalS: Object.freeze({
    kind: "column" as const,
    key: "robotArrivalS" as const,
    label: "How long the robot took to arrive",
    unit: "seconds" as const,
    group: "cost" as const,
    needs: "run" as const,
    statistic: "pathScalar" as const,
    needsAnchor: false,
    zero: Object.freeze({
      kind: "geometricBound" as const,
      noRunReadsBelow: true,
      how: "The shortest crossing that counts as arriving, walked flat out at the robot's own speed limit, is the fastest this could possibly read.",
    }),
    assumption: (): string =>
      "The first moment the robot came inside the radius that counts as reaching its goal. A " +
      "robot that never got there is reported as not having arrived, never as a time.",
    extract: (ctx: ReportContext): Reading => {
      if (ctx.run.treated.robotPositions === null) {
        return notApplicable(NO_ROBOT);
      }
      const seconds = arrivalSecondsOf(ctx.run.treated, ctx.config.dt);
      if (Number.isNaN(seconds)) {
        return censored(
          "The robot never came inside its goal radius before the episode ended, so all that can " +
            "be said is that it took longer than the episode.",
        );
      }
      return measured(seconds);
    },
  }),

  extraPathM: Object.freeze({
    kind: "column" as const,
    key: "extraPathM" as const,
    label: "Extra distance the robot walked because of the treatment",
    unit: "metres" as const,
    group: "cost" as const,
    needs: "run" as const,
    statistic: "pathScalar" as const,
    // A metre alone means nothing (guardrail 7): the exact-zero reference alone does not carry
    // scale, so this also declares that it needs a body-scale anchor beside it, the same way the
    // effect columns do.
    needsAnchor: true,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "A treatment that changed nothing about the robot's route leaves this at exactly zero.",
    }),
    assumption: (): string =>
      "The difference between the robot's two routes. It exists only when the robot is in both " +
      "runs, because otherwise there is no second route to subtract.",
    extract: (ctx: ReportContext): Reading => {
      if (ctx.run.control.robotPositions === null) {
        return notApplicable(
          "The comparison run has no robot in it at all, so there is no second route to " +
            "subtract and no difference to report.",
        );
      }
      const cost = robotCost(ctx.run.treated, ctx.run.control);
      // Unreachable today: `robotCost` only returns a non-finite `extraPathM` when either arm's
      // robot is missing, the control-arm case is already caught above, and `runPair` always
      // puts a robot in the treated arm. Kept because `RobotCost.extraPathM` is typed to allow
      // it, and `NO_ROBOT` is still the true reason on the one remaining path that produces it
      // (the TREATED arm having no robot), unlike the near-miss/clearance case below.
      if (!Number.isFinite(cost.extraPathM)) {
        return notApplicable(NO_ROBOT);
      }
      return measured(cost.extraPathM);
    },
  }),

  pedestrianTimeLostS: Object.freeze({
    kind: "column" as const,
    key: "pedestrianTimeLostS" as const,
    label: "How much longer people took to settle",
    unit: "seconds" as const,
    group: "cost" as const,
    needs: "run" as const,
    statistic: "perAgent" as const,
    needsAnchor: false,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "If nobody was slowed or hurried, every person settles at the same instant in both runs and this reads exactly zero.",
    }),
    assumption: (): string =>
      "Each person is compared with themselves in the other run, and anyone who never settled " +
      "in one of the two runs is dropped and counted rather than averaged in as a zero.",
    extract: (ctx: ReportContext): Reading => {
      const lost = pedestrianTimeLost(ctx.run, ctx.config.dt);
      if (lost.nUsed === 0) {
        return censored(
          "Nobody in this run settled in both versions of the room, so there is nothing to " +
            "difference.",
        );
      }
      return measured(lost.meanS);
    },
  }),

  minClearanceM: Object.freeze({
    kind: "column" as const,
    key: "minClearanceM" as const,
    label: "Closest the robot came to anybody",
    unit: "metres" as const,
    group: "safety" as const,
    needs: "run" as const,
    statistic: "pathScalar" as const,
    needsAnchor: false,
    zero: Object.freeze({
      kind: "geometricBound" as const,
      noRunReadsBelow: false,
      how: "Zero means the two outlines just touched; below zero they overlapped, and above zero that is the gap between them.",
    }),
    assumption: (): string =>
      "Measured surface to surface, and only from the moment both the robot and that person have " +
      "left where they were standing. People are placed at the start without being told where " +
      "the robot is, so somebody standing on it before anyone moves is an artefact of the " +
      "placement rather than something the robot did.",
    extract: (ctx: ReportContext): Reading => {
      const path = ctx.run.treated.robotPositions;
      if (path === null) {
        return notApplicable(NO_ROBOT);
      }
      const gated = clearanceAfterBothMove(
        path,
        ctx.run.treated.positions,
        SIM_CONSTANTS.robotRadiusM,
        SIM_CONSTANTS.pedRadiusM,
        ctx.params.nearMissThresholdM,
      );
      if (Number.isNaN(gated.minM)) {
        return notApplicable(NEVER_BOTH_LEFT_START);
      }
      return measured(gated.minM);
    },
  }),

  nearMissEpisodes: Object.freeze({
    kind: "column" as const,
    key: "nearMissEpisodes" as const,
    label: "Separate occasions it came closer than the near-miss line",
    unit: "count" as const,
    group: "safety" as const,
    needs: "run" as const,
    statistic: "pathScalar" as const,
    needsAnchor: false,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "A robot that never came closer than the near-miss line reads exactly 0 occasions.",
    }),
    assumption: (): string =>
      "Occasions, not instants. Counting instants below the line would make the number grow " +
      "simply by simulating in finer steps, which is a property of the settings and not of the " +
      "room. A run where the robot and the crowd around it never both leave where they started " +
      "reports nothing rather than zero.",
    extract: (ctx: ReportContext): Reading => {
      const path = ctx.run.treated.robotPositions;
      if (path === null) {
        return notApplicable(NO_ROBOT);
      }
      const gated = clearanceAfterBothMove(
        path,
        ctx.run.treated.positions,
        SIM_CONSTANTS.robotRadiusM,
        SIM_CONSTANTS.pedRadiusM,
        ctx.params.nearMissThresholdM,
      );
      // A finite zero is the dangerous answer here: it averages happily and reads like a
      // measurement. Nothing to miss with is not the same as nothing missed.
      if (gated.nStepsMeasured === 0) {
        return notApplicable(NEVER_BOTH_LEFT_START);
      }
      return measured(gated.nearMissEpisodes);
    },
  }),

  recoveryS: Object.freeze({
    kind: "column" as const,
    key: "recoveryS" as const,
    label: "How long until the crowd was back inside tolerance",
    unit: "seconds" as const,
    group: "recovery" as const,
    needs: "run" as const,
    statistic: "pathScalar" as const,
    needsAnchor: false,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "A crowd that never left the tolerance in the first place is already back inside it, so this reads zero.",
    }),
    assumption: (): string =>
      "Recovered is a property of the tolerance that was chosen, not of the room. The tolerance " +
      "here is a share of this run's own worst moment, and an episode that ends before the crowd " +
      "comes back is reported as not having recovered rather than as a number.",
    extract: (ctx: ReportContext): Reading => {
      const tolerance = ctx.params.recoveryToleranceFraction * ctx.deviation.maxM;
      const result = recovery(
        ctx.deviation.series,
        ctx.deviation.maxAtStep,
        ctx.config.dt,
        tolerance,
        ctx.params.recoveryDwellSteps,
      );
      if (result.censored) {
        return censored(
          "The crowd had not come back inside the tolerance and stayed there before the episode " +
            "ended, so all that can be said is that it took longer than the run.",
        );
      }
      return measured(result.recoveryS);
    },
  }),

  frechetMeanM: Object.freeze({
    kind: "column" as const,
    key: "frechetMeanM" as const,
    label: "Shortest leash between a person's two paths",
    unit: "metres" as const,
    group: "otherRulers" as const,
    needs: "frechet" as const,
    statistic: "pathScalar" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "Two identical paths need no leash at all, so this reads exactly zero when nobody moved differently.",
    }),
    assumption: (): string =>
      "The shortest leash that would let somebody walk both of their paths at once without ever " +
      "going backwards. It notices a detour that ends where it started, which an average over " +
      "instants does not.",
    extract: (ctx: ReportContext): Reading => {
      const value = ctx.frechetMeanM;
      if (value === null) {
        return notApplicable(NO_FRECHET);
      }
      return measured(value);
    },
  }),
});

export const COLUMN_ORDER: readonly ColumnKey[] = Object.freeze([
  "trueEffectM",
  "forecastReportM",
  "runToRunBandM",
  "worstMomentM",
  "worstMomentNullM",
  "forecastZeroM",
  "detectionFloorM",
  "robotPathM",
  "robotArrivalS",
  "minClearanceM",
  "nearMissEpisodes",
  "extraPathM",
  "pedestrianTimeLostS",
  "recoveryS",
  "frechetMeanM",
] as const);

/**
 * The subset of COLUMN_ORDER that gets an always-visible tile.
 *
 * The design document names six headline readouts. This set has seven because "the robot's
 * crossing — distance and time to goal" are counted as one in the design, but the tile component
 * takes a single reading. Both robotPathM and robotArrivalS already carry their own
 * zero-reference, so rendering them as two tiles is the mechanically honest form: it changes
 * nothing a reader sees but makes the measurement contract exact.
 */
export const HEADLINE_COLUMNS: readonly ColumnKey[] = Object.freeze([
  "trueEffectM",
  "forecastReportM",
  "runToRunBandM",
  "worstMomentM",
  "robotPathM",
  "robotArrivalS",
  "minClearanceM",
] as const);
