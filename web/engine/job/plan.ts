import type { SweepJob } from "./spec.js";
import type { RunKey } from "./stats.js";

/**
 * One unit of work is one paired run, plus whatever extras that run has been asked to buy.
 *
 * The plan is computed up front so the progress rule has a real denominator rather than a guess,
 * and so the cost of switching the band on can be shown beside the switch before it is pressed.
 */
export interface Unit {
  readonly kind: "unit";
  readonly key: RunKey;
  readonly cellIndex: number;
  readonly needsBand: boolean;
  readonly needsFloor: boolean;
  readonly needsZeroRun: boolean;
  readonly needsFrechet: boolean;
}

export interface WorkPlan {
  readonly kind: "workPlan";
  readonly units: readonly Unit[];
  readonly unitsTotal: number;
}

export function planSweep(job: SweepJob): WorkPlan {
  const units: Unit[] = [];
  const firstSeedIndex = job.seedIndices[0] as number;
  for (let cellIndex = 0; cellIndex < job.axisValues.length; cellIndex++) {
    const axisValue = job.axisValues[cellIndex] as number;
    for (const seedIndex of job.seedIndices) {
      let needsBand = false;
      if (job.bandReplicates !== null) {
        // The band is measured per axis value, not once for the sweep. Crowd size genuinely moves
        // it, so one band drawn across a people-sweep is a false floor.
        if (job.bandReplicates.scope === "perSeed") {
          needsBand = true;
        } else {
          needsBand = seedIndex === firstSeedIndex;
        }
      }
      units.push(
        Object.freeze({
          kind: "unit" as const,
          key: Object.freeze({ axisIndex: cellIndex, axisValue, seedIndex }),
          cellIndex,
          needsBand,
          needsFloor: job.floor !== null,
          needsZeroRun: job.zeroReferenceRun,
          needsFrechet: job.frechet,
        }),
      );
    }
  }
  return Object.freeze({ kind: "workPlan" as const, units: Object.freeze(units), unitsTotal: units.length });
}
