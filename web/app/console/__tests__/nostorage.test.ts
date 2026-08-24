import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards guardrail 10: no server, no backend, no persistence beyond the URL.
 *
 * Until this file existed, that rule was stated in two prose comments and enforced by nobody —
 * exactly the position the `Math.hypot` ban was in before `hypot.test.ts`, and this file is
 * deliberately built the same way, including the canary and the meta-test. A comment is not a
 * build error, and the reviewer who wrote the comments will not be the one who adds the
 * `localStorage` call.
 *
 * The rule is not squeamishness about storage. The ledger is a list of measurements, and a
 * measurement that outlives the code that produced it becomes a claim about a formula that may
 * since have changed. A permalink is exempt because it carries the recipe and not the answer:
 * reloading one re-runs the simulation at today's code. `history.replaceState` is how it gets
 * into the address bar and is allowed for that reason; `fetch` and its neighbours are not allowed
 * at all, because there is nothing to talk to and there is not going to be.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(HERE, "..", "..", "..");

/** The one exemption: the patterns below are code here, so a scan of this file reports itself. */
const SELF = fileURLToPath(import.meta.url);

const BANNED: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "localStorage", pattern: /\blocalStorage\b/ },
  { name: "sessionStorage", pattern: /\bsessionStorage\b/ },
  { name: "indexedDB", pattern: /\bindexedDB\b/i },
  { name: "document.cookie", pattern: /\bdocument\s*\.\s*cookie\b/ },
  // No dot in the exclusion class: `prefetch(` is still excluded (a letter, "e", precedes
  // "fetch("), but `window.fetch(`, `self.fetch(` and `globalThis.fetch(` — a dot precedes
  // "fetch(" — are member-expression calls this pattern must catch, not identifier suffixes it
  // must not.
  { name: "fetch", pattern: /(?<![A-Za-z0-9_])fetch\s*\(/ },
  { name: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
  { name: "WebSocket", pattern: /\bWebSocket\b/ },
  { name: "EventSource", pattern: /\bEventSource\b/ },
  { name: "navigator.sendBeacon", pattern: /\bsendBeacon\b/ },
  { name: "caches", pattern: /\bcaches\s*\.\s*open\b/ },
  { name: "serviceWorker", pattern: /\bserviceWorker\b/ },
];

/** Comments are stripped first: the rule has to be stated somewhere, in this repo's own voice,
 *  and a scan that read its own explanation would never go green. Newlines survive, so a reported
 *  line number still points at the real line. */
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
      continue;
    }
    // The HTML and the stylesheet are scanned too: an inline <script> or a CSS `url()` pointing at
    // a host is the same breach as a `fetch` in a module.
    const scannable = name.endsWith(".ts") || name.endsWith(".html") || name.endsWith(".css");
    if (scannable && path !== SELF) {
      found.push(path);
    }
  }
  return found;
}

describe("no server, no storage, nothing beyond the URL", () => {
  const files = sourceFilesUnder(WEB_DIR);

  it("finds the files it is supposed to be checking", () => {
    // A grep test that silently scans nothing passes forever.
    expect(files.length).toBeGreaterThan(40);
    expect(files.some((path) => path.endsWith("console.ts"))).toBe(true);
    expect(files.some((path) => path.endsWith("index.html"))).toBe(true);
    expect(files.some((path) => path.endsWith("console.css"))).toBe(true);
  });

  it("holds across every source file under web/", () => {
    const offenders: string[] = [];
    for (const path of files) {
      const lines = stripComments(readFileSync(path, "utf8")).split("\n");
      for (let i = 0; i < lines.length; i++) {
        for (const banned of BANNED) {
          if (banned.pattern.test(lines[i] as string)) {
            offenders.push(`${path}:${i + 1} — ${banned.name}`);
          }
        }
      }
    }
    expect(
      offenders,
      "Guardrail 10: static files only. The ledger does not survive a reload and there is nothing " +
        "to talk to. A permalink is the only thing allowed to persist, and it carries the recipe " +
        "rather than the answer.",
    ).toEqual([]);
  });

  it("would notice a violation, rather than passing because a pattern never matches", () => {
    // The test that tests the test. A grep guard with a broken regex is indistinguishable from a
    // codebase that obeys the rule, and that is how this class of check rots.
    const planted = stripComments(
      "const saved = localStorage.getItem('ledger');\n" +
        "await fetch('/api/results');\n" +
        "const socket = new WebSocket('wss://example.test');\n" +
        "navigator.sendBeacon('/t', body);\n",
    );
    const caught: string[] = [];
    for (const banned of BANNED) {
      if (banned.pattern.test(planted)) {
        caught.push(banned.name);
      }
    }
    expect(caught).toEqual(["localStorage", "fetch", "WebSocket", "navigator.sendBeacon"]);
    // And a file that only explains the rule is not a violation of it.
    expect(stripComments("// localStorage is banned here; so is fetch(\n")).not.toMatch(/localStorage/);
  });

  it("catches fetch as a member-expression call, not only a bare one", () => {
    // The pattern used to exclude anything preceded by a dot, on the theory that a dot is what
    // keeps a call like `object.prefetch(` from matching — but `object.prefetch(` is already
    // excluded because "e", a letter, sits directly before "fetch(", not because of the dot. The
    // dot exclusion's only real effect was letting `window.fetch(`, `self.fetch(` and
    // `globalThis.fetch(` slip through, which is exactly the network call this file exists to
    // catch.
    const fetchBanned = BANNED.find((banned) => banned.name === "fetch");
    expect(fetchBanned).toBeDefined();
    expect(fetchBanned?.pattern.test(stripComments("window.fetch('/api/results');\n"))).toBe(true);
    expect(fetchBanned?.pattern.test(stripComments("self.fetch('/api/results');\n"))).toBe(true);
    expect(fetchBanned?.pattern.test(stripComments("globalThis.fetch('/x');\n"))).toBe(true);
    // Still excluded: a genuinely different identifier that merely ends in "fetch".
    expect(fetchBanned?.pattern.test(stripComments("prefetchResource();\n"))).toBe(false);
  });

  it("still allows the one thing the permalink needs", () => {
    // `history.replaceState` puts the recipe in the address bar. It is not storage: it survives
    // nothing, and the settings it carries are re-simulated by whatever code is running today.
    const console = readFileSync(join(WEB_DIR, "console.ts"), "utf8");
    expect(console).toContain("window.history.replaceState");
    expect(console).toContain("window.location.search");
  });
});
