import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { ContractError } from "../../../engine/core/errors.js";
import { FAMILIES, FAMILY_ORDER, type FamilyKey } from "../../../engine/job/families.js";
import {
  makeFamilyProbeSettings,
  probeFamily,
  PROBE_SEEDS,
  type FamilyProbe,
  type FamilyProbeSettings,
} from "../../../engine/job/familyProbe.js";
import {
  QUESTIONS,
  QUESTION_ORDER,
  isComparison,
  makeMethodAnswers,
  resolveFamily,
  type MethodDraft,
} from "../../../engine/job/questions.js";
import { REFUSAL, makeMethodVerdict, renderMethodVerdict } from "../method.js";
import { CODE_IDENTIFIER_OR_SYNTAX } from "../../../testing/identifiers.js";

/**
 * The verdict: what it says, what it refuses to say, and the one distinction it must not flatten.
 *
 * Every probe below is a REAL probe — two rooms and a two-run drift line rather than the shipped
 * eight and eight, which is about a quarter of a second per family. Not a fixture: a fixture of
 * hand-typed numbers would let the verdict be built from a shape the engine never produces, and
 * the two assertions this file exists for both turn on the numbers being the engine's own.
 * `familyProbe.slow.test.ts` owns the pinned measurements at the shipped settings; this owns what
 * is done with them.
 *
 * ## The distinction
 *
 * Three of the four families are comparisons, and a count of the rooms they cleared the drift line
 * on — where the true effect is exactly nothing — is a false-positive rate. The fourth is not a
 * comparison at all. It reads how far the robot travelled: about eighteen metres against a line
 * measured in centimetres, clearing it every time, and clearing it says nothing whatever about the
 * robot. Printing that count in the same shape as the other three would invite the reader to
 * conclude it is the worst detector of the four, when it is not a detector, and that is precisely
 * the misleading number this project exists to argue against.
 */

const CHEAP: FamilyProbeSettings = makeFamilyProbeSettings({
  seeds: [PROBE_SEEDS[0] as number, PROBE_SEEDS[1] as number],
  bandReplicates: 2,
});

const PROBES = new Map<FamilyKey, FamilyProbe>();

function probeOf(key: FamilyKey): FamilyProbe {
  const held = PROBES.get(key);
  if (held !== undefined) {
    return held;
  }
  const fresh = probeFamily(FAMILIES[key], CHEAP);
  PROBES.set(key, fresh);
  return fresh;
}

/**
 * The first set of answers that lands on this family, found by walking the whole closed table.
 *
 * The whole cross-product rather than one answer at a time: two of the five questions decide the
 * family together, so a search that varied one answer against a fixed background could never reach
 * the family that needs "there is no control run" AND "it is an absolute quantity". That is not a
 * hypothetical — it is what the first version of this helper did, and it could not find a quarter
 * of the catalogue.
 */
function draftFor(target: FamilyKey): MethodDraft {
  let sets: Record<string, string>[] = [{}];
  for (const key of QUESTION_ORDER) {
    const grown: Record<string, string>[] = [];
    for (const partial of sets) {
      for (const option of QUESTIONS[key].options) {
        grown.push({ ...partial, [key]: option.key });
      }
    }
    sets = grown;
  }
  for (const candidate of sets) {
    const draft = candidate as unknown as MethodDraft;
    if (resolveFamily(makeMethodAnswers(draft)).family === target) {
      return draft;
    }
  }
  throw new Error(`no set of answers reaches '${target}'`);
}

function verdictFor(key: FamilyKey): ReturnType<typeof makeMethodVerdict> {
  return makeMethodVerdict({
    resolution: resolveFamily(makeMethodAnswers(draftFor(key))),
    probe: probeOf(key),
    settings: CHEAP,
  });
}

function render(key: FamilyKey): HTMLElement {
  const dom = new JSDOM("<!doctype html><body></body>");
  return renderMethodVerdict(dom.window.document, verdictFor(key));
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

describe("the verdict names the family the answers selected", () => {
  it("builds one for every family the questionnaire can reach", () => {
    let built = 0;
    for (const key of FAMILY_ORDER) {
      const verdict = verdictFor(key);
      expect(verdict.family.key, `${key}'s verdict names another family`).toBe(key);
      expect(verdict.family.name).toBe(FAMILIES[key].name);
      built = built + 1;
    }
    expect(built, "no verdict was built").toBe(FAMILY_ORDER.length);
  });

  it("prints that family's name and its confound, word for word from the catalogue", () => {
    for (const key of FAMILY_ORDER) {
      const node = render(key);
      expect(node.getAttribute("data-family")).toBe(key);
      const name = node.querySelector(".method-family-name");
      expect(name?.textContent).toBe(FAMILIES[key].name);
      const confound = node.querySelector(".method-confound");
      expect(confound?.textContent).toBe(FAMILIES[key].confound);
    }
  });

  it("refuses a measurement of a different family from the one the answers picked", () => {
    // The one way this page could show a complete, plausible, wrong verdict. The answers name a
    // family; the probe carries the family it actually measured; if those two are allowed to
    // differ, a reader is told about one method and shown another's numbers.
    expect(() =>
      makeMethodVerdict({
        resolution: resolveFamily(makeMethodAnswers(draftFor("forecastCounterfactual"))),
        probe: probeOf("noCounterfactual"),
        settings: CHEAP,
      }),
    ).toThrow(ContractError);
  });

  it("says which answer decided it, in the reader's own words", () => {
    for (const key of FAMILY_ORDER) {
      const draft = draftFor(key);
      const resolution = resolveFamily(makeMethodAnswers(draft));
      const verdict = makeMethodVerdict({ resolution, probe: probeOf(key), settings: CHEAP });
      expect(verdict.decidedBy).toContain(QUESTIONS[resolution.decidedBy].about);
      expect(verdict.decidedBy).toContain(resolution.decidedByAnswer.label);
    }
  });
});

describe("the family that compares nothing is not scored as a detector", () => {
  it("gives the three comparisons a rate, with a headline count", () => {
    let rated = 0;
    for (const key of FAMILY_ORDER) {
      if (!isComparison(key)) {
        continue;
      }
      const node = render(key);
      const clearing = node.querySelector('[data-number="clearing"]');
      expect(clearing, `${key} shows no count of rooms cleared`).not.toBeNull();
      expect(clearing?.getAttribute("data-second")).toBe("false-positive-rate");
      expect(
        node.querySelector(".method-rate-number"),
        `${key} shows no headline count`,
      ).not.toBeNull();
      // A rate has a zero: what the count would read if the method had nothing to report. It is
      // measured on the same rooms — how often the TRUE effect cleared the line — and it is nought.
      expect(clearing?.querySelector(".figure-zero")).not.toBeNull();
      expect(clearing?.textContent).toContain("false positive");
      rated = rated + 1;
    }
    expect(rated, "no family was rated").toBe(3);
  });

  it("gives the absolute quantity a different shape, with no headline count at all", () => {
    const node = render("noCounterfactual");
    const clearing = node.querySelector('[data-number="clearing"]');
    expect(clearing).not.toBeNull();
    expect(clearing?.getAttribute("data-second")).toBe("not-a-detection");
    // The assertion this file exists for. A headline count here would sit in the same visual slot
    // as the three rates above and be read across them.
    expect(
      node.querySelector(".method-rate-number"),
      "the family that detects nothing was given a rate's headline count",
    ).toBeNull();
    expect(clearing?.querySelector(".figure-value")).toBeNull();
    expect(clearing?.textContent).toContain("not a false-positive rate");
    expect(clearing?.textContent).toContain("it is not a detector");
  });

  it("uses exactly two shapes across the four families, split the way the rulers are", () => {
    const shapes = new Map<FamilyKey, string>();
    for (const key of FAMILY_ORDER) {
      const clearing = render(key).querySelector('[data-number="clearing"]');
      const shape = clearing?.getAttribute("data-second") ?? "";
      expect(shape.length, `${key} declares no shape at all`).toBeGreaterThan(0);
      shapes.set(key, shape);
    }
    expect(new Set(shapes.values()).size).toBe(2);
    for (const key of FAMILY_ORDER) {
      const expected = isComparison(key) ? "false-positive-rate" : "not-a-detection";
      expect(shapes.get(key), `${key} got the wrong shape`).toBe(expected);
    }
  });

  it("still reports the count itself, rather than hiding what it read", () => {
    // Not showing it as a rate is not the same as not showing it. The number is real and the page
    // says it; what it refuses is the shape that would make it comparable to a rate.
    const probe = probeOf("noCounterfactual");
    const node = render("noCounterfactual");
    // Scoped to the clearing block. Unscoped, this counted the spread sentence's own inline figure
    // too and would have gone red for a reason that had nothing to do with what it is checking.
    const inline = node.querySelectorAll('[data-number="clearing"] .figure-inline');
    expect(inline.length).toBe(2);
    expect(inline[0]?.textContent).toBe(String(probe.nClearedBand));
    expect(inline[1]?.textContent).toBe(String(probe.nAttempted));
  });
});

describe("every number is shown beside what it would read if the answer were zero", () => {
  it("prints the reading against a zero measured on the same rooms", () => {
    for (const key of FAMILY_ORDER) {
      const probe = probeOf(key);
      const verdict = verdictFor(key);
      expect(verdict.reading.value).toBe(probe.meanReading);
      // Exactly nothing, and measured rather than typed: this is the mean of the per-room true
      // effects, each of which the probe checked against a hard zero.
      expect(verdict.reading.zeroValue).toBe(0);
      const node = render(key);
      const reading = node.querySelector('[data-number="reading"]');
      expect(reading?.querySelector(".figure-zero-value")).not.toBeNull();
      expect(reading?.querySelector(".figure-zero-how")?.textContent).toContain("exactly");
    }
  });

  it("prints a metre beside something that gives it scale, never alone", () => {
    // Guardrail 7. Three things stand beside the reading: a body-scale phrase, the zero it would
    // read if the method were sound, and the drift line the count is taken against.
    for (const key of FAMILY_ORDER) {
      const node = render(key);
      expect(node.querySelector('[data-number="reading"] .figure-anchor')).not.toBeNull();
      expect(node.querySelector('[data-number="drift"]')).not.toBeNull();
    }
  });

  it("refuses to build a verdict on a world whose true effect was not exactly nothing", () => {
    const honest = probeOf("forecastCounterfactual");
    const tampered: FamilyProbe = { ...honest, nTruthsExactlyZero: honest.nAttempted - 1 };
    expect(() =>
      makeMethodVerdict({
        resolution: resolveFamily(makeMethodAnswers(draftFor("forecastCounterfactual"))),
        probe: tampered,
        settings: CHEAP,
      }),
    ).toThrow(ContractError);
    const drifted: FamilyProbe = { ...honest, nTruthsUnderBand: honest.nAttempted - 1 };
    expect(() =>
      makeMethodVerdict({
        resolution: resolveFamily(makeMethodAnswers(draftFor("forecastCounterfactual"))),
        probe: drifted,
        settings: CHEAP,
      }),
    ).toThrow(ContractError);
  });
});

describe("nothing on the verdict is a number somebody typed", () => {
  it("keeps every digit inside a value slot, on every family", () => {
    // The mechanical half of "no numeric literal appears in console copy". A caption quoting a
    // figure into its own sentence is a claim that outlives the settings that produced it, and
    // this project has shipped six of them before — beside slots already printing the same value.
    let scanned = 0;
    for (const key of FAMILY_ORDER) {
      for (const leaf of leaves(render(key))) {
        if (isValueSlot(leaf.classes)) {
          continue;
        }
        expect(
          /\d/.test(leaf.text),
          `${key}: "${leaf.text.trim()}" carries a number in copy, in .${leaf.classes}`,
        ).toBe(false);
        scanned = scanned + 1;
      }
    }
    expect(scanned, "no copy was scanned").toBeGreaterThan(40);
  });

  it("would notice a digit that escaped into copy", () => {
    // The test that tests the test. A scan whose slot list swallowed everything is
    // indistinguishable from a page that obeys the rule.
    expect(isValueSlot("figure-note")).toBe(false);
    expect(isValueSlot("figure-number method-rate-number")).toBe(true);
    const dom = new JSDOM("<!doctype html><body></body>");
    const planted = dom.window.document.createElement("p");
    planted.className = "figure-note";
    planted.textContent = "and this reads 0.000 m";
    const found = leaves(planted as unknown as Element);
    expect(found.length).toBe(1);
    expect(/\d/.test(found[0]?.text ?? "")).toBe(true);
  });

  it("writes no code identifier anywhere a reader can see", () => {
    let scanned = 0;
    for (const key of FAMILY_ORDER) {
      for (const leaf of leaves(render(key))) {
        expect(CODE_IDENTIFIER_OR_SYNTAX.test(leaf.text), `${key}: "${leaf.text.trim()}" reads as code`).toBe(false);
        scanned = scanned + 1;
      }
    }
    expect(scanned, "no text was scanned").toBeGreaterThan(40);
  });
});

describe("the refusal is stated as flatly as the numbers", () => {
  it("says what this can show and what it cannot, in the design's own words", () => {
    expect(REFUSAL[0]).toBe(
      "This can show that a method is untrustworthy. It cannot show that one is sound. The crowd " +
        "here is invented, so passing this battery is necessary and not sufficient.",
    );
    expect(REFUSAL.length).toBeGreaterThan(1);
  });

  it("puts it on the page, last, in its own part", () => {
    for (const key of FAMILY_ORDER) {
      const node = render(key);
      const parts = [...node.querySelectorAll(".verdict-part")].map((p) => p.getAttribute("data-part"));
      // The design's order: the family and what was run in place of the reader's description,
      // then the numbers, then the refusal. The approximation sits in front of the numbers rather
      // than under them, because a reader who has already read the figures has already been misled.
      expect(parts).toEqual(["family", "ran", "numbers", "refusal"]);
      const refusal = node.querySelector('[data-part="refusal"]');
      for (const paragraph of REFUSAL) {
        expect(refusal?.textContent).toContain(paragraph);
      }
    }
  });

  it("states what was actually run before any number appears", () => {
    // The honest limitation, and the place it has to be. A reader who believes their own learned
    // predictor was simulated has been misled, and that is worse than this page not existing.
    for (const key of FAMILY_ORDER) {
      const html = render(key).innerHTML;
      const ran = html.indexOf('data-part="ran"');
      const numbers = html.indexOf('data-part="numbers"');
      expect(ran).toBeGreaterThan(-1);
      expect(numbers).toBeGreaterThan(ran);
    }
  });

  it("never tells a reader a forecaster ran when their first answer settled the family", () => {
    // Found by driving the real page, not by reading the code. The paired family runs no
    // forecaster at all, and the verdict was printing the forecaster's stand-in sentence because
    // the reader had answered a question that did not apply to them.
    const draft: MethodDraft = {
      controlRun: "twin",
      counterfactualSource: "learned",
      stretch: "whole",
      aggregation: "average",
      zeroReference: "yes",
    };
    const resolution = resolveFamily(makeMethodAnswers(draft));
    const verdict = makeMethodVerdict({ resolution, probe: probeOf("pairedShared"), settings: CHEAP });
    const dom = new JSDOM("<!doctype html><body></body>");
    const ran = renderMethodVerdict(dom.window.document, verdict).querySelector('[data-part="ran"]');
    expect(ran?.textContent).not.toContain("straight line");
    expect(ran?.textContent).not.toContain("learned trajectory predictor");
    // And the answer is not dropped in silence either: the page says it did not apply, and why.
    expect(ran?.textContent).toContain("did not apply here, and nothing was run for it");
    expect(dom.window.document.body.childNodes.length).toBe(0);
    expect(verdict.notInPlay.length).toBe(1);
  });

  it("names the straight-line stand-in when a learned predictor was described", () => {
    const draft: MethodDraft = {
      controlRun: "none",
      counterfactualSource: "learned",
      stretch: "whole",
      aggregation: "average",
      zeroReference: "yes",
    };
    const resolution = resolveFamily(makeMethodAnswers(draft));
    const verdict = makeMethodVerdict({
      resolution,
      probe: probeOf("forecastCounterfactual"),
      settings: CHEAP,
    });
    const dom = new JSDOM("<!doctype html><body></body>");
    const node = renderMethodVerdict(dom.window.document, verdict);
    const ran = node.querySelector('[data-part="ran"]');
    expect(ran?.textContent).toContain("no learned trajectory predictor");
    expect(ran?.textContent).toContain("straight line");
    expect(node.querySelectorAll(".method-approximation").length).toBe(
      verdict.approximations.length,
    );
    expect(verdict.approximations.length).toBeGreaterThan(0);
  });
});

describe("the verdict says what it was measured at", () => {
  it("stamps the rooms and the runs behind the drift line, from the settings actually used", () => {
    for (const key of FAMILY_ORDER) {
      const node = render(key);
      const values = [...node.querySelectorAll(".method-stamps .stamp-value")].map(
        (n) => n.textContent,
      );
      expect(values[0]).toBe(String(CHEAP.seeds.length));
      expect(values[1]).toBe(String(CHEAP.bandReplicates));
    }
  });

  it("stamps the forecaster's own horizon, and only for the family that has one", () => {
    const forecast = render("forecastCounterfactual");
    const labels = [...forecast.querySelectorAll(".method-stamps .stamp-label")].map(
      (n) => n.textContent,
    );
    expect(labels).toContain("guess rolled forward");
    expect(labels).toContain("and checked at");
    for (const key of FAMILY_ORDER) {
      if (key === "forecastCounterfactual") {
        continue;
      }
      const others = [...render(key).querySelectorAll(".method-stamps .stamp-label")].map(
        (n) => n.textContent,
      );
      expect(others, `${key} was stamped with a forecaster it does not have`).not.toContain(
        "guess rolled forward",
      );
    }
  });
});
