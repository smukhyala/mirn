import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { ContractError } from "../../../engine/core/errors.js";
import { makeReading } from "../../../engine/job/columns.js";
import { FAMILIES, FAMILY_ORDER, type FamilyKey } from "../../../engine/job/families.js";
import {
  aggregateProbe,
  makeFamilyProbeSettings,
  type FamilyProbe,
  type FamilyProbeSeed,
  type FamilyProbeSettings,
} from "../../../engine/job/familyProbe.js";
import { isComparison } from "../../../engine/job/questions.js";
import type { SuppliedOutcome } from "../../../engine/job/supplied.js";
import {
  aggregateSuppliedProbe,
  type SuppliedProbe,
  type SuppliedProbeSeed,
} from "../../../engine/job/suppliedProbe.js";
import { CODE_IDENTIFIER, CODE_IDENTIFIER_OR_SYNTAX } from "../../../testing/identifiers.js";
import { makeComparison, renderComparison, type Comparison } from "../comparison.js";
import { RANGE_NOT_SOUNDNESS, RATE_RANGE_CONFIDENCE, REFUSAL } from "../method.js";

/**
 * The comparison: what it says, what order it says it in, and the four things it must never say.
 *
 * ## Why the rooms are hand-built here
 *
 * `familyProbe.slow.test.ts` runs the real simulator over every family and is where the question
 * "what does this ruler actually read" is settled. Nothing here re-asks it. What is being tested is
 * the table: the order the rows come out in, which row is kept out of that order, and what the copy
 * around them is allowed to say. Those need a measurement whose counts are known in advance and
 * differ from the catalogue's declaration order, which the simulator will not produce on demand —
 * so the per-room readings are frozen literals and the counting is still the engine's own.
 * `aggregateProbe` and `aggregateSuppliedProbe` do the tallying, so no count on any fixture below
 * is a number somebody typed next to the rooms it is supposed to describe.
 *
 * ## The four things it must never say
 *
 * Guardrail 2 is what refuses here, and its failure mode is a table that reads as a league of
 * published work. Four scans below are load-bearing rather than tidy:
 *
 *   - the rows are ordered by a count of MISTAKES, descending, and the fixture is built so that
 *     order is not the catalogue's — an implementation that forgot to sort would otherwise pass;
 *   - the ruler that compares nothing is not in that order at all, and renders no headline numeral;
 *   - the refusal is rendered ABOVE the table, proved by document position rather than by reading;
 *   - no rendered word on the page is one of the leaderboard words, with a meta-test proving the
 *     scan would catch one that got in.
 */

const BAND_M = 0.084;
const PEAK_BAND_M = 0.211;

/** Four rooms of the zero-effect world, the same four for every ruler in the table. */
const SEEDS: readonly number[] = Object.freeze([20260827, 20268746, 20276665, 20284584]);

const SETTINGS: FamilyProbeSettings = makeFamilyProbeSettings({
  seeds: SEEDS,
  bandReplicates: 2,
});

/** One room a described family read: a true effect of exactly nothing, a drift line, a reading. */
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

/** One room the reader's own method was put to. Same shape, an outcome instead of a reading. */
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

/**
 * What each ruler read on the four rooms.
 *
 * Chosen so the count of mistakes runs against the catalogue's declaration order: the paired
 * family is declared first and made none of them, the unpaired family is declared second and made
 * the most. A table that rendered the catalogue's order would look plausible and be wrong, so the
 * fixture is the thing that tells the two apart.
 */
const READINGS: Readonly<Record<FamilyKey, readonly number[]>> = Object.freeze({
  // Exactly nothing on every room, which is what a shared-noise twin reads where the truth is
  // nothing. No room cleared.
  pairedShared: Object.freeze([0, 0, 0, 0]),
  // Where each person started is inside the number, and it clears the line on three of the four.
  unpairedSeparate: Object.freeze([0.412, 0.388, 0.051, 0.507]),
  // Every reason a person does not walk straight is charged to the robot: two of the four.
  forecastCounterfactual: Object.freeze([0.214, 0.032, 0.198, 0.041]),
  // How far the robot walked, in metres, against a line measured in centimetres. Every room.
  noCounterfactual: Object.freeze([18.42, 17.98, 18.66, 18.11]),
});

/** The same, with the second and third rulers tied on the count, to pin the tie-break. */
const TIED_READINGS: Readonly<Record<FamilyKey, readonly number[]>> = Object.freeze({
  ...READINGS,
  forecastCounterfactual: Object.freeze([0.311, 0.297, 0.044, 0.402]),
});

/** The reader's own method: it cleared the line on one room of the four. */
const YOURS: readonly SuppliedOutcome[] = Object.freeze([
  read(0.031),
  read(0.052),
  read(0.128),
  read(0.019),
]);

const OWN_WORDS = "the horizon was longer than the episode";

/** A method that answered two rooms and stopped on the other two. */
const YOURS_PARTIAL: readonly SuppliedOutcome[] = Object.freeze([
  read(0.037),
  failedOutcome(OWN_WORDS),
  read(0.146),
  failedOutcome(OWN_WORDS),
]);

function familiesFrom(
  readings: Readonly<Record<FamilyKey, readonly number[]>>,
): ReadonlyMap<FamilyKey, FamilyProbe> {
  const out = new Map<FamilyKey, FamilyProbe>();
  for (const key of FAMILY_ORDER) {
    out.set(key, familyProbeOf(key, readings[key]));
  }
  return out;
}

function comparisonOf(
  readings: Readonly<Record<FamilyKey, readonly number[]>>,
  outcomes: readonly SuppliedOutcome[] | null,
): Comparison {
  return makeComparison({
    families: familiesFrom(readings),
    supplied: outcomes === null ? null : suppliedProbeOf(outcomes),
    settings: SETTINGS,
  });
}

const WITH_YOURS = comparisonOf(READINGS, YOURS);
const WITHOUT_YOURS = comparisonOf(READINGS, null);
const WITH_PARTIAL = comparisonOf(READINGS, YOURS_PARTIAL);
const TIED = comparisonOf(TIED_READINGS, null);

interface Case {
  readonly name: string;
  readonly comparison: Comparison;
}

const CASES: readonly Case[] = Object.freeze([
  { name: "with the reader's own row", comparison: WITH_YOURS },
  { name: "without the reader's own row", comparison: WITHOUT_YOURS },
  { name: "with a reader's method that stopped on two rooms", comparison: WITH_PARTIAL },
  { name: "with two rulers tied on the count", comparison: TIED },
]);

function render(comparison: Comparison): HTMLElement {
  const dom = new JSDOM("<!doctype html><body></body>");
  return renderComparison(dom.window.document, comparison);
}

function rowOrder(comparison: Comparison): readonly string[] {
  const names: string[] = [];
  for (const row of comparison.ordered) {
    names.push(row.source.kind === "readersOwn" ? "yours" : row.source.family);
  }
  return names;
}

function renderedRowOrder(comparison: Comparison): readonly (string | null)[] {
  const node = render(comparison);
  return [...node.querySelectorAll("tbody tr")].map((tr) => tr.getAttribute("data-row"));
}

/** Every text node, one chunk at a time, paired with the classes of the element holding it.
 *  Not `textContent`: that joins adjacent elements with nothing between them, so a value slot and
 *  the sentence beside it concatenate and a scan reports things no reader can see. */
function leaves(node: Element): readonly { readonly text: string; readonly classes: string }[] {
  const found: { text: string; classes: string }[] = [];
  const walk = (element: Element): void => {
    for (const child of element.childNodes) {
      if (child.nodeType === 3) {
        const text = child.textContent ?? "";
        if (text.trim().length > 0) {
          found.push({ text, classes: element.className });
        }
        continue;
      }
      if (child.nodeType === 1) {
        walk(child as Element);
      }
    }
  };
  walk(node);
  return found;
}

/** The elements a digit is allowed to live inside. Everything else on this page is copy. */
const VALUE_SLOTS: readonly string[] = Object.freeze([
  "figure-number",
  "figure-unit",
  "figure-denominator",
  "figure-zero-value",
  "figure-zero-unit",
  "figure-inline",
  "stamp-value",
  "stamp-unit",
]);

function isValueSlot(classes: string): boolean {
  for (const slot of VALUE_SLOTS) {
    if (classes.split(/\s+/).includes(slot)) {
      return true;
    }
  }
  return false;
}

function textOf(node: Element | null): string {
  return node?.textContent ?? "";
}

/**
 * The words that would turn a count of mistakes into a league table.
 *
 * Matched as substrings of the lowercased page, so "ranking" is caught by "rank" and "scored" by
 * "score". That is deliberately blunt: this page has no legitimate use for any of them, and a scan
 * that had to be taught the inflections is a scan that misses one.
 */
const LEADERBOARD_WORDS: readonly string[] = Object.freeze([
  "best",
  "worst",
  "winner",
  "rank",
  "score",
  "beats",
  "better than",
]);

function leaderboardWordsIn(node: Element): readonly string[] {
  const seen: string[] = [];
  const haystack = textOf(node).toLowerCase();
  for (const word of LEADERBOARD_WORDS) {
    if (haystack.includes(word)) {
      seen.push(word);
    }
  }
  return seen;
}

describe("the rows are set out by a count of mistakes, and by nothing else", () => {
  it("orders them by that count, descending, and not by the order they are declared in", () => {
    // The assertion this fixture exists for. The catalogue declares the paired family first and it
    // made no mistakes at all; the unpaired family is declared second and made the most. A table
    // that rendered the declaration order would be plausible and wrong.
    expect(FAMILY_ORDER[0]).toBe("pairedShared");
    expect(rowOrder(WITH_YOURS)).toEqual([
      "unpairedSeparate",
      "forecastCounterfactual",
      "yours",
      "pairedShared",
    ]);
    expect(renderedRowOrder(WITH_YOURS)).toEqual([
      "unpairedSeparate",
      "forecastCounterfactual",
      "yours",
      "pairedShared",
    ]);
  });

  it("puts the counts down the column in a run that never rises", () => {
    for (const entry of CASES) {
      let previous = Number.POSITIVE_INFINITY;
      let seen = 0;
      for (const row of entry.comparison.ordered) {
        expect(row.mistakes.kind, entry.name).toBe("falsePositiveRate");
        if (row.mistakes.kind !== "falsePositiveRate") {
          continue;
        }
        expect(row.mistakes.nCleared, `${entry.name} rises at row ${seen}`).toBeLessThanOrEqual(
          previous,
        );
        previous = row.mistakes.nCleared;
        seen = seen + 1;
      }
      expect(seen, `${entry.name} ordered nothing`).toBeGreaterThan(2);
    }
  });

  it("keeps two rulers that made the same number of mistakes in the catalogue's own order", () => {
    // There is no order between them, so the one that says least is used. A tie broken by which row
    // happened to be built first would be an order the measurement did not produce.
    const tied = TIED.ordered;
    expect(rowOrder(TIED)).toEqual([
      "unpairedSeparate",
      "forecastCounterfactual",
      "pairedShared",
    ]);
    const first = tied[0];
    const second = tied[1];
    expect(first?.mistakes.kind).toBe("falsePositiveRate");
    if (first?.mistakes.kind === "falsePositiveRate" && second?.mistakes.kind === "falsePositiveRate") {
      expect(first.mistakes.nCleared).toBe(second.mistakes.nCleared);
    }
  });

  it("reads every count off the measurement rather than off a sentence", () => {
    const probes = familiesFrom(READINGS);
    for (const row of WITH_YOURS.ordered) {
      if (row.source.kind !== "describedFamily") {
        continue;
      }
      const probe = probes.get(row.source.family);
      expect(probe, row.name).toBeDefined();
      if (row.mistakes.kind === "falsePositiveRate") {
        expect(row.mistakes.nCleared).toBe(probe?.nClearedBand);
        expect(row.mistakes.nAttempted).toBe(probe?.nAttempted);
      }
      if (row.reading.kind === "suppliedReading") {
        expect(row.reading.figure.value).toBe(probe?.meanReading);
      }
      expect(row.band.value).toBe(probe?.meanBandM);
    }
  });

  it("names the rows after shapes of measurement, and the reader's own row theirs", () => {
    // Guardrail 2's second mechanical half: nothing is named after a paper or an author, so the
    // names come off the closed catalogue and the one that is not in the catalogue is called yours.
    for (const row of WITH_YOURS.ordered) {
      if (row.source.kind === "readersOwn") {
        expect(row.name.toLowerCase()).toContain("your own method");
        continue;
      }
      expect(row.name).toBe(FAMILIES[row.source.family].name);
    }
  });
});

describe("the ruler that compares nothing is not scored as a detector", () => {
  it("decides that off the family's declared ruler, not off its name", () => {
    expect(isComparison("noCounterfactual")).toBe(false);
    expect(isComparison("pairedShared")).toBe(true);
    expect(isComparison("unpairedSeparate")).toBe(true);
    expect(isComparison("forecastCounterfactual")).toBe(true);
  });

  it("keeps it out of the ordering entirely rather than placing it at one end", () => {
    // A place in an order is itself a comparison. Sorting it in and restyling it would still tell a
    // reader it made the largest number of mistakes on the page, when it is not making a claim that
    // could be mistaken at all.
    for (const entry of CASES) {
      expect(rowOrder(entry.comparison), entry.name).not.toContain("noCounterfactual");
      const loose: string[] = [];
      for (const row of entry.comparison.notDetecting) {
        expect(row.source.kind).toBe("describedFamily");
        if (row.source.kind === "describedFamily") {
          loose.push(row.source.family);
        }
      }
      expect(loose, entry.name).toEqual(["noCounterfactual"]);
      expect(renderedRowOrder(entry.comparison), entry.name).not.toContain("noCounterfactual");
    }
  });

  it("renders its count in a different shape, with no headline numeral", () => {
    const node = render(WITH_YOURS);
    const loose = node.querySelector('[data-part="not-detecting"] [data-row="noCounterfactual"]');
    expect(loose, "the ruler that compares nothing was not rendered at all").not.toBeNull();
    const clearing = loose?.querySelector('[data-number="clearing"]') ?? null;
    expect(clearing?.getAttribute("data-second")).toBe("not-a-detection");
    // The whole of the shape: the count is inside a sentence at reading size, so it cannot be
    // scanned down a column beside numbers that are counts of mistakes.
    expect(clearing?.querySelector(".figure-number"), "a headline numeral was rendered").toBeNull();
    expect(clearing?.querySelector(".method-rate-number")).toBeNull();
    expect(clearing?.querySelectorAll(".figure-inline").length).toBe(2);
    expect(textOf(clearing)).toContain("not a count of mistakes");
    expect(textOf(clearing)).toContain("no denominator that makes a rate of it");
  });

  it("still shows what it read and the line it was read against", () => {
    // It is lifted out of the ordering, not out of the page: a reader who cannot see the eighteen
    // metres cannot see why it clears a line measured in centimetres.
    const loose = render(WITH_YOURS).querySelector('[data-part="not-detecting"] .comparison-loose');
    expect(loose?.querySelector('[data-number="reading"] .figure-number')).not.toBeNull();
    expect(loose?.querySelector('[data-number="drift"] .figure-number')).not.toBeNull();
    expect(loose?.querySelector('[data-number="reading"] .figure-anchor')).not.toBeNull();
  });

  it("gives every other row the rate shape, headline numeral and all", () => {
    const node = render(WITH_YOURS);
    const cells = [...node.querySelectorAll('tbody tr [data-number="clearing"]')];
    expect(cells.length).toBe(WITH_YOURS.ordered.length);
    for (const cell of cells) {
      expect(cell.getAttribute("data-second")).toBe("false-positive-rate");
      expect(cell.querySelector(".method-rate-number")).not.toBeNull();
    }
  });
});

/**
 * The same table over eight rooms, with one ruler clearing the line on every one of them.
 *
 * Eight of eight is the count this bench produces most often and the one shape where the textbook
 * interval has no width at all, so it is the case that decides whether the range in a cell is worth
 * printing. Built beside the four-room fixture rather than replacing it: the ordering tests turn on
 * that fixture's counts, and this one exists to answer a different question.
 */
const EIGHT_SEEDS: readonly number[] = Object.freeze([
  20260827, 20268746, 20276665, 20284584, 20292503, 20300422, 20308341, 20316260,
]);

const EIGHT_SETTINGS: FamilyProbeSettings = makeFamilyProbeSettings({
  seeds: EIGHT_SEEDS,
  bandReplicates: 2,
});

/** Every one of the eight rooms read the same thing, so what a row cleared on is decided by the
 *  engine's own rule against the drift line rather than by a flag typed beside it. */
function eightRoomProbe(key: FamilyKey, valueM: number): FamilyProbe {
  const rooms: FamilyProbeSeed[] = [];
  for (const seed of EIGHT_SEEDS) {
    rooms.push(familyRoom(seed, valueM));
  }
  return aggregateProbe(FAMILIES[key], rooms);
}

const EIGHT_ROOM_READINGS: Readonly<Record<FamilyKey, number>> = Object.freeze({
  pairedShared: 0,
  // Above the drift line on all eight, which is the count the range exists for.
  unpairedSeparate: 0.412,
  forecastCounterfactual: 0,
  noCounterfactual: 18.42,
});

function comparisonOverEight(): Comparison {
  const families = new Map<FamilyKey, FamilyProbe>();
  for (const key of FAMILY_ORDER) {
    families.set(key, eightRoomProbe(key, EIGHT_ROOM_READINGS[key]));
  }
  return makeComparison({ families, supplied: null, settings: EIGHT_SETTINGS });
}

const ALL_EIGHT = comparisonOverEight();

function rangeValuesIn(node: Element | null): readonly string[] {
  const found: string[] = [];
  for (const slot of node?.querySelectorAll(".figure-range .figure-inline") ?? []) {
    found.push(slot.textContent ?? "");
  }
  return found;
}

describe("each count of mistakes says how loosely these rooms pin it down", () => {
  it("qualifies every row in the order, inside that row's own cell", () => {
    for (const entry of CASES) {
      const node = render(entry.comparison);
      const cells = [...node.querySelectorAll('tbody tr [data-number="clearing"]')];
      expect(cells.length, entry.name).toBe(entry.comparison.ordered.length);
      for (const cell of cells) {
        const range = cell.querySelector(".figure-range");
        expect(range, `${entry.name}: a count of mistakes with no range`).not.toBeNull();
        // Inside the cell it qualifies, never a column of its own. A fifth column of ranges would
        // be a second thing to run an eye down, and a reader would compare the widths.
        expect(range?.closest("[data-number]")).toBe(cell);
        expect(cell.querySelectorAll(".figure-range").length).toBe(1);
        expect(cell.querySelectorAll(".figure-zero").length).toBe(1);
      }
      // One heading per column, and the range added none: it is a qualifier, not a measurement.
      expect(node.querySelectorAll(".comparison-heading").length, entry.name).toBe(4);
      expect(node.querySelectorAll(".figure-range").length).toBe(cells.length);
    }
  });

  it("gives the ruler that is not detecting anything none at all", () => {
    // A range says how well a count of rooms pins a RATE down. This count is not a rate — the same
    // number comes back whether the robot moved everybody in the room or nobody — so a range on it
    // would score it as a detector, which is the one thing this block is set apart to avoid.
    for (const entry of CASES) {
      const loose = render(entry.comparison).querySelector('[data-part="not-detecting"]');
      expect(loose, entry.name).not.toBeNull();
      expect(loose?.querySelector(".figure-range"), entry.name).toBeNull();
      expect(loose?.querySelector(".figure-range-how"), entry.name).toBeNull();
      for (const row of entry.comparison.notDetecting) {
        expect(row.mistakes.kind).toBe("notADetection");
        expect("range" in row.mistakes, "the non-detector was given a rate's range").toBe(false);
      }
    }
  });

  it("draws each range over the same two counts its own cell is printed from", () => {
    for (const entry of CASES) {
      for (const row of entry.comparison.ordered) {
        if (row.mistakes.kind !== "falsePositiveRate") {
          continue;
        }
        const interval = row.mistakes.range.interval;
        expect(interval.nCleared, `${entry.name}: ${row.name}`).toBe(row.mistakes.nCleared);
        expect(interval.nAttempted).toBe(row.mistakes.nAttempted);
        expect(interval.confidence).toBe(RATE_RANGE_CONFIDENCE);
        expect(interval.low).toBeLessThanOrEqual(interval.point);
        expect(interval.point).toBeLessThanOrEqual(interval.high);
      }
    }
  });

  it("shows a bound well below every room for a ruler that cleared the line on all eight", () => {
    const row = ALL_EIGHT.ordered[0];
    expect(row?.source.kind === "describedFamily" && row.source.family).toBe("unpairedSeparate");
    expect(row?.mistakes.kind).toBe("falsePositiveRate");
    if (row?.mistakes.kind !== "falsePositiveRate") {
      return;
    }
    expect(row.mistakes.nCleared).toBe(8);
    expect(row.mistakes.nAttempted).toBe(8);

    const cell = render(ALL_EIGHT).querySelector(
      'tr[data-row="unpairedSeparate"] [data-number="clearing"]',
    );
    const shown = rangeValuesIn(cell);
    expect(shown.length).toBe(4);
    expect(shown[0]).toBe("8");
    const low = Number(shown[1]);
    const high = Number(shown[2]);
    // The assertion this case exists for. The cell reads eight of eight, and beneath it the page
    // shows a bound well under every room rather than a range of no width at all.
    expect(cell?.querySelector(".method-rate-number")?.textContent).toBe("8");
    expect(low).toBeLessThan(0.75);
    expect(low).toBeGreaterThan(0.6);
    expect(high).toBe(1);
    expect(high - low, "the page printed a range of no width on eight rooms").toBeGreaterThan(0.2);
    expect(Number(shown[3])).toBe(RATE_RANGE_CONFIDENCE);

    // And a row that cleared on none of the eight gets the other end of the same scale, so the
    // range is read off the count rather than printed the same everywhere.
    const clean = render(ALL_EIGHT).querySelector(
      'tr[data-row="pairedShared"] [data-number="clearing"]',
    );
    const none = rangeValuesIn(clean);
    expect(Number(none[1])).toBe(0);
    expect(Number(none[2])).toBeGreaterThan(0);
    expect(Number(none[2])).toBeLessThan(0.4);
  });

  it("says what the bounds mean and refuses to let a narrow one mean a sound ruler", () => {
    const cell = render(WITH_YOURS).querySelector('tbody tr [data-number="clearing"]');
    const said = textOf(cell?.querySelector(".figure-range") ?? null);
    expect(said).toContain("consistent with a true rate anywhere between");
    expect(said).toContain("a method that never clears the line");
    expect(said).toContain("aim to cover the true rate in");
    // Guardrail 2, in the cell rather than in a footnote: on a page whose rows are ordered by a
    // count, "this one's range is narrower" is the nearest wrong conclusion to hand.
    for (const entry of CASES) {
      for (const each of render(entry.comparison).querySelectorAll(".figure-range-how")) {
        expect(each.textContent, entry.name).toBe(RANGE_NOT_SOUNDNESS);
      }
    }
    // The reader has never seen a statistics course, so no shorthand for any of this appears.
    const whole = textOf(render(ALL_EIGHT));
    for (const shorthand of ["Wilson", "confidence interval", "CI", "p-value", "significance"]) {
      expect(whole, `the page says "${shorthand}" at a reader`).not.toContain(shorthand);
    }
  });

  it("writes none of the leaderboard words into the range's own copy either", () => {
    // The range is a new sentence on a page whose whole risk is reading as a league table, so it
    // goes through the same scan the rest of the page does rather than around it.
    for (const entry of CASES) {
      for (const range of render(entry.comparison).querySelectorAll(".figure-range")) {
        expect(leaderboardWordsIn(range), entry.name).toEqual([]);
      }
    }
    expect(leaderboardWordsIn(render(ALL_EIGHT))).toEqual([]);
  });
});

describe("the reader's own row, with and without one", () => {
  it("adds a row of theirs when a supplied measurement is in hand", () => {
    expect(rowOrder(WITH_YOURS)).toContain("yours");
    expect(WITH_YOURS.ordered.length).toBe(WITHOUT_YOURS.ordered.length + 1);
    const row = render(WITH_YOURS).querySelector('tbody tr[data-row="yours"]');
    expect(row, "the reader's own row was not rendered").not.toBeNull();
    expect(textOf(row)).toContain("Your own method");
  });

  it("renders the same table, minus that row, when there is none", () => {
    expect(rowOrder(WITHOUT_YOURS)).toEqual([
      "unpairedSeparate",
      "forecastCounterfactual",
      "pairedShared",
    ]);
    const node = render(WITHOUT_YOURS);
    expect(node.querySelector('tbody tr[data-row="yours"]')).toBeNull();
    // The four described rulers are all still there: three in the order, one out of it.
    expect(node.querySelectorAll("tbody tr").length).toBe(3);
    expect(node.querySelector('[data-part="not-detecting"]')).not.toBeNull();
  });

  it("says it cannot see what their method compares, beside their count", () => {
    // The sentence a declared ruler gets for free and a written one cannot. Without it, a reader
    // whose method returns an absolute quantity would read their own row as a count of mistakes.
    const cell = render(WITH_YOURS).querySelector('tr[data-row="yours"] [data-number="clearing"]');
    expect(textOf(cell)).toContain("cannot see what your method compares");
    expect(textOf(cell)).toContain("rather than a false alarm");
  });

  it("says so where their method read nothing on some of the rooms", () => {
    const yours = WITH_PARTIAL.ordered.find((row) => row.source.kind === "readersOwn");
    expect(yours?.nUsed).toBe(2);
    expect(yours?.nAttempted).toBe(4);
    const cell = render(WITH_PARTIAL).querySelector('tr[data-row="yours"] [data-number="clearing"]');
    expect(textOf(cell)).toContain("returned no distance at all");
  });
});

describe("every figure carries its zero and its scale", () => {
  it("shows each reading against a zero measured on the same rooms, and a body scale", () => {
    let seen = 0;
    for (const entry of CASES) {
      const node = render(entry.comparison);
      for (const cell of node.querySelectorAll('[data-number="reading"]')) {
        expect(cell.querySelector(".figure-zero-value"), entry.name).not.toBeNull();
        expect(cell.querySelector(".figure-anchor"), entry.name).not.toBeNull();
        expect(textOf(cell.querySelector(".figure-zero-how"))).toContain(
          "exactly nothing, and not nearly nothing",
        );
        seen = seen + 1;
      }
    }
    expect(seen, "no reading was scanned").toBeGreaterThan(10);
  });

  it("shows each drift line against a zero and a body scale too", () => {
    for (const entry of CASES) {
      const node = render(entry.comparison);
      for (const cell of node.querySelectorAll('[data-number="drift"]')) {
        expect(cell.querySelector(".figure-zero-value"), entry.name).not.toBeNull();
        expect(cell.querySelector(".figure-anchor"), entry.name).not.toBeNull();
        expect(textOf(cell.querySelector(".figure-zero-how"))).toContain(
          "not nothing, which is the point",
        );
      }
    }
  });

  it("shows each count of mistakes against how often the truth itself cleared that line", () => {
    for (const row of WITH_YOURS.ordered) {
      expect(row.mistakes.kind).toBe("falsePositiveRate");
      if (row.mistakes.kind === "falsePositiveRate") {
        // Measured, never typed: no room's TRUE effect cleared the line, which is what makes a
        // count of a ruler's own clearings mean anything.
        expect(row.mistakes.zeroCleared).toBe(0);
      }
    }
    const node = render(WITH_YOURS);
    for (const cell of node.querySelectorAll('tbody tr [data-number="clearing"]')) {
      expect(cell.querySelector(".figure-zero-value")).not.toBeNull();
      expect(cell.querySelector(".figure-denominator")?.textContent).toBe(String(SEEDS.length));
    }
  });

  it("names the columns once, in the same words the figures carry", () => {
    // The label lives in the heading rather than in every cell, and the two are the same string
    // rather than two strings that agree today.
    const node = render(WITH_YOURS);
    const headings = [...node.querySelectorAll(".comparison-heading")].map((h) => h.textContent);
    const first = WITH_YOURS.ordered[0];
    expect(headings.length).toBe(4);
    if (first?.reading.kind === "suppliedReading") {
      expect(headings[1]).toBe(first.reading.figure.label);
    }
    expect(headings[2]).toBe(first?.band.label);
    if (first?.mistakes.kind === "falsePositiveRate") {
      expect(headings[3]).toBe(first.mistakes.label);
    }
    expect(headings[3]).toContain("cleared that line while the truth was nothing");
  });

  it("says what it was measured at, from the settings actually used", () => {
    for (const entry of CASES) {
      const values = [...render(entry.comparison).querySelectorAll(".method-stamps .stamp-value")]
        .map((n) => n.textContent);
      expect(values[0]).toBe(String(SETTINGS.seeds.length));
      expect(values[1]).toBe(String(SETTINGS.bandReplicates));
    }
  });
});

describe("the refusal sits where the reader meets the ordering", () => {
  it("renders it above the table, in document order, and not in a footnote", () => {
    // A caveat under a table arrives after the reader has drawn the conclusion. Position is the
    // whole of the mechanism, so position is what is asserted.
    for (const entry of CASES) {
      const html = render(entry.comparison).innerHTML;
      const refusal = html.indexOf('data-part="refusal"');
      const table = html.indexOf('data-part="table"');
      expect(refusal, entry.name).toBeGreaterThan(-1);
      expect(table, entry.name).toBeGreaterThan(-1);
      expect(refusal, `${entry.name} puts the refusal below the table`).toBeLessThan(table);
      const loose = html.indexOf('data-part="not-detecting"');
      expect(loose).toBeGreaterThan(refusal);
    }
  });

  it("carries the method card's own refusal, and its own three paragraphs, unsoftened", () => {
    for (const entry of CASES) {
      const refusal = render(entry.comparison).querySelector('[data-part="refusal"]');
      for (const paragraph of REFUSAL) {
        expect(textOf(refusal), entry.name).toContain(paragraph);
      }
      const said = textOf(refusal);
      expect(said).toContain("which ruler was confounded by this invented crowd");
      expect(said).toContain("not establish which ruler you should reach for in a corridor");
      expect(said).toContain("published method is mistaken");
      expect(said).toContain("cleared the line on no room here is sound");
      expect(said).toContain("named after a paper or after a person");
    }
    expect(REFUSAL.length).toBeGreaterThan(1);
  });

  it("says what the last column counts, and that it is not a grade", () => {
    const said = textOf(render(WITH_YOURS).querySelector('[data-part="how-to-read"]'));
    expect(said).toContain("cleared the drift line while the truth was");
    expect(said).toContain("count of mistakes");
    expect(said).toContain("It is not a grade");
    expect(said).toContain("no total on this page");
    expect(said).toContain("no share");
    expect(said).toContain("no row is singled out as the one to use");
  });

  it("says the crowd is invented before any number on the page", () => {
    // Guardrail 1: the disclosure precedes every figure on the surface that shows it.
    for (const entry of CASES) {
      const html = render(entry.comparison).innerHTML;
      expect(html.indexOf("region-note")).toBeGreaterThan(-1);
      expect(html.indexOf("region-note")).toBeLessThan(html.indexOf('data-part="table"'));
      expect(html.indexOf("region-note")).toBeLessThan(html.indexOf("method-stamps"));
      expect(textOf(render(entry.comparison).querySelector(".region-note"))).toContain(
        "Simulated crowd",
      );
    }
  });
});

describe("nothing on the page reads as a table of winning methods", () => {
  it("writes none of the leaderboard words anywhere a reader can see", () => {
    let scanned = 0;
    for (const entry of CASES) {
      const node = render(entry.comparison);
      expect(leaderboardWordsIn(node), entry.name).toEqual([]);
      scanned = scanned + 1;
    }
    expect(scanned, "no page was scanned").toBe(CASES.length);
  });

  it("would notice one of those words if it got onto the page", () => {
    // The test that tests the test. A scan whose word list matched nothing is indistinguishable
    // from a page that obeys the rule.
    const dom = new JSDOM("<!doctype html><body></body>");
    const node = renderComparison(dom.window.document, WITH_YOURS);
    expect(leaderboardWordsIn(node)).toEqual([]);
    const planted = dom.window.document.createElement("p");
    planted.className = "verdict-line";
    planted.textContent = "The first row is better than the last, and is the one to beat.";
    node.appendChild(planted);
    expect(leaderboardWordsIn(node)).toEqual(["better than"]);
    const second = dom.window.document.createElement("p");
    second.textContent = "Ranked by score, the best method wins.";
    node.appendChild(second);
    expect(leaderboardWordsIn(node)).toEqual(["best", "rank", "score", "better than"]);
  });
});

describe("nothing on the table is a number somebody typed", () => {
  it("keeps every digit inside a value slot, on every case", () => {
    // The mechanical half of "no numeric literal appears in console copy". A caption quoting a
    // count into its own sentence is a claim that outlives the settings that produced it.
    let scanned = 0;
    for (const entry of CASES) {
      for (const leaf of leaves(render(entry.comparison))) {
        if (isValueSlot(leaf.classes)) {
          continue;
        }
        expect(
          /\d/.test(leaf.text),
          `${entry.name}: "${leaf.text.trim()}" carries a number in copy, in .${leaf.classes}`,
        ).toBe(false);
        scanned = scanned + 1;
      }
    }
    // Above what this page scanned before the range: every count of mistakes brought six more
    // leaves of copy with it, and a guard that did not move would not notice if they stopped
    // rendering.
    expect(scanned, "no copy was scanned").toBeGreaterThan(340);
  });

  it("would notice a digit that escaped into copy", () => {
    expect(isValueSlot("figure-note")).toBe(false);
    expect(isValueSlot("comparison-what")).toBe(false);
    expect(isValueSlot("figure-number method-rate-number")).toBe(true);
    const dom = new JSDOM("<!doctype html><body></body>");
    const planted = dom.window.document.createElement("p");
    planted.className = "figure-note";
    planted.textContent = "and this cleared it on 4 of the 4 rooms";
    const found = leaves(planted as unknown as Element);
    expect(found.length).toBe(1);
    expect(/\d/.test(found[0]?.text ?? "")).toBe(true);
  });

  it("would notice a range written into a sentence instead of into slots", () => {
    // The range is the easiest thing on this page to write out longhand — it is a sentence with
    // two numbers in it — so the scan is shown catching exactly that, in the element the range
    // renders into. Neither of its elements is a value slot.
    expect(isValueSlot("figure-range")).toBe(false);
    expect(isValueSlot("figure-range-how")).toBe(false);
    const dom = new JSDOM("<!doctype html><body></body>");
    const planted = dom.window.document.createElement("p");
    planted.className = "figure-range";
    planted.textContent = "consistent with a true rate anywhere between 0.676 and 1.000";
    const found = leaves(planted as unknown as Element);
    expect(found.length).toBe(1);
    expect(isValueSlot(found[0]?.classes ?? "")).toBe(false);
    expect(/\d/.test(found[0]?.text ?? "")).toBe(true);

    // And the shipped range is that sentence with every digit lifted out of it, so the scan above
    // passes on the real page rather than passing because nothing renders there.
    const real = render(ALL_EIGHT).querySelector(".figure-range");
    const copy = leaves(real as Element).filter((leaf) => !isValueSlot(leaf.classes));
    expect(copy.length).toBeGreaterThan(3);
    for (const leaf of copy) {
      expect(/\d/.test(leaf.text), `"${leaf.text.trim()}" carries a number in the range`).toBe(
        false,
      );
    }
  });

  it("writes no code identifier anywhere a reader can see, on every case", () => {
    let scanned = 0;
    for (const entry of CASES) {
      for (const leaf of leaves(render(entry.comparison))) {
        expect(
          CODE_IDENTIFIER.test(leaf.text),
          `${entry.name}: "${leaf.text.trim()}" reads as code`,
        ).toBe(false);
        scanned = scanned + 1;
      }
    }
    expect(scanned, "no text was scanned").toBeGreaterThan(600);
  });

  it("would notice an identifier that reached the page", () => {
    expect(CODE_IDENTIFIER.test("the drift line")).toBe(false);
    expect(CODE_IDENTIFIER.test("nClearedBand")).toBe(true);
    expect(CODE_IDENTIFIER.test("supplied_run")).toBe(true);
  });

  it("holds every string on it to the catalogue's stricter pattern, brackets and all", () => {
    // Every word on this page is MIRN's own or the closed family catalogue's — a reader's own
    // method contributes a count and never a sentence here, which is the difference from the
    // supplied verdict. So the whole page is held to the stricter form.
    let scanned = 0;
    for (const entry of CASES) {
      for (const leaf of leaves(render(entry.comparison))) {
        expect(
          CODE_IDENTIFIER_OR_SYNTAX.test(leaf.text),
          `${entry.name}: "${leaf.text.trim()}" reads as code`,
        ).toBe(false);
        scanned = scanned + 1;
      }
    }
    expect(scanned, "no copy was scanned").toBeGreaterThan(600);
    expect(CODE_IDENTIFIER_OR_SYNTAX.test("a phrase with a bracket ( in it")).toBe(true);
  });
});

describe("the comparison refuses a table that would compare nothing", () => {
  it("refuses a table missing one of the rulers", () => {
    const short = new Map(familiesFrom(READINGS));
    short.delete("forecastCounterfactual");
    expect(() =>
      makeComparison({ families: short, supplied: null, settings: SETTINGS }),
    ).toThrow(ContractError);
  });

  it("refuses rows measured on different rooms", () => {
    // The whole promise of the table: same rooms, same seeds, same drift lines. Rows measured on
    // different rooms are four measurements sharing a heading.
    const strangers = new Map(familiesFrom(READINGS));
    const elsewhere: FamilyProbeSeed[] = [];
    for (let i = 0; i < SEEDS.length; i++) {
      elsewhere.push(familyRoom((SEEDS[i] ?? 0) + 1, 0.2));
    }
    strangers.set("pairedShared", aggregateProbe(FAMILIES.pairedShared, elsewhere));
    expect(() =>
      makeComparison({ families: strangers, supplied: null, settings: SETTINGS }),
    ).toThrow(ContractError);
  });

  it("refuses a row judged against a different drift line from the rows beside it", () => {
    const drifted = new Map(familiesFrom(READINGS));
    const honest = drifted.get("pairedShared");
    expect(honest).toBeDefined();
    if (honest !== undefined) {
      drifted.set("pairedShared", { ...honest, meanBandM: BAND_M * 2 });
    }
    expect(() =>
      makeComparison({ families: drifted, supplied: null, settings: SETTINGS }),
    ).toThrow(ContractError);
  });

  it("refuses a world whose true effect was not exactly nothing", () => {
    const tampered = new Map(familiesFrom(READINGS));
    const honest = tampered.get("unpairedSeparate");
    if (honest !== undefined) {
      tampered.set("unpairedSeparate", {
        ...honest,
        nTruthsExactlyZero: honest.nAttempted - 1,
      });
    }
    expect(() =>
      makeComparison({ families: tampered, supplied: null, settings: SETTINGS }),
    ).toThrow(ContractError);
  });

  it("refuses settings that describe a different number of rooms from the ones that ran", () => {
    const other = makeFamilyProbeSettings({ seeds: [SEEDS[0] ?? 0, SEEDS[1] ?? 0], bandReplicates: 2 });
    expect(() =>
      makeComparison({ families: familiesFrom(READINGS), supplied: null, settings: other }),
    ).toThrow(ContractError);
  });

  it("refuses a measurement filed under the wrong ruler", () => {
    const swapped = new Map(familiesFrom(READINGS));
    const paired = swapped.get("pairedShared");
    if (paired !== undefined) {
      swapped.set("unpairedSeparate", paired);
    }
    expect(() =>
      makeComparison({ families: swapped, supplied: null, settings: SETTINGS }),
    ).toThrow(ContractError);
  });
});
