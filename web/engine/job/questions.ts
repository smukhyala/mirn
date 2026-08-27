import { fail } from "../core/errors.js";
import { FAMILIES, FAMILY_ORDER, type FamilyKey } from "./families.js";

/**
 * The five questions, closed, in the style of `AXES` and `COLUMNS`.
 *
 * A stranger arrives with a disturbance metric they have written or are about to. They describe it
 * in five multiple-choice answers, and this table maps that description onto one of the four
 * families MIRN can honestly run. Nothing of theirs is read in: no file, no function, no dataset,
 * no free text. A closed table is not an extension point — there is no `register`, nothing is
 * added at runtime, and a question cannot be built from a description supplied by a caller. It is
 * a table so a test can walk every answer a reader can give and prove each one lands somewhere
 * real.
 *
 * ## Which answers decide the family, and which do not
 *
 * Two of the five decide it. The first asks whether there is a comparison run and what kind; the
 * second asks where the counterfactual comes from when there is none. The other three — the
 * stretch of episode, the aggregation, whether a zero-effect reference is reported — are recorded
 * and carried in the link, and they do not change which estimator runs or at what ruler.
 *
 * That is an approximation, and it is stated where the reader meets the verdict rather than in a
 * footnote: every option carries an `approximation` field, and an answer whose field is set has
 * its sentence printed beside the family before any number appears. An option whose field is null
 * is one MIRN ran as described. A reader who leaves believing their learned trajectory predictor
 * was simulated has been misled, and that is worse than the page not existing — so the option that
 * says "a learned trajectory predictor" says, in its own data, that a straight-line guess ran
 * instead.
 *
 * The three that change nothing say so in the same words rather than being quietly dropped. A
 * question whose answer is collected and then ignored without a word is the same defect as a
 * permalink that writes a payload it never reads.
 *
 * ## Why the first question wins
 *
 * `resolveFamily` walks the questions in order and takes the first answer that names a family. So
 * a reader who says they compare against a twin run AND that their counterfactual is a
 * straight-line guess gets the paired family: the second question's own prompt begins "if there is
 * no control run", so an answer to it is only in play when the first said there is none. The
 * resolution reports which question decided, and the page prints that sentence, so the reader is
 * never left guessing which of their answers did the work.
 */

export type QuestionKey =
  | "controlRun"
  | "counterfactualSource"
  | "stretch"
  | "aggregation"
  | "zeroReference";

/**
 * An option's key, as it appears in a link and nowhere else a reader reads.
 *
 * Single lowercase words on purpose. The permalink is the one surface these reach, and the
 * identifier scans this project holds its reader-facing prose to would flag a camel-case or
 * snake-case token the moment one appeared in a sentence.
 */
export type OptionKey = string;

export interface MethodOption {
  readonly kind: "methodOption";
  readonly key: OptionKey;
  /** Plain English, the sentence beside the radio. Never a setting name, never a formula. */
  readonly label: string;
  /** The family this answer settles on, or null when this answer settles nothing. */
  readonly implies: FamilyKey | null;
  /**
   * Null when MIRN ran what this answer describes. Otherwise what it ran instead, in plain
   * English, printed where the reader meets the verdict.
   */
  readonly approximation: string | null;
}

export interface MethodQuestion {
  readonly kind: "methodQuestion";
  readonly key: QuestionKey;
  /** The question itself, as a reader reads it. */
  readonly prompt: string;
  /** How this answer is spelled in a link. One lowercase word, distinct across the five. */
  readonly queryKey: string;
  /** What this question is called in a sentence, mid-clause: "the question about …". */
  readonly about: string;
  readonly options: readonly MethodOption[];
}

function makeMethodOption(init: {
  readonly key: OptionKey;
  readonly label: string;
  readonly implies: FamilyKey | null;
  readonly approximation: string | null;
}): MethodOption {
  if (!/^[a-z]+$/.test(init.key)) {
    fail(
      `an answer's link spelling must be one lowercase word, got '${init.key}'; anything else ` +
        `reaches a reader as a code identifier the moment a notice quotes it`,
    );
  }
  if (init.label.length < 10) {
    fail(`an answer must be a readable phrase, got '${init.label}'`);
  }
  if (init.implies !== null && !FAMILY_ORDER.includes(init.implies)) {
    fail(`the answer '${init.key}' names a family this bench does not have`);
  }
  if (init.approximation !== null && init.approximation.length < 40) {
    fail(
      `the answer '${init.key}' says something other than itself was run, so it must say what, ` +
        `at a length a beginner can read; got '${init.approximation}'`,
    );
  }
  return Object.freeze({
    kind: "methodOption" as const,
    key: init.key,
    label: init.label,
    implies: init.implies,
    approximation: init.approximation,
  });
}

function makeMethodQuestion(init: {
  readonly key: QuestionKey;
  readonly prompt: string;
  readonly queryKey: string;
  readonly about: string;
  readonly options: readonly MethodOption[];
}): MethodQuestion {
  if (init.options.length < 2) {
    fail(`the question '${init.key}' offers ${init.options.length} answers; a question needs two`);
  }
  const seen = new Set<string>();
  for (const option of init.options) {
    if (seen.has(option.key)) {
      fail(
        `the question '${init.key}' offers the answer '${option.key}' twice; a link naming it ` +
          `would have two meanings and the decoder would silently pick one`,
      );
    }
    seen.add(option.key);
  }
  if (init.prompt.length < 20) {
    fail(`the question '${init.key}' must be a readable question, got '${init.prompt}'`);
  }
  if (!/^[a-z]+$/.test(init.queryKey)) {
    fail(`a question's link spelling must be one lowercase word, got '${init.queryKey}'`);
  }
  return Object.freeze({
    kind: "methodQuestion" as const,
    key: init.key,
    prompt: init.prompt,
    queryKey: init.queryKey,
    about: init.about,
    options: Object.freeze([...init.options]),
  });
}

/**
 * What ran in place of a learned predictor, and in place of a hand-specified path.
 *
 * Written once and shared by the two options that need it, because they are the same substitution
 * and two copies would let one of them soften.
 */
const FORECAST_STAND_IN =
  "MIRN has no learned trajectory predictor and no way to know your intended paths. What ran " +
  "instead is the forecaster it does have: each person's own recent path extended forward in a " +
  "straight line. Your predictor is a different predictor and would read a different number. " +
  "What carries across is the shape of the method, not its size.";

/** Said, in the same breath, of every answer that was recorded and changed nothing that ran. */
function unusedAnswer(what: string): string {
  return (
    `This answer was recorded and carried in the link, and it did not change what ran. ${what} ` +
    `MIRN ran its own estimator at its own ruler, and the numbers below are that ruler's.`
  );
}

const CONTROL_RUN = makeMethodQuestion({
  key: "controlRun",
  prompt: "Does your number compare against a run without the robot?",
  queryKey: "control",
  about: "whether your number compares against a run without the robot",
  options: [
    makeMethodOption({
      key: "twin",
      label: "Yes — the same room, the same seed and the same random draws",
      implies: "pairedShared",
      approximation: null,
    }),
    makeMethodOption({
      key: "stranger",
      label: "Yes — a separate run, or a different day",
      implies: "unpairedSeparate",
      approximation:
        "A separate run here means the same room from a different seed: different starting " +
        "positions and different random draws, and nothing else deliberately changed. A different " +
        "day in a real corridor differs in more ways than that, so this stand-in is the kind one, " +
        "and what it reads below is a floor rather than a worst case.",
    }),
    makeMethodOption({
      key: "none",
      label: "No — there is no run without the robot",
      implies: null,
      approximation: null,
    }),
  ],
});

const COUNTERFACTUAL_SOURCE = makeMethodQuestion({
  key: "counterfactualSource",
  prompt: "If there is no control run, where does the counterfactual come from?",
  queryKey: "source",
  about: "where your counterfactual comes from",
  options: [
    makeMethodOption({
      key: "straight",
      label: "A constant-velocity guess from the person's own recent path",
      implies: "forecastCounterfactual",
      approximation:
        "The guess ran at this bench's own horizon and its own checked instant, both printed " +
        "beside the numbers below. How far ahead a guess runs and when it is checked change the " +
        "size of the answer without changing the room, so yours would read a different number.",
    }),
    makeMethodOption({
      key: "learned",
      label: "A learned trajectory predictor",
      implies: "forecastCounterfactual",
      approximation: FORECAST_STAND_IN,
    }),
    makeMethodOption({
      key: "intended",
      label: "A hand-specified intended path",
      implies: "forecastCounterfactual",
      approximation: FORECAST_STAND_IN,
    }),
    makeMethodOption({
      key: "absolute",
      label: "There is none — it is an absolute quantity",
      implies: "noCounterfactual",
      approximation:
        "The absolute quantity MIRN read is how far the robot travelled. Closest approach and a " +
        "near-miss count are the same shape of thing and inherit the same defect, which is that " +
        "there is nothing subtracted and so nothing the number could be judged against.",
    }),
  ],
});

const STRETCH = makeMethodQuestion({
  key: "stretch",
  prompt: "Over what stretch of the episode?",
  queryKey: "stretch",
  about: "which stretch of the episode your number covers",
  options: [
    makeMethodOption({
      key: "whole",
      label: "The whole episode",
      implies: null,
      approximation: unusedAnswer(
        "The stretch changes the size of a reading without changing the room, so a bench that " +
          "moved it for you would be reporting a different measurement under your heading.",
      ),
    }),
    makeMethodOption({
      key: "window",
      label: "A fixed window around the encounter",
      implies: null,
      approximation: unusedAnswer(
        "The stretch changes the size of a reading without changing the room, so a bench that " +
          "moved it for you would be reporting a different measurement under your heading.",
      ),
    }),
    makeMethodOption({
      key: "moving",
      label: "Only while both are moving",
      implies: null,
      approximation: unusedAnswer(
        "The stretch changes the size of a reading without changing the room, so a bench that " +
          "moved it for you would be reporting a different measurement under your heading.",
      ),
    }),
  ],
});

const AGGREGATION = makeMethodQuestion({
  key: "aggregation",
  prompt: "How is it aggregated?",
  queryKey: "aggregation",
  about: "how your number is aggregated across people and instants",
  options: [
    makeMethodOption({
      key: "average",
      label: "An average over people",
      implies: null,
      approximation: unusedAnswer(
        "How a reading is reduced changes its size, and the confound the family carries is the " +
          "same confound under every reduction of it.",
      ),
    }),
    makeMethodOption({
      key: "worstperson",
      label: "The worst person",
      implies: null,
      approximation: unusedAnswer(
        "How a reading is reduced changes its size, and the confound the family carries is the " +
          "same confound under every reduction of it.",
      ),
    }),
    makeMethodOption({
      key: "worstinstant",
      label: "The worst instant",
      implies: null,
      approximation: unusedAnswer(
        "How a reading is reduced changes its size, and the confound the family carries is the " +
          "same confound under every reduction of it.",
      ),
    }),
    makeMethodOption({
      key: "crossings",
      label: "A count of threshold crossings",
      implies: null,
      approximation: unusedAnswer(
        "How a reading is reduced changes its size, and the confound the family carries is the " +
          "same confound under every reduction of it.",
      ),
    }),
  ],
});

const ZERO_REFERENCE = makeMethodQuestion({
  key: "zeroReference",
  prompt: "Is a zero-effect reference reported beside it?",
  queryKey: "reference",
  about: "whether you report a zero-effect reference beside your number",
  options: [
    makeMethodOption({
      key: "yes",
      label: "Yes — it is printed beside what the method would read if the answer were nothing",
      implies: null,
      approximation: unusedAnswer(
        "What you report beside your own number is your practice, not this bench's arithmetic, " +
          "and nothing here can measure it.",
      ),
    }),
    makeMethodOption({
      key: "no",
      label: "No — the number is reported on its own",
      implies: null,
      approximation: unusedAnswer(
        "What you report beside your own number is your practice, not this bench's arithmetic, " +
          "and nothing here can measure it.",
      ),
    }),
  ],
});

export const QUESTIONS: Readonly<Record<QuestionKey, MethodQuestion>> = Object.freeze({
  controlRun: CONTROL_RUN,
  counterfactualSource: COUNTERFACTUAL_SOURCE,
  stretch: STRETCH,
  aggregation: AGGREGATION,
  zeroReference: ZERO_REFERENCE,
});

/**
 * The order the questions are asked in, and the order `resolveFamily` reads them in.
 *
 * Those two being the same order is the whole of the precedence rule: the first answer that names
 * a family wins, and it is also the first one the reader gave.
 */
export const QUESTION_ORDER: readonly QuestionKey[] = Object.freeze([
  "controlRun",
  "counterfactualSource",
  "stretch",
  "aggregation",
  "zeroReference",
] as const);

/** Every answer given, one per question. Partial answers are a `MethodDraft`, below. */
export interface MethodAnswers {
  readonly kind: "methodAnswers";
  readonly chosen: Readonly<Record<QuestionKey, OptionKey>>;
}

/** What is on screen while the reader is still answering: an option per question, or nothing. */
export type MethodDraft = Readonly<Record<QuestionKey, OptionKey | null>>;

export const EMPTY_DRAFT: MethodDraft = Object.freeze({
  controlRun: null,
  counterfactualSource: null,
  stretch: null,
  aggregation: null,
  zeroReference: null,
});

export function optionFor(question: QuestionKey, key: OptionKey): MethodOption | null {
  for (const option of QUESTIONS[question].options) {
    if (option.key === key) {
      return option;
    }
  }
  return null;
}

/** Which questions are still unanswered, in the order they are asked. */
export function unanswered(draft: MethodDraft): readonly QuestionKey[] {
  const missing: QuestionKey[] = [];
  for (const key of QUESTION_ORDER) {
    if (draft[key] === null) {
      missing.push(key);
    }
  }
  return Object.freeze(missing);
}

/**
 * A complete set of answers, or a throw.
 *
 * Validated rather than trusted: an answer key that no question offers would otherwise resolve to
 * a family by falling off the end of the walk below, and the reader would be shown a verdict about
 * a method nobody described.
 */
export function makeMethodAnswers(draft: MethodDraft): MethodAnswers {
  const chosen: Partial<Record<QuestionKey, OptionKey>> = {};
  for (const key of QUESTION_ORDER) {
    const given = draft[key];
    if (given === null) {
      fail(`the question '${key}' has not been answered, and all five are carried in the link`);
    }
    if (optionFor(key, given) === null) {
      fail(`the question '${key}' does not offer the answer '${given}'`);
    }
    chosen[key] = given;
  }
  return Object.freeze({
    kind: "methodAnswers" as const,
    chosen: Object.freeze({ ...chosen }) as Readonly<Record<QuestionKey, OptionKey>>,
  });
}

export interface FamilyResolution {
  readonly kind: "familyResolution";
  readonly family: FamilyKey;
  /** Which question's answer settled it. Printed, so the reader is never left guessing. */
  readonly decidedBy: QuestionKey;
  /** The option that settled it, so the page can quote the reader's own words back. */
  readonly decidedByAnswer: MethodOption;
  /**
   * One sentence per answer that was approximated or recorded-and-unused, in question order.
   *
   * An answer that was OVERRULED contributes nothing here — it is in `notInPlay` instead. That
   * distinction was not in the first version of this and the page shipped a real lie for it: a
   * reader who said they compare against a twin run, and then answered the counterfactual
   * question anyway, was told a straight-line forecaster had run on their behalf. No forecaster
   * ran. The first answer had already settled the family and the second was never consulted.
   */
  readonly approximations: readonly string[];
  /**
   * Questions whose answer named a family and was overruled by an earlier one.
   *
   * Named rather than dropped. The second question's prompt begins "if there is no control run",
   * so an answer to it when there is one is not wrong, it is simply not about this method — and a
   * page that quietly ignored it would leave a reader wondering which of their answers counted.
   */
  readonly notInPlay: readonly QuestionKey[];
}

/**
 * The family a described method belongs to, and which answer decided it.
 *
 * Total by construction and proved total by test: the walk below is guaranteed to find a family
 * because the second question offers no answer that names none, and every reachable combination
 * is enumerated in `questions.test.ts`. The throw is there for the case a future edit breaks that
 * — a silent fallback to one of the four would be a reader scored against a family they never
 * described.
 */
export function resolveFamily(answers: MethodAnswers): FamilyResolution {
  let family: FamilyKey | null = null;
  let decidedBy: QuestionKey | null = null;
  let decidedByAnswer: MethodOption | null = null;
  const approximations: string[] = [];
  const notInPlay: QuestionKey[] = [];

  for (const key of QUESTION_ORDER) {
    const chosen = answers.chosen[key];
    const option = optionFor(key, chosen);
    if (option === null) {
      fail(`the question '${key}' does not offer the answer '${chosen}'`);
    }
    if (option.implies !== null) {
      if (family !== null) {
        // Overruled: this answer names a family, and an earlier answer already named one. Its
        // approximation describes a measurement that did not happen, so it must NOT be collected
        // below — printing it would tell a reader a forecaster ran when no forecaster ran.
        notInPlay.push(key);
        continue;
      }
      family = option.implies;
      decidedBy = key;
      decidedByAnswer = option;
    }
    if (option.approximation !== null) {
      approximations.push(option.approximation);
    }
  }

  if (family === null || decidedBy === null || decidedByAnswer === null) {
    fail(
      "these five answers name no family this bench can run, so there is nothing to measure and " +
        "nothing honest to show",
    );
  }
  return Object.freeze({
    kind: "familyResolution" as const,
    family,
    decidedBy,
    decidedByAnswer,
    approximations: Object.freeze(approximations),
    notInPlay: Object.freeze(notInPlay),
  });
}

/**
 * Whether this family's reading is a comparison at all.
 *
 * Read off the family's own ruler, never off its key. A ruler that takes an absolute readout has
 * no second thing to subtract, so it has no zero — and a count of the seeds on which it cleared a
 * line is not a detection rate, because nothing is being detected. The page renders those two
 * cases in different shapes and decides which by asking this, so a fifth family added later with
 * an absolute ruler gets the right shape without anybody remembering to ask for it.
 */
export function isComparison(family: FamilyKey): boolean {
  return FAMILIES[family].ruler.kind !== "absoluteReadout";
}

/** Every family a reader can reach through the questionnaire, in the catalogue's own order. */
export function reachableFamilies(): readonly FamilyKey[] {
  const reachable = new Set<FamilyKey>();
  for (const key of QUESTION_ORDER) {
    for (const option of QUESTIONS[key].options) {
      if (option.implies !== null) {
        reachable.add(option.implies);
      }
    }
  }
  const ordered: FamilyKey[] = [];
  for (const key of FAMILY_ORDER) {
    if (reachable.has(key)) {
      ordered.push(key);
    }
  }
  return Object.freeze(ordered);
}
