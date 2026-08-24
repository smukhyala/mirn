import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import type { SweepJob } from "../../../engine/job/spec.js";
import type { RunRow } from "../../../engine/job/stats.js";

/**
 * Task 29's own wiring in console.ts: selecting a ledger row plays back that cell (rebuilt, not
 * stored), the seed stepper picks which run inside it plays, and the sweep curve shows or hides
 * with what was actually selected. None of playback.ts's or curve.ts's own unit tests exercise the
 * DOM wiring that connects a click to either — this file does, following the same boot pattern
 * `run.test.ts` and `ledger-dom.test.ts` already established (their own doc comments record why
 * the mock's shape has to match `client.ts` exactly: two constructor arguments, `onBand` as four
 * numbers on the wire, `baseSeed`/`seedStride` required by `SweepJobInit`).
 *
 * `#sweep-block`'s `hidden` attribute and `#seed-readout`'s text are read directly rather than
 * inspecting canvas draw calls: the getContext stub below is a no-op proxy (there is no canvas in
 * this project's Node test environment — arena.test.ts and plot.test.ts already cover the drawing
 * itself), so DOM state is what a click can actually be checked against here.
 */
interface Captured {
  readonly onProgress: (unitsDone: number, unitsTotal: number, phase: string) => void;
  readonly onRow: (row: RunRow) => void;
  readonly onBand: (axisIndex: number, meanM: number, peakM: number, nReplicates: number) => void;
  readonly onDone: () => void;
  readonly onCancelled: () => void;
  readonly onFailed: (message: string) => void;
}

const { handlers, started } = vi.hoisted(() => ({
  handlers: [] as Captured[],
  started: [] as SweepJob[],
}));

vi.mock("../../worker/client.js", () => ({
  spawnSweepWorker: (): unknown => ({ kind: "fakeWorker" }),
  sweepPortFor: (worker: unknown): unknown => worker,
  makeSweepClient: (_port: unknown, captured: Captured) => {
    handlers.push(captured);
    return {
      kind: "sweepClient",
      start: (job: SweepJob): void => {
        started.push(job);
      },
      cancel: (): void => {},
      isRunning: (): boolean => false,
    };
  },
}));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function boot(): Promise<{ readonly document: Document; readonly window: JSDOM["window"] }> {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: "https://example.test/console" });
  const stub = new Proxy({}, { get: () => (): void => {}, set: () => true });
  const prototype = dom.window.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown };
  prototype.getContext = (): unknown => stub;
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["window"] = dom.window;
  globals["document"] = dom.window.document;
  globals["HTMLElement"] = dom.window.HTMLElement;
  globals["getComputedStyle"] = dom.window.getComputedStyle.bind(dom.window);
  globals["requestAnimationFrame"] = (): number => 0;
  handlers.length = 0;
  started.length = 0;
  vi.resetModules();
  await import("../../../console.js");
  return { document: dom.window.document, window: dom.window };
}

function click(target: Element | null, window: JSDOM["window"]): void {
  target?.dispatchEvent(new window.Event("click", { bubbles: true }));
}

function change(target: Element | null, window: JSDOM["window"]): void {
  target?.dispatchEvent(new window.Event("change", { bubbles: true }));
}

/** A single, un-swept press of Run, with four seeds so the stepper has somewhere to move. */
async function bootWithOneCell(): Promise<{ readonly document: Document; readonly window: JSDOM["window"] }> {
  const booted = await boot();
  const seedSelect = booted.document.getElementById("seed-count") as HTMLSelectElement;
  seedSelect.value = "4";
  change(seedSelect, booted.window);
  click(booted.document.getElementById("run"), booted.window);
  const captured = handlers[handlers.length - 1] as Captured;
  captured.onRow({
    kind: "runRow",
    key: { axisIndex: 0, axisValue: 0, seedIndex: 0 },
    readings: { trueEffectM: { kind: "reading", value: 0.352, availability: { kind: "measured" } } },
  });
  captured.onDone();
  return booted;
}

/**
 * A crowd-size sweep with its run-to-run band bought and delivered for EVERY cell. `panel.ts`'s
 * `SWEEP_VALUE_COUNT` (5) sets how many cells a default axis selection produces — not 2 — and
 * curve.ts only draws the band region when every one of them has a reading (a partial band would
 * otherwise be indistinguishable from an unmeasured one at the missing points, so it is left out
 * entirely rather than drawn with a gap; `curve.test.ts` covers that omission directly). Feeding
 * fewer than all five here would exercise that omission by accident instead of the region this
 * test is actually for.
 */
async function bootWithSweptResult(): Promise<{ readonly document: Document; readonly window: JSDOM["window"] }> {
  const booted = await boot();
  const axisSelect = booted.document.querySelector<HTMLSelectElement>("#sweep-axis") as HTMLSelectElement;
  axisSelect.value = "crowdSize";
  change(axisSelect, booted.window);
  click(booted.document.getElementById("run"), booted.window);
  const job = started[started.length - 1] as SweepJob;
  const captured = handlers[handlers.length - 1] as Captured;
  for (let axisIndex = 0; axisIndex < job.axisValues.length; axisIndex++) {
    const axisValue = job.axisValues[axisIndex] as number;
    captured.onRow({
      kind: "runRow",
      key: { axisIndex, axisValue, seedIndex: 0 },
      readings: {
        trueEffectM: { kind: "reading", value: 0.1 + axisIndex * 0.05, availability: { kind: "measured" } },
        forecastReportM: {
          kind: "reading",
          value: 0.12 + axisIndex * 0.04,
          availability: { kind: "measured" },
        },
      },
    });
    captured.onBand(axisIndex, 0.15 + axisIndex * 0.07, 0.3 + axisIndex * 0.1, 8);
  }
  captured.onDone();
  return booted;
}

describe("selecting a ledger row plays it back", () => {
  it("names which run of the cell is playing, and starts at the first seed", async () => {
    const { document, window } = await bootWithOneCell();
    click(document.querySelector(".ledger-row"), window);
    expect(document.getElementById("seed-readout")?.textContent).toBe("seed 1 of 4");
    expect(document.getElementById("playing-note")?.textContent).toContain("Playing");
  });

  it("steps to a different run without falling off either end", async () => {
    const { document, window } = await bootWithOneCell();
    click(document.querySelector(".ledger-row"), window);
    click(document.getElementById("seed-next"), window);
    expect(document.getElementById("seed-readout")?.textContent).toBe("seed 2 of 4");
    click(document.getElementById("seed-prev"), window);
    click(document.getElementById("seed-prev"), window);
    expect(document.getElementById("seed-readout")?.textContent).toBe("seed 1 of 4");
  });

  it("returns to the live preview once the kept results are cleared", async () => {
    const { document, window } = await bootWithOneCell();
    click(document.querySelector(".ledger-row"), window);
    expect(document.getElementById("playing-note")?.textContent).toContain("Playing");
    click(document.getElementById("clear-kept"), window);
    expect(document.getElementById("playing-note")?.textContent).toBe(
      "Live preview of the settings in the panel.",
    );
    expect(document.getElementById("seed-readout")?.textContent).toBe("seed 1 of 1");
  });

  it("keeps the sweep curve hidden for a single, un-swept run", async () => {
    const { document, window } = await bootWithOneCell();
    click(document.querySelector(".ledger-row"), window);
    expect((document.getElementById("sweep-block") as HTMLElement).hidden).toBe(true);
  });

  it("shows the sweep curve, with a legend entry per line and one for the band, for a swept result", async () => {
    const { document, window } = await bootWithSweptResult();
    const row = document.querySelectorAll(".ledger-row")[0] as HTMLElement;
    click(row, window);
    expect((document.getElementById("sweep-block") as HTMLElement).hidden).toBe(false);
    const legendItems = document.querySelectorAll("#sweep-legend li");
    expect(legendItems.length).toBe(3);
    expect(legendItems[0]?.className).toBe("legend-accent");
    expect(legendItems[2]?.className).toBe("legend-region");
  });
});
