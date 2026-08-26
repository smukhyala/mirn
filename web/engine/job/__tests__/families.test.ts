import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../contracts/config.js";
import { ContractError } from "../../core/errors.js";
import { AXES } from "../axes.js";
import { COLUMNS } from "../columns.js";
import {
  FAMILIES,
  FAMILY_ORDER,
  makeMethodFamily,
  type FamilyKey,
  type MethodFamily,
} from "../families.js";

/**
 * The family catalogue is closed, total, written in English, and refuses the entries that would
 * quietly turn one family into another.
 *
 * Nothing here simulates anything. What each family actually READS on a world where the answer is
 * nothing is in `familyProbe.slow.test.ts`, which is where every number in this pair of modules
 * comes from.
 */

/** A term the operator has never met, spelled the way a program spells it. Same regex the column
 *  and axis catalogues are held to, because the same reader meets all three. */
const CODE_IDENTIFIER = /\b(?:[a-z]+[A-Z][A-Za-z]*|[a-z_]+_[a-z_]+)\b|[()[\]{}]|=>/;

/** A well-formed entry to mutate one field of at a time, so each refusal is provoked alone. */
const GOOD: Parameters<typeof makeMethodFamily>[0] = Object.freeze({
  key: "pairedShared" as FamilyKey,
  name: "A perfectly ordinary name for a family",
  whatItIs: "A description long enough that a beginner has somewhere to start reading from.",
  confound: "A statement of what this shape of measurement inherits, at a readable length.",
  unit: "metres" as const,
  ruler: { kind: "sharedNoiseTwin" as const },
});

describe("the family catalogue is total and self-consistent", () => {
  it("orders every key exactly once", () => {
    const keys = Object.keys(FAMILIES) as FamilyKey[];
    expect([...FAMILY_ORDER].sort()).toEqual([...keys].sort());
    expect(new Set(FAMILY_ORDER).size).toBe(FAMILY_ORDER.length);
    expect(FAMILY_ORDER.length).toBe(4);
  });

  it("gives every family its own key back, and freezes it", () => {
    for (const key of FAMILY_ORDER) {
      const family: MethodFamily = FAMILIES[key];
      expect(family.key).toBe(key);
      expect(family.kind).toBe("methodFamily");
      expect(Object.isFrozen(family)).toBe(true);
      expect(Object.isFrozen(family.ruler)).toBe(true);
    }
  });

  it("uses each of the four rulers exactly once, so no two families run the same thing", () => {
    // Two families sharing a ruler would report the same number under two names, which is the
    // failure that matters here: a reader would be told their unpaired study and a paired one
    // behave identically.
    const kinds: string[] = [];
    for (const key of FAMILY_ORDER) {
      kinds.push(FAMILIES[key].ruler.kind);
    }
    expect(new Set(kinds).size).toBe(FAMILY_ORDER.length);
  });

  it("writes every reader-facing string in English, not in code", () => {
    for (const key of FAMILY_ORDER) {
      const family = FAMILIES[key];
      expect(family.name).not.toMatch(CODE_IDENTIFIER);
      expect(family.whatItIs).not.toMatch(CODE_IDENTIFIER);
      expect(family.confound).not.toMatch(CODE_IDENTIFIER);
      expect(family.name.length).toBeGreaterThan(10);
      expect(family.whatItIs.length).toBeGreaterThan(40);
      expect(family.confound.length).toBeGreaterThan(40);
    }
  });

  it("runs its forecaster at the ruler the console opens on", () => {
    // The horizon and the checked instant change the size of the forecaster's answer without
    // changing the room. A family measured at one ruler and rendered beside a console set to
    // another would be two different measurements sharing a heading, so the two are pinned to
    // each other here rather than both being written down twice.
    const ruler = FAMILIES.forecastCounterfactual.ruler;
    expect(ruler.kind).toBe("straightLineForecast");
    if (ruler.kind !== "straightLineForecast") {
      return;
    }
    const horizonAxis = AXES.forecastHorizon;
    const endAxis = AXES.forecastWindowEnd;
    expect(ruler.horizonSteps).toBe(Math.round(horizonAxis.defaultValue / DEFAULT_CONFIG.dt));
    expect(ruler.endStep).toBe(Math.round(endAxis.defaultValue / DEFAULT_CONFIG.dt));
  });

  it("reads its absolute quantity off a column a single crossing could produce", () => {
    const ruler = FAMILIES.noCounterfactual.ruler;
    expect(ruler.kind).toBe("absoluteReadout");
    if (ruler.kind !== "absoluteReadout") {
      return;
    }
    const column = COLUMNS[ruler.column];
    // `unpaired.test.ts` is what proves this flag by swapping the comparison arm for a decoy. If
    // this family read a column that needed the run without the robot, it would be the paired
    // family under a different name and its whole verdict would be false.
    expect(column.corridorReadable).toBe(true);
    expect(column.unit).toBe(FAMILIES.noCounterfactual.unit);
  });
});

describe("the factory refuses the entries that would make a family lie", () => {
  it("refuses a comparison run drawn from the same seed", () => {
    // An offset of zero hands the estimator the run's own twin, and the unpaired family would
    // read exactly nought and look like the paired one. This is the single most valuable refusal
    // in the file: the wrong value here does not crash, it produces a beautiful wrong answer.
    expect(() =>
      makeMethodFamily({
        ...GOOD,
        key: "unpairedSeparate",
        ruler: { kind: "separateRunTwin", controlSeedOffset: 0 },
      }),
    ).toThrow(ContractError);
    expect(() =>
      makeMethodFamily({
        ...GOOD,
        key: "unpairedSeparate",
        ruler: { kind: "separateRunTwin", controlSeedOffset: 1.5 },
      }),
    ).toThrow(ContractError);
    expect(
      makeMethodFamily({
        ...GOOD,
        key: "unpairedSeparate",
        ruler: { kind: "separateRunTwin", controlSeedOffset: -9999 },
      }).ruler.kind,
    ).toBe("separateRunTwin");
  });

  it("refuses a forecast checked before it has room to fit a velocity", () => {
    expect(() =>
      makeMethodFamily({
        ...GOOD,
        key: "forecastCounterfactual",
        ruler: { kind: "straightLineForecast", horizonSteps: 60, endStep: 60 },
      }),
    ).toThrow(ContractError);
    expect(() =>
      makeMethodFamily({
        ...GOOD,
        key: "forecastCounterfactual",
        ruler: { kind: "straightLineForecast", horizonSteps: 0, endStep: 200 },
      }),
    ).toThrow(ContractError);
  });

  it("refuses an absolute quantity that secretly reads the run without the robot", () => {
    expect(() =>
      makeMethodFamily({
        ...GOOD,
        key: "noCounterfactual",
        ruler: { kind: "absoluteReadout", column: "trueEffectM" },
      }),
    ).toThrow(ContractError);
  });

  it("refuses an absolute quantity whose unit is not the one the family declares", () => {
    expect(() =>
      makeMethodFamily({
        ...GOOD,
        key: "noCounterfactual",
        unit: "metres",
        ruler: { kind: "absoluteReadout", column: "robotArrivalS" },
      }),
    ).toThrow(ContractError);
  });

  it("refuses a family with no confound stated", () => {
    expect(() => makeMethodFamily({ ...GOOD, confound: "It is fine." })).toThrow(ContractError);
    expect(() => makeMethodFamily({ ...GOOD, whatItIs: "A number." })).toThrow(ContractError);
    expect(() => makeMethodFamily({ ...GOOD, name: "Short" })).toThrow(ContractError);
  });
});
