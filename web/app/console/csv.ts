import { fail } from "../../engine/core/errors.js";
import { DEFAULT_CONFIG } from "../../engine/contracts/config.js";
import { AXES } from "../../engine/job/axes.js";
import { COLUMNS, type ColumnKey, type UnitKey } from "../../engine/job/columns.js";
import { accumulate } from "../../engine/job/runner.js";
import type { Aggregate, AggregateReason, RunRow } from "../../engine/job/stats.js";
import { seedFor, type SweepJob } from "../../engine/job/spec.js";

/**
 * The export, and the one surface where the standing disclosure line cannot stand.
 *
 * A page carries its honesty by adjacency: the invented-crowd sentence sits above the arena and
 * every tile carries its own zero one interaction away. A file has none of that. It gets opened
 * in a spreadsheet six months later by somebody who never saw the page, so everything the page
 * says by being a page this file has to say in words, in its own first lines.
 *
 * Grouping lives in `accumulate`, in runner.ts, and is not reimplemented here. The ledger and
 * this file call the same function on the same rows, which is what makes "the table disagrees
 * with the CSV" impossible rather than merely unlikely.
 *
 * `RunRow` and `AggregateReason` are imported from `web/engine/job/stats.ts`, not
 * `web/engine/job/runner.ts`: `runner.ts` imports `RunRow` for its own `UnitOutput` field but
 * never re-exports the name, so `web/engine/job/runner.js` has no exported member `RunRow` for
 * this file to import (the same fact `web/app/worker/protocol.ts`, `web/app/worker/client.ts` and
 * `web/app/console/state.ts` already document about themselves).
 */

export const INVENTED_CROWD_DISCLOSURE =
  "Everything in this file is simulated. The crowd is a social-force model - invented people " +
  "obeying invented rules - and no number here is a measurement of real pedestrians. What is " +
  "real is the ruler: the same room is run twice, once with a robot and once without, from the " +
  "same starting positions and the same random wobble, and the difference between a person's " +
  "two paths is the robot's effect on them.";

/**
 * The clauses the disclosure must contain wherever it appears. The page says "on this page" and
 * the file says "in this file", so the two sentences are not identical and cannot be compared
 * whole; these are the parts that carry the obligation, and `console.html` is checked against
 * this list rather than against a copy of the sentence.
 */
export const DISCLOSURE_CLAUSES: readonly string[] = Object.freeze([
  "simulated",
  "social-force model",
  "invented people obeying invented rules",
  "no number here is a measurement of real pedestrians",
]);

export interface CsvOptions {
  readonly kind: "csvOptions";
  readonly granularity: "cell" | "run";
  readonly generatedAtIso: string;
}

export function makeCsvOptions(init: {
  granularity?: "cell" | "run";
  generatedAtIso: string;
}): CsvOptions {
  const granularity = init.granularity ?? "cell";
  if (granularity !== "cell" && granularity !== "run") {
    fail(`CsvOptions.granularity must be "cell" or "run", got ${String(granularity)}`);
  }
  if (init.generatedAtIso.length === 0) {
    fail("CsvOptions.generatedAtIso must be a non-empty timestamp");
  }
  return Object.freeze({ kind: "csvOptions" as const, granularity, generatedAtIso: init.generatedAtIso });
}

const NO_RUNS = "no runs";
const NO_SPREAD = "spread not defined below two runs";

function csvField(text: string): string {
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function formatValue(unit: UnitKey, value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (unit === "metres") {
    // Three places, matching the precision used everywhere else a metre reaches a reader
    // (web/build/quantities.ts's formatQuantity, web/notes.ts, web/main.ts) — a fourth digit here
    // would be a precision this file invented rather than one the rest of the site agrees on.
    return value.toFixed(3);
  }
  if (unit === "seconds") {
    return value.toFixed(2);
  }
  if (unit === "count" || unit === "people") {
    // A count of a single run is a whole number, but a MEAN of counts across seeds is not, and
    // rounding it to a whole number overstates precision the data never had — the same failure
    // class as a mean with no denominator. web/build/quantities.ts's formatQuantity already
    // solved this for its own count columns ("let the value decide"); this mirrors that rule.
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  }
  if (unit === "ratio") {
    return value.toFixed(3);
  }
  return String(value);
}

function formatSpread(unit: UnitKey, sd: number): string {
  if (Number.isFinite(sd)) {
    return formatValue(unit, sd);
  }
  // Never an empty cell (mandatory fix 2): a spread that is not defined says so, in every branch
  // that can reach here, not only the ones a test happens to cover.
  return csvField(NO_SPREAD);
}

/**
 * `Aggregate.reason.why` is built by `aggregate()` in stats.ts, and for the two non-measured
 * shapes it bakes in how many of how many runs survived: "none of 2 runs produced a number: ..."
 * or "this quantity does not exist for any of these 2 runs: ...". This export already carries
 * that count in its own "runs used" / "runs attempted" columns (mandatory fix 2), so repeating it
 * inside the reason text would say the same number twice in two different words, and it would
 * also make the marker legend's own promise — '"censored: ...": ... the reason follows the
 * colon' — false, since what actually followed the colon would be a second sentence about counts
 * rather than the reason itself. This strips exactly the two prefixes `aggregate()` can produce
 * here. If stats.ts's wording ever changes, neither prefix matches and the fuller sentence leaks
 * through unstripped rather than this throwing, because a slightly redundant CSV cell is a far
 * smaller failure than the export crashing on a stale regex.
 */
const ALL_CENSORED_PREFIX = /^none of \d+ runs produced a number: /;
const NOT_APPLICABLE_PREFIX = /^this quantity does not exist for any of these \d+ runs: /;

function strippedDetail(why: string): string {
  return why.replace(ALL_CENSORED_PREFIX, "").replace(NOT_APPLICABLE_PREFIX, "");
}

/**
 * `AggregateReason.kind` is `"measured" | "partiallyCensored" | "allCensored" | "notApplicable"`,
 * not the three-valued `"measured" | "censored" | "notApplicable"` shape `Reading.availability`
 * carries in columns.ts. The two are easy to conflate because they describe the same idea one
 * level apart: a `Reading` is one run's own outcome, an `Aggregate` is what several runs' worth of
 * readings reduce to, and averaging over a mix of measured and unmeasured readings is a case a
 * single reading can never be in. Only `partiallyCensored`/`allCensored`/`notApplicable` reach
 * this function, and `measured`/`partiallyCensored` never do — see `aggregateFields`, which
 * branches on whether `entry.value` is finite before this is called, which is exactly the
 * `nUsed > 0` condition that makes those two kinds distinct in stats.ts.
 */
function reasonText(reason: AggregateReason): string {
  if (reason.kind === "notApplicable") {
    return `not applicable: ${strippedDetail(reason.why)}`;
  }
  if (reason.kind === "allCensored") {
    return `censored: ${strippedDetail(reason.why)}`;
  }
  fail(
    `reasonText was called with reason.kind '${reason.kind}', but only 'allCensored' and ` +
      `'notApplicable' should ever reach it: a 'measured' or 'partiallyCensored' aggregate has a ` +
      `finite value and never gets here`,
  );
}

/**
 * A finite `entry.value` is exactly the condition `nUsed > 0` in stats.ts's `aggregate()`, which
 * covers both `"measured"` (every attempted run survived) and `"partiallyCensored"` (some did).
 * Both get the real number: the guardrail this file was given is "a mean that averaged 4 of 18
 * people and says so is honest", and the denominator it has to say is already sitting in the
 * "runs used" / "runs attempted" fields beside it. Only when no run at all produced a number —
 * `"allCensored"` or `"notApplicable"` — does the reason take the value field's place.
 */
function aggregateFields(key: ColumnKey, entry: Aggregate | undefined): readonly string[] {
  const descriptor = COLUMNS[key];
  if (entry === undefined) {
    return [csvField(NO_RUNS), csvField(NO_RUNS), "0", "0"];
  }
  if (Number.isFinite(entry.value)) {
    return [
      formatValue(descriptor.unit, entry.value),
      formatSpread(descriptor.unit, entry.sd),
      String(entry.nUsed),
      String(entry.nAttempted),
    ];
  }
  return [
    csvField(reasonText(entry.reason)),
    csvField(NO_SPREAD),
    String(entry.nUsed),
    String(entry.nAttempted),
  ];
}

function readingField(key: ColumnKey, row: RunRow): string {
  const descriptor = COLUMNS[key];
  const reading = row.readings[key];
  if (reading === undefined) {
    return csvField(NO_RUNS);
  }
  const availability = reading.availability;
  if (availability.kind === "censored") {
    return csvField(`censored: ${availability.why}`);
  }
  if (availability.kind === "notApplicable") {
    return csvField(`not applicable: ${availability.why}`);
  }
  return formatValue(descriptor.unit, reading.value);
}

function treatmentSentence(job: SweepJob): string {
  const treatment = job.base.treatment;
  const kind = treatment === undefined ? "robot-presence" : treatment.kind;
  if (kind === "robot-presence") {
    return "the same room run twice, once with a robot and once without";
  }
  if (kind === "disturbance") {
    return "the same room run twice, with the robot present in both runs and shoved in one";
  }
  return "the same room run twice with nothing done differently in either run";
}

/** Lowercases only the first character, so a title-case axis label reads as flowing prose after a colon. */
function lowerFirst(text: string): string {
  if (text.length === 0) {
    return text;
  }
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function axisSentence(job: SweepJob): readonly string[] {
  if (job.axis === null) {
    return [
      "# varying: nothing - one setting, run at every seed listed below",
      `# values: ${job.axisValues.join(", ")}`,
    ];
  }
  const entry = AXES[job.axis];
  return [`# varying: ${lowerFirst(entry.label)}`, `# values: ${job.axisValues.join(", ")}`];
}

function bandSentence(job: SweepJob): string {
  const band = job.bandReplicates;
  if (band === null) {
    return "# run-to-run band: not measured";
  }
  const scope = band.scope === "perCell" ? "once per axis value" : "once per seed";
  return `# run-to-run band: ${band.n} replicates, measured ${scope}`;
}

function floorSentence(job: SweepJob): string {
  const floor = job.floor;
  if (floor === null) {
    return "# detection floor: not measured";
  }
  return (
    `# detection floor: ${floor.nSplits} splits at the ` +
    `${((1 - floor.alpha) * 100).toFixed(0)}th percentile, every ${floor.strideSteps} steps, ` +
    `permutation seed ${floor.permutationSeed}`
  );
}

function provenance(job: SweepJob, rows: readonly RunRow[], options: CsvOptions): readonly string[] {
  const cellsExpected = job.axisValues.length;
  const runsExpected = cellsExpected * job.seedIndices.length;
  const seen = new Set<number>();
  for (const row of rows) {
    seen.add(row.key.axisIndex);
  }
  const dt = job.base.dt ?? DEFAULT_CONFIG.dt;
  const horizonSeconds = job.measurement.forecastHorizonSteps * dt;
  const rowSemantics =
    options.granularity === "cell"
      ? "# rows: one row per axis value, aggregated over that value's seeds"
      : "# rows: one row per run: one axis value at one seed";

  const lines: string[] = [
    `# ${INVENTED_CROWD_DISCLOSURE}`,
    `# generated: ${options.generatedAtIso}`,
    rowSemantics,
  ];
  for (const line of axisSentence(job)) {
    lines.push(line);
  }
  lines.push(`# seeds: seed = ${job.baseSeed} + ${job.seedStride} x seed index`);
  lines.push(`# seed indices: ${job.seedIndices.join(", ")}`);
  lines.push(`# treatment: ${treatmentSentence(job)}`);
  lines.push(
    `# forecast horizon: ${job.measurement.forecastHorizonSteps} steps ` +
      `(${horizonSeconds.toFixed(2)} s); forecaster evaluated at step ${job.measurement.forecastEndStep}`,
  );
  lines.push(bandSentence(job));
  lines.push(floorSentence(job));
  lines.push(
    `# zero-effect reference run: ${job.zeroReferenceRun ? "measured at each axis value" : "not measured"}`,
  );
  lines.push(`# completeness: ${seen.size} of ${cellsExpected} axis values returned at least one run`);
  lines.push(`# completeness: ${rows.length} of ${runsExpected} runs returned`);
  lines.push(
    '# marker "censored: ...": the measurement ran and no value existed for this room; the reason follows the colon',
  );
  lines.push(
    '# marker "not applicable: ...": the quantity does not exist under this experiment\'s design; the reason follows the colon',
  );
  lines.push(`# marker "${NO_RUNS}": no run in this cell reported this column at all`);
  lines.push(`# marker "${NO_SPREAD}": fewer than two runs survived, so a spread would be invented`);
  return lines;
}

function unitSuffix(unit: UnitKey): string {
  if (unit === "none") {
    return "";
  }
  return ` (${unit})`;
}

function cellRows(job: SweepJob, rows: readonly RunRow[]): readonly string[] {
  const grouped = accumulate(rows, job.columns);
  const header: string[] = [csvField(job.axis === null ? "setting" : AXES[job.axis].label)];
  for (const key of job.columns) {
    const descriptor = COLUMNS[key];
    const name = `${descriptor.label}${unitSuffix(descriptor.unit)}`;
    header.push(csvField(name));
    header.push(csvField(`${name}, spread across seeds`));
    header.push(csvField(`${name}, runs used`));
    header.push(csvField(`${name}, runs attempted`));
  }

  const indices: number[] = [];
  for (const axisIndex of grouped.keys()) {
    indices.push(axisIndex);
  }
  indices.sort((a, b) => a - b);

  const out: string[] = [header.join(",")];
  for (const axisIndex of indices) {
    const byColumn = grouped.get(axisIndex);
    const axisValue = job.axisValues[axisIndex];
    const fields: string[] = [axisValue === undefined ? "" : String(axisValue)];
    for (const key of job.columns) {
      const entry = byColumn === undefined ? undefined : byColumn[key];
      for (const field of aggregateFields(key, entry)) {
        fields.push(field);
      }
    }
    out.push(fields.join(","));
  }
  return out;
}

function runRows(job: SweepJob, rows: readonly RunRow[]): readonly string[] {
  const header: string[] = [
    csvField(job.axis === null ? "setting" : AXES[job.axis].label),
    csvField("seed index"),
    csvField("seed"),
  ];
  for (const key of job.columns) {
    const descriptor = COLUMNS[key];
    header.push(csvField(`${descriptor.label}${unitSuffix(descriptor.unit)}`));
  }

  const sorted: RunRow[] = [...rows];
  sorted.sort((a, b) => {
    if (a.key.axisIndex !== b.key.axisIndex) {
      return a.key.axisIndex - b.key.axisIndex;
    }
    return a.key.seedIndex - b.key.seedIndex;
  });

  const out: string[] = [header.join(",")];
  for (const row of sorted) {
    const fields: string[] = [
      String(row.key.axisValue),
      String(row.key.seedIndex),
      String(seedFor(job, row.key.seedIndex)),
    ];
    for (const key of job.columns) {
      fields.push(readingField(key, row));
    }
    out.push(fields.join(","));
  }
  return out;
}

export function toCsv(job: SweepJob, rows: readonly RunRow[], options: CsvOptions): string {
  const lines: string[] = [...provenance(job, rows, options)];
  const body = options.granularity === "cell" ? cellRows(job, rows) : runRows(job, rows);
  for (const line of body) {
    lines.push(line);
  }
  return `${lines.join("\n")}\n`;
}
