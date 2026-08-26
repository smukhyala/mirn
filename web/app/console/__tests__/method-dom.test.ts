import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { FAMILIES, FAMILY_ORDER, type FamilyKey } from "../../../engine/job/families.js";
import {
  makeFamilyProbeSettings,
  probeFamily,
  PROBE_SEEDS,
  type FamilyProbe,
} from "../../../engine/job/familyProbe.js";
import {
  QUESTIONS,
  QUESTION_ORDER,
  isComparison,
  makeMethodAnswers,
  resolveFamily,
  type MethodDraft,
} from "../../../engine/job/questions.js";
import type { FromProbeWorker, ToProbeWorker } from "../../worker/probe.protocol.js";
import { DISCLOSURE_CLAUSES } from "../csv.js";

/**
 * The method card's page, booted from its real HTML with its real module.
 *
 * Two properties are defended here that nothing else can defend.
 *
 * The first is guardrail 1: the invented-crowd disclosure precedes every number, in DOCUMENT
 * order, which is checked against the FILE rather than the booted DOM. A script can move a
 * paragraph after load, and a test that boots the page and then asks what comes first would pass a
 * page whose source puts the disclosure at the bottom. What is defended is the order a reader with
 * no JavaScript, a screen reader or a print stylesheet actually gets.
 *
 * The second is that the page measures the family the reader's answers select, and never another.
 * The worker here is a stub that records what it was asked for, so "which family was measured" is
 * a fact this test can read directly rather than infer from a rendered number. The real end-to-end
 * run, with the real estimator at the shipped settings, is in `method-run.slow.test.ts`.
 *
 * The questionnaire is checked against the closed table in `web/engine/job/questions.ts` rather
 * than against a list written here. A list written here would pass forever against a question
 * added later and forgotten, which is exactly the failure it exists to catch.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const HTML = readFileSync(join(ROOT, "method.html"), "utf8");
const FLAT = HTML.replace(/\s+/g, " ");

/** A cheap but REAL probe, so the page is handed the shape the engine actually produces. Two rooms
 *  and a two-run drift line: about a quarter of a second. The pinned measurements at the shipped
 *  settings live in `familyProbe.slow.test.ts`, and the numbers here are not asserted against
 *  them — what is asserted here is wiring. */
const CHEAP = makeFamilyProbeSettings({
  seeds: [PROBE_SEEDS[0] as number, PROBE_SEEDS[1] as number],
  bandReplicates: 2,
});

const PROBES = new Map<FamilyKey, FamilyProbe>();

function cheapProbe(key: FamilyKey): FamilyProbe {
  const held = PROBES.get(key);
  if (held !== undefined) {
    return held;
  }
  const fresh = probeFamily(FAMILIES[key], CHEAP);
  PROBES.set(key, fresh);
  return fresh;
}

interface Booted {
  readonly document: Document;
  /** Everything the page asked the worker to measure, in order. */
  readonly asked: readonly ToProbeWorker[];
  /** Push a message back as though the worker had sent it. */
  readonly reply: (message: FromProbeWorker) => void;
  readonly progressOf: (draft: MethodDraft) => string;
}

async function boot(search = ""): Promise<Booted> {
  const dom = new JSDOM(HTML, { url: `https://example.test/method${search}` });
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["window"] = dom.window;
  globals["document"] = dom.window.document;
  globals["HTMLElement"] = dom.window.HTMLElement;

  const asked: ToProbeWorker[] = [];
  let listener: ((event: { readonly data: FromProbeWorker }) => void) | null = null;
  class StubWorker {
    postMessage(message: ToProbeWorker): void {
      asked.push(message);
    }
    addEventListener(
      _type: string,
      handler: (event: { readonly data: FromProbeWorker }) => void,
    ): void {
      listener = handler;
    }
  }
  globals["Worker"] = StubWorker;

  vi.resetModules();
  const module = (await import("../../../method.js")) as {
    progressSentence: (draft: MethodDraft) => string;
  };

  const reply = (message: FromProbeWorker): void => {
    if (listener === null) {
      throw new Error("the page never listened to its worker");
    }
    listener({ data: message });
  };
  return { document: dom.window.document, asked, reply, progressOf: module.progressSentence };
}

/** Ticks a radio the way a reader does, and fails loudly if the page has no such answer. */
function answer(document: Document, question: string, option: string): void {
  const input = document.querySelector<HTMLInputElement>(
    `.method-question[data-question="${question}"] input[value="${option}"]`,
  );
  if (input === null) {
    throw new Error(`the page offers no answer '${option}' to the question '${question}'`);
  }
  input.checked = true;
  input.dispatchEvent(new (input.ownerDocument.defaultView as Window & typeof globalThis).Event("change"));
}

function answerAll(document: Document, draft: MethodDraft): void {
  for (const key of QUESTION_ORDER) {
    const chosen = draft[key];
    if (chosen === null) {
      continue;
    }
    answer(document, key, chosen);
  }
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

function click(document: Document, id: string): void {
  const button = document.querySelector<HTMLButtonElement>(`#${id}`);
  if (button === null) {
    throw new Error(`the method card has no #${id} to click`);
  }
  button.click();
}

describe("the method card is the page the build ships", () => {
  it("is tracked by git", () => {
    const run = (): string =>
      execFileSync("git", ["ls-files", "--error-unmatch", "web/method.html"], {
        encoding: "utf8",
      });
    expect(run).not.toThrow();
    expect(run().trim()).toBe("web/method.html");
  });

  it("links one stylesheet, which is the console's own", () => {
    const links = HTML.match(/<link[^>]+rel="stylesheet"[^>]*>/g) ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]).toContain("console.css");
  });

  it("boots from its own top-level script", () => {
    expect(HTML).toContain('<script type="module" src="./method.ts"></script>');
  });

  it("is reachable from the console's front door", () => {
    // A page nobody can find is a page that does not exist. The console's own ways-in list is the
    // one route onto it, so it is asserted rather than assumed.
    const index = readFileSync(join(ROOT, "index.html"), "utf8");
    expect(index).toContain('href="./method.html"');
  });
});

describe("the invented-crowd disclosure comes first on the method card too", () => {
  it("carries every clause the CSV carries", () => {
    expect(DISCLOSURE_CLAUSES.length, "there are no clauses to check for").toBeGreaterThan(0);
    for (const clause of DISCLOSURE_CLAUSES) {
      expect(FLAT, `the method card is missing "${clause}"`).toContain(clause);
    }
  });

  it("precedes the questions, the button and the verdict in document order", () => {
    const disclosure = HTML.indexOf('id="disclosure"');
    expect(disclosure).toBeGreaterThan(-1);
    for (const anchor of ['id="questions"', 'id="run"', 'id="result"', 'id="verdict"']) {
      const at = HTML.indexOf(anchor);
      expect(at, `${anchor} is missing from web/method.html`).toBeGreaterThan(-1);
      expect(disclosure, `${anchor} precedes the disclosure`).toBeLessThan(at);
    }
  });

  it("ships no measurement in its own markup, so nothing can be read before it is run", () => {
    const literal = /\d+\.\d+\s*(m|s)\b/.exec(FLAT);
    expect(literal).toBeNull();
  });
});

/**
 * Guardrail 12 over the page's OWN prose, which is the one surface of the method card that had no
 * scan. The other two have had one since they were written: `questions.test.ts` runs the regex over
 * every reader-facing string in the closed question table, and `method.test.ts` runs it over every
 * leaf of every family's rendered verdict. What was left is the hand-written copy in
 * `web/method.html` — the section saying what the page does, and the note under the Run button —
 * and it was left only because it was written last, not because it needs the rule less.
 *
 * `how.test.ts` does exactly this job for the working page and is the shape followed here,
 * including its ruling on brackets: the catalogue's pattern also bans `(`, `)` and `=>`, and this
 * one does not, because prose legitimately parenthesises and the catalogue entries it guards do
 * not.
 */
describe("the method card's own prose reads as English", () => {
  /** What a reader actually sees: comments, scripts, tags and entities are not prose. */
  function readerText(html: string): string {
    const withoutComments = html.replace(/<!--[\s\S]*?-->/g, " ");
    const withoutScripts = withoutComments.replace(/<script[\s\S]*?<\/script>/g, " ");
    const withoutTags = withoutScripts.replace(/<[^>]*>/g, " ");
    const withoutEntities = withoutTags.replace(/&[#a-zA-Z0-9]+;/g, " ");
    return withoutEntities.replace(/\s+/g, " ");
  }

  const TEXT = readerText(HTML);

  it("has prose to scan, so a stripped-to-nothing page cannot pass this silently", () => {
    expect(TEXT.length).toBeGreaterThan(400);
    expect(TEXT).toContain("Nothing of yours is read in");
  });

  it("spells no term the way a program spells it", () => {
    const identifier = /\b(?:[a-z]+[A-Z][A-Za-z]*|[a-z_]+_[a-z_]+)\b/.exec(TEXT);
    expect(
      identifier,
      `web/method.html shows the bare identifier '${identifier?.[0] ?? ""}'`,
    ).toBeNull();
  });

  it("would notice an identifier that escaped into the copy", () => {
    // The test that tests the test. A scan whose stripping swallowed the prose is
    // indistinguishable from a page that obeys the rule.
    const planted = readerText("<p>the cvmResidual is computed here</p>");
    expect(/\b(?:[a-z]+[A-Z][A-Za-z]*|[a-z_]+_[a-z_]+)\b/.exec(planted)?.[0]).toBe("cvmResidual");
  });
});

describe("the questionnaire is painted from the closed table", () => {
  it("shows every question and every answer the table holds, and nothing else", async () => {
    const page = await boot();
    const blocks = page.document.querySelectorAll(".method-question");
    expect(blocks.length).toBe(QUESTION_ORDER.length);
    let answersSeen = 0;
    for (const key of QUESTION_ORDER) {
      const block = page.document.querySelector(`.method-question[data-question="${key}"]`);
      expect(block, `the page never asked about '${key}'`).not.toBeNull();
      expect(block?.querySelector(".method-prompt-text")?.textContent).toBe(QUESTIONS[key].prompt);
      const inputs = [...(block?.querySelectorAll("input") ?? [])];
      expect(inputs.length, `${key} offers the wrong number of answers`).toBe(
        QUESTIONS[key].options.length,
      );
      for (const option of QUESTIONS[key].options) {
        const input = block?.querySelector(`input[value="${option.key}"]`);
        expect(input, `${key} does not offer '${option.key}'`).not.toBeNull();
        answersSeen = answersSeen + 1;
      }
    }
    expect(answersSeen, "no answers were checked").toBeGreaterThan(15);
  });

  it("offers no free text, no upload and no place to paste code", () => {
    // Guardrail 11 in one assertion. The moment something of the reader's can be read in, this is
    // a benchmark and the numbers start being about somebody else's robot.
    expect(HTML).not.toMatch(/<textarea/);
    expect(HTML).not.toMatch(/type="file"/);
    expect(HTML).not.toMatch(/type="text"/);
    expect(HTML).not.toMatch(/contenteditable/);
  });

  it("will not run until every question has been answered", async () => {
    const page = await boot();
    const run = page.document.querySelector<HTMLButtonElement>("#run");
    expect(run?.disabled).toBe(true);
    const draft = draftFor("forecastCounterfactual");
    let remaining = QUESTION_ORDER.length;
    for (const key of QUESTION_ORDER) {
      const chosen = draft[key];
      expect(chosen).not.toBeNull();
      answer(page.document, key, chosen as string);
      remaining = remaining - 1;
      expect(run?.disabled, `the button woke up with ${remaining} still unanswered`).toBe(
        remaining > 0,
      );
    }
    expect(remaining).toBe(0);
  });

  it("counts what is left to answer without writing a digit into the sentence", async () => {
    const page = await boot();
    let counted = 0;
    for (const key of QUESTION_ORDER) {
      const partial = { ...draftFor("pairedShared") } as Record<string, string | null>;
      for (const other of QUESTION_ORDER) {
        if (other !== key) {
          continue;
        }
        partial[other] = null;
      }
      const sentence = page.progressOf(partial as unknown as MethodDraft);
      expect(/\d/.test(sentence), `"${sentence}" carries a digit`).toBe(false);
      expect(sentence).toContain("one question still to answer");
      counted = counted + 1;
    }
    expect(counted).toBe(QUESTION_ORDER.length);
  });
});

describe("the page measures the family the answers select, and never another", () => {
  it("asks the worker for exactly that family, for every family the table can reach", async () => {
    let asked = 0;
    for (const key of FAMILY_ORDER) {
      const page = await boot();
      answerAll(page.document, draftFor(key));
      click(page.document, "run");
      expect(page.asked.length, `${key}: the page never asked for a measurement`).toBe(1);
      expect(page.asked[0]?.kind).toBe("probe");
      expect(
        page.asked[0]?.family,
        `answers describing "${FAMILIES[key].name}" asked for a different family`,
      ).toBe(key);
      asked = asked + 1;
    }
    expect(asked, "no family was asked for").toBe(FAMILY_ORDER.length);
  });

  it("renders the verdict under that same family's name", async () => {
    for (const key of FAMILY_ORDER) {
      const page = await boot();
      answerAll(page.document, draftFor(key));
      click(page.document, "run");
      page.reply({ kind: "probed", probe: cheapProbe(key) });
      const verdict = page.document.querySelector(".method-verdict");
      expect(verdict, `${key}: no verdict was rendered`).not.toBeNull();
      expect(verdict?.getAttribute("data-family")).toBe(key);
      expect(verdict?.querySelector(".method-family-name")?.textContent).toBe(FAMILIES[key].name);
      expect(page.document.querySelector<HTMLElement>("#result")?.hidden).toBe(false);
    }
  });

  it("gives the family that compares nothing a different shape from the three that compare", async () => {
    const shapes = new Map<FamilyKey, string | null>();
    for (const key of FAMILY_ORDER) {
      const page = await boot();
      answerAll(page.document, draftFor(key));
      click(page.document, "run");
      page.reply({ kind: "probed", probe: cheapProbe(key) });
      const clearing = page.document.querySelector('[data-number="clearing"]');
      shapes.set(key, clearing?.getAttribute("data-second") ?? null);
      const headline = page.document.querySelector(".method-rate-number");
      if (isComparison(key)) {
        expect(headline, `${key} lost its headline count`).not.toBeNull();
      } else {
        expect(
          headline,
          "the family that detects nothing was given a rate's headline count on the page",
        ).toBeNull();
      }
    }
    expect(shapes.get("noCounterfactual")).toBe("not-a-detection");
    expect(new Set(shapes.values()).size).toBe(2);
  });

  it("takes the verdict down when an answer changes, rather than leaving it under a new description", async () => {
    const page = await boot();
    answerAll(page.document, draftFor("forecastCounterfactual"));
    click(page.document, "run");
    page.reply({ kind: "probed", probe: cheapProbe("forecastCounterfactual") });
    expect(page.document.querySelector(".method-verdict")).not.toBeNull();
    answer(page.document, "controlRun", "twin");
    expect(
      page.document.querySelector(".method-verdict"),
      "a family's numbers were left on screen under a description that no longer selects it",
    ).toBeNull();
    expect(page.document.querySelector<HTMLElement>("#result")?.hidden).toBe(true);
  });

  it("shows how far along it is while it runs, and says which room it is on", async () => {
    const page = await boot();
    answerAll(page.document, draftFor("pairedShared"));
    click(page.document, "run");
    page.reply({ kind: "progress", seedsDone: 3, seedsTotal: 8, phase: "running a room" });
    const status = page.document.querySelector("#status");
    expect([...status?.querySelectorAll(".status-count") ?? []].map((n) => n.textContent)).toEqual([
      "3",
      "8",
    ]);
    expect(status?.textContent).toContain("running a room");
  });

  it("says what went wrong in the worker's own words, never a substituted apology", async () => {
    const page = await boot();
    answerAll(page.document, draftFor("pairedShared"));
    click(page.document, "run");
    page.reply({ kind: "failed", message: "the room ran out of room" });
    expect(page.document.querySelector("#status")?.textContent).toContain("the room ran out of room");
    // And the questionnaire comes back, rather than the page being left switched off.
    expect(page.document.querySelector<HTMLInputElement>(".method-question input")?.disabled).toBe(
      false,
    );
  });
});

describe("the link carries the five answers and nothing that was measured", () => {
  it("opens at the answers a link names", async () => {
    const draft = draftFor("noCounterfactual");
    const query = QUESTION_ORDER.map((key) => `${QUESTIONS[key].queryKey}=${draft[key] ?? ""}`).join(
      "&",
    );
    const page = await boot(`?${query}`);
    for (const key of QUESTION_ORDER) {
      const checked = page.document.querySelector<HTMLInputElement>(
        `.method-question[data-question="${key}"] input:checked`,
      );
      expect(checked?.value, `the link's answer to '${key}' was dropped`).toBe(draft[key]);
    }
    expect(page.document.querySelector<HTMLButtonElement>("#run")?.disabled).toBe(false);
  });

  it("says out loud when a link names an answer it does not have", async () => {
    const page = await boot("?control=sideways");
    const notices = page.document.querySelector("#link-notices");
    expect(notices?.hasAttribute("hidden")).toBe(false);
    expect(notices?.textContent).toContain("does not offer");
    expect(page.document.querySelector<HTMLButtonElement>("#run")?.disabled).toBe(true);
  });

  it("shows no notice on an ordinary visit", async () => {
    const page = await boot();
    expect(page.document.querySelector("#link-notices")?.hasAttribute("hidden")).toBe(true);
  });

  it("carries no measured value in its markup or its query keys", () => {
    // Guardrail 10: a permalink carries the recipe, never the answer. A query key spelled for a
    // reading would be a measurement quoted with the new page's authority.
    for (const key of QUESTION_ORDER) {
      expect(QUESTIONS[key].queryKey).not.toMatch(/read|clear|band|effect|result/);
    }
  });
});
