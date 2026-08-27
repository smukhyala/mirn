import { DEFAULT_CONFIG, type CrowdModelKey } from "../../engine/contracts/config.js";
import type { UnitKey } from "../../engine/job/columns.js";
import { FAMILIES } from "../../engine/job/families.js";
import type {
  FamilyProbe,
  FamilyProbeSeed,
  FamilyProbeSettings,
} from "../../engine/job/familyProbe.js";
import type { SuppliedProbe, SuppliedProbeSeed } from "../../engine/job/suppliedProbe.js";
import type { Comparison, ComparisonRow } from "./comparison.js";
import { BENCH_VERSION, INVENTED_CROWD_DISCLOSURE, crowdModelLine } from "./csv.js";

/**
 * The method card's and the comparison's exports, and nothing else.
 *
 * This is `csv.ts` pointed at three other measurements. It is a pure module on purpose: every
 * function here takes data and returns a string, there is no `Document` in it, no `Blob`, no
 * anchor and no download. The page owns handing a file to a reader; this file owns what is in the
 * file, and the two are separable because one of them is worth testing on its own.
 *
 * ## Everything the page discharges by being a page, this discharges in words
 *
 * A console carries its honesty by adjacency: the invented-crowd sentence sits above the arena,
 * every figure carries its zero one interaction away, and the comparison's refusal is rendered
 * above the table rather than beneath it. A spreadsheet has none of that. It gets opened six months
 * later by somebody who never saw the page, on a machine that has never run this bench, so each of
 * those obligations has to be met in the file's own first lines. In order, and in every one of the
 * three exports:
 *
 *   1. the invented-crowd disclosure, on line one, reused from `csv.ts` and never rewritten here
 *      (guardrail 1: a file outlives the page it came from);
 *   2. the crowd that produced the rows, by the line the second-crowd change already wrote — the
 *      static disclosure cannot name a kernel a reader had not yet chosen, and a file generated
 *      after a run can and must;
 *   3. what produced it and on what: the bench version, how many rooms, how many replicates stand
 *      behind each drift line, and the seeds themselves. A file that records its own inputs can be
 *      reproduced; one that does not is a number with a story attached.
 *
 * ## A number that was not measured is never written as one
 *
 * `NaN` must never reach a cell as text. A spreadsheet reads the three letters as a label, a
 * plotting script reads them as a hole, and a reader reads them as a fault in the exporter rather
 * than as a room the ruler could not measure. So a room with no reading writes an **empty** value
 * cell and fills the reason column beside it, which is the same trade `csv.ts` makes when a cell's
 * runs were all censored.
 *
 * ## What is not here
 *
 * No `Blob`, no object URL, no download, and no reading a CSV back in. Guardrail 11's surviving
 * clause holds: the export is an export, and nothing in this repository parses one.
 */

/* --------------------------------------------------------------------------------------------
 * Formatting.
 *
 * `csvField`, `formatValue` and `unitSuffix` are the shape of `csv.ts`'s own, which are
 * module-private there. They are duplicated rather than exported from it, because this file was
 * built under an instruction not to restructure that module. The duplication is deliberate and
 * marked: if they are ever hoisted into a shared module, both call sites move together or neither
 * does. The rules themselves — three places for a metre, two for a second, a count that lets its
 * own value decide — are not re-decided here; they are copied, so the two exports round a number
 * the same way.
 * ------------------------------------------------------------------------------------------ */

function csvField(text: string): string {
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/** An unmeasured value is an empty cell. Never the three letters, and never a zero. */
function formatValue(unit: UnitKey, value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (unit === "metres") {
    return value.toFixed(3);
  }
  if (unit === "seconds") {
    return value.toFixed(2);
  }
  if (unit === "count" || unit === "people") {
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  }
  if (unit === "ratio") {
    return value.toFixed(3);
  }
  return String(value);
}

function unitSuffix(unit: UnitKey): string {
  if (unit === "none") {
    return "";
  }
  return ` (${unit})`;
}

/** A seed is an integer that names a room, not a measurement, so it is written out whole. */
function seedField(seed: number): string {
  return String(seed);
}

/* --------------------------------------------------------------------------------------------
 * The preamble every export carries.
 * ------------------------------------------------------------------------------------------ */

const CLEARED_YES = "yes";
const CLEARED_NO = "no";

const EMPTY_CELL_NOTE =
  "an empty reading means nothing was read on that room, and the last column says why. It is " +
  "never a reading of nought: a room that was not measured and a room that measured nothing are " +
  "opposite findings";

const DRIFT_ZERO_NOTE =
  "the drift line would be nought if nothing about a room varied between its two runs. It is not " +
  "nought, which is the point: it is the line a reading has to clear before anyone should call it " +
  "an effect";

/**
 * Which crowd produced the rows.
 *
 * `FamilyProbeSettings.base` is a partial configuration, so the kernel may be absent from it — in
 * which case the run took the bench's default and the file has to say which default that was. A
 * blank where the crowd should be named would be the one provenance field a reader cannot
 * reconstruct from anything else in the file.
 */
function crowdOf(settings: FamilyProbeSettings): CrowdModelKey {
  return settings.base.crowdModel ?? DEFAULT_CONFIG.crowdModel;
}

/**
 * Lines one, two and the provenance block, in that order, for all three exports.
 *
 * `rowsNote` says what one row of this particular file is, in the shape `csv.ts`'s own
 * `# rows:` line uses.
 */
function preamble(settings: FamilyProbeSettings, rowsNote: string): readonly string[] {
  const lines: string[] = [
    `# ${INVENTED_CROWD_DISCLOSURE}`,
    `# ${crowdModelLine(crowdOf(settings))}`,
    `# bench version: ${BENCH_VERSION}`,
    `# rooms measured: ${formatValue("count", settings.seeds.length)}`,
    `# runs behind each drift line: ${formatValue("count", settings.bandReplicates)}`,
  ];

  const seeds: string[] = [];
  for (const seed of settings.seeds) {
    seeds.push(seedField(seed));
  }
  lines.push(`# room seeds: ${seeds.join(", ")}`);

  lines.push(`# rows: ${rowsNote}`);
  lines.push(`# ${EMPTY_CELL_NOTE}`);
  lines.push(`# ${DRIFT_ZERO_NOTE}`);
  return lines;
}

/** The preamble, a blank line, the header, then the rows. The blank line is the seam a reader's
 *  spreadsheet needs: everything above it is prose about the file and everything below it is the
 *  table. */
function assemble(
  head: readonly string[],
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines: string[] = [...head];
  lines.push("");
  lines.push(header.join(","));
  for (const row of rows) {
    lines.push(row.join(","));
  }
  return `${lines.join("\n")}\n`;
}

/* --------------------------------------------------------------------------------------------
 * The two probe exports: one row per room.
 * ------------------------------------------------------------------------------------------ */

const ROOM_SEED_HEADING = "Room seed";
const DRIFT_HEADING = "How far two runs of the same room drift apart on their own";
const TRUTH_HEADING = "What the robot actually did to the people in that room";
const CLEARED_HEADING = "Cleared that drift line";
const WHY_HEADING = "Why nothing was read on that room";

const FAMILY_ROWS_NOTE = "one row per room, in the order the rooms were run";
const SUPPLIED_ROWS_NOTE = "one row per room your own method was put to, in the order they were run";

/** What a described family read on one room, or why it read nothing there. */
function familyReasonOf(room: FamilyProbeSeed): string {
  const availability = room.reading.availability;
  if (availability.kind === "censored") {
    return `censored: ${availability.why}`;
  }
  if (availability.kind === "notApplicable") {
    return `not applicable: ${availability.why}`;
  }
  return "";
}

/**
 * Whether a room's reading cleared its drift line.
 *
 * Empty rather than "no" where nothing was read. A "no" there would be a finding — the ruler was
 * asked and did not clear the line — and what actually happened is that it was never asked.
 */
function clearedField(measured: boolean, clearedBand: boolean): string {
  if (!measured) {
    return "";
  }
  return clearedBand ? CLEARED_YES : CLEARED_NO;
}

export function familyProbeCsv(probe: FamilyProbe, settings: FamilyProbeSettings): string {
  const family = FAMILIES[probe.family];
  const head: string[] = [...preamble(settings, FAMILY_ROWS_NOTE)];
  // Named in the catalogue's own plain English, never by the key the code files it under.
  head.push(`# the ruler: ${family.name}`);
  head.push(`# what it does: ${family.whatItIs}`);

  const suffix = unitSuffix(probe.unit);
  const header: string[] = [
    csvField(ROOM_SEED_HEADING),
    csvField(`What the ruler read${suffix}`),
    csvField(`${DRIFT_HEADING}${unitSuffix("metres")}`),
    csvField(`${TRUTH_HEADING}${unitSuffix("metres")}`),
    csvField(CLEARED_HEADING),
    csvField(WHY_HEADING),
  ];

  const rows: string[][] = [];
  for (const room of probe.perSeed) {
    const measured = room.reading.availability.kind === "measured";
    rows.push([
      seedField(room.seed),
      measured ? formatValue(probe.unit, room.reading.value) : "",
      formatValue("metres", room.bandM),
      formatValue("metres", room.truthM),
      clearedField(measured, room.clearedBand),
      csvField(familyReasonOf(room)),
    ]);
  }

  return assemble(head, header, rows);
}

/**
 * Why a supplied method produced no distance on a room, in the reader's words rather than the
 * code's.
 *
 * No figure appears in any of these sentences, and the inconsistent case is where that matters: a
 * method that answered twice differently has two numbers and neither of them is its reading, so
 * printing them here would put a value in a cell whose whole point is that no value was earned.
 * The count of such rooms is a measurement and travels in its own column on the comparison.
 */
function suppliedReasonOf(room: SuppliedProbeSeed): string {
  const outcome = room.outcome;
  if (outcome.kind === "failed") {
    return `the method stopped: ${outcome.message}`;
  }
  if (outcome.kind === "nondeterministic") {
    return (
      "the method answered twice differently on the same room, so neither answer is its reading " +
      "and no average can include it"
    );
  }
  if (outcome.kind === "timedOut") {
    return "the method was still running after the time it was given, so it was stopped";
  }
  return "";
}

const SUPPLIED_RULER_NOTE =
  "the ruler here is the method you supplied, run on the rooms below and never handed the run " +
  "without the robot in it";

const SUPPLIED_UNKNOWN_NOTE =
  "this cannot see what your method compares. If what it returns is an absolute quantity, it will " +
  "clear the drift line on every room, and that is a fact about the quantity rather than a false " +
  "alarm";

/**
 * The sentence a file of a constant method's readings cannot be allowed to travel without.
 *
 * Guardrail 1 puts the disclosure on line one of every CSV because a file outlives the page it came
 * from, and the same argument applies here with more force. A reader opening this file months later
 * sees a column of identical distances and a clean sheet of noughts under "cleared". The page said
 * why that is not a good score; the file has to say it too, or the export is the version of this
 * measurement that survives and it is the version with the finding removed.
 */
const SUPPLIED_CONSTANT_NOTE =
  "your method returned the same distance on every room it read, so it is not reading the rooms. " +
  "The cleared column below follows from that and is not evidence the method is sound: a reading " +
  "that never varies cannot clear a line, whether or not there was anything to report";

export function suppliedProbeCsv(probe: SuppliedProbe, settings: FamilyProbeSettings): string {
  const head: string[] = [...preamble(settings, SUPPLIED_ROWS_NOTE)];
  head.push(`# the ruler: ${SUPPLIED_RULER_NOTE}`);
  head.push(`# ${SUPPLIED_UNKNOWN_NOTE}`);
  // The same two conditions the page's warning is built from, read off the same probe. Two rooms at
  // minimum, because "the same on every room" is a claim about rooms in the plural.
  if (probe.nUsed > 1 && probe.nDistinctReadings === 1) {
    head.push(`# ${SUPPLIED_CONSTANT_NOTE}`);
  }

  const suffix = unitSuffix(probe.unit);
  const header: string[] = [
    csvField(ROOM_SEED_HEADING),
    csvField(`What your method read${suffix}`),
    csvField(`${DRIFT_HEADING}${unitSuffix("metres")}`),
    csvField(`${TRUTH_HEADING}${unitSuffix("metres")}`),
    csvField(CLEARED_HEADING),
    csvField(WHY_HEADING),
  ];

  const rows: string[][] = [];
  for (const room of probe.perSeed) {
    const measured = room.outcome.kind === "read";
    rows.push([
      seedField(room.seed),
      room.outcome.kind === "read" ? formatValue(probe.unit, room.outcome.valueM) : "",
      formatValue("metres", room.bandM),
      formatValue("metres", room.truthM),
      clearedField(measured, room.clearedBand),
      csvField(suppliedReasonOf(room)),
    ]);
  }

  return assemble(head, header, rows);
}

/* --------------------------------------------------------------------------------------------
 * The comparison: one row per ruler.
 * ------------------------------------------------------------------------------------------ */

const RULER_HEADING = "The ruler";
const READING_HEADING = "What it read where the truth was exactly nothing";
const READING_ZERO_HEADING = "What the robot actually did to those same rooms";
const CLEARED_ROOMS_HEADING = "Rooms where it cleared that drift line";
const CLEARED_ZERO_HEADING = "Rooms where the true effect itself cleared that drift line";
const ROOMS_MEASURED_HEADING = "Rooms measured";
const ROOMS_READ_HEADING = "Rooms it produced a reading on";
const MEANING_HEADING = "What the clearing count means for this ruler";
const NO_READING_HEADING = "Why there is no reading";

const COMPARISON_ROWS_NOTE =
  "one row per ruler, most of those clearings first, and by nothing else. It is a count of " +
  "mistakes on invented rooms and it is not a grade: there is no total in this file, no share, no " +
  "mark out of anything, and no row is singled out as the one to use";

const SAME_ROOMS_NOTE =
  "every row was measured on the same rooms, at the same seeds, against the same drift lines. " +
  "That is the whole of what makes these counts comparable to each other and to nothing outside " +
  "this file";

function comparisonRowFields(row: ComparisonRow): readonly string[] {
  const reading = row.reading;
  const hasFigure = reading.kind === "suppliedReading";
  const mistakes = row.mistakes;
  return [
    csvField(row.name),
    hasFigure ? formatValue(reading.figure.unit, reading.figure.value) : "",
    hasFigure ? formatValue(reading.figure.unit, reading.figure.zeroValue) : "",
    formatValue(row.band.unit, row.band.value),
    formatValue("count", mistakes.nCleared),
    // A ruler that is not detecting anything has no zero for its clearings, because it is not
    // making a claim that could be mistaken. The meaning column beside it says exactly that, in
    // the words the page itself uses, rather than this file inventing a nought for the cell.
    mistakes.kind === "falsePositiveRate" ? formatValue("count", mistakes.zeroCleared) : "",
    formatValue("count", mistakes.nAttempted),
    formatValue("count", row.nUsed),
    csvField(mistakes.note),
    csvField(hasFigure ? "" : reading.why),
  ];
}

export function comparisonCsv(comparison: Comparison, settings: FamilyProbeSettings): string {
  const head: string[] = [...preamble(settings, COMPARISON_ROWS_NOTE)];
  head.push(`# ${SAME_ROOMS_NOTE}`);
  // The refusal travels with the numbers, for the reason it is rendered above the table rather
  // than beneath it: a caveat that arrives after the ordering arrives after the reader has already
  // drawn the conclusion, and a file has no document order to rely on except its own first lines.
  for (const paragraph of comparison.refusal) {
    head.push(`# ${paragraph}`);
  }

  const header: string[] = [
    csvField(RULER_HEADING),
    csvField(`${READING_HEADING}${unitSuffix("metres")}`),
    csvField(`${READING_ZERO_HEADING}${unitSuffix("metres")}`),
    // The same phrase the two probe exports use, so the three files can be read side by side
    // without a reader wondering whether two similar headings mean the same quantity.
    csvField(`${DRIFT_HEADING}${unitSuffix("metres")}`),
    csvField(CLEARED_ROOMS_HEADING),
    csvField(CLEARED_ZERO_HEADING),
    csvField(ROOMS_MEASURED_HEADING),
    csvField(ROOMS_READ_HEADING),
    csvField(MEANING_HEADING),
    csvField(NO_READING_HEADING),
  ];

  const rows: string[][] = [];
  for (const row of comparison.ordered) {
    rows.push([...comparisonRowFields(row)]);
  }
  // The rulers kept out of the ordering are still in the file. Leaving one out would be an absence
  // a reader cannot see, which is the failure `makeComparison` refuses on the page.
  for (const row of comparison.notDetecting) {
    rows.push([...comparisonRowFields(row)]);
  }

  return assemble(head, header, rows);
}
