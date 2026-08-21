import { PALETTE, SERIES } from "./theme.js";

/**
 * Rendering constants for the robot's mark. There is exactly one thing on this canvas that is not
 * a person, and at a few pixels it was being told apart from forty of them by shape alone. These
 * numbers are pixels on a screen: nothing in `web/engine/` reads them, so moving them moves no
 * number the site quotes.
 */
const ROBOT_DRAW_SCALE = 1.3;
const ROBOT_MIN_HALF_PX = 5;
const ROBOT_HALO_GAP_PX = 2;
const ROBOT_HALO_RING_PX = 1;
const ROBOT_TRAIL_SAMPLES = 40;
const ROBOT_TRAIL_ALPHA = 0.55;
const ROBOT_TRAIL_MIN_WIDTH_FRACTION = 0.4;

/** Shared so the per-frame draw loop never allocates an array to clear the dash pattern. */
const NO_DASH: number[] = [];

/**
 * Everything the arena needs to draw one frame. A frozen plain object — there is no path from a
 * draw function to a control, which is the specific defect this file exists not to reproduce
 * (the demo's `drawArena` read `ui.ghost.checked` directly).
 */
/**
 * The two points a derivation is talking about, drawn on top of everything else.
 *
 * Page 2 tells the reader "the two points it came from light up on the canvas", which was not true
 * of anything until this existed. The pair of glyphs used here — filled for the treated run, hollow
 * for the control — is the same pair the derivation panel prints in its operand column, so the
 * equation and the picture stay tied together.
 */
export interface ArenaHighlight {
  readonly agentIndex: number;
  readonly labelP: string;
  readonly labelQ: string;
}

export interface ArenaView {
  readonly widthM: number;
  readonly heightM: number;
  readonly sample: number;
  readonly nSamples: number;
  readonly treated: readonly Float64Array[];
  readonly control: readonly Float64Array[];
  readonly robot: Float64Array | null;
  readonly showControl: boolean;
  readonly showGaps: boolean;
  readonly trailSamples: number;
  readonly pedRadiusM: number;
  readonly robotRadiusM: number;
  readonly highlight: ArenaHighlight | null;
}

interface Transform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Device-pixel-ratio-correct sizing. Returns the CSS-pixel box the caller should draw into. */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  dpr: number,
): { readonly width: number; readonly height: number } {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(dpr, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  return { width: rect.width, height: rect.height };
}

function transformFor(view: ArenaView, width: number, height: number): Transform {
  const pad = 12;
  const scale = Math.min((width - 2 * pad) / view.widthM, (height - 2 * pad) / view.heightM);
  return {
    scale,
    offsetX: (width - view.widthM * scale) / 2,
    offsetY: (height - view.heightM * scale) / 2,
  };
}

function strokePath(
  context: CanvasRenderingContext2D,
  style: { readonly stroke: string; readonly width: number; readonly dash: readonly number[] },
): void {
  context.strokeStyle = style.stroke;
  context.lineWidth = style.width;
  context.setLineDash([...style.dash]);
}

function drawTrail(
  context: CanvasRenderingContext2D,
  buffer: Float64Array,
  sample: number,
  trailSamples: number,
  t: Transform,
): void {
  const first = Math.max(0, sample - trailSamples);
  context.beginPath();
  for (let s = first; s <= sample; s++) {
    const x = t.offsetX + (buffer[2 * s] as number) * t.scale;
    const y = t.offsetY + (buffer[2 * s + 1] as number) * t.scale;
    if (s === first) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke();
}

/**
 * Where the robot has just been, drawn from the same buffer the square is drawn from. No second
 * history is kept, nothing is stored between frames, and nothing here is measured — it is a
 * direction cue, so a reader can see which way the machine is going and where it came in from.
 * Deliberately shorter than the crowd's trails, so it never reads as a fifth path to compare.
 */
function drawRobotTrail(
  context: CanvasRenderingContext2D,
  buffer: Float64Array,
  sample: number,
  trailSamples: number,
  t: Transform,
): void {
  const span = Math.min(trailSamples, ROBOT_TRAIL_SAMPLES);
  const first = Math.max(0, sample - span);
  const drawn = sample - first;
  if (drawn < 1) {
    return;
  }

  const style = SERIES.robot as (typeof SERIES)[string];
  context.save();
  context.strokeStyle = style.stroke;
  context.setLineDash(NO_DASH);
  context.lineCap = "round";

  let previousX = t.offsetX + (buffer[2 * first] as number) * t.scale;
  let previousY = t.offsetY + (buffer[2 * first + 1] as number) * t.scale;
  for (let s = first + 1; s <= sample; s++) {
    const x = t.offsetX + (buffer[2 * s] as number) * t.scale;
    const y = t.offsetY + (buffer[2 * s + 1] as number) * t.scale;
    const freshness = (s - first) / drawn;
    const taper = ROBOT_TRAIL_MIN_WIDTH_FRACTION + (1 - ROBOT_TRAIL_MIN_WIDTH_FRACTION) * freshness;
    context.globalAlpha = ROBOT_TRAIL_ALPHA * freshness;
    context.lineWidth = style.width * taper;
    context.beginPath();
    context.moveTo(previousX, previousY);
    context.lineTo(x, y);
    context.stroke();
    previousX = x;
    previousY = y;
  }

  context.restore();
}

function dot(
  context: CanvasRenderingContext2D,
  buffer: Float64Array,
  sample: number,
  radiusM: number,
  t: Transform,
  filled: boolean,
  colour: string,
): void {
  const x = t.offsetX + (buffer[2 * sample] as number) * t.scale;
  const y = t.offsetY + (buffer[2 * sample + 1] as number) * t.scale;
  context.beginPath();
  context.arc(x, y, Math.max(2.5, radiusM * t.scale), 0, Math.PI * 2);
  if (filled) {
    context.fillStyle = colour;
    context.fill();
  } else {
    // Hollow marks the counterfactual, everywhere on the site. The same glyph pair appears in
    // every derivation panel's operand column, so the equation and the picture stay tied together.
    context.fillStyle = PALETTE.paper;
    context.fill();
    context.strokeStyle = colour;
    context.lineWidth = 1.25;
    context.setLineDash([]);
    context.stroke();
  }
}

/** Pure function of its arguments. No DOM reads beyond the context it was handed. */
export function drawArena(
  context: CanvasRenderingContext2D,
  view: ArenaView,
  width: number,
  height: number,
): void {
  const t = transformFor(view, width, height);

  context.clearRect(0, 0, width, height);
  context.fillStyle = PALETTE.paper;
  context.fillRect(0, 0, width, height);

  // Room outline and a one-metre grid, so distances on screen are readable as metres.
  strokePath(context, SERIES.grid as (typeof SERIES)[string]);
  for (let m = 1; m < view.widthM; m++) {
    context.beginPath();
    context.moveTo(t.offsetX + m * t.scale, t.offsetY);
    context.lineTo(t.offsetX + m * t.scale, t.offsetY + view.heightM * t.scale);
    context.stroke();
  }
  for (let m = 1; m < view.heightM; m++) {
    context.beginPath();
    context.moveTo(t.offsetX, t.offsetY + m * t.scale);
    context.lineTo(t.offsetX + view.widthM * t.scale, t.offsetY + m * t.scale);
    context.stroke();
  }
  context.strokeStyle = PALETTE.rule;
  context.lineWidth = 1;
  context.setLineDash([]);
  context.strokeRect(t.offsetX, t.offsetY, view.widthM * t.scale, view.heightM * t.scale);

  const controlStyle = SERIES.control as (typeof SERIES)[string];
  const treatedStyle = SERIES.treated as (typeof SERIES)[string];

  if (view.showControl) {
    strokePath(context, controlStyle);
    for (const buffer of view.control) {
      drawTrail(context, buffer, view.sample, view.trailSamples, t);
    }
  }

  strokePath(context, treatedStyle);
  for (const buffer of view.treated) {
    drawTrail(context, buffer, view.sample, view.trailSamples, t);
  }

  // The gap is the one thing on the page allowed to be coloured, because the gap is the subject.
  if (view.showGaps) {
    strokePath(context, SERIES.gap as (typeof SERIES)[string]);
    for (let i = 0; i < view.treated.length; i++) {
      const a = view.treated[i] as Float64Array;
      const b = view.control[i] as Float64Array;
      context.beginPath();
      context.moveTo(
        t.offsetX + (a[2 * view.sample] as number) * t.scale,
        t.offsetY + (a[2 * view.sample + 1] as number) * t.scale,
      );
      context.lineTo(
        t.offsetX + (b[2 * view.sample] as number) * t.scale,
        t.offsetY + (b[2 * view.sample + 1] as number) * t.scale,
      );
      context.stroke();
    }
  }

  if (view.showControl) {
    for (const buffer of view.control) {
      dot(context, buffer, view.sample, view.pedRadiusM, t, false, PALETTE.inkMuted);
    }
  }
  // Muted, not black. This makes the robot's square the only *filled* mark on the canvas in the
  // darkest ink — one square among forty discs of the same tone is not a difference a reader can
  // find at a few pixels.
  //
  // The trails were deliberately not muted with the dots, so the canvas still carries black
  // lines: `SERIES.treated` is `PALETTE.ink` and stays that way, because page 2 asks the reader
  // to tell the solid path from "the faint one", and because the same `SERIES` entries are drawn
  // by plot.ts and by the key on the page. What changed is narrower than "the darkest ink belongs
  // to the robot": every black *dot* on the canvas is now the robot. What separates the two runs
  // is unchanged — filled here, hollow for the run with no robot in it.
  //
  // The one other ink-filled disc is the highlight's treated point in `drawHighlight`, which is a
  // spotlight drawn over a dimmed room and is meant to be the darkest thing on screen.
  for (const buffer of view.treated) {
    dot(context, buffer, view.sample, view.pedRadiusM, t, true, PALETTE.inkMuted);
  }

  if (view.highlight !== null) {
    drawHighlight(context, view, view.highlight, t);
  }

  if (view.robot !== null) {
    drawRobotTrail(context, view.robot, view.sample, view.trailSamples, t);

    const x = t.offsetX + (view.robot[2 * view.sample] as number) * t.scale;
    const y = t.offsetY + (view.robot[2 * view.sample + 1] as number) * t.scale;
    // A square, so the robot is distinguishable from a person by shape rather than by hue. Shape
    // is carrying that distinction alone, so it is drawn a little past the radius the simulator
    // gives it and ringed — a paper gap, then a thin outline — which holds the square together
    // against a dense crowd. Size on screen is a drawing decision; nothing measures pixels.
    const half = Math.max(ROBOT_MIN_HALF_PX, view.robotRadiusM * t.scale * ROBOT_DRAW_SCALE);
    context.setLineDash(NO_DASH);
    context.fillStyle = PALETTE.ink;
    context.fillRect(x - half, y - half, half * 2, half * 2);

    const gapHalf = half + ROBOT_HALO_GAP_PX / 2;
    context.strokeStyle = PALETTE.paper;
    context.lineWidth = ROBOT_HALO_GAP_PX;
    context.strokeRect(x - gapHalf, y - gapHalf, gapHalf * 2, gapHalf * 2);

    const ringHalf = half + ROBOT_HALO_GAP_PX + ROBOT_HALO_RING_PX / 2;
    context.strokeStyle = PALETTE.ink;
    context.lineWidth = ROBOT_HALO_RING_PX;
    context.strokeRect(x - ringHalf, y - ringHalf, ringHalf * 2, ringHalf * 2);
  }
}

function drawHighlight(
  context: CanvasRenderingContext2D,
  view: ArenaView,
  highlight: ArenaHighlight,
  t: Transform,
): void {
  const a = view.treated[highlight.agentIndex];
  const b = view.control[highlight.agentIndex];
  if (a === undefined || b === undefined) {
    return;
  }

  // Everything else is dimmed by drawing paper over it at low alpha, rather than by re-rendering
  // the scene in grey: the reader keeps their bearings, and the two points are unmistakable.
  context.save();
  context.globalAlpha = 0.72;
  context.fillStyle = PALETTE.paper;
  context.fillRect(
    t.offsetX,
    t.offsetY,
    view.widthM * t.scale,
    view.heightM * t.scale,
  );
  context.restore();

  const px = t.offsetX + (a[2 * view.sample] as number) * t.scale;
  const py = t.offsetY + (a[2 * view.sample + 1] as number) * t.scale;
  const qx = t.offsetX + (b[2 * view.sample] as number) * t.scale;
  const qy = t.offsetY + (b[2 * view.sample + 1] as number) * t.scale;

  context.strokeStyle = PALETTE.perturbation;
  context.lineWidth = 2;
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(px, py);
  context.lineTo(qx, qy);
  context.stroke();

  const radius = Math.max(5, view.pedRadiusM * t.scale);
  context.beginPath();
  context.arc(px, py, radius, 0, Math.PI * 2);
  context.fillStyle = PALETTE.ink;
  context.fill();

  context.beginPath();
  context.arc(qx, qy, radius, 0, Math.PI * 2);
  context.fillStyle = PALETTE.paper;
  context.fill();
  context.strokeStyle = PALETTE.inkMuted;
  context.lineWidth = 1.75;
  context.stroke();

  context.font = `600 12px ${FALLBACK_MONO}`;
  context.fillStyle = PALETTE.ink;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.fillText(highlight.labelP, px + radius + 5, py);
  context.fillStyle = PALETTE.inkMuted;
  context.fillText(highlight.labelQ, qx + radius + 5, qy);
}

const FALLBACK_MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
