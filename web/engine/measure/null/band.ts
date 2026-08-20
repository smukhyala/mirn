import { makeRunConfig, type RunConfig } from "../../contracts/config.js";
import { runPair } from "../../sim/run.js";
import { quantileLinear } from "../kernels.js";
import { paired } from "../estimator/index.js";

/**
 * The run-to-run band: how far apart two undisturbed runs of the same world are, when nothing was
 * done to either of them.
 *
 * This replaces the demo's `floorEst = floorEst * 0.985 + gap * 0.015` — an exponential moving
 * average of the phantom gap, with no null hypothesis behind it at all. Here the null is
 * constructed: re-run the CONTROL configuration with different exogenous noise and no
 * intervention, pair the replicates against each other, and take the 95th percentile of what the
 * same measurement reports when there is definitely nothing to find.
 *
 * A deliberate naming note. Python's `split_half_null` pools pedestrian positions and splits the
 * POPULATION in half, answering "how much does this divergence report between two halves of one
 * crowd". This answers "how much do two runs of the same world differ when nothing was done to
 * them". They are different nulls, so they get different names and are never divided by one
 * another. `mdp_95` stays reserved for the Python quantity.
 */
export interface RunToRunBand {
  readonly kind: "runToRunBand";
  readonly nReplicates: number;
  readonly nPairs: number;
  readonly quantile: number;
  readonly value: number;
  readonly samples: Float64Array;
}

/**
 * `nReplicates` defaults to 8, giving 28 pairs. Six gave 15, and the 95th percentile of 15 samples
 * is the 14.3rd order statistic — unstable enough that the band visibly jittered between runs of
 * the same configuration, which is not a property you want in the line every other number is
 * judged against.
 */
export function replicateBand(config: RunConfig, nReplicates = 8): RunToRunBand {
  if (!Number.isInteger(nReplicates) || nReplicates < 2) {
    throw new Error(`replicateBand needs at least 2 replicates, got ${nReplicates}`);
  }

  // Every replicate is a ROBOT-ABSENT run. This matters and the first version got it wrong: using
  // `treatment: none` leaves the robot in both arms, so the robot's own chaotic amplification was
  // being folded into the "nothing happened" null. The tell was that `repulsionScale` moved the
  // band at all — a quantity that is supposed to describe the measurement's wobble in a room with
  // no robot in it was responding to how much space the robot demanded.
  const runs: (readonly Float64Array[])[] = [];
  for (let replicate = 1; replicate <= nReplicates; replicate++) {
    const replicateConfig = makeRunConfig({
      ...config,
      replicate,
      treatment: { kind: "robot-presence" },
    });
    // The control arm of a robot-presence pair is the robot-absent world.
    runs.push(runPair(replicateConfig).control.positions);
  }

  const values: number[] = [];
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      values.push(meanPathDistance(runs[i] as readonly Float64Array[], runs[j] as readonly Float64Array[]));
    }
  }

  const samples = Float64Array.from(values);
  const sorted = Float64Array.from(values).sort();
  return {
    kind: "runToRunBand",
    nReplicates,
    nPairs: values.length,
    quantile: 0.95,
    value: quantileLinear(sorted, 0.95),
    samples,
  };
}

function meanPathDistance(a: readonly Float64Array[], b: readonly Float64Array[]): number {
  const n = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const pathA = a[i] as Float64Array;
    const pathB = b[i] as Float64Array;
    const steps = pathA.length / 2;
    let agentTotal = 0;
    for (let s = 0; s < steps; s++) {
      const dx = (pathA[2 * s] as number) - (pathB[2 * s] as number);
      const dy = (pathA[2 * s + 1] as number) - (pathB[2 * s + 1] as number);
      agentTotal += Math.sqrt(dx * dx + dy * dy);
    }
    total += agentTotal / steps;
  }
  return n === 0 ? 0 : total / n;
}

export { paired };
