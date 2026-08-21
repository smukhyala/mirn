import { describe, expect, it } from "vitest";
import { drawArena, type ArenaView } from "./arena.js";
import { PALETTE } from "./theme.js";

/**
 * The arena is the one picture a reader spends twenty minutes looking at, and legibility in it is
 * behaviour rather than taste: if the robot cannot be found among the people, every sentence that
 * says "watch the robot cross the room" is false. These tests hold three things — the robot's
 * square is the only mark *filled* in the darkest ink, it is bigger than a person and ringed, and
 * its trail comes from the same positions the square is drawn from.
 *
 * "Filled" is the whole of the claim and not a hedge on it. The crowd's trails are still stroked
 * in `PALETTE.ink`, on purpose, and one of the tests below pins that so nobody mutes them while
 * tidying: page 2 asks the reader to tell a solid path from a faint one, and the same `SERIES`
 * entries are what plot.ts and the key on the page draw.
 *
 * They also hold the line this file must never cross. Drawing is allowed to change what a reader
 * sees; it is not allowed to change anything measured. So the buffers handed to `drawArena` are
 * compared byte for byte afterwards.
 *
 * There is no canvas in this project's Node test environment, so the context is a recorder: it
 * keeps every drawing operation together with the fill, stroke and alpha in force when it ran.
 */

interface Shape {
  readonly kind: "arc" | "poly";
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly points: readonly (readonly [number, number])[];
}

interface Op {
  readonly kind: "fill" | "stroke" | "fillRect" | "strokeRect";
  readonly fill: string;
  readonly stroke: string;
  readonly alpha: number;
  readonly width: number;
  readonly shape: Shape | null;
  readonly rect: readonly [number, number, number, number] | null;
}

class Recorder {
  fillStyle = "";
  strokeStyle = "";
  globalAlpha = 1;
  lineWidth = 1;
  lineCap = "butt";
  font = "";
  textBaseline = "";
  textAlign = "";

  readonly ops: Op[] = [];
  readonly dashArrays: number[][] = [];

  private points: (readonly [number, number])[] = [];
  private pendingArc: { cx: number; cy: number; r: number } | null = null;
  private readonly stack: { fill: string; stroke: string; alpha: number; width: number }[] = [];

  save(): void {
    this.stack.push({
      fill: this.fillStyle,
      stroke: this.strokeStyle,
      alpha: this.globalAlpha,
      width: this.lineWidth,
    });
  }

  restore(): void {
    const previous = this.stack.pop();
    if (previous === undefined) {
      throw new Error("restore with no matching save");
    }
    this.fillStyle = previous.fill;
    this.strokeStyle = previous.stroke;
    this.globalAlpha = previous.alpha;
    this.lineWidth = previous.width;
  }

  setLineDash(dash: number[]): void {
    this.dashArrays.push(dash);
  }

  beginPath(): void {
    this.points = [];
    this.pendingArc = null;
  }

  moveTo(x: number, y: number): void {
    this.points.push([x, y]);
  }

  lineTo(x: number, y: number): void {
    this.points.push([x, y]);
  }

  /** The real signature carries two angles; nothing here cares which arc of the circle it is. */
  arc(cx: number, cy: number, r: number): void {
    this.pendingArc = { cx, cy, r };
  }

  private shape(): Shape {
    const pending = this.pendingArc;
    if (pending !== null) {
      return { kind: "arc", cx: pending.cx, cy: pending.cy, r: pending.r, points: [] };
    }
    return { kind: "poly", cx: 0, cy: 0, r: 0, points: [...this.points] };
  }

  private record(kind: Op["kind"], shape: Shape | null, rect: Op["rect"]): void {
    this.ops.push({
      kind,
      fill: this.fillStyle,
      stroke: this.strokeStyle,
      alpha: this.globalAlpha,
      width: this.lineWidth,
      shape,
      rect,
    });
  }

  fill(): void {
    this.record("fill", this.shape(), null);
  }

  stroke(): void {
    this.record("stroke", this.shape(), null);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.record("fillRect", null, [x, y, w, h]);
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.record("strokeRect", null, [x, y, w, h]);
  }

  clearRect(): void {
    // Nothing to record: clearing is not a mark a reader can see.
  }

  fillText(): void {
    // Labels only appear in the highlight state, which these tests do not enter.
  }
}

function walkBuffer(
  nSamples: number,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
): Float64Array {
  const buffer = new Float64Array(nSamples * 2);
  for (let s = 0; s < nSamples; s++) {
    buffer[2 * s] = x0 + dx * s;
    buffer[2 * s + 1] = y0 + dy * s;
  }
  return buffer;
}

const N_SAMPLES = 200;
const SAMPLE = 150;
const TRAIL_SAMPLES = 90;

function makeView(overrides: Partial<ArenaView>): ArenaView {
  const treated: Float64Array[] = [];
  const control: Float64Array[] = [];
  for (let i = 0; i < 3; i++) {
    treated.push(walkBuffer(N_SAMPLES, 2 + i, 1 + i, 0.02, 0.01));
    control.push(walkBuffer(N_SAMPLES, 2 + i, 1 + i, 0.02, 0.005));
  }
  const base: ArenaView = {
    widthM: 22,
    heightM: 8,
    sample: SAMPLE,
    nSamples: N_SAMPLES,
    treated,
    control,
    robot: walkBuffer(N_SAMPLES, 1, 4, 0.05, 0),
    showControl: true,
    showGaps: true,
    trailSamples: TRAIL_SAMPLES,
    pedRadiusM: 0.24,
    robotRadiusM: 0.32,
    highlight: null,
  };
  return { ...base, ...overrides };
}

function draw(view: ArenaView): Recorder {
  const recorder = new Recorder();
  drawArena(recorder as unknown as CanvasRenderingContext2D, view, 900, 340);
  return recorder;
}

function discFills(recorder: Recorder): Op[] {
  const found: Op[] = [];
  for (const op of recorder.ops) {
    if (op.kind === "fill" && op.shape !== null && op.shape.kind === "arc") {
      found.push(op);
    }
  }
  return found;
}

function robotSquare(recorder: Recorder): Op {
  const found: Op[] = [];
  for (const op of recorder.ops) {
    if (op.kind === "fillRect" && op.fill === PALETTE.ink) {
      found.push(op);
    }
  }
  const square = found[0];
  if (found.length !== 1 || square === undefined) {
    throw new Error(`expected exactly one full-ink square, found ${found.length}`);
  }
  return square;
}

function fadedStrokes(recorder: Recorder): Op[] {
  const found: Op[] = [];
  for (const op of recorder.ops) {
    if (op.kind === "stroke" && op.alpha < 1) {
      found.push(op);
    }
  }
  return found;
}

describe("the robot on the canvas", () => {
  it("is the only mark filled in the darkest ink; every person's dot is muted", () => {
    // The defect this is here for: forty people and one robot were all PALETTE.ink, so the robot
    // was distinguished from a crowd by shape alone at a few pixels, and readers could not find it.
    // The fix was to the dots only, so the claim is about fills — see the trail test below.
    const recorder = draw(makeView({}));
    const filledInInk: Op[] = [];
    for (const op of recorder.ops) {
      if ((op.kind === "fill" || op.kind === "fillRect") && op.fill === PALETTE.ink) {
        filledInInk.push(op);
      }
    }
    expect(filledInInk.length).toBe(1);
    const only = filledInInk[0];
    if (only === undefined) {
      throw new Error("nothing was filled in the darkest ink");
    }
    expect(only.kind).toBe("fillRect");
    expect(only).toEqual(robotSquare(recorder));
  });

  it("shares the darkest ink with the crowd's trails, which are left solid on purpose", () => {
    // Not an exception to the rule above but the other half of it, and the reason that rule says
    // "filled". SERIES.treated is PALETTE.ink and the trails are drawn with it at full alpha, so
    // there are black lines on this canvas and the comment in arena.ts must keep saying so.
    // Muting them would falsify page 2, which asks the reader to tell the solid path from "the
    // faint one", and would drift the arena away from plot.ts and the key, which read the same
    // SERIES entries.
    const recorder = draw(makeView({}));
    const solidInkTrails: Op[] = [];
    for (const op of recorder.ops) {
      const isPath = op.shape !== null && op.shape.kind === "poly" && op.shape.points.length > 2;
      if (op.kind === "stroke" && op.stroke === PALETTE.ink && op.alpha === 1 && isPath) {
        solidInkTrails.push(op);
      }
    }
    // One per person in the run with the robot in it, and nothing else at full alpha: the robot's
    // own trail is tapered, so it is excluded by the alpha rather than by the colour.
    expect(solidInkTrails.length).toBe(3);
  });

  it("keeps the crowd, the robot-free run and the robot three different marks", () => {
    const recorder = draw(makeView({}));
    const treatedDots: Op[] = [];
    const controlDots: Op[] = [];
    for (const disc of discFills(recorder)) {
      if (disc.fill === PALETTE.paper) {
        controlDots.push(disc);
      } else {
        treatedDots.push(disc);
      }
    }
    expect(treatedDots.length).toBe(3);
    expect(controlDots.length).toBe(3);
    // Filled and muted for the run with the robot, hollow for the run without it, full ink and
    // square for the robot. No two of the three share both their fill and their shape.
    const treated = treatedDots[0];
    if (treated === undefined) {
      throw new Error("no dot was drawn for the run with the robot");
    }
    expect(treated.fill).toBe(PALETTE.inkMuted);
    expect(robotSquare(recorder).fill).not.toBe(treated.fill);
  });

  it("is drawn larger than a person and ringed, so it holds together in a dense room", () => {
    const recorder = draw(makeView({}));
    const square = robotSquare(recorder);
    const rect = square.rect;
    if (rect === null) {
      throw new Error("the robot was not drawn as a rectangle");
    }
    const halfWidth = rect[2] / 2;

    const disc = discFills(recorder)[0];
    if (disc === undefined || disc.shape === null) {
      throw new Error("no person was drawn");
    }
    expect(halfWidth).toBeGreaterThan(disc.shape.r);

    // A paper gap and then a thin ink ring, both outside the filled square and concentric with it.
    // Concentricity is what tells the halo apart from the room's own outline, which is also a
    // stroked rectangle and also wider than the robot.
    const centreX = rect[0] + rect[2] / 2;
    const centreY = rect[1] + rect[3] / 2;
    const rings: Op[] = [];
    for (const op of recorder.ops) {
      if (op.kind === "strokeRect" && op.rect !== null && op.rect[2] > rect[2]) {
        const ringCentreX = op.rect[0] + op.rect[2] / 2;
        const ringCentreY = op.rect[1] + op.rect[3] / 2;
        const offCentre = Math.abs(ringCentreX - centreX) + Math.abs(ringCentreY - centreY);
        if (offCentre < 1e-9) {
          rings.push(op);
        }
      }
    }
    expect(rings.length).toBe(2);
    const gap = rings[0];
    const ring = rings[1];
    if (gap === undefined || gap.rect === null || ring === undefined || ring.rect === null) {
      throw new Error("the halo was not drawn");
    }
    expect(gap.stroke).toBe(PALETTE.paper);
    expect(ring.stroke).toBe(PALETTE.ink);
    expect(ring.rect[2]).toBeGreaterThan(gap.rect[2]);
    // No new colour: the accent belongs to the effect, never to the thing causing it.
    expect(ring.stroke).not.toBe(PALETTE.perturbation);
    expect(gap.stroke).not.toBe(PALETTE.perturbation);
  });
});

describe("the robot's trail", () => {
  it("ends where the robot is now and fades backwards", () => {
    const recorder = draw(makeView({}));
    const segments = fadedStrokes(recorder);
    expect(segments.length).toBeGreaterThan(0);

    const rect = robotSquare(recorder).rect;
    if (rect === null) {
      throw new Error("the robot was not drawn as a rectangle");
    }
    const centreX = rect[0] + rect[2] / 2;
    const centreY = rect[1] + rect[3] / 2;

    const last = segments[segments.length - 1];
    if (last === undefined || last.shape === null) {
      throw new Error("no trail segment was drawn");
    }
    const head = last.shape.points[last.shape.points.length - 1];
    if (head === undefined) {
      throw new Error("a trail segment had no end point");
    }
    // Same buffer, same transform: the newest end of the trail is the square itself, which is only
    // true if the trail was read from the positions the square is drawn from.
    expect(head[0]).toBeCloseTo(centreX, 9);
    expect(head[1]).toBeCloseTo(centreY, 9);

    let previousAlpha = 0;
    for (const segment of segments) {
      expect(segment.alpha).toBeGreaterThan(previousAlpha);
      expect(segment.alpha).toBeLessThan(1);
      previousAlpha = segment.alpha;
    }
  });

  it("is shorter than the crowd's trails, so it never reads as another path to compare", () => {
    const recorder = draw(makeView({}));
    expect(fadedStrokes(recorder).length).toBeLessThan(TRAIL_SAMPLES);
  });

  it("is absent from the run with no robot in it", () => {
    const recorder = draw(makeView({ robot: null }));
    expect(fadedStrokes(recorder).length).toBe(0);
  });

  it("draws the same picture twice, reusing one dash array rather than allocating a frame", () => {
    const view = makeView({});
    const first = draw(view);
    const second = draw(view);
    expect(JSON.stringify(second.ops)).toBe(JSON.stringify(first.ops));

    let shared = 0;
    for (const dash of first.dashArrays) {
      if (second.dashArrays.includes(dash)) {
        shared++;
      }
    }
    expect(shared).toBeGreaterThan(0);
  });
});

describe("drawing changes nothing that is measured", () => {
  it("leaves every position buffer byte for byte as it found it", () => {
    // Guardrail 4 in its rendering form: the arena reads the simulation and never writes to it, so
    // no pixel decision here can move a number the site quotes.
    const view = makeView({});
    const before: Float64Array[] = [];
    for (const buffer of [...view.treated, ...view.control, view.robot as Float64Array]) {
      before.push(Float64Array.from(buffer));
    }
    draw(view);
    const after = [...view.treated, ...view.control, view.robot as Float64Array];
    for (let i = 0; i < after.length; i++) {
      const original = before[i];
      const current = after[i];
      if (original === undefined || current === undefined) {
        throw new Error("a buffer went missing during drawing");
      }
      for (let k = 0; k < original.length; k++) {
        expect(current[k]).toBe(original[k]);
      }
    }
  });
});
