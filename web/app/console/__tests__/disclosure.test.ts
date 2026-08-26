import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DISCLOSURE_CLAUSES, INVENTED_CROWD_DISCLOSURE } from "../csv.js";

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

  it("is an entry point, alongside the working page, the drill and nothing else", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain('index: resolve(__dirname, "web/index.html")');
    expect(config).toContain('how: resolve(__dirname, "web/how.html")');
    expect(config).toContain('drill: resolve(__dirname, "web/drill.html")');
    // Asserting the ABSENCE is still the point, and it is what this test is actually for. A
    // surviving `instrument` entry would mean the build is still emitting a page whose source an
    // earlier task deleted. Both of these outlive the count below on purpose: a count alone goes
    // green the moment somebody adds a page and forgets to delete a dead one.
    expect(config).not.toContain("instrument");
    expect(config).not.toContain("generatedPages");
    // The entry map used to be guarded by being a single named page. It is three now, so the guard
    // is stated directly instead of implied: every entry names a file that exists, and there are
    // exactly as many entries as there are hand-written pages. An entry whose HTML has been
    // deleted fails here rather than at deploy, which is the same defect the `instrument`
    // assertion above catches for one particular name.
    //
    // Raised from two to three by the drill (web/drill.html). The three named `toContain`s above
    // and this exact length together mean the map is these three pages and nothing else — which is
    // what a `toContain` on its own would not say.
    const entries = [...config.matchAll(/(\w+): resolve\(__dirname, "([^"]+)"\)/g)];
    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      const page = entry[2] as string;
      expect(existsSync(page), `${page} is an entry point with no source file`).toBe(true);
    }
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
  /**
   * The list itself, spelled out, and this is the assertion the other five are standing on.
   *
   * Five loops across four files iterate `DISCLOSURE_CLAUSES` and check the surface under test
   * contains each entry. Empty the array and all five go green at once, having checked nothing —
   * and the only other content check compares an export's first line against the very constant
   * that produced it, so gutting that to "" stays green too. Guardrail 1 is the one rule on this
   * project that a reader is harmed by, so the words it turns on are written here as literals
   * rather than derived from the thing they are meant to constrain.
   */
  it("still names the four things a reader has to be told", () => {
    expect(DISCLOSURE_CLAUSES).toEqual([
      "simulated",
      "social-force model",
      "invented people obeying invented rules",
      "no number here is a measurement of real pedestrians",
    ]);
    expect(INVENTED_CROWD_DISCLOSURE).toContain("no number here is a measurement of real pedestrians");
    for (const clause of DISCLOSURE_CLAUSES) {
      expect(clause.length, "a disclosure clause is empty").toBeGreaterThan(0);
    }
  });

  it("carries every clause the CSV carries", () => {
    expect(DISCLOSURE_CLAUSES.length, "there are no clauses to check for").toBeGreaterThan(0);
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

describe("the readouts grid narrows on a narrow viewport", () => {
  /**
   * web/console.css used to carry two .readouts rules at the same specificity — one folded in from
   * the deleted web/style.css and the console's own further down — plus a single-column breakpoint
   * written above both of them. Media queries add no specificity, so that breakpoint lost to every
   * later rule at every width and the tiles stayed two across on a phone. There is one base rule
   * now, and the breakpoints come after it, narrowest last.
   *
   * This reads the file rather than a rendered page because jsdom implements no cascade: it parses
   * the stylesheet but resolves nothing, so a booted-page assertion here would pass whatever the
   * order was.
   */
  const css = readFileSync("web/console.css", "utf8");

  it("declares .readouts exactly once outside a breakpoint", () => {
    // Anchored to the start of a line: a rule nested inside a multi-line @media block in this file
    // is indented, so this matches base rules only.
    const base = [...css.matchAll(/^\.readouts\s*\{([^}]*)\}/gm)];
    expect(base, "expected exactly one base .readouts rule in web/console.css").toHaveLength(1);
  });

  it("puts every column-count breakpoint after that rule, narrowest last", () => {
    const base = css.search(/^\.readouts\s*\{/m);
    expect(base).toBeGreaterThan(-1);
    const twoAcross = css.indexOf("repeat(2, minmax(0, 1fr))");
    const oneAcross = css.search(/^\s+\.readouts \{ grid-template-columns: minmax\(0, 1fr\); \}/m);
    expect(twoAcross, "the two-column breakpoint is missing").toBeGreaterThan(base);
    expect(oneAcross, "the single-column breakpoint is missing").toBeGreaterThan(twoAcross);
  });

  it("declares the single-column breakpoint at a narrower width than the two-column one", () => {
    const widths: number[] = [];
    for (const match of css.matchAll(/@media \(max-width: (\d+(?:\.\d+)?)rem\)/g)) {
      widths.push(Number(match[1]));
    }
    expect(widths.length).toBeGreaterThanOrEqual(2);
    let previous = Number.POSITIVE_INFINITY;
    for (const width of widths) {
      expect(width, "breakpoints must be written widest first").toBeLessThan(previous);
      previous = width;
    }
  });

  it("lets the ledger scroll sideways rather than the whole document", () => {
    // .ledger-wrap is the only element around a table that can be ten columns wide.
    const rule = /^\.ledger-wrap\s*\{([^}]*)\}/m.exec(css);
    expect(rule, ".ledger-wrap has no rule at all").not.toBeNull();
    expect(rule?.[1]).toMatch(/overflow-x:\s*auto/);
  });
});
