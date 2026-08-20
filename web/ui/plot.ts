import { PALETTE, SERIES } from "./theme.js";

/**
 * A small line-plot renderer for the sweep blocks.
 *
 * Monochrome, so a series is distinguished by stroke weight and dash rather than by hue, and at
 * most one series per plot may take the accent — the one that IS the perturbation. Everything
 * here is a pure function of its arguments; it never reads a control.
 */

export interface PlotSeries {
  readonly key: string;
  readonly label: string;
  readonly values: readonly number[];
  /** Optional per-point standard deviation, drawn as a band. */
  readonly sd?: readonly number[];
  readonly accent?: boolean;
}

export interface PlotView {
  readonly x: readonly number[];
  readonly xLabel: string;
  readonly yLabel: string;
  readonly series: readonly PlotSeries[];
}

interface Frame {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function niceCeiling(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalised = value / magnitude;
  let step = 1;
  if (normalised > 5) {
    step = 10;
  } else if (normalised > 2) {
    step = 5;
  } else if (normalised > 1) {
    step = 2;
  }
  return step * magnitude;
}

export function drawSweep(
  context: CanvasRenderingContext2D,
  view: PlotView,
  width: number,
  height: number,
): void {
  const frame: Frame = { left: 56, right: width - 12, top: 14, bottom: height - 44 };

  context.clearRect(0, 0, width, height);
  context.fillStyle = PALETTE.paper;
  context.fillRect(0, 0, width, height);

  let yMax = 0;
  for (const s of view.series) {
    for (let i = 0; i < s.values.length; i++) {
      const sd = s.sd === undefined ? 0 : (s.sd[i] ?? 0);
      const top = (s.values[i] as number) + (Number.isFinite(sd) ? sd : 0);
      if (Number.isFinite(top) && top > yMax) {
        yMax = top;
      }
    }
  }
  yMax = niceCeiling(yMax);

  const xMin = Math.min(...view.x);
  const xMax = Math.max(...view.x);
  const sx = (v: number): number =>
    frame.left + ((v - xMin) / (xMax - xMin || 1)) * (frame.right - frame.left);
  const sy = (v: number): number => frame.bottom - (v / yMax) * (frame.bottom - frame.top);

  // Gridlines and axis labels.
  context.font = `10px ${getComputedStyle(document.documentElement).getPropertyValue("--mirn-font-mono") || "monospace"}`;
  context.textBaseline = "middle";
  for (let k = 0; k <= 4; k++) {
    const value = (yMax * k) / 4;
    const y = sy(value);
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(frame.left, y);
    context.lineTo(frame.right, y);
    context.stroke();
    context.fillStyle = PALETTE.inkFaint;
    context.textAlign = "right";
    context.fillText(value.toFixed(2), frame.left - 8, y);
  }

  context.strokeStyle = PALETTE.rule;
  context.beginPath();
  context.moveTo(frame.left, frame.top);
  context.lineTo(frame.left, frame.bottom);
  context.lineTo(frame.right, frame.bottom);
  context.stroke();

  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = PALETTE.inkFaint;
  for (let i = 0; i < view.x.length; i++) {
    const value = view.x[i] as number;
    context.fillText(formatTick(value), sx(value), frame.bottom + 8);
  }
  context.fillText(view.xLabel, (frame.left + frame.right) / 2, frame.bottom + 26);

  context.save();
  context.translate(14, (frame.top + frame.bottom) / 2);
  context.rotate(-Math.PI / 2);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(view.yLabel, 0, 0);
  context.restore();

  // Series. Non-accent series get progressively lighter greys and different dashes, so a
  // greyscale print or a colour-blind reader loses nothing.
  const greyRamp = [PALETTE.ink, PALETTE.inkMuted, PALETTE.inkFaint];
  const dashRamp: number[][] = [[], [5, 3], [2, 3]];
  let greyIndex = 0;

  for (const s of view.series) {
    const isAccent = s.accent === true;
    const stroke = isAccent ? PALETTE.perturbation : (greyRamp[greyIndex % greyRamp.length] as string);
    const dash = isAccent ? [] : (dashRamp[greyIndex % dashRamp.length] as number[]);
    if (!isAccent) {
      greyIndex++;
    }

    if (s.sd !== undefined) {
      context.fillStyle = isAccent ? PALETTE.perturbation : PALETTE.rule;
      context.globalAlpha = 0.14;
      context.beginPath();
      for (let i = 0; i < view.x.length; i++) {
        const sd = Number.isFinite(s.sd[i] ?? NaN) ? (s.sd[i] as number) : 0;
        const point = sx(view.x[i] as number);
        const y = sy((s.values[i] as number) + sd);
        if (i === 0) {
          context.moveTo(point, y);
        } else {
          context.lineTo(point, y);
        }
      }
      for (let i = view.x.length - 1; i >= 0; i--) {
        const sd = Number.isFinite(s.sd[i] ?? NaN) ? (s.sd[i] as number) : 0;
        const value = (s.values[i] as number) - sd;
        context.lineTo(sx(view.x[i] as number), sy(value < 0 ? 0 : value));
      }
      context.closePath();
      context.fill();
      context.globalAlpha = 1;
    }

    context.strokeStyle = stroke;
    context.lineWidth = isAccent ? 2 : 1.5;
    context.setLineDash(dash);
    context.beginPath();
    let started = false;
    for (let i = 0; i < view.x.length; i++) {
      const value = s.values[i] as number;
      if (!Number.isFinite(value)) {
        continue;
      }
      const px = sx(view.x[i] as number);
      const py = sy(value);
      if (!started) {
        context.moveTo(px, py);
        started = true;
      } else {
        context.lineTo(px, py);
      }
    }
    context.stroke();

    context.setLineDash([]);
    context.fillStyle = stroke;
    for (let i = 0; i < view.x.length; i++) {
      const value = s.values[i] as number;
      if (!Number.isFinite(value)) {
        continue;
      }
      context.beginPath();
      context.arc(sx(view.x[i] as number), sy(value), 2.5, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function formatTick(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
}
