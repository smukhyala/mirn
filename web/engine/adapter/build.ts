import { makePairedRun, type PairedRun } from "../contracts/pairedRun.js";
import { makeScene, type Scene } from "../contracts/scene.js";
import { makeTrajectory, type Trajectory } from "../contracts/trajectory.js";
import { fail } from "../core/errors.js";
import type { Bodies, MeasuredRun } from "../job/report.js";
import type { ArmResult } from "../sim/run.js";
import { identityFor, type IdentityMap } from "./identity.js";
import { reconcileInitial, requireSameLength, type Reconciliation } from "./reconcile.js";
import type { Provenance, RunRecord, RunRole, RunSet } from "./schema.js";

/**
 * A run set, assembled into the shapes the measurement layer already speaks.
 *
 * Nothing here computes a reading. It maps names, checks the invariants a pair rests on, and hands
 * back a `MeasuredRun` — the same record `runPair` produces, minus a `RunConfig` it never had. The
 * rulers downstream are then exactly the ones this bench already ships, which is the point: a run
 * from somewhere else is measured with the same arithmetic, or the comparison means nothing.
 */

export interface AdaptedRunSet {
  readonly kind: "adaptedRunSet";
  readonly run: MeasuredRun;
  /** The pair in which nobody responded to the robot, if the run set carried one. */
  readonly zeroRun: MeasuredRun | null;
  /** Robot-absent runs differing only in noise, for a run-to-run band. Empty if none were given. */
  readonly replicates: readonly (readonly Float64Array[])[];
  readonly bodies: Bodies;
  readonly dt: number;
  readonly straightLineM: number;
  /**
   * `straightLineM`, converted into a bound on the shortest time the crossing could have taken.
   * See `straightLineArrivalFrom` below for how — and, more importantly, for why it cannot be
   * computed the way MIRN's own runs compute it.
   */
  readonly straightLineArrivalS: number;
  readonly reconciliation: Reconciliation;
  readonly provenance: Provenance;
}

function only(set: RunSet, role: RunRole): RunRecord | null {
  let found: RunRecord | null = null;
  for (const run of set.runs) {
    if (run.role === role) {
      if (found !== null) {
        fail(`this run set carries two runs playing the part '${role}', and it may carry one`);
      }
      found = run;
    }
  }
  return found;
}

/**
 * Named `requireRole`, not `require` — the obvious short name shadows a well-known name in a JS
 * module, and shadowing it here would read as a mistake to anyone who has ever used one.
 */
function requireRole(set: RunSet, role: RunRole): RunRecord {
  const found = only(set, role);
  if (found === null) {
    fail(`this run set carries no run playing the part '${role}', so there is no pair in it`);
  }
  return found;
}

/** Paths in uid order, which is what `ArmResult.positions` means. */
function pathsInUidOrder(record: RunRecord, identity: IdentityMap): Float64Array[] {
  const byUid = new Map<number, Float64Array>();
  for (const agent of record.agents) {
    byUid.set(identity.agentUidOf(agent.id), agent.path.positions);
  }
  const paths: Float64Array[] = [];
  for (let uid = 0; uid < identity.orderedIds.length; uid++) {
    const path = byUid.get(uid);
    if (path === undefined) {
      fail(
        `the run '${record.runId}' is missing somebody the other run has, so the two runs are not ` +
          `the same room`,
      );
    }
    paths.push(path);
  }
  return paths;
}

/**
 * Converts the run set's own completion record — a sample INDEX, per `Completion.atSample`'s
 * comment in `schema.ts` — into the tick this bench's `ArmResult.arrivedTick` carries.
 *
 * `ArmResult.arrivedTick`'s own comment (in `sim/run.ts`) says the recorded sample for an arrival
 * on tick T is T + 1, because `stepWorld` sets the tick after moving the robot on it and that
 * motion's result lands in the NEXT sample. So the inverse is `arrivedTick = atSample - 1`, not
 * `atSample` itself — assigning the sample index straight to the tick would shift every adapted
 * arrival time by one sample against the simulator's own convention, silently, since both are
 * plain numbers and nothing would complain.
 *
 * `parse.ts` already refuses a negative or non-whole `atSample`, so `atSample - 1` cannot fall
 * below -1 in practice. The check below is kept anyway: `arrivedTick` is a tick or the sentinel
 * -1 and nothing else, by convention throughout this codebase, and a function that produces one
 * should say so itself rather than lean on a guarantee made three files away that could change
 * without this one noticing.
 */
function arrivedTickOf(record: RunRecord): number {
  if (record.completion === null) {
    return -1;
  }
  const arrivedTick = record.completion.atSample - 1;
  if (arrivedTick < -1) {
    fail(
      `the run '${record.runId}' reports a finishing sample too early to correspond to any tick, ` +
        `so its completion cannot be trusted`,
    );
  }
  return arrivedTick;
}

function armFrom(
  record: RunRecord,
  identity: IdentityMap,
  dt: number,
  producer: string,
  paths: readonly Float64Array[],
): ArmResult {
  const pedestrians: Trajectory[] = [];
  for (let uid = 0; uid < identity.orderedIds.length; uid++) {
    pedestrians.push(
      makeTrajectory({
        agentId: identity.agentIdOf(identity.orderedIds[uid] as string),
        agentUid: uid,
        positions: paths[uid] as Float64Array,
        t0: 0,
        dt,
      }),
    );
  }

  let robotTrajectory: Trajectory | null = null;
  let robotPositions: Float64Array | null = null;
  if (record.robot !== null) {
    robotPositions = record.robot.positions;
    robotTrajectory = makeTrajectory({
      agentId: "robot",
      agentUid: -1,
      positions: robotPositions,
      t0: 0,
      dt,
    });
  }

  const scene: Scene = makeScene({
    sceneId: record.runId,
    pedestrians,
    robot: robotTrajectory,
    robotPresent: record.robotPresent,
    // The hole `Scene.source` was always for. Anything carrying results names what produced them.
    source: producer,
    seed: record.seed,
  });

  return { scene, positions: paths, robotPositions, arrivedTick: arrivedTickOf(record) };
}

function pairFrom(
  set: RunSet,
  treatedRecord: RunRecord,
  controlRecord: RunRecord,
  identity: IdentityMap,
): { run: MeasuredRun; reconciliation: Reconciliation } {
  const treatedPaths = pathsInUidOrder(treatedRecord, identity);
  const controlPaths = pathsInUidOrder(controlRecord, identity);

  for (let uid = 0; uid < treatedPaths.length; uid++) {
    requireSameLength(
      (treatedPaths[uid] as Float64Array).length / 2,
      (controlPaths[uid] as Float64Array).length / 2,
    );
  }
  const reconciliation = reconcileInitial(treatedPaths, controlPaths);

  const producer = set.provenance.producer;
  const treated = armFrom(treatedRecord, identity, set.scenario.dt, producer, treatedPaths);
  const control = armFrom(controlRecord, identity, set.scenario.dt, producer, controlPaths);
  const pair: PairedRun = makePairedRun({
    treated: treated.scene,
    control: control.scene,
    treatment: set.treatment,
  });

  return { run: { pair, treated, control }, reconciliation };
}

/**
 * `straightLineM` walked at the fastest speed this robot's own path was ever recorded moving, one
 * step at a time.
 *
 * MIRN's own runs answer "how long would this crossing take at full throttle" by dividing
 * `straightLineM` by `config.robot.maxSpeed` — a speed LIMIT read off the simulator's own
 * configuration, which an adapted run has no access to: a run set carries positions, not a robot's
 * capabilities. What it does carry is what the robot actually did, so this bound is built from
 * different material and says a narrower thing than the simulator's own field of the same name in
 * `ReportContext` — not "as fast as this robot's speed limit allows" but "as fast as this journey
 * could have been done at the fastest this robot was actually seen to move". It is a bound of a
 * different provenance from the simulator's, and reusing the simulator's field name for it is
 * acceptable only because that difference is written down here, once, where the value is made.
 *
 * A robot that never moved, or a run with no robot at all, has no observed speed to divide by.
 * Dividing by zero would produce `Infinity`, and this codebase reserves `NaN` — never `Infinity`
 * — for "not measured" (`makeReading` enforces the NaN half of that rule elsewhere). Neither is
 * the right answer here regardless: `straightLineM` is also exactly 0 in both of those cases (see
 * `buildAdapted` below), so reporting 0 for the arrival bound keeps the two fields in the
 * agreement a reader would expect — no journey, no bound on how fast it could have gone.
 */
function straightLineArrivalFrom(
  straightLineM: number,
  robotPath: Float64Array | null,
  dt: number,
): number {
  if (robotPath === null) {
    return 0;
  }
  const nSamples = robotPath.length / 2;
  let fastestSpeed = 0;
  for (let sample = 1; sample < nSamples; sample++) {
    const dx = (robotPath[2 * sample] as number) - (robotPath[2 * sample - 2] as number);
    const dy = (robotPath[2 * sample + 1] as number) - (robotPath[2 * sample - 1] as number);
    const stepSpeed = Math.sqrt(dx * dx + dy * dy) / dt;
    if (stepSpeed > fastestSpeed) {
      fastestSpeed = stepSpeed;
    }
  }
  if (fastestSpeed === 0) {
    return 0;
  }
  return straightLineM / fastestSpeed;
}

export function buildAdapted(set: RunSet): AdaptedRunSet {
  const treatedRecord = requireRole(set, "treated");
  const controlRecord = requireRole(set, "control");

  const externalIds: string[] = [];
  for (const agent of treatedRecord.agents) {
    externalIds.push(agent.id);
  }
  const identity = identityFor(externalIds);

  const built = pairFrom(set, treatedRecord, controlRecord, identity);

  let zeroRun: MeasuredRun | null = null;
  const zeroTreated = only(set, "zeroTreated");
  const zeroControl = only(set, "zeroControl");
  if (zeroTreated !== null && zeroControl !== null) {
    zeroRun = pairFrom(set, zeroTreated, zeroControl, identity).run;
  } else if (zeroTreated !== null || zeroControl !== null) {
    fail(
      "this run set carries one half of the pair in which nobody responds to the robot, and that " +
        "pair is only a reference if both halves of it are here",
    );
  }

  const replicates: (readonly Float64Array[])[] = [];
  for (const record of set.runs) {
    if (record.role === "replicate") {
      replicates.push(pathsInUidOrder(record, identity));
    }
  }

  // The shortest crossing the robot could have made, used to give its journey a scale. Read off the
  // robot's own first and last recorded positions, because a run set carries no goal.
  let straightLineM = 0;
  const robotPath = built.run.treated.robotPositions;
  if (robotPath !== null) {
    const lastX = robotPath[robotPath.length - 2] as number;
    const lastY = robotPath[robotPath.length - 1] as number;
    const dx = lastX - (robotPath[0] as number);
    const dy = lastY - (robotPath[1] as number);
    straightLineM = Math.sqrt(dx * dx + dy * dy);
  }
  const straightLineArrivalS = straightLineArrivalFrom(straightLineM, robotPath, set.scenario.dt);

  return Object.freeze({
    kind: "adaptedRunSet" as const,
    run: built.run,
    zeroRun,
    replicates: Object.freeze(replicates),
    bodies: Object.freeze({
      kind: "bodies" as const,
      robotRadiusM: set.bodies.robotRadiusM,
      pedRadiusM: set.bodies.pedRadiusM,
    }),
    dt: set.scenario.dt,
    straightLineM,
    straightLineArrivalS,
    reconciliation: built.reconciliation,
    provenance: set.provenance,
  });
}
