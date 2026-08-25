import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLUMNS, COLUMN_ORDER } from "../engine/job/columns.js";
import { DISCLOSURE_CLAUSES } from "./console/csv.js";

/**
 * web/how.html: what every readout on the console actually computes.
 *
 * The load-bearing test in this file is the completeness one. It derives the list of measurements
 * from the column catalogue itself rather than from a copy kept here, so adding a sixteenth
 * measurement to `web/engine/job/columns.ts` and shipping it without writing down how it is
 * calculated is a red test rather than a page that has quietly gone out of date. A hardcoded list
 * would have to be updated in the same commit that made it wrong, which is exactly the commit
 * nobody remembers to make.
 *
 * Everything else here mirrors what `console/__tests__/disclosure.test.ts` already defends for the
 * front page, and for the same reasons: the ordering assertions run against the FILE rather than a
 * booted DOM, because what is being defended is the document order a reader with no scripting, a
 * screen reader or a print stylesheet actually gets.
 */

const HOW = readFileSync("web/how.html", "utf8");
const CONSOLE_PAGE = readFileSync("web/index.html", "utf8");

/** Comments out, tags out, entities out: what is left is roughly what a reader is shown. */
function readerText(html: string): string {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  const withoutScripts = withoutComments.replace(/<script[\s\S]*?<\/script>/g, " ");
  const withoutTags = withoutScripts.replace(/<[^>]*>/g, " ");
  const withoutEntities = withoutTags.replace(/&[#a-zA-Z0-9]+;/g, " ");
  return withoutEntities.replace(/\s+/g, " ");
}

const TEXT = readerText(HOW);

/** Every third-level heading's text, whitespace collapsed. */
function headings(html: string): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)) {
    const inner = match[1] as string;
    out.push(inner.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
  }
  return out;
}

describe("the working page documents every measurement the console can show", () => {
  it("gives each one its own section, named exactly as the console names it", () => {
    const found = new Set(headings(HOW));
    for (const key of COLUMN_ORDER) {
      const label = COLUMNS[key].label;
      expect(
        found.has(label),
        `web/how.html has no section headed '${label}'. Every measurement in the catalogue has ` +
          `to say how it is calculated, or the console shows a number nothing explains.`,
      ).toBe(true);
    }
  });

  it("lists every one of them in its contents, so none is only reachable by scrolling", () => {
    const contents = /<nav class="how-contents"[\s\S]*?<\/nav>/.exec(HOW);
    expect(contents, "web/how.html has no contents list").not.toBeNull();
    const listed = readerText(contents?.[0] ?? "");
    for (const key of COLUMN_ORDER) {
      expect(listed).toContain(COLUMNS[key].label);
    }
  });

  it("leads every measurement with what it reads when the true effect is nothing", () => {
    // One lead paragraph per measurement, and the catalogue's count is what says how many there
    // should be. The framing is the page's argument, not a decoration: a number with no stated
    // zero is the error the whole site exists to teach against.
    const leads = [...HOW.matchAll(/class="how-zero"/g)];
    expect(leads).toHaveLength(COLUMN_ORDER.length);
  });
});

describe("the two pages find each other", () => {
  it("links from the console to the working page", () => {
    expect(CONSOLE_PAGE).toContain('href="./how.html"');
  });

  it("links from the working page back to the console", () => {
    expect(HOW).toContain('href="./index.html"');
  });

  it("is tracked by git, so a clean checkout builds the page the entry map names", () => {
    const run = (): string =>
      execFileSync("git", ["ls-files", "--error-unmatch", "web/how.html", "web/how.ts"], {
        encoding: "utf8",
      });
    expect(run).not.toThrow();
    expect(run().trim().split("\n").sort()).toEqual(["web/how.html", "web/how.ts"]);
  });

  it("links one stylesheet, which is the console's own", () => {
    const links = HOW.match(/<link[^>]+rel="stylesheet"[^>]*>/g) ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]).toContain("console.css");
  });

  it("loads the script that mounts the palette, or every colour on it falls back to nothing", () => {
    // web/console.css carries no colour literal by rule: the tokens it reads are injected at
    // runtime. A page that links the stylesheet and skips the script renders as unstyled black
    // on white, which looks like a design choice rather than a missing import.
    expect(HOW).toContain('<script type="module" src="./how.ts"></script>');
  });
});

describe("the invented-crowd disclosure comes first here too", () => {
  it("carries every clause the console and the export carry", () => {
    for (const clause of DISCLOSURE_CLAUSES) {
      expect(HOW.replace(/\s+/g, " ")).toContain(clause);
    }
  });

  it("precedes the whole body of the page in document order", () => {
    const disclosure = HOW.indexOf('id="disclosure"');
    expect(disclosure).toBeGreaterThan(-1);
    expect(disclosure).toBeLessThan(HOW.indexOf("<main"));
    for (const key of COLUMN_ORDER) {
      const at = HOW.indexOf(COLUMNS[key].label);
      expect(at, `'${COLUMNS[key].label}' is missing from web/how.html`).toBeGreaterThan(-1);
      expect(disclosure, `'${COLUMNS[key].label}' precedes the disclosure`).toBeLessThan(at);
    }
  });

  it("quotes no measured value at all, so there is nothing on it to go stale", () => {
    // Stricter than the console's own version of this assertion, which only forbids a figure with
    // a unit after it. This page is formulas and zeros; it names controls to move rather than
    // printing what they read, so any decimal in its prose is a value that will drift away from
    // the simulator without anything failing.
    const decimal = /\d+\.\d+/.exec(TEXT);
    expect(decimal, `web/how.html quotes '${decimal?.[0] ?? ""}'`).toBeNull();
  });
});

describe("the page reads as English", () => {
  it("spells no term the way a program spells it", () => {
    // Guardrail 12, and the same rule the column catalogue is held to. The bracket and arrow half
    // of that catalogue's pattern is deliberately not applied here: this page sets out arithmetic,
    // and a parenthesis in a formula is mathematics rather than a leaked identifier.
    const identifier = /\b(?:[a-z]+[A-Z][A-Za-z]*|[a-z_]+_[a-z_]+)\b/.exec(TEXT);
    expect(identifier, `web/how.html shows the bare identifier '${identifier?.[0] ?? ""}'`).toBeNull();
  });
});

describe("the shared stylesheet still holds its own rule", () => {
  it("names every colour through a token, never as a literal", () => {
    // web/console.css says in its own header that no colour literal may be written in it, and
    // until now nothing checked. The working page doubled the file's surface area, so the rule is
    // worth a test rather than a comment.
    const css = readFileSync("web/console.css", "utf8");
    const literal = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.exec(css);
    expect(literal, `web/console.css contains the colour literal '${literal?.[0] ?? ""}'`).toBeNull();
  });

  it("spends the perturbation accent on the perturbation and on nothing else", () => {
    // The token is named `perturbation` rather than `accent` precisely so that reaching for it as
    // chrome makes the code visibly lie. On the working page it marks one thing: the symbol for
    // the gap between a person's two paths.
    const css = readFileSync("web/console.css", "utf8");
    const rule = /^\.perturbation-term \{ color: var\(--mirn-perturbation\); \}$/m.exec(css);
    expect(rule, "the working page's accent rule is missing or has grown other properties").not.toBeNull();
    const marked = [...HOW.matchAll(/class="([^"]*\bperturbation-term\b[^"]*)"/g)];
    expect(marked.length).toBeGreaterThan(0);
    for (const match of marked) {
      // Only ever on the gap symbol, which is a `.how-symbol` span or a bare span inside one.
      expect(match[1]).toMatch(/^(?:how-symbol )?perturbation-term$/);
    }
  });
});
