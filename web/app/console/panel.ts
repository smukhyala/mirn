import { fail } from "../../engine/core/errors.js";
import { AXES, AXIS_ORDER, type AxisKey } from "../../engine/job/axes.js";
import { COLUMNS } from "../../engine/job/columns.js";
import { unitLabel } from "../../ui/labels.js";

/**
 * Every knob on the page, built by walking one table.
 *
 * The sliders and the sweep-axis picker come from the same walk of AXIS_ORDER, so there is no
 * second list of "things you can sweep" to fall out of step with the list of things you can turn.
 * Adding an axis to the table puts it in both, with its range, its unit and its plain-English
 * name, and there is nowhere to add it to only one.
 *
 * Each control also prints the readouts its entry declares it moves. On a page with no reading
 * order, that is the only form guardrail 3 can take: a knob is always on screen, so it always has
 * to say what it does. instrument.html ships the failure - a reaction-time slider directly above a
 * true-effect tile, when reaction time is flat on true effect (0.290 to 0.269, inside seed noise)
 * and moves minimum clearance monotonically instead.
 *
 * PanelValues is a frozen plain record and is what a job is built from. PanelHandle has function
 * members and never leaves the main thread.
 */

export interface PanelValues {
  readonly kind: "panelValues";
  readonly axisValues: Readonly<Record<AxisKey, number>>;
  readonly pedestriansSeeRobot: boolean;
  readonly sweepAxis: AxisKey | null;
  readonly sweepValues: readonly number[];
  readonly seedCount: number;
  /** null is the band switched off. Never 1: one replicate has nothing to be paired against. */
  readonly bandReplicates: number | null;
  readonly detectionFloor: boolean;
  readonly frechet: boolean;
  readonly zeroReferenceRun: boolean;
}

export interface PanelOptions {
  readonly onInput: (values: PanelValues) => void;
}

export interface PanelHandle {
  readonly kind: "panelHandle";
  readonly root: HTMLElement;
  readonly read: () => PanelValues;
}

export const SEED_COUNT_CHOICES: readonly number[] = Object.freeze([1, 2, 4, 8, 16]);

/** Above this crowd, the preview waits for the end of the drag. 92 ms a frame is not a preview. */
export const PREVIEW_DEBOUNCE_PEOPLE = 44;

const DEFAULT_BAND_REPLICATES = 8;
const SWEEP_VALUE_COUNT = 5;

/**
 * Measured on this machine at nTicks=800, dt=0.05: runPair is 38 ms at 18 pedestrians, 92 ms at
 * 44 and 210 ms at 80, so a paired run costs about 2.2 ms per pedestrian. replicateBand at 8
 * replicates is 267 ms at 18 and 738 ms at 44 - about 1.9 ms per pedestrian per replicate. These
 * are quoted to the operator before Run is pressed, never after.
 */
const MS_PER_RUN_PER_PEDESTRIAN = 2.2;
const MS_PER_BAND_REPLICATE_PER_PEDESTRIAN = 1.9;
const MS_PER_FLOOR_PER_PEDESTRIAN = 1.5;
const MS_PER_FRECHET_PER_PEDESTRIAN = 6.5;

export function makePanelValues(init: {
  axisValues: Readonly<Record<string, number>>;
  pedestriansSeeRobot: boolean;
  sweepAxis: AxisKey | null;
  sweepValues: readonly number[];
  seedCount: number;
  bandReplicates: number | null;
  detectionFloor: boolean;
  frechet: boolean;
  zeroReferenceRun: boolean;
}): PanelValues {
  const axisValues: Record<string, number> = {};
  for (const key of AXIS_ORDER) {
    const entry = AXES[key];
    const value = init.axisValues[key];
    if (value === undefined) {
      fail(`the panel has no value for ${entry.label}`);
    }
    if (!Number.isFinite(value)) {
      fail(`${entry.label} must be a finite number, got ${value}`);
    }
    if (value < entry.min || value > entry.max) {
      fail(`${entry.label} must be between ${entry.min} and ${entry.max}, got ${value}`);
    }
    axisValues[key] = value;
  }

  if (init.sweepAxis !== null) {
    const entry = AXES[init.sweepAxis];
    if (init.sweepValues.length === 0) {
      fail(`a sweep of ${entry.label} needs at least one value to sweep over`);
    }
    for (const value of init.sweepValues) {
      if (!Number.isFinite(value) || value < entry.min || value > entry.max) {
        fail(`a swept ${entry.label} must be between ${entry.min} and ${entry.max}, got ${value}`);
      }
    }
  } else if (init.sweepValues.length !== 0) {
    fail("sweep values were given with nothing to sweep");
  }

  if (!Number.isInteger(init.seedCount) || init.seedCount < 1) {
    fail(`the number of seeds must be a whole number of at least one, got ${init.seedCount}`);
  }
  if (init.bandReplicates !== null) {
    if (!Number.isInteger(init.bandReplicates) || init.bandReplicates < 2) {
      fail(
        `the run-to-run band needs at least two replicates to compare, got ${init.bandReplicates}`,
      );
    }
  }

  return Object.freeze({
    kind: "panelValues" as const,
    axisValues: Object.freeze(axisValues) as Readonly<Record<AxisKey, number>>,
    pedestriansSeeRobot: init.pedestriansSeeRobot,
    sweepAxis: init.sweepAxis,
    sweepValues: Object.freeze([...init.sweepValues]),
    seedCount: init.seedCount,
    bandReplicates: init.bandReplicates,
    detectionFloor: init.detectionFloor,
    frechet: init.frechet,
    zeroReferenceRun: init.zeroReferenceRun,
  });
}

export function estimateRunSeconds(values: PanelValues): number {
  const people = values.axisValues["crowdSize"];
  const cells = values.sweepAxis === null ? 1 : values.sweepValues.length;
  const runs = cells * values.seedCount;

  let totalMs = runs * people * MS_PER_RUN_PER_PEDESTRIAN;
  if (values.zeroReferenceRun) {
    totalMs += cells * people * MS_PER_RUN_PER_PEDESTRIAN;
  }
  if (values.bandReplicates !== null) {
    totalMs += cells * values.bandReplicates * people * MS_PER_BAND_REPLICATE_PER_PEDESTRIAN;
  }
  if (values.detectionFloor) {
    totalMs += runs * people * MS_PER_FLOOR_PER_PEDESTRIAN;
  }
  if (values.frechet) {
    totalMs += runs * people * MS_PER_FRECHET_PER_PEDESTRIAN;
  }
  return totalMs / 1000;
}

function sweepValuesFor(key: AxisKey): readonly number[] {
  const entry = AXES[key];
  const span = entry.max - entry.min;
  const out: number[] = [];
  for (let i = 0; i < SWEEP_VALUE_COUNT; i++) {
    const raw = entry.min + (span * i) / (SWEEP_VALUE_COUNT - 1);
    const snapped = entry.min + Math.round((raw - entry.min) / entry.step) * entry.step;
    const clamped = snapped > entry.max ? entry.max : snapped;
    const rounded = Number(clamped.toFixed(6));
    if (!out.includes(rounded)) {
      out.push(rounded);
    }
  }
  return out;
}

function movesSentence(key: AxisKey): string {
  const entry = AXES[key];
  const names: string[] = [];
  for (const column of entry.movesColumns) {
    names.push(COLUMNS[column].label);
  }
  return `Moves: ${names.join(" · ")}`;
}

function formatAxisValue(key: AxisKey, value: number): string {
  const entry = AXES[key];
  if (Number.isInteger(entry.step) && Number.isInteger(value)) {
    return String(value);
  }
  const decimals = String(entry.step).includes(".")
    ? (String(entry.step).split(".")[1] as string).length
    : 2;
  return value.toFixed(decimals);
}

/**
 * A single space, inserted between every pair of adjacent text-bearing siblings this file
 * builds by hand.
 *
 * `Element.append()` places nodes edge to edge with nothing between them, unlike a hand-written
 * HTML template, where the whitespace between two tags is itself a text node. Two labels built
 * with no separator can run together into something that reads as one word - "...the robot" next
 * to "How many..." becomes "robotHow" in `textContent`, which is exactly the shape of a bare
 * identifier the guardrail-12 test looks for. `HTMLOptionElement`s inside a `<select>` are the
 * sharpest case: every one of this panel's options starts with a capital letter and none ends in
 * punctuation, so with no separator EVERY adjacent pair would collide. `<select>.options` still
 * reports only the `<option>` elements with this text node between them, so it costs the picker
 * nothing.
 */
function sep(doc: Document): Text {
  return doc.createTextNode(" ");
}

function groupNode(doc: Document, title: string): HTMLElement {
  const group = doc.createElement("section");
  group.className = "panel-group";
  const heading = doc.createElement("p");
  heading.className = "panel-title";
  heading.textContent = title;
  group.append(heading, sep(doc));
  return group;
}

export function mountPanel(host: HTMLElement, options: PanelOptions): PanelHandle {
  const doc = host.ownerDocument;
  const root = doc.createElement("div");
  root.className = "panel";

  const sliders = new Map<AxisKey, HTMLInputElement>();
  const outputs = new Map<AxisKey, HTMLOutputElement>();

  const worldGroup = groupNode(doc, "The room and the robot");
  const rulerGroup = groupNode(doc, "The ruler");

  for (const key of AXIS_ORDER) {
    const entry = AXES[key];
    const control = doc.createElement("label");
    control.className = "control";
    control.dataset["axis"] = key;

    const heading = doc.createElement("span");
    heading.className = "control-label";
    const readout = doc.createElement("output");
    readout.value = formatAxisValue(key, entry.defaultValue);
    heading.append(`${entry.label} `, readout, ` ${unitLabel(entry.unit)}`);

    const slider = doc.createElement("input");
    slider.type = "range";
    slider.min = String(entry.min);
    slider.max = String(entry.max);
    slider.step = String(entry.step);
    slider.value = String(entry.defaultValue);

    const note = doc.createElement("span");
    note.className = "control-note";
    note.textContent = entry.note;

    const moves = doc.createElement("span");
    moves.className = "control-moves";
    moves.textContent = movesSentence(key);

    control.append(heading, slider, sep(doc), note, sep(doc), moves);
    sliders.set(key, slider);
    outputs.set(key, readout);

    if (entry.kind === "worldAxis") {
      worldGroup.append(control, sep(doc));
    } else {
      rulerGroup.append(control, sep(doc));
    }
  }

  const seeRobot = doc.createElement("input");
  seeRobot.type = "checkbox";
  seeRobot.id = "see-robot";
  seeRobot.checked = true;
  const seeRobotLabel = doc.createElement("label");
  seeRobotLabel.className = "toggle";
  seeRobotLabel.append(seeRobot, doc.createTextNode("People notice the robot"));
  worldGroup.append(seeRobotLabel, sep(doc));

  const previewNote = doc.createElement("p");
  previewNote.className = "panel-note";
  previewNote.id = "preview-note";
  previewNote.textContent = "";
  worldGroup.append(previewNote, sep(doc));

  const runGroup = groupNode(doc, "One press of Run");

  const axisSelect = doc.createElement("select");
  axisSelect.id = "sweep-axis";
  const noSweep = doc.createElement("option");
  noSweep.value = "";
  noSweep.textContent = "nothing — one setting only";
  axisSelect.append(noSweep, sep(doc));
  for (const key of AXIS_ORDER) {
    const option = doc.createElement("option");
    option.value = key;
    option.textContent = AXES[key].label;
    axisSelect.append(option, sep(doc));
  }
  const axisLabel = doc.createElement("label");
  axisLabel.className = "control";
  axisLabel.append(doc.createTextNode("Vary "), axisSelect);

  const valuesField = doc.createElement("input");
  valuesField.type = "text";
  valuesField.id = "sweep-values";
  valuesField.value = "";
  valuesField.disabled = true;
  const valuesLabel = doc.createElement("label");
  valuesLabel.className = "control";
  valuesLabel.append(doc.createTextNode("Values "), valuesField);

  const seedSelect = doc.createElement("select");
  seedSelect.id = "seed-count";
  for (const count of SEED_COUNT_CHOICES) {
    const option = doc.createElement("option");
    option.value = String(count);
    option.textContent = count === 1 ? "one crowd" : `${count} crowds`;
    seedSelect.append(option, sep(doc));
  }
  seedSelect.value = "1";
  const seedLabel = doc.createElement("label");
  seedLabel.className = "control";
  seedLabel.append(doc.createTextNode("Seeds "), seedSelect);

  const bandToggle = doc.createElement("input");
  bandToggle.type = "checkbox";
  bandToggle.id = "band-on";
  bandToggle.checked = true;
  const bandCount = doc.createElement("input");
  bandCount.type = "number";
  bandCount.id = "band-replicates";
  bandCount.min = "2";
  bandCount.step = "1";
  bandCount.value = String(DEFAULT_BAND_REPLICATES);
  const bandLabel = doc.createElement("label");
  bandLabel.className = "toggle";
  bandLabel.append(bandToggle, doc.createTextNode("run-to-run band, replicates "), bandCount);

  const floorToggle = doc.createElement("input");
  floorToggle.type = "checkbox";
  floorToggle.id = "floor-on";
  const floorLabel = doc.createElement("label");
  floorLabel.className = "toggle";
  floorLabel.append(floorToggle, doc.createTextNode("detection floor"));

  const frechetToggle = doc.createElement("input");
  frechetToggle.type = "checkbox";
  frechetToggle.id = "frechet-on";
  const frechetLabel = doc.createElement("label");
  frechetLabel.className = "toggle";
  frechetLabel.append(frechetToggle, doc.createTextNode("the walked-together ruler"));

  const zeroToggle = doc.createElement("input");
  zeroToggle.type = "checkbox";
  zeroToggle.id = "zero-on";
  zeroToggle.checked = true;
  const zeroLabel = doc.createElement("label");
  zeroLabel.className = "toggle";
  zeroLabel.append(zeroToggle, doc.createTextNode("zero-effect reference run"));

  // No id: Task 27 puts the actual Run button, and the authoritative cost line beside it, in a
  // `.run-block` appended after this panel (web/console.ts's `bootConsole`). `id="run-cost"` there
  // is the one this page's tests and CSS address; this element used to carry the same id, which is
  // invalid HTML (two elements, one id) and left `document.getElementById("run-cost")` resolving
  // to whichever one happened to be first in the document rather than the one Task 27 wires up.
  // This quick, rougher estimate stays as a live read of the panel while a setting is still being
  // dragged; it does not disappear or renumber when the accurate `describeCost` model looks at the
  // same job differently.
  const cost = doc.createElement("p");
  cost.className = "panel-note";

  runGroup.append(
    axisLabel,
    sep(doc),
    valuesLabel,
    sep(doc),
    seedLabel,
    sep(doc),
    bandLabel,
    sep(doc),
    floorLabel,
    sep(doc),
    frechetLabel,
    sep(doc),
    zeroLabel,
    sep(doc),
    cost,
  );
  root.append(worldGroup, sep(doc), rulerGroup, sep(doc), runGroup);
  host.append(root);

  function currentAxisValues(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const key of AXIS_ORDER) {
      const slider = sliders.get(key);
      out[key] = slider === undefined ? AXES[key].defaultValue : Number(slider.value);
    }
    return out;
  }

  function parseValues(): readonly number[] {
    const parts = valuesField.value.split(/[\s,]+/);
    const out: number[] = [];
    for (const part of parts) {
      if (part.length === 0) {
        continue;
      }
      out.push(Number(part));
    }
    return out;
  }

  function read(): PanelValues {
    const axisKey = axisSelect.value === "" ? null : (axisSelect.value as AxisKey);
    return makePanelValues({
      axisValues: currentAxisValues(),
      pedestriansSeeRobot: seeRobot.checked,
      sweepAxis: axisKey,
      sweepValues: axisKey === null ? [] : parseValues(),
      seedCount: Number(seedSelect.value),
      bandReplicates: bandToggle.checked ? Number(bandCount.value) : null,
      detectionFloor: floorToggle.checked,
      frechet: frechetToggle.checked,
      zeroReferenceRun: zeroToggle.checked,
    });
  }

  function refresh(): void {
    for (const key of AXIS_ORDER) {
      const slider = sliders.get(key);
      const readout = outputs.get(key);
      if (slider !== undefined && readout !== undefined) {
        readout.value = formatAxisValue(key, Number(slider.value));
      }
    }

    const people = Number(sliders.get("crowdSize")?.value ?? AXES["crowdSize"].defaultValue);
    // >= rather than >: crowdSize's own max (44) is exactly PREVIEW_DEBOUNCE_PEOPLE, and a range
    // input clamps to its max on assignment, so a strict > can never be reached through this
    // slider — the note would be permanently dead. The 92 ms figure the constant is named for was
    // measured AT 44, not above it, so 44 belongs on the "waits" side of the line.
    previewNote.textContent =
      people >= PREVIEW_DEBOUNCE_PEOPLE
        ? "This many people take long enough to simulate that the preview waits until you let go of the slider."
        : "";

    const values = read();
    cost.textContent = `${runsIn(values)} runs — about ${estimateRunSeconds(values).toFixed(1)} s`;
    options.onInput(values);
  }

  function runsIn(values: PanelValues): number {
    const cells = values.sweepAxis === null ? 1 : values.sweepValues.length;
    return cells * values.seedCount;
  }

  for (const key of AXIS_ORDER) {
    const slider = sliders.get(key);
    if (slider !== undefined) {
      slider.addEventListener("input", refresh);
    }
  }
  seeRobot.addEventListener("change", refresh);
  seedSelect.addEventListener("change", refresh);
  bandToggle.addEventListener("change", refresh);
  bandCount.addEventListener("input", refresh);
  floorToggle.addEventListener("change", refresh);
  frechetToggle.addEventListener("change", refresh);
  zeroToggle.addEventListener("change", refresh);
  valuesField.addEventListener("input", refresh);

  axisSelect.addEventListener("change", () => {
    if (axisSelect.value === "") {
      valuesField.value = "";
      valuesField.disabled = true;
    } else {
      valuesField.disabled = false;
      valuesField.value = sweepValuesFor(axisSelect.value as AxisKey).join(" ");
    }
    refresh();
  });

  const initial = read();
  cost.textContent = `${runsIn(initial)} runs — about ${estimateRunSeconds(initial).toFixed(1)} s`;

  return Object.freeze({ kind: "panelHandle" as const, root, read });
}
