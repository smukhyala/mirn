import type { UnitKey } from "../../engine/job/columns.js";

/**
 * How a value becomes a cell, shared by every export this site writes.
 *
 * ## Why one module and not two copies
 *
 * These three were written in `csv.ts` and copied into `methodCsv.ts` under an instruction not to
 * restructure the first, with a comment on the copy saying: *if they are ever hoisted into a shared
 * module, both call sites move together or neither does.* This is that. The copies had already
 * drifted — `formatValue` had lost both of the comments explaining its rounding — and while that
 * particular drift was harmless, a rounding rule that exists twice is a rounding rule that can come
 * to mean two things, and the two files write columns a reader will set side by side.
 *
 * ## The rules, decided once
 *
 * Three places for a metre, matching `tile.ts`'s `DECIMALS` and therefore the precision every metre
 * on screen is printed at — a fourth digit here would be a precision the export invented rather
 * than one the rest of the console agrees on. Two for a second. Three for a ratio.
 *
 * A count lets its own value decide, and that is the one worth keeping the reason for: a count of a
 * single run is a whole number, but a MEAN of counts across seeds is not, and rounding that to a
 * whole number overstates a precision the data never had — the same failure class as a mean with no
 * denominator. It is the rule the research era's own formatter settled on for a count column.
 *
 * ## An unmeasured value is an empty cell
 *
 * Never `NaN`, which a spreadsheet reads as a label and a plotting script reads as a hole, and
 * never a nought, because a room that was not measured and a room that measured nothing are
 * opposite findings. The column beside it says which.
 *
 * ## Not `tile.ts`'s `formatValue`, and the argument order is the tell
 *
 * `tile.ts` exports a function of the same name taking `(value, unit)`; this one takes
 * `(unit, value)`. They are genuinely different — the screen's rounds every value it is given and
 * this one turns an unmeasured value into an empty string — and the swapped order is what stops a
 * mistaken import compiling. Do not "fix" it into agreement without deciding which behaviour the
 * caller wanted.
 */

export function csvField(text: string): string {
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function formatValue(unit: UnitKey, value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (unit === "metres") {
    // Three places, matching the precision used everywhere else a metre reaches a reader
    // (web/app/console/tile.ts's DECIMALS) — a fourth digit here would be a precision this file
    // invented rather than one the rest of the console agrees on.
    return value.toFixed(3);
  }
  if (unit === "seconds") {
    return value.toFixed(2);
  }
  if (unit === "count" || unit === "people") {
    // A count of a single run is a whole number, but a MEAN of counts across seeds is not, and
    // rounding it to a whole number overstates precision the data never had — the same failure
    // class as a mean with no denominator. The rule is the same one the research era's own
    // formatter settled on for a count column: let the value decide.
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  }
  if (unit === "ratio") {
    return value.toFixed(3);
  }
  return String(value);
}

export function unitSuffix(unit: UnitKey): string {
  if (unit === "none") {
    return "";
  }
  return ` (${unit})`;
}
