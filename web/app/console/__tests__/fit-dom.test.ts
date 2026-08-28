import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";

/**
 * The fit page itself: its prose, and the property that keeps guardrail 1's two kinds of number
 * apart.
 *
 * That guardrail says a reading off the simulator and a goodness-of-fit figure are different kinds
 * of number and must not be confused. The strongest available way to guarantee that is not care, it
 * is arithmetic: this page cannot compute a disturbance number, because nothing it imports can
 * produce one. The last test here asserts that structurally, over the source rather than the DOM,
 * so it stays true no matter what the page later renders.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..", "..", "..");

const HTML = readFileSync(join(WEB, "fit.html"), "utf8");
const BOOT = readFileSync(join(WEB, "fit.ts"), "utf8");

/** Visible text: tags out, then attribute values out, the way `how.test.ts` reads its page. */
function visibleText(html: string): string {
  const body = html.replace(/<!--[\s\S]*?-->/g, " ");
  return body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

describe("the fit page's own prose", () => {
  it("writes no code identifier anywhere a reader can see", () => {
    const text = visibleText(HTML);
    expect(text.length).toBeGreaterThan(400);
    for (const word of text.split(" ")) {
      expect(word, `leaked an identifier: ${word}`).not.toMatch(CODE_IDENTIFIER);
    }
  });

  it("says the three things before it asks for a file", () => {
    const text = visibleText(HTML);
    // The page's own standfirst carries the promise; the rendered verdict carries the clauses.
    expect(text).toContain("three different things");
    expect(text.indexOf("three different things")).toBeLessThan(text.indexOf("Your recording"));
  });

  it("says out loud that it will never produce a disturbance number", () => {
    const text = visibleText(HTML);
    expect(text).toContain("never do is produce a disturbance number");
    expect(text).toContain("cannot be filmed twice");
  });

  it("tells a reader the file stays in their browser", () => {
    const text = visibleText(HTML);
    expect(text).toContain("read in this browser and goes nowhere");
    expect(text).toContain("never enters a link");
  });

  it("warns that the frame rate is theirs to get right", () => {
    // A file annotated at 2.5 and read as 25 describes a crowd walking at a tenth of its speed,
    // and nothing on the page can catch it.
    expect(visibleText(HTML)).toContain("Frames are not seconds");
  });

  it("links every other page that ships", () => {
    for (const page of ["./index.html", "./how.html", "./drill.html", "./method.html"]) {
      expect(HTML, `the fit page does not link ${page}`).toContain(`href="${page}"`);
    }
  });
});

describe("the fit page cannot compute a disturbance number", () => {
  it("imports nothing that measures one", () => {
    // Structural, not cosmetic. `paired` and `cvmResidual` are the two estimators on this site;
    // `columns.js` is the catalogue every disturbance readout is declared in. None reaches here,
    // so there is no path from this page to a figure about a robot.
    expect(BOOT).not.toContain("estimator");
    expect(BOOT).not.toContain("cvmResidual");
    expect(BOOT).not.toContain("paired");
    expect(BOOT).not.toContain("job/columns");
    expect(BOOT).not.toContain("familyProbe");
    expect(BOOT).not.toContain("powerCurve");
  });

  it("reaches the simulator only through the fit, which reads one arm", () => {
    // What it DOES import, asserted so the test above cannot pass by the page importing nothing.
    expect(BOOT).toContain("engine/fit/recording.js");
    expect(BOOT).toContain("worker/fit.client.js");
  });

  it("carries no textarea, because nothing here runs a reader's code", () => {
    // The supplied-method path is the method card's, and it is the only place code is compiled.
    expect(HTML).not.toContain("<textarea");
  });
});
