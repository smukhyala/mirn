import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { FAMILIES, type FamilyKey } from "../../../engine/job/families.js";
import { PROBE_SEEDS } from "../../../engine/job/familyProbe.js";
import {
  QUESTIONS,
  QUESTION_ORDER,
  makeMethodAnswers,
  resolveFamily,
  type MethodDraft,
} from "../../../engine/job/questions.js";
import { pumpProbe } from "../../worker/probe.pump.js";
import type { FromProbeWorker, ToProbeWorker } from "../../worker/probe.protocol.js";
import { formatValue } from "../tile.js";

/**
 * The method card end to end, at the settings it actually ships.
 *
 * Everything else about this page is checked against a cheap probe or a stub, because a stub is
 * enough to prove wiring. This is the one file that answers the question a reader would ask: press
 * the button and what comes back. The worker here is a stub only in the sense that it is not a
 * thread — the message it is handed goes straight into the real `pumpProbe`, at the real settings
 * the page chose, and the numbers on screen are the engine's own.
 *
 * Marked slow because it is: two families at eight rooms each, with an eight-run drift line behind
 * every room, measured at about three seconds a family on the machine this was written on. It is a
 * loop rather than a gate — `familyProbe.slow.test.ts` owns the pinned measurements, and this owns
 * the wiring between them and a reader's eyes.
 *
 * Nothing here asserts a physics figure. What it asserts is that the figure ON SCREEN is the
 * figure the engine RETURNED, which is the only property a page can be responsible for and the one
 * a change to the crowd must not be able to break.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const HTML = readFileSync(join(ROOT, "method.html"), "utf8");

/** Eight rooms with an eight-run drift line each, twice over, plus the page boots. */
const RUN_TIMEOUT_MS = 120000;

interface Ran {
  readonly document: Document;
  readonly asked: ToProbeWorker;
  readonly answer: Extract<FromProbeWorker, { kind: "probed" }>;
  readonly progress: readonly Extract<FromProbeWorker, { kind: "progress" }>[];
  readonly elapsedMs: number;
}

/** The whole cross-product, so a family needing two answers together is still reachable. */
function draftFor(target: FamilyKey): MethodDraft {
  let sets: Record<string, string>[] = [{}];
  for (const key of QUESTION_ORDER) {
    const grown: Record<string, string>[] = [];
    for (const partial of sets) {
      for (const option of QUESTIONS[key].options) {
        grown.push({ ...partial, [key]: option.key });
      }
    }
    sets = grown;
  }
  for (const candidate of sets) {
    const draft = candidate as unknown as MethodDraft;
    if (resolveFamily(makeMethodAnswers(draft)).family === target) {
      return draft;
    }
  }
  throw new Error(`no set of answers reaches '${target}'`);
}

async function runThrough(target: FamilyKey): Promise<Ran> {
  const dom = new JSDOM(HTML, { url: "https://example.test/method" });
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["window"] = dom.window;
  globals["document"] = dom.window.document;
  globals["HTMLElement"] = dom.window.HTMLElement;

  let asked: ToProbeWorker | null = null;
  let listener: ((event: { readonly data: FromProbeWorker }) => void) | null = null;
  const back: FromProbeWorker[] = [];
  class RealPumpWorker {
    postMessage(message: ToProbeWorker): void {
      asked = message;
    }
    addEventListener(
      _type: string,
      handler: (event: { readonly data: FromProbeWorker }) => void,
    ): void {
      listener = handler;
    }
  }
  globals["Worker"] = RealPumpWorker;

  vi.resetModules();
  await import("../../../method.js");

  const doc = dom.window.document;
  const draft = draftFor(target);
  for (const key of QUESTION_ORDER) {
    const chosen = draft[key];
    const input = doc.querySelector<HTMLInputElement>(
      `.method-question[data-question="${key}"] input[value="${chosen ?? ""}"]`,
    );
    if (input === null) {
      throw new Error(`the page offers no answer '${chosen}' to '${key}'`);
    }
    input.checked = true;
    input.dispatchEvent(new dom.window.Event("change"));
  }

  const run = doc.querySelector<HTMLButtonElement>("#run");
  if (run === null) {
    throw new Error("the method card has no button to press");
  }
  expect(run.disabled).toBe(false);
  run.click();

  const request = asked as ToProbeWorker | null;
  if (request === null) {
    throw new Error("pressing the button asked for no measurement");
  }
  const deliver = listener as ((event: { readonly data: FromProbeWorker }) => void) | null;
  if (deliver === null) {
    throw new Error("the page never listened to its worker");
  }

  const startedMs = Date.now();
  pumpProbe(request.family, request.settings, {
    postMessage: (message: FromProbeWorker): void => {
      back.push(message);
      deliver({ data: message });
    },
  });
  const elapsedMs = Date.now() - startedMs;

  const last = back[back.length - 1];
  if (last === undefined || last.kind !== "probed") {
    throw new Error("the measurement never produced an answer");
  }
  const progress: Extract<FromProbeWorker, { kind: "progress" }>[] = [];
  for (const message of back) {
    if (message.kind === "progress") {
      progress.push(message);
    }
  }
  return { document: doc, asked: request, answer: last, progress, elapsedMs };
}

describe("pressing the button measures the family and shows what it read", () => {
  it(
    "runs a forecast counterfactual on eight zero-effect rooms and prints what it read",
    async () => {
      const ran = await runThrough("forecastCounterfactual");
      // The settings the page chose, not the test's: eight rooms and an eight-run drift line. A
      // drift line drawn from fewer replicate runs visibly jitters, and it is the line every count
      // on this page is taken against.
      expect(ran.asked.family).toBe("forecastCounterfactual");
      expect(ran.asked.settings.seeds).toEqual([...PROBE_SEEDS]);
      expect(ran.asked.settings.bandReplicates).toBe(8);
      expect(ran.progress.length).toBe(PROBE_SEEDS.length + 1);

      const probe = ran.answer.probe;
      // The premise, all the way through to the page: every room's true effect is exactly nothing.
      expect(probe.nTruthsExactlyZero).toBe(probe.nAttempted);
      expect(probe.nAttempted).toBe(PROBE_SEEDS.length);

      const verdict = ran.document.querySelector(".method-verdict");
      expect(verdict, "no verdict reached the page").not.toBeNull();
      expect(verdict?.getAttribute("data-family")).toBe("forecastCounterfactual");
      expect(verdict?.querySelector(".method-family-name")?.textContent).toBe(
        FAMILIES.forecastCounterfactual.name,
      );

      // The figure on screen IS the figure the engine returned. Not close to it: the same string,
      // formatted once. This is the only property a page can be held to, and a change to the crowd
      // must not be able to break it.
      const reading = ran.document.querySelector('[data-number="reading"] .figure-number');
      expect(reading?.textContent).toBe(formatValue(probe.meanReading, probe.unit));
      const drift = ran.document.querySelector('[data-number="drift"] .figure-number');
      expect(drift?.textContent).toBe(formatValue(probe.meanBandM, "metres"));
      const rate = ran.document.querySelector(".method-rate-number");
      expect(rate?.textContent).toBe(String(probe.nClearedBand));
      const denominator = ran.document.querySelector('[data-number="clearing"] .figure-denominator');
      expect(denominator?.textContent).toBe(String(probe.nAttempted));
      // And its zero: the rooms on which the true effect itself cleared the line, which is none.
      const zero = ran.document.querySelector('[data-number="clearing"] .figure-zero-value');
      expect(zero?.textContent).toBe(String(probe.nAttempted - probe.nTruthsUnderBand));
    },
    RUN_TIMEOUT_MS,
  );

  it(
    "runs an absolute quantity and refuses to call what it read a false-positive rate",
    async () => {
      const ran = await runThrough("noCounterfactual");
      expect(ran.asked.family).toBe("noCounterfactual");
      const probe = ran.answer.probe;

      const clearing = ran.document.querySelector('[data-number="clearing"]');
      expect(clearing?.getAttribute("data-second")).toBe("not-a-detection");
      expect(
        ran.document.querySelector(".method-rate-number"),
        "the family that detects nothing was given a rate's headline count after a real run",
      ).toBeNull();
      expect(clearing?.textContent).toContain("not a false-positive rate");

      // The count is still shown — refusing the shape is not the same as hiding the number.
      const inline = [...(clearing?.querySelectorAll(".figure-inline") ?? [])].map(
        (n) => n.textContent,
      );
      expect(inline).toEqual([String(probe.nClearedBand), String(probe.nAttempted)]);

      // And the reading itself is a room-sized distance rather than a small error, which is the
      // whole reason it is not a detector. Bounded rather than pinned: the pinned figure lives in
      // familyProbe.slow.test.ts, and what matters here is that it is orders above the line.
      expect(probe.meanReading).toBeGreaterThan(probe.meanBandM * 20);
      const reading = ran.document.querySelector('[data-number="reading"] .figure-number');
      expect(reading?.textContent).toBe(formatValue(probe.meanReading, probe.unit));
    },
    RUN_TIMEOUT_MS,
  );
});
