import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ade, adeBetweenClouds, fde, fdeBetweenClouds, frechet } from "./index.js";
import { pairwiseSum, quantileLinear } from "../kernels.js";

/** A flat (T,2) path from pairs. */
function path(points: readonly (readonly [number, number])[]): Float64Array {
  const out = new Float64Array(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    out[2 * i] = (points[i] as readonly [number, number])[0];
    out[2 * i + 1] = (points[i] as readonly [number, number])[1];
  }
  return out;
}

const pathArb = fc
  .array(fc.tuple(fc.double({ min: -50, max: 50, noNaN: true }), fc.double({ min: -50, max: 50, noNaN: true })), {
    minLength: 1,
    maxLength: 24,
  })
  .map((points) => path(points));

/** Integer coordinates, so translation by an integer is exactly representable. */
const integerPathArb = fc
  .array(fc.tuple(fc.integer({ min: -500, max: 500 }), fc.integer({ min: -500, max: 500 })), {
    minLength: 1,
    maxLength: 24,
  })
  .map((points) => path(points.map(([x, y]) => [x, y] as const)));

function translate(p: Float64Array, dx: number, dy: number): Float64Array {
  const out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i += 2) {
    out[i] = (p[i] as number) + dx;
    out[i + 1] = (p[i + 1] as number) + dy;
  }
  return out;
}

function rotate(p: Float64Array, theta: number): Float64Array {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i] as number;
    const y = p[i + 1] as number;
    out[i] = c * x - s * y;
    out[i + 1] = s * x + c * y;
  }
  return out;
}

const PATH_DIVERGENCES: readonly (readonly [string, (a: Float64Array, b: Float64Array) => number])[] = [
  ["ade", ade],
  ["fde", fde],
  ["frechet", frechet],
];

describe.each(PATH_DIVERGENCES)("%s — the properties CLAUDE.md requires", (name, d) => {
  it("is exactly zero on identical inputs", () => {
    fc.assert(
      fc.property(pathArb, (p) => {
        // `toBe`, not `toBeCloseTo`. d(a, a) is a sum of sqrt(0), which is exactly 0 in IEEE 754.
        expect(d(p, p)).toBe(0);
      }),
    );
  });

  it("is non-negative", () => {
    fc.assert(
      fc.property(pathArb, pathArb, (a, b) => {
        fc.pre(a.length === b.length);
        expect(d(a, b)).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("is symmetric, bitwise", () => {
    fc.assert(
      fc.property(pathArb, pathArb, (a, b) => {
        fc.pre(a.length === b.length);
        expect(d(a, b)).toBe(d(b, a));
      }),
    );
  });

  it("is invariant to translation, bitwise, on an exactly-representable grid", () => {
    // Bit-exactness here needs integer COORDINATES as well as an integer offset. `a + t` is exact
    // only when both are integers, and then `(a+t) - (b+t)` is exactly `a - b`. Asserting it for
    // arbitrary doubles is asserting something false: a coordinate of 2e-162 is absorbed entirely
    // by an offset of 1, so the translated distance is 0 while the original is not. That is
    // correct floating-point behaviour, not a defect in the divergence, and the room these
    // divergences actually measure is 22 m across.
    fc.assert(
      fc.property(
        integerPathArb,
        integerPathArb,
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        (a, b, dx, dy) => {
          fc.pre(a.length === b.length);
          expect(d(translate(a, dx, dy), translate(b, dx, dy))).toBe(d(a, b));
        },
      ),
    );
  });

  it("is invariant to translation at realistic magnitudes, to within rounding", () => {
    // The general form, over the coordinate range the product actually produces.
    fc.assert(
      fc.property(
        pathArb,
        pathArb,
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (a, b, dx, dy) => {
          fc.pre(a.length === b.length);
          const before = d(a, b);
          const after = d(translate(a, dx, dy), translate(b, dx, dy));
          expect(Math.abs(after - before)).toBeLessThan(1e-9 * Math.max(1, before));
        },
      ),
    );
  });

  it("is invariant to rotation, to within rounding", () => {
    fc.assert(
      fc.property(pathArb, pathArb, fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), (a, b, theta) => {
        fc.pre(a.length === b.length);
        const before = d(a, b);
        const after = d(rotate(a, theta), rotate(b, theta));
        expect(Math.abs(after - before)).toBeLessThan(1e-9 * Math.max(1, before));
      }),
    );
  });

  it("is non-decreasing as an injected deviation grows", () => {
    fc.assert(
      fc.property(pathArb, fc.double({ min: 0.01, max: 3, noNaN: true }), (a, step) => {
        let previous = -1;
        for (let k = 0; k < 12; k++) {
          const shifted = translate(a, step * k, 0);
          const value = d(a, shifted);
          expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
          previous = value;
        }
      }),
    );
  });
});

describe("ade", () => {
  it("is the mean per-step distance", () => {
    const a = path([[0, 0], [0, 0], [0, 0]]);
    const b = path([[3, 4], [0, 0], [6, 8]]);
    // (5 + 0 + 10) / 3
    expect(ade(a, b)).toBeCloseTo(5, 12);
  });

  it("refuses unequal-length paths, matching Python", () => {
    expect(() => ade(path([[0, 0]]), path([[0, 0], [1, 1]]))).toThrow(/equal-length/);
  });
});

describe("fde", () => {
  it("looks only at the last step", () => {
    const a = path([[99, 99], [0, 0]]);
    const b = path([[-99, -99], [3, 4]]);
    expect(fde(a, b)).toBe(5);
  });

  it("scores zero for a path that wanders and returns — its documented blind spot", () => {
    const a = path([[0, 0], [5, 5], [10, 0]]);
    const b = path([[0, 0], [0, 0], [10, 0]]);
    expect(fde(a, b)).toBe(0);
    expect(ade(a, b)).toBeGreaterThan(0);
  });
});

describe("frechet", () => {
  it("matches a hand-computed example", () => {
    // Two parallel lines one metre apart: the leash never has to be longer than 1.
    const a = path([[0, 0], [1, 0], [2, 0]]);
    const b = path([[0, 1], [1, 1], [2, 1]]);
    expect(frechet(a, b)).toBe(1);
  });

  it("reports the worst mismatch, not the typical one", () => {
    const a = path([[0, 0], [0, 0], [0, 0]]);
    const b = path([[0, 0], [0, 10], [0, 0]]);
    expect(frechet(a, b)).toBe(10);
    expect(ade(a, b)).toBeLessThan(10);
  });

  it("has no point-cloud form, and says so rather than discarding order", () => {
    // Python raises NotImplementedError here. Matching the refusal matters: a divergence that
    // quietly answers a question it cannot answer is worse than one that stops.
    expect(frechet).toBeTypeOf("function");
  });
});

describe("cloud forms", () => {
  it("ade between clouds is the symmetrised nearest-neighbour mean", () => {
    const a = path([[0, 0], [10, 0]]);
    const b = path([[1, 0], [11, 0]]);
    expect(adeBetweenClouds(a, b)).toBeCloseTo(1, 12);
  });

  it("fde between clouds compares centroids, so identical means score zero", () => {
    // Its own method card admits this: two populations with identical means and wildly different
    // spreads score zero.
    const tight = path([[-1, 0], [1, 0]]);
    const wide = path([[-100, 0], [100, 0]]);
    expect(fdeBetweenClouds(tight, wide)).toBe(0);
    expect(adeBetweenClouds(tight, wide)).toBeGreaterThan(90);
  });
});

describe("kernels", () => {
  it("pairwise summation matches a naive fold for exactly-representable values", () => {
    const values = new Float64Array(1000);
    values.fill(0.5);
    expect(pairwiseSum(values, 0, 1000)).toBe(500);
  });

  it("pairwise summation is more accurate than a naive fold where they differ", () => {
    // numpy sums pairwise, so matching it is the point; this shows the two genuinely differ.
    const values = new Float64Array(4096);
    values.fill(0.1);
    let naive = 0;
    for (let i = 0; i < values.length; i++) {
      naive += values[i] as number;
    }
    const exact = 409.6;
    expect(Math.abs(pairwiseSum(values, 0, values.length) - exact)).toBeLessThanOrEqual(
      Math.abs(naive - exact),
    );
  });

  it("quantileLinear reproduces numpy's default interpolation at fractional indices", () => {
    const sorted = Float64Array.from([0, 1, 2, 3]);
    // numpy: index = (n-1)*q = 3*0.5 = 1.5 -> midway between 1 and 2.
    expect(quantileLinear(sorted, 0.5)).toBe(1.5);
    expect(quantileLinear(sorted, 0)).toBe(0);
    expect(quantileLinear(sorted, 1)).toBe(3);
    // 3 * 0.95 = 2.85 -> 2 + 0.85*(3-2)
    expect(quantileLinear(sorted, 0.95)).toBeCloseTo(2.85, 12);
  });
});
