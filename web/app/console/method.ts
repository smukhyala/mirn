import { fail } from "../../engine/core/errors.js";
import type { UnitKey } from "../../engine/job/columns.js";
import { FAMILIES, type MethodFamily } from "../../engine/job/families.js";
import {
  zeroEffectConfig,
  type FamilyProbe,
  type FamilyProbeSettings,
} from "../../engine/job/familyProbe.js";
import { wilsonInterval, type RateInterval } from "../../engine/job/interval.js";
import { QUESTIONS, isComparison, type FamilyResolution } from "../../engine/job/questions.js";
import { meanOf } from "../../engine/job/stats.js";
import { anchorFor } from "../../ui/labels.js";
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
 * The method card's verdict: what the reader leaves with, and what they are refused.
 *
 * Three parts, in this order, and the order is the design's rather than a layout convenience.
 *
 *   1. The family, its confound in plain words, and — before any number — what MIRN actually ran
 *      in place of what the reader described. That last one is not a footnote and must never
 *      become one. A reader who leaves believing their own learned trajectory predictor was
 *      simulated has been misled, which is worse than this page not existing, so the sentence
 *      saying otherwise sits above the numbers rather than under them.
 *   2. Two measured numbers, each beside what it would read if the answer were zero. The world
 *      here IS the zero-effect world, so the zero is not a companion measurement borrowed from
 *      somewhere else: it is the true effect on the very same rooms, which is exactly nought
 *      because the crowd was told not to notice the robot. It is read off the probe rather than
 *      typed, for the same reason no other figure on this site is typed.
 *   3. The refusal, stated as flatly as the numbers.
 *
 * ## The fourth family is not scored as a detector, and this is the whole of why
 *
 * An absolute quantity — how far the robot travelled — reads about eighteen metres against a line
 * measured in centimetres, and clears it on every seed. That count is NOT a false-positive rate.
 * A false positive is a detection where there was nothing to detect; this family is not detecting
 * anything. The same number comes back whether the robot moved the entire room or nobody in it,
 * so there is no answer it could give that would count as a miss and no denominator that would
 * make a rate out of it. Printing "eight of eight" beside the forecaster's "six of eight" would
 * invite exactly the comparison this whole console exists to argue against — the reader would
 * conclude the absolute quantity is the worse detector, when it is not a detector.
 *
 * So it renders in a different shape, and which shape is decided by `isComparison`, which reads
 * the family's own ruler. A fifth family with an absolute ruler gets the right treatment without
 * anybody remembering to ask.
 */

/** The refusal, in the design's own words. Two paragraphs, and neither of them softens. */
export const REFUSAL: readonly string[] = Object.freeze([
  "This can show that a method is untrustworthy. It cannot show that one is sound. The crowd " +
    "here is invented, so passing this battery is necessary and not sufficient.",
  "A counterexample refutes a universal, and that is the only shape of claim available from a " +
    "simulator. Nothing here is a number about real pedestrians, about a real robot, or about " +
    "your own deployment, and nothing here is a sample size or a recommendation for your study.",
]);

/** One number, its unit, and the thing it would read if the answer were zero. */
export interface MethodFigure {
  readonly kind: "methodFigure";
  readonly label: string;
  readonly value: number;
  readonly unit: UnitKey;
  /** Guardrail 7's body-scale phrase, or null for a unit that needs none. */
  readonly anchor: string | null;
  /** What the number would be if the method had nothing to report. Measured, never asserted. */
  readonly zeroValue: number;
  readonly zeroHow: string;
}

/**
 * How well a count of rooms pins down the rate it is quoting.
 *
 * **It is not a second reading and it gets no zero of its own.** It qualifies a figure that already
 * carries one, and it is rendered inside that figure's own block rather than beside it as a peer:
 * a separate figure with a separate zero would tell a reader that a second measurement was made,
 * and none was. Guardrail 6 is discharged by the count it hangs off, once.
 *
 * The arithmetic is the engine's, in `interval.ts`, and the reason it is a Wilson score rather than
 * the textbook one is written out there: the textbook form has no width at all at none of n and at
 * all of n, which are the two counts this bench produces most often. This module chooses only the
 * level and the words.
 */
export interface RateRange {
  readonly kind: "rateRange";
  /** The interval itself, off the engine. Never widened, narrowed or rounded on the way here. */
  readonly interval: RateInterval;
  /** Guardrail 2, printed wherever the range is. A narrower range is not a sounder method. */
  readonly notSoundness: string;
}

/**
 * The one level every range on these three surfaces is drawn at.
 *
 * One constant rather than three, because three surfaces quoting ranges drawn at different levels
 * would print numbers a reader would compare across pages and be wrong to. The engine refuses a
 * level it does not hold, so this is checked rather than trusted.
 */
export const RATE_RANGE_CONFIDENCE = 0.95;

/**
 * What the range says, and — flatly — what it does not.
 *
 * Guardrail 2 lives in the second sentence and must survive any tidy-up of the first. A range
 * describes how far this count would move on more rooms of this same invented crowd. It says
 * nothing about the two things that actually bound these numbers: that the crowd is calibrated
 * against nothing, and that a room is not a corridor.
 */
export const RANGE_NOT_SOUNDNESS =
  "A narrower range is a more precisely known number, not a truer one. It says how far this count " +
  "would move if the same measurement ran on more rooms of the same invented crowd, and nothing " +
  "at all about whether that crowd resembles a corridor or whether the method is sound.";

/** The sentence the bounds are printed into, in the order its slots are filled. */
const RANGE_OVER = "Counted over ";
const RANGE_ROOMS = " rooms, that count is consistent with a true rate anywhere between ";
const RANGE_AND = " and ";
const RANGE_SCALE =
  ", on a scale whose bottom is a method that never clears the line and whose top is one that " +
  "clears it in every room. Ranges drawn this way aim to cover the true rate in ";
const RANGE_REPEATS = " of repeats, each on a fresh set of rooms.";

/** The range for a count, at the one level these surfaces use. Built from the two integers that
 *  are rendered, so the bounds and the fraction above them can never describe different counts. */
export function rateRangeFor(nCleared: number, nAttempted: number): RateRange {
  return Object.freeze({
    kind: "rateRange" as const,
    interval: wilsonInterval(nCleared, nAttempted, RATE_RANGE_CONFIDENCE),
    notSoundness: RANGE_NOT_SOUNDNESS,
  });
}

/**
 * How the seeds-cleared count is shown, and the two shapes are not interchangeable.
 *
 * `falsePositiveRate` is a rate: the true effect was nothing, the method said something, and the
 * count of seeds where that happened is what a reader should carry away. `notADetection` carries
 * the same two integers and refuses to call them a rate, because the family under it is not
 * making a claim that could be wrong.
 *
 * Only the first branch carries a range, and that is the type doing the refusing rather than a
 * renderer remembering to. A range on the second branch would be a precision claim about a rate
 * that block exists to say is not a rate.
 */
export type ClearingBlock =
  | {
      readonly kind: "falsePositiveRate";
      readonly label: string;
      readonly nCleared: number;
      readonly nAttempted: number;
      readonly note: string;
      /** How well these rooms pin that rate down. A qualifier on the count, never a figure. */
      readonly range: RateRange;
      /** Seeds on which the TRUE effect cleared the line. Measured; it is nought, and it is the
       *  zero this count is read against. */
      readonly zeroCleared: number;
      readonly zeroHow: string;
    }
  | {
      readonly kind: "notADetection";
      readonly label: string;
      readonly nCleared: number;
      readonly nAttempted: number;
      readonly note: string;
    };

export interface MethodVerdict {
  readonly kind: "methodVerdict";
  readonly family: MethodFamily;
  /** "Your answer to the question about … decided this: …". Built here, printed verbatim. */
  readonly decidedBy: string;
  /** One sentence per answer MIRN approximated or did not use. Printed before any number. */
  readonly approximations: readonly string[];
  /**
   * One sentence per answer that named a family and was overruled by an earlier one.
   *
   * Separate from `approximations` because it is a different statement. An approximation says
   * "something ran, and it was not quite what you described"; this says "nothing ran for this
   * answer, and here is why it did not apply". Collapsing the two told a reader who compares
   * against a twin run that a straight-line forecaster had been run on their behalf.
   */
  readonly notInPlay: readonly string[];
  readonly reading: MethodFigure;
  readonly band: MethodFigure;
  readonly clearing: ClearingBlock;
  /** Spread across the rooms, and the denominator it is quoted over. NaN below two survivors. */
  readonly spread: number;
  readonly nUsed: number;
  readonly nAttempted: number;
  /** What this was measured at. Printed always, never on hover. */
  readonly stamps: readonly SettingStamp[];
  readonly refusal: readonly string[];
}

const READING_LABEL =
  "What a method of this shape read on a world where the robot changed nothing at all";

const READING_ZERO_HOW =
  "what the robot actually did to these same crowds, measured the same way. It is exactly " +
  "nothing, and not nearly nothing: the crowd was told not to notice the robot, so both runs of " +
  "each room are driven by the same forces from the same random draws and every person walks the " +
  "same two paths. Anything this method reports above that figure, it invented.";

const BAND_LABEL = "How far two runs of this same room drift apart on their own";

const BAND_ZERO_HOW =
  "what two runs of one room would differ by if nothing about a room varied between runs. It is " +
  "not nothing, which is the point: this is the line a reading has to clear before anyone should " +
  "call it an effect.";

const RATE_LABEL = "Rooms where it cleared that line anyway";

/** Written so it reads at a count of none as well as at a count of most. "Each of those is a
 *  false positive" refers to nothing at all when a family clears on no room, which is exactly the
 *  case a reader most needs the sentence to still make sense in. */
const RATE_NOTE =
  "The true effect in every one of these rooms is exactly nothing, so any room it cleared on is a " +
  "false positive: the method reported a disturbance where there was none to report.";

const RATE_ZERO_HOW =
  "how often the true effect itself cleared that line, on the same rooms. A method with nothing " +
  "to report clears it on none of them, and that is what this count would read if this shape of " +
  "method were sound.";

const NON_DETECTION_LABEL = "Whether it cleared that line";

const NON_DETECTION_NOTE =
  "That is not a false-positive rate, and it must not be read as one. Nothing here is being " +
  "detected. The number is how far the robot walked: it would come back the same if the robot " +
  "had moved everybody in the room, and the same again if it had moved nobody, so there is no " +
  "answer it could give that would count as a miss and no denominator that makes a rate of it. " +
  "Set beside a rate from one of the families that do compare, it would invite the conclusion " +
  "that this is the worse detector — when it is not a detector.";

/** A step count back into the seconds a reader reads. Two decimals is exact for every multiple of
 *  the tick and kills the binary dust that makes sixty ticks of 0.05 s come out above three. */
function secondsOnGrid(steps: number, dt: number): number {
  return Number((steps * dt).toFixed(2));
}

function stamp(label: string, value: number, unit: UnitKey): SettingStamp {
  return Object.freeze({ kind: "settingStamp" as const, label, value, unit });
}

/**
 * What the probe was measured at, read off the settings and the family's own ruler.
 *
 * The forecast family's horizon and checked instant are part of what that family IS, so they are
 * printed for it and are absent for the three families that have no forecaster in them. Both come
 * off the ruler rather than off the console's defaults: a family measured at one ruler and stamped
 * with another would be two different measurements sharing a heading.
 */
function stampsFor(family: MethodFamily, settings: FamilyProbeSettings): readonly SettingStamp[] {
  const stamps: SettingStamp[] = [
    stamp("rooms measured", settings.seeds.length, "count"),
    stamp("runs behind each drift line", settings.bandReplicates, "count"),
  ];
  const ruler = family.ruler;
  if (ruler.kind === "straightLineForecast") {
    const seed = settings.seeds[0];
    if (seed !== undefined) {
      const dt = zeroEffectConfig(settings, seed).dt;
      stamps.push(stamp("guess rolled forward", secondsOnGrid(ruler.horizonSteps, dt), "seconds"));
      stamps.push(stamp("and checked at", secondsOnGrid(ruler.endStep, dt), "seconds"));
    }
  }
  return Object.freeze(stamps);
}

/**
 * The verdict, from the answers and the measurement.
 *
 * Everything this refuses is a way the page could show a reader a number about something other
 * than the method they described. The first refusal is the one the design turns on: a probe of a
 * different family than the answers selected would render a complete, plausible, wrong verdict.
 */
export function makeMethodVerdict(init: {
  readonly resolution: FamilyResolution;
  readonly probe: FamilyProbe;
  readonly settings: FamilyProbeSettings;
}): MethodVerdict {
  const family = FAMILIES[init.resolution.family];
  if (init.probe.family !== init.resolution.family) {
    fail(
      `these answers describe "${family.name}" and the measurement in hand is of a different ` +
        `family; a verdict built from the two would name one method and print another's numbers`,
    );
  }
  if (init.probe.nAttempted < 1) {
    fail("the measurement ran no rooms at all, so there is nothing to report");
  }
  if (init.probe.nUsed < 1) {
    fail("the measurement produced no number on any room, so there is no mean to quote");
  }
  // The premise, checked rather than trusted. Everything below is a count of false positives
  // against a true effect of exactly nothing; if the truth were merely small, every figure here
  // would be a count against an unstated real effect and the page would be lying quietly.
  if (init.probe.nTruthsExactlyZero !== init.probe.nAttempted) {
    fail(
      "some room's true effect was not exactly nothing, so this is not the zero-effect world " +
        "this card claims to run and no count of false positives on it means anything",
    );
  }
  if (init.probe.nTruthsUnderBand !== init.probe.nAttempted) {
    fail(
      "some room's true effect was not beneath the drift line, so a reading clearing that line " +
        "would not be a false positive",
    );
  }

  const truths: number[] = [];
  for (const seed of init.probe.perSeed) {
    truths.push(seed.truthM);
  }
  const meanTruth = meanOf(truths);

  const question = QUESTIONS[init.resolution.decidedBy];
  const decidedBy =
    `Your answer to the question about ${question.about} is what decided this: ` +
    `“${init.resolution.decidedByAnswer.label}”.`;

  const notInPlay: string[] = [];
  for (const key of init.resolution.notInPlay) {
    notInPlay.push(
      `Your answer to the question about ${QUESTIONS[key].about} did not apply here, and nothing ` +
        `was run for it: your answer to the question about ${question.about} had already settled ` +
        `what kind of measurement this is.`,
    );
  }

  let anchor: string | null = null;
  if (init.probe.unit === "metres") {
    anchor = anchorFor(init.probe.meanReading);
  }

  const reading: MethodFigure = Object.freeze({
    kind: "methodFigure" as const,
    label: READING_LABEL,
    value: init.probe.meanReading,
    unit: init.probe.unit,
    anchor,
    zeroValue: meanTruth,
    zeroHow: READING_ZERO_HOW,
  });

  const band: MethodFigure = Object.freeze({
    kind: "methodFigure" as const,
    label: BAND_LABEL,
    value: init.probe.meanBandM,
    unit: "metres" as const,
    anchor: anchorFor(init.probe.meanBandM),
    zeroValue: 0,
    zeroHow: BAND_ZERO_HOW,
  });

  let clearing: ClearingBlock;
  if (isComparison(init.resolution.family)) {
    clearing = Object.freeze({
      kind: "falsePositiveRate" as const,
      label: RATE_LABEL,
      nCleared: init.probe.nClearedBand,
      nAttempted: init.probe.nAttempted,
      note: RATE_NOTE,
      // Off the same two integers the fraction above it is rendered from, so the range can never
      // qualify a count other than the one on screen.
      range: rateRangeFor(init.probe.nClearedBand, init.probe.nAttempted),
      // Measured, not asserted: the count of rooms whose TRUE effect cleared the drift line. The
      // probe records that per seed, so this is a number off the same eight rooms rather than a
      // nought somebody typed into a sentence.
      zeroCleared: init.probe.nAttempted - init.probe.nTruthsUnderBand,
      zeroHow: RATE_ZERO_HOW,
    });
  } else {
    clearing = Object.freeze({
      kind: "notADetection" as const,
      label: NON_DETECTION_LABEL,
      nCleared: init.probe.nClearedBand,
      nAttempted: init.probe.nAttempted,
      note: NON_DETECTION_NOTE,
    });
  }

  return Object.freeze({
    kind: "methodVerdict" as const,
    family,
    decidedBy,
    approximations: Object.freeze([...init.resolution.approximations]),
    notInPlay: Object.freeze(notInPlay),
    reading,
    band,
    clearing,
    spread: init.probe.sdReading,
    nUsed: init.probe.nUsed,
    nAttempted: init.probe.nAttempted,
    stamps: stampsFor(family, init.settings),
    refusal: REFUSAL,
  });
}

/**
 * The range, into the block of the count it qualifies.
 *
 * Exported and called by the two other surfaces that render a rate — the supplied verdict and the
 * comparison — rather than copied into them. The rendering helpers around it are duplicated in those
 * files by an older instruction; this one is not, because what it prints is guardrail 2's own
 * sentence and three copies of that is three chances for one of them to soften.
 *
 * It appends paragraphs to the host and creates no wrapper, no heading and no `data-number` of its
 * own. That is the whole of "not a peer figure": there is nothing here for a reader to read as a
 * second measurement, and no slot where a second zero could go.
 */
export function appendRateRange(doc: Document, host: HTMLElement, range: RateRange): void {
  const line = doc.createElement("p");
  line.className = "figure-range";
  line.appendChild(doc.createTextNode(RANGE_OVER));
  // Every digit into a value slot, the same slots the sentences around this one use. The bounds are
  // shares of the rooms rather than lengths, so they carry no unit and none is printed.
  inlineQuantity(doc, line, range.interval.nAttempted, "count");
  line.appendChild(doc.createTextNode(RANGE_ROOMS));
  inlineQuantity(doc, line, range.interval.low, "none");
  line.appendChild(doc.createTextNode(RANGE_AND));
  inlineQuantity(doc, line, range.interval.high, "none");
  line.appendChild(doc.createTextNode(RANGE_SCALE));
  inlineQuantity(doc, line, range.interval.confidence, "none");
  line.appendChild(doc.createTextNode(RANGE_REPEATS));
  host.appendChild(line);

  host.appendChild(element(doc, "p", "figure-range-how", range.notSoundness));
}

/**
 * The count of rooms cleared, in whichever of the two shapes this family gets.
 *
 * The two branches share no element: a rate has a headline numeral, and the family that is not
 * detecting anything deliberately has none. `method-dom.test.ts` asserts the absence, because the
 * defect being avoided is a reader comparing two counts across the branch as though they measured
 * the same thing.
 */
function renderClearing(doc: Document, clearing: ClearingBlock): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.className = "method-figure";
  wrap.setAttribute("data-number", "clearing");
  wrap.appendChild(element(doc, "p", "figure-label", clearing.label));

  if (clearing.kind === "falsePositiveRate") {
    wrap.classList.add("method-rate");
    wrap.setAttribute("data-second", "false-positive-rate");

    const value = doc.createElement("p");
    value.className = "figure-value";
    value.appendChild(
      element(doc, "span", "figure-number method-rate-number", formatValue(clearing.nCleared, "count")),
    );
    value.appendChild(element(doc, "span", "figure-of", " of "));
    value.appendChild(
      element(doc, "span", "figure-number figure-denominator", formatValue(clearing.nAttempted, "count")),
    );
    wrap.appendChild(value);
    wrap.appendChild(element(doc, "p", "figure-note", clearing.note));
    // Inside this block, under the count it qualifies. Not a peer figure: see `RateRange`.
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

  wrap.classList.add("method-nondetection");
  wrap.setAttribute("data-second", "not-a-detection");
  const plain = doc.createElement("p");
  plain.className = "figure-plain";
  plain.appendChild(doc.createTextNode("It cleared it on "));
  plain.appendChild(element(doc, "span", "figure-inline", formatValue(clearing.nCleared, "count")));
  plain.appendChild(doc.createTextNode(" of the "));
  plain.appendChild(element(doc, "span", "figure-inline", formatValue(clearing.nAttempted, "count")));
  plain.appendChild(doc.createTextNode(" rooms."));
  wrap.appendChild(plain);
  wrap.appendChild(element(doc, "p", "figure-note", clearing.note));
  return wrap;
}

export function renderMethodVerdict(doc: Document, verdict: MethodVerdict): HTMLElement {
  const section = doc.createElement("section");
  section.className = "method-verdict";
  section.setAttribute("data-family", verdict.family.key);

  const named = part(doc, "family", "");
  named.appendChild(element(doc, "p", "verdict-eyebrow", "Your method belongs to this family"));
  named.appendChild(element(doc, "h3", "method-family-name", verdict.family.name));
  named.appendChild(element(doc, "p", "method-decided", verdict.decidedBy));
  named.appendChild(element(doc, "p", "method-what", verdict.family.whatItIs));
  named.appendChild(element(doc, "p", "method-confound-lead", "What it inherits by being that shape"));
  named.appendChild(element(doc, "p", "method-confound", verdict.family.confound));
  section.appendChild(named);

  const ran = part(doc, "ran", "What was actually run");
  ran.appendChild(
    element(
      doc,
      "p",
      "verdict-line",
      "Your answers do not reach the simulator one for one. MIRN ran its own estimator on its " +
        "own worlds, and this is where that differs from what you described. Read it before the " +
        "numbers, because it is what the numbers are about.",
    ),
  );
  if (verdict.approximations.length + verdict.notInPlay.length > 0) {
    const list = doc.createElement("ul");
    list.className = "method-approximations";
    for (const sentence of verdict.approximations) {
      list.appendChild(element(doc, "li", "method-approximation", sentence));
    }
    for (const sentence of verdict.notInPlay) {
      list.appendChild(element(doc, "li", "method-approximation method-not-in-play", sentence));
    }
    ran.appendChild(list);
  } else {
    ran.appendChild(
      element(
        doc,
        "p",
        "verdict-line",
        "Every answer you gave was run as you described it.",
      ),
    );
  }
  section.appendChild(ran);

  const numbers = part(doc, "numbers", "What it read where the answer was nothing");
  numbers.appendChild(
    element(
      doc,
      "p",
      "region-note",
      "Simulated crowd. Both figures below come from a model, and the world they come from is one " +
        "where the robot's true effect on every person is exactly nothing.",
    ),
  );
  numbers.appendChild(renderFigure(doc, verdict.reading, "reading"));
  numbers.appendChild(renderFigure(doc, verdict.band, "drift"));
  numbers.appendChild(renderClearing(doc, verdict.clearing));
  if (verdict.nUsed < verdict.nAttempted) {
    const short = doc.createElement("p");
    short.className = "verdict-line";
    short.appendChild(doc.createTextNode("This method produced a number on "));
    short.appendChild(element(doc, "span", "figure-inline", formatValue(verdict.nUsed, "count")));
    short.appendChild(doc.createTextNode(" of the "));
    short.appendChild(element(doc, "span", "figure-inline", formatValue(verdict.nAttempted, "count")));
    short.appendChild(
      doc.createTextNode(" rooms, and the average above is over those and not over all of them."),
    );
    numbers.appendChild(short);
  }
  if (Number.isFinite(verdict.spread)) {
    const spread = doc.createElement("p");
    spread.className = "verdict-line method-spread";
    spread.appendChild(doc.createTextNode("Room to room, the reading varied by about "));
    // Inline rather than at headline size: this is a sentence about the reading, not a second
    // reading, and a 2rem numeral in the middle of a line reads as a third figure.
    inlineQuantity(doc, spread, verdict.spread, verdict.reading.unit);
    spread.appendChild(
      doc.createTextNode(
        " either side of that average — a spread, not an uncertainty about the answer, which " +
          "is known here and is nothing.",
      ),
    );
    numbers.appendChild(spread);
  }
  numbers.appendChild(renderStamps(doc, verdict.stamps));
  section.appendChild(numbers);

  const refusal = part(doc, "refusal", "What this cannot show");
  for (const paragraph of verdict.refusal) {
    refusal.appendChild(element(doc, "p", "verdict-claim", paragraph));
  }
  section.appendChild(refusal);

  return section;
}
