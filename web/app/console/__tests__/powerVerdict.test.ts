import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { ContractError } from "../../../engine/core/errors.js";
import { makeReading } from "../../../engine/job/columns.js";
import {
  aggregatePowerLevel,
  type PowerCurve,
  type PowerLevel,
  type PowerSeed,
} from "../../../engine/job/powerCurve.js";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";
import {
  makePowerVerdict,
  readsFlatAcross,
  renderPowerVerdict,
} from "../powerVerdict.js";

/**
 * The sweep on the page: what it must never lose, and the one sentence it exists to be able to say.
 *
 * The curve itself is measured against the real engine in `powerCurve.slow.test.ts`. What is under
 * test here is the rendering and the refusals, so the levels are built by hand — which is the only
 * way to get a ruler whose curve rises and a ruler whose curve is flat into the same file without
 * running the simulator twice over.
 */

const BAND_M = 0.29;

function room(
  seed: number,
  push: number,
  truthM: number,
  readingM: number,
): PowerSeed {
  return Object.freeze({
    kind: "powerSeed" as const,
    seed,
    pushStrength: push,
    reading: makeReading(readingM, { kind: "measured" }),
    bandM: BAND_M,
    peakBandM: 0.44,
    truthM,
    truthOverBand: truthM > BAND_M,
    clearedBand: readingM > BAND_M,
  });
}

/** Four rooms at one setting, every one with the same truth and the same reading. */
function level(push: number, truthM: number, readingM: number): PowerLevel {
  const rooms: PowerSeed[] = [];
  for (let i = 0; i < 4; i++) {
    rooms.push(room(i + 1, push, truthM, readingM));
  }
  return aggregatePowerLevel(push, rooms);
}

function curveOf(levels: readonly PowerLevel[]): PowerCurve {
  return Object.freeze({
    kind: "powerCurve" as const,
    familyKey: "pairedShared" as const,
    unit: "metres" as const,
    levels: Object.freeze([...levels]),
  });
}

/** A ruler that works: nothing found where there is nothing, everything found where there is. */
const RISES = curveOf([
  level(0, 0, 0),
  level(1, 0.32, 0.32),
  level(3, 0.45, 0.45),
]);

/** A ruler that answers the same way whatever happened. The truth moves under it; it does not. */
const FLAT = curveOf([
  level(0, 0, 0.37),
  level(1, 0.32, 0.36),
  level(3, 0.45, 0.38),
]);

function render(curve: PowerCurve): HTMLElement {
  const dom = new JSDOM("<!doctype html><body></body>");
  return renderPowerVerdict(dom.window.document, makePowerVerdict(curve));
}

describe("the sweep refuses to be read against nothing", () => {
  it("insists its first row is the world the other count was taken on", () => {
    // The whole value of the table is that its bottom row IS the false-positive count, measured
    // again rather than quoted. A sweep starting anywhere else has no zero to be read against, and
    // guardrail 6 is not satisfied by a table that merely looks like it has one.
    const noZero = curveOf([level(0.5, 0.2, 0.2), level(3, 0.45, 0.45)]);
    expect(() => makePowerVerdict(noZero)).toThrow(ContractError);
  });

  it("insists that first row really did have nothing in it", () => {
    // Starting at push nought is not enough; the truth there has to actually be nothing. If it is
    // not, every row above is being read against an unstated real effect.
    const dirtyZero = curveOf([level(0, 0.1, 0.1), level(3, 0.45, 0.45)]);
    expect(() => makePowerVerdict(dirtyZero)).toThrow(ContractError);
  });

  it("refuses a single point, which is not a curve", () => {
    expect(() => makePowerVerdict(curveOf([level(0, 0, 0)]))).toThrow(
      ContractError,
    );
  });
});

describe("what the table says about a ruler", () => {
  it("says nothing extra about one whose answer moved with the robot", () => {
    const verdict = makePowerVerdict(RISES);
    expect(verdict.readsFlat).toBe(false);
    expect(render(RISES).querySelector(".power-flat")).toBeNull();
  });

  it("says out loud that a flat one is not reporting on what the robot did", () => {
    const verdict = makePowerVerdict(FLAT);
    expect(verdict.readsFlat).toBe(true);
    const flat = render(FLAT).querySelector(".power-flat");
    expect(flat).not.toBeNull();
    expect(flat?.textContent ?? "").toContain(
      "answering the same way whatever happened",
    );
  });

  it("reads the two ends and not a slope through the middle", () => {
    // A ruler that dips and comes back still cannot tell the emptiest world from the fullest, and
    // a fit through every point would score it as though it could.
    const dips = [
      level(0, 0, 0.37),
      level(1, 0.32, 0.05),
      level(3, 0.45, 0.38),
    ];
    expect(readsFlatAcross(dips)).toBe(true);
  });

  it("counts one room of movement as no movement, and two as movement", () => {
    // The threshold, pinned in both directions so it cannot drift into meaning nothing.
    const byOne = [level(0, 0, 0.3), level(3, 0.45, 0.2)];
    expect(byOne[0]?.nCleared).toBe(4);
    expect(byOne[1]?.nCleared).toBe(0);
    expect(readsFlatAcross(byOne)).toBe(false);
  });
});

describe("what the table shows", () => {
  it("gives every dial position a row, in the order the sweep ran them", () => {
    const rows = [...render(RISES).querySelectorAll(".power-row")].map((r) =>
      r.getAttribute("data-push"),
    );
    expect(rows).toEqual(["0", "1", "3"]);
  });

  it("marks the row the counts above were taken on, and marks only that one", () => {
    const zeros = render(RISES).querySelectorAll(".power-row-zero");
    expect(zeros.length).toBe(1);
    expect(zeros[0]?.getAttribute("data-push")).toBe("0");
  });

  it("keeps a found room, a missed one and a false alarm in columns of their own", () => {
    // Three counts and not one rate. Pooled, a ruler that calls every room looks like a perfect
    // detector at the settings where most rooms happen to contain something.
    const mixed = aggregatePowerLevel(1, [
      room(1, 1, 0.4, 0.5),
      room(2, 1, 0.4, 0.1),
      room(3, 1, 0.1, 0.5),
      room(4, 1, 0.1, 0.1),
    ]);
    const verdict = makePowerVerdict(curveOf([level(0, 0, 0), mixed]));
    const shown = verdict.levels[1];
    expect(shown?.nHit).toBe(1);
    expect(shown?.nMissed).toBe(1);
    expect(shown?.nFalseAlarm).toBe(1);

    const dom = new JSDOM("<!doctype html><body></body>");
    const table = renderPowerVerdict(dom.window.document, verdict);
    const cells = [...(table.querySelectorAll('[data-push="1"] td') ?? [])];
    // truth, reading, available, found, missed, false alarm
    expect(cells.length).toBe(6);
  });

  it("prints a fractional dial position as itself, not rounded to a whole number", () => {
    // This is here because the first version of the table formatted the dial with the `count` unit,
    // which rounds to whole numbers: 0.25 rendered as "0 times the usual" and 0.5 as "1 times the
    // usual", so two rows were mislabelled and one shared a label with the row beneath it. Every
    // test in this file passed, because every fixture in it used a whole-numbered dial. It was
    // found by driving the built page in a browser.
    const withFractions = curveOf([
      level(0, 0, 0),
      level(0.25, 0.18, 0.18),
      level(0.5, 0.24, 0.24),
    ]);
    const dials = [
      ...render(withFractions).querySelectorAll(".power-dial"),
    ].map((d) => d.textContent ?? "");
    expect(dials[1]).toContain("0.25");
    expect(dials[2]).toContain("0.50");
    // And no two rows may carry the same label, which is the failure the rounding actually caused.
    expect(new Set(dials).size).toBe(dials.length);
  });

  it("shows every metre against something a body knows, per guardrail 7", () => {
    const anchors = render(RISES).querySelectorAll(".power-row .figure-anchor");
    expect(anchors.length).toBe(3);
    for (const anchor of anchors) {
      expect((anchor.textContent ?? "").length).toBeGreaterThan(0);
    }
  });

  it("prints the refusal, and it names the thing a curve most invites", () => {
    const lines = [...render(RISES).querySelectorAll(".refusal-line")].map(
      (l) => l.textContent ?? "",
    );
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.join(" ")).toContain("not a power calculation");
  });
});

describe("nothing on the sweep is a code identifier", () => {
  it("writes every reader-facing string in English, on both shapes of curve", () => {
    let checked = 0;
    for (const curve of [RISES, FLAT]) {
      const walk = (node: Element): void => {
        for (const child of node.childNodes) {
          if (child.nodeType === 3) {
            const text = child.textContent ?? "";
            if (text.trim().length > 0) {
              expect(text, `leaked an identifier: ${text}`).not.toMatch(
                CODE_IDENTIFIER,
              );
              checked = checked + 1;
            }
            continue;
          }
          if (child.nodeType === 1) {
            walk(child as Element);
          }
        }
      };
      walk(render(curve));
    }
    // A count guard, so a rendering change that empties the table cannot pass this by scanning
    // nothing at all.
    expect(checked, "the scan found no text to check").toBeGreaterThan(40);
  });
});
