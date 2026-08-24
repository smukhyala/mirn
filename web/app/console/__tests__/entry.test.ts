import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The clobber this once prevented, for the record.
 *
 * `scripts/build-notes.ts` used to write `web/index.html` unconditionally, and package.json wired
 * dev, build and check as `npm run notes && …`. While that notes build existed, a console written
 * to index.html would have been regenerated away on the next `npm run check` — a green build of
 * the wrong page. So the console was named `web/console.html` instead, added to vite's inputs and
 * tracked by git — both still asserted here even though the notes build that made the distinction
 * matter is now deleted.
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

  it("boots from its own top-level script, not from the token-mounting helper module", () => {
    const html = readFileSync(join(REPO, "web", "console.html"), "utf8");
    expect(html).toContain('<script type="module" src="./console.ts"></script>');
  });
});
