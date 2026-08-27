import { fail } from "../../engine/core/errors.js";
import { CROWD_MODEL_ORDER, type CrowdModelKey } from "../../engine/contracts/config.js";
import { AXES, AXIS_ORDER, type AxisKey } from "../../engine/job/axes.js";
import { COLUMNS } from "../../engine/job/columns.js";
import { crowdLabel, unitLabel } from "../../ui/labels.js";

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
 * to say what it does. The notebook this console replaced shipped the failure - a reaction-time
 * slider directly above a true-effect tile, when reaction time is flat on true effect (0.290 to
 * 0.269, inside seed noise) and moves minimum clearance monotonically instead.
 *
 * PanelValues is a frozen plain record and is what a job is built from. PanelHandle has function
 * members and never leaves the main thread.
 */

export interface PanelValues {
  readonly kind: "panelValues";
  readonly axisValues: Readonly<Record<AxisKey, number>>;
  readonly pedestriansSeeRobot: boolean;
  /**
   * Which crowd the room runs, and deliberately not an axis. Every other control here is either a
   * numeric knob out of `AXES` or a switch; this one is a choice between two kernels, which has no
   * minimum, no maximum and nothing in between, so it is a picker of its own rather than a scale
   * with two notches on it.
   */
  readonly crowdModel: CrowdModelKey;
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
  /**
   * Where the controls open, when that is not their defaults. This is the seam a permalink comes
   * in through: `web/console.ts` decodes the query string before mounting and hands the result
   * here, so the panel is never built at the defaults and then corrected — the operator never
   * sees a flash of settings that are not the link's. Omitted, every control opens where its
   * catalogue entry says.
   *
   * A control is allowed to refuse: the crowd count is a fixed list of choices and a slider snaps
   * to its own notches, so `read()` can legitimately hand back something other than what was
   * passed in. Nothing is silently rounded off in secret — the caller compares the two and prints
   * the difference (`settingsNotHonoured` in `web/app/console/permalink.ts`).
   */
  readonly initial?: PanelValues;
}

export interface PanelHandle {
  readonly kind: "panelHandle";
  readonly root: HTMLElement;
  readonly read: () => PanelValues;
}

export const SEED_COUNT_CHOICES: readonly number[] = Object.freeze([1, 2, 4, 8, 16]);

/** At this crowd and above, the preview waits for the end of the drag rather than re-simulating
 *  on every keystroke of the slider. 92 ms a frame is not a preview. The comparison is `>=` and
 *  this is exactly `crowdSize`'s own maximum, so a strict `>` would make the note unreachable. */
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
  crowdModel: CrowdModelKey;
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

  let crowdModelIsKnown = false;
  for (const key of CROWD_MODEL_ORDER) {
    if (key === init.crowdModel) {
      crowdModelIsKnown = true;
    }
  }
  if (!crowdModelIsKnown) {
    fail(`the crowd must be one this bench can run, got '${String(init.crowdModel)}'`);
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
    crowdModel: init.crowdModel,
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

/**
 * The nearest crowd count this panel actually offers.
 *
 * The seed picker is a fixed list, not a number field, so a link asking for three crowds has no
 * option to select. Assigning an unlisted value to a `<select>` leaves it reading the empty
 * string, which `makePanelValues` would then reject as a crowd count of zero — a legal link
 * crashing the boot. Snapping to the nearest offered choice is what the control can honestly do;
 * saying so is the caller's job.
 */
function nearestSeedCount(requested: number): number {
  let best = 1;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const choice of SEED_COUNT_CHOICES) {
    const gap = Math.abs(requested - choice);
    if (gap < bestGap) {
      best = choice;
      bestGap = gap;
    }
  }
  return best;
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

  /**
   * The crowd picker, and the one control here that is not a number.
   *
   * It sits with the room rather than with the ruler because it changes what the people do, not how
   * they are measured. Its options say what each crowd DOES — one reacts to whoever is beside a
   * person now, the other to whoever they are about to meet — because that difference is the whole
   * reason the second one exists, and because the kernels' own names are code and a reader never
   * sees one.
   */
  const crowdSelect = doc.createElement("select");
  crowdSelect.id = "crowd-model";
  for (const key of CROWD_MODEL_ORDER) {
    const option = doc.createElement("option");
    option.value = key;
    option.textContent = crowdLabel(key);
    crowdSelect.append(option, sep(doc));
  }
  // Read off the table's own first entry rather than typed here: that entry is the crowd every
  // fixture and pinned measurement in this repo was taken on, and a hand-written default would be
  // free to disagree with it.
  const firstCrowdOption = crowdSelect.options[0];
  if (firstCrowdOption !== undefined) {
    crowdSelect.value = firstCrowdOption.value;
  }
  const crowdControl = doc.createElement("label");
  crowdControl.className = "control";
  crowdControl.append(doc.createTextNode("The crowd is "), crowdSelect);
  worldGroup.append(crowdControl, sep(doc));

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

  // This group used to end in its own live "N runs — about X s" line (a rough estimate, always
  // visible here regardless of which page mounts this panel). Task 27 added an accurate,
  // `describeCost`-driven line beside the actual Run button in web/console.ts's `.run-block`,
  // appended after this panel — and left this one in place, reachable at the same id, so the page
  // briefly showed two differently-worded, identically-formatted answers to "how long will this
  // take" side by side (they can disagree by ~20% away from default settings: `describeCost`'s
  // quadratic fit against this file's linear one). A reader is never supposed to have to guess
  // which of two adjacent numbers is right, so this line is gone rather than merely disambiguated
  // — `web/console.ts`'s line is the only one now, and it sits next to the button it prices.
  // `estimateRunSeconds` stays exported: it is still a correct, tested pure function, just no
  // longer wired to a DOM node here.

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
      // A `<select>` reads back "" when it is given a value it has no option for, so this is
      // asserted rather than assumed: `makePanelValues` refuses anything that is not one of the
      // two crowds, the same way it refuses a slider value off its own range.
      crowdModel: crowdSelect.value as CrowdModelKey,
      sweepAxis: axisKey,
      sweepValues: axisKey === null ? [] : parseValues(),
      seedCount: Number(seedSelect.value),
      bandReplicates: bandToggle.checked ? Number(bandCount.value) : null,
      detectionFloor: floorToggle.checked,
      frechet: frechetToggle.checked,
      zeroReferenceRun: zeroToggle.checked,
    });
  }

  /**
   * Everything the panel says about its own state, and nothing about anybody else's.
   *
   * Split out of `refresh` so the initial application below can bring the readouts and the
   * debounce note into line with the values it just wrote WITHOUT calling `onInput`. Mounting has
   * never pushed the settings it starts at (`web/console.ts` pulls them from `read()` instead),
   * and a permalink must not be the one case that changes that.
   */
  function paintReadouts(): void {
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
  }

  function refresh(): void {
    paintReadouts();
    const values = read();
    options.onInput(values);
  }

  const initial = options.initial;
  if (initial !== undefined) {
    for (const key of AXIS_ORDER) {
      const slider = sliders.get(key);
      if (slider !== undefined) {
        // Assignment, then read back: a range input sanitises what it is given against its own
        // min, max and step, so this line is where a link's 18.5 people quietly becomes 18. The
        // caller is what makes that audible.
        slider.value = String(initial.axisValues[key]);
      }
    }
    seeRobot.checked = initial.pedestriansSeeRobot;
    crowdSelect.value = initial.crowdModel;
    if (initial.sweepAxis === null) {
      axisSelect.value = "";
      valuesField.value = "";
      valuesField.disabled = true;
    } else {
      axisSelect.value = initial.sweepAxis;
      valuesField.disabled = false;
      const written: string[] = [];
      for (const value of initial.sweepValues) {
        written.push(String(value));
      }
      valuesField.value = written.join(" ");
    }
    seedSelect.value = String(nearestSeedCount(initial.seedCount));
    bandToggle.checked = initial.bandReplicates !== null;
    if (initial.bandReplicates !== null) {
      bandCount.value = String(initial.bandReplicates);
    }
    floorToggle.checked = initial.detectionFloor;
    frechetToggle.checked = initial.frechet;
    zeroToggle.checked = initial.zeroReferenceRun;
    paintReadouts();
  }

  for (const key of AXIS_ORDER) {
    const slider = sliders.get(key);
    if (slider !== undefined) {
      slider.addEventListener("input", refresh);
    }
  }
  seeRobot.addEventListener("change", refresh);
  crowdSelect.addEventListener("change", refresh);
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

  return Object.freeze({ kind: "panelHandle" as const, root, read });
}
