import { describe, expect, it } from "vitest";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";
import {
  EXTERNAL_CROWD_DISCLOSURE, EXTERNAL_DISCLOSURE_CLAUSES, producedByLine,
} from "../disclosure.js";

/**
 * The third kind of number, and what it has to say before it appears.
 *
 * Guardrail 1 already keeps two kinds of number apart: a reading about MIRN's own invented crowd
 * carries `INVENTED_CROWD_DISCLOSURE`, and a goodness-of-fit figure with real people on one side of
 * it carries `FIT_DISCLOSURE`. A reading off another simulator, read in from a file, is neither —
 * this suite is the third disclosure's test, built the same way `fitVerdict.test.ts` builds the
 * second: each clause asserted by its content, never by counting paragraphs.
 */
describe("what a reading off somebody else's simulator has to say", () => {
  it("says the crowd was simulated by a simulator this bench did not write", () => {
    expect(EXTERNAL_CROWD_DISCLOSURE).toContain("did not write");
  });

  it("says this bench has not checked that simulator's physics", () => {
    expect(EXTERNAL_CROWD_DISCLOSURE.toLowerCase()).toMatch(/has not (checked|characterised)/);
  });

  it("says a number here describes that simulator and not robots or people", () => {
    const lower = EXTERNAL_CROWD_DISCLOSURE.toLowerCase();
    expect(lower).toContain("not a measurement of");
  });

  it("carries every clause it claims to carry", () => {
    for (const clause of EXTERNAL_DISCLOSURE_CLAUSES) {
      expect(EXTERNAL_CROWD_DISCLOSURE).toContain(clause);
    }
  });

  it("is not the invented-crowd sentence wearing a hat", () => {
    // Asserted by absence rather than by importing `web/app/console/csv.ts`: this suite runs in
    // the DOM-free engine project, and reaching into the console layer from here would couple the
    // two. The clause below is the one the invented-crowd sentence carries and this one must not.
    expect(EXTERNAL_CROWD_DISCLOSURE).not.toContain("invented model of pedestrians");
    // A relabelled copy of the invented-crowd sentence's OWN closing clause is the more dangerous
    // near-miss, and the one a first draft of this file actually made: it claims the two arms are
    // known to share their exogenous noise, which is exactly what an adapted run set cannot
    // establish (there is no tape and no seed this bench controls to check it against). Guard
    // against both halves of that borrowed ending sailing back in under different words.
    expect(EXTERNAL_CROWD_DISCLOSURE).not.toContain("the same random wobble");
    expect(EXTERNAL_CROWD_DISCLOSURE).not.toContain("is the robot's effect on them");
  });

  it("says what it checked between the two runs, concretely", () => {
    const lower = EXTERNAL_CROWD_DISCLOSURE.toLowerCase();
    expect(lower).toContain("name the same people");
    expect(lower).toContain("share a clock and a length");
    expect(lower).toContain("within a whisker");
    expect(lower).toContain("exact agreement");
  });

  it("says what it did not check, and does not claim the runs shared their randomness", () => {
    const lower = EXTERNAL_CROWD_DISCLOSURE.toLowerCase();
    expect(lower).toContain("did not check");
    expect(lower).toContain("shared the same underlying randomness");
  });

  it("attributes the no-other-difference claim to the file, not to a finding of its own", () => {
    expect(EXTERNAL_CROWD_DISCLOSURE).toContain("is the file's claim, not a finding of this bench's");
    expect(EXTERNAL_CROWD_DISCLOSURE).toContain("only as good as that claim");
  });

  it("names the producer without naming a variable at anybody", () => {
    const line = producedByLine({
      kind: "provenance", producer: "omnisim", producerVersion: "1.2",
      simulator: "a walker", crowdModel: "a crowd", build: "abc123",
    });
    expect(line).toContain("omnisim");
    expect(line).toContain("abc123");
    expect(line).not.toMatch(CODE_IDENTIFIER);
  });

  it("puts no code identifier in front of a reader", () => {
    expect(EXTERNAL_CROWD_DISCLOSURE).not.toMatch(CODE_IDENTIFIER);
  });

  it("puts no bare figure in front of a reader", () => {
    expect(EXTERNAL_CROWD_DISCLOSURE).not.toMatch(/\d/);
  });
});
