import { fail } from "../../engine/core/errors.js";
import { AXES } from "../../engine/job/axes.js";
import type { SweepJob } from "../../engine/job/spec.js";
import type { BandReading } from "../../engine/job/runner.js";
import type { RunRow } from "../../engine/job/stats.js";

/**
 * One press of Run, finished.
 *
 * A group holds RUNS, not cells. A cell — one axis value, aggregated over its seeds — is what the
 * operator reads, but a cell has no seed and so cannot be rebuilt, and playback, pinning and the
 * recompute trick all need something that can. The ledger derives cells from these rows at render
 * time; nothing here stores an aggregate.
 *
 * `BandReading` is imported from `web/engine/job/runner.ts`, which is where `sweepUnits` actually
 * builds one. That interface had no `kind` field until this task added it: every OTHER frozen
 * record that crosses a module boundary in this codebase carries an explicit `kind` discriminant
 * (CLAUDE.md's "Code conventions" section), and `web/app/console/state.ts` already had its own,
 * unused `BandReading` with one — this file's own test constructs a `{ kind: "bandReading", ... }`
 * literal and hands it to `addBand`, which only compiles once `runner.ts`'s version agrees.
 */

export interface RunGroup {
  readonly kind: "runGroup";
  readonly id: string;
  readonly label: string;
  readonly job: SweepJob;
  readonly rows: readonly RunRow[];
  readonly bands: readonly BandReading[];
  readonly completedAtMs: number;
}

export interface RunGroupInit {
  readonly id: string;
  readonly label: string;
  readonly job: SweepJob;
  readonly rows: readonly RunRow[];
  readonly bands: readonly BandReading[];
  readonly completedAtMs: number;
}

/** Lowercases only the first character, so a title-case axis label reads as flowing prose after
 *  nothing rather than as a second heading. Mirrors `web/app/console/csv.ts`'s own `lowerFirst`,
 *  kept local rather than imported: csv.ts does not export it, and it is five lines. */
function lowerFirst(text: string): string {
  if (text.length === 0) {
    return text;
  }
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function labelForJob(job: SweepJob): string {
  if (job.axis === null) {
    return "single run";
  }
  return `${lowerFirst(AXES[job.axis].label)} — sweep`;
}

export function labelForCell(job: SweepJob, axisIndex: number): string {
  const value = job.axisValues[axisIndex];
  if (job.axis === null || value === undefined) {
    return "single run";
  }
  return `${lowerFirst(AXES[job.axis].label)} ${value}`;
}

export function makeRunGroup(init: RunGroupInit): RunGroup {
  if (init.id.length === 0) {
    fail("a kept result must have an id, or nothing can select it");
  }
  if (init.label.length === 0) {
    fail(`kept result '${init.id}' has no plain-English name`);
  }
  for (const row of init.rows) {
    const axisValue = init.job.axisValues[row.key.axisIndex];
    if (axisValue === undefined) {
      fail(
        `kept result '${init.id}' holds a run at axis index ${row.key.axisIndex}, which this job ` +
          `does not have; the ledger would then show a cell nothing can rebuild`,
      );
    }
    if (!init.job.seedIndices.includes(row.key.seedIndex)) {
      fail(
        `kept result '${init.id}' holds a run at seed index ${row.key.seedIndex}, which this job ` +
          `did not ask for`,
      );
    }
  }
  return Object.freeze({
    kind: "runGroup" as const,
    id: init.id,
    label: init.label,
    job: init.job,
    rows: Object.freeze([...init.rows]),
    bands: Object.freeze([...init.bands]),
    completedAtMs: init.completedAtMs,
  });
}

export interface GroupBuilder {
  readonly kind: "groupBuilder";
  readonly addRow: (row: RunRow) => void;
  readonly addBand: (band: BandReading) => void;
  readonly count: () => number;
  readonly finish: (init: { readonly id: string; readonly completedAtMs: number }) => RunGroup;
}

export function makeGroupBuilder(job: SweepJob): GroupBuilder {
  const rows: RunRow[] = [];
  const bands: BandReading[] = [];
  return Object.freeze({
    kind: "groupBuilder" as const,
    addRow: (row: RunRow): void => {
      rows.push(row);
    },
    addBand: (band: BandReading): void => {
      bands.push(band);
    },
    count: (): number => rows.length,
    finish: (init: { readonly id: string; readonly completedAtMs: number }): RunGroup =>
      makeRunGroup({
        id: init.id,
        label: labelForJob(job),
        job,
        rows,
        bands,
        completedAtMs: init.completedAtMs,
      }),
  });
}
