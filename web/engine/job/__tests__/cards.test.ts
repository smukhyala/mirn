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

  it("carries both shapes, so a reader can be wrong in both directions", () => {
    const shapes = CARD_ORDER.map((k) => DRILL_CARDS[k].shape);
    expect(shapes.filter((s) => s === "false positive").length).toBeGreaterThanOrEqual(3);
    expect(shapes.filter((s) => s === "false negative").length).toBeGreaterThanOrEqual(3);
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
