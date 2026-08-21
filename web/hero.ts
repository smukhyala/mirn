import { makeRunConfig, SIM_CONSTANTS } from "./engine/contracts/config.js";
import { runPair, type RunResult } from "./engine/sim/run.js";
import { frameIndexAt, type PlaybackBase } from "./app/clock.js";
import { drawArena, fitCanvas, type ArenaView } from "./ui/arena.js";

/**
 * The animation on the landing page.
 *
 * It is the same room, the same engine and the same renderer every figure on the site uses —
 * `runPair` for the world and `drawArena` for the picture. There is no second simulator and no
 * second drawing path here, because two renderers drift and the landing page would be the one
 * nobody notices drifting.
 *
 * It shows one thing and no numbers: a robot crossing a crowd. The second world, the gap between
 * the two, and every measurement taken from them belong to page 1 onwards, where there is room to
 * say what they are. A landing page that opens with a readout is asking a reader to trust a
 * number before it has told them what the number is of.
 *
 * The figure it fills is marked `hidden` in the HTML and revealed here. That ordering is the
 * no-script guarantee: if this module never runs, never parses, or lands in a browser with no 2d
 * canvas, the reader gets the title, the sentence and the index rather than an empty bordered box
 * with a caption describing an animation that is not there.
 */

/** Long enough for the robot to cross the room and for the crowd to close behind it. */
const HERO_TICKS = 800;

/** How much history each person's trail carries, in samples. The same length the figures use. */
const HERO_TRAIL_SAMPLES = 90;

/**
 * Where the still frame is taken for a reader who has asked their system for reduced motion.
 * Partway through the crossing, so the one frame they get is the robot among people rather than
 * an empty room before it has entered or after it has left.
 */
const STILL_FRACTION = 0.45;

function mountHero(): void {
  const figure = document.getElementById("hero");
  const canvasNode = document.getElementById("hero-arena");
  if (figure === null || canvasNode === null) {
    return;
  }
  const canvas = canvasNode as HTMLCanvasElement;
  if (typeof canvas.getContext !== "function") {
    return;
  }
  const context = canvas.getContext("2d");
  if (context === null) {
    return;
  }

  const result: RunResult = runPair(makeRunConfig({ nTicks: HERO_TICKS }));
  const nSamples = result.config.nTicks + 1;

  // The drawing box, remembered between frames.
  //
  // `fitCanvas` writes `canvas.width`, and writing that reallocates and clears the whole backing
  // store — several megabytes at a retina device pixel ratio. Every other figure on the site pays
  // that on every frame, which is survivable inside a lesson the reader has chosen to open and
  // wasteful on the page everybody loads first. So the box is measured every frame and resized
  // only when it has actually changed.
  let boxWidth = 0;
  let boxHeight = 0;

  function draw(sample: number): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width !== boxWidth || rect.height !== boxHeight) {
      const box = fitCanvas(canvas, window.devicePixelRatio);
      boxWidth = box.width;
      boxHeight = box.height;
    }
    const view: ArenaView = {
      widthM: result.config.widthM,
      heightM: result.config.heightM,
      sample,
      nSamples,
      treated: result.treated.positions,
      control: result.control.positions,
      robot: result.treated.robotPositions,
      // Both off. What is drawn is one world with a robot in it, which is the only thing the
      // landing page claims to be showing.
      showControl: false,
      showGaps: false,
      trailSamples: HERO_TRAIL_SAMPLES,
      pedRadiusM: SIM_CONSTANTS.pedRadiusM,
      robotRadiusM: SIM_CONSTANTS.robotRadiusM,
      highlight: null,
    };
    drawArena(context as CanvasRenderingContext2D, view, boxWidth, boxHeight);
  }

  figure.hidden = false;

  let reduced = false;
  if (typeof window.matchMedia === "function") {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  if (reduced) {
    draw(Math.floor((nSamples - 1) * STILL_FRACTION));
    return;
  }

  // Painted here rather than left to the first animation frame. Revealing an empty canvas and
  // filling it a frame later is a visible flash of blank paper on the first thing anybody loads.
  draw(0);

  let base: PlaybackBase = {
    wallStartMs: performance.now(),
    sampleAtStart: 0,
    dtMs: result.config.dt * 1000,
    rate: 1,
  };
  let sample = 0;

  function frame(nowMs: number): void {
    const next = frameIndexAt(nowMs, base, nSamples);
    if (next >= nSamples - 1) {
      // Loop by re-basing rather than by accumulating, so a tab left in the background for ten
      // minutes resumes at the start of a crossing instead of catching up through one.
      sample = 0;
      base = { ...base, wallStartMs: nowMs, sampleAtStart: 0 };
    } else {
      sample = next;
    }
    draw(sample);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

mountHero();
