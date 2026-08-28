import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { CODE_IDENTIFIER_OR_SYNTAX } from "../../../testing/identifiers.js";

/**
 * The strip that tells a stranger what this page is before they touch a control.
 *
 * Everything here reads the FILE rather than a booted page, for the same reason
 * `disclosure.test.ts` does: what is being defended is the document order a reader with no
 * JavaScript gets. A strip that a script inserts after load is a strip the first-time reader this
 * whole thing exists for may never see.
 *
 * The ordering assertion is the load-bearing one, and it has two sides. The strip must come AFTER
 * the disclosure, because guardrail 1 says the invented-crowd sentence reaches a beginner before
 * anything else does, and an orientation strip is exactly the kind of friendly thing that gets
 * moved above it. It must come BEFORE the arena, because a strip below the fold explains nothing
 * to somebody who has already started pressing buttons.
 */

const HTML = readFileSync("web/index.html", "utf8");
const DOM = new JSDOM(HTML);
const STRIP = DOM.window.document.querySelector(".orientation");

function stripText(): string {
  if (STRIP === null) {
    throw new Error("the orientation strip is gone from web/index.html");
  }
  return (STRIP.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("the orientation strip", () => {
  it("is in the static markup", () => {
    expect(STRIP).not.toBeNull();
    expect(stripText().length).toBeGreaterThan(80);
  });

  it("sits after the disclosure and before the arena, the settings and the ledger", () => {
    const disclosure = HTML.indexOf('id="disclosure"');
    const strip = HTML.indexOf('class="orientation"');
    expect(disclosure).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(-1);
    expect(disclosure, "the strip precedes the invented-crowd disclosure").toBeLessThan(strip);
    for (const anchor of ['id="arena"', 'id="readouts"', 'id="settings"', 'id="ledger"']) {
      const at = HTML.indexOf(anchor);
      expect(at, `${anchor} is missing from web/index.html`).toBeGreaterThan(-1);
      expect(strip, `${anchor} precedes the orientation strip`).toBeLessThan(at);
    }
  });

  it("names all three steps, in order", () => {
    if (STRIP === null) {
      throw new Error("the orientation strip is gone from web/index.html");
    }
    const steps = STRIP.querySelectorAll("li");
    expect(steps.length, "the strip does not walk through three steps").toBe(3);
    const first = (steps[0]?.textContent ?? "").toLowerCase();
    const second = (steps[1]?.textContent ?? "").toLowerCase();
    const third = (steps[2]?.textContent ?? "").toLowerCase();
    expect(first).toContain("crowd");
    expect(second).toContain("run");
    expect(third).toContain("tile");
  });

  it("says why the room is run twice, which is the one thing a real corridor cannot do", () => {
    const text = stripText().toLowerCase();
    expect(text).toContain("twice");
    expect(text).toContain("without");
  });

  /**
   * The same ban the catalogues and `how.html` carry. A strip written to be friendly is exactly
   * where somebody reaches for a variable name to be precise with.
   */
  it("spells no word the way a program spells it", () => {
    expect(stripText()).not.toMatch(CODE_IDENTIFIER_OR_SYNTAX);
  });

  /**
   * Guardrail 1 again, from the other end: the strip ships in the markup, so any measurement
   * written into it would be a number a reader meets before pressing Run and before the
   * settings that produced it exist. `disclosure.test.ts` makes this check over the whole file;
   * it is repeated here so a failure names the strip rather than the page.
   */
  it("quotes no measurement of its own", () => {
    expect(/\d+\.\d+\s*(m|s)\b/.exec(stripText())).toBeNull();
  });
});
