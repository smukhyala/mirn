// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { AXES, AXIS_ORDER } from "../../../engine/job/axes.js";
import { COLUMNS } from "../../../engine/job/columns.js";
import { ContractError } from "../../../engine/core/errors.js";
import {
  estimateRunSeconds,
  makePanelValues,
  mountPanel,
  PREVIEW_DEBOUNCE_PEOPLE,
  SEED_COUNT_CHOICES,
  type PanelValues,
} from "../panel.js";

/**
 * The panel and the sweep picker are one table walked twice, and this file is what stops them
 * becoming two.
 *
 * The movesColumns assertion is guardrail 3 with the sequencing removed. instrument.html already
 * ships the violation it catches: a reaction-time slider sitting directly above a true-effect
 * tile, when reaction time is flat on true effect and moves minimum clearance instead. On a page
 * where every knob is on screen at once, the only defensible fix is that every knob names what it
 * moves, in words, beside itself.
 */

function host(): HTMLElement {
  const node = document.createElement("div");
  document.body.replaceChildren(node);
  return node;
}

function mount(): { readonly root: HTMLElement; readonly seen: PanelValues[] } {
  const seen: PanelValues[] = [];
  const handle = mountPanel(host(), { onInput: (values) => seen.push(values) });
  return { root: handle.root, seen };
}

describe("one table feeds the sliders and the picker", () => {
  it("renders a control for every axis in AXIS_ORDER, in that order", () => {
    const { root } = mount();
    const controls = Array.from(root.querySelectorAll<HTMLElement>("[data-axis]"));
    expect(controls.length).toBe(AXIS_ORDER.length);
    for (let i = 0; i < AXIS_ORDER.length; i++) {
      expect((controls[i] as HTMLElement).dataset["axis"]).toBe(AXIS_ORDER[i]);
    }
  });

  it("offers exactly the same axes in the sweep picker, plus not sweeping at all", () => {
    const { root } = mount();
    const select = root.querySelector<HTMLSelectElement>("#sweep-axis");
    expect(select).not.toBeNull();
    const options = Array.from((select as HTMLSelectElement).options);
    expect(options.length).toBe(AXIS_ORDER.length + 1);
    expect(options[0]?.value).toBe("");
    for (let i = 0; i < AXIS_ORDER.length; i++) {
      expect(options[i + 1]?.value).toBe(AXIS_ORDER[i]);
      expect(options[i + 1]?.textContent).toBe(AXES[AXIS_ORDER[i]!].label);
    }
  });

  it("gives every slider the range its entry declares, and starts at its default", () => {
    const { root } = mount();
    for (const key of AXIS_ORDER) {
      const entry = AXES[key];
      const input = root.querySelector<HTMLInputElement>(`[data-axis="${key}"] input[type="range"]`);
      expect(input, `${key} has no slider`).not.toBeNull();
      const slider = input as HTMLInputElement;
      expect(Number(slider.min)).toBe(entry.min);
      expect(Number(slider.max)).toBe(entry.max);
      expect(Number(slider.step)).toBe(entry.step);
      expect(Number(slider.value)).toBe(entry.defaultValue);
    }
  });
});

describe("a knob names what it moves, wherever it sits", () => {
  it("shows every column an axis declares it moves, beside that axis", () => {
    const { root } = mount();
    for (const key of AXIS_ORDER) {
      const entry = AXES[key];
      const control = root.querySelector<HTMLElement>(`[data-axis="${key}"]`) as HTMLElement;
      const text = control.textContent ?? "";
      expect(entry.movesColumns.length, `${key} declares no column it moves`).toBeGreaterThan(0);
      for (const column of entry.movesColumns) {
        expect(text, `${key} does not name ${column}`).toContain(COLUMNS[column].label);
      }
    }
  });

  it("puts no bare code identifier in front of a reader", () => {
    const { root } = mount();
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    const found = identifier.exec(root.textContent ?? "");
    expect(found === null ? "" : found[0]).toBe("");
  });
});

describe("the panel reports what it is set to", () => {
  it("reads every axis back at its default", () => {
    const handle = mountPanel(host(), { onInput: () => {} });
    const values = handle.read();
    for (const key of AXIS_ORDER) {
      expect(values.axisValues[key]).toBe(AXES[key].defaultValue);
    }
    expect(values.sweepAxis).toBeNull();
    expect(values.sweepValues).toEqual([]);
    expect(values.zeroReferenceRun).toBe(true);
    expect(values.bandReplicates).toBe(8);
    expect(values.detectionFloor).toBe(false);
    expect(values.frechet).toBe(false);
  });

  it("fills the sweep values from the picked axis's own range, never from a literal", () => {
    const { root, seen } = mount();
    const select = root.querySelector<HTMLSelectElement>("#sweep-axis") as HTMLSelectElement;
    select.value = "crowdSize";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    const last = seen[seen.length - 1] as PanelValues;
    expect(last.sweepAxis).toBe("crowdSize");
    expect(last.sweepValues.length).toBeGreaterThan(1);
    for (const value of last.sweepValues) {
      expect(value).toBeGreaterThanOrEqual(AXES["crowdSize"].min);
      expect(value).toBeLessThanOrEqual(AXES["crowdSize"].max);
    }
  });

  it("emits on every slider move", () => {
    const { root, seen } = mount();
    const slider = root.querySelector<HTMLInputElement>(
      '[data-axis="crowdSize"] input[type="range"]',
    ) as HTMLInputElement;
    slider.value = String(AXES["crowdSize"].max);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    const last = seen[seen.length - 1] as PanelValues;
    expect(last.axisValues["crowdSize"]).toBe(AXES["crowdSize"].max);
  });

  it("says when the preview will stop following the drag", () => {
    const { root } = mount();
    const note = root.querySelector<HTMLElement>("#preview-note") as HTMLElement;
    expect(note.textContent).toBe("");

    const slider = root.querySelector<HTMLInputElement>(
      '[data-axis="crowdSize"] input[type="range"]',
    ) as HTMLInputElement;
    slider.value = String(PREVIEW_DEBOUNCE_PEOPLE + AXES["crowdSize"].step);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(note.textContent).toContain("waits until you let go");
  });
});

describe("a hand-edited value is a contract check, not a shrug", () => {
  it("refuses an axis value outside its declared range", () => {
    expect(() =>
      makePanelValues({
        axisValues: { ...defaults(), crowdSize: AXES["crowdSize"].max + 1 },
        pedestriansSeeRobot: true,
        sweepAxis: null,
        sweepValues: [],
        seedCount: 1,
        bandReplicates: 8,
        detectionFloor: false,
        frechet: false,
        zeroReferenceRun: true,
      }),
    ).toThrow(ContractError);
  });

  it("refuses a sweep with an axis and no values", () => {
    expect(() =>
      makePanelValues({
        axisValues: defaults(),
        pedestriansSeeRobot: true,
        sweepAxis: "crowdSize",
        sweepValues: [],
        seedCount: 1,
        bandReplicates: 8,
        detectionFloor: false,
        frechet: false,
        zeroReferenceRun: true,
      }),
    ).toThrow(ContractError);
  });

  it("refuses a one-replicate band, which has no pair to compare", () => {
    expect(() =>
      makePanelValues({
        axisValues: defaults(),
        pedestriansSeeRobot: true,
        sweepAxis: null,
        sweepValues: [],
        seedCount: 1,
        bandReplicates: 1,
        detectionFloor: false,
        frechet: false,
        zeroReferenceRun: true,
      }),
    ).toThrow(ContractError);
  });
});

describe("the cost of pressing Run is quoted before it is spent", () => {
  it("costs more with more seeds, and more again with the band on", () => {
    const one = makePanelValues({
      axisValues: defaults(),
      pedestriansSeeRobot: true,
      sweepAxis: null,
      sweepValues: [],
      seedCount: 1,
      bandReplicates: null,
      detectionFloor: false,
      frechet: false,
      zeroReferenceRun: false,
    });
    const eight = makePanelValues({ ...structuredClone(one), seedCount: 8 } as never);
    const banded = makePanelValues({ ...structuredClone(one), seedCount: 8, bandReplicates: 8 } as never);
    expect(estimateRunSeconds(eight)).toBeGreaterThan(estimateRunSeconds(one));
    expect(estimateRunSeconds(banded)).toBeGreaterThan(estimateRunSeconds(eight));
  });

  it("offers seed counts a reader can pick from", () => {
    expect(SEED_COUNT_CHOICES.length).toBeGreaterThan(1);
    expect(SEED_COUNT_CHOICES[0]).toBe(1);
  });
});

function defaults(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of AXIS_ORDER) {
    out[key] = AXES[key].defaultValue;
  }
  return out;
}
