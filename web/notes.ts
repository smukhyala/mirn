import { makeRunConfig, SIM_CONSTANTS, type RunConfig } from "./engine/contracts/config.js";
import { runPair, type RunResult } from "./engine/sim/run.js";
import { clearance, deviation, robotCost } from "./engine/measure/metrics.js";
import { seededPermutations, splitHalfNull } from "./engine/measure/null/splitHalf.js";
import { frameIndexAt, type PlaybackBase } from "./app/clock.js";
import { drawArena, fitCanvas, type ArenaHighlight, type ArenaView } from "./ui/arena.js";
import { drawSweep, type PlotSeries } from "./ui/plot.js";
import { anchorFor } from "./ui/labels.js";
import { isKnownControl } from "./build/widgets.js";
import FACTS from "./data/experiment-facts.json";

/**
 * Hydrates the widgets on a compiled notes page.
 *
 * The prose, the mathematics and every cited number are already in the HTML; nothing here is
 * required to read the argument. This file makes the figures move, makes the workings openable,
 * and keeps the live numbers in step with the controls.
 *
 * Page 2 tells the reader: "Every number on this site opens like that. If one does not, it is a
 * bug and I would like to know." That was false in three separate ways — the workings rendered
 * permanently open, nothing was clickable, and nothing lit up on the canvas. Making it true is
 * most of what this file now does.
 */

interface FactRow {
  readonly [key: string]: number;
}
interface FactTable {
  readonly axis: string;
  readonly nSeeds: number;
  readonly rows: readonly FactRow[];
}
const FACT_TABLES = FACTS as unknown as Record<string, FactTable>;

const TABLE_ALIASES: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {};
  for (const key of Object.keys(FACT_TABLES)) {
    map[key] = key;
    const short = /^(e\d)_/.exec(key);
    if (short !== null) {
      map[short[1] as string] = key;
    }
  }
  return map;
})();

/**
 * Axis names in the facts file are code identifiers, and guardrail 12 forbids one of those
 * reaching a reader. Anything not listed here falls back to the raw key, which is ugly on purpose:
 * an ugly axis in review is better than a silently plausible wrong one.
 */
const AXIS_LABELS: Readonly<Record<string, string>> = {
  horizonS: "how far ahead the forecast is rolled (seconds)",
  nPedestrians: "people in the room",
  repulsionScale: "how much space the robot demands (multiples of the default)",
  maxSpeed: "robot top speed (metres per second)",
  passingOffsetM: "how far off centre the robot passes (metres)",
  closestApproachFromM: "how close that person ever came to the robot (metres)",
  positionSigmaM: "error in the robot's view of where people are (metres)",
  deflectionWeight: "how hard the planner tries to stay out of the way",
};

/**
 * The same problem one level up: a table key is a code identifier too.
 *
 * The provenance note under a cited number used to read "from the e1_push_strength sweep", which
 * is a variable name in the one sentence whose entire job is to tell a reader with no repository
 * where a figure came from. Same fallback rule as the axes above — an unlisted table shows its raw
 * key, which is ugly on purpose, and `web/app/__tests__/render.test.ts` fails on it rather than
 * letting it ship.
 */
const TABLE_LABELS: Readonly<Record<string, string>> = {
  e1_push_strength: "push-strength",
  e2_density: "crowd-size",
  e3_robot_speed: "robot-speed",
  e4_recovery: "passing-distance",
  e5_propagation: "distance-from-the-robot",
  e6_perception: "perception-noise",
  e7_politeness: "politeness",
  confounding_squeeze: "forecast-horizon",
  detection_floor: "detection-floor",
};

const PRESETS: Readonly<Record<string, () => RunConfig>> = {
  "corridor-11": () => makeRunConfig({ nTicks: 800 }),
  // The same room with nobody responding to the robot, which is how a robot-free crowd is shown:
  // the control arm of this pair IS the room with no robot in it.
  "corridor-11-control": () => makeRunConfig({ nTicks: 800, pedestriansSeeRobot: false }),
};

// ---------------------------------------------------------------- cross-widget wiring

/**
 * The page's widgets talk to each other in exactly two ways, and no more.
 *
 * A derivation opening needs to tell the scene which two points it is about. And a live number in
 * a sentence needs to follow the scene's controls, or "for the seed on screen, the effect comes to
 * X" becomes a lie the moment the reader moves the seed.
 */
interface MountedScene {
  readonly setHighlight: (highlight: ArenaHighlight | null, sample: number | null) => void;
}
let primaryScene: MountedScene | null = null;

type ConfigListener = (config: RunConfig) => void;
const configListeners: ConfigListener[] = [];
let latestSceneConfig: RunConfig | null = null;

function onSceneConfig(listener: ConfigListener): void {
  configListeners.push(listener);
  if (latestSceneConfig !== null) {
    listener(latestSceneConfig);
  }
}

function emitSceneConfig(config: RunConfig): void {
  latestSceneConfig = config;
  for (const listener of configListeners) {
    listener(config);
  }
}

/** Spans the build wrote from `{{q:...}}`, indexed by their reference. */
const liveSpans = new Map<string, HTMLElement[]>();

function registerLiveSpans(): void {
  for (const span of Array.from(document.querySelectorAll<HTMLElement>("[data-quantity]"))) {
    const ref = span.getAttribute("data-quantity");
    if (ref === null) {
      continue;
    }
    const list = liveSpans.get(ref) ?? [];
    list.push(span);
    liveSpans.set(ref, list);
  }
}

function publishLive(widgetId: string, fields: Readonly<Record<string, string>>): void {
  if (widgetId.length === 0) {
    return;
  }
  for (const [field, text] of Object.entries(fields)) {
    const ref = field === "default" ? widgetId : `${widgetId}.${field}`;
    for (const span of liveSpans.get(ref) ?? []) {
      span.textContent = text;
    }
  }
}

// ---------------------------------------------------------------- scene widget

interface SceneConfig {
  readonly preset?: string;
  readonly controls?: readonly string[];
  readonly caption?: string;
  readonly showControl?: boolean;
  readonly seeRobot?: boolean;
}

/** Every dial a page may name, and what it does to the configuration. */
interface Knob {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly initial: number;
  readonly format: (v: number) => string;
  readonly apply: (base: RunConfig, v: number) => RunConfig;
}

const KNOBS: Readonly<Record<string, Knob>> = {
  repulsionScale: {
    label: "space the robot demands",
    min: 0,
    max: 3,
    step: 0.25,
    initial: 1,
    format: (v) => `${v.toFixed(2)}×`,
    apply: (base, v) => makeRunConfig({ ...base, robot: { ...base.robot, repulsionScale: v } }),
  },
  crowdSize: {
    label: "people",
    min: 4,
    max: 44,
    step: 2,
    initial: 18,
    format: (v) => String(Math.round(v)),
    apply: (base, v) =>
      makeRunConfig({ ...base, crowd: { ...base.crowd, nPedestrians: Math.round(v) } }),
  },
  robotSpeed: {
    label: "robot top speed",
    min: 0.4,
    max: 1.8,
    step: 0.1,
    initial: 1.1,
    format: (v) => `${v.toFixed(1)} m/s`,
    apply: (base, v) => makeRunConfig({ ...base, robot: { ...base.robot, maxSpeed: v } }),
  },
  passingOffset: {
    label: "how far off centre it passes",
    min: 0,
    max: 3,
    step: 0.25,
    initial: 0,
    format: (v) => `${v.toFixed(2)} m`,
    apply: (base, v) =>
      makeRunConfig({
        ...base,
        robot: { ...base.robot, startXY: [2, 6.5 - v], goalXY: [20, 6.5 - v] },
      }),
  },
  perceptionNoise: {
    label: "error in what the robot sees",
    min: 0,
    max: 0.8,
    step: 0.05,
    initial: 0,
    format: (v) => `${v.toFixed(2)} m`,
    apply: (base, v) =>
      makeRunConfig({ ...base, perception: { ...base.perception, positionSigmaM: v } }),
  },
  deflectionWeight: {
    label: "how hard it tries to stay out of the way",
    min: 0,
    max: 6,
    step: 0.5,
    initial: 0,
    format: (v) => v.toFixed(1),
    apply: (base, v) => makeRunConfig({ ...base, robot: { ...base.robot, deflectionWeight: v } }),
  },
  seed: {
    label: "a different crowd",
    min: 0,
    max: 20,
    step: 1,
    initial: 0,
    format: (v) => String(Math.round(v)),
    apply: (base, v) => makeRunConfig({ ...base, seed: base.seed + Math.round(v) * 7919 }),
  },
};

function mountScene(host: HTMLElement, config: SceneConfig): void {
  const presetName = config.preset ?? "corridor-11";
  const lookup = PRESETS[presetName];
  if (lookup === undefined) {
    host.textContent = `unknown scene preset '${presetName}'`;
    host.classList.add("widget-error");
    return;
  }
  const preset: () => RunConfig = lookup;
  const requested = config.controls ?? ["play", "scrub"];

  const unknown = requested.filter((name) => !isKnownControl(name));
  if (unknown.length > 0) {
    // Loudly, not silently. Six pages once told the reader to "drag the dial" for a control the
    // runtime quietly ignored, and the only symptom was a slider that was never there.
    host.textContent = `this figure asks for controls that do not exist: ${unknown.join(", ")}`;
    host.classList.add("widget-error");
    return;
  }

  const controls = new Set(requested);
  let seeRobot = config.seeRobot ?? true;
  let showControl = config.showControl ?? true;
  let showGaps = showControl;
  let highlight: ArenaHighlight | null = null;
  const knobValues = new Map<string, number>();
  for (const name of controls) {
    const knob = KNOBS[name];
    if (knob !== undefined) {
      knobValues.set(name, knob.initial);
    }
  }

  const canvas = document.createElement("canvas");
  canvas.className = "widget-arena";
  canvas.setAttribute("role", "img");
  const bar = document.createElement("div");
  bar.className = "widget-transport";
  host.append(canvas, bar);

  function build(): RunConfig {
    let next = makeRunConfig({ ...preset(), pedestriansSeeRobot: seeRobot });
    for (const [name, value] of knobValues) {
      const knob = KNOBS[name] as Knob;
      next = knob.apply(next, value);
    }
    return next;
  }

  let result: RunResult = runPair(build());
  let playing = true;
  let sample = 0;
  let base: PlaybackBase = {
    wallStartMs: performance.now(),
    sampleAtStart: 0,
    dtMs: result.config.dt * 1000,
    rate: 1,
  };

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.textContent = "Pause";
  function setPlaying(next: boolean): void {
    playing = next;
    playButton.textContent = playing ? "Pause" : "Play";
    base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
  }
  playButton.addEventListener("click", () => setPlaying(!playing));

  const scrub = document.createElement("input");
  scrub.type = "range";
  scrub.min = "0";
  scrub.max = String(result.config.nTicks);
  scrub.step = "1";
  scrub.className = "widget-scrub";
  scrub.setAttribute("aria-label", "Timeline");
  scrub.addEventListener("input", () => {
    sample = Number(scrub.value);
    base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
  });

  const readout = document.createElement("span");
  readout.className = "widget-readout";

  function rerun(): void {
    const next = build();
    result = runPair(next);
    sample = Math.min(sample, result.config.nTicks);
    scrub.max = String(result.config.nTicks);
    base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
    emitSceneConfig(next);
  }

  if (controls.has("play")) {
    bar.append(playButton);
  }
  if (controls.has("scrub")) {
    bar.append(scrub);
  }
  bar.append(readout);

  if (controls.has("showControl")) {
    bar.append(
      toggle("Show the robot-free run", showControl, (on) => {
        showControl = on;
        showGaps = on;
      }),
    );
  }
  if (controls.has("showGaps")) {
    bar.append(
      toggle("Show the gap", showGaps, (on) => {
        showGaps = on;
      }),
    );
  }
  if (controls.has("seeRobot")) {
    bar.append(
      toggle("People notice the robot", seeRobot, (on) => {
        seeRobot = on;
        rerun();
      }),
    );
  }
  for (const name of controls) {
    const knob = KNOBS[name];
    if (knob === undefined) {
      continue;
    }
    bar.append(
      slider(knob, (value) => {
        knobValues.set(name, value);
        rerun();
      }),
    );
  }

  function describe(): string {
    const dev = deviation(result.pair);
    const gap = dev.series[sample] ?? 0;
    // Guardrails 6 and 7: a metre never appears on its own. The anchor is the cheapest thing that
    // gives it scale, and it is the same wording the derivation panels use.
    return `typical gap ${gap.toFixed(3)} m — ${anchorFor(gap)}`;
  }

  // Written once at mount as well as every frame. The animation loop below never starts if the
  // canvas has no 2d context, and a reader in that position was shown an empty readout instead of
  // a number.
  readout.textContent = describe();

  const context = canvas.getContext("2d");
  if (context === null) {
    return;
  }

  function frame(nowMs: number): void {
    const nSamples = result.config.nTicks + 1;
    if (playing) {
      const next = frameIndexAt(nowMs, base, nSamples);
      if (next >= nSamples - 1) {
        sample = 0;
        base = { ...base, wallStartMs: nowMs, sampleAtStart: 0 };
      } else {
        sample = next;
      }
      scrub.value = String(sample);
    }
    const box = fitCanvas(canvas, window.devicePixelRatio);
    const view: ArenaView = {
      widthM: result.config.widthM,
      heightM: result.config.heightM,
      sample,
      nSamples,
      treated: result.treated.positions,
      control: result.control.positions,
      robot: result.treated.robotPositions,
      showControl,
      showGaps,
      trailSamples: 90,
      pedRadiusM: SIM_CONSTANTS.pedRadiusM,
      robotRadiusM: SIM_CONSTANTS.robotRadiusM,
      highlight,
    };
    drawArena(context as CanvasRenderingContext2D, view, box.width, box.height);
    const text = describe();
    readout.textContent = text;
    canvas.setAttribute(
      "aria-label",
      `The same crowd run twice, once with a robot and once without. At ` +
        `${(sample * result.config.dt).toFixed(1)} seconds the ${text}.`,
    );
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (primaryScene === null) {
    primaryScene = {
      setHighlight: (next, atSample) => {
        highlight = next;
        if (atSample !== null) {
          sample = atSample;
          scrub.value = String(sample);
          setPlaying(false);
        }
      },
    };
  }
  emitSceneConfig(build());
}

function toggle(label: string, initial: boolean, onChange: (on: boolean) => void): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.className = "widget-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = initial;
  input.addEventListener("change", () => onChange(input.checked));
  wrapper.append(input, document.createTextNode(label));
  return wrapper;
}

function slider(knob: Knob, onChange: (value: number) => void): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.className = "widget-knob";
  const text = document.createElement("span");
  text.textContent = `${knob.label} ${knob.format(knob.initial)}`;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(knob.min);
  input.max = String(knob.max);
  input.step = String(knob.step);
  input.value = String(knob.initial);
  input.setAttribute("aria-label", knob.label);
  input.addEventListener("input", () => {
    const value = Number(input.value);
    text.textContent = `${knob.label} ${knob.format(value)}`;
    onChange(value);
  });
  wrapper.append(text, input);
  return wrapper;
}

// ---------------------------------------------------------------- sweep widget

interface SweepSeriesConfig {
  readonly key: string;
  readonly label: string;
  readonly accent?: boolean;
}
interface SweepConfig {
  readonly experiment: string;
  readonly x?: string;
  readonly series: readonly SweepSeriesConfig[];
  readonly caption?: string;
  readonly yLabel?: string;
}

function mountSweep(host: HTMLElement, config: SweepConfig): void {
  const table = FACT_TABLES[config.experiment];
  if (table === undefined) {
    host.textContent = `no measured data for experiment '${config.experiment}'`;
    host.classList.add("widget-error");
    return;
  }
  const xKey = config.x ?? table.axis;
  const x = table.rows.map((row) => row[xKey] as number);

  const series: PlotSeries[] = [];
  const legendClasses: string[] = [];
  let accentUsed = false;
  let greyIndex = 0;
  let anySd = false;

  for (const entry of config.series) {
    const values = table.rows.map((row) => row[entry.key] as number);
    if (values.some((v) => v === undefined)) {
      host.textContent = `experiment '${config.experiment}' has no column '${entry.key}'`;
      host.classList.add("widget-error");
      return;
    }
    const sdKey = `${entry.key}_sd`;
    const hasSd = table.rows[0] !== undefined && sdKey in table.rows[0];
    if (hasSd) {
      anySd = true;
    }
    const accent = entry.accent === true && !accentUsed;
    if (accent) {
      accentUsed = true;
      legendClasses.push("legend-accent");
    } else {
      legendClasses.push(`legend-grey-${greyIndex % 3}`);
      greyIndex++;
    }
    series.push({
      key: entry.key,
      label: entry.label,
      values,
      accent,
      ...(hasSd ? { sd: table.rows.map((row) => row[sdKey] as number) } : {}),
    });
  }

  const canvas = document.createElement("canvas");
  canvas.className = "widget-plot";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    `${config.series.map((s) => s.label).join(" and ")}, against ` +
      `${AXIS_LABELS[xKey] ?? xKey}. The measured values are cited in the surrounding text.`,
  );
  const legend = document.createElement("ul");
  legend.className = "widget-legend";
  for (let i = 0; i < series.length; i++) {
    const item = document.createElement("li");
    item.className = legendClasses[i] ?? "legend-grey-0";
    item.textContent = (series[i] as PlotSeries).label;
    legend.append(item);
  }

  // Built from what was ACTUALLY plotted. The fixed version of this sentence claimed a band under
  // every figure, including five sweeps with no spread recorded at all — and three of those pages
  // said so in the prose directly beside it, so the figure and the text contradicted each other
  // on the same screen.
  const note = document.createElement("p");
  note.className = "widget-note";
  if (xKey.startsWith("closestApproach")) {
    note.textContent =
      "Each point is a group of people pooled across every run, not a mean of runs, so no band " +
      "is drawn. What stands in for one is how many people are behind each point.";
  } else if (anySd) {
    note.textContent =
      `Every point is the mean of ${table.nSeeds} runs with different crowds. ` +
      `The band is one standard deviation across those runs.`;
  } else {
    note.textContent =
      `Every point is the mean of ${table.nSeeds} runs with different crowds. No spread was ` +
      `recorded for this sweep, so read its overall shape rather than the step between any two ` +
      `neighbouring points.`;
  }
  host.append(canvas, legend, note);

  const predicted = recallPrediction();
  if (predicted !== null) {
    const echo = document.createElement("p");
    echo.className = "widget-prediction-echo";
    echo.textContent = `You predicted: ${predicted}`;
    host.append(echo);
  }

  const context = canvas.getContext("2d");
  if (context === null) {
    return;
  }
  const render = (): void => {
    const box = fitCanvas(canvas, window.devicePixelRatio);
    drawSweep(
      context,
      { x, xLabel: AXIS_LABELS[xKey] ?? xKey, yLabel: config.yLabel ?? "metres", series },
      box.width,
      box.height,
    );
  };
  render();
  window.addEventListener("resize", render);
}

// ---------------------------------------------------------------- prediction gate

/**
 * An option is `{ id, label }` — never a bare string.
 *
 * What gets stored is the id, so rewording a label later does not orphan a reader's saved answer
 * or, worse, quietly stop matching it and show them nothing.
 */
interface PredictOption {
  readonly id: string;
  readonly label: string;
}

interface PredictConfig {
  readonly id?: string;
  readonly question?: string;
  readonly options?: readonly PredictOption[];
  readonly caption?: string;
}

function predictionKey(): string {
  return `mirn:prediction:${window.location.pathname}`;
}

function recallPrediction(): string | null {
  try {
    return window.localStorage.getItem(`${predictionKey()}:label`);
  } catch {
    return null;
  }
}

function recallPredictionId(): string | null {
  try {
    return window.localStorage.getItem(predictionKey());
  } catch {
    // Private browsing, or storage disabled. The gate degrades to "ask and do not remember",
    // which is still better than not asking.
    return null;
  }
}

/**
 * Commit before you look.
 *
 * An unrecorded prediction is a feeling you can retroactively claim to have had, and the whole
 * difference between reading a result and discovering one is whether you were on the hook. Five
 * experiment pages specified this and it was never implemented, so each rendered a red box saying
 * "unknown figure type 'predict'" exactly where the question should have been.
 */
function mountPredict(host: HTMLElement, config: PredictConfig): void {
  const options = config.options ?? [];
  if (options.length === 0) {
    host.textContent = "this prediction box has no options";
    host.classList.add("widget-error");
    return;
  }

  const fieldset = document.createElement("fieldset");
  fieldset.className = "predict";
  const legend = document.createElement("legend");
  legend.className = "predict-legend";
  legend.textContent = config.question ?? "What do you expect?";
  fieldset.append(legend);

  const list = document.createElement("div");
  list.className = "predict-options";
  const answered = document.createElement("p");
  answered.className = "predict-answered";
  answered.setAttribute("aria-live", "polite");

  function choose(option: PredictOption): void {
    try {
      window.localStorage.setItem(predictionKey(), option.id);
      window.localStorage.setItem(`${predictionKey()}:label`, option.label);
    } catch {
      // Private browsing, or storage disabled. The echo below still works for this visit.
    }
    for (const button of Array.from(list.querySelectorAll("button"))) {
      const chosen = button.getAttribute("data-option-id") === option.id;
      button.setAttribute("aria-pressed", String(chosen));
      button.classList.toggle("chosen", chosen);
    }
    answered.textContent =
      `You said: ${option.label} Nothing below is hidden from you — but you are on the hook now.`;
  }

  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "predict-option";
    button.textContent = option.label;
    button.setAttribute("data-option-id", option.id);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => choose(option));
    list.append(button);
  }

  fieldset.append(list, answered);
  host.append(fieldset);

  const alreadyId = recallPredictionId();
  const already = options.find((option) => option.id === alreadyId);
  if (already !== undefined) {
    choose(already);
  }
}

// ---------------------------------------------------------------- quantity widget

interface QuantityConfig {
  readonly caption?: string;
  readonly metric?: string;
  readonly id?: string;
}

interface Built {
  readonly value: string;
  readonly html: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly highlight: ArenaHighlight | null;
  readonly sample: number | null;
}

function column(heading: string, body: string): string {
  return `<div class="derivation-column"><p class="derivation-heading">${heading}</p>${body}</div>`;
}

function panelHtml(went: string, combined: string, means: string): string {
  return `<div class="derivation">${column("What went in", went)}${column("How it was combined", combined)}${column("What it means", means)}</div>`;
}

/** One person, one moment, two coordinates. The atom page 2 teaches. */
function buildDeviationAtom(config: RunConfig): Built {
  const result = runPair(config);
  const dev = deviation(result.pair);
  const step = dev.maxAtStep;

  let worstAgent = 0;
  let worstGap = -1;
  for (let i = 0; i < result.treated.positions.length; i++) {
    const a = result.treated.positions[i] as Float64Array;
    const b = result.control.positions[i] as Float64Array;
    const dx = (a[2 * step] as number) - (b[2 * step] as number);
    const dy = (a[2 * step + 1] as number) - (b[2 * step + 1] as number);
    const gap = Math.sqrt(dx * dx + dy * dy);
    if (gap > worstGap) {
      worstGap = gap;
      worstAgent = i;
    }
  }

  const a = result.treated.positions[worstAgent] as Float64Array;
  const b = result.control.positions[worstAgent] as Float64Array;
  const px = a[2 * step] as number;
  const py = a[2 * step + 1] as number;
  const qx = b[2 * step] as number;
  const qy = b[2 * step + 1] as number;
  const dx = px - qx;
  const dy = py - qy;
  const value = Math.sqrt(dx * dx + dy * dy);
  const seconds = step * config.dt;

  // One more digit inside the derivation than in the prose. If the chain ended on the same
  // rounding as the headline, a reader who checked the square root would find a discrepancy and
  // quietly stop trusting the site.
  const html = panelHtml(
    `<p><span class="glyph-filled">●</span> p at ${seconds.toFixed(2)} s<br>
        <span class="mono">(${px.toFixed(2)}, ${py.toFixed(2)})</span><br>
        <span class="derivation-provenance">the run with the robot</span></p>
     <p><span class="glyph-hollow">○</span> q at ${seconds.toFixed(2)} s<br>
        <span class="mono">(${qx.toFixed(2)}, ${qy.toFixed(2)})</span><br>
        <span class="derivation-provenance">the run without it</span></p>`,
    `<p class="mono derivation-chain">
        d = ‖p − q‖<br>
        &nbsp; = √(Δx² + Δy²)<br>
        &nbsp; = √(${dx.toFixed(2)}² + ${dy.toFixed(2)}²)<br>
        &nbsp; = √${(dx * dx + dy * dy).toFixed(4)}<br>
        &nbsp; = ${value.toFixed(4)} m
     </p><p class="derivation-units">all lengths in metres</p>`,
    `<p>At ${seconds.toFixed(1)} seconds this person — the furthest off course of anybody at that
        moment — was <span class="accent-number">${value.toFixed(2)} m</span> from where they
        would have been standing in the run with no robot.</p>
     <p class="derivation-anchor">About ${anchorFor(value)}.</p>`,
  );

  return {
    value: `${value.toFixed(2)} m`,
    html,
    fields: { default: `${value.toFixed(2)} m`, anchor: anchorFor(value) },
    highlight: { agentIndex: worstAgent, labelP: "p", labelQ: "q" },
    sample: step,
  };
}

/**
 * The same run squeezed two ways.
 *
 * This exists because the atom above was being shown on the page that talks about mean versus
 * maximum — so a panel reading 2.87 m sat directly above a sentence saying "two answers: 0.352 m
 * and 0.761 m", on the one page whose subject is that a number must carry its rule around with it.
 */
function buildDeviationSummary(config: RunConfig): Built {
  const result = runPair(config);
  const dev = deviation(result.pair);
  const n = dev.series.length;
  const peakSeconds = dev.maxAtStep * config.dt;

  const html = panelHtml(
    `<p>${dev.perAgentM.length} people, each with a deviation at every one of ${n} ticks<br>
        <span class="derivation-provenance">averaged across people first, leaving one curve</span></p>
     <p>that curve's highest point,<br>at ${peakSeconds.toFixed(2)} s</p>`,
    `<p class="mono derivation-chain">
        mean = (1/${n}) Σ d(t)<br>
        &nbsp; = ${dev.meanM.toFixed(4)} m<br><br>
        max = max over t of d(t)<br>
        &nbsp; = ${dev.maxM.toFixed(4)} m
     </p><p class="derivation-units">all lengths in metres</p>`,
    `<p>Typically the crowd sat <span class="accent-number">${dev.meanM.toFixed(2)} m</span> from
        where it would have been. At its worst moment it sat
        <span class="accent-number">${dev.maxM.toFixed(2)} m</span> away.</p>
     <p class="derivation-anchor">The first is about ${anchorFor(dev.meanM)}; the second about
        ${anchorFor(dev.maxM)}. Same run, same arithmetic underneath, two answers.</p>`,
  );

  return {
    value: `${dev.meanM.toFixed(3)} m and ${dev.maxM.toFixed(3)} m`,
    html,
    fields: {
      default: `${dev.meanM.toFixed(3)} m`,
      mean: `${dev.meanM.toFixed(3)} m`,
      max: `${dev.maxM.toFixed(3)} m`,
      anchor: anchorFor(dev.meanM),
    },
    highlight: null,
    sample: dev.maxAtStep,
  };
}

function buildFloor(config: RunConfig): Built {
  const result = runPair(config);
  const control = result.control.positions;
  const nullResult = splitHalfNull(control, 40, seededPermutations(20260816));
  const half = Math.floor(control.length / 2);
  const sorted = Float64Array.from(nullResult.samples).sort();
  const lowest = sorted[0] as number;
  const highest = sorted[sorted.length - 1] as number;

  const html = panelHtml(
    `<p>${control.length} people, from the run with no robot in it<br>
        <span class="derivation-provenance">every position sampled along each crossing</span></p>
     <p>${nullResult.nSplits} shuffles<br>
        <span class="derivation-provenance">each dealing ${half} people against ${half}</span></p>`,
    `<p class="mono derivation-chain">
        each shuffle → one divergence<br>
        ${nullResult.nSplits} answers, from<br>
        &nbsp; ${lowest.toFixed(3)} m to ${highest.toFixed(3)} m<br>
        floor = 95th percentile<br>
        &nbsp; = ${nullResult.floor.toFixed(4)} m
     </p><p class="derivation-units">all lengths in metres</p>`,
    `<p>Split this robot-free crowd in half at random and the two halves differ by
        <span class="accent-number">${nullResult.floor.toFixed(2)} m</span> or less on 95 shuffles
        in a hundred. No robot was involved in any of them.</p>
     <p class="derivation-anchor">An effect smaller than that is not absent. It is invisible at
        this many people.</p>`,
  );

  return {
    value: `${nullResult.floor.toFixed(3)} m`,
    html,
    fields: {
      default: `${nullResult.floor.toFixed(3)} m`,
      floor: `${nullResult.floor.toFixed(3)} m`,
      mean: `${nullResult.mean.toFixed(3)} m`,
    },
    highlight: null,
    sample: null,
  };
}

/** One subtraction: when it arrived, minus when it would have. */
function buildTimeLost(config: RunConfig): Built {
  const result = runPair(config);
  const cost = robotCost(result.treated, result.control, config.dt);
  const arrived = Number.isFinite(cost.treatedArrivalS);

  const html = panelHtml(
    `<p>the tick the robot stopped moving<br>
        <span class="derivation-provenance">${
          arrived ? `${cost.treatedArrivalS.toFixed(2)} s` : "it never arrived within the episode"
        }</span></p>
     <p>the distance it covered getting there<br>
        <span class="mono">${cost.treatedPathM.toFixed(2)} m</span></p>`,
    `<p class="mono derivation-chain">
        arrival = first tick with<br>
        &nbsp; no further movement<br>
        &nbsp; = ${arrived ? `${cost.treatedArrivalS.toFixed(3)} s` : "censored"}
     </p><p class="derivation-units">time in seconds, distance in metres</p>`,
    `<p>${
      arrived
        ? `The robot finished its crossing after <span class="accent-number">${cost.treatedArrivalS.toFixed(1)} s</span>, having travelled ${cost.treatedPathM.toFixed(1)} m.`
        : `The robot never finished its crossing inside this episode, so its arrival time is not a number. It is a lower bound, and the tile says so rather than printing one.`
    }</p>
     <p class="derivation-anchor">A person's time lost is the same subtraction done on their
        arrival: when they got there, minus when they would have. Unlike a deviation it never
        comes back, because the seconds are spent.</p>`,
  );

  return {
    value: arrived ? `${cost.treatedArrivalS.toFixed(2)} s` : "never arrives",
    html,
    fields: {
      default: arrived ? `${cost.treatedArrivalS.toFixed(2)} s` : "never arrives",
      path: `${cost.treatedPathM.toFixed(2)} m`,
    },
    highlight: null,
    sample: null,
  };
}

/** A count with a threshold inside it, and the threshold is a choice. */
function buildNearMiss(config: RunConfig): Built {
  const result = runPair(config);
  const thresholds = [0.3, 0.5, 0.8];
  const counted = thresholds.map((t) =>
    clearance(
      result.treated.robotPositions,
      result.treated.positions,
      SIM_CONSTANTS.robotRadiusM,
      SIM_CONSTANTS.pedRadiusM,
      t,
    ),
  );
  const middle = counted[1] as ReturnType<typeof clearance>;

  const rows: string[] = [];
  for (let i = 0; i < thresholds.length; i++) {
    const c = counted[i] as ReturnType<typeof clearance>;
    rows.push(`&nbsp; under ${(thresholds[i] as number).toFixed(1)} m → ${c.nearMissEpisodes}`);
  }

  const html = panelHtml(
    `<p>the robot's path against everybody else's<br>
        <span class="derivation-provenance">measured surface to surface, so it can go negative
        when a soft-bodied model lets bodies overlap</span></p>
     <p>closest it ever came<br>
        <span class="mono">${middle.minM.toFixed(3)} m</span></p>`,
    `<p class="mono derivation-chain">
        count separate occasions<br>
        the clearance dipped below<br>
        a threshold you choose:<br><br>
        ${rows.join("<br>")}
     </p><p class="derivation-units">all lengths in metres</p>`,
    `<p>At a threshold of half a metre this run contains
        <span class="accent-number">${middle.nearMissEpisodes}</span> near misses. Stricter and it
        contains fewer; looser and it contains more.</p>
     <p class="derivation-anchor">The number moved and the run did not. A metric with a threshold
        inside it is part measurement and part opinion, and the honest thing is to show it at
        several thresholds and see whether the conclusion survives all of them.</p>`,
  );

  return {
    value: `${middle.nearMissEpisodes} near misses`,
    html,
    fields: {
      default: String(middle.nearMissEpisodes),
      clearance: `${middle.minM.toFixed(3)} m`,
    },
    highlight: null,
    sample: middle.minAtStep >= 0 ? middle.minAtStep : null,
  };
}

const BUILDERS: Readonly<Record<string, (config: RunConfig) => Built>> = {
  deviation: buildDeviationAtom,
  perturbation: buildDeviationSummary,
  "deviation-summary": buildDeviationSummary,
  "detection-floor": buildFloor,
  timeLost: buildTimeLost,
  nearMiss: buildNearMiss,
};

function mountQuantity(host: HTMLElement, config: QuantityConfig): void {
  const lookup = BUILDERS[config.metric ?? "deviation"];
  if (lookup === undefined) {
    // Explicit, not silent. Two pages asked for metrics that did not exist and were served the
    // deviation panel instead — a working for a quantity neither page was discussing.
    host.textContent = `this figure asks for a metric that does not exist: '${String(config.metric)}'`;
    host.classList.add("widget-error");
    return;
  }
  // Bound after the guard: TypeScript cannot carry a narrowing across the closure below.
  const builder: (config: RunConfig) => Built = lookup;

  const wrapper = document.createElement("div");
  wrapper.className = "quantity-widget";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "quantity-trigger";
  trigger.setAttribute("aria-expanded", "false");
  const panel = document.createElement("div");
  panel.className = "quantity-panel";
  panel.hidden = true;
  wrapper.append(trigger, panel);
  host.append(wrapper);

  let built: Built | null = null;

  trigger.addEventListener("click", () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
    if (primaryScene !== null && built !== null) {
      primaryScene.setHighlight(opening ? built.highlight : null, opening ? built.sample : null);
    }
  });

  function rebuild(runConfig: RunConfig): void {
    built = builder(runConfig);
    trigger.textContent = `${built.value} — show the working`;
    panel.innerHTML = built.html;
    publishLive(config.id ?? "", built.fields);
  }

  // Follows the page's scene, so a sentence saying "for the seed on screen" stays true when the
  // reader moves the seed.
  onSceneConfig(rebuild);
  if (latestSceneConfig === null) {
    rebuild(makeRunConfig({ nTicks: 800 }));
  }
}

// ---------------------------------------------------------------- fact provenance

/**
 * Makes the other numbers open too.
 *
 * Most numbers in the prose cite a measured sweep rather than a live quantity, so they have no
 * arithmetic to unfold — but they do have a provenance, and "where did this come from" is what
 * page 2 promises every number will answer. Clicking one says which experiment it came from, which
 * row, how many runs were averaged, and how much those runs disagreed.
 */
function wireFactProvenance(): void {
  for (const [ref, spans] of liveSpans) {
    const match =
      /^([A-Za-z0-9_]+)(?:\[(@?[A-Za-z0-9_]+)=(-?[\d.]+)\]|@(\d+|first|last))?\.([A-Za-z0-9_]+)(?:\.(sd|min|max))?$/.exec(
        ref,
      );
    if (match === null) {
      continue;
    }
    const tableName = TABLE_ALIASES[match[1] as string];
    if (tableName === undefined) {
      continue;
    }
    const table = FACT_TABLES[tableName] as FactTable;

    for (const span of spans) {
      span.setAttribute("role", "button");
      span.setAttribute("tabindex", "0");
      span.setAttribute("aria-expanded", "false");
      const reveal = (): void => {
        const existing = span.nextElementSibling;
        if (existing !== null && existing.classList.contains("provenance")) {
          existing.remove();
          span.setAttribute("aria-expanded", "false");
          return;
        }
        const note = document.createElement("span");
        note.className = "provenance";
        note.textContent = describeProvenance(tableName, table, match);
        span.after(note);
        span.setAttribute("aria-expanded", "true");
      };
      span.addEventListener("click", reveal);
      span.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          reveal();
        }
      });
    }
  }
}

function describeProvenance(tableName: string, table: FactTable, match: RegExpExecArray): string {
  const axisKey = match[2] === "@axis" ? table.axis : match[2];
  const axisValue = match[3];
  const rowIndex = match[4];
  const columnName = match[5] as string;
  const reducer = match[6];
  const sweep = TABLE_LABELS[tableName] ?? tableName;

  if (reducer === "min" || reducer === "max") {
    // The column is deliberately not named. It is a code identifier, and the reader is looking
    // straight at the figure it produced, so naming it costs a guardrail and buys nothing.
    return (
      ` — the ${reducer === "min" ? "smallest" : "largest"} of these readings across the ` +
      `whole ${sweep} sweep, each point itself a mean of ${table.nSeeds} runs.`
    );
  }

  let row: FactRow | undefined;
  let where = "";
  if (axisKey !== undefined && axisValue !== undefined) {
    row = table.rows.find((r) => Math.abs((r[axisKey] as number) - Number(axisValue)) < 1e-9);
    where = ` at ${AXIS_LABELS[axisKey] ?? axisKey} = ${axisValue}`;
  } else if (rowIndex === "first") {
    row = table.rows[0];
    where = " at the first point on the axis";
  } else if (rowIndex === "last") {
    row = table.rows[table.rows.length - 1];
    where = " at the last point on the axis";
  } else if (rowIndex !== undefined) {
    row = table.rows[Number(rowIndex)];
    where = ` at point ${rowIndex} on the axis`;
  } else {
    row = table.rows[0];
  }
  if (row === undefined) {
    return " — provenance unavailable.";
  }

  const sd = row[`${columnName}_sd`];
  const n = row[`${columnName}_n`];
  const parts: string[] = [` — from the ${sweep} sweep${where}`];
  if (n !== undefined && Number.isFinite(n) && n < table.nSeeds) {
    parts.push(`, averaged over ${n} of ${table.nSeeds} runs because the rest were censored`);
  } else {
    parts.push(`, averaged over ${table.nSeeds} runs with different crowds`);
  }
  if (sd !== undefined && Number.isFinite(sd)) {
    parts.push(`, which disagreed with each other by ${sd.toFixed(3)} either way`);
  }
  parts.push(".");
  return parts.join("");
}

// ---------------------------------------------------------------- boot

registerLiveSpans();

for (const host of Array.from(document.querySelectorAll<HTMLElement>("[data-mirn-widget]"))) {
  const raw = host.getAttribute("data-mirn-widget");
  if (raw === null) {
    continue;
  }
  let parsed: { kind: string; config: unknown };
  try {
    parsed = JSON.parse(raw) as { kind: string; config: unknown };
  } catch {
    host.textContent = "this figure's configuration could not be read";
    host.classList.add("widget-error");
    continue;
  }

  // The caption is already in the HTML, emitted at build time so it survives without scripts.
  host.replaceChildren();

  if (parsed.kind === "scene") {
    mountScene(host, parsed.config as SceneConfig);
  } else if (parsed.kind === "sweep") {
    mountSweep(host, parsed.config as SweepConfig);
  } else if (parsed.kind === "quantity") {
    mountQuantity(host, parsed.config as QuantityConfig);
  } else if (parsed.kind === "predict") {
    mountPredict(host, parsed.config as PredictConfig);
  } else {
    host.textContent = `unknown figure type '${parsed.kind}'`;
    host.classList.add("widget-error");
  }

}

wireFactProvenance();
