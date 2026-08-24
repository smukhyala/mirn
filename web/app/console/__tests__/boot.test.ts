import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { BAND_NOT_MEASURED } from "../tile.js";

/**
 * The page boots, and its headline tiles carry live numbers.
 *
 * Every expensive bug on the last version of this project built cleanly and passed every unit
 * test: a panel explaining a quantity the page was not showing, dials the copy told the reader to
 * drag that were never drawn. Only booting the real HTML with the real module finds those — this
 * file is what caught the one below, which no unit test of `preview.ts` in isolation did.
 *
 * Five tiles, not seven. HEADLINE_COLUMNS carries seven columns, and two of them cannot be shown
 * from a preview alone:
 *   - `runToRunBandM` needs the run-to-run band directly, which only Run buys (267 ms is not a
 *     keystroke budget), so `preview.ts` never even reports that column.
 *   - `worstMomentM` needs only "run" and its own reading IS always measured in a preview, but its
 *     zero-reference is the companion column `worstMomentNullM`, which needs the band too. A tile
 *     with a reading and no resolvable zero is exactly the error `zeroRenderingFor` refuses to
 *     render — it throws rather than show a number with nothing to judge it against — so
 *     `console.ts` skips that tile as well, via `isRenderable`.
 * `preview.test.ts` asserts both missing readings directly; this file asserts the visible count.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function boot(): Promise<Document> {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: "https://example.test/console" });

  // jsdom has no canvas, so `getContext` returns null and bootConsole's own guard would throw
  // before anything else mounted. A proxy that accepts every call and records none is enough:
  // what is asserted here is the tiles, and arena.test.ts covers the drawing itself.
  const stub = new Proxy({}, { get: () => (): void => {}, set: () => true });
  const prototype = dom.window.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown };
  prototype.getContext = (): unknown => stub;

  const globals = globalThis as unknown as Record<string, unknown>;
  globals["window"] = dom.window;
  globals["document"] = dom.window.document;
  globals["HTMLElement"] = dom.window.HTMLElement;
  globals["getComputedStyle"] = dom.window.getComputedStyle.bind(dom.window);
  globals["requestAnimationFrame"] = (): number => 0;

  vi.resetModules();
  await import("../../../console.js");
  return dom.window.document;
}

describe("the console boots", () => {
  let document: Document;

  beforeAll(async () => {
    document = await boot();
  });

  it("paints the five headline tiles a preview alone can support", () => {
    expect(document.querySelectorAll(".tile").length).toBe(5);
  });

  it("puts a live number in the true-effect tile", () => {
    const tile = document.querySelector('[data-column="trueEffectM"]');
    const text = tile?.querySelector(".tile-number")?.textContent ?? "";
    expect(text).toMatch(/^\d+\.\d{3}$/);
  });

  it("shows the forecaster as measured, because the zero-effect run was computed", () => {
    const tile = document.querySelector('[data-column="forecastReportM"]');
    expect(tile?.querySelector(".tile-number")).not.toBeNull();
    expect(tile?.querySelector(".tile-zero-value")).not.toBeNull();
  });

  it("never shows a band before a Run", () => {
    const captions = Array.from(document.querySelectorAll(".gauge-caption"));
    expect(captions.length).toBe(5);
    for (const caption of captions) {
      expect(caption.textContent).toBe(BAND_NOT_MEASURED);
    }
  });

  it("stamps the settings the preview was measured at onto every tile", () => {
    const tiles = Array.from(document.querySelectorAll(".tile"));
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.querySelectorAll(".stamp").length).toBe(3);
    }
  });
});
