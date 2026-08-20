import { describe, expect, it } from "vitest";
import { lintBareNumbers, lintComparatives, lintForwardTerms, proseOf } from "./lints.js";

describe("proseOf", () => {
  it("removes front matter, so declared page numbers are not read as prose", () => {
    const body = "---\npage: 2\ntitle: Something\n---\n\nActual prose.";
    expect(proseOf(body)).not.toContain("page: 2");
    expect(proseOf(body)).toContain("Actual prose");
  });

  it("removes fenced widget blocks, which are full of numbers by design", () => {
    const body = "Before.\n\n```mirn:sweep\nexperiment: e2_density\nx: nPedestrians\n```\n\nAfter.";
    const prose = proseOf(body);
    expect(prose).not.toContain("e2_density");
    expect(prose).toContain("Before");
    expect(prose).toContain("After");
  });

  it("removes maths, inline code, and the literal escape hatch", () => {
    expect(proseOf("$$d = 3 m$$")).not.toContain("3 m");
    expect(proseOf("inline $x = 5 s$ here")).not.toContain("5 s");
    expect(proseOf("`0.42 m`")).not.toContain("0.42 m");
    expect(proseOf("a {{lit:22 m}} room")).not.toContain("22 m");
  });
});

describe("the bare-number lint", () => {
  it("catches a measurement stated without provenance", () => {
    const problems = lintBareNumbers(proseOf("The robot displaced them by 1.37 m."));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.found).toBe("1.37 m");
  });

  it.each([
    ["metres spelled out", "it moved 2 metres"],
    ["seconds", "it took 4.5 s"],
    ["a percentage", "control effort rose 39%"],
    ["a speed", "at 1.1 m/s"],
  ])("catches %s", (_label, text) => {
    expect(lintBareNumbers(proseOf(text)).length).toBeGreaterThan(0);
  });

  it("permits a stated setting wrapped as a literal", () => {
    expect(lintBareNumbers(proseOf("a {{lit:22 m}} by {{lit:13 m}} room"))).toEqual([]);
  });

  it("permits a live quantity token", () => {
    expect(lintBareNumbers(proseOf("displaced by {{q:worked}} from where they would have been"))).toEqual([]);
  });

  it("does not fire on a version, a path or a time of day", () => {
    // The lookbehind exists for these. A lint that cries wolf gets deleted.
    expect(lintBareNumbers(proseOf("see v1.2 in src/mirn/ at 14:05"))).toEqual([]);
  });

  it("does not fire on a bare count with no unit", () => {
    expect(lintBareNumbers(proseOf("there are 18 people in the room"))).toEqual([]);
  });
});

describe("the comparative lint", () => {
  it("catches a relation a slider could falsify", () => {
    const problems = lintComparatives(proseOf("{{q:worked}}, which is more than a stride"));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.rule).toBe("comparative");
  });

  it("catches the comparative before the number as well as after", () => {
    expect(lintComparatives(proseOf("more than the band, at {{q:effect}}")).length).toBeGreaterThan(0);
  });

  it("permits a comparative far away from any live number", () => {
    const far =
      "{{q:worked}} from where they would have been. " +
      "x".repeat(200) +
      " That is more than most people notice.";
    expect(lintComparatives(proseOf(far))).toEqual([]);
  });

  it("permits the sanctioned escape, which cannot go stale", () => {
    // {{q:x.anchor}} interpolates the trace's own scale anchor, so it moves with the number.
    expect(lintComparatives(proseOf("{{q:worked}} — {{q:worked.anchor}}"))).toEqual([]);
  });

  it("permits a comparative between two fixed measured values", () => {
    // The rule is about live numbers, not about comparison. Prose comparing two facts is fine.
    expect(lintComparatives(proseOf("the effect grows faster than the floor does"))).toEqual([]);
  });
});

describe("the jargon gate", () => {
  const LADDER = [
    { id: "deviation", term: "deviation", page: 2 },
    { id: "the-null", term: "the null", page: 7 },
    { id: "confound", term: "confound", page: 8 },
  ];

  it("catches a term used before the page that defines it", () => {
    const problems = lintForwardTerms("The confound is obvious here.", 3, [], LADDER);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.rule).toBe("forward-term");
    expect(problems[0]?.message).toContain("page 8");
  });

  it("permits a term on its own introducing page", () => {
    expect(lintForwardTerms("A confound is a thing.", 8, ["confound"], LADDER)).toEqual([]);
  });

  it("permits a term on any later page", () => {
    expect(lintForwardTerms("The confound again.", 9, [], LADDER)).toEqual([]);
  });

  it("matches whole words only, so a longer word does not trip it", () => {
    // "nullify" must not read as "the null", and "deviations" should — inflection is a word
    // boundary away, a different word is not.
    expect(lintForwardTerms("This nullifies the point.", 1, [], LADDER)).toEqual([]);
  });

  it("matches a multi-word term as a phrase", () => {
    expect(lintForwardTerms("Compare against the null.", 3, [], LADDER)).toHaveLength(1);
    expect(lintForwardTerms("A null result is fine.", 3, [], LADDER)).toEqual([]);
  });

  it("is case-insensitive, because a sentence may open with the term", () => {
    expect(lintForwardTerms("Deviation is what we measure.", 1, [], LADDER)).toHaveLength(1);
  });
});
