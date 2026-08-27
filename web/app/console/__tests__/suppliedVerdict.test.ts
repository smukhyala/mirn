import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { ContractError } from "../../../engine/core/errors.js";
import {
  makeFamilyProbeSettings,
  type FamilyProbeSettings,
} from "../../../engine/job/familyProbe.js";
import type { SuppliedOutcome } from "../../../engine/job/supplied.js";
import {
  aggregateSuppliedProbe,
  type SuppliedProbe,
  type SuppliedProbeSeed,
} from "../../../engine/job/suppliedProbe.js";
import { REFUSAL } from "../method.js";
import { makeSuppliedVerdict, renderSuppliedVerdict } from "../suppliedVerdict.js";
import { CODE_IDENTIFIER, CODE_IDENTIFIER_OR_SYNTAX } from "../../../testing/identifiers.js";

/**
 * The verdict for a method the reader wrote: what it says, and the two things it must never lose.
 *
 * ## Why the rooms are hand-built here and were not on the method card
 *
 * `method.test.ts` runs REAL probes, two rooms at a time, because a family's reading is whatever
 * the engine computes and a hand-typed one could describe a shape the engine never produces. The
 * shapes that matter here are the opposite: a method that stopped, a method that timed out, a
 * method that answered twice differently, and a method that did all three across five rooms. None
 * of those come out of the simulator on demand — you would have to write a metric that fails on
 * exactly the third room — so the outcomes are literals and the counting is still the engine's
 * own: `aggregateSuppliedProbe` does the tallying, so no count on any fixture below is a number
 * somebody typed next to the rooms it is supposed to describe.
 *
 * ## The two findings a described method cannot produce
 *
 * A questionnaire answer cannot fail and cannot contradict itself. A written function can do both,
 * and those are the whole reason this path exists, so two assertions here are load-bearing:
 *
 *   - a method's own failure sentence reaches the page byte for byte, never a substituted apology;
 *   - a method that answered two different distances to one question makes the page say, above
 *     every figure, that the averages cannot be trusted — because an average over inconsistent
 *     answers is an average of different quantities and no care further down repairs it.
 */

const BAND_M = 0.084;
const PEAK_BAND_M = 0.211;

/** One room of the zero-effect world: a true effect of exactly nothing, a drift line, an outcome. */
function room(seed: number, outcome: SuppliedOutcome): SuppliedProbeSeed {
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

function failed(message: string): SuppliedOutcome {
  return Object.freeze({ kind: "failed" as const, message });
}

function nondeterministic(firstM: number, secondM: number): SuppliedOutcome {
  return Object.freeze({ kind: "nondeterministic" as const, firstM, secondM });
}

function timedOut(limitMs: number): SuppliedOutcome {
  return Object.freeze({ kind: "timedOut" as const, limitMs });
}

/** Settings whose room count matches the probe's, which the verdict insists on. */
function settingsFor(nRooms: number): FamilyProbeSettings {
  const seeds: number[] = [];
  for (let i = 0; i < nRooms; i++) {
    seeds.push(20260827 + i * 7919);
  }
  return makeFamilyProbeSettings({ seeds, bandReplicates: 2 });
}

/**
 * A method's own words, and they are the reader's rather than ours.
 *
 * Written as plain English because this fixture is also scanned by the identifier and digit checks
 * below. What a real method says is outside our control and is printed unchanged regardless — that
 * is the point of the failure block — so this string stands for the shape rather than the worst
 * case.
 */
const OWN_WORDS = "the horizon was longer than the episode";
const OTHER_WORDS = "there was nobody in the room to measure against";

interface Branch {
  readonly name: string;
  readonly probe: SuppliedProbe;
  readonly settings: FamilyProbeSettings;
}

function branch(name: string, seeds: readonly SuppliedProbeSeed[]): Branch {
  return {
    name,
    probe: aggregateSuppliedProbe(seeds),
    settings: settingsFor(seeds.length),
  };
}

/** A method that answered every room, cleared the drift line on one of them, and never wavered. */
const CLEAN = branch("clean read", [
  room(1, read(0.031)),
  room(2, read(0.052)),
  room(3, read(0.128)),
  room(4, read(0.019)),
]);

/** One room only: no spread is computable, and the page must not print one anyway. */
const LONE = branch("one room", [room(1, read(0.044))]);

const SOME_FAILED = branch("some failures", [
  room(1, read(0.037)),
  room(2, failed(OWN_WORDS)),
  room(3, read(0.146)),
  room(4, failed(OTHER_WORDS)),
]);

const ALL_FAILED = branch("all failed", [
  room(1, failed(OWN_WORDS)),
  room(2, failed(OWN_WORDS)),
  room(3, timedOut(2000)),
]);

const INCONSISTENT = branch("inconsistent", [
  room(1, read(0.041)),
  room(2, nondeterministic(0.4, 0.9)),
  room(3, read(0.062)),
  room(4, read(0.033)),
]);

const MIXED = branch("mixed", [
  room(1, read(0.027)),
  room(2, failed(OWN_WORDS)),
  room(3, nondeterministic(1.25, 1.3)),
  room(4, read(0.301)),
  room(5, timedOut(2000)),
]);

const BRANCHES: readonly Branch[] = Object.freeze([
  CLEAN,
  LONE,
  SOME_FAILED,
  ALL_FAILED,
  INCONSISTENT,
  MIXED,
]);

function verdictFor(entry: Branch): ReturnType<typeof makeSuppliedVerdict> {
  return makeSuppliedVerdict({ probe: entry.probe, settings: entry.settings });
}

function render(entry: Branch): HTMLElement {
  const dom = new JSDOM("<!doctype html><body></body>");
  return renderSuppliedVerdict(dom.window.document, verdictFor(entry));
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

describe("every branch a supplied method can end in is rendered", () => {
  it("puts the parts in the design's order, on every one of them", () => {
    let built = 0;
    for (const entry of BRANCHES) {
      const parts = [...render(entry).querySelectorAll(".verdict-part")].map((p) =>
        p.getAttribute("data-part"),
      );
      // Whether it answered the same way twice sits ABOVE the numbers, not beside them: a reader
      // who has already read the figures has already been misled, and a caveat underneath them
      // arrives after the damage. The refusal is last, as flatly stated as the numbers.
      expect(parts, `${entry.name} renders the parts in another order`).toEqual([
        "ran",
        "consistency",
        "numbers",
        "failures",
        "refusal",
      ]);
      built = built + 1;
    }
    expect(built, "no branch was rendered").toBe(BRANCHES.length);
  });

  it("shows the drift line and the false-positive count on every branch", () => {
    for (const entry of BRANCHES) {
      const node = render(entry);
      expect(node.querySelector('[data-number="drift"]'), entry.name).not.toBeNull();
      const clearing = node.querySelector('[data-number="clearing"]');
      expect(clearing, entry.name).not.toBeNull();
      expect(clearing?.getAttribute("data-second")).toBe("false-positive-rate");
      const denominator = clearing?.querySelector(".figure-denominator");
      expect(denominator?.textContent, `${entry.name} quotes no denominator`).toBe(
        String(entry.probe.nAttempted),
      );
    }
  });

  it("reads every figure off the measurement rather than off a sentence", () => {
    for (const entry of BRANCHES) {
      const verdict = verdictFor(entry);
      expect(verdict.band.value).toBe(entry.probe.meanBandM);
      expect(verdict.clearing.nCleared).toBe(entry.probe.nClearedBand);
      expect(verdict.failures.nRooms).toBe(entry.probe.nFailed);
      expect(verdict.consistency.nRooms).toBe(entry.probe.nNondeterministic);
      expect(verdict.nUsed).toBe(entry.probe.nUsed);
      if (verdict.reading.kind === "suppliedReading") {
        expect(verdict.reading.figure.value).toBe(entry.probe.meanReading);
      }
    }
  });

  it("prints an average only over the rooms that produced one, and says so", () => {
    const node = render(SOME_FAILED);
    const short = textOf(node.querySelector('[data-part="numbers"]'));
    expect(short).toContain("produced a number on");
    expect(short).toContain("not over all of them");
    // The clean branch has nothing to qualify, so the sentence is absent rather than reworded.
    expect(textOf(render(CLEAN).querySelector('[data-part="numbers"]'))).not.toContain(
      "not over all of them",
    );
  });

  it("prints no spread at all when one room cannot have one", () => {
    expect(Number.isFinite(verdictFor(LONE).spread)).toBe(false);
    expect(render(LONE).querySelector(".method-spread")).toBeNull();
    expect(render(CLEAN).querySelector(".method-spread")).not.toBeNull();
  });
});

describe("every figure carries its zero and its scale", () => {
  it("shows the reading against a zero measured on the same rooms, which is exactly nothing", () => {
    for (const entry of BRANCHES) {
      const verdict = verdictFor(entry);
      if (verdict.reading.kind !== "suppliedReading") {
        continue;
      }
      expect(verdict.reading.figure.zeroValue).toBe(0);
      const reading = render(entry).querySelector('[data-number="reading"]');
      expect(reading?.querySelector(".figure-zero-value")).not.toBeNull();
      // The phrase says the answer IS zero here, not that it is near it.
      expect(textOf(reading?.querySelector(".figure-zero-how") ?? null)).toContain(
        "exactly nothing, and not nearly nothing",
      );
      // Guardrail 7: a metre never alone. A body-scale phrase stands beside it.
      expect(reading?.querySelector(".figure-anchor"), entry.name).not.toBeNull();
    }
  });

  it("shows the drift line against a zero and a body scale too", () => {
    for (const entry of BRANCHES) {
      const drift = render(entry).querySelector('[data-number="drift"]');
      expect(drift?.querySelector(".figure-zero-value"), entry.name).not.toBeNull();
      expect(drift?.querySelector(".figure-anchor"), entry.name).not.toBeNull();
      expect(textOf(drift?.querySelector(".figure-zero-how") ?? null)).toContain(
        "not nothing, which is the point",
      );
    }
  });

  it("shows the false-positive count against how often the truth itself cleared that line", () => {
    for (const entry of BRANCHES) {
      const verdict = verdictFor(entry);
      // Measured, never typed: the rooms whose TRUE effect cleared the drift line, and there are
      // none of them, which is what makes a count of the method's own clearings mean anything.
      expect(verdict.clearing.zeroCleared).toBe(0);
      const clearing = render(entry).querySelector('[data-number="clearing"]');
      expect(clearing?.querySelector(".figure-zero"), entry.name).not.toBeNull();
      expect(textOf(clearing)).toContain("false positive");
    }
  });

  it("gives the two counts a described method cannot produce their zeros as well", () => {
    for (const entry of BRANCHES) {
      const node = render(entry);
      for (const name of ["failures", "inconsistency"]) {
        const count = node.querySelector(`[data-number="${name}"]`);
        expect(count, `${entry.name} shows no ${name} count`).not.toBeNull();
        expect(count?.querySelector(".figure-zero-value")).not.toBeNull();
        expect(count?.querySelector(".figure-denominator")?.textContent).toBe(
          String(entry.probe.nAttempted),
        );
      }
    }
  });

  it("says what it was measured at, from the settings actually used", () => {
    for (const entry of BRANCHES) {
      const values = [...render(entry).querySelectorAll(".method-stamps .stamp-value")].map(
        (n) => n.textContent,
      );
      expect(values[0]).toBe(String(entry.settings.seeds.length));
      expect(values[1]).toBe(String(entry.settings.bandReplicates));
    }
  });
});

describe("how many rooms it failed on, in the method's own words", () => {
  it("carries a method's own sentence to the page unchanged", () => {
    // The assertion this branch exists for. A substituted apology would throw away the only
    // useful sentence in the whole failure, which is the one thing a reader debugging their own
    // ruler can act on.
    const node = render(SOME_FAILED);
    const messages = [...node.querySelectorAll(".supplied-message")].map((n) => n.textContent);
    expect(messages).toEqual([OWN_WORDS, OTHER_WORDS]);
  });

  it("counts the rooms it stopped on, against the rooms it was given", () => {
    const verdict = verdictFor(SOME_FAILED);
    expect(verdict.failures.nRooms).toBe(2);
    expect(verdict.failures.nAttempted).toBe(4);
    const failures = render(SOME_FAILED).querySelector('[data-part="failures"]');
    expect(failures?.querySelector(".method-rate-number")?.textContent).toBe("2");
  });

  it("says the same sentence once with a count when several rooms failed the same way", () => {
    const lines = verdictFor(ALL_FAILED).failureLines;
    expect(lines.length).toBe(2);
    const first = lines[0];
    expect(first?.kind).toBe("methodSaid");
    if (first?.kind === "methodSaid") {
      expect(first.message).toBe(OWN_WORDS);
      expect(first.nRooms).toBe(2);
    }
    const second = lines[1];
    expect(second?.kind).toBe("ranTooLong");
    if (second?.kind === "ranTooLong") {
      expect(second.limitS).toBe(2);
    }
    expect(textOf(render(ALL_FAILED).querySelector('[data-part="failures"]'))).toContain(
      "still running after",
    );
  });

  it("shows no reading at all when nothing was read, rather than a blank number", () => {
    const verdict = verdictFor(ALL_FAILED);
    expect(verdict.reading.kind).toBe("noReadingAtAll");
    expect(verdict.nUsed).toBe(0);
    const reading = render(ALL_FAILED).querySelector('[data-number="reading"]');
    expect(reading?.getAttribute("data-second")).toBe("no-reading");
    expect(reading?.querySelector(".figure-number"), "an empty number slot was rendered").toBeNull();
    expect(textOf(reading)).toContain("no distance on any of them");
  });

  it("refuses to let a count of nought read as a clean sheet when nothing was read", () => {
    // Guardrail 2, at its sharpest. Every room this method failed on cleared nothing, so the
    // false-positive count is nought — and a reader who took that for a pass mark would have been
    // told the opposite of what happened.
    const clearing = render(ALL_FAILED).querySelector('[data-number="clearing"]');
    expect(clearing?.querySelector(".method-rate-number")?.textContent).toBe("0");
    expect(textOf(clearing)).toContain("Read it as an absence, never as a clean sheet");
  });

  it("says it did not fail here, and nothing stronger, when it did not", () => {
    const failures = render(CLEAN).querySelector('[data-part="failures"]');
    expect(failures?.querySelector(".method-rate-number")?.textContent).toBe("0");
    // "It did not fail here" is the strongest sentence available from a simulator, and the copy
    // does not reach past it into sound, correct, or better than another.
    expect(textOf(failures)).toContain("It did not fail here");
    expect(textOf(failures)).not.toContain("own words");
  });
});

describe("whether it was inconsistent, and what that does to every number", () => {
  it("renders the warning when the same question got two answers", () => {
    const verdict = verdictFor(INCONSISTENT);
    expect(verdict.consistency.nRooms).toBe(1);
    expect(verdict.averageWarning).not.toBeNull();
    const node = render(INCONSISTENT);
    const warning = node.querySelector(".supplied-warning");
    expect(warning, "an inconsistent method got no warning").not.toBeNull();
    expect(textOf(warning)).toContain("cannot be trusted");
    expect(textOf(warning)).toContain("average over answers to different questions");
  });

  it("puts that warning above every figure it is about", () => {
    // Prominence is position here. An average over answers to different questions is not one
    // measurement, so the sentence belongs to the whole page rather than to one tile under it.
    const html = render(INCONSISTENT).innerHTML;
    const warning = html.indexOf("supplied-warning");
    const numbers = html.indexOf('data-part="numbers"');
    expect(warning).toBeGreaterThan(-1);
    expect(numbers).toBeGreaterThan(warning);
  });

  it("shows both answers and the gap between them, against a body scale", () => {
    const gaps = verdictFor(INCONSISTENT).disagreements;
    expect(gaps.length).toBe(1);
    expect(gaps[0]?.firstM).toBe(0.4);
    expect(gaps[0]?.secondM).toBe(0.9);
    expect(gaps[0]?.gapM).toBeCloseTo(0.5, 12);
    const line = render(INCONSISTENT).querySelector(".supplied-disagreement");
    expect(line, "the two answers were not shown").not.toBeNull();
    const shown = [...(line?.querySelectorAll(".figure-inline") ?? [])].map((n) => n.textContent);
    expect(shown).toEqual(["0.400", "0.900", "0.500"]);
    expect(line?.querySelector(".figure-anchor"), "a metre was shown alone").not.toBeNull();
  });

  it("leaves the numbers unqualified, and says only what was observed, when it never wavered", () => {
    const verdict = verdictFor(CLEAN);
    expect(verdict.averageWarning).toBeNull();
    const node = render(CLEAN);
    expect(node.querySelector(".supplied-warning")).toBeNull();
    const consistency = textOf(node.querySelector('[data-part="consistency"]'));
    expect(consistency).toContain("gave the same answer both times");
    // Guardrail 2: repeating itself is not soundness, and the copy says so in the same breath.
    expect(consistency).toContain("says nothing about what the method measures");
  });

  it("counts an inconsistent room out of the reading, the failures and the average alike", () => {
    const verdict = verdictFor(MIXED);
    expect(verdict.nAttempted).toBe(5);
    expect(verdict.nUsed).toBe(2);
    expect(verdict.failures.nRooms).toBe(2);
    expect(verdict.consistency.nRooms).toBe(1);
    // Every room ended in exactly one of the three, which is what makes the denominators mean
    // anything at all.
    expect(verdict.nUsed + verdict.failures.nRooms + verdict.consistency.nRooms).toBe(5);
    const node = render(MIXED);
    expect(node.querySelector(".supplied-warning")).not.toBeNull();
    expect(node.querySelectorAll(".supplied-message").length).toBe(1);
    expect(textOf(node.querySelector('[data-part="failures"]'))).toContain("still running after");
  });
});

describe("nothing on the verdict is a number somebody typed", () => {
  it("keeps every digit inside a value slot, on every branch", () => {
    // The mechanical half of "no numeric literal appears in console copy". A caption quoting a
    // figure into its own sentence is a claim that outlives the settings that produced it.
    let scanned = 0;
    for (const entry of BRANCHES) {
      for (const leaf of leaves(render(entry))) {
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
    expect(scanned, "no copy was scanned").toBeGreaterThan(20);
  });

  it("would notice a digit that escaped into copy", () => {
    // The test that tests the test. A scan whose slot list swallowed everything is
    // indistinguishable from a page that obeys the rule.
    expect(isValueSlot("figure-note")).toBe(false);
    expect(isValueSlot("supplied-message")).toBe(false);
    expect(isValueSlot("figure-number method-rate-number")).toBe(true);
    const dom = new JSDOM("<!doctype html><body></body>");
    const planted = dom.window.document.createElement("p");
    planted.className = "figure-note";
    planted.textContent = "and this reads 0.000 m";
    const found = leaves(planted as unknown as Element);
    expect(found.length).toBe(1);
    expect(/\d/.test(found[0]?.text ?? "")).toBe(true);
  });

  it("writes no code identifier anywhere a reader can see, on every branch", () => {
    let scanned = 0;
    for (const entry of BRANCHES) {
      for (const leaf of leaves(render(entry))) {
        expect(
          CODE_IDENTIFIER.test(leaf.text),
          `${entry.name}: "${leaf.text.trim()}" reads as code`,
        ).toBe(false);
        scanned = scanned + 1;
      }
    }
    expect(scanned, "no text was scanned").toBeGreaterThanOrEqual(20);
  });

  it("would notice an identifier that reached the page", () => {
    // The same meta-test for the same reason: a pattern that matched nothing anywhere would pass
    // the scan above having checked nothing at all.
    expect(CODE_IDENTIFIER.test("the drift line")).toBe(false);
    expect(CODE_IDENTIFIER.test("nClearedBand")).toBe(true);
    expect(CODE_IDENTIFIER.test("supplied_run")).toBe(true);
  });

  it("holds our own copy to the catalogue's stricter pattern, brackets and all", () => {
    // Two strengths, and the split is the one `identifiers.ts` documents. Everything MIRN wrote
    // here is a label or a phrase, so it is held to the catalogue form, which also bans a bracket
    // and a fat arrow. The one string on the page MIRN did not write — the method's own failure
    // sentence, quoted unchanged — is exempt from that stricter form on purpose: rewriting it to
    // suit our scanner would be exactly the substituted apology this branch exists to refuse.
    let scanned = 0;
    for (const entry of BRANCHES) {
      for (const leaf of leaves(render(entry))) {
        if (leaf.classes.split(/\s+/).includes("supplied-message")) {
          continue;
        }
        expect(
          CODE_IDENTIFIER_OR_SYNTAX.test(leaf.text),
          `${entry.name}: "${leaf.text.trim()}" reads as code`,
        ).toBe(false);
        scanned = scanned + 1;
      }
    }
    expect(scanned, "no copy was scanned").toBeGreaterThanOrEqual(20);
    expect(CODE_IDENTIFIER_OR_SYNTAX.test("a phrase with a bracket ( in it")).toBe(true);
  });
});

describe("the refusal is stated as flatly as the numbers", () => {
  it("puts the method card's own refusal on the page, last, in its own part", () => {
    for (const entry of BRANCHES) {
      const refusal = render(entry).querySelector('[data-part="refusal"]');
      for (const paragraph of REFUSAL) {
        expect(textOf(refusal), entry.name).toContain(paragraph);
      }
    }
    expect(REFUSAL.length).toBeGreaterThan(1);
  });

  it("says what was run, and that the comparison run was never handed over, before any number", () => {
    for (const entry of BRANCHES) {
      const html = render(entry).innerHTML;
      const ran = html.indexOf('data-part="ran"');
      const numbers = html.indexOf('data-part="numbers"');
      expect(ran).toBeGreaterThan(-1);
      expect(numbers).toBeGreaterThan(ran);
      const said = textOf(render(entry).querySelector('[data-part="ran"]'));
      expect(said).toContain("never handed the run without the robot");
    }
  });

  it("says the crowd is invented before the figures it belongs to", () => {
    // Guardrail 1: the disclosure precedes every number on the surface that shows it.
    for (const entry of BRANCHES) {
      const numbers = render(entry).querySelector('[data-part="numbers"]');
      const note = numbers?.querySelector(".region-note") ?? null;
      expect(textOf(note), entry.name).toContain("Simulated crowd");
      const html = numbers?.innerHTML ?? "";
      expect(html.indexOf("region-note")).toBeLessThan(html.indexOf('data-number="drift"'));
    }
  });

  it("admits it cannot see what the method compares, where the count is met", () => {
    // The sentence the questionnaire gets for free and this path cannot: a family declares its
    // ruler, a supplied function declares nothing, and a method returning an absolute quantity
    // would clear this line on every room without detecting anything at all.
    const clearing = render(CLEAN).querySelector('[data-number="clearing"]');
    expect(textOf(clearing)).toContain("cannot see what your method compares");
    expect(textOf(clearing)).toContain("rather than a false alarm");
  });
});

describe("the verdict refuses a measurement it cannot honestly report", () => {
  it("refuses a world whose true effect was not exactly nothing", () => {
    const honest = CLEAN.probe;
    const tampered: SuppliedProbe = { ...honest, nTruthsExactlyZero: honest.nAttempted - 1 };
    expect(() =>
      makeSuppliedVerdict({ probe: tampered, settings: CLEAN.settings }),
    ).toThrow(ContractError);
    const drifted: SuppliedProbe = { ...honest, nTruthsUnderBand: honest.nAttempted - 1 };
    expect(() => makeSuppliedVerdict({ probe: drifted, settings: CLEAN.settings })).toThrow(
      ContractError,
    );
  });

  it("refuses a tally where the rooms do not add up", () => {
    // Every room ended as a reading, a failure or a disagreement. A probe that loses one of them
    // would print a false-positive count over a denominator that is not what happened.
    const miscounted: SuppliedProbe = { ...CLEAN.probe, nFailed: CLEAN.probe.nFailed + 1 };
    expect(() => makeSuppliedVerdict({ probe: miscounted, settings: CLEAN.settings })).toThrow(
      ContractError,
    );
  });

  it("refuses settings that describe a different number of rooms from the ones that ran", () => {
    // The stamp is read off the settings and the counts off the measurement. If those two can
    // disagree, the verdict is stamped with one measurement while printing another's numbers.
    expect(() => makeSuppliedVerdict({ probe: CLEAN.probe, settings: settingsFor(2) })).toThrow(
      ContractError,
    );
  });

  it("refuses a measurement with no drift line, since nothing would give a metre its scale", () => {
    const noLine: SuppliedProbe = { ...CLEAN.probe, meanBandM: Number.NaN };
    expect(() => makeSuppliedVerdict({ probe: noLine, settings: CLEAN.settings })).toThrow(
      ContractError,
    );
  });

  it("reports a method that failed everywhere rather than refusing to report at all", () => {
    // Not an error. "It never produced a number" is precisely the finding this path exists for,
    // and throwing it away would leave a reader with a blank page and no reason for it.
    expect(() => verdictFor(ALL_FAILED)).not.toThrow();
    expect(verdictFor(ALL_FAILED).failures.nRooms).toBe(3);
  });
});
