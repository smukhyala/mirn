import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The clobber this prevents, in full.
 *
 * `scripts/build-notes.ts` unconditionally writes `web/index.html`, and package.json wires dev,
 * build and check as `npm run notes && …`. While the notes build still exists, a console written
 * to index.html would be regenerated away on the next `npm run check` — a green build of the
 * wrong page. So the console is `web/console.html`, added to vite's inputs and tracked by git, and
 * all three facts are asserted here rather than remembered.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

describe("the console is a real, built entry point", () => {
  it("is tracked by git", () => {
    expect(() =>
      execFileSync("git", ["ls-files", "--error-unmatch", "web/console.html"], { cwd: REPO }),
    ).not.toThrow();
  });

  it("is an entry in the vite build", () => {
    const config = readFileSync(join(REPO, "vite.config.ts"), "utf8");
    expect(config).toContain('console: resolve(__dirname, "web/console.html")');
  });

  it("is not web/index.html, which the notes build still overwrites", () => {
    const builder = readFileSync(join(REPO, "scripts", "build-notes.ts"), "utf8");
    expect(builder).toContain('writeFileSync("web/index.html"');
  });

  it("boots from its own top-level script, not from the token-mounting helper module", () => {
    const html = readFileSync(join(REPO, "web", "console.html"), "utf8");
    expect(html).toContain('<script type="module" src="./console.ts"></script>');
  });
});
