import type { PairedRun } from "../contracts/pairedRun.js";
import { pairedAgents } from "../contracts/pairedRun.js";
import { fail } from "../core/errors.js";
import { deviation, type Deviation } from "../measure/metrics.js";
import type { RunToRunBand } from "../measure/null/band.js";
import type { SplitHalfNull } from "../measure/null/splitHalf.js";
import type { ArmResult } from "../sim/run.js";
import { COLUMNS, type ColumnKey, type Reading } from "./columns.js";

/**
 * The measurement report layer.
 *
 * Nothing here computes a divergence or a quantile from raw positions: those live in
 * `web/engine/measure/`, which has a Python oracle. This file joins, gates and packages, and it
 * has no oracle and must not acquire one.
 *
 * `deviation` is the one deliberate exception to "no runtime import from `measure/`": every column
 * extractor is handed a `ReportContext`, and that record's `deviation` field has to be an already
 * computed `Deviation`, not a recipe for making one — `buildContext` is the single place that
 * calls it, once per run, so no other file in `job/` ever needs to. `RunToRunBand` and
 * `SplitHalfNull` stay type-only, same as `Deviation` did before this file needed a real value
 * instead of just its shape.
 */

/**
 * Per-agent displacement keyed by the uid the position buffers are keyed by.
 *
 * `deviation().perAgentM[i]` belongs to `pairedAgents(pair)[i]`, which is ordered by string-sorted
 * agent id — ped0, ped1, ped10, ped2. `ArmResult.positions[i]` is ordered by uid. Joining those
 * two arrays positionally silently rebinds every person from the eleventh onwards to a stranger,
 * and it shipped once. This is the only supported way to ask what one person's displacement was.
 */
export function perAgentDeviationByUid(pair: PairedRun, dev: Deviation): ReadonlyMap<number, number> {
  const agents = pairedAgents(pair);
  if (dev.perAgentM.length !== agents.length) {
    fail(
      `perAgentDeviationByUid was given ${dev.perAgentM.length} per-agent values for ` +
        `${agents.length} paired agents; they must come from the same pair`,
    );
  }
  const byUid = new Map<number, number>();
  for (let i = 0; i < agents.length; i++) {
    const entry = agents[i] as readonly [{ agentUid: number }, { agentUid: number }];
    const uid = entry[0].agentUid;
    const value = dev.perAgentM[i] as number;
    byUid.set(uid, value);
  }
  return byUid;
}

export interface PedestrianTimeLost {
  readonly meanS: number;
  readonly nUsed: number;
  readonly nAgents: number;
}

/**
 * How much longer each person took to settle with the robot in the room than without it.
 *
 * This is the ONE legitimate positional join in the codebase: `treated.positions[i]` and
 * `control.positions[i]` are both uid-ordered by `runArm`, so index i is the same person in both.
 * It is legitimate because neither side came from `pairedAgents`. Nothing else may join by index.
 *
 * A person who never settles in either arm is dropped and counted, never averaged as a zero.
 */
export function pedestrianTimeLost(r: MeasuredRun, dt: number): PedestrianTimeLost {
  const nAgents = r.treated.positions.length;
  let nUsed = 0;
  let total = 0;
  for (let i = 0; i < nAgents; i++) {
    const treatedPath = r.treated.positions[i] as Float64Array;
    const controlPath = r.control.positions[i] as Float64Array;
    const treatedSettled = settledStep(treatedPath);
    const controlSettled = settledStep(controlPath);
    if (treatedSettled >= 0 && controlSettled >= 0) {
      nUsed++;
      total += (treatedSettled - controlSettled) * dt;
    }
  }
  let meanS = Number.NaN;
  if (nUsed > 0) {
    meanS = total / nUsed;
  }
  return { meanS, nUsed, nAgents };
}

/**
 * First step after which a pedestrian never moves again. -1 if they never settle.
 *
 * The 1e-9 tolerance here is deliberately not `metrics.ts`'s 1e-4, and the difference is
 * physical, not stylistic. A pedestrian who has arrived is frozen exactly: `stepWorld` zeroes
 * their velocity and skips their position update, so two consecutive samples are bit-identical.
 * The robot is never frozen this way — its planner can return `(0, 0)`, but `applyCommand`
 * integrates that through a first-order lag, so the robot's velocity decays geometrically toward
 * zero and its per-step displacement keeps shrinking without ever hitting it. A tolerance loose
 * enough to call that "settled" would call every long-idle robot tick settled too.
 */
function settledStep(path: Float64Array): number {
  const nSteps = path.length / 2;
  for (let s = 1; s < nSteps; s++) {
    const dx = (path[2 * s] as number) - (path[2 * s - 2] as number);
    const dy = (path[2 * s + 1] as number) - (path[2 * s - 1] as number);
    if (Math.sqrt(dx * dx + dy * dy) < 1e-9) {
      return s;
    }
  }
  return -1;
}

/** How the ruler was set. Task 15's `spec.ts` re-exports this and validates it. */
export interface MeasurementParams {
  readonly kind: "measurementParams";
  /** Default 60 steps, which is 3.00 s. Not 16: at 16 the forecaster reads below the band. */
  readonly forecastHorizonSteps: number;
  /** Required, never defaulted. With no end step the forecaster reads exactly 0 on this crowd. */
  readonly forecastEndStep: number;
  readonly nearMissThresholdM: number;
  readonly recoveryToleranceFraction: number;
  readonly recoveryDwellSteps: number;
}

/** First step at which a path is further than `thresholdM` from where it began. -1 if never. */
export function startedMovingStep(path: Float64Array, thresholdM: number): number {
  const nSteps = path.length / 2;
  const x0 = path[0] as number;
  const y0 = path[1] as number;
  for (let s = 0; s < nSteps; s++) {
    const dx = (path[2 * s] as number) - x0;
    const dy = (path[2 * s + 1] as number) - y0;
    if (Math.sqrt(dx * dx + dy * dy) > thresholdM) {
      return s;
    }
  }
  return -1;
}

export interface GatedClearance {
  readonly kind: "gatedClearance";
  readonly minM: number;
  readonly minAtStep: number;
  readonly nearMissEpisodes: number;
  readonly thresholdM: number;
  /** Earliest step any robot-person pair qualified. -1 if none ever did. */
  readonly firstMeasuredStep: number;
  readonly nStepsMeasured: number;
}

/**
 * Surface-to-surface gap between the robot and the nearest person, measured only from the moment
 * both of them have left where they were standing.
 *
 * "Has left" means further than its own body radius from its step-0 position. Before that a
 * pedestrian who spawned on the robot's start tile reports a gap of -0.55 m at step 0, which is
 * an artifact of where the crowd is placed and not something the robot did.
 *
 * Episodes rather than ticks, matching `clearance()`: counting ticks below a threshold makes the
 * safety number scale with 1/dt. A step where no pair yet qualifies breaks an episode.
 */
export function clearanceAfterBothMove(
  robotPath: Float64Array | null,
  pedestrianPaths: readonly Float64Array[],
  robotRadiusM: number,
  pedRadiusM: number,
  thresholdM: number,
): GatedClearance {
  const empty: GatedClearance = {
    kind: "gatedClearance",
    minM: Number.NaN,
    minAtStep: -1,
    nearMissEpisodes: 0,
    thresholdM,
    firstMeasuredStep: -1,
    nStepsMeasured: 0,
  };
  if (robotPath === null) {
    return empty;
  }
  const robotStart = startedMovingStep(robotPath, robotRadiusM);
  if (robotStart < 0) {
    return empty;
  }

  const gateOf: number[] = [];
  for (const path of pedestrianPaths) {
    const pedStart = startedMovingStep(path, pedRadiusM);
    if (pedStart < 0) {
      gateOf.push(-1);
    } else if (pedStart > robotStart) {
      gateOf.push(pedStart);
    } else {
      gateOf.push(robotStart);
    }
  }

  const nSteps = robotPath.length / 2;
  const contactRadius = robotRadiusM + pedRadiusM;
  let minM = Number.POSITIVE_INFINITY;
  let minAtStep = -1;
  let firstMeasuredStep = -1;
  let nStepsMeasured = 0;
  let episodes = 0;
  let inside = false;

  for (let s = 0; s < nSteps; s++) {
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pedestrianPaths.length; i++) {
      const gate = gateOf[i] as number;
      if (gate < 0 || s < gate) {
        continue;
      }
      const path = pedestrianPaths[i] as Float64Array;
      const dx = (path[2 * s] as number) - (robotPath[2 * s] as number);
      const dy = (path[2 * s + 1] as number) - (robotPath[2 * s + 1] as number);
      const gap = Math.sqrt(dx * dx + dy * dy) - contactRadius;
      if (gap < closest) {
        closest = gap;
      }
    }
    if (closest === Number.POSITIVE_INFINITY) {
      inside = false;
      continue;
    }
    nStepsMeasured++;
    if (firstMeasuredStep < 0) {
      firstMeasuredStep = s;
    }
    if (closest < minM) {
      minM = closest;
      minAtStep = s;
    }
    if (closest < thresholdM) {
      if (!inside) {
        episodes++;
        inside = true;
      }
    } else {
      inside = false;
    }
  }

  if (nStepsMeasured === 0) {
    return empty;
  }
  return {
    kind: "gatedClearance",
    minM,
    minAtStep,
    nearMissEpisodes: episodes,
    thresholdM,
    firstMeasuredStep,
    nStepsMeasured,
  };
}

/**
 * When the robot got there, in seconds, or NaN if it never did.
 *
 * `arrivedTick` is set after the robot moves on that tick, and that position is recorded as
 * sample `arrivedTick + 1`, so the arrival second is `(arrivedTick + 1) * dt`. Non-arrival is NaN
 * here and is rendered as censored by the column, never as a number and never as zero.
 */
export function arrivalSecondsOf(arm: ArmResult, dt: number): number {
  if (arm.arrivedTick < 0) {
    return Number.NaN;
  }
  return (arm.arrivedTick + 1) * dt;
}

/** How big the bodies are that a clearance is measured between, surface to surface. */
export interface Bodies {
  readonly kind: "bodies";
  readonly robotRadiusM: number;
  readonly pedRadiusM: number;
}

/**
 * A run that has been measured, whoever produced it.
 *
 * `RunResult` is structurally assignable to this, so `runPair`'s output needs no conversion. What
 * this leaves out is the point: no `RunConfig`, so nothing downstream can read a setting that only
 * MIRN's own simulator has.
 *
 * DELIBERATELY CARRIES NO `kind` FIELD. Every other record in this codebase does — see the
 * TypeScript conventions in CLAUDE.md — but `RunResult.kind` is `"runResult"`, and giving this
 * interface its own `kind` literal would break the very structural assignability the paragraph
 * above depends on: `web/engine/adapter/build.ts`'s `buildAdapted` hands back a plain
 * `{ pair, treated, control }` with no `kind` at all, and `runPair`'s `RunResult` flows into
 * `buildContext` unchanged only because neither shape is required to match a discriminant this one
 * doesn't have. Do not "fix" this by adding one.
 */
export interface MeasuredRun {
  readonly pair: PairedRun;
  readonly treated: ArmResult;
  readonly control: ArmResult;
}

/** Everything a column extractor is allowed to look at. Built once per run, never per column. */
export interface ReportContext {
  readonly kind: "reportContext";
  readonly dt: number;
  readonly bodies: Bodies;
  readonly params: MeasurementParams;
  readonly run: MeasuredRun;
  readonly deviation: Deviation;
  readonly band: RunToRunBand | null;
  readonly floor: SplitHalfNull | null;
  readonly zeroRun: MeasuredRun | null;
  readonly frechetMeanM: number | null;
  /**
   * The shortest crossing that counts as arriving: straight-line start-to-goal minus the goal
   * radius the robot stops inside. 16.90 m at the default config, where start and goal are
   * 18.00 m apart and the robot stops within 1.1 m. It is a bound, and the tile says so.
   */
  readonly straightLineM: number;
  /** `straightLineM` walked flat out at the robot's own speed limit. See `SimContextInit`. */
  readonly straightLineArrivalS: number;
}

export interface BuildContextInit {
  readonly dt: number;
  readonly bodies: Bodies;
  readonly straightLineM: number;
  readonly straightLineArrivalS: number;
  readonly params: MeasurementParams;
  readonly run: MeasuredRun;
  readonly band: RunToRunBand | null;
  readonly floor: SplitHalfNull | null;
  readonly zeroRun: MeasuredRun | null;
  readonly frechetMeanM: number | null;
}

export function buildContext(init: BuildContextInit): ReportContext {
  return Object.freeze({
    kind: "reportContext" as const,
    dt: init.dt,
    bodies: init.bodies,
    params: init.params,
    run: init.run,
    deviation: deviation(init.run.pair),
    band: init.band,
    floor: init.floor,
    zeroRun: init.zeroRun,
    frechetMeanM: init.frechetMeanM,
    straightLineM: init.straightLineM,
    straightLineArrivalS: init.straightLineArrivalS,
  });
}

/**
 * Every requested column, extracted from one context.
 *
 * The context is built once per run and the extractors only read it, so ordering the keys
 * differently cannot change a number. `runReport` re-checks the NaN rule on the way out: a
 * descriptor that returns a finite value alongside a censored availability would otherwise be
 * averaged as though it were a measurement.
 */
export function runReport(
  ctx: ReportContext,
  keys: readonly ColumnKey[],
): Readonly<Partial<Record<ColumnKey, Reading>>> {
  const report: Partial<Record<ColumnKey, Reading>> = {};
  for (const key of keys) {
    const column = COLUMNS[key];
    if (column === undefined) {
      fail(`'${String(key)}' is not a column; the catalogue in columns.ts is closed`);
    }
    const reading = column.extract(ctx);
    const isMeasured = reading.availability.kind === "measured";
    if (isMeasured === Number.isNaN(reading.value)) {
      fail(
        `column '${key}' returned a ${reading.availability.kind} reading whose value is ` +
          `${reading.value}; a value is NaN if and only if it was not measured`,
      );
    }
    report[key] = reading;
  }
  return Object.freeze(report);
}
