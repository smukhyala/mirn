import { describe, expect, it } from "vitest";
import { CODE_IDENTIFIER, CODE_IDENTIFIER_OR_SYNTAX } from "./identifiers.js";

/**
 * The patterns are guardrail 12's only mechanical enforcement, and until they were hoisted nothing
 * checked them — each of the twenty copies was asserted WITH rather than asserted ABOUT. A pattern
 * that quietly stopped matching would have turned every one of those suites green at once, which
 * is the loudest possible way for a guardrail to fail silently.
 */
describe("the identifier patterns match what a program spells", () => {
  const CODE = [
    "cvmResidual",
    "replicateBand",
    "showControl",
    "hold_line",
    "split_half_null",
    "readingArm2",
    "MAX_SPEED",
  ];

  it("catches every shape of identifier this project has actually leaked", () => {
    for (const word of CODE) {
      expect(CODE_IDENTIFIER.test(word), `${word} reads as code and was not caught`).toBe(true);
      expect(CODE_IDENTIFIER_OR_SYNTAX.test(word)).toBe(true);
    }
  });

  it("leaves English alone, including the words that look like near misses", () => {
    // Each of these appears on a shipped surface. A pattern that failed them would make the
    // guardrail unusable, and the repair under deadline would be to loosen it until the page
    // passed — which is how a gate gets destroyed.
    const ENGLISH = [
      "the run-to-run band",
      "a constant-velocity forecast",
      "metres",
      "How every number here is worked out",
      "eight rooms, run twice",
      "0.352 m",
    ];
    for (const phrase of ENGLISH) {
      expect(CODE_IDENTIFIER.test(phrase), `"${phrase}" is English and was flagged`).toBe(false);
    }
  });
});

describe("the known gap is known, rather than believed not to exist", () => {
  it("misses a digit before the first capital, which the module says out loud", () => {
    // Pinned deliberately. If somebody widens the pattern, this test fails and points them at the
    // paragraph explaining why it was left — which is the conversation worth having, rather than a
    // silent behaviour change riding along inside an unrelated commit.
    expect(CODE_IDENTIFIER.test("arm2Reading")).toBe(false);
  });
});

describe("the two patterns differ only where the difference is meant to be", () => {
  it("bans a bracket and a fat arrow in a catalogue entry, and only there", () => {
    for (const syntax of ["closest approach (metres)", "a => b", "{ kind }", "[0]"]) {
      expect(CODE_IDENTIFIER_OR_SYNTAX.test(syntax)).toBe(true);
      expect(CODE_IDENTIFIER.test(syntax), `"${syntax}" must stay legal in prose`).toBe(false);
    }
  });

  it("agrees with itself about identifiers, so the catalogue form is never the weaker one", () => {
    for (const word of ["cvmResidual", "hold_line", "readingArm2"]) {
      expect(CODE_IDENTIFIER.test(word)).toBe(CODE_IDENTIFIER_OR_SYNTAX.test(word));
    }
  });
});

describe("the patterns are safe to share", () => {
  it("carries no global flag, whose lastIndex would make one caller's result depend on another's", () => {
    // The whole hazard of hoisting a regex into a module. With /g, `.test` advances `lastIndex`
    // and the next caller starts mid-string — so the second suite to use it would see different
    // answers from the first, intermittently, and only in the order the files happened to run.
    expect(CODE_IDENTIFIER.flags).toBe("");
    expect(CODE_IDENTIFIER_OR_SYNTAX.flags).toBe("");
  });

  it("gives the same answer twice in a row, for the same reason stated out loud", () => {
    expect(CODE_IDENTIFIER.test("cvmResidual")).toBe(true);
    expect(CODE_IDENTIFIER.test("cvmResidual")).toBe(true);
  });
});
