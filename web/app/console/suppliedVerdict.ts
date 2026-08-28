import { fail } from "../../engine/core/errors.js";
import type { UnitKey } from "../../engine/job/columns.js";
import type { FamilyProbeSettings } from "../../engine/job/familyProbe.js";
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
import { formatValue, unitSuffix, type SettingStamp } from "./tile.js";
import {
  element,
  inlineQuantity,
  part,
  quantity,
  renderFigure,
  renderStamps,
} from "./verdictParts.js";

/**
 * The verdict for a method the reader wrote, rather than one they described.
 *
 * It is the method card's verdict in the same three-figure shape — what it read where the true
 * effect is exactly nothing, the run-to-run drift line, and how often it cleared that line anyway —
 * plus the two findings a description cannot produce, and which are the whole reason this path
 * exists:
 *
 *   - **whether it failed**, on how many rooms, in the method's own words. A described method
 *     cannot fail. A written one can, and the sentence it failed with is the only useful thing in
 *     the whole failure, so it is printed unchanged rather than replaced by an apology of ours.
 *   - **whether it was consistent**. Every room is put to the method twice, on identical input, and
 *     the two answers are compared exactly. If they ever differ, that is stated before any figure
 *     on this page, because an average taken over answers to different questions is an average of
 *     different quantities and no amount of care further down repairs it.
 *
 * ## Why the inconsistency warning sits above the numbers rather than beside them
 *
 * The same reason the method card puts what was actually run above its figures: a reader who has
 * already read the numbers has already been misled, and a caveat under them arrives after the
 * damage. So the part order here is fixed — what ran, whether it answered the same way twice, the
 * numbers, where it stopped, and the refusal — and the test beside this file asserts it.
 *
 * ## What this never says
 *
 * Guardrail 2, unamended. Nothing here calls a method good, sound, correct, or better than another.
 * It may say the method failed, and it may say it did not fail *here*, on these invented rooms.
 * That is the strongest sentence available from a simulator and this file does not reach past it.
 *
 * ## Reuse, and what had to be written twice
 *
 * `REFUSAL`, `MethodFigure` and `ClearingBlock` come from `method.ts` because they are exported and
 * mean exactly the same thing here. So does the range on the clearing count — how loosely these
 * rooms pin that rate down — which is built and rendered by that module's own two functions rather
 * than copied into this one: what it prints is guardrail 2's sentence about a narrower range not
 * meaning a sounder method, and three copies of that would be three chances for one to soften. Its rendering helpers — the element/section builders, the
 * value-slot spans, the figure and stamp renderers — are module-private there, and this file was
 * built under an instruction not to widen that module's surface, so the few that are needed are
 * duplicated below, each marked. They are candidates for hoisting into a shared module, which is a
 * change to `method.ts` and belongs in its own commit rather than smuggled into this one.
 */

/** What the reader's method read, or the fact that it read nothing anywhere. */
export type SuppliedReadingBlock =
  | { readonly kind: "suppliedReading"; readonly figure: MethodFigure }
  | {
      readonly kind: "noReadingAtAll";
      readonly label: string;
      /** Why there is no figure here. Never a blank slot: an empty number is the error to avoid. */
      readonly why: string;
    };

/**
 * A count of rooms, its denominator, and what it would read if there were nothing to report.
 *
 * The same shape `ClearingBlock`'s rate branch has, and for the same reason: a count with no
 * denominator is not a finding, and a count with no zero beside it is the exact error guardrail 6
 * exists to refuse. Used for the failures and for the inconsistencies, which are counts of rooms
 * rather than distances and so cannot borrow a figure's metre-shaped slot.
 */
export interface SuppliedCount {
  readonly kind: "suppliedCount";
  readonly label: string;
  readonly nRooms: number;
  readonly nAttempted: number;
  readonly note: string;
  /** What this count reads when there is nothing to report. Nought, and said in words beside it. */
  readonly zeroRooms: number;
  readonly zeroHow: string;
}

/**
 * One reason the method stopped, and how many rooms it stopped that way on.
 *
 * Grouped by the sentence rather than listed per room: eight rooms failing the same way is one
 * finding said once with a count, not eight lines a reader has to notice are identical.
 */
export type SuppliedFailureLine =
  | {
      readonly kind: "methodSaid";
      /** The method's own words, byte for byte. Never rewritten, never summarised, never replaced. */
      readonly message: string;
      readonly nRooms: number;
    }
  | {
      readonly kind: "ranTooLong";
      readonly limitS: number;
      readonly nRooms: number;
    };

/**
 * The clearing count, in the method card's own rate shape.
 *
 * `ClearingBlock` has two branches and this path can only ever be the first. The card picks between
 * them by reading a family's declared ruler; a supplied method declares nothing, so there is no
 * measurable way to select the second and a branch that could never be reached would be a lie about
 * what this can tell apart. Narrowed here rather than re-declared, so the two surfaces stay one
 * type: a change to the rate's fields reaches this file as a compile error.
 */
export type SuppliedRateBlock = Extract<ClearingBlock, { readonly kind: "falsePositiveRate" }>;

/** One room where the same question got two answers, and how far apart they were. */
export interface SuppliedDisagreement {
  readonly kind: "suppliedDisagreement";
  readonly firstM: number;
  readonly secondM: number;
  readonly gapM: number;
  /** Guardrail 7: the gap is a length, so it is shown against something a body knows. */
  readonly anchor: string;
}

export interface SuppliedVerdict {
  readonly kind: "suppliedVerdict";
  readonly reading: SuppliedReadingBlock;
  readonly band: MethodFigure;
  readonly clearing: SuppliedRateBlock;
  readonly failures: SuppliedCount;
  readonly failureLines: readonly SuppliedFailureLine[];
  readonly consistency: SuppliedCount;
  readonly disagreements: readonly SuppliedDisagreement[];
  /**
   * The sentence that has to be read before the figures, or null when the method never disagreed
   * with itself. A flag rather than a branch inside the renderer, so a caller can ask the verdict
   * whether its own numbers stand without rendering it first.
   */
  readonly averageWarning: string | null;
  /**
   * The sentence for a method whose answer never moved, or null when it did move.
   *
   * Null below two readings rather than set, because "the same on every room" is a claim about
   * rooms in the plural and one room cannot support it. A method that read exactly once has not
   * been shown to be constant; it has been shown once.
   */
  readonly constantWarning: string | null;
  /** Spread across the rooms it answered on. NaN below two survivors, and then not shown. */
  readonly spread: number;
  readonly nUsed: number;
  readonly nAttempted: number;
  /** What this was measured at. Printed always, never on hover. */
  readonly stamps: readonly SettingStamp[];
  readonly refusal: readonly string[];
}

const RAN_LEAD =
  "Your method ran here, and this is what it was given. Read it before the numbers, because it " +
  "is what the numbers are about.";

const RAN_INPUT =
  "It was handed one run at a time: the people's paths, the robot's path, and the time between " +
  "samples. It was never handed the run without the robot, because a corridor does not have one. " +
  "That is not a precaution — it is the whole of what this measures. A method that could see both " +
  "runs could subtract them and hand back the exact truth, and every figure below would then " +
  "describe this harness rather than your ruler.";

const RAN_TWICE =
  "Every room was put to it twice, with a fresh copy of the same numbers each time, and the two " +
  "answers compared exactly. A method that writes into what it was handed is therefore not " +
  "mistaken for one that answers differently.";

const READING_LABEL =
  "What your method read on rooms where the robot changed nothing at all";

/** The zero's phrase carries no figure of its own — the figure is the slot printed in front of it.
 *  Written the way the method card's is: the world here IS the zero-effect world, so this says so
 *  rather than pointing at a companion measurement borrowed from somewhere else. */
const READING_ZERO_HOW =
  "what the robot actually did to these same crowds, measured against the run without it. It is " +
  "exactly nothing, and not nearly nothing: the crowd was told not to notice the robot, so both " +
  "runs of each room are driven by the same forces from the same random draws and every person " +
  "walks the same two paths. Anything your method reports above that figure, it invented.";

const NO_READING_LABEL = "What your method read on those rooms";

const NO_READING_WHY =
  "It gave no distance on any of them, so there is no average to show and none is shown. An " +
  "average over no readings would be a number about nothing.";

const BAND_LABEL = "How far two runs of this same room drift apart on their own";

const BAND_ZERO_HOW =
  "what two runs of one room would differ by if nothing about a room varied between runs. It is " +
  "not nothing, which is the point: this is the line a reading has to clear before anyone should " +
  "call it an effect.";

const RATE_LABEL = "Rooms where it cleared that line anyway";

const RATE_NOTE_BASE =
  "The true effect in every one of these rooms is exactly nothing, so any room it cleared on is a " +
  "false positive: your method reported a disturbance where there was none to report.";

/**
 * The sentence the questionnaire gets for free and this path cannot.
 *
 * The method card reads a family's declared ruler and refuses to score the family that compares
 * nothing as a detector. A supplied method declares nothing at all, so there is no ruler to read
 * and no honest way to decide which of the two shapes it belongs in. Printing the count without
 * saying that would invite a reader whose method returns an absolute quantity to conclude it fired
 * falsely on every room, when it was never detecting anything.
 */
const RATE_NOTE_UNKNOWN_RULER =
  "This cannot see what your method compares. If what it returns is an absolute quantity — how " +
  "far the robot walked, say — it will clear this line on every room, and that is a fact about " +
  "the quantity rather than a false alarm. Which of the two you wrote is something only you know.";

const RATE_NOTE_SOME_MISSING =
  "On some of these rooms it returned no distance at all. Those rooms are in the total beside the " +
  "count and are not false positives; they are counted again, as failures, further down.";

const RATE_NOTE_NONE_READ =
  "It returned no distance on any room here, so this count is nought because nothing was read " +
  "and not because nothing was falsely reported. Read it as an absence, never as a clean sheet.";

const RATE_ZERO_HOW =
  "how often the true effect itself cleared that line, on the same rooms. It clears it on none of " +
  "them, and that is what this count would read if a method had nothing to report.";

const FAILURE_LABEL = "Rooms where your method gave no distance";

const FAILURE_NOTE =
  "A method somebody only describes cannot fail. Yours can, and this is where it did. Each " +
  "sentence below is your method's own, printed exactly as it came back: a reader debugging their " +
  "own ruler is owed what it actually said, and an apology written by us in its place would throw " +
  "away the one useful sentence in the whole failure.";

const FAILURE_NONE =
  "It returned a distance on every room. It did not fail here, which is a fact about these rooms " +
  "and this method and about nothing else.";

const FAILURE_ZERO_HOW =
  "how many rooms a method that ran to the end on every one of them would have stopped on: none.";

const FAILURE_QUOTE_LEAD = "In your method's own words:";

const CONSISTENCY_LABEL = "Rooms where the same question got two different answers";

const CONSISTENCY_NOTE =
  "Every room was put to your method twice, on identical numbers, and the two answers compared " +
  "exactly rather than approximately. Determinism is a property of this bench: a method that " +
  "answers differently on identical input is answering a different question every time it is " +
  "asked, and smoothing that away would report the mean of two quantities as though it were one.";

const CONSISTENCY_ZERO_HOW =
  "how many rooms a method that gives one answer to one question disagrees with itself on: none.";

/** Guardrail 2 keeps this to what was observed. Repeating itself is not soundness, and the second
 *  sentence is there so nobody reads the first as a pass mark. */
const CONSISTENCY_CLEAR =
  "It gave the same answer both times, on every room it answered on. That says the method repeats " +
  "itself. It says nothing about what the method measures.";

/**
 * The warning, and it is the sharpest sentence this page has.
 *
 * It is stated before any figure rather than beside one. Every average below is taken over answers
 * to the same question, and a method that gives two answers to one question has broken that
 * premise for all of them at once — so the caveat belongs to the whole page and not to one tile.
 */
const AVERAGE_WARNING =
  "Your method gave two different distances when asked the same question twice. Every average on " +
  "this page is therefore an average over answers to different questions, and the figures below " +
  "cannot be trusted as a measurement of one thing. Fix that first; nothing else here means " +
  "anything until it is fixed.";

/**
 * The other sentence that has to be read before the figures, and the one this page most needed.
 *
 * A method that returns one fixed number scores perfectly here. It clears the drift line on no
 * room, because it does not vary, so its false-positive rate is nought out of however many rooms
 * ran — the best count this card can print. `() => 0` earns it, and so does `() => 42`, and neither
 * is measuring anything at all.
 *
 * Nothing else on this path can catch that. The method card refuses to score the family that
 * compares nothing as a detector, and it decides that by reading the family's declared ruler; a
 * supplied method declares nothing, which is what `RATE_NOTE_UNKNOWN_RULER` says out loud. But that
 * sentence hands the judgement to the reader, and the reader who most needs this one is the reader
 * least able to make it. So this is decided from behaviour instead of from a declaration: the rooms
 * differ, and a ruler that reads them returns different numbers on them.
 *
 * It carries no figure, deliberately. The finding is the sameness and not the value, the value is
 * already printed above as the average it read, and a number written into a sentence is the thing
 * the whole Content section refuses.
 */
const CONSTANT_WARNING =
  "Your method returned the same distance on every room it read. These rooms are not alike — " +
  "different crowds, different starting positions, different paths for the robot — so a ruler " +
  "that reads a room returns different numbers on different rooms, and this one is not reading " +
  "them. Whatever the count below says, it follows from that and is not evidence the method is " +
  "sound: a reading that never varies can never clear a line, so it cannot report a disturbance " +
  "that is not there, and it could not report one that was. It would score exactly this well on a " +
  "world where the robot moved every person in the room.";

const DISCLOSURE =
  "Simulated crowd. Every figure below comes from a model, and the world it comes from is one " +
  "where the robot's true effect on every person is exactly nothing.";

const SHORT_TAIL =
  " rooms, and the average above is over those and not over all of them.";

const SPREAD_TAIL =
  " either side of that average — a spread, not an uncertainty about the answer, which is known " +
  "here and is nothing.";

function stamp(label: string, value: number, unit: UnitKey): SettingStamp {
  return Object.freeze({ kind: "settingStamp" as const, label, value, unit });
}

/**
 * What the probe was measured at.
 *
 * There is no ruler to stamp here, which is the difference from the method card: a family carries
 * its horizon and its checked instant as data and a supplied method carries nothing at all. So the
 * two settings that ARE known are stamped, and nothing is invented to fill the row out.
 */
function stampsFor(settings: FamilyProbeSettings): readonly SettingStamp[] {
  const stamps: SettingStamp[] = [
    stamp("rooms measured", settings.seeds.length, "count"),
    stamp("runs behind each drift line", settings.bandReplicates, "count"),
  ];
  return Object.freeze(stamps);
}

function rateNoteFor(nUsed: number, nAttempted: number): string {
  const parts: string[] = [RATE_NOTE_BASE, RATE_NOTE_UNKNOWN_RULER];
  if (nUsed < 1) {
    parts.push(RATE_NOTE_NONE_READ);
  } else if (nUsed < nAttempted) {
    parts.push(RATE_NOTE_SOME_MISSING);
  }
  return parts.join(" ");
}

/** Group the failures by the sentence they came back with, first appearance first. */
function failureLinesFrom(probe: SuppliedProbe): readonly SuppliedFailureLine[] {
  const messageOrder: string[] = [];
  const messageCounts = new Map<string, number>();
  const limitOrder: number[] = [];
  const limitCounts = new Map<number, number>();

  for (const seed of probe.perSeed) {
    const outcome = seed.outcome;
    if (outcome.kind === "failed") {
      const held = messageCounts.get(outcome.message);
      if (held === undefined) {
        messageOrder.push(outcome.message);
        messageCounts.set(outcome.message, 1);
      } else {
        messageCounts.set(outcome.message, held + 1);
      }
    } else if (outcome.kind === "timedOut") {
      const held = limitCounts.get(outcome.limitMs);
      if (held === undefined) {
        limitOrder.push(outcome.limitMs);
        limitCounts.set(outcome.limitMs, 1);
      } else {
        limitCounts.set(outcome.limitMs, held + 1);
      }
    }
  }

  const lines: SuppliedFailureLine[] = [];
  for (const message of messageOrder) {
    lines.push(
      Object.freeze({
        kind: "methodSaid" as const,
        message,
        nRooms: messageCounts.get(message) ?? 0,
      }),
    );
  }
  for (const limitMs of limitOrder) {
    lines.push(
      Object.freeze({
        kind: "ranTooLong" as const,
        limitS: limitMs / 1000,
        nRooms: limitCounts.get(limitMs) ?? 0,
      }),
    );
  }
  return Object.freeze(lines);
}

/** One line per room that disagreed with itself, in the order the rooms were run. */
function disagreementsFrom(probe: SuppliedProbe): readonly SuppliedDisagreement[] {
  const found: SuppliedDisagreement[] = [];
  for (const seed of probe.perSeed) {
    const outcome = seed.outcome;
    if (outcome.kind !== "nondeterministic") {
      continue;
    }
    const gapM = Math.abs(outcome.firstM - outcome.secondM);
    found.push(
      Object.freeze({
        kind: "suppliedDisagreement" as const,
        firstM: outcome.firstM,
        secondM: outcome.secondM,
        gapM,
        anchor: anchorFor(gapM),
      }),
    );
  }
  return Object.freeze(found);
}

/**
 * The verdict, from the measurement alone.
 *
 * There is no resolution to check it against — a supplied method has no declared family, so the
 * mismatch the method card refuses cannot arise here. What replaces it is a check that the rooms
 * add up: every room this ran on ended as a reading, a failure or a disagreement, and a probe whose
 * tallies do not account for all of them would print a false-positive count against a denominator
 * that is not what happened.
 *
 * A method that failed everywhere is a verdict, not an error. `nUsed` of nought is rendered rather
 * than refused, because "it never produced a number" is precisely the finding this path exists to
 * report and throwing it away would leave the reader with a blank page and no reason for it.
 */
export function makeSuppliedVerdict(init: {
  readonly probe: SuppliedProbe;
  readonly settings: FamilyProbeSettings;
}): SuppliedVerdict {
  const probe = init.probe;
  if (probe.nAttempted < 1) {
    fail("the measurement ran no rooms at all, so there is nothing to report");
  }
  if (probe.perSeed.length !== probe.nAttempted) {
    fail(
      "the measurement counts a different number of rooms than it carries, so every denominator " +
        "on the verdict would be quoted over rooms that are not the ones that ran",
    );
  }
  if (probe.nUsed + probe.nFailed + probe.nNondeterministic !== probe.nAttempted) {
    fail(
      "the rooms do not add up: every room either produced a reading, failed, or answered twice " +
        "differently, and a tally that misses one of those is a rate over the wrong denominator",
    );
  }
  if (init.settings.seeds.length !== probe.nAttempted) {
    fail(
      "the settings name a different number of rooms than the measurement ran, and the verdict " +
        "would be stamped with one measurement while printing another's numbers",
    );
  }
  // The premise, checked rather than trusted. Everything below counts false positives against a
  // true effect of exactly nothing; if the truth were merely small, every figure here would be a
  // count against an unstated real effect and the page would be lying quietly.
  if (probe.nTruthsExactlyZero !== probe.nAttempted) {
    fail(
      "some room's true effect was not exactly nothing, so this is not the zero-effect world " +
        "this card claims to run and no count of false positives on it means anything",
    );
  }
  if (probe.nTruthsUnderBand !== probe.nAttempted) {
    fail(
      "some room's true effect was not beneath the drift line, so a reading clearing that line " +
        "would not be a false positive",
    );
  }
  if (!Number.isFinite(probe.meanBandM)) {
    fail(
      "no drift line was measured, so there is no line for a reading to clear and no scale to " +
        "show a distance against",
    );
  }
  if (probe.nUsed > 0 && !Number.isFinite(probe.meanReading)) {
    fail(
      "the measurement claims rooms it read while carrying no average over them, so the figure " +
        "beside that count would be a blank where a number belongs",
    );
  }

  const truths: number[] = [];
  for (const seed of probe.perSeed) {
    truths.push(seed.truthM);
  }
  const meanTruth = meanOf(truths);

  let reading: SuppliedReadingBlock;
  if (probe.nUsed > 0) {
    let anchor: string | null = null;
    if (probe.unit === "metres") {
      anchor = anchorFor(probe.meanReading);
    }
    const figure: MethodFigure = Object.freeze({
      kind: "methodFigure" as const,
      label: READING_LABEL,
      value: probe.meanReading,
      unit: probe.unit,
      anchor,
      zeroValue: meanTruth,
      zeroHow: READING_ZERO_HOW,
    });
    reading = Object.freeze({ kind: "suppliedReading" as const, figure });
  } else {
    reading = Object.freeze({
      kind: "noReadingAtAll" as const,
      label: NO_READING_LABEL,
      why: NO_READING_WHY,
    });
  }

  const band: MethodFigure = Object.freeze({
    kind: "methodFigure" as const,
    label: BAND_LABEL,
    value: probe.meanBandM,
    unit: "metres" as const,
    anchor: anchorFor(probe.meanBandM),
    zeroValue: 0,
    zeroHow: BAND_ZERO_HOW,
  });

  const clearing: SuppliedRateBlock = Object.freeze({
    kind: "falsePositiveRate" as const,
    label: RATE_LABEL,
    nCleared: probe.nClearedBand,
    nAttempted: probe.nAttempted,
    note: rateNoteFor(probe.nUsed, probe.nAttempted),
    // How well these rooms pin that rate down, off the same two integers the fraction is rendered
    // from. It qualifies the count and is not a second finding: it has no zero of its own.
    range: rateRangeFor(probe.nClearedBand, probe.nAttempted),
    // Measured, not asserted: the count of rooms whose TRUE effect cleared the drift line, off the
    // same rooms, rather than a nought somebody typed into a sentence.
    zeroCleared: probe.nAttempted - probe.nTruthsUnderBand,
    zeroHow: RATE_ZERO_HOW,
  });

  const failures: SuppliedCount = Object.freeze({
    kind: "suppliedCount" as const,
    label: FAILURE_LABEL,
    nRooms: probe.nFailed,
    nAttempted: probe.nAttempted,
    note: probe.nFailed > 0 ? FAILURE_NOTE : FAILURE_NONE,
    zeroRooms: 0,
    zeroHow: FAILURE_ZERO_HOW,
  });

  const consistency: SuppliedCount = Object.freeze({
    kind: "suppliedCount" as const,
    label: CONSISTENCY_LABEL,
    nRooms: probe.nNondeterministic,
    nAttempted: probe.nAttempted,
    note: probe.nNondeterministic > 0 ? CONSISTENCY_NOTE : CONSISTENCY_CLEAR,
    zeroRooms: 0,
    zeroHow: CONSISTENCY_ZERO_HOW,
  });

  return Object.freeze({
    kind: "suppliedVerdict" as const,
    reading,
    band,
    clearing,
    failures,
    failureLines: failureLinesFrom(probe),
    consistency,
    disagreements: disagreementsFrom(probe),
    averageWarning: probe.nNondeterministic > 0 ? AVERAGE_WARNING : null,
    // Two readings at minimum, and then one distinct value among them. Both halves are load-bearing:
    // without the first, a method that answered on a single room would be called constant on the
    // evidence of one number.
    constantWarning: probe.nUsed > 1 && probe.nDistinctReadings === 1 ? CONSTANT_WARNING : null,
    spread: probe.sdReading,
    nUsed: probe.nUsed,
    nAttempted: probe.nAttempted,
    stamps: stampsFor(init.settings),
    refusal: REFUSAL,
  });
}

/* --------------------------------------------------------------------------------------------
 * Rendering.
 *
 * The five helpers below — `element`, `part`, `quantity`, `inlineQuantity`, `renderFigure`,
 * `renderStamps` — are byte-for-byte the shape of `method.ts`'s own, which are module-private
 * there. They are duplicated rather than exported from it because this file was built under an
 * instruction not to widen that module, and a near-copy that drifts is worse than a copy that is
 * marked: if these are ever hoisted, both call sites move together or neither does.
 * ------------------------------------------------------------------------------------------ */

/** The clearing block, in the rate shape. A supplied method has no declared ruler, so the second
 *  shape the method card uses — the family that is not detecting anything — cannot be selected
 *  here from anything measurable. What the card gets from `isComparison`, this gets from a
 *  sentence in the note saying plainly that it cannot tell. */
function renderClearing(doc: Document, clearing: SuppliedRateBlock): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.className = "method-figure method-rate";
  wrap.setAttribute("data-number", "clearing");
  wrap.setAttribute("data-second", "false-positive-rate");
  wrap.appendChild(element(doc, "p", "figure-label", clearing.label));

  const value = doc.createElement("p");
  value.className = "figure-value";
  value.appendChild(
    element(
      doc,
      "span",
      "figure-number method-rate-number",
      formatValue(clearing.nCleared, "count"),
    ),
  );
  value.appendChild(element(doc, "span", "figure-of", " of "));
  value.appendChild(
    element(doc, "span", "figure-number figure-denominator", formatValue(clearing.nAttempted, "count")),
  );
  wrap.appendChild(value);
  wrap.appendChild(element(doc, "p", "figure-note", clearing.note));
  // The method card's own, called rather than copied: the sentence about a narrower range not
  // meaning a sounder method is guardrail 2's, and one copy of it cannot drift from another.
  appendRateRange(doc, wrap, clearing.range);

  const zero = doc.createElement("p");
  zero.className = "figure-zero";
  zero.appendChild(
    element(doc, "span", "figure-zero-value", formatValue(clearing.zeroCleared, "count")),
  );
  zero.appendChild(element(doc, "span", "figure-of", " of "));
  zero.appendChild(
    element(doc, "span", "figure-zero-value", formatValue(clearing.nAttempted, "count")),
  );
  zero.appendChild(element(doc, "span", "figure-zero-how", clearing.zeroHow));
  wrap.appendChild(zero);
  return wrap;
}

/** A count of rooms in the rate's shape: a headline, its denominator, its note and its zero. */
function renderCount(doc: Document, count: SuppliedCount, name: string): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.className = "method-figure method-rate";
  wrap.setAttribute("data-number", name);
  wrap.appendChild(element(doc, "p", "figure-label", count.label));

  const value = doc.createElement("p");
  value.className = "figure-value";
  value.appendChild(
    element(doc, "span", "figure-number method-rate-number", formatValue(count.nRooms, "count")),
  );
  value.appendChild(element(doc, "span", "figure-of", " of "));
  value.appendChild(
    element(doc, "span", "figure-number figure-denominator", formatValue(count.nAttempted, "count")),
  );
  wrap.appendChild(value);
  wrap.appendChild(element(doc, "p", "figure-note", count.note));

  const zero = doc.createElement("p");
  zero.className = "figure-zero";
  zero.appendChild(element(doc, "span", "figure-zero-value", formatValue(count.zeroRooms, "count")));
  zero.appendChild(element(doc, "span", "figure-of", " of "));
  zero.appendChild(
    element(doc, "span", "figure-zero-value", formatValue(count.nAttempted, "count")),
  );
  zero.appendChild(element(doc, "span", "figure-zero-how", count.zeroHow));
  wrap.appendChild(zero);
  return wrap;
}

/**
 * One failure, and the method's own sentence under it.
 *
 * The message goes into an element of its own with nothing added inside it, so what a reader sees
 * is what their method said and a test can compare the two for equality. It is labelled as a
 * quotation rather than presented as ours: this is the one string on the page MIRN did not write,
 * and a reader owes it to their own debugging that we did not tidy it.
 */
function renderFailureLine(doc: Document, line: SuppliedFailureLine): HTMLElement {
  const item = doc.createElement("li");
  item.className = "supplied-failure";

  const rooms = doc.createElement("p");
  rooms.className = "figure-plain";
  rooms.appendChild(doc.createTextNode("On "));
  rooms.appendChild(element(doc, "span", "figure-inline", formatValue(line.nRooms, "count")));
  if (line.kind === "methodSaid") {
    rooms.appendChild(doc.createTextNode(" of the rooms, it stopped part way through."));
    item.appendChild(rooms);
    item.appendChild(element(doc, "p", "figure-note", FAILURE_QUOTE_LEAD));
    item.appendChild(element(doc, "p", "supplied-message", line.message));
    return item;
  }

  rooms.appendChild(doc.createTextNode(" of the rooms, it was still running after "));
  inlineQuantity(doc, rooms, line.limitS, "seconds");
  rooms.appendChild(
    doc.createTextNode(
      " and was stopped from outside. A method that will not stop cannot be interrupted from " +
        "within the place it runs, so the clock is held out here and the method is ended rather " +
        "than asked to end.",
    ),
  );
  item.appendChild(rooms);
  return item;
}

/** One room that answered twice, both answers, and the gap between them against a body scale. */
function renderDisagreement(doc: Document, gap: SuppliedDisagreement): HTMLElement {
  const item = doc.createElement("li");
  item.className = "supplied-disagreement";
  item.appendChild(doc.createTextNode("It read "));
  inlineQuantity(doc, item, gap.firstM, "metres");
  item.appendChild(doc.createTextNode(" the first time and "));
  inlineQuantity(doc, item, gap.secondM, "metres");
  item.appendChild(doc.createTextNode(" the second, on the very same numbers — a gap of "));
  inlineQuantity(doc, item, gap.gapM, "metres");
  item.appendChild(doc.createTextNode(", "));
  item.appendChild(element(doc, "span", "figure-anchor", gap.anchor));
  item.appendChild(doc.createTextNode("."));
  return item;
}

export function renderSuppliedVerdict(doc: Document, verdict: SuppliedVerdict): HTMLElement {
  const section = doc.createElement("section");
  section.className = "method-verdict supplied-verdict";
  section.setAttribute("data-verdict", "supplied");

  const ran = part(doc, "ran", "What was actually run");
  ran.appendChild(element(doc, "p", "verdict-line", RAN_LEAD));
  ran.appendChild(element(doc, "p", "verdict-line", RAN_INPUT));
  ran.appendChild(element(doc, "p", "verdict-line", RAN_TWICE));
  section.appendChild(ran);

  // Before the numbers, not beside them. A reader who has already read the figures has already
  // been misled, and a caveat underneath them arrives after the damage is done.
  const consistency = part(doc, "consistency", "Whether it answered the same way twice");
  if (verdict.averageWarning !== null) {
    consistency.appendChild(element(doc, "p", "verdict-claim supplied-warning", verdict.averageWarning));
  }
  consistency.appendChild(renderCount(doc, verdict.consistency, "inconsistency"));
  if (verdict.disagreements.length > 0) {
    const list = doc.createElement("ul");
    list.className = "supplied-disagreements";
    for (const gap of verdict.disagreements) {
      list.appendChild(renderDisagreement(doc, gap));
    }
    consistency.appendChild(list);
  }
  section.appendChild(consistency);

  // Also before the numbers, and for the same reason the warning above it is. This one is rendered
  // only when it fires: unlike the consistency count there is no reassuring form of it worth
  // printing, because "your readings differed across rooms" is the ordinary case and saying so
  // would read as a pass mark for a method that has not been judged yet.
  if (verdict.constantWarning !== null) {
    const constancy = part(doc, "constancy", "Whether it read the rooms at all");
    constancy.appendChild(
      element(doc, "p", "verdict-claim supplied-warning", verdict.constantWarning),
    );
    section.appendChild(constancy);
  }

  const numbers = part(doc, "numbers", "What it read where the answer was nothing");
  numbers.appendChild(element(doc, "p", "region-note", DISCLOSURE));
  if (verdict.reading.kind === "suppliedReading") {
    numbers.appendChild(renderFigure(doc, verdict.reading.figure, "reading"));
  } else {
    const absent = doc.createElement("div");
    absent.className = "method-figure";
    absent.setAttribute("data-number", "reading");
    absent.setAttribute("data-second", "no-reading");
    absent.appendChild(element(doc, "p", "figure-label", verdict.reading.label));
    absent.appendChild(element(doc, "p", "figure-plain", verdict.reading.why));
    numbers.appendChild(absent);
  }
  numbers.appendChild(renderFigure(doc, verdict.band, "drift"));
  numbers.appendChild(renderClearing(doc, verdict.clearing));

  if (verdict.nUsed < verdict.nAttempted) {
    const short = doc.createElement("p");
    short.className = "verdict-line";
    short.appendChild(doc.createTextNode("This method produced a number on "));
    short.appendChild(element(doc, "span", "figure-inline", formatValue(verdict.nUsed, "count")));
    short.appendChild(doc.createTextNode(" of the "));
    short.appendChild(
      element(doc, "span", "figure-inline", formatValue(verdict.nAttempted, "count")),
    );
    short.appendChild(doc.createTextNode(SHORT_TAIL));
    numbers.appendChild(short);
  }

  if (Number.isFinite(verdict.spread) && verdict.reading.kind === "suppliedReading") {
    const spread = doc.createElement("p");
    spread.className = "verdict-line method-spread";
    spread.appendChild(doc.createTextNode("Room to room, the reading varied by about "));
    // Inline rather than at headline size: this is a sentence about the reading, not a second
    // reading, and a headline numeral in the middle of a line reads as a third figure.
    inlineQuantity(doc, spread, verdict.spread, verdict.reading.figure.unit);
    spread.appendChild(doc.createTextNode(SPREAD_TAIL));
    numbers.appendChild(spread);
  }

  numbers.appendChild(renderStamps(doc, verdict.stamps));
  section.appendChild(numbers);

  const failures = part(doc, "failures", "Where it stopped");
  failures.appendChild(renderCount(doc, verdict.failures, "failures"));
  if (verdict.failureLines.length > 0) {
    const list = doc.createElement("ul");
    list.className = "supplied-failures";
    for (const line of verdict.failureLines) {
      list.appendChild(renderFailureLine(doc, line));
    }
    failures.appendChild(list);
  }
  section.appendChild(failures);

  const refusal = part(doc, "refusal", "What this cannot show");
  for (const paragraph of verdict.refusal) {
    refusal.appendChild(element(doc, "p", "verdict-claim", paragraph));
  }
  section.appendChild(refusal);

  return section;
}
