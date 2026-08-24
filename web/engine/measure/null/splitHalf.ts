import { fail } from "../../core/errors.js";
import { adeBetweenClouds } from "../divergence/index.js";
import { quantileLinear } from "../kernels.js";

/**
 * The split-half null: the detection floor, ported from `src/mirn/calibration/null.py`.
 *
 * Pool every pedestrian in a crowd that carries no robot effect, split the POPULATION into two
 * random halves, and ask how far apart the two halves look as clouds of points. Both halves are
 * drawn from the same population, so whatever the divergence reports is the measurement's own
 * sampling noise — the number it would produce with no robot anywhere. Its upper edge is the
 * smallest effect the measurement could ever tell apart from that noise.
 *
 * This is a DIFFERENT quantity from `replicateBand`, and confusing the two is easy and costly.
 * The band asks "how far apart are two runs of the same room?" and is dominated by the crowd
 * being chaotic — it is large. This asks "how far apart are two samples of the same crowd?" and
 * is dominated by sample size — it is small. An effect is judged against this one; the band
 * teaches a separate lesson about how much a room varies from one morning to the next.
 *
 * The permutation is INJECTABLE rather than drawn internally. numpy's PCG64 cannot be reproduced
 * in JavaScript without reimplementing a numpy internal, so a parity fixture supplies the exact
 * splits and the two languages then compare the divergence arithmetic alone. That isolates the
 * thing worth checking from the thing that cannot be checked.
 */
export interface SplitHalfNull {
  readonly kind: "splitHalfNull";
  readonly nSplits: number;
  readonly nPedestrians: number;
  readonly samples: Float64Array;
  readonly mean: number;
  readonly floor: number;
  readonly alpha: number;
  readonly strideSteps: number;
}

export type PermutationSource = (nPedestrians: number, splitIndex: number) => Int32Array;

/** Deterministic default: a seeded Fisher-Yates, re-permuted fresh for every split. */
export function seededPermutations(seed: number): PermutationSource {
  return (nPedestrians: number, splitIndex: number): Int32Array => {
    const order = new Int32Array(nPedestrians);
    for (let i = 0; i < nPedestrians; i++) {
      order[i] = i;
    }
    // A tiny LCG local to this split, addressed by (seed, splitIndex): no shared cursor, so
    // splits can be computed in any order and still agree.
    let state = (seed ^ Math.imul(splitIndex + 1, 0x9e3779b1)) | 0;
    const next = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) | 0;
      return (state >>> 0) / 4294967296;
    };
    for (let i = nPedestrians - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const swap = order[i] as number;
      order[i] = order[j] as number;
      order[j] = swap;
    }
    return order;
  };
}

/**
 * `strideSteps` subsamples each trajectory before pooling, and it is not an optimisation detail
 * that can be hidden.
 *
 * The cloud form is O(N x M) in points. At 18 pedestrians over 800 ticks each half is a
 * 7,000-point cloud, so one split is 50 million distance evaluations and a 60-split null does not
 * finish. Python gets away with the full trajectory because its synthetic scenes are 60 steps
 * long, not 800.
 *
 * Subsampling raises the floor slightly — sparser clouds have larger nearest-neighbour distances
 * — so the stride is a stated parameter recorded on the result rather than a constant buried in
 * the loop. Two floors computed at different strides are not comparable, and the page must never
 * put them side by side.
 */
export function splitHalfNull(
  pedestrianPaths: readonly Float64Array[],
  nSplits: number,
  permutations: PermutationSource,
  alpha = 0.05,
  strideSteps = 20,
): SplitHalfNull {
  const nPedestrians = pedestrianPaths.length;
  if (nPedestrians < 2) {
    fail(
      `splitHalfNull needs at least 2 pooled pedestrians to form two disjoint halves, got ` +
        `${nPedestrians}`,
    );
  }
  if (!Number.isInteger(nSplits) || nSplits < 1) {
    fail(`splitHalfNull nSplits must be a positive integer, got ${nSplits}`);
  }

  if (!Number.isInteger(strideSteps) || strideSteps < 1) {
    fail(`splitHalfNull strideSteps must be a positive integer, got ${strideSteps}`);
  }

  const subsampled: Float64Array[] = [];
  for (const path of pedestrianPaths) {
    subsampled.push(strideOf(path, strideSteps));
  }

  const halfSize = Math.floor(nPedestrians / 2);
  const samples = new Float64Array(nSplits);

  for (let splitIndex = 0; splitIndex < nSplits; splitIndex++) {
    const order = permutations(nPedestrians, splitIndex);
    // The odd pedestrian out is dropped, matching Python: two halves must be the same size or the
    // comparison is between a bigger sample and a smaller one, which is a different question.
    const groupA = concatPoints(subsampled, order, 0, halfSize);
    const groupB = concatPoints(subsampled, order, halfSize, 2 * halfSize);
    samples[splitIndex] = adeBetweenClouds(groupA, groupB);
  }

  const sorted = Float64Array.from(samples).sort();
  let total = 0;
  for (let i = 0; i < nSplits; i++) {
    total += samples[i] as number;
  }

  return {
    kind: "splitHalfNull",
    nSplits,
    nPedestrians,
    samples,
    mean: total / nSplits,
    floor: quantileLinear(sorted, 1 - alpha),
    alpha,
    strideSteps,
  };
}

function strideOf(path: Float64Array, strideSteps: number): Float64Array {
  const nSteps = path.length / 2;
  const kept = Math.ceil(nSteps / strideSteps);
  const out = new Float64Array(kept * 2);
  let write = 0;
  for (let s = 0; s < nSteps; s += strideSteps) {
    out[write] = path[2 * s] as number;
    out[write + 1] = path[2 * s + 1] as number;
    write += 2;
  }
  return out;
}

function concatPoints(
  paths: readonly Float64Array[],
  order: Int32Array,
  from: number,
  to: number,
): Float64Array {
  let length = 0;
  for (let k = from; k < to; k++) {
    length += (paths[order[k] as number] as Float64Array).length;
  }
  const out = new Float64Array(length);
  let offset = 0;
  for (let k = from; k < to; k++) {
    const path = paths[order[k] as number] as Float64Array;
    out.set(path, offset);
    offset += path.length;
  }
  return out;
}
