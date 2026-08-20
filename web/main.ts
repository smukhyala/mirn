import { makeRunConfig, SIM_CONSTANTS, type RunConfig } from "./engine/contracts/config.js";
import { runPair, type RunResult } from "./engine/sim/run.js";
import { frameIndexAt, type PlaybackBase } from "./app/clock.js";
import { drawArena, fitCanvas, type ArenaView } from "./ui/arena.js";
import { cssTokens } from "./ui/theme.js";

// Tokens are injected rather than duplicated in the stylesheet, so the palette has exactly one
// definition and the canvas and the CSS cannot drift apart.
const tokenStyle = document.createElement("style");
tokenStyle.textContent = cssTokens();
document.head.prepend(tokenStyle);

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (node === null) {
    throw new Error(`missing element #${id}`);
  }
  return node as T;
};

const canvas = el<HTMLCanvasElement>("arena");
const context = canvas.getContext("2d");
if (context === null) {
  throw new Error("2d canvas context unavailable");
}

const controls = {
  playpause: el<HTMLButtonElement>("playpause"),
  scrub: el<HTMLInputElement>("scrub"),
  clock: el<HTMLOutputElement>("clock"),
  gap: el<HTMLOutputElement>("gap"),
  gapMean: el<HTMLOutputElement>("gap-mean"),
  n: el<HTMLInputElement>("n"),
  nReadout: el<HTMLOutputElement>("n-readout"),
  speed: el<HTMLInputElement>("speed"),
  speedReadout: el<HTMLOutputElement>("speed-readout"),
  reaction: el<HTMLInputElement>("reaction"),
  reactionReadout: el<HTMLOutputElement>("reaction-readout"),
  seed: el<HTMLInputElement>("seed"),
  seedReadout: el<HTMLOutputElement>("seed-readout"),
  seeRobot: el<HTMLInputElement>("see-robot"),
  showControl: el<HTMLInputElement>("show-control"),
  showGaps: el<HTMLInputElement>("show-gaps"),
  timing: el<HTMLParagraphElement>("timing"),
};

const BASE_SEED = 20260816;

function configFromControls(): RunConfig {
  return makeRunConfig({
    seed: BASE_SEED + Number(controls.seed.value) * 7919,
    nTicks: 800,
    pedestriansSeeRobot: controls.seeRobot.checked,
    crowd: {
      nPedestrians: Number(controls.n.value),
      noiseAmplitude: 1.1,
      desiredSpeed: 1.34,
      relaxationTimeS: 0.5,
    },
    robot: {
      maxSpeed: Number(controls.speed.value),
      reactionTimeS: Number(controls.reaction.value),
      deflectionWeight: 0,
      startXY: [2, 6.5],
      goalXY: [20, 6.5],
    },
  });
}

let result: RunResult = runPair(configFromControls(), () => performance.now());
let playing = true;
let base: PlaybackBase = {
  wallStartMs: performance.now(),
  sampleAtStart: 0,
  dtMs: result.config.dt * 1000,
  rate: 1,
};
let sample = 0;

function nSamples(): number {
  return result.config.nTicks + 1;
}

/**
 * Two numbers, not one, and deliberately side by side from the very first page.
 *
 * The widest gap is dominated by chaotic divergence: one person deflected onto the other side of
 * the robot ends up metres away, while the crowd's typical displacement is a few tens of
 * centimetres. Showing only the maximum makes the effect look enormous; showing only the mean
 * hides that a single person can be pushed right across the room. Neither is wrong and they
 * disagree, which is the lesson the metrics chapter is built on — so the page never gets to
 * imply there is one answer.
 */
function gapsAt(step: number): { readonly mean: number; readonly widest: number } {
  let worst = 0;
  let total = 0;
  const n = result.treated.positions.length;
  for (let i = 0; i < n; i++) {
    const a = result.treated.positions[i] as Float64Array;
    const b = result.control.positions[i] as Float64Array;
    const dx = (a[2 * step] as number) - (b[2 * step] as number);
    const dy = (a[2 * step + 1] as number) - (b[2 * step + 1] as number);
    const gap = Math.sqrt(dx * dx + dy * dy);
    total += gap;
    if (gap > worst) {
      worst = gap;
    }
  }
  return { mean: n === 0 ? 0 : total / n, widest: worst };
}

function recompute(): void {
  result = runPair(configFromControls(), () => performance.now());
  controls.scrub.max = String(nSamples() - 1);
  controls.timing.textContent = `${result.config.crowd.nPedestrians} people · both runs computed in ${result.timingMs.toFixed(0)} ms`;
  sample = Math.min(sample, nSamples() - 1);
  base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
}

function syncReadouts(): void {
  controls.nReadout.value = controls.n.value;
  controls.speedReadout.value = Number(controls.speed.value).toFixed(2);
  controls.reactionReadout.value = Number(controls.reaction.value).toFixed(2);
  controls.seedReadout.value = String(BASE_SEED + Number(controls.seed.value) * 7919);
}

function render(): void {
  const box = fitCanvas(canvas, window.devicePixelRatio);
  const view: ArenaView = {
    widthM: result.config.widthM,
    heightM: result.config.heightM,
    sample,
    nSamples: nSamples(),
    treated: result.treated.positions,
    control: result.control.positions,
    robot: result.treated.robotPositions,
    showControl: controls.showControl.checked,
    showGaps: controls.showGaps.checked,
    trailSamples: 90,
    pedRadiusM: SIM_CONSTANTS.pedRadiusM,
    robotRadiusM: SIM_CONSTANTS.robotRadiusM,
  };
  drawArena(context as CanvasRenderingContext2D, view, box.width, box.height);

  controls.clock.value = (sample * result.config.dt).toFixed(1);
  const gaps = gapsAt(sample);
  controls.gapMean.value = gaps.mean.toFixed(3);
  controls.gap.value = gaps.widest.toFixed(3);
  controls.scrub.value = String(sample);
}

function frame(nowMs: number): void {
  if (playing) {
    const next = frameIndexAt(nowMs, base, nSamples());
    if (next >= nSamples() - 1) {
      // Loop, re-basing rather than accumulating, so a long tab-background does not stall.
      sample = 0;
      base = { ...base, wallStartMs: nowMs, sampleAtStart: 0 };
    } else {
      sample = next;
    }
  }
  render();
  requestAnimationFrame(frame);
}

for (const input of [controls.n, controls.speed, controls.reaction, controls.seed]) {
  input.addEventListener("input", () => {
    syncReadouts();
    recompute();
  });
}
controls.seeRobot.addEventListener("change", recompute);

controls.scrub.addEventListener("input", () => {
  sample = Number(controls.scrub.value);
  base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
});

controls.playpause.addEventListener("click", () => {
  playing = !playing;
  controls.playpause.textContent = playing ? "Pause" : "Play";
  base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
});

syncReadouts();
recompute();
requestAnimationFrame(frame);
