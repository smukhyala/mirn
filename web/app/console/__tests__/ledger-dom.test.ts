import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import type { SweepJob } from "../../../engine/job/spec.js";
import type { RunRow } from "../../../engine/job/stats.js";
import { STALE_MESSAGE } from "../table.js";

/**
 * Two things this file's own fixture had to fix against the brief, both already discovered and
 * documented by Task 27's `run.test.ts` for the same reason:
 *
 * 1. `web/app/worker/client.ts`'s real `makeSweepClient` takes TWO arguments, `(port, handlers)`,
 *    not one — and `spawnSweepWorker`/`sweepPortFor` are separate exports `console.ts` also calls
 *    before it gets a handle to mock. A one-export, one-argument mock leaves those two undefined
 *    and `spawnSweepWorker()` throws the moment Run is pressed.
 * 2. `onBand` is four numbers on the wire (`axisIndex, meanM, peakM, nReplicates`), matching
 *    `web/app/worker/protocol.ts`'s flat `"band"` message, never a single `BandReading` object.
 *    Unused by any test below, but typed to match reality rather than left lying.
 */
interface Captured {
  readonly onProgress: (unitsDone: number, unitsTotal: number, phase: string) => void;
  readonly onRow: (row: RunRow) => void;
  readonly onBand: (axisIndex: number, meanM: number, peakM: number, nReplicates: number) => void;
  readonly onDone: () => void;
  readonly onCancelled: () => void;
  readonly onFailed: (message: string) => void;
}

const { handlers, csvCalls, started } = vi.hoisted(() => ({
  handlers: [] as Captured[],
  csvCalls: [] as unknown[],
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
    };
  },
}));

vi.mock("../csv.js", () => ({
  toCsv: (init: unknown): string => {
    csvCalls.push(init);
    return "disclosure line\nheader\nrow";
  },
  // The real `makeCsvOptions` (csv.ts) validates and defaults `granularity`; console.ts calls it
  // rather than building a `{ kind: "csvOptions", ... }` literal by hand, so it has to be mocked
  // alongside `toCsv` or that call throws "makeCsvOptions is not a function" the moment Export CSV
  // is pressed.
  makeCsvOptions: (init: { readonly granularity?: string; readonly generatedAtIso: string }) => ({
    kind: "csvOptions" as const,
    granularity: init.granularity ?? "cell",
    generatedAtIso: init.generatedAtIso,
  }),
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
  csvCalls.length = 0;
  started.length = 0;
  vi.resetModules();
  await import("../../../console.js");
  return { document: dom.window.document, window: dom.window };
}

function click(target: Element | null, window: JSDOM["window"]): void {
  target?.dispatchEvent(new window.Event("click", { bubbles: true }));
}

function row(seedIndex: number, value: number): RunRow {
  return {
    kind: "runRow",
    key: { axisIndex: 0, axisValue: 0, seedIndex },
    readings: {
      trueEffectM: { kind: "reading", value, availability: { kind: "measured" } },
      robotArrivalS: {
        kind: "reading",
        value: Number.NaN,
        availability: { kind: "notApplicable", why: "the robot-free run has no robot to compare" },
      },
    },
  };
}

async function bootWithOneResult(): Promise<{ readonly document: Document; readonly window: JSDOM["window"] }> {
  const booted = await boot();
  click(booted.document.getElementById("run"), booted.window);
  const captured = handlers[0] as Captured;
  captured.onRow(row(0, 0.352));
  captured.onDone();
  return booted;
}

/**
 * Two kept cells, from a real crowd-size sweep set up through the panel's own `#sweep-axis`
 * select — the same control `panel.test.ts`'s "fills the sweep values from the picked axis's own
 * range" pins. A single-run press only ever has one cell (axisIndex 0), which cannot exercise a
 * sort click or a column toggle that removes a heading a reader could otherwise still see: with
 * one row there is nothing for either to reorder or reveal a gap in.
 */
async function bootWithSweptResults(): Promise<{ readonly document: Document; readonly window: JSDOM["window"] }> {
  const booted = await boot();
  const select = booted.document.querySelector<HTMLSelectElement>("#sweep-axis") as HTMLSelectElement;
  select.value = "crowdSize";
  select.dispatchEvent(new booted.window.Event("change", { bubbles: true }));
  click(booted.document.getElementById("run"), booted.window);
  const job = started[started.length - 1] as SweepJob;
  const captured = handlers[handlers.length - 1] as Captured;
  const low = job.axisValues[0] as number;
  const high = job.axisValues[1] as number;
  captured.onRow({
    kind: "runRow",
    key: { axisIndex: 0, axisValue: low, seedIndex: 0 },
    readings: { trueEffectM: { kind: "reading", value: 0.10, availability: { kind: "measured" } } },
  });
  captured.onRow({
    kind: "runRow",
    key: { axisIndex: 1, axisValue: high, seedIndex: 0 },
    readings: { trueEffectM: { kind: "reading", value: 0.90, availability: { kind: "measured" } } },
  });
  captured.onDone();
  return booted;
}

describe("the ledger on the page", () => {
  it("renders a row per cell once a run is kept", async () => {
    const { document } = await bootWithOneResult();
    expect(document.getElementById("kept-empty")).toBeNull();
    expect(document.querySelectorAll(".ledger-row").length).toBe(1);
  });

  it("renders a not-applicable cell as its reason", async () => {
    const { document } = await bootWithOneResult();
    const reasons = Array.from(document.querySelectorAll(".cell-reason")).map((n) => n.textContent);
    expect(reasons).toContain("the robot-free run has no robot to compare");
  });

  it("greys the ledger and says so when the panel has moved", async () => {
    const { document, window } = await bootWithOneResult();
    // Task 24 addresses each control by its `data-axis` attribute, which its own test pins
    // ("renders a control for every axis in AXIS_ORDER, in that order", via dataset["axis"]).
    // There is no `axis-<key>` id anywhere, so query the attribute that actually exists rather
    // than adding an id whose only consumer would be this test.
    const people = document.querySelector('[data-axis="crowdSize"] input') as HTMLInputElement;
    people.value = String(Number(people.value) + 1);
    people.dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(document.querySelector(".ledger")?.classList.contains("is-stale")).toBe(true);
    expect(document.querySelector(".ledger-stale")?.textContent).toBe(STALE_MESSAGE);
  });

  it("pins with a filled disc and unpins with a hollow one", async () => {
    const { document, window } = await bootWithOneResult();
    const pin = document.querySelector(".pin");
    expect(pin?.textContent).toBe("○");
    click(pin, window);
    expect(document.querySelector(".pin")?.textContent).toBe("●");
  });

  it("exports the kept runs through the one CSV writer", async () => {
    const { document, window } = await bootWithOneResult();
    click(document.getElementById("export-csv"), window);
    expect(csvCalls.length).toBe(1);
  });

  it("puts the settings, not the results, in the address bar", async () => {
    const { document, window } = await bootWithOneResult();
    click(document.getElementById("copy-link"), window);
    expect(window.location.search.length).toBeGreaterThan(1);
    expect(window.location.search).not.toContain("0.352");
  });

  it("clears the kept results without clearing the panel", async () => {
    const { document, window } = await bootWithOneResult();
    click(document.getElementById("clear-kept"), window);
    expect(document.querySelectorAll(".ledger-row").length).toBe(0);
    expect(document.getElementById("kept-empty")).not.toBeNull();
    // 5, not the 7 in HEADLINE_COLUMNS: the live preview never buys the run-to-run band, so
    // runToRunBandM is skipped outright and worstMomentM is skipped too — its own reading needs
    // only "run", but its zero-reference is the companion column worstMomentNullM, which needs the
    // band (console.ts's own `paintTiles` comment says so). `boot.test.ts` already pins this same
    // number for the page's very first paint; a brief that said 6 here was counting HEADLINE_COLUMNS
    // minus runToRunBandM alone and missing worstMomentM's own exclusion.
    expect(document.querySelectorAll(".tile").length).toBe(5);
  });

  it("sorts the table by clicking a column heading, and reverses on a second click", async () => {
    const { document, window } = await bootWithSweptResults();
    expect(document.querySelectorAll(".ledger-row").length).toBe(2);

    // `renderKept` (console.ts) empties `#ledger` and calls `renderLedger` fresh on every render,
    // so the `<th>` this test just clicked is a detached node once that render lands — re-queried
    // before the second click, or the second dispatch has no ancestor chain left to bubble through
    // and silently does nothing, which was this test's own first failure while it was being written.
    const heading = (): Element | null =>
      document.querySelector('.ledger-heading[data-column="trueEffectM"]');
    expect(heading()).not.toBeNull();

    // The first click on any heading moves the sort off its "byAxis" default and toggles the
    // direction from its initial "ascending", landing on descending — highest trueEffectM (cell 1,
    // 0.90) first.
    click(heading(), window);
    const descending = Array.from(document.querySelectorAll(".ledger-row")).map((tr) =>
      tr.getAttribute("data-axis-index"),
    );
    expect(descending).toEqual(["1", "0"]);

    click(heading(), window);
    const ascending = Array.from(document.querySelectorAll(".ledger-row")).map((tr) =>
      tr.getAttribute("data-axis-index"),
    );
    expect(ascending).toEqual(["0", "1"]);
  });

  it("drops a column's heading and cells when its picker checkbox is unticked", async () => {
    const { document, window } = await bootWithSweptResults();
    click(document.getElementById("columns-toggle"), window);
    expect(document.querySelector('.ledger-heading[data-column="trueEffectM"]')).not.toBeNull();

    const box = document.querySelector<HTMLInputElement>('.column-option input[value="trueEffectM"]');
    expect(box).not.toBeNull();
    expect(box?.checked).toBe(true);
    if (box !== null) {
      box.checked = false;
      box.dispatchEvent(new window.Event("change", { bubbles: true }));
    }

    expect(document.querySelector('.ledger-heading[data-column="trueEffectM"]')).toBeNull();
    // The rows themselves are untouched — only the one column's heading and cells are gone.
    expect(document.querySelectorAll(".ledger-row").length).toBe(2);
  });
});
