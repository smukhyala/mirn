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
 * The git assertion exists because scripts/build-notes.ts:485 writes web/index.html
 * unconditionally and npm run check runs the notes build first. An untracked console page would
 * be clobbered by a green build of the wrong page. Tracked, the clobber cannot come back.
 */

const HTML = readFileSync("web/console.html", "utf8");
const FLAT = HTML.replace(/\s+/g, " ");

describe("the console page is the page the build ships", () => {
  it("is tracked by git", () => {
    const run = (): string =>
      execFileSync("git", ["ls-files", "--error-unmatch", "web/console.html"], {
        encoding: "utf8",
      });
    expect(run).not.toThrow();
    expect(run().trim()).toBe("web/console.html");
  });

  it("is a Vite entry point, beside index and instrument", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain('console: resolve(__dirname, "web/console.html")');
    expect(config).toContain('index: resolve(__dirname, "web/index.html")');
    expect(config).toContain('instrument: resolve(__dirname, "web/instrument.html")');
  });

  it("leaves the generated contents page and the ignore list alone", () => {
    const ignore = readFileSync(".gitignore", "utf8");
    expect(ignore).toContain("web/index.html");
    expect(HTML).not.toContain("index.html");
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
      expect(at, `${anchor} is missing from web/console.html`).toBeGreaterThan(-1);
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
    const css = readFileSync("web/style.css", "utf8");
    expect(css).toMatch(/^:focus-visible \{/m);
  });
});

describe("the console's readouts do not inherit the instrument page's rule", () => {
  /**
   * web/console.html links web/style.css first and web/console.css second. web/style.css has its
   * own unscoped .readouts rule, written for web/instrument.html, at the same specificity as
   * console.css's — so console.css only wins the properties it actually declares. web/style.css's
   * rule sets padding-top and border-top; unless console.css's rule neutralises both, the console
   * inherits a hairline rule and top padding that nothing in its design asked for.
   */
  it("still has padding-top and border-top in web/style.css's .readouts rule, so this is a real collision to guard against", () => {
    const instrumentCSS = readFileSync("web/style.css", "utf8");
    const rule = /\.readouts\s*\{([^}]*)\}/.exec(instrumentCSS);
    expect(rule, ".readouts rule not found in web/style.css").not.toBeNull();
    expect(rule?.[1]).toMatch(/padding-top:/);
    expect(rule?.[1]).toMatch(/border-top:/);
  });

  it("neutralises padding-top and border-top in its own .readouts rule", () => {
    const consoleCSS = readFileSync("web/console.css", "utf8");
    const rule = /\.readouts\s*\{([^}]*)\}/.exec(consoleCSS);
    expect(rule, ".readouts rule not found in web/console.css").not.toBeNull();
    expect(rule?.[1]).toMatch(/padding-top:\s*0\b/);
    expect(rule?.[1]).toMatch(/border-top:\s*none\b/);
  });
});
