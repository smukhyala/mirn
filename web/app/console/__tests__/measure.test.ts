import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * One page width, in one place, for all five documents.
 *
 * Before this test the console's masthead was 52rem, the stage under it was 76rem, and the fit
 * page's own sections had no rule at all. A reader scrolling one page crossed three different left
 * edges, and nothing anywhere said which one was right — the numbers were simply typed separately
 * into eight rules over the life of the file.
 *
 * The fix is a custom property, and this test is what stops the numbers being typed in again. It
 * greps the stylesheet for the page-level containers and fails any that hardcodes a width instead
 * of taking the token, which is the same shape as `hypot.test.ts`: the rule was a comment, comments
 * do not fail builds, and the ban only became real when something read the source.
 *
 * Prose measure is deliberately NOT this token. A paragraph is unreadable at 76rem, so `.how-main p`
 * and friends cap themselves far narrower. What the token governs is where a block's left edge
 * lands, not how wide its text may run.
 */

const CSS = readFileSync("web/console.css", "utf8");

/** Every block that sets a page's outer edge. Adding a sixth page means adding its container. */
const PAGE_CONTAINERS = [
  ".console-masthead",
  ".orientation",
  ".ways-in",
  ".console-main",
  ".settings-region",
  ".ledger-region",
  ".progress-rule",
  ".how-main",
] as const;

/**
 * Deliberately NOT in the list above: `.method-region` is a section INSIDE `.console-main`, not a
 * page container. It was given the page token once, which indented every section on the method and
 * fit pages by a second gutter and put their left edge 2rem inside every other page's. This test
 * fails if it ever sets a horizontal edge of its own again.
 */
const NESTED_SECTIONS = [".method-region"] as const;

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m").exec(CSS);
  if (found === null) {
    throw new Error(`web/console.css has no base rule for ${selector}`);
  }
  return found[1] as string;
}

describe("every page is the same width", () => {
  it("defines the page measure once, as a token", () => {
    expect(CSS).toMatch(/--mirn-page:\s*\d+(\.\d+)?rem;/);
    expect(CSS).toMatch(/--mirn-gutter:\s*\d+(\.\d+)?rem;/);
  });

  it("has every page-level container take that token rather than a number of its own", () => {
    for (const selector of PAGE_CONTAINERS) {
      const body = ruleFor(selector);
      expect(body, `${selector} does not set a max-width at all`).toMatch(/max-width:/);
      expect(body, `${selector} hardcodes its width instead of using the page token`).toContain(
        "var(--mirn-page)",
      );
    }
  });

  it("keeps nested sections off the edge, so they inherit their container's rather than adding one", () => {
    for (const selector of NESTED_SECTIONS) {
      const body = ruleFor(selector);
      expect(body, `${selector} sets a width of its own`).not.toMatch(/max-width:/);
      expect(body, `${selector} adds a gutter on top of its container's`).not.toContain(
        "var(--mirn-gutter)",
      );
    }
  });

  it("gutters them all the same way, so the left edge lands in one place", () => {
    for (const selector of PAGE_CONTAINERS) {
      const body = ruleFor(selector);
      expect(body, `${selector} does not use the shared gutter`).toContain("var(--mirn-gutter)");
    }
  });

  /**
   * The token is a width, not a licence to set prose at it. This is the one rule that has to stay
   * narrow, and it is the first thing a later tidy-up would sweep into the token by accident.
   */
  it("still holds running prose to a readable measure", () => {
    const prose = /^\.how-main p \{([^}]*)\}/m.exec(CSS);
    expect(prose, "the prose measure rule is gone").not.toBeNull();
    const width = /max-width:\s*(\d+(?:\.\d+)?)rem/.exec(prose?.[1] ?? "");
    expect(width, "the prose rule no longer caps its width").not.toBeNull();
    expect(Number(width?.[1])).toBeLessThanOrEqual(48);
  });
});

/**
 * The narrow-viewport gutter, checked the same way.
 *
 * Seven rules used to retype 1.2rem inside the 45rem breakpoint, and `.method-region` was simply
 * missing from that list — so the fit page and the method card kept a 2rem gutter on a phone while
 * every other block moved to 1.2rem. Narrowing the token instead means a container cannot be left
 * out of the breakpoint, because there is no per-container rule to leave it out of.
 */
describe("the narrow viewport narrows the gutter once", () => {
  const NARROW = /@media \(max-width: 45rem\) \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";

  it("has a breakpoint at all", () => {
    expect(NARROW.length, "the 45rem breakpoint is gone").toBeGreaterThan(0);
  });

  it("retunes the token rather than each container's padding", () => {
    expect(NARROW).toMatch(/--mirn-gutter:\s*\d+(\.\d+)?rem;/);
    for (const selector of PAGE_CONTAINERS) {
      const own = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{[^}]*padding:\\s*0 \\d`, "m");
      expect(NARROW, `${selector} retypes a gutter inside the breakpoint`).not.toMatch(own);
    }
  });
});
