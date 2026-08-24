import { AXES } from "../../engine/job/axes.js";
import { configForCell, type SweepJob } from "../../engine/job/spec.js";

/**
 * What one press of Run will cost, in words, before it is pressed.
 *
 * `perRunMs` is a quadratic through three timings measured on this machine at nTicks=800: 38 ms
 * at 18 pedestrians, 92 at 44, 210 at 80. It is quadratic because the social-force step is
 * pairwise, and a linear fit under-reports a big room by a factor of two.
 *
 * This is an estimate and says so. It over-charges the run-to-run band slightly — its replicates
 * are single arms and come in about 14% under a full paired run — which is the direction an
 * estimate shown before a wait should err in.
 */

export const FRECHET_MS = 117;
export const FLOOR_MS = 1500;
/** All six cheap composers together, measured against a 38 ms paired run. */
export const CHEAP_COLUMNS_MS = 3.4;

export function perRunMs(nPedestrians: number): number {
  const n = nPedestrians;
  return 15.9 + 0.876 * n + 0.01937 * n * n;
}

export function runsFor(job: SweepJob): number {
  return job.axisValues.length * job.seedIndices.length;
}

function isMeasurementAxis(job: SweepJob): boolean {
  if (job.axis === null) {
    return false;
  }
  return AXES[job.axis].kind === "measurementAxis";
}

export function estimateCostMs(job: SweepJob): number {
  const measurementOnly = isMeasurementAxis(job);
  let total = 0;

  for (let cellIndex = 0; cellIndex < job.axisValues.length; cellIndex++) {
    const firstSeed = job.seedIndices[0] ?? 0;
    const config = configForCell(job, cellIndex, firstSeed);
    const people = config.crowd.nPedestrians;
    const simulationMs = perRunMs(people);

    for (let s = 0; s < job.seedIndices.length; s++) {
      // A measurement axis re-applies the forecaster to a run that already exists; only the first
      // cell pays for the simulation. That is a correctness statement, not an optimisation: the
      // robot has not changed, so re-simulating would be wrong as well as slow.
      const simulates = !measurementOnly || cellIndex === 0;
      if (simulates) {
        total += simulationMs;
        if (job.zeroReferenceRun) {
          total += simulationMs;
        }
      }
      total += CHEAP_COLUMNS_MS;
      if (job.frechet) {
        total += FRECHET_MS;
      }
    }

    if (job.bandReplicates !== null && !measurementOnly) {
      const perBand = job.bandReplicates.n * simulationMs;
      if (job.bandReplicates.scope === "perCell") {
        total += perBand;
      } else {
        total += perBand * job.seedIndices.length;
      }
    }
    if (job.floor !== null) {
      total += FLOOR_MS;
    }
  }
  return total;
}

export function describeCost(job: SweepJob): string {
  const runs = runsFor(job);
  const seconds = estimateCostMs(job) / 1000;
  const shown = seconds < 10 ? seconds.toFixed(1) : seconds.toFixed(0);
  const noun = runs === 1 ? "run" : "runs";
  return `${runs} ${noun} — about ${shown} s`;
}
