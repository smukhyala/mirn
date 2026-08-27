import { fail } from "../../engine/core/errors.js";
import type { UnitKey } from "../../engine/job/columns.js";
import { FAMILIES, FAMILY_ORDER, type FamilyKey } from "../../engine/job/families.js";
import type { FamilyProbe, FamilyProbeSettings } from "../../engine/job/familyProbe.js";
import { isComparison } from "../../engine/job/questions.js";
import { meanOf } from "../../engine/job/stats.js";
import type { SuppliedProbe } from "../../engine/job/suppliedProbe.js";
import { anchorFor } from "../../ui/labels.js";
import {
  appendRateRange,
  rateRangeFor,
  REFUSAL,
  type ClearingBlock,
  type MethodFigure,
} from "./method.js";
import type { SuppliedReadingBlock } from "./suppliedVerdict.js";
import { formatValue, unitSuffix, type SettingStamp } from "./tile.js";

/**
 * Every ruler this bench can run, on the same rooms, at the same seeds, in one table.
 *
 * One row per ruler: the four described families, plus the reader's own method when they have
 * supplied one. Each row carries three things and nothing else — what it read on rooms where the
 * truth is exactly nothing, how far two runs of the same room drift apart on their own, and how
 * many rooms it cleared that drift line on anyway.
 *
 * ## The last column is a count of mistakes, and the rows are set out by it
 *
 * The rows are put in the order of that count, largest first. That is the only order there is, and
 * it is deliberately the least flattering thing a column of numbers can be sorted by: it counts
 * rooms where a ruler reported a disturbance that was not there. There is no total on this page, no
 * share, no mark out of anything, and nothing is singled out as the one to use. A count of errors
 * is not a grade, and this file must never grow one.
 *
 * ## What does the refusing, and where it sits
 *
 * Guardrail 2, unamended, and it is what refuses now that guardrail 11 no longer does. What this
 * table establishes is which ruler is confounded ON THIS INVENTED CROWD. It does not establish
 * which ruler wins in a corridor, that any published method is mistaken, or that a ruler which made
 * none of these mistakes here is sound.
 *
 * The refusal is rendered ABOVE the table, in document order, and `renderComparison` puts it there
 * unconditionally. A caveat under a table arrives after the reader has already drawn the
 * conclusion, which is the same reason the supplied verdict puts its inconsistency warning above
 * its figures rather than beside them.
 *
 * Nothing here is named after a paper or an author. The four rows are shapes of measurement, named
 * by the closed family catalogue, and the reader's own row is called theirs.
 *
 * ## The family that compares nothing is kept out of the ordering entirely, and this is why
 *
 * `isComparison` reads a family's declared ruler. A ruler that takes an absolute quantity — how far
 * the robot travelled — reads about eighteen metres against a line measured in centimetres and
 * clears it on every room, and clearing it says nothing whatever about the robot. The same number
 * comes back whether the robot moved everybody in the room or nobody in it, so there is no answer
 * it could give that would count as a miss and no denominator that makes a rate of it.
 *
 * Two things follow, and both are mechanical rather than editorial:
 *
 *   1. **Its count is rendered in the shape `method.ts`'s `notADetection` branch uses, with no
 *      headline numeral.** The count appears inside a sentence at reading size, so it cannot be
 *      scanned down a column of headline figures beside numbers that are false-positive counts.
 *   2. **It is not in the ordering at all.** Sorting it in — at either end — would tell a reader
 *      that it made the largest number of mistakes on the page, when what it actually holds is a
 *      different quantity wearing the same shape. Leaving it in the sort and merely restyling it
 *      would still put it in a position, and a position in an ordering IS a comparison. So it is
 *      lifted out of the table into a block of its own, below, which still shows what it read and
 *      the line it was read against, and carries no mistake count to compare.
 *
 * Which of the two shapes a row gets is read off the family's own ruler, never off its key, so a
 * fifth absolute family gets the right treatment without anybody remembering to ask.
 *
 * ## Every count in that column says how loosely these rooms pin it down
 *
 * A count of rooms is a rate, and a rate over a handful of rooms is known loosely: eight of eight is
 * consistent with a true rate anywhere from about two-thirds to certainty, and two rows whose counts
 * differ by one may be two numbers whose ranges overlap almost entirely. A column of counts sorted
 * descending invites exactly the comparison that ignores this, so the range is printed in the cell,
 * under the count it qualifies.
 *
 * It is not a fifth column and it is not a figure. It has no heading, no headline numeral and no
 * zero of its own — the count it hangs off already carries one, and a second zero would imply a
 * second measurement nobody made. And the sentence beside it is guardrail 2's: a narrower range is a
 * more precisely known number, not a truer one, and it says nothing about whether a ruler that made
 * few mistakes here would make few in a corridor.
 *
 * The ruler that compares nothing gets no range, and the type is what refuses it. A range says how
 * well a count pins a RATE down; that row's count is not a rate, so putting one on it would score it
 * as a detector in the same breath as the block below the table says it is not one.
 *
 * ## The reader's own row, and what cannot be known about it
 *
 * A family declares its ruler as data. A supplied method declares nothing, so there is no honest
 * way to decide which of the two shapes it belongs in. It is shown in the rate shape — the same
 * choice `suppliedVerdict.ts` made, and for the same reason — with the sentence saying plainly that
 * this cannot see what the method compares, printed beside its count rather than under the page.
 *
 * ## Reuse, and what had to be written twice
 *
 * `REFUSAL`, `MethodFigure` and `ClearingBlock` come from `method.ts`, and `SuppliedReadingBlock`
 * from `suppliedVerdict.ts`, because they are exported and mean exactly the same thing here. The
 * rendering helpers of both — the element builder, the value-slot spans — are module-private there,
 * and this file was built under an instruction not to widen either module, so the few that are
 * needed are duplicated below and marked. They are candidates for hoisting into a shared module,
 * which is a change to those files and belongs in its own commit.
 */

/** Which ruler a row is. A shape of measurement, or the reader's own. Never a paper, never a name. */
export type ComparisonSource =
  | { readonly kind: "describedFamily"; readonly family: FamilyKey }
  | { readonly kind: "readersOwn" };

/**
 * One ruler's row.
 *
 * `reading` is `suppliedVerdict.ts`'s block rather than a bare figure, because a supplied method
 * can come back having read nothing anywhere and an empty number slot is the error guardrail 6
 * exists to refuse. A described family always reads something, so its row always takes the first
 * branch — narrowed by the measurement rather than by the type, so the renderer has one shape to
 * handle and not two.
 */
export interface ComparisonRow {
  readonly kind: "comparisonRow";
  readonly source: ComparisonSource;
  /** Plain English, the shape of the measurement. Off the closed catalogue for the four. */
  readonly name: string;
  readonly whatItIs: string;
  /** What it inherits by being that shape, or — for the reader's own — that this cannot know. */
  readonly inherits: string;
  readonly reading: SuppliedReadingBlock;
  readonly band: MethodFigure;
  /** The count of rooms where it cleared the line while the truth was nothing. Never a score. */
  readonly mistakes: ClearingBlock;
  readonly nUsed: number;
  readonly nAttempted: number;
}

export interface Comparison {
  readonly kind: "comparison";
  /**
   * The rulers that compare something, most of those mistakes first.
   *
   * Ties keep the order the catalogue declares them in, with the reader's own row last, so the
   * ordering is a function of the measurement and never of which row happened to be built first.
   */
  readonly ordered: readonly ComparisonRow[];
  /** The rulers that compare nothing. Deliberately not in the ordering above. See the note. */
  readonly notDetecting: readonly ComparisonRow[];
  /** What this was measured at. Printed always, never on hover. */
  readonly stamps: readonly SettingStamp[];
  readonly refusal: readonly string[];
}

/* --------------------------------------------------------------------------------------------
 * The copy. Hand-written, for the reason the method card's is: it describes a question somebody
 * arrived with rather than a measurement, so no catalogue entry has anywhere to put it. No numeric
 * literal appears in any of it — every digit a reader sees renders from the measurement into a
 * value slot — and no sentence reaches past what a simulator can say.
 * ------------------------------------------------------------------------------------------ */

const RULER_HEADING = "The ruler";

const READING_LABEL = "What it read where the truth was exactly nothing";

const READING_ZERO_HOW =
  "what the robot actually did to these same crowds, measured against the run without it. It is " +
  "exactly nothing, and not nearly nothing: the crowd was told not to notice the robot, so both " +
  "runs of each room are driven by the same forces from the same random draws and every person " +
  "walks the same two paths. Anything a ruler reports above that figure, it invented.";

const NO_READING_LABEL = "What it read on those rooms";

const NO_READING_WHY =
  "It gave no distance on any of them, so there is no average to show and none is shown. An " +
  "average over no readings would be a number about nothing.";

const BAND_LABEL = "How far two runs of the same room drift apart on their own";

const BAND_ZERO_HOW =
  "what two runs of one room would differ by if nothing about a room varied between runs. It is " +
  "not nothing, which is the point: this is the line a reading has to clear before anyone should " +
  "call it an effect.";

const MISTAKE_LABEL = "Rooms where it cleared that line while the truth was nothing";

const MISTAKE_NOTE_BASE =
  "The true effect in every one of these rooms is exactly nothing, so a room it cleared on is a " +
  "room where it reported a disturbance there was none of.";

/** The sentence a declared ruler gets for free and a supplied one cannot. Same reason, same words
 *  as the supplied verdict's: a family declares what it compares and a written function declares
 *  nothing, so a method returning an absolute quantity would clear this line on every room without
 *  detecting anything at all. */
const MISTAKE_NOTE_UNKNOWN_RULER =
  "This cannot see what your method compares. If what it returns is an absolute quantity — how " +
  "far the robot walked, say — it will clear this line on every room, and that is a fact about " +
  "the quantity rather than a false alarm. Which of the two you wrote is something only you know.";

const MISTAKE_NOTE_SOME_MISSING =
  "On some of these rooms it returned no distance at all. Those rooms are in the total beside the " +
  "count and are not mistakes of this kind; nothing was read on them to be mistaken.";

const MISTAKE_NOTE_NONE_READ =
  "It returned no distance on any room here, so this count is nought because nothing was read " +
  "and not because nothing was falsely reported. Read it as an absence, never as a clean sheet.";

const MISTAKE_ZERO_HOW =
  "how often the true effect itself cleared that line, on these same rooms. It clears it on none " +
  "of them, and that is what this count reads for a ruler with nothing to report.";

const NON_DETECTION_LABEL = "Whether it cleared that line";

const NON_DETECTION_NOTE =
  "That is not a count of mistakes, and it must not be read as one. Nothing here is being " +
  "detected. The number is how far the robot walked: it would come back the same if the robot had " +
  "moved everybody in the room, and the same again if it had moved nobody, so there is no answer " +
  "it could give that would count as a miss and no denominator that makes a rate of it. That is " +
  "why it is set out here instead of among the rows above — given a place in that order it would " +
  "read as the largest count of mistakes on the page, when it is not making a claim that could be " +
  "mistaken.";

const NON_DETECTING_HEADING = "One of these rulers is not detecting anything";

const NON_DETECTING_LEAD =
  "It is kept out of the order above rather than placed at one end of it. A place in an order is " +
  "itself a comparison, and this quantity has nothing to compare: it subtracts nothing, so it has " +
  "no zero of its own and no reading it could give that would be an error.";

const HOW_TO_READ_HEADING = "What the last column counts, and what the order of the rows means";

const DISCLOSURE =
  "Simulated crowd. Every figure below comes from a model, and the world it comes from is one " +
  "where the robot's true effect on every person is exactly nothing.";

const COLUMN_MEANING =
  "The last column counts the rooms where a ruler cleared the drift line while the truth was " +
  "nothing. It is a count of mistakes on invented rooms. It is not a grade: there is no total on " +
  "this page, no share, no mark out of anything, and no row is singled out as the one to use.";

const ORDER_MEANING =
  "The rows are set out from the most of those mistakes to the fewest, and by nothing else. " +
  "Sorting a column of counts does not turn it into a judgement on the methods. What the order " +
  "shows is which shape of ruler this invented crowd confounded, and a ruler that made none of " +
  "these mistakes here has been shown only that it made none of them here.";

const SAME_ROOMS =
  "Every row was measured on the same rooms, at the same seeds, against the same drift lines. " +
  "That is what makes the counts counts of one thing, and it is also the whole of what makes them " +
  "comparable to each other and to nothing outside this page.";

/**
 * The comparison's own refusal, and it is the point of the page rather than a disclaimer on it.
 *
 * Three paragraphs of this file's, then the method card's two, which say the rest. None of them
 * softens, and none of them is inside a closed disclosure.
 */
const COMPARISON_REFUSAL: readonly string[] = Object.freeze([
  "These rows are shapes of measurement. Nothing here is named after a paper or after a person, " +
    "and no row is a claim about anybody's published work. A reader who takes one of them for " +
    "somebody's method has read a name this page did not write.",
  "What this establishes is which ruler was confounded by this invented crowd, and that is the " +
    "whole of it. It does not establish which ruler you should reach for in a corridor, that any " +
    "published method is mistaken, or that a ruler which cleared the line on no room here is " +
    "sound. A count of nought on an invented crowd is a count of nought on an invented crowd.",
  "The counts are not a measurement of anybody's robot. They are what these rulers did on rooms " +
    "where the answer was known in advance to be nothing, which is the one question a simulator " +
    "can settle and is not the question you arrived with.",
]);

const YOUR_ROW_NAME = "Your own method, as you wrote it";

const YOUR_ROW_WHAT =
  "The function you supplied, run on the same rooms at the same seeds as the rulers above it, and " +
  "never handed the run without the robot.";

const YOUR_ROW_INHERITS =
  "This cannot see what your method compares, so it cannot say what your method inherits by being " +
  "the shape it is. Each row above declares its ruler as data; yours declares nothing, and which " +
  "of them it resembles is something only you know.";

/* --------------------------------------------------------------------------------------------
 * Building the comparison.
 * ------------------------------------------------------------------------------------------ */

/** Duplicated from `suppliedVerdict.ts`, whose copy is module-private there. */
function stamp(label: string, value: number, unit: UnitKey): SettingStamp {
  return Object.freeze({ kind: "settingStamp" as const, label, value, unit });
}

/**
 * What every row was measured at.
 *
 * One row of stamps for the whole table rather than one per ruler, because there is exactly one
 * measurement behind it: the rooms and the drift lines are shared, and that sharing is checked
 * below rather than assumed. A per-row stamp would suggest the rows could differ, which is the one
 * thing a comparison must not leave open.
 */
function stampsFor(settings: FamilyProbeSettings): readonly SettingStamp[] {
  const stamps: SettingStamp[] = [
    stamp("rooms measured", settings.seeds.length, "count"),
    stamp("runs behind each drift line", settings.bandReplicates, "count"),
  ];
  return Object.freeze(stamps);
}

/** The mean true effect on the rooms behind a row. Read off the measurement, never typed. */
function meanTruthOf(perSeed: readonly { readonly truthM: number }[]): number {
  const truths: number[] = [];
  for (const seed of perSeed) {
    truths.push(seed.truthM);
  }
  return meanOf(truths);
}

/**
 * The premise of every row, checked rather than trusted.
 *
 * The seeds are compared one at a time against the settings' own list. That is the "same rooms, at
 * the same seeds" promise made mechanical: a table whose rows were measured on different rooms is
 * four measurements sharing a heading, and the counts in its last column would not be counts of one
 * thing. Everything else here is the check the method card and the supplied verdict already make,
 * repeated because a row is admitted to this table on its own terms.
 */
function checkRooms(
  which: string,
  settings: FamilyProbeSettings,
  probe: {
    readonly perSeed: readonly { readonly seed: number }[];
    readonly nAttempted: number;
    readonly nTruthsExactlyZero: number;
    readonly nTruthsUnderBand: number;
    readonly meanBandM: number;
  },
): void {
  if (probe.nAttempted < 1) {
    fail(`the measurement for '${which}' ran no rooms at all, so there is nothing to report`);
  }
  if (probe.perSeed.length !== probe.nAttempted) {
    fail(
      `the measurement for '${which}' counts a different number of rooms than it carries, so ` +
        `every denominator in its row would be quoted over rooms that are not the ones that ran`,
    );
  }
  if (settings.seeds.length !== probe.nAttempted) {
    fail(
      `the settings name a different number of rooms than the measurement for '${which}' ran, and ` +
        `the table would be stamped with one measurement while printing another's numbers`,
    );
  }
  for (let i = 0; i < probe.nAttempted; i++) {
    if (probe.perSeed[i]?.seed !== settings.seeds[i]) {
      fail(
        `the measurement for '${which}' ran a different room than the others at position ${i}; a ` +
          `table whose rows were measured on different rooms compares nothing`,
      );
    }
  }
  if (probe.nTruthsExactlyZero !== probe.nAttempted) {
    fail(
      `some room behind '${which}' had a true effect that was not exactly nothing, so this is not ` +
        `the zero-effect world this table claims to run and no count of mistakes on it means ` +
        `anything`,
    );
  }
  if (probe.nTruthsUnderBand !== probe.nAttempted) {
    fail(
      `some room behind '${which}' had a true effect that was not beneath the drift line, so a ` +
        `reading clearing that line would not be a mistake`,
    );
  }
  if (!Number.isFinite(probe.meanBandM)) {
    fail(
      `no drift line was measured for '${which}', so there is no line for a reading to clear and ` +
        `no scale to show a distance against`,
    );
  }
}

function readingBlockFor(
  nUsed: number,
  meanReading: number,
  unit: UnitKey,
  meanTruth: number,
): SuppliedReadingBlock {
  if (nUsed < 1) {
    return Object.freeze({
      kind: "noReadingAtAll" as const,
      label: NO_READING_LABEL,
      why: NO_READING_WHY,
    });
  }
  if (!Number.isFinite(meanReading)) {
    fail(
      "a row claims rooms it read while carrying no average over them, so the figure in its cell " +
        "would be a blank where a number belongs",
    );
  }
  let anchor: string | null = null;
  if (unit === "metres") {
    anchor = anchorFor(meanReading);
  }
  const figure: MethodFigure = Object.freeze({
    kind: "methodFigure" as const,
    label: READING_LABEL,
    value: meanReading,
    unit,
    anchor,
    zeroValue: meanTruth,
    zeroHow: READING_ZERO_HOW,
  });
  return Object.freeze({ kind: "suppliedReading" as const, figure });
}

function bandFigure(meanBandM: number): MethodFigure {
  return Object.freeze({
    kind: "methodFigure" as const,
    label: BAND_LABEL,
    value: meanBandM,
    unit: "metres" as const,
    anchor: anchorFor(meanBandM),
    zeroValue: 0,
    zeroHow: BAND_ZERO_HOW,
  });
}

function mistakeNoteFor(nUsed: number, nAttempted: number, rulerKnown: boolean): string {
  const parts: string[] = [MISTAKE_NOTE_BASE];
  if (!rulerKnown) {
    parts.push(MISTAKE_NOTE_UNKNOWN_RULER);
  }
  if (nUsed < 1) {
    parts.push(MISTAKE_NOTE_NONE_READ);
  } else if (nUsed < nAttempted) {
    parts.push(MISTAKE_NOTE_SOME_MISSING);
  }
  return parts.join(" ");
}

/**
 * The mistake count, in whichever of the two shapes this ruler gets.
 *
 * `detecting` is the answer `isComparison` gave for a described family, and is true for the
 * reader's own row because there is nothing to read it off. The two shapes are not interchangeable
 * and the caller must not choose between them by name.
 */
function mistakesFor(init: {
  readonly detecting: boolean;
  readonly rulerKnown: boolean;
  readonly nCleared: number;
  readonly nUsed: number;
  readonly nAttempted: number;
  readonly nTruthsUnderBand: number;
}): ClearingBlock {
  if (!init.detecting) {
    // No range here, and the type is what refuses it rather than this comment. A range says how
    // well a count of rooms pins a RATE down, and this count is not a rate: putting one on it
    // would score a ruler that is not detecting anything as though it were.
    return Object.freeze({
      kind: "notADetection" as const,
      label: NON_DETECTION_LABEL,
      nCleared: init.nCleared,
      nAttempted: init.nAttempted,
      note: NON_DETECTION_NOTE,
    });
  }
  return Object.freeze({
    kind: "falsePositiveRate" as const,
    label: MISTAKE_LABEL,
    nCleared: init.nCleared,
    nAttempted: init.nAttempted,
    note: mistakeNoteFor(init.nUsed, init.nAttempted, init.rulerKnown),
    // How well these rooms pin this row's rate down. Off the same two integers the cell renders,
    // and it is a qualifier on that count rather than a fourth column.
    range: rateRangeFor(init.nCleared, init.nAttempted),
    // Measured, not asserted: the rooms whose TRUE effect cleared the drift line, off the same
    // rooms, rather than a nought somebody typed into a sentence.
    zeroCleared: init.nAttempted - init.nTruthsUnderBand,
    zeroHow: MISTAKE_ZERO_HOW,
  });
}

function familyRow(key: FamilyKey, probe: FamilyProbe, settings: FamilyProbeSettings): ComparisonRow {
  const family = FAMILIES[key];
  if (probe.family !== key) {
    fail(
      `the measurement filed under "${family.name}" is of a different family; a row built from ` +
        `the two would name one ruler and print another's numbers`,
    );
  }
  checkRooms(key, settings, probe);
  if (probe.nUsed < 1) {
    fail(
      `the measurement for '${key}' produced no number on any room; a described family always ` +
        `reads something, so a row with nothing in it means the measurement is not of this family`,
    );
  }
  return Object.freeze({
    kind: "comparisonRow" as const,
    source: Object.freeze({ kind: "describedFamily" as const, family: key }),
    name: family.name,
    whatItIs: family.whatItIs,
    inherits: family.confound,
    reading: readingBlockFor(probe.nUsed, probe.meanReading, probe.unit, meanTruthOf(probe.perSeed)),
    band: bandFigure(probe.meanBandM),
    // Off the family's own declared ruler, never off its key. A fifth absolute family gets the
    // shape that is honest about it without anybody remembering to ask.
    mistakes: mistakesFor({
      detecting: isComparison(key),
      rulerKnown: true,
      nCleared: probe.nClearedBand,
      nUsed: probe.nUsed,
      nAttempted: probe.nAttempted,
      nTruthsUnderBand: probe.nTruthsUnderBand,
    }),
    nUsed: probe.nUsed,
    nAttempted: probe.nAttempted,
  });
}

function suppliedRow(probe: SuppliedProbe, settings: FamilyProbeSettings): ComparisonRow {
  checkRooms("yours", settings, probe);
  if (probe.nUsed + probe.nFailed + probe.nNondeterministic !== probe.nAttempted) {
    fail(
      "the rooms behind your own row do not add up: every room either produced a reading, failed, " +
        "or answered twice differently, and a tally that misses one of those is a count over the " +
        "wrong denominator",
    );
  }
  return Object.freeze({
    kind: "comparisonRow" as const,
    source: Object.freeze({ kind: "readersOwn" as const }),
    name: YOUR_ROW_NAME,
    whatItIs: YOUR_ROW_WHAT,
    inherits: YOUR_ROW_INHERITS,
    reading: readingBlockFor(probe.nUsed, probe.meanReading, probe.unit, meanTruthOf(probe.perSeed)),
    band: bandFigure(probe.meanBandM),
    // The rate shape, and the note says why this cannot do better. A supplied method declares no
    // ruler, so there is nothing measurable to select the other shape from, and a branch that could
    // never be reached honestly would be a lie about what this can tell apart.
    mistakes: mistakesFor({
      detecting: true,
      rulerKnown: false,
      nCleared: probe.nClearedBand,
      nUsed: probe.nUsed,
      nAttempted: probe.nAttempted,
      nTruthsUnderBand: probe.nTruthsUnderBand,
    }),
    nUsed: probe.nUsed,
    nAttempted: probe.nAttempted,
  });
}

/** A row and the position the catalogue declares it in, which is the tie-break and nothing more. */
interface Placed {
  readonly row: ComparisonRow;
  readonly declared: number;
  readonly mistakes: number;
}

/**
 * The table, from the measurements alone.
 *
 * Every ruler this bench can run has to be here: a comparison missing one of the four is a table
 * whose absences a reader cannot see, so a family with no measurement in hand is refused rather
 * than quietly dropped.
 */
export function makeComparison(init: {
  readonly families: ReadonlyMap<FamilyKey, FamilyProbe>;
  readonly supplied: SuppliedProbe | null;
  readonly settings: FamilyProbeSettings;
}): Comparison {
  const placed: Placed[] = [];
  const notDetecting: ComparisonRow[] = [];
  let declared = 0;
  let sharedBandM: number | null = null;

  for (const key of FAMILY_ORDER) {
    const probe = init.families.get(key);
    if (probe === undefined) {
      fail(
        `there is no measurement for "${FAMILIES[key].name}", and a table missing one of the ` +
          `rulers is a table whose absence a reader cannot see`,
      );
    }
    // Same rooms, same seeds, same drift lines. The seeds are checked per row inside `checkRooms`;
    // the line itself is checked across rows here, because a row judged against a different line
    // has a different meaning for "cleared it" and the counts would not be counts of one thing.
    if (sharedBandM === null) {
      sharedBandM = probe.meanBandM;
    } else if (probe.meanBandM !== sharedBandM) {
      fail(
        `the measurement for '${key}' was judged against a different drift line than the rows ` +
          `beside it, so "cleared that line" does not mean the same thing down the column`,
      );
    }
    const row = familyRow(key, probe, init.settings);
    if (row.mistakes.kind === "notADetection") {
      notDetecting.push(row);
    } else {
      placed.push({ row, declared, mistakes: row.mistakes.nCleared });
    }
    declared = declared + 1;
  }

  if (init.supplied !== null) {
    if (sharedBandM !== null && init.supplied.meanBandM !== sharedBandM) {
      fail(
        "your own row was judged against a different drift line than the rows beside it, so " +
          "“cleared that line” does not mean the same thing down the column",
      );
    }
    const row = suppliedRow(init.supplied, init.settings);
    placed.push({ row, declared, mistakes: row.mistakes.nCleared });
  }

  // Descending by the count of mistakes, and by nothing else. The declared position breaks a tie so
  // that two rulers which made the same number of mistakes are not put in an order by the accident
  // of which was built first — there is no order between them and the catalogue's is the one that
  // says least.
  placed.sort((a, b) => {
    if (a.mistakes !== b.mistakes) {
      return b.mistakes - a.mistakes;
    }
    return a.declared - b.declared;
  });

  const ordered: ComparisonRow[] = [];
  for (const entry of placed) {
    ordered.push(entry.row);
  }

  const refusal: string[] = [];
  for (const paragraph of COMPARISON_REFUSAL) {
    refusal.push(paragraph);
  }
  for (const paragraph of REFUSAL) {
    refusal.push(paragraph);
  }

  return Object.freeze({
    kind: "comparison" as const,
    ordered: Object.freeze(ordered),
    notDetecting: Object.freeze(notDetecting),
    stamps: stampsFor(init.settings),
    refusal: Object.freeze(refusal),
  });
}

/* --------------------------------------------------------------------------------------------
 * Rendering.
 *
 * `element`, `part` and `quantity` are the shape of `method.ts`'s own, which are module-private
 * there and duplicated in `suppliedVerdict.ts` for the same reason. They are duplicated here rather
 * than exported from either, because this file was built under an instruction not to widen those
 * modules. If they are ever hoisted, all three call sites move together or none does. Its
 * `inlineQuantity` is deliberately NOT duplicated: the one place this page shows a value inside a
 * sentence is a count, whose unit has no suffix, so the span alone is the whole of it.
 * ------------------------------------------------------------------------------------------ */

function element(doc: Document, tag: string, className: string, content: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  if (content.length > 0) {
    node.textContent = content;
  }
  return node;
}

function part(doc: Document, name: string, heading: string): HTMLElement {
  const section = doc.createElement("section");
  section.className = "verdict-part";
  section.setAttribute("data-part", name);
  if (heading.length > 0) {
    section.appendChild(element(doc, "h3", "verdict-part-title", heading));
  }
  return section;
}

/**
 * A value and its unit, in their own spans.
 *
 * Every digit a reader sees on this page lives inside one of these, and the test beside this file
 * scans the rendered table for a digit anywhere else. That is the mechanical half of "no numeric
 * literal appears in console copy": a caption quoting a count into its own sentence would fail
 * rather than sit there outliving the settings that produced it.
 */
function quantity(doc: Document, host: HTMLElement, value: number, unit: UnitKey): void {
  host.appendChild(element(doc, "span", "figure-number", formatValue(value, unit)));
  const suffix = unitSuffix(unit);
  if (suffix.length > 0) {
    host.appendChild(element(doc, "span", "figure-unit", suffix));
  }
}

/**
 * A figure into a cell: the value, its body-scale anchor, and what it would read at nothing.
 *
 * The label is not repeated here — it is the column heading, once, which is what guardrail 7's own
 * note about tables asks for. The zero and the anchor are per cell rather than per column, because
 * both are read off the row's own measurement and quoting one cell's zero over another's is the
 * exact defect guardrail 6 names.
 */
function fillFigure(doc: Document, host: HTMLElement, figure: MethodFigure): void {
  const value = doc.createElement("p");
  value.className = "figure-value";
  quantity(doc, value, figure.value, figure.unit);
  host.appendChild(value);

  if (figure.anchor !== null) {
    host.appendChild(element(doc, "p", "figure-anchor", figure.anchor));
  }

  const zero = doc.createElement("p");
  zero.className = "figure-zero";
  zero.appendChild(
    element(doc, "span", "figure-zero-value", formatValue(figure.zeroValue, figure.unit)),
  );
  const suffix = unitSuffix(figure.unit);
  if (suffix.length > 0) {
    zero.appendChild(element(doc, "span", "figure-zero-unit", suffix));
  }
  zero.appendChild(element(doc, "span", "figure-zero-how", figure.zeroHow));
  host.appendChild(zero);
}

function fillReading(doc: Document, host: HTMLElement, reading: SuppliedReadingBlock): void {
  if (reading.kind === "suppliedReading") {
    fillFigure(doc, host, reading.figure);
    return;
  }
  host.setAttribute("data-second", "no-reading");
  host.appendChild(element(doc, "p", "figure-label", reading.label));
  host.appendChild(element(doc, "p", "figure-plain", reading.why));
}

/**
 * The mistake count, in whichever of the two shapes the row carries.
 *
 * The branches share no element. A count of mistakes has a headline numeral and a zero; the ruler
 * that is not detecting anything deliberately has neither, and its count appears inside a sentence
 * at reading size. That is `method.ts`'s `notADetection` branch, unchanged, and the defect being
 * avoided is a reader running an eye down a column of headline figures and comparing two numbers
 * that are not the same quantity.
 */
function fillMistakes(doc: Document, host: HTMLElement, mistakes: ClearingBlock): void {
  if (mistakes.kind === "falsePositiveRate") {
    host.classList.add("method-rate");
    host.setAttribute("data-second", "false-positive-rate");

    const value = doc.createElement("p");
    value.className = "figure-value";
    value.appendChild(
      element(doc, "span", "figure-number method-rate-number", formatValue(mistakes.nCleared, "count")),
    );
    value.appendChild(element(doc, "span", "figure-of", " of "));
    value.appendChild(
      element(doc, "span", "figure-number figure-denominator", formatValue(mistakes.nAttempted, "count")),
    );
    host.appendChild(value);
    host.appendChild(element(doc, "p", "figure-note", mistakes.note));
    // Inside the cell, under the count it qualifies, and only on this branch. The row below the
    // table — the ruler that is not detecting anything — reaches the other branch and gets none.
    appendRateRange(doc, host, mistakes.range);

    const zero = doc.createElement("p");
    zero.className = "figure-zero";
    zero.appendChild(
      element(doc, "span", "figure-zero-value", formatValue(mistakes.zeroCleared, "count")),
    );
    zero.appendChild(element(doc, "span", "figure-of", " of "));
    zero.appendChild(
      element(doc, "span", "figure-zero-value", formatValue(mistakes.nAttempted, "count")),
    );
    zero.appendChild(element(doc, "span", "figure-zero-how", mistakes.zeroHow));
    host.appendChild(zero);
    return;
  }

  host.classList.add("method-nondetection");
  host.setAttribute("data-second", "not-a-detection");
  host.appendChild(element(doc, "p", "figure-label", mistakes.label));
  const plain = doc.createElement("p");
  plain.className = "figure-plain";
  plain.appendChild(doc.createTextNode("It cleared it on "));
  plain.appendChild(element(doc, "span", "figure-inline", formatValue(mistakes.nCleared, "count")));
  plain.appendChild(doc.createTextNode(" of the "));
  plain.appendChild(element(doc, "span", "figure-inline", formatValue(mistakes.nAttempted, "count")));
  plain.appendChild(doc.createTextNode(" rooms."));
  host.appendChild(plain);
  host.appendChild(element(doc, "p", "figure-note", mistakes.note));
}

/** The ruler itself: what shape of measurement it is, and what it inherits by being that shape. */
function fillRuler(doc: Document, host: HTMLElement, row: ComparisonRow): void {
  host.appendChild(element(doc, "p", "comparison-name", row.name));
  host.appendChild(element(doc, "p", "comparison-what", row.whatItIs));
  host.appendChild(element(doc, "p", "comparison-inherits-lead", "What it inherits by being that shape"));
  host.appendChild(element(doc, "p", "comparison-inherits", row.inherits));
}

function rowName(row: ComparisonRow): string {
  if (row.source.kind === "readersOwn") {
    return "yours";
  }
  return row.source.family;
}

function renderTableRow(doc: Document, row: ComparisonRow): HTMLElement {
  const tr = doc.createElement("tr");
  tr.className = "comparison-row";
  tr.setAttribute("data-row", rowName(row));

  const ruler = doc.createElement("th");
  ruler.className = "comparison-ruler";
  ruler.setAttribute("scope", "row");
  fillRuler(doc, ruler, row);
  tr.appendChild(ruler);

  const reading = doc.createElement("td");
  reading.className = "comparison-cell";
  reading.setAttribute("data-number", "reading");
  fillReading(doc, reading, row.reading);
  tr.appendChild(reading);

  const band = doc.createElement("td");
  band.className = "comparison-cell";
  band.setAttribute("data-number", "drift");
  fillFigure(doc, band, row.band);
  tr.appendChild(band);

  const mistakes = doc.createElement("td");
  mistakes.className = "comparison-cell";
  mistakes.setAttribute("data-number", "clearing");
  fillMistakes(doc, mistakes, row.mistakes);
  tr.appendChild(mistakes);

  return tr;
}

/** The same three things, out of the table and out of the order, for a ruler that compares nothing. */
function renderLooseRow(doc: Document, row: ComparisonRow): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.className = "comparison-row comparison-loose";
  wrap.setAttribute("data-row", rowName(row));

  const ruler = doc.createElement("div");
  ruler.className = "comparison-ruler";
  fillRuler(doc, ruler, row);
  wrap.appendChild(ruler);

  const reading = doc.createElement("div");
  reading.className = "comparison-cell";
  reading.setAttribute("data-number", "reading");
  reading.appendChild(element(doc, "p", "figure-label", READING_LABEL));
  fillReading(doc, reading, row.reading);
  wrap.appendChild(reading);

  const band = doc.createElement("div");
  band.className = "comparison-cell";
  band.setAttribute("data-number", "drift");
  band.appendChild(element(doc, "p", "figure-label", BAND_LABEL));
  fillFigure(doc, band, row.band);
  wrap.appendChild(band);

  const mistakes = doc.createElement("div");
  mistakes.className = "comparison-cell";
  mistakes.setAttribute("data-number", "clearing");
  fillMistakes(doc, mistakes, row.mistakes);
  wrap.appendChild(mistakes);

  return wrap;
}

function renderStamps(doc: Document, stamps: readonly SettingStamp[]): HTMLElement {
  const row = doc.createElement("p");
  row.className = "method-stamps";
  for (const entry of stamps) {
    const wrap = doc.createElement("span");
    wrap.className = "stamp";
    wrap.appendChild(element(doc, "span", "stamp-label", entry.label));
    wrap.appendChild(element(doc, "span", "stamp-value", formatValue(entry.value, entry.unit)));
    const suffix = unitSuffix(entry.unit);
    if (suffix.length > 0) {
      wrap.appendChild(element(doc, "span", "stamp-unit", suffix));
    }
    row.appendChild(wrap);
  }
  return row;
}

/**
 * The comparison, in document order: the refusal, then how to read it, then the table.
 *
 * The refusal is first and is not negotiable. A reader who has already read the ordering has
 * already drawn the conclusion, and a caveat underneath it arrives after the damage — the same
 * argument that puts the method card's "what was actually run" above its figures and the supplied
 * verdict's inconsistency warning above its averages.
 */
export function renderComparison(doc: Document, comparison: Comparison): HTMLElement {
  const section = doc.createElement("section");
  section.className = "method-verdict comparison";
  section.setAttribute("data-verdict", "comparison");

  const refusal = part(doc, "refusal", "What this table cannot show");
  for (const paragraph of comparison.refusal) {
    refusal.appendChild(element(doc, "p", "verdict-claim", paragraph));
  }
  section.appendChild(refusal);

  const howToRead = part(doc, "how-to-read", HOW_TO_READ_HEADING);
  // Guardrail 1: the crowd is said to be invented before any number on this surface.
  howToRead.appendChild(element(doc, "p", "region-note", DISCLOSURE));
  howToRead.appendChild(element(doc, "p", "verdict-line", COLUMN_MEANING));
  howToRead.appendChild(element(doc, "p", "verdict-line", ORDER_MEANING));
  howToRead.appendChild(element(doc, "p", "verdict-line", SAME_ROOMS));
  howToRead.appendChild(renderStamps(doc, comparison.stamps));
  section.appendChild(howToRead);

  const tablePart = part(doc, "table", "");
  const table = doc.createElement("table");
  table.className = "comparison-table";
  const head = doc.createElement("thead");
  const headRow = doc.createElement("tr");
  headRow.appendChild(element(doc, "th", "comparison-heading", RULER_HEADING));
  headRow.appendChild(element(doc, "th", "comparison-heading", READING_LABEL));
  headRow.appendChild(element(doc, "th", "comparison-heading", BAND_LABEL));
  headRow.appendChild(element(doc, "th", "comparison-heading", MISTAKE_LABEL));
  head.appendChild(headRow);
  table.appendChild(head);

  const body = doc.createElement("tbody");
  for (const row of comparison.ordered) {
    body.appendChild(renderTableRow(doc, row));
  }
  table.appendChild(body);
  tablePart.appendChild(table);
  section.appendChild(tablePart);

  if (comparison.notDetecting.length > 0) {
    const loose = part(doc, "not-detecting", NON_DETECTING_HEADING);
    loose.appendChild(element(doc, "p", "verdict-line", NON_DETECTING_LEAD));
    for (const row of comparison.notDetecting) {
      loose.appendChild(renderLooseRow(doc, row));
    }
    section.appendChild(loose);
  }

  return section;
}
