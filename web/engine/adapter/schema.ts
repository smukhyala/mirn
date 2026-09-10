/**
 * The shape of a run set read in from another simulator.
 *
 * One document per RUN SET rather than per run, so the pairing metadata cannot be separated from
 * the data it describes. Loose per-run files are how a control arm ends up matched to the wrong
 * treated arm, and nothing downstream could detect it.
 *
 * `FORMAT_VERSION` is refused if it is anything else. A format that will be renegotiated needs a
 * version before its first byte, not after the first disagreement.
 */
export const FORMAT_VERSION = 1;

/**
 * What a run is FOR.
 *
 * `treated` and `control` are the pair. The other three exist so the format itself asks for the
 * numbers guardrail 6 requires: `zeroTreated` and `zeroControl` are a pair in which nobody responds
 * to the robot, so the honest answer is exactly nothing; `replicate` runs are robot-absent runs
 * differing only in exogenous noise, which is what a run-to-run band is measured from.
 *
 * When they are absent, the columns that need them report that they were not measured. They are
 * never inferred, and no floor is invented in their place.
 */
export type RunRole = "treated" | "control" | "zeroTreated" | "zeroControl" | "replicate";

export const RUN_ROLES: readonly RunRole[] = Object.freeze([
  "treated", "control", "zeroTreated", "zeroControl", "replicate",
]);

export interface Scenario {
  readonly kind: "scenario";
  readonly scenarioId: string;
  readonly widthM: number;
  readonly heightM: number;
  readonly dt: number;
  readonly nSteps: number;
}

/** Who made this, in enough detail that a results file can say so. */
export interface Provenance {
  readonly kind: "provenance";
  readonly producer: string;
  readonly producerVersion: string;
  readonly simulator: string;
  readonly crowdModel: string;
  readonly build: string;
}

/** Renamed on the way in: the file says `pedestrianRadiusM`, the engine says `pedRadiusM`. */
export interface SuppliedBodies {
  readonly kind: "suppliedBodies";
  readonly pedRadiusM: number;
  readonly robotRadiusM: number;
}

/**
 * Why a run stopped.
 *
 * `atSample` is the sample INDEX at which the robot is first recorded at its goal — not a tick, and
 * that distinction is the entire reason for the name. MIRN's own simulator records an
 * `arrivedTick`, and `run.ts`'s own comment on that field says the recorded sample for that moment
 * is `arrivedTick + 1`: a tick and a sample index are off by one, because `stepWorld` sets the tick
 * after moving the robot on it, and the position that motion produced lands in the *next* sample.
 * A field called `atStep` invites a later task to assign `arrivedTick = atStep` directly, which
 * would shift every adapted arrival time by one sample against the simulator's own. Calling it
 * `atSample` and defining it as a sample index removes that ambiguity outright: it is what an
 * external producer naturally reports (a position in its own recorded array, not a tick in an
 * internal loop it never ran), and the tick conversion — `arrivedTick = atSample - 1` — is a later
 * task's job, done once, in one place, rather than assumed here.
 */
export interface Completion {
  readonly kind: "completion";
  readonly outcome: string;
  readonly atSample: number;
}

export interface SuppliedPathRecord {
  readonly kind: "suppliedPathRecord";
  /** Flat [x0,y0,x1,y1,...], exactly as `Trajectory.positions` is laid out. */
  readonly positions: Float64Array;
  readonly nSteps: number;
}

export interface SuppliedAgent {
  readonly kind: "suppliedAgent";
  /** The producer's own identifier. Never reaches a `Trajectory`; see `identity.ts`. */
  readonly id: string;
  readonly path: SuppliedPathRecord;
}

export interface RunRecord {
  readonly kind: "runRecord";
  readonly runId: string;
  readonly role: RunRole;
  readonly seed: number;
  readonly robotPresent: boolean;
  readonly completion: Completion | null;
  readonly robot: SuppliedPathRecord | null;
  readonly agents: readonly SuppliedAgent[];
}

export interface RunSet {
  readonly kind: "runSet";
  readonly scenario: Scenario;
  readonly provenance: Provenance;
  readonly bodies: SuppliedBodies;
  readonly treatment: { readonly kind: "robot-presence" } | { readonly kind: "none" };
  readonly runs: readonly RunRecord[];
}
