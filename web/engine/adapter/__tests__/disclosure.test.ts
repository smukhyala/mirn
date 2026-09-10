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
