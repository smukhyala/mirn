import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardrail 11's replacement clause, given teeth.
 *
 * The lift of 2026-08-27 permits reader-supplied code, and the constraint that replaced the blanket
 * ban is that such code is compiled in exactly one place, where the honest account of what the
 * sandbox does and does not do is written down beside it. A second compilation site would be a
 * second sandbox, and the second one would be the one nobody wrote a paragraph for.
 *
 * This is `nostorage.test.ts` pointed at a different list. That file scans for storage and network
 * APIs and does not scan for these, which is how a compile call could have appeared anywhere under
 * `web/` without anything going red.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(HERE, "..", "..", "..");
const SELF = fileURLToPath(import.meta.url);

/** The one file allowed to turn a string into a function, and the one place it is explained. */
const SANDBOX = join(WEB_DIR, "app", "worker", "supplied.sandbox.ts");

const COMPILERS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "new Function", pattern: /\bnew\s+Function\s*\(/ },
  { name: "eval", pattern: /(?<![A-Za-z0-9_.])eval\s*\(/ },
];

/**
 * `Blob` and `createObjectURL` are deliberately NOT on that list, and the first version of this
 * test had them there and went red.
 *
 * `web/app/console/table.ts` builds both to hand the reader a CSV, which is a file save and not a
 * compilation — the export has existed since long before code could be supplied. Banning them
 * outright would have meant either deleting the export or carving an exemption for it, and an
 * exemption list is where a real second sandbox would eventually hide.
 *
 * What actually makes an object URL dangerous is running one: a Worker built from a string is a
 * compilation site wearing a different name. So the pair below is left alone and the construction
 * is pinned instead — a new `Worker` may only be built in the two client modules that already
 * exist, whose exact source lines `client.test.ts` and `probe.test.ts` assert verbatim.
 */
const WORKER_BUILDERS: readonly string[] = [
  join(WEB_DIR, "app", "worker", "client.ts"),
  join(WEB_DIR, "app", "worker", "probe.client.ts"),
  join(WEB_DIR, "app", "worker", "supplied.client.ts"),
];

/** Comments are stripped first: the rule has to be statable in this repo's own voice. */
function stripComments(source: string): string {
  const blankedBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
  return blankedBlocks.replace(/\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, " "));
}

function sourceFilesUnder(root: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(root)) {
    if (name === "node_modules") {
      continue;
    }
    const path = join(root, name);
    if (statSync(path).isDirectory()) {
      for (const nested of sourceFilesUnder(path)) {
        found.push(nested);
      }
    } else if (name.endsWith(".ts") || name.endsWith(".html")) {
      found.push(path);
    }
  }
  return found;
}

describe("reader-supplied code is compiled in exactly one place", () => {
  const files = sourceFilesUnder(WEB_DIR);

  it("has files to scan, so an empty sweep cannot pass this silently", () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files).toContain(SANDBOX);
  });

  it("finds no way to turn a string into a function outside the sandbox", () => {
    const offenders: string[] = [];
    for (const path of files) {
      if (path === SANDBOX || path === SELF) {
        continue;
      }
      const source = stripComments(readFileSync(path, "utf8"));
      for (const compiler of COMPILERS) {
        if (compiler.pattern.test(source)) {
          offenders.push(`${path} uses ${compiler.name}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("still finds the one in the sandbox, so the scan is looking for the right thing", () => {
    // The canary. A pattern that matched nothing anywhere would pass the test above having
    // checked nothing at all, which is the failure mode `hypot.test.ts` names and guards.
    const sandbox = stripComments(readFileSync(SANDBOX, "utf8"));
    const compiler = COMPILERS[0];
    expect(compiler).toBeDefined();
    if (compiler !== undefined) {
      expect(compiler.pattern.test(sandbox), "the sandbox no longer compiles anything").toBe(true);
    }
  });

  it("builds a worker only where a worker is already built, never from a string", () => {
    // The other half. `new Function` is the compiler; a Worker built from an object URL is the
    // same thing under another name, and nothing else in the tree scans for it.
    const offenders: string[] = [];
    for (const path of files) {
      if (WORKER_BUILDERS.includes(path) || path === SELF) {
        continue;
      }
      if (path.includes("__tests__")) {
        continue;
      }
      const source = stripComments(readFileSync(path, "utf8"));
      if (/\bnew\s+Worker\s*\(/.test(source)) {
        offenders.push(`${path} constructs a worker`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("keeps the sandbox's honest account of itself beside the compiler", () => {
    // The paragraph is the other half of the constraint. A sandbox that stopped saying what it
    // cannot do would be a sandbox somebody would soon believe was a jail.
    const sandbox = readFileSync(SANDBOX, "utf8");
    expect(sandbox).toMatch(/not a jail/i);
  });
});
