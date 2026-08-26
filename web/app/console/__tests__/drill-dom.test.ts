import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CARD_ORDER, DRILL_CARDS } from "../../../engine/job/cards.js";
import { COLUMNS, COLUMN_ORDER, type ColumnKey } from "../../../engine/job/columns.js";
import type { ArenaView } from "../../../ui/arena.js";
import { DISCLOSURE_CLAUSES } from "../csv.js";
import { BAND_NOT_MEASURED, BAND_WITHHELD } from "../tile.js";

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
}

/** The card's own column set, read back off the module rather than restated here. */
let cardColumns: readonly ColumnKey[] = [];

async function bootDrill(): Promise<Booted> {
  const dom = new JSDOM(HTML, { pretendToBeVisual: true, url: "https://example.test/drill" });

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
  globals["requestAnimationFrame"] = (): number => 0;

  vi.resetModules();
  const module = (await import("../../../drill.js")) as {
    arenaViewNow: () => ArenaView | null;
    CARD_COLUMNS: readonly ColumnKey[];
  };
  cardColumns = module.CARD_COLUMNS;
  const view = module.arenaViewNow();
  if (view === null) {
    throw new Error("the drill booted without drawing the arena once");
  }
  return { document: dom.window.document, view };
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
    for (const key of COLUMN_ORDER) {
      const descriptor = COLUMNS[key];
      if (!descriptor.corridorReadable || descriptor.zero.kind !== "companionColumn") {
        continue;
      }
      if (COLUMNS[descriptor.zero.column].corridorReadable) {
        continue;
      }
      const tile = document.querySelector(`#readouts [data-column="${key}"]`);
      expect(tile, `${key} is missing from the card`).not.toBeNull();
      expect(
        tile?.querySelector(".tile-zero-value"),
        `${key} prints a zero its card is supposed to be withholding`,
      ).toBeNull();
      expect(tile?.querySelector(".tile-zero-how")?.textContent ?? "").toContain("withheld");
    }
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
    expect(progress).toContain(String(CARD_ORDER.length));
  });

  it("puts no bare code identifier in front of a reader", () => {
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    const offenders: string[] = [];
    for (const chunk of textChunks(document.body)) {
      const found = identifier.exec(chunk);
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
