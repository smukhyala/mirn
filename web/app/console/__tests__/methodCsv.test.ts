import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { makeReading } from "../../../engine/job/columns.js";
import { FAMILIES, FAMILY_ORDER, type FamilyKey } from "../../../engine/job/families.js";
import {
  aggregateProbe,
  makeFamilyProbeSettings,
  type FamilyProbe,
  type FamilyProbeSeed,
  type FamilyProbeSettings,
} from "../../../engine/job/familyProbe.js";
import type { SuppliedOutcome } from "../../../engine/job/supplied.js";
import {
  aggregateSuppliedProbe,
  type SuppliedProbe,
  type SuppliedProbeSeed,
} from "../../../engine/job/suppliedProbe.js";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";
import { makeComparison, type Comparison } from "../comparison.js";
import { BENCH_VERSION, DISCLOSURE_CLAUSES, crowdModelLine } from "../csv.js";
import { comparisonCsv, familyProbeCsv, suppliedProbeCsv } from "../methodCsv.js";

/**
 * What the method card's and the comparison's files have to say before they say a number.
 *
 * ## Why the rooms are hand-built here
 *
 * `familyProbe.slow.test.ts` runs the real simulator and is where "what does this ruler read" is
 * settled. Nothing here re-asks it, and nothing here runs the simulator: what is being tested is
 * the file — its first line, its provenance, its escaping, and what it writes for a room nothing
 * was read on. Those need a measurement whose counts are known in advance and which contains a
 * failed room and an inconsistent one, which the simulator will not produce on demand. So the
 * per-room readings are frozen literals and the counting is still the engine's own:
 * `aggregateProbe` and `aggregateSuppliedProbe` do the tallying, so no count in any fixture below
 * is a number somebody typed beside the rooms it is supposed to describe.
 *
 * ## The three obligations, checked on all three exports rather than on one
 *
 * A file outlives the page it came from, so each export carries the disclosure on line one, names
 * the crowd that produced it, and records what it was run at. Three exports and one loop: an
 * obligation checked on the export somebody remembered is an obligation the next export will not
 * have.
 */

const BAND_M = 0.084;
const PEAK_BAND_M = 0.211;

/** Four rooms of the zero-effect world, the same four for every ruler in the file. */
const SEEDS: readonly number[] = Object.freeze([20260827, 20268746, 20276665, 20284584]);

const SETTINGS: FamilyProbeSettings = makeFamilyProbeSettings({
  seeds: SEEDS,
  bandReplicates: 2,
});

/** The same rooms, run under the other crowd this bench has. */
const SECOND_CROWD_SETTINGS: FamilyProbeSettings = makeFamilyProbeSettings({
  base: { crowdModel: "anticipatory" },
  seeds: SEEDS,
  bandReplicates: 2,
});

/** A reason with a comma in it, planted so the escaping has something to survive. */
const COMMA_REASON = "the horizon ran past the episode, so there was nothing left to compare";

function familyRoom(seed: number, valueM: number): FamilyProbeSeed {
  return Object.freeze({
    kind: "familyProbeSeed" as const,
    seed,
    reading: makeReading(valueM, { kind: "measured" }),
    bandM: BAND_M,
    peakBandM: PEAK_BAND_M,
    truthM: 0,
    truthUnderBand: true,
    // The engine's own rule, not a hand-typed flag: a reading clears the line when it is above it.
    clearedBand: valueM > BAND_M,
  });
}

/** A room the ruler could not measure at all. Carries NaN, which is what must never be written. */
function censoredRoom(seed: number, why: string): FamilyProbeSeed {
  return Object.freeze({
    kind: "familyProbeSeed" as const,
    seed,
    reading: makeReading(Number.NaN, { kind: "censored", why }),
    bandM: BAND_M,
    peakBandM: PEAK_BAND_M,
    truthM: 0,
    truthUnderBand: true,
    clearedBand: false,
  });
}

function suppliedRoom(seed: number, outcome: SuppliedOutcome): SuppliedProbeSeed {
  let clearedBand = false;
  if (outcome.kind === "read") {
    clearedBand = outcome.valueM > BAND_M;
  }
  return Object.freeze({
    kind: "suppliedProbeSeed" as const,
    seed,
    outcome,
    bandM: BAND_M,
    peakBandM: PEAK_BAND_M,
    truthM: 0,
    truthUnderBand: true,
    clearedBand,
  });
}

function read(valueM: number): SuppliedOutcome {
  return Object.freeze({ kind: "read" as const, valueM });
}

function failedOutcome(message: string): SuppliedOutcome {
  return Object.freeze({ kind: "failed" as const, message });
}

function nondeterministic(firstM: number, secondM: number): SuppliedOutcome {
  return Object.freeze({ kind: "nondeterministic" as const, firstM, secondM });
}

function familyProbeOf(key: FamilyKey, values: readonly number[]): FamilyProbe {
  const rooms: FamilyProbeSeed[] = [];
  for (let i = 0; i < SEEDS.length; i++) {
    rooms.push(familyRoom(SEEDS[i] ?? 0, values[i] ?? 0));
  }
  return aggregateProbe(FAMILIES[key], rooms);
}

function suppliedProbeOf(outcomes: readonly SuppliedOutcome[]): SuppliedProbe {
  const rooms: SuppliedProbeSeed[] = [];
  for (let i = 0; i < SEEDS.length; i++) {
    rooms.push(suppliedRoom(SEEDS[i] ?? 0, outcomes[i] ?? read(0)));
  }
  return aggregateSuppliedProbe(rooms);
}

/** What each ruler read on the four rooms, in the shape `comparison.test.ts` uses. */
const READINGS: Readonly<Record<FamilyKey, readonly number[]>> = Object.freeze({
  pairedShared: Object.freeze([0, 0, 0, 0]),
  unpairedSeparate: Object.freeze([0.412, 0.388, 0.051, 0.507]),
  forecastCounterfactual: Object.freeze([0.214, 0.032, 0.198, 0.041]),
  noCounterfactual: Object.freeze([18.42, 17.98, 18.66, 18.11]),
});

/** The reader's own method: one room read and cleared, one failed with a comma in its reason,
 *  one answered twice differently, one read and did not clear. */
const YOURS: readonly SuppliedOutcome[] = Object.freeze([
  read(0.128),
  failedOutcome(COMMA_REASON),
  nondeterministic(0.21, 0.22),
  read(0.019),
]);

const FAMILY_PROBE: FamilyProbe = familyProbeOf("unpairedSeparate", READINGS.unpairedSeparate);

/** The same ruler with one room it could not measure, and the reason carries a comma. */
const FAMILY_PROBE_WITH_HOLE: FamilyProbe = aggregateProbe(FAMILIES.forecastCounterfactual, [
  familyRoom(SEEDS[0] ?? 0, 0.214),
  censoredRoom(SEEDS[1] ?? 0, COMMA_REASON),
  familyRoom(SEEDS[2] ?? 0, 0.198),
  familyRoom(SEEDS[3] ?? 0, 0.041),
]);

const SUPPLIED_PROBE: SuppliedProbe = suppliedProbeOf(YOURS);

function familiesFrom(): ReadonlyMap<FamilyKey, FamilyProbe> {
  const out = new Map<FamilyKey, FamilyProbe>();
  for (const key of FAMILY_ORDER) {
    out.set(key, familyProbeOf(key, READINGS[key]));
  }
  return out;
}

const COMPARISON: Comparison = makeComparison({
  families: familiesFrom(),
  supplied: SUPPLIED_PROBE,
  settings: SETTINGS,
});

/* --------------------------------------------------------------------------------------------
 * Reading a CSV back, which is a thing this test does and the product deliberately does not.
 * Guardrail 11's surviving clause is about the PRODUCT: nothing under `web/` parses a CSV, and a
 * splitter that exists only inside a test is not an input path. It is here because "the escaping
 * survives" is a claim about round-tripping and cannot be checked by looking at the text.
 * ------------------------------------------------------------------------------------------ */

function splitRow(line: string): readonly string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  let i = 0;
  while (i < line.length) {
    const ch = line.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (line.charAt(i + 1) === '"') {
          current = current + '"';
          i = i + 2;
          continue;
        }
        quoted = false;
        i = i + 1;
        continue;
      }
      current = current + ch;
      i = i + 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i = i + 1;
      continue;
    }
    if (ch === ",") {
      fields.push(current);
      current = "";
      i = i + 1;
      continue;
    }
    current = current + ch;
    i = i + 1;
  }
  fields.push(current);
  return fields;
}

/** Everything above the blank line: prose about the file, never part of the table. */
function preambleOf(text: string): readonly string[] {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("#")) {
      lines.push(line);
    }
  }
  return lines;
}

/** The table: the header row first, then one row per room or per ruler. */
function tableOf(text: string): readonly (readonly string[])[] {
  const rows: (readonly string[])[] = [];
  for (const line of text.split("\n")) {
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    rows.push(splitRow(line));
  }
  return rows;
}

function headerOf(text: string): readonly string[] {
  return tableOf(text)[0] ?? [];
}

function dataRowsOf(text: string): readonly (readonly string[])[] {
  return tableOf(text).slice(1);
}

interface Export {
  readonly name: string;
  readonly text: string;
  /** How many rows the table should have: one per room, or one per ruler. */
  readonly expectedRows: number;
}

const EXPORTS: readonly Export[] = Object.freeze([
  {
    name: "a described family's rooms",
    text: familyProbeCsv(FAMILY_PROBE, SETTINGS),
    expectedRows: SEEDS.length,
  },
  {
    name: "a described family with a room it could not measure",
    text: familyProbeCsv(FAMILY_PROBE_WITH_HOLE, SETTINGS),
    expectedRows: SEEDS.length,
  },
  {
    name: "the reader's own method's rooms",
    text: suppliedProbeCsv(SUPPLIED_PROBE, SETTINGS),
    expectedRows: SEEDS.length,
  },
  {
    name: "the comparison",
    text: comparisonCsv(COMPARISON, SETTINGS),
    expectedRows: COMPARISON.ordered.length + COMPARISON.notDetecting.length,
  },
]);

describe("every export discloses before it reports", () => {
  it("puts the invented-crowd line on line 1, before any header or number", () => {
    let scanned = 0;
    for (const entry of EXPORTS) {
      const first = entry.text.split("\n")[0] ?? "";
      for (const clause of DISCLOSURE_CLAUSES) {
        expect(first, `${entry.name} drops the clause "${clause}"`).toContain(clause);
      }
      scanned = scanned + 1;
    }
    expect(scanned, "no export was scanned").toBe(EXPORTS.length);
    expect(DISCLOSURE_CLAUSES.length, "the clause list is empty").toBeGreaterThan(3);
  });

  it("would fail if line one were dropped, rather than finding the sentence further down", () => {
    // The test that tests the test. A disclosure check that read the whole file would pass just as
    // happily with the sentence buried under the table, which is the one place guardrail 1 says it
    // must not be.
    const text = familyProbeCsv(FAMILY_PROBE, SETTINGS);
    const withoutFirst = text.split("\n").slice(1).join("\n");
    const first = withoutFirst.split("\n")[0] ?? "";
    let missed = 0;
    for (const clause of DISCLOSURE_CLAUSES) {
      if (!first.includes(clause)) {
        missed = missed + 1;
      }
    }
    expect(missed, "dropping line one changed nothing, so the check reads the wrong line").toBe(
      DISCLOSURE_CLAUSES.length,
    );
    // And the file it was cut from really did carry them, so the count above is not vacuous.
    const intact = text.split("\n")[0] ?? "";
    for (const clause of DISCLOSURE_CLAUSES) {
      expect(intact).toContain(clause);
    }
  });

  it("names the crowd that produced the rows, which the static disclosure cannot", () => {
    for (const entry of EXPORTS) {
      expect(entry.text, entry.name).toContain(crowdModelLine("socialForce"));
      expect(entry.text, entry.name).not.toContain(crowdModelLine("anticipatory"));
    }
  });

  it("names the second crowd when the rooms were run under the second crowd", () => {
    const second: readonly string[] = Object.freeze([
      familyProbeCsv(FAMILY_PROBE, SECOND_CROWD_SETTINGS),
      suppliedProbeCsv(SUPPLIED_PROBE, SECOND_CROWD_SETTINGS),
      comparisonCsv(COMPARISON, SECOND_CROWD_SETTINGS),
    ]);
    expect(SECOND_CROWD_SETTINGS.base.crowdModel).toBe("anticipatory");
    for (const text of second) {
      expect(text).toContain(crowdModelLine("anticipatory"));
      expect(text).not.toContain(crowdModelLine("socialForce"));
    }
  });
});

describe("every export records what produced it", () => {
  it("carries the bench version, so a number taken before a formula change can be placed", () => {
    for (const entry of EXPORTS) {
      const preamble = preambleOf(entry.text).join("\n");
      expect(preamble, entry.name).toContain(`bench version: ${BENCH_VERSION}`);
    }
    // Not an empty string dressed up as a version.
    expect(BENCH_VERSION.length).toBeGreaterThan(0);
  });

  it("keeps that version the same string the package itself declares", () => {
    // The version's own docblock claims it matches `package.json`, and a claim nobody checks is
    // the drift this repository has removed twice already. Two strings that must agree get one
    // test between them rather than a second place to edit.
    const here = dirname(fileURLToPath(import.meta.url));
    const manifest = readFileSync(join(here, "..", "..", "..", "..", "package.json"), "utf8");
    const declared: unknown = JSON.parse(manifest);
    const version =
      typeof declared === "object" && declared !== null && "version" in declared
        ? (declared as { readonly version: unknown }).version
        : null;
    expect(typeof version, "the package declares no version").toBe("string");
    expect(version).toBe(BENCH_VERSION);
  });

  it("carries how many rooms and how many runs stand behind each drift line", () => {
    for (const entry of EXPORTS) {
      const preamble = preambleOf(entry.text).join("\n");
      expect(preamble, entry.name).toContain(`rooms measured: ${String(SEEDS.length)}`);
      expect(preamble, entry.name).toContain(
        `runs behind each drift line: ${String(SETTINGS.bandReplicates)}`,
      );
    }
  });

  it("carries the seeds themselves, and they are the settings' own", () => {
    // A count of rooms says how precise a number is; the seeds say which rooms, which is what makes
    // the file reproducible rather than merely described.
    const expected: string[] = [];
    for (const seed of SETTINGS.seeds) {
      expected.push(String(seed));
    }
    for (const entry of EXPORTS) {
      const preamble = preambleOf(entry.text).join("\n");
      expect(preamble, entry.name).toContain(`room seeds: ${expected.join(", ")}`);
      for (const seed of expected) {
        expect(preamble, `${entry.name} lost seed ${seed}`).toContain(seed);
      }
    }
    expect(expected.length).toBe(SEEDS.length);
  });

  it("carries a different seed list when a different set of rooms was run", () => {
    const fewer = makeFamilyProbeSettings({
      seeds: [SEEDS[0] ?? 0, SEEDS[1] ?? 0],
      bandReplicates: 3,
    });
    const probe = aggregateProbe(FAMILIES.pairedShared, [
      familyRoom(SEEDS[0] ?? 0, 0),
      familyRoom(SEEDS[1] ?? 0, 0),
    ]);
    const preamble = preambleOf(familyProbeCsv(probe, fewer)).join("\n");
    expect(preamble).toContain("rooms measured: 2");
    expect(preamble).toContain("runs behind each drift line: 3");
    expect(preamble).toContain(`room seeds: ${String(SEEDS[0])}, ${String(SEEDS[1])}`);
    expect(preamble).not.toContain(String(SEEDS[3]));
  });
});

describe("the table is one row per room, or one row per ruler", () => {
  it("writes exactly that many rows, under exactly one header", () => {
    for (const entry of EXPORTS) {
      const rows = dataRowsOf(entry.text);
      expect(rows.length, `${entry.name} wrote the wrong number of rows`).toBe(entry.expectedRows);
    }
  });

  it("gives every row the same number of fields as the header", () => {
    for (const entry of EXPORTS) {
      const width = headerOf(entry.text).length;
      expect(width, `${entry.name} has no header`).toBeGreaterThan(3);
      for (const row of dataRowsOf(entry.text)) {
        expect(row.length, `${entry.name}: a row is not the header's width`).toBe(width);
      }
    }
  });

  it("writes the rooms in the order they were run, named by their own seeds", () => {
    const rows = dataRowsOf(familyProbeCsv(FAMILY_PROBE, SETTINGS));
    for (let i = 0; i < SEEDS.length; i++) {
      expect(rows[i]?.[0]).toBe(String(SEEDS[i]));
    }
    const supplied = dataRowsOf(suppliedProbeCsv(SUPPLIED_PROBE, SETTINGS));
    for (let i = 0; i < SEEDS.length; i++) {
      expect(supplied[i]?.[0]).toBe(String(SEEDS[i]));
    }
  });

  it("writes one row per ruler, the ordered ones and the one kept out of the ordering", () => {
    const rows = dataRowsOf(comparisonCsv(COMPARISON, SETTINGS));
    const names: string[] = [];
    for (const row of rows) {
      names.push(row[0] ?? "");
    }
    for (const row of COMPARISON.ordered) {
      expect(names, `${row.name} is missing from the file`).toContain(row.name);
    }
    for (const row of COMPARISON.notDetecting) {
      // Kept out of the ORDER on the page, never out of the file: an absence a reader cannot see
      // is worse than a row they can read the note beside.
      expect(names, `${row.name} is missing from the file`).toContain(row.name);
    }
    expect(COMPARISON.notDetecting.length).toBeGreaterThan(0);
    expect(names.length).toBe(COMPARISON.ordered.length + COMPARISON.notDetecting.length);
  });

  it("keeps the readings a described family measured, to a fixed number of places", () => {
    const rows = dataRowsOf(familyProbeCsv(FAMILY_PROBE, SETTINGS));
    expect(rows[0]?.[1]).toBe("0.412");
    expect(rows[2]?.[1]).toBe("0.051");
    // The drift line and the true effect stand beside every reading, so no metre is alone.
    expect(rows[0]?.[2]).toBe("0.084");
    expect(rows[0]?.[3]).toBe("0.000");
    // And the clearing is the engine's own comparison, written as a word rather than a number.
    expect(rows[0]?.[4]).toBe("yes");
    expect(rows[2]?.[4]).toBe("no");
  });
});

describe("a room nothing was read on writes no number and does write a reason", () => {
  it("leaves the reading empty for a room the family could not measure", () => {
    const rows = dataRowsOf(familyProbeCsv(FAMILY_PROBE_WITH_HOLE, SETTINGS));
    const hole = rows[1];
    expect(hole?.[0]).toBe(String(SEEDS[1]));
    expect(hole?.[1], "a reading was written for a room that produced none").toBe("");
    expect(hole?.[4], "a room nothing was read on was recorded as not clearing the line").toBe("");
    expect(hole?.[5]).toContain(COMMA_REASON);
    // The rooms either side of it still carry their numbers.
    expect(rows[0]?.[1]).toBe("0.214");
    expect(rows[2]?.[1]).toBe("0.198");
  });

  it("leaves the reading empty for a room the reader's method stopped on", () => {
    const rows = dataRowsOf(suppliedProbeCsv(SUPPLIED_PROBE, SETTINGS));
    const stopped = rows[1];
    expect(stopped?.[1]).toBe("");
    expect(stopped?.[4]).toBe("");
    expect(stopped?.[5]).toContain("the method stopped");
    expect(stopped?.[5]).toContain(COMMA_REASON);
  });

  it("leaves the reading empty for a room the method answered twice differently on", () => {
    const rows = dataRowsOf(suppliedProbeCsv(SUPPLIED_PROBE, SETTINGS));
    const inconsistent = rows[2];
    expect(inconsistent?.[1]).toBe("");
    expect(inconsistent?.[4]).toBe("");
    expect(inconsistent?.[5]).toContain("answered twice differently");
    // Neither of the two answers is written anywhere on the row: neither of them is its reading.
    for (const field of inconsistent ?? []) {
      expect(field).not.toContain("0.21");
      expect(field).not.toContain("0.22");
    }
  });

  it("writes the three letters of an unmeasured number nowhere at all", () => {
    // The failure this rule exists to stop: a spreadsheet reads them as a label, a plot reads them
    // as a hole, and a reader reads them as a fault in the exporter rather than as a room the
    // ruler could not measure.
    let scanned = 0;
    for (const entry of EXPORTS) {
      expect(entry.text, entry.name).not.toContain("NaN");
      expect(entry.text.toLowerCase(), entry.name).not.toContain("nan,");
      scanned = scanned + 1;
    }
    expect(scanned).toBe(EXPORTS.length);
    // The fixture really does carry one, so the scan above is not passing over clean data.
    expect(Number.isNaN(FAMILY_PROBE_WITH_HOLE.perSeed[1]?.reading.value ?? 0)).toBe(true);
  });

  it("says why there is no reading on a comparison row that read nothing anywhere", () => {
    const allFailed = suppliedProbeOf([
      failedOutcome(COMMA_REASON),
      failedOutcome(COMMA_REASON),
      failedOutcome(COMMA_REASON),
      failedOutcome(COMMA_REASON),
    ]);
    const comparison = makeComparison({
      families: familiesFrom(),
      supplied: allFailed,
      settings: SETTINGS,
    });
    const rows = dataRowsOf(comparisonCsv(comparison, SETTINGS));
    let seen = 0;
    for (const row of rows) {
      if ((row[1] ?? "") !== "") {
        continue;
      }
      expect(row[9], "a row with no reading gave no reason for it").not.toBe("");
      seen = seen + 1;
    }
    expect(seen, "no row read nothing, so this proved nothing").toBe(1);
  });
});

describe("a field carrying a comma survives being written and read back", () => {
  it("quotes it, so the reason cannot split a row in two", () => {
    expect(COMMA_REASON).toContain(","); // the premise
    const text = familyProbeCsv(FAMILY_PROBE_WITH_HOLE, SETTINGS);
    expect(text).toContain(`"censored: ${COMMA_REASON}"`);
    const rows = dataRowsOf(text);
    expect(rows.length).toBe(SEEDS.length);
    expect(rows[1]?.[5]).toBe(`censored: ${COMMA_REASON}`);
  });

  it("does the same for the reader's own method's own words", () => {
    const text = suppliedProbeCsv(SUPPLIED_PROBE, SETTINGS);
    const rows = dataRowsOf(text);
    expect(rows.length).toBe(SEEDS.length);
    expect(rows[1]?.[5]).toBe(`the method stopped: ${COMMA_REASON}`);
  });

  it("does the same for a comparison note, which is a paragraph with commas in it", () => {
    const rows = dataRowsOf(comparisonCsv(COMPARISON, SETTINGS));
    let seen = 0;
    for (let i = 0; i < rows.length; i++) {
      const note = rows[i]?.[8] ?? "";
      expect(note.length, `row ${i} carries no note about its count`).toBeGreaterThan(40);
      if (note.includes(",")) {
        seen = seen + 1;
      }
    }
    expect(seen, "no note carried a comma, so the escaping was never exercised").toBeGreaterThan(0);
  });

  it("would split a row if a comma-bearing field were not quoted", () => {
    // The test that tests the test. A splitter that never met an unquoted comma would report the
    // same field count whether the exporter quoted anything or not.
    expect(splitRow(`a,${COMMA_REASON},b`).length).toBeGreaterThan(3);
    expect(splitRow(`a,"${COMMA_REASON}",b`).length).toBe(3);
    expect(splitRow(`a,"${COMMA_REASON}",b`)[1]).toBe(COMMA_REASON);
    expect(splitRow('a,"he said ""stop""",b')[1]).toBe('he said "stop"');
  });
});

describe("nothing a reader meets in these files is spelled the way a program spells it", () => {
  it("names every column in plain English, never by a key", () => {
    let scanned = 0;
    for (const entry of EXPORTS) {
      for (const field of headerOf(entry.text)) {
        expect(
          CODE_IDENTIFIER.test(field),
          `${entry.name}: the heading "${field}" reads as code`,
        ).toBe(false);
        scanned = scanned + 1;
      }
    }
    expect(scanned, "no heading was scanned").toBeGreaterThan(20);
  });

  it("names no family by the key the catalogue files it under", () => {
    for (const entry of EXPORTS) {
      for (const key of FAMILY_ORDER) {
        expect(entry.text, `${entry.name} writes the bare key ${key}`).not.toContain(key);
      }
    }
    // The plain-English names are there instead, which is what makes the absence above a
    // substitution rather than a deletion.
    expect(familyProbeCsv(FAMILY_PROBE, SETTINGS)).toContain(FAMILIES.unpairedSeparate.name);
    expect(comparisonCsv(COMPARISON, SETTINGS)).toContain(FAMILIES.noCounterfactual.name);
  });

  it("writes no code identifier in any cell that is not a number", () => {
    let scanned = 0;
    for (const entry of EXPORTS) {
      for (const row of dataRowsOf(entry.text)) {
        for (const field of row) {
          if (field.length === 0) {
            continue;
          }
          if (Number.isFinite(Number(field))) {
            continue;
          }
          expect(
            CODE_IDENTIFIER.test(field),
            `${entry.name}: "${field}" reads as code`,
          ).toBe(false);
          scanned = scanned + 1;
        }
      }
    }
    expect(scanned, "no non-numeric cell was scanned").toBeGreaterThan(20);
  });

  it("writes no code identifier in the prose above the table either", () => {
    let scanned = 0;
    for (const entry of EXPORTS) {
      for (const line of preambleOf(entry.text)) {
        expect(CODE_IDENTIFIER.test(line), `${entry.name}: "${line}" reads as code`).toBe(false);
        scanned = scanned + 1;
      }
    }
    expect(scanned, "no preamble line was scanned").toBeGreaterThan(20);
  });

  it("would notice an identifier that reached a cell", () => {
    // A scan whose pattern matched nothing is indistinguishable from a file that obeys the rule.
    expect(CODE_IDENTIFIER.test("Rooms where it cleared that drift line")).toBe(false);
    expect(CODE_IDENTIFIER.test("nClearedBand")).toBe(true);
    expect(CODE_IDENTIFIER.test("supplied_run")).toBe(true);
    expect(CODE_IDENTIFIER.test("familyProbeCsv")).toBe(true);
  });
});
