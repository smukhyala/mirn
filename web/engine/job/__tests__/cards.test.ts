import { describe, expect, it } from "vitest";
import { DRILL_CARDS, CARD_ORDER, cardConfig, cardRulerParams } from "../cards.js";
import { AXES } from "../axes.js";

const CODE_IDENTIFIER = /\b(?:[a-z]+[A-Z][A-Za-z]*|[a-z_]+_[a-z_]+)\b|[()[\]{}]|=>/;

describe("the drill card catalogue", () => {
  it("has eight cards and the order names every one", () => {
    expect(CARD_ORDER).toHaveLength(8);
    expect(new Set(CARD_ORDER).size).toBe(8);
    for (const key of CARD_ORDER) {
      expect(DRILL_CARDS[key], `${key} is in the order but not the table`).toBeDefined();
    }
    expect(Object.keys(DRILL_CARDS)).toHaveLength(8);
  });

  it("declares a mix that fools in both directions and is not gameable", () => {
    // Both halves matter. Too few fooling cards and the drill teaches nothing; NO agreeing cards
    // and a reader can score eight out of eight by inverting whatever the corridor number says,
    // and leaves believing that number is systematically wrong. It is uninformative, not inverted.
    //
    // Declared only. `cards.slow.test.ts` runs the rooms and fails on a card whose declared shape
    // is not what it does, which is what stops this test being a check on a set of labels.
    const shapes = CARD_ORDER.map((k) => DRILL_CARDS[k].shape);
    const readsHigh = shapes.filter((s) => s === "reads high").length;
    const readsLow = shapes.filter((s) => s === "reads low").length;
    const agrees = shapes.filter((s) => s === "agrees").length;
    expect(readsHigh, "no card is left where the corridor number reads too big").toBeGreaterThanOrEqual(2);
    expect(readsLow, "no card is left where the corridor number reads too small").toBeGreaterThanOrEqual(2);
    expect(readsHigh + readsLow, "too few cards fool for the drill to teach anything").toBeGreaterThanOrEqual(4);
    expect(agrees, "every card fools, so the drill can be gamed by inverting the number").toBeGreaterThanOrEqual(2);
  });

  it("every card builds a legal configuration", () => {
    for (const key of CARD_ORDER) {
      expect(() => cardConfig(DRILL_CARDS[key]), `${key}`).not.toThrow();
    }
  });

  it("every setting a card names sits on its own control's grid", () => {
    // A control snaps whatever it is given to its own notches, so a card off the grid runs at a
    // setting the panel would show differently. jsdom does not snap, so only this catches it.
    for (const key of CARD_ORDER) {
      const card = DRILL_CARDS[key];
      for (const [axisKey, value] of Object.entries(card.settings)) {
        const axis = AXES[axisKey as keyof typeof AXES];
        expect(axis, `${key} names a control that does not exist`).toBeDefined();
        const steps = (value - axis.min) / axis.step;
        expect(Math.abs(steps - Math.round(steps)), `${key}: ${axisKey}=${value} is off its grid`)
          .toBeLessThan(1e-9);
        expect(value).toBeGreaterThanOrEqual(axis.min);
        expect(value).toBeLessThanOrEqual(axis.max);
      }
    }
  });

  it("says something a reader can read", () => {
    for (const key of CARD_ORDER) {
      const card = DRILL_CARDS[key];
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.name).not.toMatch(CODE_IDENTIFIER);
      expect(card.name).not.toMatch(/\d+\.\d+/);
    }
  });
});
