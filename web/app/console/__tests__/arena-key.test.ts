import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETTE } from "../../../ui/theme.js";

/**
 * The key is hand-written and the canvas is drawn in code, so nothing but this stops them drifting.
 *
 * The failure it is built for is quiet: someone changes the colour a person is drawn in, or adds a
 * mark to the arena, and the key on the page goes on describing the picture as it used to be. A
 * reader then trusts a legend that is wrong, which is worse than having none.
 *
 * So this checks the two halves against each other. Every mark named in the key must have a rule in
 * the one stylesheet, and the colours those rules use must be the same tokens `web/ui/arena.ts`
 * hands to the canvas — a person in the treated run is drawn in the muted ink, the control run is
 * that same ink hollowed out against paper, and the distance between them is the accent.
 */

const HTML = readFileSync("web/index.html", "utf8");
const CSS = readFileSync("web/console.css", "utf8");

function keyBlock(): string {
  const block = HTML.match(/<ul class="arena-key"[\s\S]*?<\/ul>/);
  if (block === null) {
    throw new Error("the arena key is gone from web/index.html");
  }
  return block[0];
}

function ruleFor(className: string): string {
  const rule = CSS.match(new RegExp(`\\.${className}\\s*\\{[^}]*\\}`));
  if (rule === null) {
    throw new Error(`web/console.css has no rule for the key's ${className} mark`);
  }
  return rule[0];
}

describe("the key to the canvas", () => {
  it("names every mark the arena draws", () => {
    const marks = [...keyBlock().matchAll(/class="key-mark (key-[a-z-]+)"/g)].map((m) => m[1]);
    expect(marks).toEqual([
      "key-treated",
      "key-control",
      "key-gap",
      "key-robot",
      "key-path-treated",
      "key-path-control",
    ]);
  });

  it("draws a person in the same ink the canvas does", () => {
    // arena.ts fills the treated dot with PALETTE.inkMuted and hollows the control dot out of
    // PALETTE.paper with the same ink. If either token moves, both halves must move together.
    expect(ruleFor("key-treated")).toContain("var(--mirn-ink-muted)");
    expect(ruleFor("key-control")).toContain("var(--mirn-paper)");
    expect(ruleFor("key-control")).toContain("var(--mirn-ink-muted)");
  });

  it("spends the accent on the distance between the two runs and nothing else", () => {
    expect(ruleFor("key-gap")).toContain("var(--mirn-perturbation)");
    for (const other of ["key-treated", "key-control", "key-robot", "key-path-treated"]) {
      expect(ruleFor(other), `${other} must not take the accent`).not.toContain("perturbation");
    }
  });

  it("separates the two runs by fill and the two paths by dash, never by hue", () => {
    // The same distinction has to survive greyscale and every form of colour blindness.
    expect(ruleFor("key-path-control")).toContain("dashed");
    expect(ruleFor("key-path-treated")).toContain("solid");
  });

  it("writes no colour of its own", () => {
    for (const mark of ["key-treated", "key-control", "key-gap", "key-robot"]) {
      expect(ruleFor(mark), `${mark} must use a token`).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(/);
    }
    // The tokens it names have to exist.
    expect(PALETTE.inkMuted).toBeTruthy();
    expect(PALETTE.perturbation).toBeTruthy();
  });

  it("sits under the picture it explains, not after the numbers", () => {
    const arena = HTML.indexOf('id="arena"');
    const key = HTML.indexOf('id="arena-key"');
    const readouts = HTML.indexOf('id="readouts"');
    expect(arena).toBeGreaterThan(-1);
    expect(key).toBeGreaterThan(arena);
    expect(key).toBeLessThan(readouts);
  });
});
