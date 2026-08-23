import { describe, expect, it } from "vitest";
import { drawSweep, type PlotView } from "./plot.js";
import { PALETTE } from "./theme.js";

/**
 * The sweep curve carries three things: the true effect, what a forecaster reports, and the
 * run-to-run band the other two are read against. The band is a floor, not a ribbon - it is
 * measured separately at every axis value, so a single flat line across a people-sweep would be
 * a false floor and drawing it as one series' spread would put a line at zero that means nothing.
 *
 * There is no canvas in this project's Node test environment, so the context is a recorder. It
 * keeps subpaths separate, which is the whole of the third test: a censored cell must break the
 * line, and a broken line and a bridged line differ only in whether moveTo was called.
 */

interface Op {
  readonly kind: "fill" | "stroke" | "fillRect";
  readonly fill: string;
  readonly stroke: string;
  readonly alpha: number;
  readonly subpaths: readonly (readonly (readonly [number, number])[])[];
}

class Recorder {
  fillStyle = "";
  strokeStyle = "";
  globalAlpha = 1;
  lineWidth = 1;
  font = "";
  textBaseline = "";
  textAlign = "";

  readonly ops: Op[] = [];

  private subpaths: (readonly [number, number])[][] = [];
  private readonly stack: { fill: string; stroke: string; alpha: number }[] = [];

  save(): void {
    this.stack.push({ fill: this.fillStyle, stroke: this.strokeStyle, alpha: this.globalAlpha });
  }

  restore(): void {
    const previous = this.stack.pop();
    if (previous === undefined) {
      throw new Error("restore with no matching save");
    }
    this.fillStyle = previous.fill;
    this.strokeStyle = previous.stroke;
    this.globalAlpha = previous.alpha;
  }

  translate(): void {}
  rotate(): void {}
  setLineDash(): void {}
  clearRect(): void {}
  fillText(): void {}

  beginPath(): void {
    this.subpaths = [];
  }

  moveTo(x: number, y: number): void {
    this.subpaths.push([[x, y]]);
  }

  lineTo(x: number, y: number): void {
    const current = this.subpaths[this.subpaths.length - 1];
    if (current === undefined) {
      this.subpaths.push([[x, y]]);
      return;
    }
    current.push([x, y]);
  }

  arc(cx: number, cy: number): void {
    this.subpaths.push([[cx, cy]]);
  }

  closePath(): void {}

  private record(kind: Op["kind"]): void {
    const copied: (readonly [number, number])[][] = [];
    for (const path of this.subpaths) {
      copied.push([...path]);
    }
    this.ops.push({
      kind,
      fill: this.fillStyle,
      stroke: this.strokeStyle,
      alpha: this.globalAlpha,
      subpaths: copied,
    });
  }

  fill(): void {
    this.record("fill");
  }

  stroke(): void {
    this.record("stroke");
  }

  fillRect(): void {
    this.record("fillRect");
  }
}

const WIDTH = 640;
const HEIGHT = 320;
const FRAME_TOP = 14;
const FRAME_BOTTOM = HEIGHT - 44;

function draw(view: PlotView): Recorder {
  const recorder = new Recorder();
  drawSweep(recorder as unknown as CanvasRenderingContext2D, view, WIDTH, HEIGHT);
  return recorder;
}

function baseView(): PlotView {
  return {
    x: [0, 1, 2],
    xLabel: "how many people are in the room",
    yLabel: "metres",
    series: [
      { key: "true", label: "the robot's true effect", values: [0.1, 0.2, 0.3], accent: true },
      { key: "forecast", label: "what a forecaster reports", values: [0.12, 0.18, 0.24] },
    ],
  };
}

describe("the sweep curve draws in a room with no DOM", () => {
  it("picks its type face up from the palette rather than out of the cascade", () => {
    const recorder = draw(baseView());
    expect(recorder.font.length).toBeGreaterThan(0);
    expect(recorder.font).toContain("monospace");
  });
});

describe("the run-to-run band is a region, not a ribbon", () => {
  it("fills a region from zero to a per-axis-value height", () => {
    const view: PlotView = {
      ...baseView(),
      regions: [
        {
          kind: "plotRegion",
          key: "band",
          label: "ordinary difference between two runs of this room",
          upper: [0.15, 0.2, 0.3],
          lower: null,
        },
      ],
    };
    const recorder = draw(view);
    const regionFills = recorder.ops.filter((op) => op.kind === "fill" && op.fill === PALETTE.grid);
    expect(regionFills.length).toBe(1);

    const region = regionFills[0] as Op;
    const points = (region.subpaths[0] ?? []) as readonly (readonly [number, number])[];
    // Six points: three along the top edge, three back along the x axis.
    expect(points.length).toBe(6);
    expect((points[3] as readonly [number, number])[1]).toBe(FRAME_BOTTOM);
    expect((points[5] as readonly [number, number])[1]).toBe(FRAME_BOTTOM);

    // The top edge has to track `upper` point by point, not just land somewhere inside the
    // frame - a region drawn from a single constant (say, upper[0] repeated three times) would
    // still produce six points with the last two on the axis, so the assertions above alone
    // cannot tell a per-x band from a flat one. yMax here is niceCeiling(0.3) = 0.5 (the series'
    // own peak and the region's peak are both 0.3), so sy(v) = FRAME_BOTTOM - (v / 0.5) * (276 -
    // 14), giving 197.4, 171.2 and 118.8 for upper = [0.15, 0.2, 0.3] - three different heights,
    // one per axis value.
    expect((points[0] as readonly [number, number])[1]).toBeCloseTo(197.4, 5);
    expect((points[1] as readonly [number, number])[1]).toBeCloseTo(171.2, 5);
    expect((points[2] as readonly [number, number])[1]).toBeCloseTo(118.8, 5);
  });

  it("draws the region under the lines, never over them", () => {
    const view: PlotView = {
      ...baseView(),
      regions: [
        {
          kind: "plotRegion",
          key: "band",
          label: "ordinary difference between two runs of this room",
          upper: [0.15, 0.2, 0.3],
          lower: null,
        },
      ],
    };
    const recorder = draw(view);
    const regionAt = recorder.ops.findIndex((op) => op.kind === "fill" && op.fill === PALETTE.grid);
    const accentAt = recorder.ops.findIndex(
      (op) => op.kind === "stroke" && op.stroke === PALETTE.perturbation,
    );
    expect(regionAt).toBeGreaterThan(-1);
    expect(accentAt).toBeGreaterThan(-1);
    expect(regionAt).toBeLessThan(accentAt);
  });

  it("scales the y axis to the region, so a band above both lines stays inside the frame", () => {
    const view: PlotView = {
      x: [0, 1, 2],
      xLabel: "how many people are in the room",
      yLabel: "metres",
      series: [{ key: "true", label: "the robot's true effect", values: [0.1, 0.2, 0.3], accent: true }],
      regions: [
        {
          kind: "plotRegion",
          key: "band",
          label: "ordinary difference between two runs of this room",
          upper: [0.8, 0.8, 0.8],
          lower: null,
        },
      ],
    };
    const recorder = draw(view);
    const region = recorder.ops.find((op) => op.kind === "fill" && op.fill === PALETTE.grid) as Op;
    for (const path of region.subpaths) {
      for (const point of path) {
        expect(point[1]).toBeGreaterThanOrEqual(FRAME_TOP);
        expect(point[1]).toBeLessThanOrEqual(FRAME_BOTTOM);
      }
    }
  });
});

describe("a censored cell breaks the line", () => {
  it("starts a new subpath rather than bridging the gap", () => {
    const view: PlotView = {
      x: [0, 1, 2],
      xLabel: "how many people are in the room",
      yLabel: "metres",
      series: [
        { key: "forecast", label: "what a forecaster reports", values: [0.1, NaN, 0.3] },
      ],
    };
    const recorder = draw(view);
    const lineStrokes = recorder.ops.filter(
      (op) =>
        op.kind === "stroke" &&
        op.subpaths.length > 0 &&
        (op.subpaths[0] as readonly (readonly [number, number])[]).length > 0 &&
        op.stroke !== PALETTE.grid &&
        op.stroke !== PALETTE.rule,
    );
    const seriesStroke = lineStrokes[lineStrokes.length - 1] as Op;
    expect(seriesStroke.subpaths.length).toBe(2);
    expect((seriesStroke.subpaths[0] as readonly unknown[]).length).toBe(1);
    expect((seriesStroke.subpaths[1] as readonly unknown[]).length).toBe(1);
  });
});
