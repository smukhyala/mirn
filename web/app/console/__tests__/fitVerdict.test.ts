import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { ContractError } from "../../../engine/core/errors.js";
import type { FitCandidate, FitParameter, FitResult } from "../../../engine/fit/search.js";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";
import { FIT_DISCLOSURE, makeFitVerdict, renderFitVerdict } from "../fitVerdict.js";

/**
 * The one surface on this site that puts real people on one side of a number.
 *
 * Guardrail 1 requires three specific things of it, before any figure, and the third is the one
 * that carries the weight: a close fit is not permission to read this bench's disturbance numbers
 * as measurements of anybody. All three are asserted here, in order and by their content, because
 * the whole hazard of calibration is that it makes a toy feel like an instrument.
 */

function parameter(init: {
  label: string;
  value: number;
  spread: number;
  identified: boolean;
}): FitParameter {
  return Object.freeze({ kind: "fitParameter" as const, ...init });
}

function candidate(desiredSpeed: number, noiseAmplitude: number, distance: number): FitCandidate {
  return Object.freeze({ kind: "fitCandidate" as const, desiredSpeed, noiseAmplitude, distance });
}

function resultWith(init: {
  distance: number;
  selfDistance: number;
  paceIdentified?: boolean;
  wobbleIdentified?: boolean;
}): FitResult {
  return Object.freeze({
    kind: "fitResult" as const,
    candidates: Object.freeze([candidate(1.4, 0, init.distance)]),
    best: candidate(1.4, 0, init.distance),
    pace: parameter({
      label: "How fast the crowd wants to walk",
      value: 1.4,
      spread: 0.37,
      identified: init.paceIdentified ?? true,
    }),
    wobble: parameter({
      label: "How much it wanders for no reason",
      value: 0,
      spread: 0.003,
      identified: init.wobbleIdentified ?? false,
    }),
    selfDistance: init.selfDistance,
    nRecordedSpeeds: 14400,
    nRecordedTracks: 18,
    framesPerSecond: 2.5,
  });
}

const CLEAR = resultWith({ distance: 0.062, selfDistance: 0.007 });
const UNDER = resultWith({ distance: 0.004, selfDistance: 0.007 });

function render(result: FitResult): HTMLElement {
  const dom = new JSDOM("<!doctype html><body></body>");
  return renderFitVerdict(dom.window.document, makeFitVerdict(result));
}

function leafText(node: Element): readonly string[] {
  const found: string[] = [];
  const walk = (element: Element): void => {
    for (const child of element.childNodes) {
      if (child.nodeType === 3) {
        const text = child.textContent ?? "";
        if (text.trim().length > 0) {
          found.push(text);
        }
        continue;
      }
      if (child.nodeType === 1) {
        walk(child as Element);
      }
    }
  };
  walk(node);
  return found;
}

describe("the three things guardrail 1 requires before any number", () => {
  it("says the recording is real", () => {
    expect(FIT_DISCLOSURE[0] ?? "").toContain("real");
    expect(FIT_DISCLOSURE[0] ?? "").toContain("somebody's actual movements");
  });

  it("says the crowd it is compared against is still invented", () => {
    expect(FIT_DISCLOSURE[1] ?? "").toContain("invented");
    // And that fitting does not change that, which is the half a reader would otherwise supply
    // for themselves in the wrong direction.
    expect(FIT_DISCLOSURE[1] ?? "").toContain("does not stop it being invented");
  });

  it("says a close fit licenses nothing on the rest of the site", () => {
    // The load-bearing clause. The reader who has just been shown the invented crowd walks like a
    // real one is the reader most likely to believe the next number they see.
    expect(FIT_DISCLOSURE[2] ?? "").toContain("not permission");
    expect(FIT_DISCLOSURE[2] ?? "").toContain("measurements of anybody");
  });

  it("puts all three above every figure, in document order", () => {
    const rendered = render(CLEAR);
    const parts = [...rendered.querySelectorAll("[data-part]")].map((p) =>
      p.getAttribute("data-part"),
    );
    expect(parts[0]).toBe("disclosure");
    expect(parts.indexOf("disclosure")).toBeLessThan(parts.indexOf("fit"));

    const shown = [...rendered.querySelectorAll(".fit-disclosure")].map((p) => p.textContent ?? "");
    expect(shown).toEqual([...FIT_DISCLOSURE]);
  });

  it("does not hide any of them behind a disclosure widget", () => {
    // Every other zero on this site is refused if it sits inside a closed <details>. So is this.
    const rendered = render(CLEAR);
    expect(rendered.querySelector("details")).toBeNull();
  });
});

describe("the fit figure", () => {
  it("never appears without the crowd's distance from itself beside it", () => {
    // Guardrail 6's shape. A figure with nothing to judge it against is the error this site exists
    // to teach, and here the reference is measured rather than asserted.
    const zero = render(CLEAR).querySelector(".figure-zero");
    expect(zero).not.toBeNull();
    expect(zero?.textContent ?? "").toContain("from ITSELF");
  });

  it("refuses to render at all when that reference was not measured", () => {
    expect(() => makeFitVerdict(resultWith({ distance: 0.06, selfDistance: 0 }))).toThrow(
      ContractError,
    );
    expect(() =>
      makeFitVerdict(resultWith({ distance: 0.06, selfDistance: Number.NaN })),
    ).toThrow(ContractError);
  });

  it("says when the fit is closer than the measure can resolve", () => {
    // A fit below the crowd's own noise is not a better fit; it is past the point where this can
    // tell the difference. Reporting it as "very close" would be the flattering reading.
    expect(makeFitVerdict(UNDER).beatsNoise).toBe(false);
    expect(render(UNDER).textContent ?? "").toContain("past the point where this measure");
    expect(makeFitVerdict(CLEAR).beatsNoise).toBe(true);
  });
});

describe("what the recording did and did not decide", () => {
  it("marks an unpinned parameter as unpinned, in the DOM and in the words", () => {
    const rendered = render(CLEAR);
    const unpinned = rendered.querySelectorAll('[data-identified="no"]');
    expect(unpinned.length).toBe(1);
    expect(unpinned[0]?.textContent ?? "").toContain("does NOT decide it");
    expect(unpinned[0]?.textContent ?? "").toContain("not as something measured");
  });

  it("marks a pinned one as pinned", () => {
    const pinned = render(CLEAR).querySelectorAll('[data-identified="yes"]');
    expect(pinned.length).toBe(1);
    expect(pinned[0]?.textContent ?? "").toContain("does decide it");
  });

  it("shows both either way, rather than hiding the one it cannot pin", () => {
    // Hiding it would leave the crowd running at a value the reader was never told about.
    const bothPinned = render(resultWith({ distance: 0.062, selfDistance: 0.007, wobbleIdentified: true }));
    expect(bothPinned.querySelectorAll(".fit-parameter").length).toBe(2);
    expect(render(CLEAR).querySelectorAll(".fit-parameter").length).toBe(2);
  });
});

describe("what the fit page refuses to say", () => {
  it("names the corridor that cannot be filmed twice", () => {
    // The arithmetic reason a recording can never produce a disturbance number, on the page rather
    // than in a comment.
    expect((render(CLEAR).textContent ?? "").toLowerCase()).toContain("cannot be filmed twice");
  });

  it("writes every reader-facing string in English, not in code", () => {
    let checked = 0;
    for (const result of [CLEAR, UNDER]) {
      for (const text of leafText(render(result))) {
        expect(text, `leaked an identifier: ${text}`).not.toMatch(CODE_IDENTIFIER);
        checked = checked + 1;
      }
    }
    expect(checked, "the scan found no text to check").toBeGreaterThan(30);
  });
});
