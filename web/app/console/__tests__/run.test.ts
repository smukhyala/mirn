import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import type { SweepJob } from "../../../engine/job/spec.js";
import type { RunRow } from "../../../engine/job/stats.js";

/**
 * The Run button is the verb on this page, and the previous draft of this work shipped it wired to
 * nothing. So the worker is replaced by a recorder here and every branch is driven by hand: a job
 * is built from the panel, progress reaches the hairline rule, cancel is reachable while it runs, a
 * failure is said out loud rather than left spinning, and a finished sweep lands in the kept list.
 *
 * Three things this file's own fixture had to fix against the task-27 brief, all discovered by
 * actually reading the code the brief describes rather than trusting its shape:
 *
 * 1. `web/app/worker/client.ts`'s real `makeSweepClient` takes TWO arguments, `(port, handlers)`,
 *    not one — a `SweepPort` the caller builds from `sweepPortFor(spawnSweepWorker())`, then the
 *    handlers. The brief's own interface list describes a one-argument version that was never
 *    committed. `onBand` is four numbers on the wire (`axisIndex, meanM, peakM, nReplicates`),
 *    matching `web/app/worker/protocol.ts`'s flat `"band"` message — not a single `BandReading`
 *    object, which is `console.ts`'s job to assemble, not the client's.
 * 2. `web/console.html`'s `<aside id="settings">` is empty until `mountPanel` (Task 24) appends its
 *    own root into it. A prior attempt put the Run block directly in that static markup and was
 *    reverted (`git log -- web/console.html`, commit "Revert the Run button") because
 *    `mountPanel`'s `host.append(root)` would then push the panel BELOW a button that is supposed
 *    to sit below the panel. `console.ts` builds the run block detached and attaches it only after
 *    `mountPanel` has run, so `#run` exists once `bootConsole` finishes either way — this file
 *    checks it by id, the same as the brief's own tests did, plus one extra check of the order.
 * 3. `web/app/console/panel.ts`'s own "One press of Run" group already had an element with
 *    `id="run-cost"`, showing a rougher, always-live estimate. Two elements sharing one id is
 *    invalid HTML; that element no longer carries an id, and `#run-cost` unambiguously names the
 *    one this file drives.
 */

interface Captured {
  readonly onProgress: (unitsDone: number, unitsTotal: number, phase: string) => void;
  readonly onRow: (row: RunRow) => void;
  readonly onBand: (axisIndex: number, meanM: number, peakM: number, nReplicates: number) => void;
  readonly onDone: () => void;
  readonly onCancelled: () => void;
  readonly onFailed: (message: string) => void;
}

const { started, cancelled, handlers } = vi.hoisted(() => ({
  started: [] as SweepJob[],
  cancelled: [] as number[],
  handlers: [] as Captured[],
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
      cancel: (): void => {
        cancelled.push(1);
      },
      isRunning: (): boolean => false,
    };
  },
}));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function boot(): Promise<{ readonly document: Document; readonly window: JSDOM["window"] }> {
  const html = readFileSync(join(ROOT, "console.html"), "utf8");
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

  started.length = 0;
  cancelled.length = 0;
  handlers.length = 0;
  vi.resetModules();
  await import("../../../console.js");
  return { document: dom.window.document, window: dom.window };
}

function click(target: Element | null, window: JSDOM["window"]): void {
  target?.dispatchEvent(new window.Event("click", { bubbles: true }));
}

function row(axisIndex: number, axisValue: number, seedIndex: number): RunRow {
  return {
    kind: "runRow",
    key: { axisIndex, axisValue, seedIndex },
    readings: { trueEffectM: { kind: "reading", value: 0.352, availability: { kind: "measured" } } },
  };
}

describe("pressing Run", () => {
  it("prices the press before it happens", async () => {
    const { document } = await boot();
    expect(document.getElementById("run-cost")?.textContent).toMatch(/^\d+ runs? — about /);
  });

  it("says how long a press costs in exactly one place, not two disagreeing ones", async () => {
    // panel.ts (Task 24) used to carry its own live "N runs — about X s" line, computed from a
    // linear estimate, right beside this one's quadratic-fitted, `describeCost`-driven figure —
    // two adjacent, identically-worded numbers that disagree by up to ~20% away from default
    // settings. Removed rather than merely relabelled, per this task's fix round: this console's
    // whole subject is that a number must say what it means, and two of them saying different
    // things about the same press said the opposite.
    const { document } = await boot();
    const settings = document.getElementById("settings");
    const costLike = Array.from(settings?.querySelectorAll("p") ?? []).filter((node) =>
      /^\d+ runs? — about \d/.test(node.textContent ?? ""),
    );
    expect(costLike.length).toBe(1);
    expect(costLike[0]?.id).toBe("run-cost");
  });

  it("builds the run block after the panel, so the button sits below the settings it commits", async () => {
    const { document, window } = await boot();
    const settings = document.getElementById("settings");
    const panelRoot = settings?.querySelector(".panel");
    const runBlock = settings?.querySelector(".run-block");
    expect(panelRoot).not.toBeNull();
    expect(runBlock).not.toBeNull();
    // compareDocumentPosition's DOCUMENT_POSITION_FOLLOWING (4) means runBlock comes after
    // panelRoot in the tree — the ordering the reverted earlier attempt got backwards.
    const position = panelRoot?.compareDocumentPosition(runBlock as Node) ?? 0;
    expect(position & window.Node.DOCUMENT_POSITION_FOLLOWING).toBe(window.Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("starts a job built from the panel", async () => {
    const { document, window } = await boot();
    click(document.getElementById("run"), window);
    expect(started.length).toBe(1);
    const job = started[0] as SweepJob;
    expect(job.kind).toBe("sweepJob");
    expect(job.measurement.forecastEndStep).toBe(200);
    expect(job.seedIndices.length).toBeGreaterThan(0);
  });

  it("fills the hairline rule as the work lands", async () => {
    const { document, window } = await boot();
    click(document.getElementById("run"), window);
    (handlers[0] as Captured).onProgress(14, 56, "simulating");
    const rule = document.getElementById("progress-rule");
    expect(rule?.style.getPropertyValue("--mirn-progress")).toBe("0.25");
    expect(rule?.getAttribute("aria-valuenow")).toBe("25");
  });

  it("turns into Cancel while it runs, says it is cancelling truthfully, and back again", async () => {
    const { document, window } = await boot();
    const button = document.getElementById("run");
    click(button, window);
    expect(button?.textContent).toBe("Cancel");

    click(button, window);
    expect(cancelled.length).toBe(1);
    // Cancel is a flag the worker checks BETWEEN units, never mid-unit (worst case ~740 ms for a
    // banded unit at 44 people), so the button cannot honestly say "Cancelled" yet — but it is
    // already true that cancellation is in flight, and the status line says exactly that, not more.
    expect(document.getElementById("run-status")?.textContent).toBe(
      "Cancelling — this finishes the run already in progress first.",
    );
    expect(button?.textContent).toBe("Cancel");

    (handlers[0] as Captured).onCancelled();
    expect(button?.textContent).toBe("Run");
    expect(document.getElementById("run-status")?.textContent).toBe("Cancelled. Nothing was kept.");
  });

  it("keeps routing clicks to cancel while already cancelling, and leaves de-duplication to the client", async () => {
    const { document, window } = await boot();
    const button = document.getElementById("run");
    click(button, window);
    click(button, window);
    click(button, window);
    // Three clicks: one starts the sweep, two land while `running !== null` and each calls
    // client.cancel() again — console.ts does not itself guard against a repeat cancel. That is
    // deliberate, not a gap: the real client (web/app/worker/client.ts) already no-ops a cancel
    // outside its "running" phase, so a second guard here would just duplicate that one. This
    // pins the delegation, not a rejection at the button.
    expect(cancelled.length).toBe(2);
  });

  it("says what went wrong rather than spinning", async () => {
    const { document, window } = await boot();
    click(document.getElementById("run"), window);
    (handlers[0] as Captured).onFailed("crowd size must be a positive integer");
    expect(document.getElementById("run-status")?.textContent).toBe(
      "The sweep stopped: crowd size must be a positive integer",
    );
    expect(document.getElementById("run")?.textContent).toBe("Run");
  });

  it("commits the finished runs to the kept list", async () => {
    const { document, window } = await boot();
    click(document.getElementById("run"), window);
    const captured = handlers[0] as Captured;
    captured.onRow(row(0, 18, 0));
    captured.onBand(0, 0.311, 0.62, 8);
    captured.onDone();
    expect(document.getElementById("kept-empty")).toBeNull();
    const lines = document.querySelectorAll("[data-group-id]");
    expect(lines.length).toBe(1);
    expect(document.getElementById("run-status")?.textContent).toBe("Finished. Kept below.");
  });

  it("re-prices the press once a run ends, in case the panel moved while it ran", async () => {
    const { document, window } = await boot();
    const slider = document.querySelector<HTMLInputElement>('[data-axis="crowdSize"] input[type="range"]');
    click(document.getElementById("run"), window);
    const priceDuringRun = document.getElementById("run-cost")?.textContent;

    // Nudge the panel to a bigger crowd while the sweep is "running" — priceThePress's own guard
    // (`if (running !== null) return`) means the cost line does not move yet.
    if (slider !== null && slider !== undefined) {
      slider.value = "32";
      slider.dispatchEvent(new window.Event("input", { bubbles: true }));
    }
    expect(document.getElementById("run-cost")?.textContent).toBe(priceDuringRun);

    (handlers[0] as Captured).onDone();
    // Once idle again, the cost line reflects the panel as it reads NOW (32 people), not as it
    // read when Run was pressed (18) — otherwise the operator would see a price for a sweep they
    // no longer have configured.
    expect(document.getElementById("run-cost")?.textContent).not.toBe(priceDuringRun);
    expect(document.getElementById("run-status")?.textContent).toBe("Finished. Kept below.");
  });

  it("keeps a run's own band, assembled from the wire's four numbers, in the group it belongs to", async () => {
    // onBand crosses the worker boundary as four separate positional numbers (protocol.ts's flat
    // "band" message), never a BandReading object — console.ts has to assemble one before handing
    // it to the group builder. Nothing downstream validates a BandReading's field values:
    // makeRunGroup checks id/label/rows, never bands, and renderKept reads only group.label and
    // group.rows.length. So the only way to catch a transposed or dropped field is to read the
    // committed group's own band back out and check its numbers directly — four DISTINCT values
    // below, so swapping any two of them is a different, wrong answer, not an accidental match.
    const { document, window } = await boot();
    click(document.getElementById("run"), window);
    const captured = handlers[0] as Captured;
    captured.onRow(row(0, 18, 0));
    captured.onBand(2, 0.41, 0.9, 6);
    captured.onDone();
    expect(document.querySelectorAll("[data-group-id]").length).toBe(1);

    const { keptGroups } = await import("../../../console.js");
    const band = keptGroups[0]?.bands[0];
    expect(band).toEqual({
      kind: "bandReading",
      axisIndex: 2,
      meanM: 0.41,
      peakM: 0.9,
      nReplicates: 6,
    });
  });

  it("keeps the settings a run was launched with, even if the panel changes before it finishes", async () => {
    // The sharper version of "commits the finished runs": a ledger row must describe the run that
    // produced it, not whatever the panel says NOW. Moving a slider mid-run must not leak into the
    // group once it is committed.
    const { document, window } = await boot();
    const slider = document.querySelector<HTMLInputElement>('[data-axis="crowdSize"] input[type="range"]');
    expect(slider).not.toBeNull();
    expect(slider?.value).toBe("18");

    click(document.getElementById("run"), window);
    const captured = handlers[0] as Captured;
    const launchedJob = started[0] as SweepJob;
    expect(launchedJob.base.crowd?.nPedestrians).toBe(18);

    // Nudge the panel while the sweep is "running" (per the mock, nothing is actually simulating).
    if (slider !== null) {
      slider.value = "24";
      slider.dispatchEvent(new window.Event("input", { bubbles: true }));
    }

    captured.onRow(row(0, 18, 0));
    captured.onDone();

    const group = (await import("../../../console.js")).keptGroups[0];
    expect(group?.job.base.crowd?.nPedestrians).toBe(18);
  });
});
