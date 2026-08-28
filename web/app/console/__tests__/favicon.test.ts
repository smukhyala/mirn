import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTE } from "../../../ui/theme.js";

/**
 * The one file in this repository allowed to write a colour literal, and the check that keeps it
 * honest.
 *
 * Every other colour on the site comes from `web/ui/theme.ts`, injected as custom properties at
 * runtime by `web/app/console/boot.ts`, and `console.css`'s own header says never to write a
 * literal into it. A favicon cannot participate in that: the browser fetches it as chrome, before
 * any script of ours has run, with no stylesheet behind it, so a `var(--mirn-ink)` there resolves
 * to nothing at all.
 *
 * So the two values are copied into the SVG, and copied values drift — which is the whole lesson of
 * the commit this file shipped in, where three of nine copied helpers had already diverged. This
 * asserts them against the palette rather than trusting the comment in the SVG that says they
 * match.
 */

const WEB = resolve(__dirname, "../../..");

function read(name: string): string {
  return readFileSync(resolve(WEB, name), "utf8");
}

const PAGES: readonly string[] = Object.freeze([
  "index.html",
  "how.html",
  "drill.html",
  "method.html",
]);

/** Every `#rrggbb` in the file, lowercased, in the order they appear. */
function hexesIn(svg: string): readonly string[] {
  return (svg.match(/#[0-9a-fA-F]{6}/g) ?? []).map((hex) => hex.toLowerCase());
}

describe("the favicon", () => {
  const svg = read("favicon.svg");

  it("uses the palette's own ink and paper, and nothing else", () => {
    const used = new Set(hexesIn(svg));
    expect(used.has(PALETTE.ink.toLowerCase()), "the ink is not the palette's ink").toBe(true);
    expect(used.has(PALETTE.paper.toLowerCase()), "the paper is not the palette's paper").toBe(
      true,
    );
    // Two and no third. A colour here that is in no token is a colour nobody decided on, and it
    // would sit in a browser tab beside a site that agrees with itself everywhere else.
    expect([...used].sort()).toEqual(
      [PALETTE.ink.toLowerCase(), PALETTE.paper.toLowerCase()].sort(),
    );
  });

  it("would notice if the palette moved", () => {
    // The meta-test. `hexesIn` is the whole mechanism above, so if it ever stopped finding colours
    // the assertions would pass over an empty set and this file would be checking nothing.
    expect(hexesIn(svg).length).toBeGreaterThanOrEqual(2);
    expect(hexesIn('<rect fill="#abcdef"/>')).toEqual(["#abcdef"]);
    expect(hexesIn("<rect/>")).toEqual([]);
  });

  it("is linked from every page that ships", () => {
    // Four pages and one icon. A page without it gets the browser's default mark, which is the
    // failure that looks like nothing until a reader has four tabs open.
    let checked = 0;
    for (const page of PAGES) {
      const html = read(page);
      expect(html, `${page} does not link the favicon`).toContain(
        '<link rel="icon" href="./favicon.svg" type="image/svg+xml">',
      );
      checked = checked + 1;
    }
    expect(checked).toBe(PAGES.length);
  });

  it("says what it is, for a reader who cannot see it", () => {
    expect(svg).toContain("aria-label=");
    expect(svg).toContain('role="img"');
  });

  it("carries no script and nothing that fetches", () => {
    // Guardrail 10 in miniature. An SVG is a document: it can execute, and it can pull in images,
    // fonts and other documents. This one is four shapes, and it loads on every page.
    //
    // The namespace declaration is the one URL allowed, and it is exempted BY NAME rather than by
    // loosening the scan — it names the SVG grammar and fetches nothing. A first draft of this
    // banned every "http://" and went red on it, which is how the exemption came to be written
    // down instead of the check quietly deleted.
    const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';
    expect(svg, "the namespace declaration is not the one this exempts").toContain(XMLNS);
    const withoutNamespace = svg.replace(XMLNS, "");

    expect(withoutNamespace).not.toContain("http");
    expect(withoutNamespace).not.toContain("<script");
    expect(withoutNamespace).not.toContain("<image");
    expect(withoutNamespace).not.toContain("<use");
    expect(withoutNamespace).not.toContain("<foreignObject");
    expect(withoutNamespace).not.toMatch(/\bhref\b/);
    expect(withoutNamespace).not.toMatch(/\bon[a-z]+=/);

    // And the exemption cannot be doing the work: strip it from something that DOES reach out and
    // the scan still catches what is left.
    const planted = `<svg ${XMLNS}><image href="https://example.com/x.png"/></svg>`.replace(
      XMLNS,
      "",
    );
    expect(planted).toContain("<image");
    expect(planted).toContain("http");
  });
});
