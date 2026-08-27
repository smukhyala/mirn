import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CARD_ORDER, DRILL_CARDS } from "../../../engine/job/cards.js";
import { COLUMNS, COLUMN_ORDER, type ColumnKey } from "../../../engine/job/columns.js";
import type { ArenaView } from "../../../ui/arena.js";
import { answer, makeDrillState, reveal, type DrillCall, type DrillState } from "../drill.js";
import type { VerdictLine } from "../../../drill.js";
import { DISCLOSURE_CLAUSES } from "../csv.js";
import { BAND_NOT_MEASURED, BAND_WITHHELD } from "../tile.js";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";

/**
 * The drill's card, booted from its real HTML with its real module.
 *
 * The property under test is the product's safety property: no number that needs the run WITHOUT
 * the robot may reach a card, because a card carrying one has handed the reader the answer to the
 * question it is about to ask them.
 *
 * Every assertion below that touches that property is derived from `corridorReadable` on the
 * column catalogue rather than from a list written here. A list written here would pass forever
 * against a column added later and forgotten, which is precisely the failure it exists to catch —
 * and the flag itself is not an opinion: `unpaired.test.ts` proves each value by swapping the
 * control arm for a decoy and failing any column that claims to need no control run and then
 * notices.
 *
 * The document-order assertion runs against the FILE rather than the booted DOM, for the same
 * reason its sibling in disclosure.test.ts does: a script can move a paragraph after load, and what
 * guardrail 1 defends is the order a reader with no JavaScript, a screen reader or a print
 * stylesheet actually gets.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const HTML = readFileSync(join(ROOT, "drill.html"), "utf8");
const FLAT = HTML.replace(/\s+/g, " ");

interface Booted {
  readonly document: Document;
  readonly view: ArenaView;
  /** The view the canvas was LAST drawn from, read fresh. The reveal's own property is a
   *  statement about two readings of this, taken either side of a click. */
  readonly viewNow: () => ArenaView;
  /**
   * Runs the page's own animation frame at a wall-clock reading of this test's choosing.
   *
   * Without this there is no playback in jsdom at all: `requestAnimationFrame` never fires, the
   * frame index never leaves zero, and every statement about "the frame the reader was looking at"
   * is a statement about frame zero — which is the same before and after any click, under every
   * possible implementation. The reveal's freeze was asserted that way once and could not fail.
   */
  readonly step: (nowMs: number) => void;
}

/** The card's own column set, read back off the module rather than restated here. */
let cardColumns: readonly ColumnKey[] = [];

/**
 * The verdict's wording, read back off the module the same way.
 *
 * The page's own module is a top-level script — importing it boots a card — so there is no way to
 * reach this without a DOM. Reading it off the booted module rather than importing it separately
 * keeps that honest and costs one boot, not eight simulations per branch.
 */
let verdictLines: (state: DrillState, misleadingCards: readonly boolean[]) => readonly VerdictLine[] =
  () => [];

async function bootDrill(search = ""): Promise<Booted> {
  const dom = new JSDOM(HTML, {
    pretendToBeVisual: true,
    url: `https://example.test/drill${search}`,
  });

  // jsdom has no canvas, so `getContext` returns null and the page's own guard would throw before
  // anything mounted. A proxy that accepts every call and records none is enough: what is asserted
  // here is the view handed to the renderer and the markup around it, and arena.test.ts already
  // covers the drawing itself.
  const stub = new Proxy({}, { get: () => (): void => {}, set: () => true });
  const prototype = dom.window.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown };
  prototype.getContext = (): unknown => stub;

  const globals = globalThis as unknown as Record<string, unknown>;
  globals["window"] = dom.window;
  globals["document"] = dom.window.document;
  globals["HTMLElement"] = dom.window.HTMLElement;
  globals["getComputedStyle"] = dom.window.getComputedStyle.bind(dom.window);
  // Capturing rather than inert. The page re-registers itself at the end of every frame, so
  // holding the latest callback is enough to drive playback forward one frame per `step`, and
  // nothing runs unless a test asks for it.
  let pending: ((nowMs: number) => void) | null = null;
  globals["requestAnimationFrame"] = (callback: (nowMs: number) => void): number => {
    pending = callback;
    return 0;
  };

  vi.resetModules();
  const module = (await import("../../../drill.js")) as {
    arenaViewNow: () => ArenaView | null;
    CARD_COLUMNS: readonly ColumnKey[];
    verdictLines: (state: DrillState, misleadingCards: readonly boolean[]) => readonly VerdictLine[];
  };
  cardColumns = module.CARD_COLUMNS;
  verdictLines = module.verdictLines;
  const viewNow = (): ArenaView => {
    const drawn = module.arenaViewNow();
    if (drawn === null) {
      throw new Error("the drill has not drawn the arena");
    }
    return drawn;
  };
  const view = viewNow();
  const step = (nowMs: number): void => {
    const callback = pending;
    if (callback === null) {
      throw new Error("the drill asked for no animation frame, so playback cannot be advanced");
    }
    pending = null;
    callback(nowMs);
  };
  return { document: dom.window.document, view, viewNow, step };
}

/** Clicks a button by id and fails loudly if the page has no such button, rather than doing
 *  nothing and letting every assertion below describe the card that never moved. */
function click(document: Document, id: string): void {
  const button = document.querySelector<HTMLButtonElement>(`#${id}`);
  if (button === null) {
    throw new Error(`the drill has no #${id} to click`);
  }
  button.click();
}

/**
 * Every run of text on the page, one chunk per text node.
 *
 * Not `body.textContent`. That joins adjacent elements with nothing between them, so the key's
 * "…with the robot" and the next item's "The robot" concatenate into "robotThe" and a
 * camel-case scan reports a code identifier that no reader can see. A code identifier lives inside
 * one text node, so scanning them one at a time is both stricter and free of that artefact.
 */
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

function labelsIn(document: Document, selector: string): readonly string[] {
  const found: string[] = [];
  for (const node of document.querySelectorAll(selector)) {
    found.push(node.textContent ?? "");
  }
  return found;
}

describe("the drill's card is the page the build ships", () => {
  it("is tracked by git, so a clean checkout has one", () => {
    const run = (): string =>
      execFileSync("git", ["ls-files", "--error-unmatch", "web/drill.html"], { encoding: "utf8" });
    expect(run).not.toThrow();
    expect(run().trim()).toBe("web/drill.html");
  });

  it("links one stylesheet, which is the console's own", () => {
    const links = HTML.match(/<link[^>]+rel="stylesheet"[^>]*>/g) ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]).toContain("console.css");
  });

  it("boots from its own top-level script", () => {
    expect(HTML).toContain('<script type="module" src="./drill.ts"></script>');
  });
});

describe("the invented-crowd disclosure comes first here too", () => {
  it("shows the invented-crowd disclosure before any number", () => {
    const disclosure = HTML.indexOf('id="disclosure"');
    expect(disclosure).toBeGreaterThan(-1);
    for (const anchor of ['id="arena"', 'id="readouts"', 'id="call"']) {
      const at = HTML.indexOf(anchor);
      expect(at, `${anchor} is missing from web/drill.html`).toBeGreaterThan(-1);
      expect(disclosure, `${anchor} precedes the disclosure`).toBeLessThan(at);
    }
  });

  it("carries every clause the CSV carries", () => {
    for (const clause of DISCLOSURE_CLAUSES) {
      expect(FLAT).toContain(clause);
    }
  });

  it("ships no measurement in its own markup, so nothing can be read before it is run", () => {
    const literal = /\d+\.\d+\s*(m|s)\b/.exec(FLAT);
    expect(literal).toBeNull();
  });
});

describe("the card shows only what a corridor could give you", () => {
  let document: Document;

  beforeAll(async () => {
    document = (await bootDrill()).document;
  });

  it("shows no paired readout before the reveal", () => {
    const shown = labelsIn(document, "#readouts .tile:not(.tile-withheld) .tile-label");
    const withheld = labelsIn(document, "#readouts .tile-withheld .tile-label");
    // Proved from the catalogue rather than a hardcoded list, so a new paired column cannot leak in.
    for (const key of COLUMN_ORDER) {
      if (COLUMNS[key].corridorReadable) {
        continue;
      }
      const label = COLUMNS[key].label;
      expect(
        shown.includes(label) && !withheld.includes(label),
        `${key} is a paired readout and is on the card`,
      ).toBe(false);
    }
  });

  it("puts every readout the card carries on the page, in one form or the other", () => {
    // The assertion that makes the one above bite. A card that DROPPED its paired readouts rather
    // than withholding them would pass every "nothing paired is shown" check, because nothing shown
    // is nothing leaked — and the reader would lose the shape of what is missing, which is the only
    // thing on the card teaching them what to ask for.
    const shown = labelsIn(document, "#readouts .tile:not(.tile-withheld) .tile-label");
    const withheld = labelsIn(document, "#readouts .tile-withheld .tile-label");
    expect(cardColumns.length).toBeGreaterThan(0);
    for (const key of cardColumns) {
      const label = COLUMNS[key].label;
      if (COLUMNS[key].corridorReadable) {
        expect(shown, `${key} is readable from one crossing and is not shown`).toContain(label);
        expect(withheld, `${key} is readable from one crossing and is withheld`).not.toContain(label);
        continue;
      }
      expect(withheld, `${key} needs the second run and is not withheld on the card`).toContain(label);
      expect(shown, `${key} needs the second run and is shown on the card`).not.toContain(label);
    }
  });

  it("puts a number in every readout it does show", () => {
    const tiles = document.querySelectorAll("#readouts .tile:not(.tile-withheld)");
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      const key = tile.getAttribute("data-column") ?? "";
      expect(COLUMNS[key as keyof typeof COLUMNS].corridorReadable, `${key} is not readable`).toBe(
        true,
      );
      expect(tile.querySelector(".tile-number")?.textContent ?? "", `${key} shows no value`).toMatch(
        /\d/,
      );
    }
  });

  it("gives every shown number something to be judged against", () => {
    // Guardrail 6, at the tile rather than at the return type. Withholding a value is allowed;
    // showing one with no word about its zero is not, so every shown tile carries the zero row and
    // the row carries a sentence.
    const tiles = document.querySelectorAll("#readouts .tile:not(.tile-withheld)");
    // A card that showed no number at all would satisfy every assertion in this loop by having no
    // iterations. Its sibling above carries the same guard for the same reason.
    expect(tiles.length, "the card shows no numbers, so this checked nothing").toBeGreaterThan(0);
    for (const tile of tiles) {
      const key = tile.getAttribute("data-column") ?? "";
      const zero = tile.querySelector(".tile-zero");
      expect(zero, `${key} shows a number with no zero row`).not.toBeNull();
      expect(zero?.closest("details"), `${key} hides its zero behind a disclosure`).toBeNull();
      const how = tile.querySelector(".tile-zero-how")?.textContent ?? "";
      expect(how.length, `${key} says nothing about what zero would read`).toBeGreaterThan(0);
    }
  });

  it("withholds the zero of any number whose zero needs the second run", () => {
    // The forecaster's reading is the case that exists today: readable from one crossing, but the
    // number it would read if the robot had changed nothing is not. Derived, so a second such
    // column added later is covered without this test being edited.
    //
    // Counted, because "derived" and "vacuous" look identical from here: today exactly one column
    // in the catalogue meets both conditions, and flipping either flag on that one column would
    // leave this test green having examined nothing. The same hole was found and closed in
    // unpaired.test.ts on this branch.
    let examined = 0;
    for (const key of COLUMN_ORDER) {
      const descriptor = COLUMNS[key];
      if (!descriptor.corridorReadable || descriptor.zero.kind !== "companionColumn") {
        continue;
      }
      if (COLUMNS[descriptor.zero.column].corridorReadable) {
        continue;
      }
      examined = examined + 1;
      const tile = document.querySelector(`#readouts [data-column="${key}"]`);
      expect(tile, `${key} is missing from the card`).not.toBeNull();
      expect(
        tile?.querySelector(".tile-zero-value"),
        `${key} prints a zero its card is supposed to be withholding`,
      ).toBeNull();
      expect(tile?.querySelector(".tile-zero-how")?.textContent ?? "").toContain("withheld");
    }
    expect(
      examined,
      "no column is corridor-readable with a companion zero that is not, so this proved nothing",
    ).toBeGreaterThan(0);
  });

  it("says the ordinary difference between two runs is withheld, not unmeasured", () => {
    // "not yet measured — press Run" would be false: there is no Run on this page, and the runs
    // that measure the band have no robot in them, which is the answer.
    const captions = document.querySelectorAll("#readouts .gauge-caption");
    expect(captions.length).toBeGreaterThan(0);
    for (const caption of captions) {
      expect(caption.textContent).toBe(BAND_WITHHELD);
      expect(caption.textContent).not.toBe(BAND_NOT_MEASURED);
    }
  });

  it("names the card it is showing, and where that card sits in the drill", () => {
    const first = CARD_ORDER[0] as keyof typeof DRILL_CARDS;
    expect(document.querySelector("#card-name")?.textContent).toBe(DRILL_CARDS[first].name);
    const progress = document.querySelector("#card-progress")?.textContent ?? "";
    // The whole line, not `toContain`. "Card 8 of 8" rendered on card one contains the catalogue's
    // length and would have passed — and a reader who is told they are on the last card when they
    // are on the first has been told something false about the only progress they can see.
    expect(progress).toBe(`Card 1 of ${String(CARD_ORDER.length)}`);
  });

  it("puts no bare code identifier in front of a reader", () => {
    const offenders: string[] = [];
    for (const chunk of textChunks(document.body)) {
      const found = CODE_IDENTIFIER.exec(chunk);
      if (found !== null) {
        offenders.push(found[0]);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the arena withholds the second run, and the key says only what is drawn", () => {
  let booted: Booted;

  beforeAll(async () => {
    booted = await bootDrill();
  });

  it("draws no control mark on the arena before the reveal", () => {
    expect(booted.view.showControl).toBe(false);
    expect(booted.view.showGaps).toBe(false);
  });

  it("still draws the run with the robot in it, and the robot", () => {
    expect(booted.view.treated.length).toBeGreaterThan(0);
    expect(booted.view.robot).not.toBeNull();
  });

  it("lists only the marks it actually draws", () => {
    const marks: string[] = [];
    for (const node of booted.document.querySelectorAll(".arena-key .key-mark")) {
      marks.push(node.getAttribute("class") ?? "");
    }
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.join(" ")).not.toContain("key-control");
    expect(marks.join(" ")).not.toContain("key-gap");
    expect(marks.join(" ")).toContain("key-treated");
    expect(marks.join(" ")).toContain("key-robot");
  });

  it("keeps the key and the view in step, mark by mark", () => {
    // The one that would catch a key gaining an entry the canvas stopped drawing: the two halves
    // are checked against each other rather than against a fixed list of names.
    const marks: string[] = [];
    for (const node of booted.document.querySelectorAll(".arena-key .key-mark")) {
      marks.push(node.getAttribute("class") ?? "");
    }
    const has = (name: string): boolean => marks.some((mark) => mark.includes(name));
    expect(has("key-control")).toBe(booted.view.showControl);
    expect(has("key-path-control")).toBe(booted.view.showControl);
    expect(has("key-gap")).toBe(booted.view.showGaps);
    expect(has("key-robot")).toBe(booted.view.robot !== null);
  });
});

describe("the three buttons take one call and no more", () => {
  it("records the reader's call and then locks", async () => {
    const { document } = await bootDrill();
    const buttons = ["call-bigger", "call-smaller", "call-cannot-tell"];
    for (const id of buttons) {
      expect(document.querySelector<HTMLButtonElement>(`#${id}`)?.disabled).toBe(false);
    }
    expect(document.querySelector("#call-status")?.textContent).toBe("");

    document.querySelector<HTMLButtonElement>("#call-bigger")?.click();

    const status = document.querySelector("#call-status")?.textContent ?? "";
    expect(status.length).toBeGreaterThan(0);
    for (const id of buttons) {
      // `answer` throws on a second call against the same card; leaving the buttons live would
      // turn that contract into an uncaught error in front of a reader.
      expect(
        document.querySelector<HTMLButtonElement>(`#${id}`)?.disabled,
        `${id} still takes a second call`,
      ).toBe(true);
    }
  });

  it("says nothing about the answer, only about the call", async () => {
    const { document } = await bootDrill();
    document.querySelector<HTMLButtonElement>("#call-smaller")?.click();
    const status = document.querySelector("#call-status")?.textContent ?? "";
    // The truth lives behind the reveal, which is a later screen. A status line quoting a number
    // here would be the answer, printed by the one element that is meant to be the reader's own.
    expect(status).not.toMatch(/\d/);
  });
});

/**
 * The reveal.
 *
 * One boot, one call, and every assertion about what arrived. Booting once matters for more than
 * speed: the properties below are about ONE card before and after ONE click, and a fresh boot per
 * assertion would compare two different rooms and prove nothing about either.
 */
describe("the reveal shows the second run, on the instant the reader was looking at", () => {
  let document: Document;
  let before: ArenaView;
  let after: ArenaView;

  beforeAll(async () => {
    const booted = await bootDrill();
    document = booted.document;

    // Playback is run forward off frame zero BEFORE the call, and forward again after it.
    //
    // Both halves are load-bearing, and the version of this test that had neither could not fail:
    // `requestAnimationFrame` never fires in jsdom on its own, so `sample` never left 0 and the
    // assertion below compared 0 to 0 under every possible implementation — including one that
    // unfroze playback and reset the frame, which was mutation-tested green. The frame clock is
    // absolute (web/app/clock.ts): at the drill's own base of 50 ms a frame and rate 1, a wall
    // reading of `50 * n` is frame `n`, so both readings are chosen off the view's own sample
    // count rather than written here as numbers.
    const nSamples = booted.viewNow().nSamples;
    const midFrame = Math.floor(nSamples / 2);
    booted.step(midFrame * 50);
    before = booted.viewNow();
    click(document, "call-bigger");
    // The wall clock does not stop because a reader clicked. A page that only stopped ADVANCING on
    // the click, without freezing, would redraw a later frame here.
    booted.step((midFrame + 20) * 50);
    after = booted.viewNow();
  });

  it("fades the control arm in on the same frozen frame", () => {
    expect(after.showControl).toBe(true);
    expect(after.showGaps).toBe(true);
    // The canary. Without an advanced frame this comparison is 0 against 0, and every statement
    // below it about "the instant the reader was looking at" is a statement about frame zero.
    expect(
      before.sample,
      "playback never left the first frame, so comparing the two readings proves nothing",
    ).toBeGreaterThan(0);
    // The same instant, so the reader compares like with like rather than watching it move. The
    // sample index is captured off the view BEFORE the click: there is no frozen index recorded
    // anywhere else, and a hardcoded 0 would pass against a page that redrew a different frame
    // whenever playback happened to be at the start.
    expect(after.sample).toBe(before.sample);
  });

  it("still draws the run it was already drawing", () => {
    expect(after.treated).toBe(before.treated);
    expect(after.control).toBe(before.control);
    expect(after.robot).not.toBeNull();
  });

  it("fills every withheld tile on reveal", () => {
    expect(document.querySelectorAll(".tile-withheld")).toHaveLength(0);
  });

  it("puts a number and a zero in every tile it just filled", () => {
    // Guardrail 6 at the tile, after the reveal as much as before it: a revealed number goes
    // through the ordinary tile path or it does not go up at all.
    const tiles = document.querySelectorAll("#readouts .tile");
    expect(tiles.length).toBe(cardColumns.length);
    for (const tile of tiles) {
      const key = tile.getAttribute("data-column") ?? "";
      expect(tile.querySelector(".tile-number")?.textContent ?? "", `${key} shows no value`).toMatch(
        /\d/,
      );
      const zero = tile.querySelector(".tile-zero");
      expect(zero, `${key} shows a number with no zero row`).not.toBeNull();
      expect(zero?.closest("details"), `${key} hides its zero behind a disclosure`).toBeNull();
      const how = tile.querySelector(".tile-zero-how")?.textContent ?? "";
      expect(how.length, `${key} says nothing about what zero would read`).toBeGreaterThan(0);
      expect(how, `${key} still calls its zero withheld after the reveal`).not.toContain("withheld");
    }
  });

  it("measures the ordinary difference between two runs instead of withholding it", () => {
    const captions = document.querySelectorAll("#readouts .gauge-caption");
    expect(captions.length).toBeGreaterThan(0);
    for (const caption of captions) {
      expect(caption.textContent).not.toBe(BAND_WITHHELD);
      expect(caption.textContent).not.toBe(BAND_NOT_MEASURED);
    }
  });

  it("grows the key back to every mark the arena now draws", () => {
    const marks: string[] = [];
    for (const node of document.querySelectorAll(".arena-key .key-mark")) {
      marks.push(node.getAttribute("class") ?? "");
    }
    const has = (name: string): boolean => marks.some((mark) => mark.includes(name));
    // Checked against the view rather than against the number six, which would pass just as well
    // for a key that grew the wrong two entries.
    expect(has("key-control")).toBe(after.showControl);
    expect(has("key-path-control")).toBe(after.showControl);
    expect(has("key-gap")).toBe(after.showGaps);
    expect(has("key-robot")).toBe(after.robot !== null);
    expect(marks).toHaveLength(6);
  });

  it("states the call, the truth, the ordinary difference and what the corridor number said", () => {
    const line = document.querySelector(".drill-reveal")?.textContent ?? "";
    expect(line).toMatch(/you said/i);
    expect(line).toMatch(/\d/);
    expect(line).toContain("The robot moved this crowd by");
    expect(line).toContain("Two runs of this room with nothing done to either of them differ by");
    expect(line).toContain("A forecaster watching only the run with the robot in it");
  });

  it("quotes no number the tiles above it are not also showing", () => {
    // Every figure in the reveal's own sentences is a value read back out of the run, so each one
    // has a tile a few lines up carrying its zero. A number here with no tile would be guardrail 6
    // broken by prose.
    const line = document.querySelector(".drill-reveal")?.textContent ?? "";
    const quoted = line.match(/\d+\.\d+/g) ?? [];
    expect(quoted.length).toBeGreaterThan(0);
    const onTiles: string[] = [];
    for (const node of document.querySelectorAll("#readouts .tile-number")) {
      onTiles.push(node.textContent ?? "");
    }
    for (const value of quoted) {
      expect(onTiles, `the reveal quotes ${value}, which is on no tile`).toContain(value);
    }
  });

  it("offers a way on, and takes no second call on the card just answered", () => {
    expect(document.querySelector("#next-card")).not.toBeNull();
    for (const id of ["call-bigger", "call-smaller", "call-cannot-tell"]) {
      expect(document.querySelector<HTMLButtonElement>(`#${id}`)?.disabled).toBe(true);
    }
  });

  it("puts no bare code identifier into the reveal either", () => {
    const offenders: string[] = [];
    const reveal = document.querySelector(".drill-reveal");
    expect(reveal).not.toBeNull();
    if (reveal !== null) {
      for (const chunk of textChunks(reveal)) {
        const found = CODE_IDENTIFIER.exec(chunk);
        if (found !== null) {
          offenders.push(found[0]);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the running score", () => {
  it("says it does not survive a reload, before anything has been called", async () => {
    const { document } = await bootDrill();
    // Guardrail 10: the tally is in memory and the page says so. Static markup, so a reader who
    // never runs the script is told as well.
    expect(document.body.textContent).toMatch(/reload|refresh/i);
    expect(document.querySelector("#tally")?.textContent ?? "").toContain("No cards called yet");
  });

  it("counts the call once it is made", async () => {
    const { document } = await bootDrill();
    click(document, "call-cannot-tell");
    const line = document.querySelector("#tally")?.textContent ?? "";
    expect(line).toContain("Called so far: 1 of eight");
    expect(line).toContain("on 1 you said the card could not be called");
  });
});

/**
 * The verdict's wording, on every branch a reader can land on.
 *
 * Driven from state objects rather than from eight clicks, because reaching "every one you got
 * wrong went the same way" through the page means eight simulations per branch and there are four
 * branches. The eight-click walk lives in drill-verdict.slow.test.ts and checks that this wording
 * actually reaches the page; what is checked here is that the wording is right.
 */
describe("the verdict", () => {
  let lines: (state: DrillState, misleadingCards: readonly boolean[]) => readonly VerdictLine[];

  beforeAll(async () => {
    await bootDrill();
    lines = verdictLines;
  });

  function walk(script: readonly (readonly [DrillCall, "bigger" | "smaller"])[]): DrillState {
    let state = makeDrillState();
    for (const step of script) {
      state = answer(state, step[0], step[1]);
      state = reveal(state);
    }
    return state;
  }

  function textOf(state: DrillState, misleading: readonly boolean[]): string {
    const parts: string[] = [];
    for (const entry of lines(state, misleading)) {
      parts.push(entry.text);
    }
    return parts.join(" ");
  }

  function everyCard(call: DrillCall, honest: "bigger" | "smaller"): readonly (readonly [DrillCall, "bigger" | "smaller"])[] {
    const script: (readonly [DrillCall, "bigger" | "smaller"])[] = [];
    for (let i = 0; i < CARD_ORDER.length; i++) {
      script.push([call, honest] as const);
    }
    return script;
  }

  it("carries the sentence the whole drill exists to deliver", () => {
    const text = textOf(walk(everyCard("bigger", "bigger")), []);
    expect(text).toContain(
      "On all eight the paired reading was right — not because it is a better estimator, but " +
        "because both runs shared a seed and differed only in the robot.",
    );
  });

  it("sets that sentence apart from the counting above it", () => {
    const entries = lines(walk(everyCard("bigger", "bigger")), []);
    const last = entries[entries.length - 1];
    expect(last?.className).toBe("verdict-claim");
    for (let i = 0; i < entries.length - 1; i++) {
      expect(entries[i]?.className).toBe("verdict-line");
    }
  });

  it("says how many were called wrong", () => {
    const script: (readonly [DrillCall, "bigger" | "smaller"])[] = [];
    for (let i = 0; i < CARD_ORDER.length; i++) {
      if (i < 3) {
        script.push(["bigger", "smaller"] as const);
      } else {
        script.push(["bigger", "bigger"] as const);
      }
    }
    expect(textOf(walk(script), [])).toContain("You called three of the eight cards wrong.");
  });

  it("says when every miss went the same way", () => {
    const overCalled = textOf(walk(everyCard("bigger", "smaller")), []);
    expect(overCalled).toContain("Every one you got wrong went the same way");
    expect(overCalled).toContain("by more than the ordinary difference between two runs when it had not");

    const underCalled = textOf(walk(everyCard("smaller", "bigger")), []);
    expect(underCalled).toContain("Every one you got wrong went the same way");
    expect(underCalled).toContain("when it had moved it by more");
  });

  it("says when the misses went both ways, and how many each way", () => {
    const script: (readonly [DrillCall, "bigger" | "smaller"])[] = [];
    for (let i = 0; i < CARD_ORDER.length; i++) {
      if (i < 5) {
        script.push(["bigger", "smaller"] as const);
      } else {
        script.push(["smaller", "bigger"] as const);
      }
    }
    const text = textOf(walk(script), []);
    expect(text).toContain("went both ways");
    expect(text).toContain("on 5 you said by more");
    expect(text).toContain("on 3 you said by less");
  });

  it("reports a decline on its own, neither right nor wrong", () => {
    const declined = textOf(walk(everyCard("cannot tell", "bigger")), []);
    expect(declined).toContain("On eight of them you said the card could not be called");
    expect(declined).toContain("neither right nor wrong");
    // It must never be folded into the wrong count: it is the honest answer to a card built to be
    // unanswerable from what it shows.
    expect(declined).toContain("You called none of the eight cards wrong.");

    const noneDeclined = textOf(walk(everyCard("bigger", "bigger")), []);
    expect(noneDeclined).toContain("You called every card rather than declining any of them.");
  });

  it("says there is no direction when nothing missed", () => {
    expect(textOf(walk(everyCard("bigger", "bigger")), [])).toContain(
      "There is no direction to report, because none of your calls missed.",
    );
  });

  it("counts how often the corridor number pointed the other way, and claims nothing more", () => {
    const state = walk(everyCard("bigger", "bigger"));
    const misled = [true, true, false, true, false, false, true, false];
    const text = textOf(state, misled);
    expect(text).toContain("pointed the other way from the truth on four of the eight");
    // Never "it is always wrong": guardrail 2. On this catalogue it is not, and the drill would be
    // teaching a conclusion the toy does not support if it said so.
    expect(text).toContain("It is not that it is always wrong.");
    expect(textOf(state, [])).toContain("pointed the other way from the truth on none of the eight");
  });

  it("puts no bare code identifier in any of it", () => {
    const scripts = [
      everyCard("bigger", "bigger"),
      everyCard("bigger", "smaller"),
      everyCard("smaller", "bigger"),
      everyCard("cannot tell", "bigger"),
    ];
    for (const script of scripts) {
      for (const entry of lines(walk(script), [true, false])) {
        expect(CODE_IDENTIFIER.exec(entry.text), entry.text).toBeNull();
      }
    }
  });
});

/**
 * The reading half of the drill's permalink.
 *
 * The writing half is next door in drill-verdict.slow.test.ts, where a finished drill actually has
 * a link to write. This is the half guardrail 10 calls the difference between a permalink and a
 * link that looks like one: a page that wrote a payload and then ignored it on the way back in
 * would lose it in silence, and the reader would never know the difference.
 */
describe("a link naming its cards is read back, and what it gets wrong is said out loud", () => {
  it("runs the cards the link names, in the order it names them", async () => {
    const second = CARD_ORDER[1];
    const first = CARD_ORDER[0];
    if (second === undefined || first === undefined) {
      throw new Error("the catalogue has fewer than two cards");
    }
    // Reversed, so passing cannot mean "it ignored the link and ran the catalogue".
    const { document } = await bootDrill(`?cards=${second},${first}`);
    expect(document.querySelector("#card-name")?.textContent).toBe(DRILL_CARDS[second].name);
    // And the drill is now two cards long, from the link rather than from the catalogue.
    expect(document.querySelector("#card-progress")?.textContent).toBe("Card 1 of 2");
  });

  it("falls back to the whole catalogue when the link names no cards", async () => {
    const first = CARD_ORDER[0];
    if (first === undefined) {
      throw new Error("the catalogue has no cards");
    }
    const { document } = await bootDrill();
    expect(document.querySelector("#card-name")?.textContent).toBe(DRILL_CARDS[first].name);
    expect(document.querySelector("#card-progress")?.textContent).toBe(
      `Card 1 of ${String(CARD_ORDER.length)}`,
    );
  });

  it("says nothing about the link when the link asked for nothing it could not have", async () => {
    const { document } = await bootDrill();
    const host = document.querySelector<HTMLElement>("#link-notices");
    expect(host, "the page has nowhere to say what a link got wrong").not.toBeNull();
    expect(host?.hidden).toBe(true);
    expect(host?.textContent ?? "").toBe("");
  });

  it("names what a hand-edited link asked for and could not have, above the card", async () => {
    const first = CARD_ORDER[0];
    if (first === undefined) {
      throw new Error("the catalogue has no cards");
    }
    const { document } = await bootDrill(`?cards=${first},a-card-that-was-never-written`);
    const host = document.querySelector<HTMLElement>("#link-notices");
    expect(host?.hidden).toBe(false);
    const said = host?.textContent ?? "";
    expect(said).toContain("a-card-that-was-never-written");
    // Said above the card, not below it: a reader who has already called a card cannot un-call it.
    const stage = document.querySelector("#stage");
    const notices = document.querySelector("#link-notices");
    const readouts = document.querySelector("#readouts");
    if (notices === null || readouts === null || stage === null) {
      throw new Error("the card is missing the notice host, the readouts or the stage");
    }
    expect(stage.contains(notices)).toBe(true);
    // DOCUMENT_POSITION_FOLLOWING is 4: the readouts come after the correction, in document order.
    expect(
      notices.compareDocumentPosition(readouts) & 4,
      "the correction arrives after the numbers it is about",
    ).toBeGreaterThan(0);
    // The one card it could have still runs, rather than the whole thing failing over a typo.
    expect(document.querySelector("#card-name")?.textContent).toBe(DRILL_CARDS[first].name);
  });
});
