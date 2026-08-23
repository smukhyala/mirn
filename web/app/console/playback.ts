import { ContractError } from "../../engine/core/errors.js";
import { runPair, type RunResult } from "../../engine/sim/run.js";
import { configForCell, type SweepJob } from "../../engine/job/spec.js";

/**
 * Selecting a row selects a CELL. A cell has no seed, so it cannot be played — the transport's
 * "seed 1 of 8" control chooses which run inside it does.
 *
 * The run is not stored. It is rebuilt from (job, axisIndex, seedIndex) and re-simulated, which
 * determinism makes bitwise the run the worker measured. That is what lets the Worker return about
 * 90 KB of readings instead of 33 MB of paths.
 */

export interface PlaybackSelection {
  readonly kind: "playbackSelection";
  readonly groupId: string;
  readonly axisIndex: number;
  readonly seedIndex: number;
}

export function makePlaybackSelection(init: {
  readonly groupId: string;
  readonly axisIndex: number;
  readonly seedIndex: number;
}): PlaybackSelection {
  if (init.groupId.length === 0) {
    throw new ContractError("playback must name the kept result it is playing from");
  }
  if (!Number.isInteger(init.axisIndex) || init.axisIndex < 0) {
    throw new ContractError(`playback needs a cell, got axis index ${init.axisIndex}`);
  }
  if (!Number.isInteger(init.seedIndex) || init.seedIndex < 0) {
    throw new ContractError(`playback needs a run, got seed index ${init.seedIndex}`);
  }
  return Object.freeze({
    kind: "playbackSelection" as const,
    groupId: init.groupId,
    axisIndex: init.axisIndex,
    seedIndex: init.seedIndex,
  });
}

export function recomputeForPlayback(
  job: SweepJob,
  axisIndex: number,
  seedIndex: number,
): RunResult {
  const config = configForCell(job, axisIndex, seedIndex);
  return runPair(config);
}

export function stepSeed(current: number, delta: number, seedIndices: readonly number[]): number {
  const position = seedIndices.indexOf(current);
  let next = position < 0 ? 0 : position + delta;
  if (next < 0) {
    next = 0;
  }
  if (next > seedIndices.length - 1) {
    next = seedIndices.length - 1;
  }
  return seedIndices[next] ?? current;
}

export function describeSeed(seedIndices: readonly number[], seedIndex: number): string {
  const position = seedIndices.indexOf(seedIndex);
  const shown = position < 0 ? 1 : position + 1;
  return `seed ${shown} of ${seedIndices.length}`;
}
