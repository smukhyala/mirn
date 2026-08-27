import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AXIS_QUERY_KEY, decodeDrill } from "../permalink.js";
import { DISCLOSURE_CLAUSES, INVENTED_CROWD_DISCLOSURE } from "../csv.js";
import { CARD_ORDER, DRILL_CARDS } from "../../../engine/job/cards.js";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";

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
  readonly window: Window;
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
    window: dom.window as unknown as Window,
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

    // The count itself, which the title of this test claims and nothing here used to check: the
    // capture group above was read and thrown away, so a verdict saying "you called nine of the
    // eight cards wrong" passed. Right plus wrong plus declined is every call made, and the walk
    // made eight.
    const counted = /(\d+) matched what the room did, (\d+) did not, and on (\d+) you said/.exec(
      tallyLine,
    );
    expect(counted, "the running score never says how the calls split").not.toBeNull();
    const right = Number(counted?.[1]);
    const missed = Number(counted?.[2]);
    const declined = Number(counted?.[3]);
    expect(right + missed + declined, "the three buckets do not add up to the calls made").toBe(
      CARD_ORDER.length,
    );
    expect(declined, "the two scripted declines were not counted as declines").toBe(2);
    // And the verdict's own wrong-count is the same number the running score reports, spelled as a
    // word. Two renderings of one tally that could drift apart, and now cannot.
    const WORDS: readonly string[] = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight"];
    expect(wrong?.[1], "the verdict and the running score disagree on how many missed").toBe(
      WORDS[missed],
    );
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
    const host = walked.document.querySelector("#verdict");
    expect(host).not.toBeNull();
    const offenders: string[] = [];
    if (host !== null) {
      for (const chunk of textChunks(host)) {
        const found = CODE_IDENTIFIER.exec(chunk);
        if (found !== null) {
          offenders.push(found[0]);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * The two ways a finished drill leaves the page.
 *
 * Both were built, tested at unit level and reachable by nobody: `encodeDrill` and `toDrillCsv`
 * had no caller in any shipped page, while the spec's verdict screen asks for both. A unit test of
 * an encoder passes forever against a page with no button, which is why these assertions are made
 * against the buttons a reader can actually press.
 */
describe("the verdict hands the drill back to the reader", () => {
  let walked: Walked;

  beforeAll(async () => {
    walked = await walkTheDrill();
  }, 60000);

  it("offers both controls the verdict is supposed to offer", () => {
    expect(
      walked.document.querySelector("#drill-copy-link"),
      "a finished drill cannot be shared",
    ).not.toBeNull();
    expect(
      walked.document.querySelector("#drill-export-csv"),
      "a finished drill cannot be exported",
    ).not.toBeNull();
  });

  it("copies a link carrying the cards and never the calls, the score or a measurement", () => {
    walked.document.querySelector<HTMLButtonElement>("#drill-copy-link")?.click();
    const query = walked.window.location.search;

    // The payload: every card, in the order it was called, and reachable again.
    const decoded = decodeDrill(query);
    expect(decoded.cards).toEqual(CARD_ORDER);
    expect(decoded.notices).toEqual([]);

    // What must never be in it. The state behind this link holds a call, an honest answer and a
    // correct flag per card, and the scripted walk got some of them wrong — so a leak here would
    // be a real leak and not a hypothetical one.
    expect(query).not.toMatch(/wrong|right|score|correct|called|bigger|smaller|cannot/i);
    // Guardrail 10 again: no measured value. A metre in a link quotes an old build's answer with
    // the next build's authority.
    expect(query).not.toMatch(/\d+\.\d/);
    // One key, and it is the cards.
    expect([...new URLSearchParams(query.slice(1)).keys()]).toEqual(["cards"]);
  });

  it("exports a file that says the crowd is invented before it says anything else", () => {
    // The data URI branch of `downloadCsv`, taken deliberately: the object-URL branch hands back an
    // opaque handle whose text cannot be read back in this environment, and the text is the whole
    // of what is asserted here. Which branch a browser takes changes nothing about the bytes.
    const url = (globalThis as unknown as { URL: { createObjectURL?: unknown } }).URL;
    const saved = url.createObjectURL;
    delete url.createObjectURL;

    let href = "";
    let filename = "";
    const catchDownload = (event: Event): void => {
      const target = event.target as HTMLAnchorElement;
      href = target.getAttribute("href") ?? "";
      filename = target.getAttribute("download") ?? "";
      event.preventDefault();
    };
    walked.document.addEventListener("click", catchDownload, true);
    try {
      walked.document.querySelector<HTMLButtonElement>("#drill-export-csv")?.click();
    } finally {
      walked.document.removeEventListener("click", catchDownload, true);
      if (saved !== undefined) {
        url.createObjectURL = saved;
      }
    }

    expect(filename, "the export produced no file").toMatch(/\.csv$/);
    expect(href.startsWith("data:text/csv")).toBe(true);
    const text = decodeURIComponent(href.slice(href.indexOf(",") + 1));
    const lines = text.split("\n");

    // Guardrail 1, in the form that matters most: a file outlives the page it came from.
    expect(lines[0]).toBe(`# ${INVENTED_CROWD_DISCLOSURE}`);
    for (const clause of DISCLOSURE_CLAUSES) {
      expect(lines[0], `the export's first line drops "${clause}"`).toContain(clause);
    }
    // One row per card called. The header block is every `#` line plus the first line after it,
    // which is the column row — found rather than spelled out, so a renamed column does not turn
    // this into a count that is quietly one too many.
    const body: string[] = [];
    for (const line of lines) {
      if (line.length === 0 || line.startsWith("#")) {
        continue;
      }
      body.push(line);
    }
    expect(body[0], "the export has no column row").toContain("Card");
    const rows = body.slice(1);
    expect(rows.length, "the export carries a different number of rows from cards called").toBe(
      CARD_ORDER.length,
    );
    // Every card by its reader-facing name, not its key.
    for (const key of CARD_ORDER) {
      expect(text, `${key} is missing from the export`).toContain(DRILL_CARDS[key].name);
      expect(text, `${key} reached the export as a code identifier`).not.toContain(`"${key}"`);
    }
  });
});
