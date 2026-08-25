import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSettings, settingsNotHonoured } from "../permalink.js";
import { panelValuesFromSettings, settingsFromPanel } from "../preview.js";

/**
 * The four ways in are addresses, and an address can rot.
 *
 * Every link in the page's "Start here" block is a query string the page decodes on load. Rename a
 * setting, narrow a range, or drop a control, and the link keeps working in the sense that it still
 * loads — it just quietly announces to a first-time reader that one of its settings was ignored.
 * That is the worst possible greeting, and it is invisible to every other test here, because
 * nothing else reads the markup.
 *
 * So this reads the real file, pulls the real hrefs, and puts each one through the decoder the page
 * uses and then through the panel the page mounts. Zero complaints, or the build stops.
 */

const HTML = readFileSync("web/index.html", "utf8");

function waysInHrefs(): readonly string[] {
  const block = HTML.match(/<nav class="ways-in"[\s\S]*?<\/nav>/);
  if (block === null) {
    throw new Error("the Start here block is gone from web/index.html");
  }
  const found: string[] = [];
  for (const match of block[0].matchAll(/href="([^"]+)"/g)) {
    const raw = match[1] as string;
    found.push(raw.replace(/&amp;/g, "&"));
  }
  return found;
}

describe("the ways in", () => {
  it("offers four of them", () => {
    expect(waysInHrefs()).toHaveLength(4);
  });

  it("names what to watch without quoting a number", () => {
    const block = HTML.match(/<nav class="ways-in"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const prose = block.replace(/<[^>]*>/g, " ").replace(/href="[^"]*"/g, " ");
    // A caption that quotes a measurement goes stale the moment a formula moves, and nothing
    // would catch it. The links say what to look at; the page says what it reads.
    expect(prose).not.toMatch(/\d+\.\d+/);
  });

  for (const [index, href] of waysInHrefs().entries()) {
    it(`way in ${index + 1} carries no setting this bench would ignore`, () => {
      const decoded = decodeSettings(href);
      expect(decoded.notices).toEqual([]);

      const applied = settingsFromPanel(panelValuesFromSettings(decoded.settings));
      expect(settingsNotHonoured(decoded.settings, applied)).toEqual([]);
    });
  }
});
