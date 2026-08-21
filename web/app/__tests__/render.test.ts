import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Boots the real widget code against the real generated HTML.
 *
 * Everything else in the suite tests a function. Nothing tested that a PAGE comes out working, and
 * that is where the expensive bugs were: a red error box where five pages promised a prediction
 * question, a derivation panel explaining a quantity its page was not discussing, six dials the
 * prose told the reader to drag that were never drawn, and seven dead links out of the page that
 * introduces the experiments. Every one of those built cleanly and passed every unit test.
 */

const GENERATED = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "generated");

function pagePath(id: string): string {
  return join(GENERATED, `${id}.html`);
}

interface Booted {
  readonly document: Document;
  readonly window: JSDOM["window"];
}

let bootCounter = 0;

async function boot(id: string): Promise<Booted> {
  const html = readFileSync(pagePath(id), "utf8");
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: "https://example.test/page" });

  const globals = globalThis as unknown as Record<string, unknown>;
  globals["window"] = dom.window;
  globals["document"] = dom.window.document;
  globals["HTMLElement"] = dom.window.HTMLElement;
  globals["requestAnimationFrame"] = (): number => 0;
  // `performance` is deliberately left as Node's. Installing jsdom's over the global makes its
  // own `now()` delegate back to the global and recurse until the stack runs out.

  bootCounter++;
  // notes.ts hydrates on import and keeps per-page state, so each page needs a fresh instance.
  // Vite cannot resolve a variable dynamic import, so the cache is reset instead of the specifier
  // being varied.
  vi.resetModules();
  await import("../../notes.js");
  return { document: dom.window.document, window: dom.window };
}

function click(target: Element | null, window: JSDOM["window"]): void {
  target?.dispatchEvent(new window.Event("click", { bubbles: true }));
}

describe("the built pages boot", () => {
  beforeAll(() => {
    if (!existsSync(GENERATED)) {
      throw new Error(
        "web/generated is missing. Run `npm run notes` first — this suite tests the compiled " +
          "output, not the Markdown.",
      );
    }
  });

  it("renders page 2 with no widget errors", async () => {
    const { document } = await boot("two-worlds");
    const errors = Array.from(document.querySelectorAll(".widget-error")).map((e) => e.textContent);
    expect(errors).toEqual([]);
  });

  it("keeps the working closed until it is asked for, and opens it on click", async () => {
    // Page 2 says "Click the number. The working opens underneath it." It said that for a while
    // with nothing clickable and the panel permanently open.
    const { document, window } = await boot("two-worlds");
    const trigger = document.querySelector<HTMLButtonElement>(".quantity-trigger");
    const panel = document.querySelector<HTMLElement>(".quantity-panel");
    expect(trigger).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(panel?.hidden).toBe(true);
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");

    click(trigger, window);
    expect(panel?.hidden).toBe(false);
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.textContent).toContain("What went in");
  });

  it("makes a cited number open its provenance", async () => {
    // The other half of "every number on this site opens like that": a figure quoted from a sweep
    // has no arithmetic to unfold, but it does have a source.
    const { document, window } = await boot("e1-push-strength");
    const cited = document.querySelector<HTMLElement>('[data-quantity*="["]');
    expect(cited).not.toBeNull();
    expect(cited?.getAttribute("role")).toBe("button");
    expect(cited?.getAttribute("tabindex")).toBe("0");

    click(cited, window);
    const note = cited?.nextElementSibling;
    expect(note?.classList.contains("provenance")).toBe(true);
    expect(note?.textContent).toContain("sweep");
  });

  it("opens that provenance without naming a table, column or axis in code", async () => {
    // Guardrail 12: no bare code identifiers on any surface a reader sees. This panel was built
    // straight out of the reference the author wrote, so it told the reader the figure came "from
    // the e1_push_strength sweep" — a variable name, in the one sentence whose whole job is to
    // explain where a number came from to somebody who has never seen the repository.
    //
    // The guard is behavioural rather than a check on the label table, so it also fails when a new
    // experiment is added with no reader-facing name for it, and when a column or an axis leaks by
    // some other route.
    const pages = [
      "e1-push-strength",
      "e2-density",
      "e3-robot-speed",
      "e4-recovery",
      "e5-propagation",
      "e6-perception",
      "e7-politeness",
      "the-guess",
      "the-floor",
    ];
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    const offenders: string[] = [];

    for (const id of pages) {
      const { document, window } = await boot(id);
      const cited = Array.from(document.querySelectorAll<HTMLElement>("[data-quantity]"));
      expect(cited.length, `${id} cites nothing, so this page proves nothing`).toBeGreaterThan(0);
      for (const span of cited) {
        click(span, window);
        const note = span.nextElementSibling;
        const text = note?.textContent ?? "";
        const found = identifier.exec(text);
        if (found !== null) {
          offenders.push(`${id}: "${found[0]}" in ${text.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("renders the prediction question with real labels, not [object Object]", async () => {
    const { document } = await boot("e1-push-strength");
    const options = Array.from(document.querySelectorAll(".predict-option")).map(
      (b) => b.textContent ?? "",
    );
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const label of options) {
      expect(label).not.toContain("[object Object]");
      expect(label.length).toBeGreaterThan(8);
    }
  });

  it("draws every dial an experiment page asks for", async () => {
    // Six pages told the reader to drag a control the runtime silently ignored.
    const { document } = await boot("e1-push-strength");
    const knobLabels = Array.from(document.querySelectorAll(".widget-knob span")).map(
      (s) => s.textContent ?? "",
    );
    expect(knobLabels.some((l) => l.includes("space the robot demands"))).toBe(true);
    expect(document.querySelectorAll(".widget-error")).toHaveLength(0);
  });

  it("never shows a bare metre in the scene readout", async () => {
    // Guardrails 6 and 7: a metre always appears next to something that gives it scale.
    const { document } = await boot("two-worlds");
    const readout = document.querySelector(".widget-readout")?.textContent ?? "";
    expect(readout).toMatch(/m\s+—\s+\S/);
  });

  it("leaves no unresolved quantity token in any page", async () => {
    for (const id of ["the-room", "two-worlds", "one-number", "the-floor", "the-guess"]) {
      const html = readFileSync(pagePath(id), "utf8");
      expect(html, `${id} has an unresolved token`).not.toContain("{{q:");
      expect(html, `${id} has a broken quantity`).not.toContain("quantity-broken");
    }
  });
});
