import { PALETTE, SERIES } from "./theme.js";

/**
 * Everything the arena needs to draw one frame. A frozen plain object — there is no path from a
 * draw function to a control, which is the specific defect this file exists not to reproduce
 * (the demo's `drawArena` read `ui.ghost.checked` directly).
 */
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
  for (const buffer of view.treated) {
    dot(context, buffer, view.sample, view.pedRadiusM, t, true, PALETTE.ink);
  }

  if (view.robot !== null) {
    const x = t.offsetX + (view.robot[2 * view.sample] as number) * t.scale;
    const y = t.offsetY + (view.robot[2 * view.sample + 1] as number) * t.scale;
    const r = view.robotRadiusM * t.scale;
    // A square, so the robot is distinguishable from a person by shape rather than by hue.
    context.fillStyle = PALETTE.ink;
    context.fillRect(x - r, y - r, r * 2, r * 2);
    context.strokeStyle = PALETTE.paper;
    context.lineWidth = 1.5;
    context.setLineDash([]);
    context.strokeRect(x - r, y - r, r * 2, r * 2);
  }
}
