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

  it("precedes the arena, the readouts, the sweep curve and the ledger in document order", () => {
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

describe("the console has a way to press Run", () => {
  /**
   * Three later tasks (the panel, the sweep wiring, and the Run job itself) depend on this
   * element existing at all. A plain substring search for "run" would pass on the word "runs" in
   * a cost estimate or "Pressing Run reproduces them" in the ledger note, so this matches the
   * actual button tag — the exact markup Task 27's fixture and tests rely on byte-for-byte.
   */
  it("has a real button element, not just the word appearing somewhere on the page", () => {
    const button = /<button\b[^>]*\bid="run"[^>]*>Run<\/button>/.exec(HTML);
    expect(button, 'no <button id="run">Run</button> element found in web/console.html').not.toBeNull();
  });

  it("puts the Run button in the settings column, not the stage or the ledger bar", () => {
    const settingsOpen = HTML.indexOf('id="settings"');
    const settingsClose = HTML.indexOf("</aside>", settingsOpen);
    const run = HTML.indexOf('id="run"');
    expect(settingsOpen).toBeGreaterThan(-1);
    expect(settingsClose).toBeGreaterThan(-1);
    expect(run, "the run button is missing from the settings column").toBeGreaterThan(settingsOpen);
    expect(run, "the run button falls outside the settings column").toBeLessThan(settingsClose);
  });
});
