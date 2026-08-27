// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { AXES, AXIS_ORDER } from "../../../engine/job/axes.js";
import { COLUMNS } from "../../../engine/job/columns.js";
import { CROWD_MODEL_ORDER, type CrowdModelKey } from "../../../engine/contracts/config.js";
import { ContractError } from "../../../engine/core/errors.js";
import { crowdLabel } from "../../../ui/labels.js";
import {
  estimateRunSeconds,
  makePanelValues,
  mountPanel,
  PREVIEW_DEBOUNCE_PEOPLE,
  SEED_COUNT_CHOICES,
  type PanelValues,
} from "../panel.js";
import { decodeSettings, encodeSettings, settingsNotHonoured } from "../permalink.js";
import { panelValuesFromSettings, settingsFromPanel } from "../preview.js";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";

/**
 * The panel and the sweep picker are one table walked twice, and this file is what stops them
 * becoming two.
 *
 * The movesColumns assertion is guardrail 3 with the sequencing removed. The deleted notebook
 * shipped the violation it catches: a reaction-time slider sitting directly above a true-effect
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
    const found = CODE_IDENTIFIER.exec(root.textContent ?? "");
    expect(found === null ? "" : found[0]).toBe("");
  });
});

/**
 * The crowd picker, which is a control and deliberately not an axis.
 *
 * `AXES` entries are numeric knobs with a min, a max and a step that `axes.slow.test.ts` walks
 * notch by notch, and two kernels are not two points on a scale — so this control is checked here,
 * against `CROWD_MODEL_ORDER` itself, rather than by the axis assertions above. What the reader is
 * offered is what each crowd DOES, because the kernels' own names are code and guardrail 12 keeps
 * code off the page: the "no bare code identifier" test above runs over the whole booted panel,
 * this picker's two options included.
 */
describe("the crowd is a control, not an axis", () => {
  it("offers every crowd this bench can run, in the catalogue's own order", () => {
    const { root } = mount();
    const select = root.querySelector<HTMLSelectElement>("#crowd-model");
    expect(select).not.toBeNull();
    const options = Array.from((select as HTMLSelectElement).options);
    expect(options.length).toBe(CROWD_MODEL_ORDER.length);
    expect(options.length).toBeGreaterThan(1);
    for (let i = 0; i < CROWD_MODEL_ORDER.length; i++) {
      expect(options[i]?.value).toBe(CROWD_MODEL_ORDER[i]);
    }
  });

  it("names each crowd by what its people do, never by its key", () => {
    const { root } = mount();
    const select = root.querySelector<HTMLSelectElement>("#crowd-model") as HTMLSelectElement;
    for (const option of Array.from(select.options)) {
      const text = option.textContent ?? "";
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toBe(option.value);
      expect(CODE_IDENTIFIER.test(text), `"${text}" carries a code identifier`).toBe(false);
    }
    // The two say different things about the same room: one reacts to who is beside a person now,
    // the other to who they are about to meet. A picker whose options read alike offers nothing.
    const texts = Array.from(select.options).map((option) => option.textContent ?? "");
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("does not appear in the sweep picker, which is the axis table walked again", () => {
    const { root } = mount();
    const sweep = root.querySelector<HTMLSelectElement>("#sweep-axis") as HTMLSelectElement;
    for (const option of Array.from(sweep.options)) {
      expect(option.value).not.toBe("crowdModel");
      expect(option.textContent ?? "").not.toBe(crowdLabel(CROWD_MODEL_ORDER[0] as CrowdModelKey));
    }
  });

  it("reads the picked crowd back, and says so the moment it changes", () => {
    const { root, seen } = mount();
    const select = root.querySelector<HTMLSelectElement>("#crowd-model") as HTMLSelectElement;
    const second = CROWD_MODEL_ORDER[1] as CrowdModelKey;
    select.value = second;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const last = seen[seen.length - 1] as PanelValues;
    expect(last.crowdModel).toBe(second);
  });

  it("refuses a crowd this bench does not run", () => {
    expect(() =>
      makePanelValues({
        axisValues: defaults(),
        pedestriansSeeRobot: true,
        crowdModel: "aCrowdNobodyWrote" as unknown as CrowdModelKey,
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
    // The crowd every fixture and pinned measurement in this repo was taken on.
    expect(values.crowdModel).toBe(CROWD_MODEL_ORDER[0]);
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
        crowdModel: "socialForce",
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
        crowdModel: "socialForce",
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
        crowdModel: "socialForce",
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
      crowdModel: "socialForce",
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

describe("the panel opens where a link tells it to", () => {
  /**
   * The seam a permalink comes in through. Without it the decoder had nowhere to put its answer:
   * every control was built at its catalogue default, and a copied link lost its whole payload
   * while the page promised otherwise.
   *
   * A control is allowed to refuse. What is asserted here is that the panel takes what it can and
   * that `read()` tells the truth about the rest, which is what lets `web/console.ts` compare the
   * two and print the difference rather than round a setting off in secret.
   */
  function initialValues(overrides: Partial<Parameters<typeof makePanelValues>[0]>): PanelValues {
    const axisValues: Record<string, number> = {};
    for (const key of AXIS_ORDER) {
      axisValues[key] = AXES[key].defaultValue;
    }
    return makePanelValues({
      axisValues,
      pedestriansSeeRobot: true,
      crowdModel: "socialForce",
      sweepAxis: null,
      sweepValues: [],
      seedCount: 1,
      bandReplicates: 8,
      detectionFloor: false,
      frechet: false,
      zeroReferenceRun: true,
      ...overrides,
    });
  }

  it("opens every control at the link's settings, not at the defaults", () => {
    const axisValues: Record<string, number> = {};
    for (const key of AXIS_ORDER) {
      axisValues[key] = AXES[key].max;
    }
    const asked = initialValues({
      axisValues,
      pedestriansSeeRobot: false,
      crowdModel: CROWD_MODEL_ORDER[1] as CrowdModelKey,
      sweepAxis: "crowdSize",
      sweepValues: [4, 18, 44],
      seedCount: 8,
      bandReplicates: 12,
      detectionFloor: true,
      frechet: true,
      zeroReferenceRun: false,
    });
    const handle = mountPanel(host(), { onInput: () => {}, initial: asked });
    const read = handle.read();
    for (const key of AXIS_ORDER) {
      expect(read.axisValues[key], key).toBe(AXES[key].max);
    }
    expect(read.pedestriansSeeRobot).toBe(false);
    expect(read.crowdModel).toBe(CROWD_MODEL_ORDER[1]);
    expect(read.sweepAxis).toBe("crowdSize");
    expect(read.sweepValues).toEqual([4, 18, 44]);
    expect(read.seedCount).toBe(8);
    expect(read.bandReplicates).toBe(12);
    expect(read.detectionFloor).toBe(true);
    expect(read.frechet).toBe(true);
    expect(read.zeroReferenceRun).toBe(false);
  });

  it("brings the value readouts and the debounce note with it", () => {
    const axisValues: Record<string, number> = {};
    for (const key of AXIS_ORDER) {
      axisValues[key] = AXES[key].defaultValue;
    }
    axisValues["crowdSize"] = PREVIEW_DEBOUNCE_PEOPLE;
    const handle = mountPanel(host(), { onInput: () => {}, initial: initialValues({ axisValues }) });
    const control = handle.root.querySelector<HTMLElement>('[data-axis="crowdSize"]');
    expect(control?.querySelector("output")?.value).toBe(String(PREVIEW_DEBOUNCE_PEOPLE));
    expect(handle.root.querySelector("#preview-note")?.textContent ?? "").not.toBe("");
  });

  it("still pushes nothing on mount, so the first preview comes from read()", () => {
    const seen: PanelValues[] = [];
    mountPanel(host(), { onInput: (values) => seen.push(values), initial: initialValues({}) });
    expect(seen).toEqual([]);
  });

  it("snaps a crowd count the picker does not offer, rather than reading back as none", () => {
    // Assigning an unlisted value to a <select> leaves it reading "", which makePanelValues would
    // reject as a count of zero — a legal link crashing the boot. The console says what happened.
    const handle = mountPanel(host(), { onInput: () => {}, initial: initialValues({ seedCount: 3 }) });
    expect(SEED_COUNT_CHOICES).not.toContain(3);
    expect(SEED_COUNT_CHOICES).toContain(handle.read().seedCount);
  });

  it("switches the band off when the link says off", () => {
    const handle = mountPanel(host(), {
      onInput: () => {},
      initial: initialValues({ bandReplicates: null }),
    });
    expect(handle.read().bandReplicates).toBeNull();
  });
});

describe("copy a link, open the link", () => {
  /**
   * The whole journey, through the same three functions `web/console.ts` uses and in the same
   * order: the Copy-link button's `encodeSettings(settingsFromPanel(panel.read()))`, then the boot
   * path's `decodeSettings` and `panelValuesFromSettings`, then a second panel mounted from that.
   *
   * The two panels must read identically. This is the assertion the feature was missing: the
   * encoder, the decoder and their round-trip were all tested in isolation while nothing on the
   * page called the decoder at all, so a copied link looked like it worked and silently produced
   * the defaults.
   */
  function copyAndOpen(prepare: (root: HTMLElement) => void): {
    readonly before: PanelValues;
    readonly after: PanelValues;
    readonly notices: readonly string[];
    readonly unhonoured: readonly string[];
  } {
    const first = mountPanel(host(), { onInput: () => {} });
    prepare(first.root);
    const before = first.read();

    const query = encodeSettings(settingsFromPanel(before));
    const decoded = decodeSettings(`?${query}`);
    const second = mountPanel(host(), {
      onInput: () => {},
      initial: panelValuesFromSettings(decoded.settings),
    });
    const after = second.read();
    return {
      before,
      after,
      notices: decoded.notices,
      unhonoured: settingsNotHonoured(decoded.settings, settingsFromPanel(after)),
    };
  }

  it("brings the defaults back unchanged", () => {
    const { before, after, notices, unhonoured } = copyAndOpen(() => {});
    expect(notices).toEqual([]);
    expect(unhonoured).toEqual([]);
    expect(after).toEqual(before);
  });

  it("brings the other crowd back unchanged, rather than opening at the first one", () => {
    // The failure this guards is the silent one: a link that names the second crowd and reopens on
    // the first would attribute every number on the page to a room that did not produce it.
    const second = CROWD_MODEL_ORDER[1] as CrowdModelKey;
    const { before, after, notices, unhonoured } = copyAndOpen((root) => {
      const crowd = root.querySelector<HTMLSelectElement>("#crowd-model") as HTMLSelectElement;
      crowd.value = second;
      crowd.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(notices).toEqual([]);
    expect(unhonoured).toEqual([]);
    expect(before.crowdModel).toBe(second);
    expect(after.crowdModel).toBe(second);
    expect(after).toEqual(before);
  });

  it("brings a moved slider, a switched toggle and a picked sweep back unchanged", () => {
    const { before, after, notices, unhonoured } = copyAndOpen((root) => {
      const crowd = root.querySelector<HTMLInputElement>('[data-axis="crowdSize"] input[type="range"]');
      (crowd as HTMLInputElement).value = "32";
      const seeRobot = root.querySelector<HTMLInputElement>("#see-robot");
      (seeRobot as HTMLInputElement).checked = false;
      const floor = root.querySelector<HTMLInputElement>("#floor-on");
      (floor as HTMLInputElement).checked = true;
      const seeds = root.querySelector<HTMLSelectElement>("#seed-count");
      (seeds as HTMLSelectElement).value = "8";
      const axis = root.querySelector<HTMLSelectElement>("#sweep-axis");
      (axis as HTMLSelectElement).value = "crowdSize";
      axis?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(notices).toEqual([]);
    expect(unhonoured).toEqual([]);
    expect(after.axisValues.crowdSize).toBe(32);
    expect(after.pedestriansSeeRobot).toBe(false);
    expect(after.detectionFloor).toBe(true);
    expect(after.seedCount).toBe(8);
    expect(after.sweepAxis).toBe("crowdSize");
    expect(after.sweepValues).toEqual(before.sweepValues);
    expect(after).toEqual(before);
  });

  it("brings every axis back from its own maximum", () => {
    // One slider at a time would pass with a swapped pair of query keys; all thirteen at their
    // maxima would too. Each axis is set to a DIFFERENT fraction of its own range instead.
    const { before, after, notices, unhonoured } = copyAndOpen((root) => {
      let index = 0;
      for (const key of AXIS_ORDER) {
        const entry = AXES[key];
        const notches = Math.round((entry.max - entry.min) / entry.step);
        const notch = notches === 0 ? 0 : (index % (notches + 1));
        const slider = root.querySelector<HTMLInputElement>(`[data-axis="${key}"] input[type="range"]`);
        (slider as HTMLInputElement).value = String(entry.min + notch * entry.step);
        index += 3;
      }
    });
    expect(notices).toEqual([]);
    expect(unhonoured).toEqual([]);
    for (const key of AXIS_ORDER) {
      expect(after.axisValues[key], key).toBe(before.axisValues[key]);
    }
  });
});
