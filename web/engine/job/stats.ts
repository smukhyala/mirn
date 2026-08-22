import { fail } from "../core/errors.js";
import type { ColumnKey, Reading } from "./columns.js";

/**
 * The numeric helpers the experiment script and the console both average with.
 *
 * This file must never import from `web/engine/measure/`. That directory is checked against a
 * Python oracle and `web/engine/job/` deliberately is not (CLAUDE.md, guardrails 8 and 9), so a
 * shared dependency between them would drag one into the other's parity obligations for no
 * benefit.
 *
 * These three were lifted verbatim out of scripts/measure-experiments.ts. The filter/reduce form
 * survives the house preference for explicit loops on purpose: web/data/experiment-facts.json is
 * committed and diffed byte for byte, so the summation order here is observable output rather
 * than style.
 */

/**
 * Mean over the FINITE values, which is a survivorship trap and is why every swept column also
 * reports how many runs it actually averaged.
 *
 * A censored measurement — recovery that never came inside its tolerance, an arrival that never
 * happened — comes back NaN and gets dropped here. Recovery time was once averaged over as few as
 * two of eight runs and presented as a property of the eight, with nothing on the page or in the
 * facts file to say so. Dropping the value is right; dropping it silently is not, which is what
 * `finiteCount` is for.
 */
export function meanOf(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return Number.NaN;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

/** How many of the values were finite — the denominator a mean must never be quoted without. */
export function finiteCount(values: readonly number[]): number {
  return values.filter((v) => Number.isFinite(v)).length;
}

/**
 * Sample standard deviation, n-1, over the finite values.
 *
 * NaN below two survivors rather than 0: a 0 there reads as "measured, and there was no spread",
 * which is the opposite of "there was not enough left to say".
 */
export function sdOf(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return Number.NaN;
  const m = meanOf(finite);
  return Math.sqrt(finite.reduce((a, b) => a + (b - m) ** 2, 0) / (finite.length - 1));
}

export type AggregateReason =
  | { readonly kind: "measured" }
  | { readonly kind: "partiallyCensored"; readonly why: string }
  | { readonly kind: "allCensored"; readonly why: string }
  | { readonly kind: "notApplicable"; readonly why: string };

export interface Aggregate {
  readonly kind: "aggregate";
  readonly value: number;
  /** NaN below two survivors. A zero there would read as "no spread", which is a claim. */
  readonly sd: number;
  readonly nUsed: number;
  readonly nAttempted: number;
  readonly reason: AggregateReason;
}

/**
 * One cell's number, and everything needed to say what stands behind it.
 *
 * The reason is built from the readings' own reasons rather than inferred from a NaN downstream,
 * because "the robot never arrived" and "this quantity does not exist for this treatment" are
 * different sentences and the ledger renders them differently.
 */
export function aggregate(readings: readonly Reading[]): Aggregate {
  if (readings.length === 0) {
    fail("aggregate needs at least one reading; a cell with no runs has nothing to average");
  }

  const values: number[] = [];
  const censoredWhy: string[] = [];
  const notApplicableWhy: string[] = [];
  for (const reading of readings) {
    if (reading.availability.kind === "measured") {
      values.push(reading.value);
    } else if (reading.availability.kind === "censored") {
      censoredWhy.push(reading.availability.why);
    } else {
      notApplicableWhy.push(reading.availability.why);
    }
  }

  const nUsed = values.length;
  const nAttempted = readings.length;
  const value = meanOf(values);
  const sd = sdOf(values);

  let reason: AggregateReason = { kind: "measured" };
  if (nUsed === nAttempted) {
    reason = { kind: "measured" };
  } else if (nUsed > 0) {
    reason = {
      kind: "partiallyCensored",
      why: `averaged ${nUsed} of ${nAttempted} runs; the rest were not measured: ${firstReason(
        censoredWhy,
        notApplicableWhy,
      )}`,
    };
  } else if (censoredWhy.length > 0) {
    reason = {
      kind: "allCensored",
      why: `none of ${nAttempted} runs produced a number: ${firstReason(
        censoredWhy,
        notApplicableWhy,
      )}`,
    };
  } else {
    reason = {
      kind: "notApplicable",
      why: `this quantity does not exist for any of these ${nAttempted} runs: ${firstReason(
        censoredWhy,
        notApplicableWhy,
      )}`,
    };
  }

  return Object.freeze({ kind: "aggregate" as const, value, sd, nUsed, nAttempted, reason });
}

/** Censored explanations first: something was attempted and ran out, which is the sharper fact. */
function firstReason(censoredWhy: readonly string[], notApplicableWhy: readonly string[]): string {
  if (censoredWhy.length > 0) {
    return censoredWhy[0] as string;
  }
  if (notApplicableWhy.length > 0) {
    return notApplicableWhy[0] as string;
  }
  return "no reason was recorded";
}

/**
 * The addressable unit under a ledger row.
 *
 * A ledger row is a CELL — one axis value aggregated over that cell's seeds — and a cell has no
 * seed, so it cannot be rebuilt and cannot be played back. A run can. Cells are computed from
 * runs at render time and never stored.
 */
export interface RunKey {
  readonly axisIndex: number;
  readonly axisValue: number;
  readonly seedIndex: number;
}

export interface RunRow {
  readonly kind: "runRow";
  readonly key: RunKey;
  readonly readings: Readonly<Partial<Record<ColumnKey, Reading>>>;
}
