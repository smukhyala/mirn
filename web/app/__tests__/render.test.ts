import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderBody, type RenderContext } from "../../build/render.js";
import type { ArenaView } from "../../ui/arena.js";

/**
 * Every frame any scene on a booted page asked to draw, in order.
 *
 * The arena renderer is a pure function of this object, and it is the object a figure's contents
 * are decided in — so what a page draws can be asserted here without a canvas implementation to
 * rasterise it. `arena.test.ts` covers the drawing itself.
 */
const { arenaViews } = vi.hoisted(() => ({ arenaViews: [] as ArenaView[] }));

vi.mock("../../ui/arena.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../ui/arena.js")>();
  return {
    ...actual,
    drawArena: (_context: unknown, view: ArenaView): void => {
      arenaViews.push(view);
    },
  };
});

/**
 * Boots the real widget code against the real generated HTML.
 *
 * Everything else in the suite tests a function. Nothing tested that a PAGE comes out working, and
 * that is where the expensive bugs were: a red error box where five pages promised a prediction
 * question, a derivation panel explaining a quantity its page was not discussing, six dials the
 * prose told the reader to drag that were never drawn, and seven dead links out of the page that
 * introduces the experiments. Every one of those built cleanly and passed every unit test.
 */

const GENERATED = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "generated");

function pagePath(id: string): string {
  return join(GENERATED, `${id}.html`);
}

interface Booted {
  readonly document: Document;
  readonly window: JSDOM["window"];
  /** The frame callbacks the page asked for while mounting, none of them run yet. */
  readonly pendingFrames: readonly FrameRequestCallback[];
}

let bootCounter = 0;

/**
 * `drawing` hands the page a canvas that answers `getContext`.
 *
 * jsdom has no canvas, so `getContext` returns null and a scene stops at that guard before it ever
 * reaches its draw loop. Without this the suite could boot a figure but never see one.
 */
async function boot(id: string, options: { readonly drawing?: boolean } = {}): Promise<Booted> {
  const html = readFileSync(pagePath(id), "utf8");
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: "https://example.test/page" });

  if (options.drawing === true) {
    // A context that accepts every call and records none of them. The mocked `drawArena` above
    // never touches it, but `fitCanvas` and the real sweep plot both do, and between them they
    // use most of the 2d interface. What is being asserted is what a figure was asked to draw,
    // not the pixels — so the drawing itself may go nowhere.
    const stub = new Proxy(
      {},
      {
        get: () => (): void => {},
        set: () => true,
      },
    );
    const prototype = dom.window.HTMLCanvasElement.prototype as unknown as {
      getContext: () => unknown;
    };
    prototype.getContext = (): unknown => stub;
  }

  const pending: FrameRequestCallback[] = [];
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["window"] = dom.window;
  globals["document"] = dom.window.document;
  globals["HTMLElement"] = dom.window.HTMLElement;
  // The sweep plot reads the page's own type stack off the document before it draws a label.
  globals["getComputedStyle"] = dom.window.getComputedStyle.bind(dom.window);
  globals["requestAnimationFrame"] = (callback: FrameRequestCallback): number =>
    pending.push(callback);
  // `performance` is deliberately left as Node's. Installing jsdom's over the global makes its
  // own `now()` delegate back to the global and recurse until the stack runs out.

  bootCounter++;
  arenaViews.length = 0;
  // notes.ts hydrates on import and keeps per-page state, so each page needs a fresh instance.
  // Vite cannot resolve a variable dynamic import, so the cache is reset instead of the specifier
  // being varied.
  vi.resetModules();
  await import("../../notes.js");
  // A copy, not the live queue. A frame asks for the next one before it returns, so iterating the
  // array the page is still pushing into never terminates — it hangs the suite rather than failing
  // it, which took a ten-minute run to notice.
  return { document: dom.window.document, window: dom.window, pendingFrames: pending.slice() };
}

/** One turn of every scene's draw loop, and the frames it produced. */
async function drawOneFrame(id: string): Promise<readonly ArenaView[]> {
  const booted = await boot(id, { drawing: true });
  for (const callback of booted.pendingFrames) {
    callback(0);
  }
  return arenaViews.slice();
}

function click(target: Element | null, window: JSDOM["window"]): void {
  target?.dispatchEvent(new window.Event("click", { bubbles: true }));
}

describe("the built pages boot", () => {
  beforeAll(() => {
    if (!existsSync(GENERATED)) {
      throw new Error(
        "web/generated is missing. Run `npm run notes` first — this suite tests the compiled " +
          "output, not the Markdown.",
      );
    }
  });

  it("renders page 2 with no widget errors", async () => {
    const { document } = await boot("two-worlds");
    const errors = Array.from(document.querySelectorAll(".widget-error")).map((e) => e.textContent);
    expect(errors).toEqual([]);
  });

  it("keeps the working closed until it is asked for, and opens it on click", async () => {
    // Page 2 says "Click the number. The working opens underneath it." It said that for a while
    // with nothing clickable and the panel permanently open.
    const { document, window } = await boot("two-worlds");
    const trigger = document.querySelector<HTMLButtonElement>(".quantity-trigger");
    const panel = document.querySelector<HTMLElement>(".quantity-panel");
    expect(trigger).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(panel?.hidden).toBe(true);
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");

    click(trigger, window);
    expect(panel?.hidden).toBe(false);
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.textContent).toContain("What went in");
  });

  it("makes a cited number open its provenance", async () => {
    // The other half of "every number on this site opens like that": a figure quoted from a sweep
    // has no arithmetic to unfold, but it does have a source.
    const { document, window } = await boot("e1-push-strength");
    const cited = document.querySelector<HTMLElement>('[data-quantity*="["]');
    expect(cited).not.toBeNull();
    expect(cited?.getAttribute("role")).toBe("button");
    expect(cited?.getAttribute("tabindex")).toBe("0");

    click(cited, window);
    const note = cited?.nextElementSibling;
    expect(note?.classList.contains("provenance")).toBe(true);
    expect(note?.textContent).toContain("sweep");
  });

  it("opens that provenance without naming a table, column or axis in code", async () => {
    // Guardrail 12: no bare code identifiers on any surface a reader sees. This panel was built
    // straight out of the reference the author wrote, so it told the reader the figure came "from
    // the e1_push_strength sweep" — a variable name, in the one sentence whose whole job is to
    // explain where a number came from to somebody who has never seen the repository.
    //
    // The guard is behavioural rather than a check on the label table, so it also fails when a new
    // experiment is added with no reader-facing name for it, and when a column or an axis leaks by
    // some other route.
    const pages = [
      "e1-push-strength",
      "e2-density",
      "e3-robot-speed",
      "e4-recovery",
      "e5-propagation",
      "e6-perception",
      "e7-politeness",
      "the-guess",
      "the-floor",
    ];
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    const offenders: string[] = [];

    for (const id of pages) {
      const { document, window } = await boot(id);
      const cited = Array.from(document.querySelectorAll<HTMLElement>("[data-quantity]"));
      expect(cited.length, `${id} cites nothing, so this page proves nothing`).toBeGreaterThan(0);
      for (const span of cited) {
        click(span, window);
        const note = span.nextElementSibling;
        const text = note?.textContent ?? "";
        const found = identifier.exec(text);
        if (found !== null) {
          offenders.push(`${id}: "${found[0]}" in ${text.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("says the pooled table gathered people, rather than claiming an average nobody took", async () => {
    // The propagation table is binned by how close the robot came, so a point on it is a group of
    // people collected from every run — not a mean over runs. The panel said "averaged over N
    // runs" under every cited cell on that page anyway, including the head count, while the
    // figure-note under the same plot said pooled. Raising the declared run count made that
    // sentence numerically right and left it wrong in kind, on a surface the reader opens.
    const { document, window } = await boot("e5-propagation");
    const cited = Array.from(document.querySelectorAll<HTMLElement>("[data-quantity]"));
    expect(cited.length, "e5-propagation cites nothing, so this test proves nothing").toBeGreaterThan(
      0,
    );
    for (const span of cited) {
      click(span, window);
      const text = span.nextElementSibling?.textContent ?? "";
      expect(text, `provenance for ${span.getAttribute("data-quantity")}`).toContain(
        "gathering the people",
      );
      expect(text, `provenance for ${span.getAttribute("data-quantity")}`).not.toContain("averaged");
    }
  });

  it("still says averaged on a table whose points really are means over runs", async () => {
    // The other side of the same branch. A test that only pinned the pooled wording would pass
    // just as well if every provenance panel on the site stopped saying where its number came
    // from.
    const { document, window } = await boot("e1-push-strength");
    const cited = document.querySelector<HTMLElement>('[data-quantity*="["]');
    expect(cited).not.toBeNull();
    click(cited, window);
    const text = cited?.nextElementSibling?.textContent ?? "";
    expect(text).toContain("averaged over");
    expect(text).not.toContain("gathering the people");
  });

  it("renders the prediction question with real labels, not [object Object]", async () => {
    const { document } = await boot("e1-push-strength");
    const options = Array.from(document.querySelectorAll(".predict-option")).map(
      (b) => b.textContent ?? "",
    );
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const label of options) {
      expect(label).not.toContain("[object Object]");
      expect(label.length).toBeGreaterThan(8);
    }
  });

  it("draws every dial an experiment page asks for", async () => {
    // Six pages told the reader to drag a control the runtime silently ignored.
    const { document } = await boot("e1-push-strength");
    const knobLabels = Array.from(document.querySelectorAll(".widget-knob span")).map(
      (s) => s.textContent ?? "",
    );
    expect(knobLabels.some((l) => l.includes("space the robot demands"))).toBe(true);
    expect(document.querySelectorAll(".widget-error")).toHaveLength(0);
  });

  it("puts no robot in the figure whose caption says there is none", async () => {
    // Page 7 measures the floor on a crowd with no robot in it, and says so three times: the
    // orientation strip, the caption above the figure, and the derivation panel below it. The
    // figure drew the robot anyway — square, halo and motion trail — because the scene passed the
    // treated arm's robot straight to the renderer whatever the room was.
    const views = await drawOneFrame("the-floor");
    expect(views.length, "page 7 drew no frame, so this test proves nothing").toBeGreaterThan(0);
    for (const view of views) {
      expect(view.robot).toBeNull();
    }

    const { document } = await boot("the-floor");
    const label = document.querySelector(".widget-arena")?.getAttribute("aria-label") ?? "";
    expect(label).toContain("no robot anywhere in it");
    expect(label).not.toContain("with a robot");
  });

  it("still puts one in the figures that are about a robot", async () => {
    // The other half of the branch above, and the reason it is a branch. A fix that dropped the
    // robot from every scene would satisfy page 7 and destroy the two-worlds reveal, which is the
    // whole of page 2.
    const views = await drawOneFrame("two-worlds");
    expect(views.length, "page 2 drew no frame, so this test proves nothing").toBeGreaterThan(0);
    for (const view of views) {
      expect(view.robot).not.toBeNull();
    }

    const { document } = await boot("two-worlds");
    const label = document.querySelector(".widget-arena")?.getAttribute("aria-label") ?? "";
    expect(label).toContain("once with a robot and once without");
  });

  it("draws a robot in every other scene on the site", async () => {
    // The two tests above pin one page each, by name. This one reads the built site instead, so a
    // scene added later is covered without anybody remembering to come back here. Page 7 is the
    // only figure that is a room with no robot in it; a second one is a decision worth making
    // deliberately, and this is where it would have to be written down.
    const robotFree = new Set(["the-floor"]);
    const pagesWithScenes: string[] = [];
    for (const file of readdirSync(GENERATED)) {
      if (!file.endsWith(".html")) {
        continue;
      }
      const html = readFileSync(join(GENERATED, file), "utf8");
      if (!html.includes('data-mirn-widget=\'{"kind":"scene"')) {
        continue;
      }
      pagesWithScenes.push(file.replace(/\.html$/, ""));
    }
    expect(pagesWithScenes.length, "no page draws a scene, so this test proves nothing").toBeGreaterThan(6);

    for (const id of pagesWithScenes) {
      const views = await drawOneFrame(id);
      expect(views.length, `${id} drew no frame`).toBeGreaterThan(0);
      for (const view of views) {
        if (robotFree.has(id)) {
          expect(view.robot, `${id} should be a room with no robot in it`).toBeNull();
        } else {
          expect(view.robot, `${id} lost its robot`).not.toBeNull();
        }
      }
    }
  });

  it("never shows a bare metre in the scene readout", async () => {
    // Guardrails 6 and 7: a metre always appears next to something that gives it scale.
    const { document } = await boot("two-worlds");
    const readout = document.querySelector(".widget-readout")?.textContent ?? "";
    expect(readout).toMatch(/m\s+—\s+\S/);
  });

  it("opens with an orientation strip in the compiled HTML, not injected at runtime", () => {
    // The strip is prose, and prose on this site survives JavaScript being switched off. Read the
    // file rather than the booted document: a strip that only appears after notes.ts runs is the
    // exact failure this asserts against.
    const html = readFileSync(pagePath("the-room"), "utf8");
    expect(html).toContain('class="orientation"');
    expect(html).toContain("What you are looking at");
    expect(html).toContain("Try this first");
    // The `try` line names a control the page actually draws, and the `shows` line calls the
    // crowd invented before it quotes the size of the room. Both are read out of the strip itself.
    // The first of these was `/orientation-try[\s\S]*?scrubber/`, which is satisfied by the word
    // appearing anywhere later in the document — so it went on passing after the strip stopped
    // saying it, on the strength of a caption further down the page.
    const strip = /orientation-try"[\s\S]*?orientation-text">([^<]*)</.exec(html);
    const tryLine = strip === null ? "" : (strip[1] as string);
    // Page 1's figure draws a Pause button and one range input. "Slider" is what a reader sees;
    // "scrubber" is a word that appears on no control on this site.
    expect(tryLine, "the try line names no control").toContain("slider");
    expect(tryLine).not.toContain("scrubber");

    const showsMatch = /orientation-shows"[\s\S]*?orientation-text">([^<]*)</.exec(html);
    const showsLine = showsMatch === null ? "" : (showsMatch[1] as string);
    expect(showsLine.indexOf("invented")).toBeGreaterThanOrEqual(0);
    expect(showsLine.indexOf("invented")).toBeLessThan(showsLine.indexOf("22 m"));
    // Under the title, above the argument.
    expect(html.indexOf('class="orientation"')).toBeGreaterThan(html.indexOf("</h1>"));
    expect(html.indexOf('class="orientation"')).toBeLessThan(html.indexOf("<main"));
  });

  it("renders no strip at all for a page that declares neither line", () => {
    // No empty furniture. Asserted against the renderer rather than against a sibling page,
    // because any page may gain the fields at any time and this promise must not depend on which.
    const bare: RenderContext = {
      pageNumber: 1,
      terms: [],
      quantities: { tables: {}, live: {} },
      startWidgetIndex: 0,
    };
    expect(renderBody("One paragraph, and nothing else.\n", bare).orientationHtml).toBe("");
    expect(
      renderBody("One paragraph.\n", { ...bare, orientation: {} }).orientationHtml,
    ).toBe("");
    expect(
      renderBody("One paragraph.\n", { ...bare, orientation: { shows: "   " } }).orientationHtml,
    ).toBe("");
  });

  it("renders only the half it was given", () => {
    const bare: RenderContext = {
      pageNumber: 1,
      terms: [],
      quantities: { tables: {}, live: {} },
      startWidgetIndex: 0,
    };
    const onlyTry = renderBody("One paragraph.\n", {
      ...bare,
      orientation: { try: "Drag the slider to the moment the robot passes." },
    }).orientationHtml;
    expect(onlyTry).toContain("Try this first");
    expect(onlyTry).not.toContain("What you are looking at");

    const onlyShows = renderBody("One paragraph.\n", {
      ...bare,
      orientation: { shows: "An invented crowd, and a robot crossing it." },
    }).orientationHtml;
    expect(onlyShows).toContain("What you are looking at");
    expect(onlyShows).not.toContain("Try this first");
  });

  it("leaves no unresolved quantity token in any page", async () => {
    for (const id of ["the-room", "two-worlds", "one-number", "the-floor", "the-guess"]) {
      const html = readFileSync(pagePath(id), "utf8");
      expect(html, `${id} has an unresolved token`).not.toContain("{{q:");
      expect(html, `${id} has a broken quantity`).not.toContain("quantity-broken");
    }
  });
});
