import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the `Math.hypot` ban in `web/engine/measure/`.
 *
 * The failure this catches: someone tidies `Math.sqrt(dx * dx + dy * dy)` into `Math.hypot(dx, dy)`,
 * which is shorter, more obviously correct, and wrong here. V8's hypot rescales to avoid
 * intermediate overflow and is *more* accurate than numpy's naive `sqrt(sum(d * d))`, so the two
 * languages disagree in the last bits and a parity fixture that held at 1e-15 starts failing — or
 * worse, gets its tolerance loosened until it means nothing. The disagreement is invisible in
 * review and does not show up on any single-language test.
 *
 * Until this file existed the ban was stated in three comments and enforced by nobody. A comment
 * is not a build error.
 *
 * `web/engine/core/vec.ts` is checked too, because its own header claims hypot is deliberately
 * absent from it and every distance in `measure/` bottoms out in that file.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MEASURE_DIR = join(HERE, "..");
const VEC_FILE = join(HERE, "..", "..", "core", "vec.ts");

/**
 * This file is the one exemption, and it has to be: the search pattern below is code rather than a
 * comment, so a scan that included it would report itself and never go green.
 */
const SELF = fileURLToPath(import.meta.url);

/**
 * Comments are stripped before the search, because the ban has to be *stated* somewhere and this
 * test would otherwise be triggered by the sentences explaining it.
 *
 * Newlines inside a stripped comment are kept, so a reported line number still points at the real
 * line in the real file. The first version collapsed each comment to a single space and reported
 * offsets that matched nothing.
 */
function stripComments(source: string): string {
  const blankedBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
  const blankedLines = blankedBlocks.replace(/\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, " "));
  return blankedLines;
}

function typescriptFilesUnder(root: string): string[] {
  const found: string[] = [];
  const entries = readdirSync(root);
  for (const name of entries) {
    const path = join(root, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      const nested = typescriptFilesUnder(path);
      for (const nestedPath of nested) {
        found.push(nestedPath);
      }
      continue;
    }
    if (name.endsWith(".ts") && path !== SELF) {
      found.push(path);
    }
  }
  return found;
}

function offendingLines(path: string): string[] {
  const source = stripComments(readFileSync(path, "utf8"));
  const lines = source.split("\n");
  const offenders: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (/\bMath\s*\.\s*hypot\b/.test(line)) {
      offenders.push(`${path}:${i + 1}`);
    }
  }
  return offenders;
}

describe("the Math.hypot ban", () => {
  it("finds the files it is supposed to be checking", () => {
    // A grep test that silently scans nothing passes forever. This is the canary for a moved
    // directory or a renamed file.
    const files = typescriptFilesUnder(MEASURE_DIR);
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.endsWith("kernels.ts"))).toBe(true);
    expect(readFileSync(VEC_FILE, "utf8").length).toBeGreaterThan(0);
  });

  it("holds across every source file in web/engine/measure/", () => {
    const offenders: string[] = [];
    for (const path of typescriptFilesUnder(MEASURE_DIR)) {
      for (const offender of offendingLines(path)) {
        offenders.push(offender);
      }
    }
    expect(
      offenders,
      "Math.hypot disagrees with the Python oracle in the last bits. Spell it " +
        "Math.sqrt(dx * dx + dy * dy).",
    ).toEqual([]);
  });

  it("holds in web/engine/core/vec.ts, where every distance in measure/ bottoms out", () => {
    expect(offendingLines(VEC_FILE)).toEqual([]);
  });

  it("would notice a violation, rather than passing because the pattern never matches", () => {
    // The test that tests the test. A grep guard whose regex is broken is indistinguishable from a
    // codebase that obeys the rule, and that is exactly how this class of check rots.
    const planted = stripComments("export function d(x: number, y: number) {\n" +
      "  return Math.hypot(x, y);\n}\n");
    expect(/\bMath\s*\.\s*hypot\b/.test(planted)).toBe(true);
    expect(stripComments("// Math.hypot is banned here\n")).not.toMatch(/Math\s*\.\s*hypot/);
  });
});
