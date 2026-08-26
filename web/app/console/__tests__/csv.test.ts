import { describe, expect, it } from "vitest";
import { CARD_ORDER, DRILL_CARDS, type CardKey } from "../../../engine/job/cards.js";
import { makeFloorParams, makeSweepJob } from "../../../engine/job/spec.js";
import type { SweepJob } from "../../../engine/job/spec.js";
import type { RunRow } from "../../../engine/job/stats.js";
import type { Reading } from "../../../engine/job/columns.js";
import type { DrillCall, HonestCall } from "../drill.js";
import {
  DISCLOSURE_CLAUSES,
  INVENTED_CROWD_DISCLOSURE,
  makeCsvOptions,
  makeDrillCsvEntry,
  makeDrillCsvOptions,
  toCsv,
  toDrillCsv,
} from "../csv.js";

/**
 * The CSV is the one surface that outlives the page it came from. A spreadsheet has no standing
 * disclosure line, no expander and no tile, so every obligation the console discharges by
 * adjacency this file has to discharge in text: what the crowd is, what a row means, which seeds
 * produced it, and what a marker in a numeric column stands for.
 *
 * `RunRow` is imported from `web/engine/job/stats.ts`, not `web/engine/job/runner.ts`: `runner.ts`
 * imports `RunRow` for its own `UnitOutput` field but never re-exports the name, so
 * `web/engine/job/runner.js` has no exported member `RunRow` for this file to import (the same
 * fact `web/app/worker/protocol.ts`, `web/app/worker/client.ts` and `web/app/console/state.ts`
 * already document about themselves).
 *
 * The column key used below is `forecastReportM`, not `forecastM` — the closed catalogue in
 * `columns.ts` has no `forecastM` entry, and `makeSweepJob` rejects any column key it does not
 * recognise before a single tick runs.
 */

const AT = "2026-08-22T09:41:07.000Z";

function measured(value: number): Reading {
  return { kind: "reading", value, availability: { kind: "measured" } };
}

function censored(why: string): Reading {
  return { kind: "reading", value: NaN, availability: { kind: "censored", why } };
}

function job(): SweepJob {
  return makeSweepJob({
    base: { crowd: { nPedestrians: 18 } },
    axis: "crowdSize",
    axisValues: [4, 18],
    seedIndices: [0, 1],
    baseSeed: 20260816,
    seedStride: 7919,
    measurement: {
      kind: "measurementParams",
      forecastHorizonSteps: 60,
      forecastEndStep: 200,
      nearMissThresholdM: 0.5,
      recoveryToleranceFraction: 0.2,
      recoveryDwellSteps: 20,
    },
    columns: ["trueEffectM", "forecastReportM", "runToRunBandM"],
    bandReplicates: { n: 8, scope: "perCell" },
    floor: null,
    zeroReferenceRun: true,
    frechet: false,
  });
}

function rows(): readonly RunRow[] {
  return [
    {
      kind: "runRow",
      key: { axisIndex: 0, axisValue: 4, seedIndex: 0 },
      readings: {
        trueEffectM: measured(0.153),
        forecastReportM: measured(0.201),
        runToRunBandM: measured(0.172),
      },
    },
    {
      kind: "runRow",
      key: { axisIndex: 0, axisValue: 4, seedIndex: 1 },
      readings: {
        trueEffectM: measured(0.161),
        forecastReportM: measured(0.209),
        runToRunBandM: measured(0.174),
      },
    },
    {
      kind: "runRow",
      key: { axisIndex: 1, axisValue: 18, seedIndex: 0 },
      readings: {
        trueEffectM: measured(0.352),
        forecastReportM: censored("the forecast window ended before this crowd started moving"),
        runToRunBandM: measured(0.311),
      },
    },
    {
      kind: "runRow",
      key: { axisIndex: 1, axisValue: 18, seedIndex: 1 },
      readings: {
        trueEffectM: measured(0.344),
        forecastReportM: censored("the forecast window ended before this crowd started moving"),
        runToRunBandM: measured(0.309),
      },
    },
  ];
}

describe("the CSV discloses before it reports", () => {
  it("puts the invented-crowd line on line 1, before any header or number", () => {
    const text = toCsv(job(), rows(), makeCsvOptions({ generatedAtIso: AT }));
    const lines = text.split("\n");
    expect(lines[0]).toBe(`# ${INVENTED_CROWD_DISCLOSURE}`);
    for (const clause of DISCLOSURE_CLAUSES) {
      expect(lines[0]).toContain(clause);
    }
  });

  it("carries every provenance field the numbers cannot be read without", () => {
    const text = toCsv(job(), rows(), makeCsvOptions({ generatedAtIso: AT }));
    const header = text.split("\n").filter((line) => line.startsWith("#")).join("\n");

    expect(header).toContain("generated: 2026-08-22T09:41:07.000Z");
    expect(header).toContain("one row per axis value, aggregated over that value's seeds");
    expect(header).toContain("varying: how many people are in the room");
    expect(header).toContain("values: 4, 18");
    expect(header).toContain("seed = 20260816 + 7919 x seed index");
    expect(header).toContain("seed indices: 0, 1");
    expect(header).toContain("the same room run twice, once with a robot and once without");
    expect(header).toContain("forecast horizon: 60 steps (3.00 s)");
    expect(header).toContain("forecaster evaluated at step 200");
    expect(header).toContain("run-to-run band: 8 replicates, measured once per axis value");
    expect(header).toContain("detection floor: not measured");
    expect(header).toContain("completeness: 2 of 2 axis values returned at least one run");
    expect(header).toContain("completeness: 4 of 4 runs returned");
    expect(header).toContain('marker "censored:');
    expect(header).toContain('marker "not applicable:');
    expect(header).toContain('marker "no runs"');
    expect(header).toContain('marker "spread not defined below two runs"');
  });

  it("exports a censored cell as its reason and never as a bare number", () => {
    const text = toCsv(job(), rows(), makeCsvOptions({ generatedAtIso: AT }));
    const dataLines = text.split("\n").filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(dataLines.length).toBe(3); // one header row, two cells

    const cell18 = dataLines[2] as string;
    expect(cell18).toContain("censored: the forecast window ended before this crowd started moving");
    // The reason is in the value field, so nothing downstream can read a number out of it.
    const fields = cell18.split(",");
    for (const field of fields) {
      if (field.includes("censored")) {
        expect(Number.isNaN(Number(field.replaceAll('"', "")))).toBe(true);
      }
    }
  });

  it("names every column in plain English, never by its key", () => {
    const text = toCsv(job(), rows(), makeCsvOptions({ generatedAtIso: AT }));
    const headerRow = text.split("\n").filter((l) => l.length > 0 && !l.startsWith("#"))[0] as string;
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    expect(identifier.exec(headerRow)).toBeNull();
  });

  it("exports per seed as a free variant, one row per run, with the seed spelled out", () => {
    const text = toCsv(job(), rows(), makeCsvOptions({ granularity: "run", generatedAtIso: AT }));
    const header = text.split("\n").filter((line) => line.startsWith("#")).join("\n");
    expect(header).toContain("one row per run: one axis value at one seed");

    const dataLines = text.split("\n").filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(dataLines.length).toBe(5); // header row plus four runs
    expect(dataLines[1]).toContain("20260816");
    expect(dataLines[2]).toContain("20268735");
  });

  it("quotes a field containing a comma so the reason cannot split a row", () => {
    const withComma: readonly RunRow[] = [
      {
        kind: "runRow",
        key: { axisIndex: 0, axisValue: 4, seedIndex: 0 },
        readings: { trueEffectM: censored("nobody moved, so there was nothing to difference") },
      },
    ];
    const text = toCsv(job(), withComma, makeCsvOptions({ generatedAtIso: AT }));
    expect(text).toContain('"censored: nobody moved, so there was nothing to difference"');
  });

  it("shows a real number, not a reason, when only some seeds in a cell were measured", () => {
    const mixed: readonly RunRow[] = [
      {
        kind: "runRow",
        key: { axisIndex: 0, axisValue: 4, seedIndex: 0 },
        readings: { trueEffectM: measured(0.2) },
      },
      {
        kind: "runRow",
        key: { axisIndex: 0, axisValue: 4, seedIndex: 1 },
        readings: {
          trueEffectM: censored("the person never settled in this run, so there is nothing to compare"),
        },
      },
    ];
    const text = toCsv(job(), mixed, makeCsvOptions({ generatedAtIso: AT }));
    const dataLines = text.split("\n").filter((line) => line.length > 0 && !line.startsWith("#"));
    const cell4 = dataLines[1] as string;
    const fields = cell4.split(",");

    // The mean over the one surviving seed is a real, usable number: rule 2's own example
    // ("a mean that averaged 4 of 18 people and says so is honest") is exactly this case, and a
    // partially-censored cell keeps its number rather than losing it to a reason string — only a
    // FULLY censored cell (no surviving seed at all) does that.
    expect(fields[1]).toBe("0.200");
    expect(fields[3]).toBe("1"); // runs used
    expect(fields[4]).toBe("2"); // runs attempted
    expect(cell4).not.toContain("censored");
  });

  it("keeps the fraction in a count column's mean, rather than rounding it into a whole number", () => {
    // Two seeds recorded 1 and 2 near-miss episodes; the mean is 1.5. Individual readings are
    // whole numbers, but a mean over seeds is not, and rounding it to "2" claims a certainty the
    // data does not have — the same failure class as a mean with no denominator.
    const countJob = makeSweepJob({
      base: { crowd: { nPedestrians: 18 } },
      axis: "crowdSize",
      axisValues: [4],
      seedIndices: [0, 1],
      baseSeed: 20260816,
      seedStride: 7919,
      measurement: {
        kind: "measurementParams",
        forecastHorizonSteps: 60,
        forecastEndStep: 200,
        nearMissThresholdM: 0.5,
        recoveryToleranceFraction: 0.2,
        recoveryDwellSteps: 20,
      },
      columns: ["nearMissEpisodes"],
      bandReplicates: null,
      floor: null,
      zeroReferenceRun: false,
      frechet: false,
    });
    const countRows: readonly RunRow[] = [
      {
        kind: "runRow",
        key: { axisIndex: 0, axisValue: 4, seedIndex: 0 },
        readings: { nearMissEpisodes: measured(1) },
      },
      {
        kind: "runRow",
        key: { axisIndex: 0, axisValue: 4, seedIndex: 1 },
        readings: { nearMissEpisodes: measured(2) },
      },
    ];
    const text = toCsv(countJob, countRows, makeCsvOptions({ generatedAtIso: AT }));
    const dataLines = text.split("\n").filter((line) => line.length > 0 && !line.startsWith("#"));
    const fields = (dataLines[1] as string).split(",");
    expect(fields[1]).toBe("1.5");
  });

  it("spells out the detection floor's parameters when one was measured, not just 'not measured'", () => {
    const jobWithFloor = makeSweepJob({
      base: { crowd: { nPedestrians: 18 } },
      axis: "crowdSize",
      axisValues: [4],
      seedIndices: [0],
      baseSeed: 20260816,
      seedStride: 7919,
      measurement: {
        kind: "measurementParams",
        forecastHorizonSteps: 60,
        forecastEndStep: 200,
        nearMissThresholdM: 0.5,
        recoveryToleranceFraction: 0.2,
        recoveryDwellSteps: 20,
      },
      columns: ["trueEffectM"],
      bandReplicates: null,
      floor: makeFloorParams({ nSplits: 20, alpha: 0.05, strideSteps: 4, permutationSeed: 7 }),
      zeroReferenceRun: false,
      frechet: false,
    });
    const floorRows: readonly RunRow[] = [
      {
        kind: "runRow",
        key: { axisIndex: 0, axisValue: 4, seedIndex: 0 },
        readings: { trueEffectM: measured(0.2) },
      },
    ];
    const text = toCsv(jobWithFloor, floorRows, makeCsvOptions({ generatedAtIso: AT }));
    const header = text.split("\n").filter((line) => line.startsWith("#")).join("\n");
    expect(header).toContain("detection floor: 20 splits at the 95th percentile, every 4 steps, permutation seed 7");
  });
});

/**
 * The drill's own export.
 *
 * Unlike the sweep's CSV above, a "floor" per row was asked for in this task's own brief and is not
 * written here: `web/drill.ts` never buys a detection floor for any card (`runCard` and
 * `revealCard` both pass `floor: null`), so there is no measured value to put in one. That is
 * checked directly below, alongside the disclosure and the plain-English header the sweep's export
 * is already held to.
 */
describe("the drill's own CSV discloses before it reports", () => {
  const GENERATED_AT = "2026-08-25T12:00:00.000Z";

  function entry(
    cardKey: CardKey,
    call: DrillCall,
    honest: HonestCall,
    truthM: number,
    bandM: number,
    corridorM: number,
    corridorZeroM: number,
  ) {
    return makeDrillCsvEntry({ cardKey, call, honest, truthM, bandM, corridorM, corridorZeroM });
  }

  it("puts the invented-crowd line on line 1, before any header or number", () => {
    const rows = [entry(CARD_ORDER[0] as CardKey, "bigger", "bigger", 0.4, 0.2, 0.3, 0.25)];
    const text = toDrillCsv(rows, makeDrillCsvOptions({ generatedAtIso: GENERATED_AT }));
    const lines = text.split("\n");
    expect(lines[0]).toBe(`# ${INVENTED_CROWD_DISCLOSURE}`);
    for (const clause of DISCLOSURE_CLAUSES) {
      expect(lines[0]).toContain(clause);
    }
  });

  it("says plainly that no detection floor was measured, rather than inventing one", () => {
    const rows = [entry(CARD_ORDER[0] as CardKey, "bigger", "bigger", 0.4, 0.2, 0.3, 0.25)];
    const text = toDrillCsv(rows, makeDrillCsvOptions({ generatedAtIso: GENERATED_AT }));
    const header = text.split("\n").filter((line) => line.startsWith("#")).join("\n");
    expect(header).toContain("detection floor: not measured");
    // And no row carries a bare number claiming to be one either: every field on a data row is
    // either the card's name, a plain-English word, or one of the four metres readings this file
    // actually computed.
    const dataLines = text.split("\n").filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(dataLines[0]?.split(",")).toHaveLength(8);
  });

  it("names every column in plain English, never by its key", () => {
    const rows = [entry(CARD_ORDER[0] as CardKey, "bigger", "bigger", 0.4, 0.2, 0.3, 0.25)];
    const text = toDrillCsv(rows, makeDrillCsvOptions({ generatedAtIso: GENERATED_AT }));
    const headerRow = text.split("\n").filter((l) => l.length > 0 && !l.startsWith("#"))[0] as string;
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    expect(identifier.exec(headerRow)).toBeNull();
  });

  it("writes one row per card, in the order given, with the card's plain-English name", () => {
    const rows = [
      entry(CARD_ORDER[0] as CardKey, "bigger", "smaller", 0.1, 0.2, 0.3, 0.25),
      entry(CARD_ORDER[1] as CardKey, "smaller", "smaller", 0.11, 0.22, 0.33, 0.26),
      entry(CARD_ORDER[2] as CardKey, "cannot tell", "bigger", 0.4, 0.1, 0.2, 0.05),
    ];
    const text = toDrillCsv(rows, makeDrillCsvOptions({ generatedAtIso: GENERATED_AT }));
    const dataLines = text.split("\n").filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(dataLines).toHaveLength(4); // header + three cards
    expect(dataLines[1]).toContain(DRILL_CARDS[CARD_ORDER[0] as CardKey].name);
    expect(dataLines[2]).toContain(DRILL_CARDS[CARD_ORDER[1] as CardKey].name);
    expect(dataLines[3]).toContain(DRILL_CARDS[CARD_ORDER[2] as CardKey].name);
  });

  it("marks a right call yes, a wrong call no, and a declined card its own word", () => {
    // Every one of the eight card names contains a comma ("a modest room walking briskly, a
    // moderately pushy robot" and its siblings), so `csvField` quotes it — a naive split on ","
    // would cut the name apart rather than the row. The call, the honest answer and the match
    // word are never quoted (none of the six words contains a comma), so the three run together
    // untouched regardless of how the quoted name ahead of them is written, and that is what is
    // checked here instead of splitting the row.
    const rows = [
      entry(CARD_ORDER[0] as CardKey, "bigger", "bigger", 0.4, 0.2, 0.3, 0.25),
      entry(CARD_ORDER[1] as CardKey, "bigger", "smaller", 0.1, 0.2, 0.3, 0.25),
      entry(CARD_ORDER[2] as CardKey, "cannot tell", "bigger", 0.4, 0.1, 0.2, 0.05),
    ];
    const text = toDrillCsv(rows, makeDrillCsvOptions({ generatedAtIso: GENERATED_AT }));
    const dataLines = text.split("\n").filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(dataLines[1]).toContain("bigger,bigger,yes");
    expect(dataLines[2]).toContain("bigger,smaller,no");
    expect(dataLines[3]).toContain("cannot tell,bigger,declined");
  });

  it("writes the exact row, name quoted for its own comma, readings to three decimal places", () => {
    const rows = [entry(CARD_ORDER[0] as CardKey, "bigger", "bigger", 0.4, 0.2, 0.3, 0.25)];
    const text = toDrillCsv(rows, makeDrillCsvOptions({ generatedAtIso: GENERATED_AT }));
    const dataLines = text.split("\n").filter((line) => line.length > 0 && !line.startsWith("#"));
    const cardName = DRILL_CARDS[CARD_ORDER[0] as CardKey].name;
    expect(cardName).toContain(","); // the premise of the quoting note above
    expect(dataLines[1]).toBe(`"${cardName}",bigger,bigger,yes,0.400,0.200,0.300,0.250`);
  });

  it("counts how many of the eight were called", () => {
    const rows = [entry(CARD_ORDER[0] as CardKey, "bigger", "bigger", 0.4, 0.2, 0.3, 0.25)];
    const text = toDrillCsv(rows, makeDrillCsvOptions({ generatedAtIso: GENERATED_AT }));
    const header = text.split("\n").filter((line) => line.startsWith("#")).join("\n");
    expect(header).toContain(`completeness: 1 of ${String(CARD_ORDER.length)} cards called`);
  });

  it("throws rather than accept a card key the catalogue does not have", () => {
    expect(() =>
      makeDrillCsvEntry({
        cardKey: "notACard" as unknown as CardKey,
        call: "bigger",
        honest: "bigger",
        truthM: 0.4,
        bandM: 0.2,
        corridorM: 0.3,
        corridorZeroM: 0.25,
      }),
    ).toThrow();
  });

  it("throws rather than accept a call the drill cannot record", () => {
    expect(() =>
      makeDrillCsvEntry({
        cardKey: CARD_ORDER[0] as CardKey,
        call: "maybe" as unknown as DrillCall,
        honest: "bigger",
        truthM: 0.4,
        bandM: 0.2,
        corridorM: 0.3,
        corridorZeroM: 0.25,
      }),
    ).toThrow();
  });

  it("throws rather than accept an honest answer that is not bigger or smaller", () => {
    expect(() =>
      makeDrillCsvEntry({
        cardKey: CARD_ORDER[0] as CardKey,
        call: "bigger",
        honest: "cannot tell" as unknown as HonestCall,
        truthM: 0.4,
        bandM: 0.2,
        corridorM: 0.3,
        corridorZeroM: 0.25,
      }),
    ).toThrow();
  });

  it("throws rather than accept a non-finite reading", () => {
    expect(() =>
      makeDrillCsvEntry({
        cardKey: CARD_ORDER[0] as CardKey,
        call: "bigger",
        honest: "bigger",
        truthM: Number.NaN,
        bandM: 0.2,
        corridorM: 0.3,
        corridorZeroM: 0.25,
      }),
    ).toThrow();
  });

  it("rejects an empty timestamp the same way the sweep's export does", () => {
    expect(() => makeDrillCsvOptions({ generatedAtIso: "" })).toThrow();
  });
});
