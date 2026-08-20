import { describe, expect, it } from "vitest";
import { anchorFor, unitLabel, variantLabel } from "./labels.js";

describe("anchorFor, the body-scale phrase beside a metre", () => {
  // Guardrail 7: a metre may appear, but never alone. This function is the smallest form of that
  // promise, and it is shared between the derivation panel in web/notes.ts and the
  // {{q:…anchor}} token in web/build/quantities.ts — so a change here changes both, which is the
  // reason it lives in one place.
  it("gives a phrase, never a number, for every band", () => {
    expect(anchorFor(0.05)).toBe("less than the wobble of ordinary walking");
    expect(anchorFor(0.3)).toBe("half a stride");
    expect(anchorFor(0.7)).toBe("one stride");
    expect(anchorFor(1.5)).toBe("the width of a doorway");
    expect(anchorFor(4)).toBe("several strides");
  });

  it("is defined at every band edge, so no value falls through to nothing", () => {
    // The failure this guards: a chain of exclusive ranges with a gap at a boundary returns
    // undefined, and the page renders "About undefined." next to a live number.
    const edges = [0, 0.15, 0.5, 1.0, 2.0];
    for (const edge of edges) {
      expect(anchorFor(edge).length).toBeGreaterThan(0);
    }
  });

  it("never moves backwards as the distance grows", () => {
    // The anchor is the sanctioned escape from the comparative lint because it tracks the number.
    // A non-monotonic band would let a bigger deviation read as a smaller one, which is worse
    // than the comparative the lint refused.
    const order = [
      "less than the wobble of ordinary walking",
      "half a stride",
      "one stride",
      "the width of a doorway",
      "several strides",
    ];
    let previous = 0;
    for (let metres = 0; metres < 3; metres += 0.01) {
      const rank = order.indexOf(anchorFor(metres));
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });
});

describe("plain-English names for machine keys", () => {
  it("falls back to the raw key rather than blanking a tile", () => {
    // Guardrail 12 forbids a bare identifier reaching a reader, so an unlabelled key must be ugly
    // enough to be caught in review — not invisible.
    expect(unitLabel("furlongs")).toBe("furlongs");
    expect(variantLabel("some_new_variant")).toBe("some_new_variant");
  });

  it("spells out the units a reader would otherwise have to expand", () => {
    expect(unitLabel("mdp")).toBe("× the detection floor");
    expect(variantLabel("pedestrian_removed")).toBe("One bystander removed");
  });
});
