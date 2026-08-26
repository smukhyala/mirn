import { describe, expect, it } from "vitest";
import { ContractError } from "../../core/errors.js";
import { FAMILIES, FAMILY_ORDER, type FamilyKey } from "../families.js";
import {
  EMPTY_DRAFT,
  QUESTIONS,
  QUESTION_ORDER,
  isComparison,
  makeMethodAnswers,
  optionFor,
  reachableFamilies,
  resolveFamily,
  unanswered,
  type MethodDraft,
  type OptionKey,
  type QuestionKey,
} from "../questions.js";

/**
 * The questionnaire is closed, total, written in English, and every answer a reader can give
 * lands on a family this bench can actually run.
 *
 * The interesting claim is totality, and it is not checked one option at a time. An option-by-
 * option check would pass a table where three of the five questions name no family at all and the
 * resolver falls off the end — which is exactly the shape this table has, because three of the
 * five questions genuinely do not decide anything. So the check walks the whole cross-product of
 * answers a reader can give (three times four times three times four times two of them) and
 * demands each one resolve to a real family. That is the property the page depends on: there is no
 * combination of radio buttons that produces a verdict about nothing.
 *
 * Each option is then held to its own declaration separately: an option that names a family must
 * be able to be the reason that family was chosen. A declaration nothing can reach is decoration.
 */

/** A term the operator has never met, spelled the way a program spells it. Same regex the column,
 *  axis and family catalogues are held to, because the same reader meets all four. */
const CODE_IDENTIFIER = /\b(?:[a-z]+[A-Z][A-Za-z]*|[a-z_]+_[a-z_]+)\b|[()[\]{}]|=>/;

/** Every complete set of answers a reader can give, as drafts ready to be validated. */
function everyAnswerSet(): readonly MethodDraft[] {
  let sets: MethodDraft[] = [{ ...EMPTY_DRAFT }];
  for (const key of QUESTION_ORDER) {
    const grown: MethodDraft[] = [];
    for (const partial of sets) {
      for (const option of QUESTIONS[key].options) {
        grown.push({ ...partial, [key]: option.key });
      }
    }
    sets = grown;
  }
  return sets;
}

describe("the questionnaire is a closed table", () => {
  it("orders every question exactly once", () => {
    const keys = Object.keys(QUESTIONS) as QuestionKey[];
    expect([...QUESTION_ORDER].sort()).toEqual([...keys].sort());
    expect(new Set(QUESTION_ORDER).size).toBe(QUESTION_ORDER.length);
    // Five questions is what the design specifies, and the count is what the page's own copy
    // counts down from while the reader answers.
    expect(QUESTION_ORDER.length).toBe(5);
  });

  it("gives every question its own key back, and freezes it", () => {
    for (const key of QUESTION_ORDER) {
      const question = QUESTIONS[key];
      expect(question.key).toBe(key);
      expect(question.kind).toBe("methodQuestion");
      expect(Object.isFrozen(question)).toBe(true);
      expect(Object.isFrozen(question.options)).toBe(true);
      for (const option of question.options) {
        expect(Object.isFrozen(option)).toBe(true);
        expect(option.kind).toBe("methodOption");
      }
    }
  });

  it("spells every question and every answer differently in a link", () => {
    const queryKeys = new Set<string>();
    for (const key of QUESTION_ORDER) {
      queryKeys.add(QUESTIONS[key].queryKey);
      const optionKeys = new Set<string>();
      for (const option of QUESTIONS[key].options) {
        optionKeys.add(option.key);
      }
      expect(optionKeys.size, `${key} offers the same answer twice`).toBe(
        QUESTIONS[key].options.length,
      );
    }
    expect(queryKeys.size, "two questions share a link spelling").toBe(QUESTION_ORDER.length);
  });

  it("writes every reader-facing string in English, not in code", () => {
    let checked = 0;
    for (const key of QUESTION_ORDER) {
      const question = QUESTIONS[key];
      expect(question.prompt).not.toMatch(CODE_IDENTIFIER);
      expect(question.about).not.toMatch(CODE_IDENTIFIER);
      expect(question.prompt.length).toBeGreaterThan(20);
      for (const option of question.options) {
        expect(option.label, `${key}/${option.key} reads as code`).not.toMatch(CODE_IDENTIFIER);
        if (option.approximation !== null) {
          expect(
            option.approximation,
            `${key}/${option.key}'s approximation reads as code`,
          ).not.toMatch(CODE_IDENTIFIER);
          // Guardrail: no numeric literal in copy. The horizon, the checked instant, the seed
          // count and the band's replicates are all rendered from the measurement on screen, so
          // an approximation sentence that quoted one would be a claim outliving its settings.
          expect(
            option.approximation,
            `${key}/${option.key}'s approximation carries a number in its wording`,
          ).not.toMatch(/\d/);
        }
        checked = checked + 1;
      }
    }
    expect(checked, "no answer was examined").toBeGreaterThan(15);
  });
});

describe("every answer a reader can give lands on a family this bench runs", () => {
  const sets = everyAnswerSet();

  it("enumerates the whole cross-product, rather than a corner of it", () => {
    // A cross-product builder with an off-by-one produces one answer set and every assertion
    // below passes having checked a single path through the questionnaire.
    let expected = 1;
    for (const key of QUESTION_ORDER) {
      expected = expected * QUESTIONS[key].options.length;
    }
    expect(sets.length).toBe(expected);
    expect(sets.length).toBe(3 * 4 * 3 * 4 * 2);
    expect(new Set(sets.map((set) => JSON.stringify(set))).size).toBe(sets.length);
  });

  it("resolves every one of them to a real family", () => {
    let resolved = 0;
    for (const draft of sets) {
      const answers = makeMethodAnswers(draft);
      const resolution = resolveFamily(answers);
      expect(
        FAMILY_ORDER.includes(resolution.family),
        `${JSON.stringify(draft)} resolved to a family the catalogue does not have`,
      ).toBe(true);
      expect(FAMILIES[resolution.family].key).toBe(resolution.family);
      expect(QUESTION_ORDER.includes(resolution.decidedBy)).toBe(true);
      // The question named as the decider must be the one whose answer actually names the family.
      expect(resolution.decidedByAnswer.implies).toBe(resolution.family);
      expect(resolution.decidedByAnswer.key).toBe(answers.chosen[resolution.decidedBy]);
      resolved = resolved + 1;
    }
    expect(resolved, "no answer set was resolved").toBe(sets.length);
  });

  it("reaches all four families, so none of them is unreachable decoration", () => {
    const reached = new Set<FamilyKey>();
    for (const draft of sets) {
      reached.add(resolveFamily(makeMethodAnswers(draft)).family);
    }
    expect([...reached].sort()).toEqual([...FAMILY_ORDER].sort());
    expect([...reachableFamilies()]).toEqual([...FAMILY_ORDER]);
  });

  it("lets every answer that names a family actually be the reason one was chosen", () => {
    // The other half of totality. An option can declare a family and still never decide anything,
    // if some earlier question always wins first. That declaration would be a lie a reader never
    // sees and no other test here would catch.
    let declared = 0;
    for (const key of QUESTION_ORDER) {
      for (const option of QUESTIONS[key].options) {
        if (option.implies === null) {
          continue;
        }
        declared = declared + 1;
        let decidedSomewhere = false;
        for (const draft of sets) {
          if (draft[key] !== option.key) {
            continue;
          }
          const resolution = resolveFamily(makeMethodAnswers(draft));
          if (resolution.decidedBy === key && resolution.family === option.implies) {
            decidedSomewhere = true;
          }
        }
        expect(
          decidedSomewhere,
          `${key}/${option.key} says it names a family and never gets to`,
        ).toBe(true);
      }
    }
    expect(declared, "no answer names a family at all").toBeGreaterThan(0);
  });

  it("lets the first question overrule the second, because the second only applies without it", () => {
    // The second question's own prompt begins "if there is no control run". An answer to it when
    // there IS one is not a contradiction to be resolved by chance; the first question wins, and
    // the page says which answer decided.
    const draft: MethodDraft = {
      controlRun: "twin",
      counterfactualSource: "absolute",
      stretch: "whole",
      aggregation: "average",
      zeroReference: "yes",
    };
    const resolution = resolveFamily(makeMethodAnswers(draft));
    expect(resolution.family).toBe("pairedShared");
    expect(resolution.decidedBy).toBe("controlRun");
  });

  it("hands the second question the decision when the first says there is no control run", () => {
    const withoutControl: Readonly<Record<OptionKey, FamilyKey>> = {
      straight: "forecastCounterfactual",
      learned: "forecastCounterfactual",
      intended: "forecastCounterfactual",
      absolute: "noCounterfactual",
    };
    let checked = 0;
    for (const option of QUESTIONS.counterfactualSource.options) {
      const draft: MethodDraft = {
        controlRun: "none",
        counterfactualSource: option.key,
        stretch: "window",
        aggregation: "worstperson",
        zeroReference: "no",
      };
      const resolution = resolveFamily(makeMethodAnswers(draft));
      expect(resolution.decidedBy).toBe("counterfactualSource");
      expect(resolution.family).toBe(withoutControl[option.key]);
      checked = checked + 1;
    }
    expect(checked).toBe(QUESTIONS.counterfactualSource.options.length);
  });
});

describe("the approximation is carried as data, not left to a page to remember", () => {
  it("says a straight-line guess ran wherever a learned predictor was described", () => {
    // The single worst thing this page could do is let a reader leave believing their own learned
    // predictor was simulated. The sentence saying otherwise lives on the option, so it cannot be
    // lost by a page that forgets to print it — the page prints the list it is handed.
    for (const key of ["learned", "intended"]) {
      const option = optionFor("counterfactualSource", key);
      expect(option, `the second question no longer offers '${key}'`).not.toBeNull();
      expect(option?.implies).toBe("forecastCounterfactual");
      expect(option?.approximation).not.toBeNull();
      expect(option?.approximation).toContain("straight line");
    }
  });

  it("collects one sentence per answer that was approximated or ignored", () => {
    const draft: MethodDraft = {
      controlRun: "none",
      counterfactualSource: "learned",
      stretch: "whole",
      aggregation: "average",
      zeroReference: "yes",
    };
    const resolution = resolveFamily(makeMethodAnswers(draft));
    // Four of these five answers changed nothing or were stood in for: the learned predictor, and
    // the three questions that do not reach the estimator at all.
    expect(resolution.approximations.length).toBe(4);
    for (const sentence of resolution.approximations) {
      expect(sentence.length).toBeGreaterThan(40);
    }
  });

  it("never claims a forecaster ran when an earlier answer settled the family", () => {
    // The defect this test exists for was shipped and found by driving the page: a reader who said
    // they compare against a twin run, and answered the counterfactual question anyway, was told
    // "MIRN has no learned trajectory predictor … what ran instead is a straight line". Nothing of
    // the sort ran. The first answer had already settled the family and the second was never
    // consulted, so its approximation described a measurement that did not happen.
    const draft: MethodDraft = {
      controlRun: "twin",
      counterfactualSource: "learned",
      stretch: "whole",
      aggregation: "average",
      zeroReference: "yes",
    };
    const resolution = resolveFamily(makeMethodAnswers(draft));
    expect(resolution.family).toBe("pairedShared");
    expect([...resolution.notInPlay]).toEqual(["counterfactualSource"]);
    for (const sentence of resolution.approximations) {
      expect(sentence, "an overruled answer's approximation was collected").not.toContain(
        "straight line",
      );
      expect(sentence).not.toContain("learned trajectory predictor");
    }
    // The three recorded-and-unused questions still say so; only the overruled one is moved.
    expect(resolution.approximations.length).toBe(3);
  });

  it("moves nothing to one side when the deciding answer is the last one that could decide", () => {
    // The complement: with no control run, the second question DOES decide, so nothing is
    // overruled and its approximation is the honest one.
    const draft: MethodDraft = {
      controlRun: "none",
      counterfactualSource: "learned",
      stretch: "whole",
      aggregation: "average",
      zeroReference: "yes",
    };
    const resolution = resolveFamily(makeMethodAnswers(draft));
    expect([...resolution.notInPlay]).toEqual([]);
    expect(resolution.approximations.length).toBe(4);
  });

  it("says so on every answer to the three questions that change nothing", () => {
    // A question whose answer is collected and then silently dropped is the same defect as a
    // permalink that writes a payload it never reads.
    for (const key of ["stretch", "aggregation", "zeroReference"] as QuestionKey[]) {
      for (const option of QUESTIONS[key].options) {
        expect(option.implies, `${key}/${option.key} claims to decide the family`).toBeNull();
        expect(
          option.approximation,
          `${key}/${option.key} is collected and never says it changed nothing`,
        ).not.toBeNull();
      }
    }
  });
});

describe("a family with no comparison in it is not scored as a detector", () => {
  it("separates the three comparisons from the one absolute quantity", () => {
    const comparisons: FamilyKey[] = [];
    const absolutes: FamilyKey[] = [];
    for (const key of FAMILY_ORDER) {
      if (isComparison(key)) {
        comparisons.push(key);
      } else {
        absolutes.push(key);
      }
    }
    expect(comparisons).toEqual(["pairedShared", "unpairedSeparate", "forecastCounterfactual"]);
    expect(absolutes).toEqual(["noCounterfactual"]);
  });

  it("reads that off the family's ruler rather than off its name", () => {
    // A fifth family with an absolute ruler must get the same treatment without anybody editing
    // this predicate, which is the whole reason it is derived.
    for (const key of FAMILY_ORDER) {
      expect(isComparison(key)).toBe(FAMILIES[key].ruler.kind !== "absoluteReadout");
    }
  });
});

describe("the factory refuses what would make a verdict describe nobody's method", () => {
  it("refuses an answer set with a question left blank", () => {
    expect(() => makeMethodAnswers(EMPTY_DRAFT)).toThrow(ContractError);
    expect(() =>
      makeMethodAnswers({
        controlRun: "twin",
        counterfactualSource: "straight",
        stretch: "whole",
        aggregation: "average",
        zeroReference: null,
      }),
    ).toThrow(ContractError);
  });

  it("refuses an answer no question offers, rather than resolving it by falling through", () => {
    expect(() =>
      makeMethodAnswers({
        controlRun: "sideways",
        counterfactualSource: "straight",
        stretch: "whole",
        aggregation: "average",
        zeroReference: "yes",
      }),
    ).toThrow(ContractError);
  });

  it("counts what is still unanswered, in the order the questions are asked", () => {
    expect([...unanswered(EMPTY_DRAFT)]).toEqual([...QUESTION_ORDER]);
    expect([
      ...unanswered({ ...EMPTY_DRAFT, controlRun: "twin", zeroReference: "no" }),
    ]).toEqual(["counterfactualSource", "stretch", "aggregation"]);
    expect(
      unanswered({
        controlRun: "twin",
        counterfactualSource: "straight",
        stretch: "whole",
        aggregation: "average",
        zeroReference: "yes",
      }).length,
    ).toBe(0);
  });

  it("finds an answer by its link spelling, and reports nothing for one no question offers", () => {
    expect(optionFor("controlRun", "twin")?.implies).toBe("pairedShared");
    expect(optionFor("controlRun", "unicorn")).toBeNull();
  });
});
