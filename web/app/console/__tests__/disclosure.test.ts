import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DISCLOSURE_CLAUSES } from "../csv.js";

/**
 * The ordering assertion runs against the FILE, not the booted DOM. A script can move a paragraph
 * after load, and a test that boots the page and then asks what comes first would pass a page
 * whose source puts the disclosure at the bottom. What is being defended is the document order a
 * reader with no JavaScript, a screen reader, or a print stylesheet actually gets.
 *
 * The git assertion matters because web/index.html is hand-written and nothing regenerates it. It
 * used to be written by scripts/build-notes.ts on every build and was git-ignored for that reason;
 * that script is deleted along with the notebook it built. An untracked or ignored front door
 * would mean a clean checkout builds a site with no page at "/" — tracked, that cannot happen
 * silently.
 */

const HTML = readFileSync("web/index.html", "utf8");
const FLAT = HTML.replace(/\s+/g, " ");

describe("the console page is the page the build ships", () => {
  it("is tracked by git", () => {
    const run = (): string =>
      execFileSync("git", ["ls-files", "--error-unmatch", "web/index.html"], {
        encoding: "utf8",
      });
    expect(run).not.toThrow();
    expect(run().trim()).toBe("web/index.html");
  });

  it("is the build's only entry point", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain('index: resolve(__dirname, "web/index.html")');
    // Asserting the ABSENCE is the point. A surviving `instrument` entry would mean the build is
    // still emitting a page whose source this task deleted.
    expect(config).not.toContain("instrument");
    expect(config).not.toContain("generatedPages");
  });

  it("boots from its own top-level script, not from the token-mounting helper module", () => {
    expect(HTML).toContain('<script type="module" src="./console.ts"></script>');
  });

  it("builds workers as modules, because every sweep runs in one", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    // This assertion exists because a rewrite of vite.config.ts once dropped the line silently.
    // Vite's default worker output is iife, which cannot serve the `{ type: "module" }` worker
    // web/app/worker/client.ts constructs, and the failure surfaces at runtime rather than here.
    expect(config).toContain('format: "es"');
  });

  it("is not ignored, so a clean checkout has a front door", () => {
    const ignore = readFileSync(".gitignore", "utf8");
    // The inverse of what this test asserted before the pivot. web/index.html used to be written
    // by the notes build on every run and was ignored for that reason; it is now hand-written and
    // tracked, and an ignore rule would silently empty the site on a fresh clone.
    expect(ignore).not.toContain("web/index.html");
    expect(ignore).not.toContain("web/generated/");
  });

  it("links one stylesheet, which is the console's own", () => {
    const links = HTML.match(/<link[^>]+rel="stylesheet"[^>]*>/g) ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]).toContain("console.css");
  });
});

describe("the invented-crowd disclosure comes first", () => {
  it("carries every clause the CSV carries", () => {
    for (const clause of DISCLOSURE_CLAUSES) {
      expect(FLAT).toContain(clause);
    }
  });

  it("precedes the arena, the readouts, the sweep curve, the settings panel and the ledger in document order", () => {
    const disclosure = HTML.indexOf('id="disclosure"');
    expect(disclosure).toBeGreaterThan(-1);
    for (const anchor of ['id="arena"', 'id="readouts"', 'id="sweep"', 'id="ledger"', 'id="settings"']) {
      const at = HTML.indexOf(anchor);
      expect(at, `${anchor} is missing from web/index.html`).toBeGreaterThan(-1);
      expect(disclosure, `${anchor} precedes the disclosure`).toBeLessThan(at);
    }
  });

  it("ships no measurement in its own markup, so nothing can be read before it is run", () => {
    const literal = /\d+\.\d+\s*(m|s)\b/.exec(FLAT);
    expect(literal).toBeNull();
  });
});

describe("the keyboard is not left behind by the notebook's deletion", () => {
  it("has a focus ring that is not scoped to three notes classes", () => {
    // Task 36 folded this rule in from the deleted web/style.css; it now lives in web/console.css,
    // the page's only stylesheet.
    const css = readFileSync("web/console.css", "utf8");
    expect(css).toMatch(/^:focus-visible \{/m);
  });
});

describe("the console's own .readouts rule wins the cascade over the one borrowed from the deleted instrument page", () => {
  /**
   * web/console.css now carries two .readouts rules at the same specificity: one folded in
   * verbatim from the deleted web/style.css (task 36), written originally for the also-deleted
   * web/instrument.html, and the console's own further down. Same-specificity rules are decided by
   * source order, so the console's own rule must keep appearing AFTER the borrowed one and must
   * keep neutralising the properties the borrowed one sets — otherwise the console inherits a
   * hairline rule and top padding that nothing in its design asked for.
   */
  it("still has padding-top and border-top in the borrowed .readouts rule, so this is a real collision to guard against", () => {
    const css = readFileSync("web/console.css", "utf8");
    // Anchored to the start of a line: this file's own convention is that a rule nested inside a
    // multi-line @media block is indented, and a rule folded onto one line with its @media wrapper
    // (as the borrowed 720px breakpoint is) never starts the line either. Both of the file's two
    // @media .readouts breakpoint overrides are excluded this way, leaving just the two base rules.
    const rules = [...css.matchAll(/^\.readouts\s*\{([^}]*)\}/gm)];
    expect(rules, "expected exactly two .readouts rules in web/console.css").toHaveLength(2);
    expect(rules[0]?.[1]).toMatch(/padding-top:/);
    expect(rules[0]?.[1]).toMatch(/border-top:/);
  });

  it("places its own .readouts rule after the borrowed one, and neutralises padding-top and border-top", () => {
    const css = readFileSync("web/console.css", "utf8");
    // Anchored to the start of a line: this file's own convention is that a rule nested inside a
    // multi-line @media block is indented, and a rule folded onto one line with its @media wrapper
    // (as the borrowed 720px breakpoint is) never starts the line either. Both of the file's two
    // @media .readouts breakpoint overrides are excluded this way, leaving just the two base rules.
    const rules = [...css.matchAll(/^\.readouts\s*\{([^}]*)\}/gm)];
    expect(rules, "expected exactly two .readouts rules in web/console.css").toHaveLength(2);
    const own = rules[1]?.[1] ?? "";
    expect(own).toMatch(/padding-top:\s*0\b/);
    expect(own).toMatch(/border-top:\s*none\b/);
  });
});
