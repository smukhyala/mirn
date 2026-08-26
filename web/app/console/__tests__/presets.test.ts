import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSettings, settingsNotHonoured } from "../permalink.js";
import { panelValuesFromSettings, settingsFromPanel } from "../preview.js";

/**
 * The ways in are addresses, and an address can rot.
 *
 * Four of them are query strings the page decodes on load. Rename a setting, narrow a range, or
 * drop a control, and a link keeps working in the sense that it still loads — it just quietly
 * announces to a first-time reader that one of its settings was ignored. That is the worst
 * possible greeting, and it is invisible to every other test here, because nothing else reads the
 * markup.
 *
 * So this reads the real file, pulls the real hrefs, and puts each preset through the decoder the
 * page uses and then through the panel the page mounts. Zero complaints, or the build stops.
 *
 * The fifth way in — the referee drill — is a link to a different page, not a preset, and it broke
 * both of the checks above the moment it was added: `toHaveLength(4)` failed because a fifth href
 * had arrived, and the decode loop tried to read `./drill.html` as a query string and reported
 * notices about it, because a page path is not one. Excluding the new link from the block, or
 * relaxing the length assertion to `5`, would each give up a guard rather than fix one: the first
 * stops this file noticing a sixth preset that silently regressed, and the second stops it noticing
 * a *preset* the decoder cannot read. So the two kinds of link are split explicitly instead, each
 * checked the way it can actually be checked: `presetHrefs()` still goes through the settings
 * decoder, and `pageHrefs()` is checked for what a page link can go wrong in a way a preset cannot —
 * carrying a query string of its own, which nothing on this page would ever read back out.
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

/** The ones that carry settings. These are the ones the decoder must accept without complaint. */
function presetHrefs(): readonly string[] {
  return waysInHrefs().filter((href) => href.startsWith("?"));
}

/** The links to other pages. A page link that carries a query string is a mistake: nothing on the
 *  page it points to would read this one's settings back out of it. */
function pageHrefs(): readonly string[] {
  return waysInHrefs().filter((href) => !href.startsWith("?"));
}

describe("the ways in", () => {
  it("offers four presets and one page link", () => {
    expect(presetHrefs()).toHaveLength(4);
    expect(pageHrefs()).toHaveLength(1);
  });

  it("names what to watch without quoting a number", () => {
    const block = HTML.match(/<nav class="ways-in"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const prose = block.replace(/<[^>]*>/g, " ").replace(/href="[^"]*"/g, " ");
    // A caption that quotes a measurement goes stale the moment a formula moves, and nothing
    // would catch it. The links say what to look at; the page says what it reads.
    expect(prose).not.toMatch(/\d+\.\d+/);
  });

  for (const [index, href] of presetHrefs().entries()) {
    it(`preset ${index + 1} carries no setting this bench would ignore`, () => {
      const decoded = decodeSettings(href);
      expect(decoded.notices).toEqual([]);

      const applied = settingsFromPanel(panelValuesFromSettings(decoded.settings));
      expect(settingsNotHonoured(decoded.settings, applied)).toEqual([]);
    });
  }

  it("points its one page link at the drill", () => {
    expect(pageHrefs()).toContain("./drill.html");
  });

  it("gives no page link a query string of its own", () => {
    // The split above is only as good as this: without it, a page link that grew a "?" of its own
    // would silently stop being decoded by anything, preset or otherwise, and nobody would notice.
    for (const href of pageHrefs()) {
      expect(href).not.toContain("?");
    }
  });
});
