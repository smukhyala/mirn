import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AXIS_QUERY_KEY } from "../permalink.js";
import { CARD_ORDER, DRILL_CARDS } from "../../../engine/job/cards.js";

/**
 * The whole drill, eight cards, driven the way a reader drives it.
 *
 * Slow on purpose and slow irreducibly: each card is one paired run to draw it and nine more to
 * reveal it — eight replicates for the ordinary difference between two runs, one for the
 * forecaster's own zero. About seven seconds for the walk, which is why it is `.slow` and why
 * every wording branch of the verdict is checked from state objects next door in drill-dom.test.ts
 * instead of by walking it four more times.
 *
 * What only this file can check is that the two halves are wired to each other: that eight calls
 * really do end in a verdict, that the verdict counts the calls that were actually made, and that
 * the link out of it goes to the console at the last card's own settings. A state-level test of
 * `verdictLines` would pass forever against a page that never rendered it.
 *
 * The script below is deliberately not "answer everything the same way". It lands at least one
 * call on each side, at least one miss in each direction and two declines, so the verdict it
 * produces exercises the branches a reader is most likely to reach.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const HTML = readFileSync(join(ROOT, "drill.html"), "utf8");

const BUTTON: Readonly<Record<string, string>> = Object.freeze({
  bigger: "call-bigger",
  smaller: "call-smaller",
  decline: "call-cannot-tell",
});

/**
 * One answer per card, in order.
 *
 * Which of these turn out right depends on what the rooms do, and this file deliberately does not
 * say — the honest call is measured at the reveal, and `cards.slow.test.ts` is where the measured
 * table lives. What is asserted here is that the counts the verdict prints add up to the eight
 * calls made, whatever the rooms did.
 */
const SCRIPT: readonly string[] = Object.freeze([
  "bigger",
  "bigger",
  "smaller",
  "decline",
  "smaller",
  "bigger",
  "bigger",
  "decline",
]);

/** Every run of text under a node, one chunk per text node. See its use below for why not
 *  `textContent`. */
function textChunks(root: Node): readonly string[] {
  const chunks: string[] = [];
  for (const child of root.childNodes) {
    if (child.nodeType === 3) {
      chunks.push(child.textContent ?? "");
      continue;
    }
    for (const nested of textChunks(child)) {
      chunks.push(nested);
    }
  }
  return chunks;
}

interface Walked {
  readonly document: Document;
  readonly verdict: string;
  readonly link: string;
}

async function walkTheDrill(): Promise<Walked> {
  const dom = new JSDOM(HTML, { pretendToBeVisual: true, url: "https://example.test/drill" });

  // jsdom has no canvas, so `getContext` returns null and the page's own guard would throw before
  // anything mounted. A proxy that accepts every call and records none is enough here: nothing in
  // this file asserts on pixels.
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
  await import("../../../drill.js");
  const document = dom.window.document;

  for (let card = 0; card < CARD_ORDER.length; card++) {
    const answer = SCRIPT[card];
    if (answer === undefined) {
      throw new Error("the script is shorter than the catalogue it is meant to walk");
    }
    const id = BUTTON[answer];
    if (id === undefined) {
      throw new Error(`the script names an answer the card has no button for: ${answer}`);
    }
    // Each card must be the one the catalogue says it is, or the walk has skipped or repeated one
    // and every count below would be describing a different drill.
    const key = CARD_ORDER[card];
    if (key === undefined) {
      throw new Error("the catalogue ran out of cards mid-walk");
    }
    expect(document.querySelector("#card-name")?.textContent).toBe(DRILL_CARDS[key].name);

    const call = document.querySelector<HTMLButtonElement>(`#${id}`);
    expect(call, `card ${String(card + 1)} has no ${id}`).not.toBeNull();
    call?.click();

    const next = document.querySelector<HTMLButtonElement>("#next-card");
    expect(next, `card ${String(card + 1)} revealed without a way on`).not.toBeNull();
    next?.click();
  }

  const verdictHost = document.querySelector<HTMLElement>("#verdict");
  if (verdictHost === null) {
    throw new Error("the page has no verdict to reach");
  }
  const anchor = verdictHost.querySelector("a");
  return {
    document,
    verdict: verdictHost.textContent ?? "",
    link: anchor?.getAttribute("href") ?? "",
  };
}

describe("eight calls end in a verdict", () => {
  let walked: Walked;

  beforeAll(async () => {
    walked = await walkTheDrill();
  }, 60000);

  it("puts the verdict on the page and takes the card away", () => {
    expect(walked.document.querySelector<HTMLElement>("#verdict")?.hidden).toBe(false);
    // The card screen goes: the verdict is about all eight, and leaving the last one's readouts
    // under it would invite reading the verdict as a statement about that room.
    expect(walked.document.querySelector<HTMLElement>("#stage")?.hidden).toBe(true);
  });

  it("delivers the sentence the drill exists to deliver", () => {
    expect(walked.verdict).toContain(
      "On all eight the paired reading was right — not because it is a better estimator, but " +
        "because both runs shared a seed and differed only in the robot.",
    );
  });

  it("counts the eight calls that were actually made", () => {
    // Two declines are scripted, and a decline is never right and never wrong.
    expect(walked.verdict).toContain("On two of them you said the card could not be called");
    const wrong = /You called (\w+) of the eight cards wrong\./.exec(walked.verdict);
    expect(wrong, "the verdict never says how many were called wrong").not.toBeNull();

    const tallyLine = walked.document.querySelector("#tally")?.textContent ?? "";
    expect(tallyLine).toContain("Called so far: 8 of eight");
    expect(tallyLine).toContain("on 2 you said the card could not be called");
  });

  it("says how often the corridor number pointed the other way", () => {
    expect(walked.verdict).toMatch(/pointed the other way from the truth on \w+ of the eight/);
  });

  it("offers the console at the last card's own settings, and carries no result in the link", () => {
    const last = CARD_ORDER[CARD_ORDER.length - 1];
    if (last === undefined) {
      throw new Error("the catalogue has no last card");
    }
    const card = DRILL_CARDS[last];
    expect(walked.link.startsWith("./index.html?")).toBe(true);
    const query = new URLSearchParams(walked.link.slice(walked.link.indexOf("?") + 1));
    for (const [axisKey, value] of Object.entries(card.settings)) {
      const name = AXIS_QUERY_KEY[axisKey as keyof typeof AXIS_QUERY_KEY];
      expect(name, `${axisKey} has no query key`).toBeDefined();
      expect(Number(query.get(name)), `${axisKey} did not reach the link`).toBe(value);
    }
    // The ruler the card was measured at, in the seconds a slider reads, and on the grid: sixty
    // ticks of 0.05 s is 3.0000000000000004 if it is multiplied and not rounded.
    expect(query.get("horizon")).toBe("3");
    expect(query.get("window_end")).toBe("10");
    // Guardrail 10: the link carries the recipe and never the answer. A metre value in it would
    // quote this build's number with the next build's authority.
    expect(walked.link).not.toMatch(/\d+\.\d{3}/);
  });

  it("says the invitation in words, not in query keys", () => {
    expect(walked.verdict).toContain(
      "Now open the settings and try to build a card that fools it worse",
    );
    // Scanned one text node at a time, not over `textContent`. That joins adjacent elements with
    // nothing between them, so the heading's "The verdict" and the first line's "You called"
    // concatenate into "verdictYou" and a camel-case scan reports an identifier no reader can see.
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    const host = walked.document.querySelector("#verdict");
    expect(host).not.toBeNull();
    const offenders: string[] = [];
    if (host !== null) {
      for (const chunk of textChunks(host)) {
        const found = identifier.exec(chunk);
        if (found !== null) {
          offenders.push(found[0]);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
