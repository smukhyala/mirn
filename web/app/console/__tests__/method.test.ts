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
import {
  RANGE_NOT_SOUNDNESS,
  RATE_RANGE_CONFIDENCE,
  REFUSAL,
  makeMethodVerdict,
  rateRangeFor,
  renderMethodVerdict,
} from "../method.js";
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

function textOf(node: Element | null): string {
  return node?.textContent ?? "";
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

/**
 * Eight rooms, every one of them cleared: the count the range exists for.
 *
 * The tallies are overridden rather than measured, and that is the point of the case rather than a
 * shortcut around it. What is under test is what the page prints for a count of all-of-n — the one
 * shape where the textbook interval would print no width at all — and not whether some family
 * happens to clear on all of eight rooms. Every field that has to agree is moved together, so the
 * verdict is built from a coherent measurement: eight rooms attempted, eight read, eight cleared,
 * and all eight truths exactly nothing and beneath the line. `interval.test.ts` owns the arithmetic
 * this leans on; this owns what a reader is shown when it comes back.
 */
function allOfEight(key: FamilyKey): FamilyProbe {
  const honest = probeOf(key);
  const rooms = 8;
  return {
    ...honest,
    nAttempted: rooms,
    nUsed: rooms,
    nClearedBand: rooms,
    nTruthsExactlyZero: rooms,
    nTruthsUnderBand: rooms,
  };
}

function rangeValuesIn(node: Element | null): readonly string[] {
  const found: string[] = [];
  for (const slot of node?.querySelectorAll(".figure-range .figure-inline") ?? []) {
    found.push(slot.textContent ?? "");
  }
  return found;
}

describe("a count of rooms says how loosely it pins the rate down", () => {
  it("qualifies every branch that has a rate, and does it inside that count's own block", () => {
    let rated = 0;
    for (const key of FAMILY_ORDER) {
      if (!isComparison(key)) {
        continue;
      }
      const node = render(key);
      const clearing = node.querySelector('[data-number="clearing"]');
      const range = clearing?.querySelector(".figure-range") ?? null;
      expect(range, `${key} prints a rate with no range`).not.toBeNull();
      // Inside the block, not beside it. A range in a block of its own would be a second figure,
      // and a second figure on this page would need a zero of its own for a measurement nobody
      // made. Everything it says lives under the count it qualifies.
      expect(node.querySelectorAll(".figure-range").length).toBe(1);
      expect(range?.closest("[data-number]")).toBe(clearing);
      expect(node.querySelector('[data-number="range"]')).toBeNull();
      // One zero in that block, and it belongs to the count rather than to the range.
      expect(clearing?.querySelectorAll(".figure-zero").length).toBe(1);
      expect(clearing?.querySelectorAll(".figure-value").length).toBe(1);
      rated = rated + 1;
    }
    expect(rated, "no rate was qualified").toBe(3);
  });

  it("says what the bounds mean, in words, and quotes no shorthand for the level", () => {
    const said = textOf(render("pairedShared").querySelector(".figure-range"));
    expect(said).toContain("consistent with a true rate anywhere between");
    expect(said).toContain("a method that never clears the line");
    expect(said).toContain("one that clears it in every room");
    expect(said).toContain("aim to cover the true rate in");
    // The reader has never seen a statistics course, so neither the name of the arithmetic nor its
    // shorthand appears anywhere on the page.
    const whole = textOf(render("pairedShared"));
    for (const shorthand of ["Wilson", "confidence interval", "CI", "p-value", "significance"]) {
      expect(whole, `the page says "${shorthand}" at a reader`).not.toContain(shorthand);
    }
  });

  it("refuses to let a narrower range read as a sounder method", () => {
    // Guardrail 2, where the reader meets the range rather than in a footnote under the page.
    for (const key of FAMILY_ORDER) {
      if (!isComparison(key)) {
        continue;
      }
      const clearing = render(key).querySelector('[data-number="clearing"]');
      const how = textOf(clearing?.querySelector(".figure-range-how") ?? null);
      expect(how).toBe(RANGE_NOT_SOUNDNESS);
      expect(how).toContain("a more precisely known number, not a truer one");
      expect(how).toContain("whether the method is sound");
    }
  });

  it("shows a bound well below every room when every room cleared", () => {
    // The case the whole feature is for. Eight of eight is the count this bench produces most
    // often, and the textbook interval has no width at all there — it would print a range from
    // certainty to certainty on eight observations, which is a worse lie than no range.
    const verdict = makeMethodVerdict({
      resolution: resolveFamily(makeMethodAnswers(draftFor("forecastCounterfactual"))),
      probe: allOfEight("forecastCounterfactual"),
      settings: CHEAP,
    });
    expect(verdict.clearing.kind).toBe("falsePositiveRate");
    if (verdict.clearing.kind !== "falsePositiveRate") {
      return;
    }
    expect(verdict.clearing.nCleared).toBe(8);
    expect(verdict.clearing.nAttempted).toBe(8);

    const dom = new JSDOM("<!doctype html><body></body>");
    const node = renderMethodVerdict(dom.window.document, verdict);
    const shown = rangeValuesIn(node.querySelector('[data-number="clearing"]'));
    // The rooms, the two bounds, and the level the range was drawn at.
    expect(shown.length).toBe(4);
    expect(shown[0]).toBe("8");
    const low = Number(shown[1]);
    const high = Number(shown[2]);
    // The assertion this case exists for: the page shows a bound well below every room, not a
    // range of no width. The engine pins the figure; what is asserted here is that a reader sees it.
    expect(low).toBeLessThan(1);
    expect(low).toBeLessThan(0.75);
    expect(low).toBeGreaterThan(0.6);
    expect(high).toBe(1);
    expect(high - low, "the page printed a range of no width on eight rooms").toBeGreaterThan(0.2);
    expect(Number(shown[3])).toBe(RATE_RANGE_CONFIDENCE);
  });

  it("draws the range over the same two counts the fraction above it is printed from", () => {
    for (const key of FAMILY_ORDER) {
      const verdict = verdictFor(key);
      if (verdict.clearing.kind !== "falsePositiveRate") {
        continue;
      }
      const interval = verdict.clearing.range.interval;
      expect(interval.nCleared).toBe(verdict.clearing.nCleared);
      expect(interval.nAttempted).toBe(verdict.clearing.nAttempted);
      expect(interval.confidence).toBe(RATE_RANGE_CONFIDENCE);
      // It contains the count it qualifies, which is the whole of what a range is for.
      expect(interval.low).toBeLessThanOrEqual(interval.point);
      expect(interval.point).toBeLessThanOrEqual(interval.high);
    }
    expect(rateRangeFor(8, 8).interval.high).toBe(1);
  });

  it("gives the family that is not detecting anything no range at all", () => {
    // A range says how well a count of rooms pins a RATE down. This count is not a rate — the same
    // number comes back whether the robot moved everybody in the room or nobody — so a range on it
    // would be a precision claim about a rate that this block exists to say is not one.
    const verdict = verdictFor("noCounterfactual");
    expect(verdict.clearing.kind).toBe("notADetection");
    expect("range" in verdict.clearing, "the non-detector was given a rate's range").toBe(false);
    const clearing = render("noCounterfactual").querySelector('[data-number="clearing"]');
    expect(clearing?.querySelector(".figure-range")).toBeNull();
    expect(clearing?.querySelector(".figure-range-how")).toBeNull();
    expect(render("noCounterfactual").querySelector(".figure-range")).toBeNull();
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
    // Above what the page scanned before the range was added to it: the three rate blocks each
    // brought six more leaves of copy, and a guard that did not move would not notice if they
    // stopped rendering.
    expect(scanned, "no copy was scanned").toBeGreaterThan(140);
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

  it("would notice a range written into a sentence instead of into slots", () => {
    // The same meta-test aimed at the new copy. The range is the easiest thing on this page to
    // write out longhand — it is a sentence with two numbers in it — so the scan is shown catching
    // exactly that, in the very element the range renders into.
    expect(isValueSlot("figure-range")).toBe(false);
    expect(isValueSlot("figure-range-how")).toBe(false);
    const dom = new JSDOM("<!doctype html><body></body>");
    const planted = dom.window.document.createElement("p");
    planted.className = "figure-range";
    planted.textContent =
      "Counted over 8 rooms, that count is consistent with a true rate anywhere between 0.676 " +
      "and 1.000.";
    const found = leaves(planted as unknown as Element);
    expect(found.length).toBe(1);
    expect(isValueSlot(found[0]?.classes ?? "")).toBe(false);
    expect(/\d/.test(found[0]?.text ?? "")).toBe(true);

    // And the shipped range is the same sentence with every digit lifted out of it, so the scan
    // above passes on the real page rather than passing because nothing renders there.
    const real = render("pairedShared").querySelector(".figure-range");
    const copy = leaves(real as Element).filter((leaf) => !isValueSlot(leaf.classes));
    expect(copy.length).toBeGreaterThan(3);
    for (const leaf of copy) {
      expect(/\d/.test(leaf.text), `"${leaf.text.trim()}" carries a number in the range's copy`)
        .toBe(false);
    }
  });

  it("writes no code identifier anywhere a reader can see", () => {
    let scanned = 0;
    for (const key of FAMILY_ORDER) {
      for (const leaf of leaves(render(key))) {
        expect(CODE_IDENTIFIER_OR_SYNTAX.test(leaf.text), `${key}: "${leaf.text.trim()}" reads as code`).toBe(false);
        scanned = scanned + 1;
      }
    }
    expect(scanned, "no text was scanned").toBeGreaterThan(210);
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
