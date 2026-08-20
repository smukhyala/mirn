import { makeRunConfig, SIM_CONSTANTS, type RunConfig } from "./engine/contracts/config.js";
import { runPair, type RunResult } from "./engine/sim/run.js";
import { deviation } from "./engine/measure/metrics.js";
import { frameIndexAt, type PlaybackBase } from "./app/clock.js";
import { drawArena, fitCanvas, type ArenaView } from "./ui/arena.js";
import { drawSweep, type PlotSeries } from "./ui/plot.js";
import FACTS from "./data/experiment-facts.json";

/**
 * Hydrates the widgets on a compiled notes page.
 *
 * The prose and the mathematics are already in the HTML; nothing here is required to read the
 * argument. This file only turns the placeholders left by scripts/build-notes.ts into live
 * figures, so a reader without JavaScript loses the pictures and keeps the point.
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

const PRESETS: Readonly<Record<string, () => RunConfig>> = {
  "corridor-11": () => makeRunConfig({ nTicks: 800 }),
};

// ---------------------------------------------------------------- scene widget

interface SceneConfig {
  readonly preset?: string;
  readonly controls?: readonly string[];
  readonly caption?: string;
  readonly showControl?: boolean;
  readonly seeRobot?: boolean;
}

function mountScene(host: HTMLElement, config: SceneConfig): void {
  const presetName = config.preset ?? "corridor-11";
  const lookup = PRESETS[presetName];
  if (lookup === undefined) {
    host.textContent = `unknown scene preset '${presetName}'`;
    host.classList.add("widget-error");
    return;
  }
  // Bound after the guard so the closures below see a defined value rather than a narrowed one:
  // TypeScript cannot carry a narrowing across a function boundary.
  const preset: () => RunConfig = lookup;

  const controls = new Set(config.controls ?? ["play", "scrub"]);
  let seeRobot = config.seeRobot ?? true;
  let showControl = config.showControl ?? true;
  let seedOffset = 0;

  const canvas = document.createElement("canvas");
  canvas.className = "widget-arena";
  const bar = document.createElement("div");
  bar.className = "widget-transport";
  host.append(canvas, bar);

  let result: RunResult = runPair(build());
  let playing = true;
  let sample = 0;
  let base: PlaybackBase = {
    wallStartMs: performance.now(),
    sampleAtStart: 0,
    dtMs: result.config.dt * 1000,
    rate: 1,
  };

  function build(): RunConfig {
    const cfg = preset();
    return makeRunConfig({
      ...cfg,
      seed: cfg.seed + seedOffset * 7919,
      pedestriansSeeRobot: seeRobot,
    });
  }

  function rerun(): void {
    result = runPair(build());
    sample = Math.min(sample, result.config.nTicks);
    base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
    scrub.max = String(result.config.nTicks);
    readout.textContent = readoutText();
  }

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.textContent = "Pause";
  playButton.addEventListener("click", () => {
    playing = !playing;
    playButton.textContent = playing ? "Pause" : "Play";
    base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
  });

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

  function readoutText(): string {
    const dev = deviation(result.pair);
    return `typical gap ${dev.series[sample]?.toFixed(3) ?? "0.000"} m`;
  }

  if (controls.has("play")) {
    bar.append(playButton);
  }
  if (controls.has("scrub")) {
    bar.append(scrub);
  }
  bar.append(readout);

  if (controls.has("showControl")) {
    bar.append(toggle("Show the robot-free run", showControl, (on) => { showControl = on; }));
  }
  if (controls.has("seeRobot")) {
    bar.append(
      toggle("People notice the robot", seeRobot, (on) => {
        seeRobot = on;
        rerun();
      }),
    );
  }
  if (controls.has("seed")) {
    const seedInput = document.createElement("input");
    seedInput.type = "range";
    seedInput.min = "0";
    seedInput.max = "20";
    seedInput.step = "1";
    seedInput.value = "0";
    seedInput.className = "widget-seed";
    seedInput.setAttribute("aria-label", "Seed");
    seedInput.addEventListener("input", () => {
      seedOffset = Number(seedInput.value);
      rerun();
    });
    const label = document.createElement("label");
    label.className = "widget-toggle";
    label.append(seedInput, document.createTextNode("a different crowd"));
    bar.append(label);
  }

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
      showGaps: showControl,
      trailSamples: 90,
      pedRadiusM: SIM_CONSTANTS.pedRadiusM,
      robotRadiusM: SIM_CONSTANTS.robotRadiusM,
    };
    drawArena(context as CanvasRenderingContext2D, view, box.width, box.height);
    readout.textContent = readoutText();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
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
  const greyClasses: string[] = [];
  let accentUsed = false;
  let greyIndex = 0;
  for (const s of config.series) {
    const values = table.rows.map((row) => row[s.key] as number);
    if (values.some((v) => v === undefined)) {
      host.textContent = `experiment '${config.experiment}' has no column '${s.key}'`;
      host.classList.add("widget-error");
      return;
    }
    const sdKey = `${s.key}_sd`;
    const hasSd = table.rows[0] !== undefined && sdKey in table.rows[0];
    // At most one series may take the accent, because the accent means "this is the perturbation"
    // and a second one would make it mean "this is a line".
    const accent = s.accent === true && !accentUsed;
    if (accent) {
      accentUsed = true;
      greyClasses.push("legend-accent");
    } else {
      // The legend has to reproduce the stroke, not just name it. With hue gone, a swatch that is
      // the same for every grey series tells the reader nothing about which line is which.
      greyClasses.push(`legend-grey-${greyIndex % 3}`);
      greyIndex++;
    }
    series.push({
      key: s.key,
      label: s.label,
      values,
      accent,
      ...(hasSd ? { sd: table.rows.map((row) => row[sdKey] as number) } : {}),
    });
  }

  const canvas = document.createElement("canvas");
  canvas.className = "widget-plot";
  const legend = document.createElement("ul");
  legend.className = "widget-legend";
  for (let i = 0; i < series.length; i++) {
    const item = document.createElement("li");
    item.className = greyClasses[i] ?? "legend-grey-0";
    item.textContent = (series[i] as PlotSeries).label;
    legend.append(item);
  }
  const note = document.createElement("p");
  note.className = "widget-note";
  note.textContent = `Every point is the mean of ${table.nSeeds} runs with different crowds. The band is one standard deviation across those runs.`;
  host.append(canvas, legend, note);

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

// ---------------------------------------------------------------- quantity widget

function mountQuantity(host: HTMLElement, config: { readonly caption?: string }): void {
  const result = runPair(makeRunConfig({ nTicks: 800 }));
  const dev = deviation(result.pair);
  const step = dev.maxAtStep;

  const agents = result.treated.positions;
  let worstAgent = 0;
  let worstGap = -1;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i] as Float64Array;
    const b = result.control.positions[i] as Float64Array;
    const dx = (a[2 * step] as number) - (b[2 * step] as number);
    const dy = (a[2 * step + 1] as number) - (b[2 * step + 1] as number);
    const gap = Math.sqrt(dx * dx + dy * dy);
    if (gap > worstGap) {
      worstGap = gap;
      worstAgent = i;
    }
  }

  const a = agents[worstAgent] as Float64Array;
  const b = result.control.positions[worstAgent] as Float64Array;
  const px = a[2 * step] as number;
  const py = a[2 * step + 1] as number;
  const qx = b[2 * step] as number;
  const qy = b[2 * step + 1] as number;
  const dx = px - qx;
  const dy = py - qy;
  const value = Math.sqrt(dx * dx + dy * dy);
  const seconds = step * result.config.dt;

  // One more digit inside the derivation than in the prose. If the chain ended on the same
  // rounding as the headline, a reader who checked the square root would find a discrepancy and
  // quietly stop trusting the site.
  host.innerHTML = `
    <div class="derivation">
      <div class="derivation-column">
        <p class="derivation-heading">What went in</p>
        <p><span class="glyph-filled">●</span> p at ${seconds.toFixed(2)} s<br>
           <span class="mono">(${px.toFixed(2)}, ${py.toFixed(2)})</span><br>
           <span class="derivation-provenance">the run with the robot</span></p>
        <p><span class="glyph-hollow">○</span> q at ${seconds.toFixed(2)} s<br>
           <span class="mono">(${qx.toFixed(2)}, ${qy.toFixed(2)})</span><br>
           <span class="derivation-provenance">the run without it</span></p>
      </div>
      <div class="derivation-column">
        <p class="derivation-heading">How it was combined</p>
        <p class="mono derivation-chain">
          d = ‖p − q‖<br>
          &nbsp; = √(Δx² + Δy²)<br>
          &nbsp; = √(${dx.toFixed(2)}² + ${dy.toFixed(2)}²)<br>
          &nbsp; = √${(dx * dx + dy * dy).toFixed(4)}<br>
          &nbsp; = ${value.toFixed(4)} m
        </p>
        <p class="derivation-units">all lengths in metres</p>
      </div>
      <div class="derivation-column">
        <p class="derivation-heading">What it means</p>
        <p>At ${seconds.toFixed(1)} seconds this person was
           <span class="accent-number">${value.toFixed(2)} m</span> from where they would have been
           standing at that same moment in the run with no robot.</p>
        <p class="derivation-anchor">About ${anchorFor(value)}.</p>
      </div>
    </div>`;
}

/** A metre means nothing until it is a body-scale comparison. */
function anchorFor(metres: number): string {
  if (metres < 0.15) {
    return "less than the wobble of ordinary walking";
  }
  if (metres < 0.5) {
    return "half a stride";
  }
  if (metres < 1.0) {
    return "one stride";
  }
  if (metres < 2.0) {
    return "the width of a doorway";
  }
  return "several strides";
}

// ---------------------------------------------------------------- boot

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

  const caption = (parsed.config as { caption?: string }).caption;
  host.replaceChildren();

  if (parsed.kind === "scene") {
    mountScene(host, parsed.config as SceneConfig);
  } else if (parsed.kind === "sweep") {
    mountSweep(host, parsed.config as SweepConfig);
  } else if (parsed.kind === "quantity") {
    mountQuantity(host, parsed.config as { caption?: string });
  } else {
    host.textContent = `unknown figure type '${parsed.kind}'`;
    host.classList.add("widget-error");
  }

  if (caption !== undefined) {
    const element = document.createElement("p");
    element.className = "widget-caption";
    element.textContent = caption;
    host.append(element);
  }
}
