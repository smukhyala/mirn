import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * This task's own brief claimed "the stylesheet's only :focus-visible rule today is scoped to
 * .quantity, .quantity-trigger and .predict-option" — that premise was already false by the time
 * this task ran: Task 23 added the unscoped rule below (originally web/style.css:522) two commits
 * before this one was written. So this file adds no CSS at all; it exists to pin the fix Task 23
 * already made, ahead of Commit 3 of the overall plan (tasks 30-35), which deletes the notes pages
 * and the three classes the SCOPED rule above it names. A test written after that deletion could
 * not tell "the global rule survived" from "the global rule was never separated from the classes
 * that just disappeared with the notebook" — this one, written before, can.
 *
 * Task 36 folded the rule into web/console.css and deleted web/style.css, making this file the
 * page's only stylesheet; the path below follows that move.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

describe("keyboard focus is visible everywhere", () => {
  const css = readFileSync(join(REPO, "web", "console.css"), "utf8");

  it("has an unscoped :focus-visible rule", () => {
    expect(css).toMatch(/^:focus-visible\s*\{/m);
  });

  it("gives that rule a real outline, in a token", () => {
    const rule = /^:focus-visible\s*\{([^}]*)\}/m.exec(css);
    expect(rule?.[1]).toContain("outline: 2px solid var(--mirn-ink)");
    expect(rule?.[1]).toContain("outline-offset");
  });

  it("never removes an outline anywhere in the stylesheet", () => {
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });
});
