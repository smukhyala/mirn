# MIRN Simulator Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MIRN's seventeen-page teaching notebook with a single simulator console — set up an invented crowd, press Run, and compare what different rulers say about what the robot did to it.

**Architecture:** The 2,519-line simulation and measurement engine is untouched. A new `web/engine/job/` layer turns a frozen, structured-cloneable `SweepJob` into per-run readings; a Web Worker runs it and returns **numbers only, never trajectories**, so playback re-simulates the selected run in 38 ms instead of shipping 33 MB of paths. Three commits, each independently green: extract the sweep logic with the existing measure script as its caller, build the console beside the notebook, then delete the notebook.

**Tech Stack:** TypeScript 5.7 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vite 6, Vitest 2, jsdom for DOM assertions, canvas 2D for the arena. No framework, no server, no backend. Python 3 + pytest remain as the parity oracle and are **not touched by this plan**.

**Spec:** `docs/superpowers/specs/2026-08-22-simulator-console-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **No classes anywhere in `web/engine/` or `web/app/`.** Frozen plain records validated in a `make*` factory that throws `ContractError`. Everything crosses a Worker boundary and must be structured-cloneable — `structuredClone` on a class instance silently degrades to a plain object with its prototype lost, and on a function it throws `DataCloneError`.
- **Explicit `kind: string` discriminants.** Never type sniffing, never `instanceof`.
- **Explicit loops with named intermediates.** No chained expressions to save lines. The one sanctioned exception is `web/engine/job/stats.ts`, where `meanOf`/`sdOf`/`finiteCount` keep their `filter`/`reduce` form because `web/data/experiment-facts.json` is diffed byte for byte and summation order is observable output rather than style.
- **`Math.hypot` is banned in `web/engine/measure/`.** V8's is more accurate than numpy's naive `sqrt(sum(d*d))`, so it disagrees with the Python oracle in the last bits. `web/engine/measure/__tests__/hypot.test.ts` greps the directory and enforces it.
- **Production modules under `web/engine/job/` must never import from `web/engine/measure/`,** and `job/` must never acquire a Python oracle of its own. Test files under `web/engine/job/__tests__/` MAY import from `measure/` to build realistic fixtures: the rule exists to stop production coupling dragging `job/` into `measure/`'s parity obligations, and a test fixture creates no such obligation. `measure/` is parity-bound; `job/` is not, and a shared dependency drags one into the other's obligations (guardrails 8 and 9).
- **Determinism is load-bearing.** Every stochastic path takes an explicit seed. `Math.random` throws in the engine test suite. Determinism tests compare bytes: `toBe`, never `toBeCloseTo`.
- **No number reaches a reader without its zero.** A zero reading is a required prop of the tile component, never optional and never inside a closed `<details>`. No rendered string may contain a literal metre or second value — every figure renders from data at paint time.
- **The invented-crowd disclosure precedes every number in document order,** asserted with `indexOf` against the HTML file on disk, not the booted DOM. The exported CSV carries it on line 1, because a file outlives the page it came from.
- **No bare code identifier on any surface a reader sees.** Enforced by the identifier regex `/\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/`, which today lives only in `web/app/__tests__/render.test.ts:187` — a file commit 3 deletes. It **must** be re-homed onto the catalogues in commit 2 (Tasks 11 and 14) before Task 32 removes the original.
- **No server, no backend, no persistence beyond the URL** — and that explicitly includes `localStorage`, `sessionStorage` and `IndexedDB`. The permalink carries the recipe, never results.
- **The console page is `web/console.html` until Task 33.** `scripts/build-notes.ts:485` writes `web/index.html` unconditionally and `package.json` wires `dev`, `build` and `check` as `npm run notes && …`, so writing the console to `index.html` before the notes build is deleted produces a green build of the wrong page.
- **The forecast horizon defaults to 60 steps (3.00 s), never 16.** Measured: at 16 the forecaster reads 0.0262 m on a robot-blind run against a 0.3106 m band — twelve times below the noise floor, so the console would ship with its central argument refuted by its own default state.
- **Commands.** Nothing from the virtualenv is on PATH. `npm run check`, `npx vitest run <path>`, `.venv/bin/python -m pytest -q -m "not slow"`, `.venv/bin/python -m ruff check src tests`.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `web/engine/job/stats.ts` | survivorship-aware `meanOf`/`sdOf`/`finiteCount`; later `Aggregate`/`aggregate` | 1, 13 |
| `web/engine/job/sweep.ts` | `runSweep` (values × seeds) and `aggregateSweep` (the facts-file row shape) | 2, 3 |
| `web/engine/job/report.ts` | `ReportContext`, `runReport`, `perAgentDeviationByUid`, `pedestrianTimeLost` | 9, 10, 12 |
| `web/engine/job/columns.ts` | the closed measurement catalogue: extractor + label + unit + zero + assumption, co-located | 11 |
| `web/engine/job/axes.ts` | the closed knob catalogue, feeding both the sliders and the sweep-axis picker | 14 |
| `web/engine/job/spec.ts` | `SweepJob`, `makeSweepJob`, `configForCell`, `paramsForCell`, `seedFor` | 15 |
| `web/engine/job/plan.ts`, `runner.ts` | `planSweep`, `sweepUnits`, `accumulate` — the one grouping implementation | 16 |
| `web/app/worker/protocol.ts` | message types only; no logic, no `measure/` import | 17 |
| `web/app/worker/sweep.worker.ts`, `client.ts` | the postMessage shell and the main-thread wrapper | 18 |
| `web/app/console/state.ts` | `ConsoleState`/`ConsoleSettings`/`ConsoleUi`, `makeConsoleSettings` | 19 |
| `web/app/console/permalink.ts` | recipe in, recipe out; never results | 20 |
| `web/app/console/csv.ts` | disclosure on line 1, full provenance block | 21 |
| `web/app/console/panel.ts` | the control panel, generated from `AXES` | 24 |
| `web/app/console/tile.ts` | headline tile and band gauge; zero inseparable from value | 25 |
| `web/app/console/table.ts` | the ledger, column picker, pinning, comparison, staleness | 28 |
| `web/console.html`, `web/console.ts` | the page and its boot | 23, 26, 27, 29 |
| `web/ui/plot.ts` | gains the sweep curve with a shaded per-axis-value band | 22 |
| `web/theme.gen.css` | becomes committed, with a drift test standing in for its deleted generator | 31 |

**Untouched by this plan:** all of `web/engine/sim/`, `web/engine/contracts/` (except the six `makeRunConfig` validations in Task 6), `web/engine/rng/`, `web/engine/core/`, `web/ui/arena.ts`, `web/ui/theme.ts`, `web/ui/labels.ts`, `web/app/clock.ts`, and the entire Python side — `src/mirn/`, `tests/`, `pyproject.toml` and `tests/golden/parity/`.

---

## Commit 1 — Extract

No UI changes. Every existing test stays green. The acceptance gate is a byte-identical `web/data/experiment-facts.json`.

---

### Task 1: The numeric helpers (`web/engine/job/stats.ts`)

**Files:**
- Create: `web/engine/job/stats.ts`
- Test: `web/engine/job/__tests__/stats.test.ts`

**Interfaces:**
- Consumes: nothing yet. Commit 2 (Task 13) adds `fail` from `web/engine/core/errors.ts` and type-only imports from `./columns.ts`. The standing rule is narrower than "imports nothing" — `web/engine/measure/` has a Python oracle and `web/engine/job/` deliberately does not (CLAUDE.md guardrails 8 and 9), so the two must not grow a shared dependency that drags one into the other's parity obligations.
- Produces: `meanOf(values: readonly number[]): number`, `sdOf(values: readonly number[]): number`, `finiteCount(values: readonly number[]): number` — all exported from `web/engine/job/stats.ts`. Tasks 3, 4 and 5 import them.

Background the implementer needs: these three functions exist today as private helpers at `scripts/measure-experiments.ts:41-55`. Their committed output — `web/data/experiment-facts.json`, 729 lines of numbers the site quotes — is what Task 4 diffs byte for byte. So they are **lifted verbatim**, including the `filter`/`reduce` chains that the repo's "explicit loops with named intermediates" convention would otherwise forbid. Rewriting them as loops is a change nobody can prove is safe from inside this task.

The vitest project that picks this file up is `engine` (see `vitest.workspace.ts`): `environment: "node"`, `include: ["web/engine/**/*.test.ts"]`, and a setup file that makes `Math.random` throw. Nothing here is stochastic, so that costs nothing.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/stats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { finiteCount, meanOf, sdOf } from "../stats.js";

/**
 * These three functions decide what a censored run does to a published average, so their
 * non-finite behaviour is the whole point and is pinned here rather than assumed.
 */
describe("meanOf", () => {
  it("averages the finite values and silently drops the rest", () => {
    expect(meanOf([1, 2, 3])).toBe(2);
    expect(meanOf([1, Number.NaN, 3])).toBe(2);
    expect(meanOf([1, Number.POSITIVE_INFINITY, 3])).toBe(2);
    expect(meanOf([1, Number.NEGATIVE_INFINITY, 3])).toBe(2);
  });

  it("is NaN when nothing survives, never 0", () => {
    // A 0 here would render as a real measurement of "no effect" on a page that cannot tell the
    // difference. NaN is the only honest answer to an average of nothing.
    expect(Number.isNaN(meanOf([]))).toBe(true);
    expect(Number.isNaN(meanOf([Number.NaN, Number.NaN]))).toBe(true);
  });

  it("sums left to right, which is what makes the committed facts file reproducible", () => {
    expect(meanOf([0.1, 0.2, 0.3])).toBe((0.1 + 0.2 + 0.3) / 3);
  });
});

describe("sdOf", () => {
  it("uses the n-1 denominator", () => {
    // mean 5; squared deviations 9+1+1+1+0+0+4+16 = 32; 32/(8-1).
    expect(sdOf([2, 4, 4, 4, 5, 5, 7, 9])).toBe(Math.sqrt(32 / 7));
  });

  it("is NaN below two finite values, because a 0 there would read as no spread", () => {
    expect(Number.isNaN(sdOf([]))).toBe(true);
    expect(Number.isNaN(sdOf([5]))).toBe(true);
    expect(Number.isNaN(sdOf([5, Number.NaN]))).toBe(true);
  });

  it("drops the non-finite values before it counts them", () => {
    expect(sdOf([2, Number.NaN, 4, Number.POSITIVE_INFINITY])).toBe(sdOf([2, 4]));
  });
});

describe("finiteCount", () => {
  it("counts the survivors, so no average can be quoted without its denominator", () => {
    expect(finiteCount([1, Number.NaN, 3, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]))
      .toBe(2);
    expect(finiteCount([])).toBe(0);
    expect(finiteCount([Number.NaN])).toBe(0);
  });

  it("is the pair that makes a fully censored column readable: NaN over 0, not 0 over 8", () => {
    const allCensored = [Number.NaN, Number.NaN, Number.NaN];
    expect(Number.isNaN(meanOf(allCensored))).toBe(true);
    expect(finiteCount(allCensored)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/job/__tests__/stats.test.ts`

Expected: FAIL before any test body executes, because the module does not exist yet — Vite reports `Failed to load url ../stats.js (resolved id: .../web/engine/job/stats.js). Does the file exist?`

- [ ] **Step 3: Write minimal implementation**

Create `web/engine/job/stats.ts`:

```ts
/**
 * The numeric helpers the experiment script and the console both average with.
 *
 * This file must never import from `web/engine/measure/`. That directory is checked against a Python
 * oracle and `web/engine/job/` is not (CLAUDE.md, guardrails 8 and 9), so a shared dependency
 * between them would drag one into the other's parity obligations for no benefit.
 *
 * These three were lifted verbatim out of scripts/measure-experiments.ts. The filter/reduce form
 * survives the house preference for explicit loops on purpose: web/data/experiment-facts.json is
 * committed and diffed byte for byte, so the summation order here is observable output rather
 * than style.
 */

/**
 * Mean over the FINITE values, which is a survivorship trap and is why every swept column also
 * reports how many runs it actually averaged.
 *
 * A censored measurement — recovery that never came inside its tolerance, an arrival that never
 * happened — comes back NaN and gets dropped here. Recovery time was once averaged over as few as
 * two of eight runs and presented as a property of the eight, with nothing on the page or in the
 * facts file to say so. Dropping the value is right; dropping it silently is not, which is what
 * `finiteCount` is for.
 */
export function meanOf(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return Number.NaN;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

/** How many of the values were finite — the denominator a mean must never be quoted without. */
export function finiteCount(values: readonly number[]): number {
  return values.filter((v) => Number.isFinite(v)).length;
}

/**
 * Sample standard deviation, n-1, over the finite values.
 *
 * NaN below two survivors rather than 0: a 0 there reads as "measured, and there was no spread",
 * which is the opposite of "there was not enough left to say".
 */
export function sdOf(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return Number.NaN;
  const m = meanOf(finite);
  return Math.sqrt(finite.reduce((a, b) => a + (b - m) ** 2, 0) / (finite.length - 1));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/job/__tests__/stats.test.ts`
Expected: `Test Files 1 passed`, `Tests 8 passed`, in well under a second.

- [ ] **Step 5: Commit**

```bash
git add web/engine/job/stats.ts web/engine/job/__tests__/stats.test.ts
git commit -m "Lift the survivorship-aware mean, sd and count into web/engine/job/

Verbatim from scripts/measure-experiments.ts, filter/reduce form included: the
facts file is diffed byte for byte, so summation order is output, not style."
```

---

### Task 2: `runSweep` — the (values x seeds) loop

**Files:**
- Create: `web/engine/job/sweep.ts`
- Test: `web/engine/job/__tests__/sweep.test.ts`

**Interfaces:**
- Consumes: `makeRunConfig(overrides?: RunConfigOverrides): RunConfig` and `type RunConfigOverrides` from `web/engine/contracts/config.ts`; `runPair(config: RunConfig, nowMs?: () => number): RunResult` and `type RunResult` from `web/engine/sim/run.ts`; `fail(message: string): never` and `class ContractError extends Error` from `web/engine/core/errors.ts`; `deviation(pair: PairedRun): Deviation` from `web/engine/measure/metrics.ts` (test only).
- Produces:
  - `export type MetricPoint = Readonly<Record<string, number>>;`
  - `export interface SweepPoint { readonly kind: "sweepPoint"; readonly axisValue: number; readonly seedIndex: number; readonly metrics: MetricPoint; }`
  - `export function runSweep(opts: { readonly values: readonly number[]; readonly seedIndices: readonly number[]; readonly config: (value: number, seedIndex: number) => RunConfig; readonly measure: (run: RunResult, value: number, seedIndex: number) => MetricPoint; }): readonly SweepPoint[];`

Two things about `runSweep` that are easy to get wrong and that the test pins. It visits **axis value outermost, seed innermost**, matching `scripts/measure-experiments.ts:106-110`. And it does **not** filter or reject a non-finite metric: a NaN from a censored measurement is a result and has to reach the aggregate, where `finiteCount` reports it. Rejecting it here would delete exactly the information the site exists to show.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/sweep.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeRunConfig, type RunConfigOverrides } from "../../contracts/config.js";
import { ContractError } from "../../core/errors.js";
import { deviation } from "../../measure/metrics.js";
import { runSweep } from "../sweep.js";

/**
 * Small on purpose: 4 people for 40 ticks is about 5 ms a pair, so this whole file runs in well
 * under a second. Nothing here is a measurement of the crowd; it is a test of the harness.
 */
function tinyConfig(seedIndex: number, overrides: RunConfigOverrides = {}) {
  return makeRunConfig({
    seed: 20260816 + seedIndex * 7919,
    nTicks: 40,
    crowd: { nPedestrians: 4 },
    ...overrides,
  });
}

describe("runSweep", () => {
  it("runs every axis value against every seed, axis value outermost", () => {
    const visited: string[] = [];
    const points = runSweep({
      values: [0, 1],
      seedIndices: [0, 1, 2],
      config: (value, seedIndex) => tinyConfig(seedIndex, { robot: { repulsionScale: value } }),
      measure: (_run, value, seedIndex) => {
        visited.push(`${value}:${seedIndex}`);
        return { seen: 1 };
      },
    });
    expect(visited).toEqual(["0:0", "0:1", "0:2", "1:0", "1:1", "1:2"]);
    expect(points.length).toBe(6);
    expect(points[0]!.kind).toBe("sweepPoint");
    expect(points[0]!.axisValue).toBe(0);
    expect(points[0]!.seedIndex).toBe(0);
    expect(points[5]!.axisValue).toBe(1);
    expect(points[5]!.seedIndex).toBe(2);
  });

  it("hands the measurement function the run built from that cell's own config", () => {
    const points = runSweep({
      values: [2],
      seedIndices: [5],
      config: (value, seedIndex) => tinyConfig(seedIndex, { robot: { repulsionScale: value } }),
      measure: (run) => ({
        repulsionScale: run.config.robot.repulsionScale,
        seed: run.config.seed,
      }),
    });
    expect(points[0]!.metrics["repulsionScale"]).toBe(2);
    expect(points[0]!.metrics["seed"]).toBe(20260816 + 5 * 7919);
  });

  it("is bitwise reproducible: the same sweep run twice differs by exactly zero", () => {
    const build = () =>
      runSweep({
        values: [0.5, 1],
        seedIndices: [0, 1],
        config: (value, seedIndex) => tinyConfig(seedIndex, { robot: { repulsionScale: value } }),
        measure: (run) => {
          const d = deviation(run.pair);
          return { meanDeviationM: d.meanM, maxDeviationM: d.maxM };
        },
      });
    const first = build();
    const second = build();
    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i++) {
      const a = first[i]!;
      const b = second[i]!;
      // Bytes, not approximations. Anything but an exact 0 means the two runs drew different
      // randomness, and every claim downstream of this module is then unreproducible.
      expect(b.metrics["meanDeviationM"]! - a.metrics["meanDeviationM"]!).toBe(0);
      expect(b.metrics["maxDeviationM"]! - a.metrics["maxDeviationM"]!).toBe(0);
    }
  });

  it("carries a censored measurement through as NaN rather than dropping the run", () => {
    const points = runSweep({
      values: [0],
      seedIndices: [0, 1],
      config: (_value, seedIndex) => tinyConfig(seedIndex),
      measure: (_run, _value, seedIndex) => ({ arrivalS: seedIndex === 1 ? Number.NaN : 3 }),
    });
    expect(points.length).toBe(2);
    expect(points[0]!.metrics["arrivalS"]).toBe(3);
    expect(Number.isNaN(points[1]!.metrics["arrivalS"]!)).toBe(true);
  });

  it("freezes its own copy of the metrics, so a caller's scratch object cannot rewrite a result", () => {
    const scratch: Record<string, number> = { a: 1 };
    const points = runSweep({
      values: [0],
      seedIndices: [0],
      config: (_value, seedIndex) => tinyConfig(seedIndex),
      measure: () => scratch,
    });
    scratch["a"] = 99;
    expect(points[0]!.metrics["a"]).toBe(1);
    expect(Object.isFrozen(points[0]!)).toBe(true);
    expect(Object.isFrozen(points[0]!.metrics)).toBe(true);
  });

  it("refuses an empty grid before it simulates anything", () => {
    expect(() =>
      runSweep({
        values: [],
        seedIndices: [0],
        config: (_value, seedIndex) => tinyConfig(seedIndex),
        measure: () => ({}),
      }),
    ).toThrow(ContractError);
    expect(() =>
      runSweep({
        values: [0],
        seedIndices: [],
        config: (_value, seedIndex) => tinyConfig(seedIndex),
        measure: () => ({}),
      }),
    ).toThrow(ContractError);
  });

  it("refuses a repeated axis value or seed index, which would silently merge two cells", () => {
    expect(() =>
      runSweep({
        values: [1, 1],
        seedIndices: [0],
        config: (_value, seedIndex) => tinyConfig(seedIndex),
        measure: () => ({}),
      }),
    ).toThrow(/appears twice/);
    expect(() =>
      runSweep({
        values: [1],
        seedIndices: [0, 0],
        config: (_value, seedIndex) => tinyConfig(seedIndex),
        measure: () => ({}),
      }),
    ).toThrow(/appears twice/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/job/__tests__/sweep.test.ts`

Expected: FAIL at load — `Failed to load url ../sweep.js (resolved id: .../web/engine/job/sweep.ts). Does the file exist?`

- [ ] **Step 3: Write minimal implementation**

Create `web/engine/job/sweep.ts`:

```ts
import type { RunConfig } from "../contracts/config.js";
import { fail } from "../core/errors.js";
import { runPair, type RunResult } from "../sim/run.js";

/**
 * One press of Run is (N axis values x M seeds), and a single run is the degenerate 1x1 case of
 * the same mechanism. This file is that grid and nothing else: it owns no measurement, no config
 * and no axis. The caller supplies a config builder and a measurement function, exactly as
 * scripts/measure-experiments.ts supplied them to its own private loop before this was extracted.
 */

/** What one run measured, by name. Values may be NaN: a censored measurement is still a result. */
export type MetricPoint = Readonly<Record<string, number>>;

/** One cell, one seed, one set of numbers. The addressable unit underneath every average. */
export interface SweepPoint {
  readonly kind: "sweepPoint";
  readonly axisValue: number;
  readonly seedIndex: number;
  readonly metrics: MetricPoint;
}

export function runSweep(opts: {
  readonly values: readonly number[];
  readonly seedIndices: readonly number[];
  readonly config: (value: number, seedIndex: number) => RunConfig;
  readonly measure: (run: RunResult, value: number, seedIndex: number) => MetricPoint;
}): readonly SweepPoint[] {
  // Everything is checked before the first simulation. The alternative is discovering an illegal
  // grid forty seconds into a sweep, which teaches the operator that Run means "wait, then lose it".
  if (opts.values.length === 0) {
    fail("runSweep needs at least one axis value; a sweep over nothing has no cells to average");
  }
  if (opts.seedIndices.length === 0) {
    fail("runSweep needs at least one seed index; every point here is a mean over seeds");
  }
  const seenValues = new Set<number>();
  for (const value of opts.values) {
    if (!Number.isFinite(value)) {
      fail(`runSweep axis values must be finite, got ${value}`);
    }
    if (seenValues.has(value)) {
      fail(
        `runSweep axis value ${value} appears twice; the two cells would merge into one average ` +
          `and the row would report more runs than it swept`,
      );
    }
    seenValues.add(value);
  }
  const seenSeeds = new Set<number>();
  for (const seedIndex of opts.seedIndices) {
    if (!Number.isInteger(seedIndex) || seedIndex < 0) {
      fail(`runSweep seed indices must be non-negative integers, got ${seedIndex}`);
    }
    if (seenSeeds.has(seedIndex)) {
      fail(`runSweep seed index ${seedIndex} appears twice; that run would be counted twice`);
    }
    seenSeeds.add(seedIndex);
  }

  const points: SweepPoint[] = [];
  for (const value of opts.values) {
    for (const seedIndex of opts.seedIndices) {
      const config = opts.config(value, seedIndex);
      const run = runPair(config);
      const measured = opts.measure(run, value, seedIndex);
      // Copied key by key rather than aliased, so a caller reusing one scratch object cannot
      // rewrite a result it already returned. The copy walks Object.keys, which preserves the
      // insertion order the aggregate later writes rows in.
      //
      // Note what is NOT done here: nothing is filtered for finiteness. A NaN is a censored
      // measurement, and it has to reach the aggregate for `finiteCount` to report it.
      const metrics: Record<string, number> = {};
      for (const key of Object.keys(measured)) {
        metrics[key] = measured[key] as number;
      }
      const point: SweepPoint = Object.freeze({
        kind: "sweepPoint" as const,
        axisValue: value,
        seedIndex,
        metrics: Object.freeze(metrics),
      });
      points.push(point);
    }
  }
  return Object.freeze(points);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/job/__tests__/sweep.test.ts`
Expected: `Test Files 1 passed`, `Tests 7 passed`, under two seconds.

- [ ] **Step 5: Commit**

```bash
git add web/engine/job/sweep.ts web/engine/job/__tests__/sweep.test.ts
git commit -m "Extract the (values x seeds) sweep loop into web/engine/job/sweep.ts

Axis value outermost, seed innermost, frozen points, and a censored NaN carried
through rather than filtered - the aggregate is what reports it."
```

---

### Task 3: `aggregateSweep` — the row shape, key order included

**Files:**
- Modify: `web/engine/job/sweep.ts` (append; the file ends at `runSweep`'s closing brace)
- Test: `web/engine/job/__tests__/aggregate.test.ts`

**Interfaces:**
- Consumes: `meanOf`, `sdOf`, `finiteCount` from `web/engine/job/stats.ts` (Task 1); `SweepPoint` and `MetricPoint` from `web/engine/job/sweep.ts` (Task 2).
- Produces: `export function aggregateSweep(points: readonly SweepPoint[], axisName: string): readonly Readonly<Record<string, number>>[];`

The contract that matters is **key insertion order**, because `JSON.stringify` writes an object's keys in insertion order and Task 4 diffs the resulting file byte for byte. The order is: the axis key first, then, per metric in first-seen order, `k`, then `k_sd`, then `k_n`. Rebuilt from `scripts/measure-experiments.ts:115-123`.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/aggregate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregateSweep, type SweepPoint } from "../sweep.js";

/** Hand-built points, so this file runs the arithmetic without running the crowd. */
function point(axisValue: number, seedIndex: number, metrics: Record<string, number>): SweepPoint {
  return { kind: "sweepPoint", axisValue, seedIndex, metrics };
}

describe("aggregateSweep", () => {
  it("writes the axis key first, then k, k_sd and k_n per metric in first-seen order", () => {
    const rows = aggregateSweep(
      [
        point(0.5, 0, { meanDeviationM: 1, maxDeviationM: 3 }),
        point(0.5, 1, { meanDeviationM: 3, maxDeviationM: 5 }),
      ],
      "repulsionScale",
    );
    expect(rows.length).toBe(1);
    // The ORDER is the assertion, not the presence. web/data/experiment-facts.json is committed
    // and diffed byte for byte, and JSON.stringify writes keys in insertion order.
    expect(Object.keys(rows[0]!)).toEqual([
      "repulsionScale",
      "meanDeviationM",
      "meanDeviationM_sd",
      "meanDeviationM_n",
      "maxDeviationM",
      "maxDeviationM_sd",
      "maxDeviationM_n",
    ]);
    expect(JSON.stringify(rows[0])).toBe(
      '{"repulsionScale":0.5,"meanDeviationM":2,"meanDeviationM_sd":1.4142135623730951,' +
        '"meanDeviationM_n":2,"maxDeviationM":4,"maxDeviationM_sd":1.4142135623730951,' +
        '"maxDeviationM_n":2}',
    );
  });

  it("keeps the cells in first-seen order, one row per axis value", () => {
    const rows = aggregateSweep(
      [point(3, 0, { a: 1 }), point(1, 0, { a: 2 }), point(3, 1, { a: 5 })],
      "axisName",
    );
    expect(rows.length).toBe(2);
    expect(rows[0]!["axisName"]).toBe(3);
    expect(rows[0]!["a"]).toBe(3);
    expect(rows[0]!["a_n"]).toBe(2);
    expect(rows[1]!["axisName"]).toBe(1);
    expect(rows[1]!["a"]).toBe(2);
    expect(rows[1]!["a_n"]).toBe(1);
    expect(Number.isNaN(rows[1]!["a_sd"]!)).toBe(true);
  });

  it("reports a fully censored column as NaN over a count of zero, never as a blank or a 0", () => {
    const rows = aggregateSweep(
      [
        point(0.4, 0, { robotArrivalS: Number.NaN }),
        point(0.4, 1, { robotArrivalS: Number.NaN }),
      ],
      "maxSpeed",
    );
    expect(Number.isNaN(rows[0]!["robotArrivalS"]!)).toBe(true);
    expect(Number.isNaN(rows[0]!["robotArrivalS_sd"]!)).toBe(true);
    expect(rows[0]!["robotArrivalS_n"]).toBe(0);
    // Exactly how e3_robot_speed's slowest cell is written in the facts file today: JSON has no
    // NaN, so a censored average serialises as null and only the count says what happened.
    expect(JSON.stringify(rows[0])).toBe(
      '{"maxSpeed":0.4,"robotArrivalS":null,"robotArrivalS_sd":null,"robotArrivalS_n":0}',
    );
  });

  it("averages a metric over only the seeds that produced it, keeping late keys late", () => {
    const rows = aggregateSweep(
      [point(1, 0, { a: 1 }), point(1, 1, { a: 3, b: 10 })],
      "axisName",
    );
    expect(Object.keys(rows[0]!)).toEqual(["axisName", "a", "a_sd", "a_n", "b", "b_sd", "b_n"]);
    expect(rows[0]!["a"]).toBe(2);
    expect(rows[0]!["a_n"]).toBe(2);
    expect(rows[0]!["b"]).toBe(10);
    expect(rows[0]!["b_n"]).toBe(1);
    expect(Number.isNaN(rows[0]!["b_sd"]!)).toBe(true);
  });

  it("returns frozen rows", () => {
    const rows = aggregateSweep([point(1, 0, { a: 1 })], "axisName");
    expect(Object.isFrozen(rows)).toBe(true);
    expect(Object.isFrozen(rows[0]!)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/job/__tests__/aggregate.test.ts`

Expected: FAIL at load — `SyntaxError: The requested module '/web/engine/job/sweep.ts' does not provide an export named 'aggregateSweep'`

- [ ] **Step 3: Write minimal implementation**

Append to `web/engine/job/sweep.ts`, and add the stats import to the top of the file so the import block reads:

```ts
import type { RunConfig } from "../contracts/config.js";
import { fail } from "../core/errors.js";
import { runPair, type RunResult } from "../sim/run.js";
import { finiteCount, meanOf, sdOf } from "./stats.js";
```

Then, below `runSweep`:

```ts
/**
 * Collapse the per-seed points into one row per axis value.
 *
 * The row shape is `{ [axisName]: value, k: mean, k_sd: sd, k_n: survivors, ... }`, and the KEY
 * ORDER is part of the contract: `JSON.stringify` writes keys in insertion order, and
 * web/data/experiment-facts.json is committed and diffed byte for byte. The axis key goes first;
 * metrics follow in the order they were first seen in this cell.
 *
 * Metric names are identifiers, never digit strings — an integer-like key would be reordered
 * ahead of everything else by the language's own property-order rules.
 *
 * A mean never appears without its count. `k_n` is how many runs the cell actually averaged, and
 * it is below the seed count whenever a measurement was censored, which anything quoting the cell
 * has to be able to say.
 */
export function aggregateSweep(
  points: readonly SweepPoint[],
  axisName: string,
): readonly Readonly<Record<string, number>>[] {
  const cellOrder: number[] = [];
  const cells = new Map<number, Record<string, number[]>>();
  for (const point of points) {
    let collected = cells.get(point.axisValue);
    if (collected === undefined) {
      collected = {};
      cells.set(point.axisValue, collected);
      cellOrder.push(point.axisValue);
    }
    for (const key of Object.keys(point.metrics)) {
      const value = point.metrics[key] as number;
      const bucket = collected[key];
      if (bucket === undefined) {
        collected[key] = [value];
      } else {
        bucket.push(value);
      }
    }
  }

  const rows: Readonly<Record<string, number>>[] = [];
  for (const axisValue of cellOrder) {
    const collected = cells.get(axisValue) as Record<string, number[]>;
    const row: Record<string, number> = {};
    row[axisName] = axisValue;
    for (const key of Object.keys(collected)) {
      const values = collected[key] as number[];
      row[key] = meanOf(values);
      row[`${key}_sd`] = sdOf(values);
      row[`${key}_n`] = finiteCount(values);
    }
    rows.push(Object.freeze(row));
  }
  return Object.freeze(rows);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/job/__tests__/aggregate.test.ts`
Expected: `Test Files 1 passed`, `Tests 5 passed`, in well under a second.

- [ ] **Step 5: Commit**

```bash
git add web/engine/job/sweep.ts web/engine/job/__tests__/aggregate.test.ts
git commit -m "Add aggregateSweep, key insertion order included

Axis key first, then k / k_sd / k_n per metric in first-seen order. That order is
the committed facts file's byte layout, so it is pinned by a JSON.stringify test
rather than by toEqual."
```

---

### Task 4: Point the experiment script at the module — the byte-identical gate

**Files:**
- Modify: `scripts/measure-experiments.ts:14-20` (imports), `scripts/measure-experiments.ts:32-55` (delete the three duplicated helpers), `scripts/measure-experiments.ts:104-124` (rewire `sweep`)
- Test: `npm run measure && git diff --exit-code web/data/experiment-facts.json` — the acceptance gate for the whole commit

**Interfaces:**
- Consumes: `meanOf`, `sdOf`, `finiteCount` from `web/engine/job/stats.ts` (Task 1); `runSweep` from `web/engine/job/sweep.ts` (Task 2); `aggregateSweep` from `web/engine/job/sweep.ts` (Task 3).
- Produces: no new exports. It produces the evidence: `web/data/experiment-facts.json` unchanged after the extraction.

**Which experiments get rewired, and which do not.** Five of the nine blocks go through the script's private `sweep()` and are rewired for free, because `sweep()` itself is what changes: `e1_push_strength`, `e3_robot_speed`, `e4_recovery`, `e6_perception`, `e7_politeness`. Four blocks are hand-rolled and are **left exactly as they are**:

- `e2_density` (`:154-211`) — it measures a second thing about the same configuration (`replicateBand`, which carries its own count), and `totalPersonMetres` and `signalToBand` are functions of the cell mean rather than of per-seed values, with `signalToBand_n` a hand-chosen `Math.min` of two counts. `aggregateSweep` would emit different keys and different numbers.
- `e5_propagation` (`:245-289`) — it pools per-person values into closest-approach bins across sixteen seeds. There is no per-cell-per-seed row at all, and its rows carry `nPeople` instead of `_sd` and `_n`.
- `confounding_squeeze` (`:311-335`) — two `runPair`s per cell, the real one and the robot-blind one. `runSweep` runs one. (The zero-reference run is `SweepJob.zeroReferenceRun` in commit 2, not here.)
- `detection_floor` (`:341-365`) — one run per cell, but the published row deliberately omits `floorM_n` and both `nullMeanM_sd` and `nullMeanM_n`.

Leaving them alone does not weaken the gate, and it is worth being precise about why. All four still call `meanOf`, and `e2_density` and `detection_floor` also call `sdOf`, with `e2_density` calling `finiteCount` three times — those calls now resolve to `web/engine/job/stats.ts`, so **every block in the file exercises the extracted helpers**. And the five rewired sweeps exercise `runSweep` and `aggregateSweep` over four different metric shapes, including both censoring cases: `e3_robot_speed`'s slowest cell is fully censored (`robotArrivalS_n: 0`, value `null`) and `e4_recovery`'s `recoveryS` is partially censored in every cell (5, 4, 6, 6, 3 and 2 of 8). A byte-identical facts file after this edit therefore covers the NaN paths, the count paths and the key order, which is everything Tasks 1 to 3 claim.

- [ ] **Step 1: Prove the gate is meaningful before changing anything**

Run: `git status --porcelain web/data/experiment-facts.json && npm run measure && git diff --exit-code web/data/experiment-facts.json && echo GATE_BASELINE_OK`

Expected: `git status` prints nothing (the file is clean at HEAD). `npm run measure` prints one table per experiment and ends with `wrote web/data/experiment-facts.json`; it is the slowest command in the repo — the density block runs six band replicates per seed and the detection-floor block runs a split-half null per seed — so expect minutes, not seconds. Along the way it prints censoring notes, including:

```
    NOTE e3_robot_speed maxSpeed=0.4 robotArrivalS: averaged 0 of 8 runs; the rest were censored
    NOTE e4_recovery passingOffsetM=0 recoveryS: averaged 5 of 8 runs; the rest were censored
```

Then `git diff --exit-code` exits 0 silently and `GATE_BASELINE_OK` prints. **If this step produces a diff, stop.** It means this machine does not reproduce the committed numbers, the byte gate cannot distinguish an extraction bug from a platform difference, and the rest of this task proves nothing.

- [ ] **Step 2: Swap the script's private helpers for the module**

Make these three edits by matching the quoted text — the line numbers are as of HEAD and shift as you go.

First, extend the import block at the top (currently `scripts/measure-experiments.ts:14-20`) by adding two lines after the `splitHalfNull` import:

```ts
import { seededPermutations, splitHalfNull } from "../web/engine/measure/null/splitHalf.js";
import { finiteCount, meanOf, sdOf } from "../web/engine/job/stats.js";
import { aggregateSweep, runSweep } from "../web/engine/job/sweep.js";
```

Second, delete `scripts/measure-experiments.ts:32-55` — the whole block from the comment `/**\n * Mean over the FINITE values,` down to and including the closing brace of `sdOf`. That is the doc comment plus `meanOf`, `finiteCount` and `sdOf`. Leave `arrivalStep` (`:57-66`), `pedestrianTimeLost` (`:68-77`) and `bystanderDeviation` (`:79-99`) alone: `pedestrianTimeLost` moves to `web/engine/job/report.ts` in commit 2 with a different return type, and neither belongs in this commit.

Third, replace `scripts/measure-experiments.ts:104-124` — the `sweep` signature and everything down to the closing brace of the `for (const v of values)` loop, stopping just before the `facts[name] = ...` line — with:

```ts
function sweep(
  name: string,
  axis: string,
  values: readonly number[],
  build: (v: number, seed: number) => RunConfigOverrides,
  measure: (r: RunResult, v: number, seedIndex: number) => Point,
): void {
  // The (values x seeds) loop, the per-cell collection and the k / k_sd / k_n row shape live in
  // web/engine/job/sweep.ts now, because the console runs the same grid from a Worker and two
  // copies of an averaging rule is how a table comes to disagree with the file it was built from.
  // What stays here is what is specific to writing the facts file: the config builder above and
  // the console tables below.
  const points = runSweep({
    values,
    seedIndices: SEEDS,
    config: (v, s) => cfg(s, build(v, s)),
    measure,
  });
  const rows = aggregateSweep(points, axis);
```

Everything from `facts[name] = { axis, nSeeds: SEEDS.length, rows };` onward is untouched, and still type-checks: `rows` is now `readonly Readonly<Record<string, number>>[]`, whose indexed access is already `number | undefined` under `noUncheckedIndexedAccess`, which is what the existing `(row[k] as number).toFixed(3)` and `const n = row[\`${k}_n\`]` lines were written against.

- [ ] **Step 3: Put the script under the typechecker, then typecheck and run the unit tests**

`tsconfig.json`'s `include` is `["web/**/*.ts", "*.config.ts", "vitest.workspace.ts"]`. `scripts/` is
not in it, so `npm run typecheck` has never compiled `scripts/measure-experiments.ts`, and
`npm run measure` runs it through `vite-node`, which transpiles without typechecking. This task is
the first one to edit that file, so it is the right moment to fix that — otherwise the verification
below is checking nothing.

Edit `tsconfig.json` so the include line reads:

```json
  "include": ["web/**/*.ts", "scripts/**/*.ts", "*.config.ts", "vitest.workspace.ts"]
```

This has been verified clean against the current tree: adding `scripts/**/*.ts` produces no errors
before your edit, so any error you now see is one you introduced.

Run: `npm run typecheck && npm run test`
Expected: `tsc --noEmit` prints nothing; vitest reports both projects green, including the three new files from Tasks 1-3. If `typecheck` complains that `rows` is not assignable to `Point[]`, you left a `const rows: Point[]` annotation behind — the new binding takes its type from `aggregateSweep`.

- [ ] **Step 4: Run the acceptance gate**

Run: `npm run measure && git diff --exit-code web/data/experiment-facts.json && echo BYTE_IDENTICAL`

Expected: the same tables and the same `NOTE` lines as Step 1, then `wrote web/data/experiment-facts.json`, then `git diff --exit-code` exits 0 printing nothing, then `BYTE_IDENTICAL`. Any diff at all is a failed extraction — do not regenerate the fixture, do not accept the new numbers, and look first at key order in `aggregateSweep` (a reordered `_sd`/`_n` shows as a whole-file diff) and second at whether `meanOf`/`sdOf` were retyped rather than lifted.

- [ ] **Step 5: Commit**

```bash
git add scripts/measure-experiments.ts
git commit -m "Point measure-experiments at web/engine/job, delete its duplicates

Five sweeps now run through runSweep/aggregateSweep; e2_density, e5_propagation,
confounding_squeeze and detection_floor stay hand-rolled because their rows are
not (values x seeds) means, but all four now call the extracted meanOf/sdOf.

web/data/experiment-facts.json is byte identical, which is the whole argument."
```

---

### Task 5: Pin the module against the published numbers

**Files:**
- Create: `web/engine/job/__tests__/sweep.golden.json`
- Test: `web/engine/job/__tests__/sweep.golden.test.ts`

**Interfaces:**
- Consumes: `runSweep` and `aggregateSweep` from `web/engine/job/sweep.ts` (Tasks 2 and 3); `makeRunConfig` from `web/engine/contracts/config.ts`; `deviation(pair)` and `robotCost(treated, control, dt)` from `web/engine/measure/metrics.ts`.
- Produces: nothing importable. It produces the only surviving proof that `web/engine/job/sweep.ts` reproduces the site's published numbers, because commit 3 of the pivot deletes both `scripts/measure-experiments.ts` and `web/data/experiment-facts.json` — and with them the byte gate from Task 4.

Two blocks are pinned. `e1_push_strength` is the plain case: two metrics, seven axis values, eight seeds, nothing censored. The `robotArrivalS` column of `e3_robot_speed`'s slowest cell is the censored case: at 0.4 m/s the robot never reaches its goal inside 800 ticks, so all eight runs come back NaN and the published row reads `null`, `null`, `0`. Measured on the machine this plan was written on: about 4.0 s and about 1.7 s respectively, hence the explicit timeouts — vitest's default is 5 s and the first test would otherwise fail for the wrong reason.

The fixture is read with `node:fs` rather than imported, because `tsconfig.json` does not set `resolveJsonModule`. The path is resolved from `import.meta.url`, not from cwd, for the reason `web/engine/measure/__tests__/parity.test.ts:36` already records: the Vite root is `web/`, so cwd differs between a direct run and a workspace run.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/sweep.golden.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import { deviation, robotCost } from "../../measure/metrics.js";
import { aggregateSweep, runSweep } from "../sweep.js";

/**
 * The historical pin.
 *
 * scripts/measure-experiments.ts and web/data/experiment-facts.json are both deleted by the last
 * commit of the console pivot, and they are the only things that currently prove this module
 * reproduces the numbers the site published. This test outlives them: the fixture beside it is a
 * verbatim copy of two blocks of that file, and the sweep is rebuilt here from the same seeds and
 * the same configs.
 *
 * If this goes red, the arithmetic moved. Regenerating the fixture to make it green is a formula
 * change with the evidence deleted.
 */
interface GoldenBlock {
  readonly axis: string;
  readonly baseSeed: number;
  readonly seedStride: number;
  readonly nTicks: number;
  readonly dt: number;
  readonly values: readonly number[];
  readonly seedIndices: readonly number[];
  readonly rows: readonly Readonly<Record<string, number | null>>[];
}

interface Golden {
  readonly e1_push_strength: GoldenBlock;
  readonly e3_robot_speed_slowest_cell: GoldenBlock;
}

const GOLDEN_PATH = join(dirname(fileURLToPath(import.meta.url)), "sweep.golden.json");
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as Golden;

describe("the sweep runner against the numbers this project published", () => {
  it(
    "reproduces the push-strength sweep exactly, key order included",
    () => {
      const block = golden.e1_push_strength;
      const points = runSweep({
        values: block.values,
        seedIndices: block.seedIndices,
        config: (value, seedIndex) =>
          makeRunConfig({
            seed: block.baseSeed + seedIndex * block.seedStride,
            nTicks: block.nTicks,
            robot: { repulsionScale: value },
          }),
        measure: (run) => {
          const d = deviation(run.pair);
          return { meanDeviationM: d.meanM, maxDeviationM: d.maxM };
        },
      });
      const rows = aggregateSweep(points, block.axis);
      expect(rows.length).toBe(7);
      // JSON.stringify rather than toEqual: this pins the key ORDER as well as every digit, and
      // key order is what made the extracted aggregate byte-compatible with the facts file.
      expect(JSON.stringify(rows)).toBe(JSON.stringify(block.rows));
    },
    120_000,
  );

  it(
    "reproduces the fully censored arrival cell as NaN over a count of zero",
    () => {
      const block = golden.e3_robot_speed_slowest_cell;
      const points = runSweep({
        values: block.values,
        seedIndices: block.seedIndices,
        config: (value, seedIndex) =>
          makeRunConfig({
            seed: block.baseSeed + seedIndex * block.seedStride,
            nTicks: block.nTicks,
            robot: { maxSpeed: value },
          }),
        measure: (run) => ({
          robotArrivalS: robotCost(run.treated, run.control, block.dt).treatedArrivalS,
        }),
      });
      const rows = aggregateSweep(points, block.axis);
      expect(JSON.stringify(rows)).toBe(JSON.stringify(block.rows));
      expect(Number.isNaN(rows[0]!["robotArrivalS"]!)).toBe(true);
      expect(rows[0]!["robotArrivalS_n"]).toBe(0);
    },
    60_000,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/job/__tests__/sweep.golden.test.ts`

Expected: FAIL at load — `Error: ENOENT: no such file or directory, open '.../web/engine/job/__tests__/sweep.golden.json'`

- [ ] **Step 3: Write minimal implementation**

Create `web/engine/job/__tests__/sweep.golden.json`. Every number below is copied out of `web/data/experiment-facts.json` as committed — do not compute them:

```json
{
  "note": "Copied verbatim from web/data/experiment-facts.json. It is the historical record of what scripts/measure-experiments.ts produced, and it outlives that script: the last commit of the console pivot deletes both the script and the facts file, and this is then the only thing proving web/engine/job/sweep.ts still reproduces the published numbers. Regenerating it to make a test pass is a formula change with the evidence deleted.",
  "e1_push_strength": {
    "note": "The push-strength sweep: deviation().meanM and deviation().maxM over seven robot repulsion scales, eight seeds each, nothing censored.",
    "axis": "repulsionScale",
    "baseSeed": 20260816,
    "seedStride": 7919,
    "nTicks": 800,
    "dt": 0.05,
    "values": [0, 0.5, 1, 1.5, 2, 2.5, 3],
    "seedIndices": [0, 1, 2, 3, 4, 5, 6, 7],
    "rows": [
      {
        "repulsionScale": 0,
        "meanDeviationM": 0,
        "meanDeviationM_sd": 0,
        "meanDeviationM_n": 8,
        "maxDeviationM": 0,
        "maxDeviationM_sd": 0,
        "maxDeviationM_n": 8
      },
      {
        "repulsionScale": 0.5,
        "meanDeviationM": 0.23990594743602364,
        "meanDeviationM_sd": 0.041314367966173826,
        "meanDeviationM_n": 8,
        "maxDeviationM": 0.6434104420391672,
        "maxDeviationM_sd": 0.11871503700875945,
        "maxDeviationM_n": 8
      },
      {
        "repulsionScale": 1,
        "meanDeviationM": 0.3172345255309179,
        "meanDeviationM_sd": 0.04248046626896459,
        "meanDeviationM_n": 8,
        "maxDeviationM": 0.8650492833462377,
        "maxDeviationM_sd": 0.10308347872947903,
        "maxDeviationM_n": 8
      },
      {
        "repulsionScale": 1.5,
        "meanDeviationM": 0.3608426530311617,
        "meanDeviationM_sd": 0.1021286503459044,
        "meanDeviationM_n": 8,
        "maxDeviationM": 0.9388391478868511,
        "maxDeviationM_sd": 0.13853137927750017,
        "maxDeviationM_n": 8
      },
      {
        "repulsionScale": 2,
        "meanDeviationM": 0.3942791941292267,
        "meanDeviationM_sd": 0.11200455778795808,
        "meanDeviationM_n": 8,
        "maxDeviationM": 1.0310780167331417,
        "maxDeviationM_sd": 0.1989295825541015,
        "maxDeviationM_n": 8
      },
      {
        "repulsionScale": 2.5,
        "meanDeviationM": 0.41541419933828344,
        "meanDeviationM_sd": 0.09761664586467256,
        "meanDeviationM_n": 8,
        "maxDeviationM": 1.1121019892920405,
        "maxDeviationM_sd": 0.1804851054099985,
        "maxDeviationM_n": 8
      },
      {
        "repulsionScale": 3,
        "meanDeviationM": 0.4448166258638179,
        "meanDeviationM_sd": 0.09288298681065359,
        "meanDeviationM_n": 8,
        "maxDeviationM": 1.226274427131976,
        "maxDeviationM_sd": 0.19630962092467574,
        "maxDeviationM_n": 8
      }
    ]
  },
  "e3_robot_speed_slowest_cell": {
    "note": "The robotArrivalS column of e3_robot_speed's first row. At 0.4 m/s the robot never reaches its goal inside 800 ticks, so all eight runs are censored and the published row carries null, null, 0. It is the only fully censored shape in the facts file, and it is what stops a future aggregate quietly reporting 0 there.",
    "axis": "maxSpeed",
    "baseSeed": 20260816,
    "seedStride": 7919,
    "nTicks": 800,
    "dt": 0.05,
    "values": [0.4],
    "seedIndices": [0, 1, 2, 3, 4, 5, 6, 7],
    "rows": [
      {
        "maxSpeed": 0.4,
        "robotArrivalS": null,
        "robotArrivalS_sd": null,
        "robotArrivalS_n": 0
      }
    ]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/job/__tests__/sweep.golden.test.ts`
Expected: `Test Files 1 passed`, `Tests 2 passed`, in roughly six seconds — about 4 s for the push-strength sweep (56 paired runs at 800 ticks) and about 1.7 s for the censored cell.

Then run the whole suite once, since this is the commit's last task: `npm run check`
Expected: typecheck silent, both vitest projects green with the four new files, the notes build and the vite build unchanged. The engine suite is about six seconds slower than at HEAD, all of it this test.

- [ ] **Step 5: Commit**

```bash
git add web/engine/job/__tests__/sweep.golden.json web/engine/job/__tests__/sweep.golden.test.ts
git commit -m "Pin web/engine/job/sweep.ts to the numbers the site published

The byte gate that proved this extraction lives in a script the pivot deletes, so
the push-strength sweep and the fully censored arrival cell are copied out of the
facts file and rebuilt here from the same seeds. Regenerating the fixture to make
this green is a formula change with the evidence deleted."
```

---

## Commit 2 — Build

The console is built at `web/console.html` beside the surviving notebook. Nothing in this commit touches `web/index.html` or `.gitignore`.

---

### Task 6: Missing `makeRunConfig` validations

**Files:**
- Create: `web/engine/contracts/config.test.ts`
- Modify: `web/engine/contracts/config.ts:201-202` (insert a block immediately before `const seenDisturbanceIds = new Set<string>();`)
- Test: `web/engine/contracts/config.test.ts`

**Interfaces:**
- Consumes: `makeRunConfig(overrides?: RunConfigOverrides): RunConfig` and `ContractError` / `fail(message: string): never` / `requireFinite(value: number, label: string): void`, all already present.
- Produces: nothing new in the type system. Every later task depends on `makeRunConfig` rejecting a room the robot's goal sits outside of, because `makeSweepJob` (Task 15) validates a whole grid by calling it.

- [ ] **Step 1: Write the failing test**

Create `web/engine/contracts/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ContractError } from "../core/errors.js";
import { makeRunConfig } from "./config.js";

/**
 * The five checks this file pins were all missing, and the one that mattered was the room.
 *
 * With `widthM` narrowed below 20 the default goal at x = 20 sits outside the wall. The robot is
 * clamped to the room, so it pins against the wall a metre short of a goal it can never reach,
 * never records an arrival, and the old path-freeze arrival heuristic then reported a completed
 * journey anyway. A config that cannot be simulated honestly must not be constructible.
 */
describe("makeRunConfig room and rate validation", () => {
  it("still builds the default config", () => {
    const config = makeRunConfig();
    expect(config.widthM).toBe(22);
    expect(config.heightM).toBe(13);
    expect(config.robot.goalXY[0]).toBe(20);
  });

  it("rejects a room with no width", () => {
    expect(() => makeRunConfig({ widthM: 0 })).toThrow(ContractError);
    expect(() => makeRunConfig({ widthM: 0 })).toThrow(/RunConfig\.widthM must be > 0, got 0/);
  });

  it("rejects a room with no height", () => {
    expect(() => makeRunConfig({ heightM: -1 })).toThrow(/RunConfig\.heightM must be > 0, got -1/);
  });

  it("rejects a crowd that wants to stand still", () => {
    expect(() => makeRunConfig({ crowd: { desiredSpeed: 0 } })).toThrow(
      /RunConfig\.crowd\.desiredSpeed must be > 0, got 0/,
    );
  });

  it("rejects a zero relaxation time and says why it is a time constant", () => {
    expect(() => makeRunConfig({ crowd: { relaxationTimeS: 0 } })).toThrow(
      /RunConfig\.crowd\.relaxationTimeS must be > 0, got 0; it is a time constant/,
    );
  });

  it("rejects a goal outside a narrowed room, naming the room", () => {
    expect(() => makeRunConfig({ widthM: 18 })).toThrow(
      /RunConfig\.robot\.goalXY must be inside the room, which is 18 m by 13 m, got \(20, 6\.5\)/,
    );
  });

  it("rejects a start on the wall", () => {
    expect(() => makeRunConfig({ robot: { startXY: [0, 6.5] } })).toThrow(
      /RunConfig\.robot\.startXY must be inside the room/,
    );
  });

  it("accepts a smaller room whose start and goal were moved with it", () => {
    const config = makeRunConfig({
      widthM: 12,
      heightM: 8,
      robot: { startXY: [1, 4], goalXY: [11, 4] },
    });
    expect(config.widthM).toBe(12);
    expect(config.robot.goalXY[0]).toBe(11);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/contracts/config.test.ts`
Expected: FAIL. `rejects a room with no width` fails with `expected [Function] to throw an error` (nothing throws today); `rejects a goal outside a narrowed room` likewise. Only the two positive cases pass.

- [ ] **Step 3: Write minimal implementation**

In `web/engine/contracts/config.ts`, insert this block immediately before the line `const seenDisturbanceIds = new Set<string>();`:

```ts
  requireFinite(merged.widthM, "RunConfig.widthM");
  if (merged.widthM <= 0) {
    fail(`RunConfig.widthM must be > 0, got ${merged.widthM}`);
  }
  requireFinite(merged.heightM, "RunConfig.heightM");
  if (merged.heightM <= 0) {
    fail(`RunConfig.heightM must be > 0, got ${merged.heightM}`);
  }
  requireFinite(merged.crowd.desiredSpeed, "RunConfig.crowd.desiredSpeed");
  if (merged.crowd.desiredSpeed <= 0) {
    fail(`RunConfig.crowd.desiredSpeed must be > 0, got ${merged.crowd.desiredSpeed}`);
  }
  requireFinite(merged.crowd.relaxationTimeS, "RunConfig.crowd.relaxationTimeS");
  if (merged.crowd.relaxationTimeS <= 0) {
    fail(
      `RunConfig.crowd.relaxationTimeS must be > 0, got ${merged.crowd.relaxationTimeS}; it is a ` +
        `time constant, and zero would mean a person reaches their desired velocity instantly`,
    );
  }

  // The robot is clamped to the room every tick, so a goal outside it is a goal the robot pins
  // against a wall a metre short of and never reaches. That is not a run with an unusual answer,
  // it is a run with no answer, so it is refused at construction rather than measured.
  const roomPoints: readonly (readonly [string, readonly [number, number]])[] = [
    ["RunConfig.robot.startXY", merged.robot.startXY],
    ["RunConfig.robot.goalXY", merged.robot.goalXY],
  ];
  for (const entry of roomPoints) {
    const label = entry[0];
    const point = entry[1];
    const x = point[0];
    const y = point[1];
    requireFinite(x, `${label}[0]`);
    requireFinite(y, `${label}[1]`);
    const insideRoom = x > 0 && x < merged.widthM && y > 0 && y < merged.heightM;
    if (!insideRoom) {
      fail(
        `${label} must be inside the room, which is ${merged.widthM} m by ${merged.heightM} m, ` +
          `got (${x}, ${y})`,
      );
    }
  }

```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/contracts/config.test.ts`
Then run the whole engine suite to prove nothing else built an illegal config: `npx vitest run --project engine`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add web/engine/contracts/config.ts web/engine/contracts/config.test.ts
git commit -m "Refuse a room the robot's goal sits outside, and four rates that cannot be zero"
```

---

### Task 7: Surface `RobotState.arrivedTick` through `ArmResult`

**Files:**
- Create: `web/engine/sim/arrival.test.ts`
- Modify: `web/engine/sim/run.ts:11-16` (the `ArmResult` interface) and `web/engine/sim/run.ts:96` (the `runArm` return)
- Test: `web/engine/sim/arrival.test.ts`

**Interfaces:**
- Consumes: `runArm(config, spawnTape, noiseTape, arm, withRobot, disturbances): ArmResult`, `runPair(config: RunConfig, nowMs?: () => number): RunResult`, `RobotState.arrivedTick` (maintained in `web/engine/sim/world.ts:71-77`, `-1` until the robot is first within `SIM_CONSTANTS.goalReachedM` of its goal).
- Produces: `ArmResult.arrivedTick: number` — the tick on which the robot first came inside the goal radius, or `-1` if it has no robot or never arrived. The recorded sample for that moment is `arrivedTick + 1`, because `stepWorld` sets the field after moving the robot on tick `t` and `runArm` records that position as sample `t + 1`. Task 10's `arrivalSecondsOf` and Task 11's `robotArrivalS` column both read this and nothing else.

- [ ] **Step 1: Write the failing test**

Create `web/engine/sim/arrival.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeRunConfig, SIM_CONSTANTS } from "../contracts/config.js";
import { pathLength } from "../measure/kernels.js";
import { runPair } from "./run.js";

/**
 * The old arrival number was a path-freeze heuristic: the first sample after which the robot's
 * position stops changing. It answers "when did the robot stop", which is only the same question
 * as "when did it arrive" when the robot stops at its goal.
 *
 * Under `deflectionWeight: 3` it does not. The robot dithers, holds still for a sample while it
 * re-plans, and the heuristic calls that arrival at 8.0 s — for a journey of 18.06 m, which is
 * 2.26 m/s from a robot whose speed cap is 1.1 m/s. The simulator has always known better:
 * `RobotState.arrivedTick` is set from the distance to the goal and was thrown away at the
 * `ArmResult` boundary.
 */
function frozenStep(path: Float64Array): number {
  const nSteps = path.length / 2;
  for (let s = 1; s < nSteps; s++) {
    const dx = (path[2 * s] as number) - (path[2 * s - 2] as number);
    const dy = (path[2 * s + 1] as number) - (path[2 * s - 1] as number);
    if (Math.sqrt(dx * dx + dy * dy) < 1e-4) {
      return s;
    }
  }
  return -1;
}

describe("ArmResult.arrivedTick", () => {
  it("reports the tick the default robot first came inside the goal radius", () => {
    const result = runPair(makeRunConfig());
    expect(result.treated.arrivedTick).toBe(327);
    const arrivalSample = result.treated.arrivedTick + 1;
    const path = result.treated.robotPositions as Float64Array;
    const dx = result.config.robot.goalXY[0] - (path[2 * arrivalSample] as number);
    const dy = result.config.robot.goalXY[1] - (path[2 * arrivalSample + 1] as number);
    expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThan(SIM_CONSTANTS.goalReachedM);
  });

  it("is -1 in an arm with no robot at all", () => {
    const result = runPair(makeRunConfig());
    expect(result.control.robotPositions).toBeNull();
    expect(result.control.arrivedTick).toBe(-1);
  });

  it("censors a polite robot that never arrives, where the old heuristic invented a speed", () => {
    const config = makeRunConfig({ robot: { deflectionWeight: 3 } });
    const result = runPair(config);
    const path = result.treated.robotPositions as Float64Array;

    expect(result.treated.arrivedTick).toBe(-1);

    // The heuristic this replaces does answer, and its answer is impossible.
    const frozen = frozenStep(path);
    expect(frozen).toBe(160);
    const impliedSpeed = pathLength(path) / (frozen * config.dt);
    expect(impliedSpeed).toBeGreaterThan(config.robot.maxSpeed * 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/sim/arrival.test.ts`
Expected: FAIL at typecheck/runtime with `Property 'arrivedTick' does not exist on type 'ArmResult'` — under vitest it surfaces as `expected undefined to be 327`.

- [ ] **Step 3: Write minimal implementation**

In `web/engine/sim/run.ts`, replace the `ArmResult` interface:

```ts
export interface ArmResult {
  readonly scene: Scene;
  /** Flat (nTicks+1, 2) per agent, in uid order. Same buffers the Scene's trajectories wrap. */
  readonly positions: readonly Float64Array[];
  readonly robotPositions: Float64Array | null;
  /**
   * The tick the robot first came within `SIM_CONSTANTS.goalReachedM` of its goal, or -1 for an
   * arm with no robot or a robot that never got there. The recorded sample for that moment is
   * `arrivedTick + 1`: `stepWorld` sets the field after moving the robot on tick `t`, and that
   * position is recorded as sample `t + 1`.
   *
   * Kept rather than re-derived. The path-freeze heuristic it replaces answers "when did the
   * robot stop", which under a heavy deflection weight is a sample in the middle of a re-plan.
   */
  readonly arrivedTick: number;
}
```

and replace the final return of `runArm` (currently `return { scene, positions, robotPositions };`) with:

```ts
  let arrivedTick = -1;
  if (state.robot !== null) {
    arrivedTick = state.robot.arrivedTick;
  }

  return { scene, positions, robotPositions, arrivedTick };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/sim/arrival.test.ts`
Then `npx vitest run --project engine` and `npx tsc --noEmit`.
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add web/engine/sim/run.ts web/engine/sim/arrival.test.ts
git commit -m "Keep the arrival tick the simulator already knew instead of guessing it from a frozen path"
```

---

### Task 8: `replicateBand` returns the pairwise peak alongside the pairwise mean

**Files:**
- Create: `web/engine/measure/null/band.test.ts`
- Modify: `web/engine/measure/null/band.ts:22-93` (the `RunToRunBand` record, the pair loop, and `meanPathDistance`)
- Test: `web/engine/measure/null/band.test.ts`

**Interfaces:**
- Consumes: `replicateBand(config: RunConfig, nReplicates?: number): RunToRunBand`, `quantileLinear(sorted: Float64Array, q: number): number`.
- Produces: `RunToRunBand` gains `peakValue: number` and `peakSamples: Float64Array`. `value` and `samples` keep their exact current arithmetic and their exact current values — Task 16's determinism test and the commit-1 byte-identical gate both depend on that. Task 11's `worstMomentNullM` column reads `peakValue`; Task 11's `runToRunBandM` reads `value`.

- [ ] **Step 1: Write the failing test**

Create `web/engine/measure/null/band.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import { runPair } from "../../sim/run.js";
import { deviation } from "../metrics.js";
import { replicateBand } from "./band.js";

/**
 * A max-over-steps readout needs a max-over-steps null.
 *
 * `value` is the 95th percentile of the pairwise MEAN gap between two robot-free runs, and it is
 * the right floor for the typical-effect readout. The worst-moment readout is a maximum over
 * steps, and a maximum is >= a mean for any series by construction, so judging it against `value`
 * would flag every run as remarkable. `peakValue` is the same 28 replicate pairs measured with
 * the same statistic the readout uses.
 */
describe("replicateBand", () => {
  const band = replicateBand(makeRunConfig(), 8);

  it("leaves the mean statistic bit-for-bit where it was", () => {
    expect(band.value).toBe(0.31058715139377074);
    expect(band.nPairs).toBe(28);
    expect(band.samples.length).toBe(28);
  });

  it("reports the peak statistic over the same replicate pairs", () => {
    expect(band.peakValue).toBe(0.7649744339753771);
    expect(band.peakSamples.length).toBe(28);
  });

  it("never puts a pair's peak below its own mean", () => {
    for (let i = 0; i < band.nPairs; i++) {
      const meanOfPair = band.samples[i] as number;
      const peakOfPair = band.peakSamples[i] as number;
      expect(peakOfPair).toBeGreaterThanOrEqual(meanOfPair);
    }
  });

  it("puts the default run's worst moment below its own peak null, which the mean band hides", () => {
    // This is the finding that forced the second statistic. Judged against `value` the worst
    // moment looks like 2.5x the floor; judged against the floor for its own statistic it is
    // below it. Both numbers are correct and only one of them is the right comparison.
    const worstMoment = deviation(runPair(makeRunConfig()).pair).maxM;
    expect(worstMoment).toBeGreaterThan(band.value);
    expect(worstMoment).toBeLessThan(band.peakValue);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/measure/null/band.test.ts`
Expected: FAIL with `expected undefined to be 0.7649744339753771` on the peak test (`peakValue` does not exist yet). The first test passes, which is the point — it pins the value you must not move.

- [ ] **Step 3: Write minimal implementation**

In `web/engine/measure/null/band.ts`, replace the `RunToRunBand` interface, the pair loop inside `replicateBand`, and `meanPathDistance` with:

```ts
export interface RunToRunBand {
  readonly kind: "runToRunBand";
  readonly nReplicates: number;
  readonly nPairs: number;
  readonly quantile: number;
  /** 95th percentile of the pairwise MEAN gap. The floor for a mean-over-steps readout. */
  readonly value: number;
  readonly samples: Float64Array;
  /**
   * 95th percentile of the pairwise PEAK gap: for each replicate pair, the largest the crowd's
   * average displacement ever got at any single step.
   *
   * A maximum is >= a mean for any series, so a max-over-steps readout judged against `value`
   * clears the floor for free. Both statistics come from the same 28 pairs and the same
   * simulations; only the reduction differs.
   */
  readonly peakValue: number;
  readonly peakSamples: Float64Array;
}

interface PairStatistics {
  readonly meanM: number;
  readonly peakM: number;
}
```

Replace the block that currently starts `const values: number[] = [];` and ends with the `return { ... };` with:

```ts
  const meanValues: number[] = [];
  const peakValues: number[] = [];
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const statistics = pairStatistics(
        runs[i] as readonly Float64Array[],
        runs[j] as readonly Float64Array[],
      );
      meanValues.push(statistics.meanM);
      peakValues.push(statistics.peakM);
    }
  }

  const samples = Float64Array.from(meanValues);
  const sorted = Float64Array.from(meanValues).sort();
  const peakSamples = Float64Array.from(peakValues);
  const peakSorted = Float64Array.from(peakValues).sort();
  return {
    kind: "runToRunBand",
    nReplicates,
    nPairs: meanValues.length,
    quantile: 0.95,
    value: quantileLinear(sorted, 0.95),
    samples,
    peakValue: quantileLinear(peakSorted, 0.95),
    peakSamples,
  };
}

/**
 * Both statistics in one pass over the pair.
 *
 * `agentTotal` accumulates in exactly the order the mean-only version did — the per-step series
 * is fed from the same `gap` local and adds nothing to that running sum — so `meanM` is the same
 * double it has always been. `Math.hypot` stays banned in this directory: V8's is more accurate
 * than numpy's `sqrt(sum(d*d))` and disagrees with the oracle in the last bits.
 */
function pairStatistics(a: readonly Float64Array[], b: readonly Float64Array[]): PairStatistics {
  const n = Math.min(a.length, b.length);
  if (n === 0) {
    return { meanM: 0, peakM: 0 };
  }
  const steps = (a[0] as Float64Array).length / 2;
  const series = new Float64Array(steps);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const pathA = a[i] as Float64Array;
    const pathB = b[i] as Float64Array;
    let agentTotal = 0;
    for (let s = 0; s < steps; s++) {
      const dx = (pathA[2 * s] as number) - (pathB[2 * s] as number);
      const dy = (pathA[2 * s + 1] as number) - (pathB[2 * s + 1] as number);
      const gap = Math.sqrt(dx * dx + dy * dy);
      agentTotal += gap;
      series[s] = (series[s] as number) + gap;
    }
    total += agentTotal / steps;
  }
  let peak = 0;
  for (let s = 0; s < steps; s++) {
    const stepMean = (series[s] as number) / n;
    if (stepMean > peak) {
      peak = stepMean;
    }
  }
  return { meanM: total / n, peakM: peak };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/measure/null/band.test.ts`
Then `npx vitest run --project engine` — `web/engine/measure/__tests__/hypot.test.ts` greps this directory's source and must stay green.
Expected: all green, `value` still `0.31058715139377074`.

- [ ] **Step 5: Commit**

```bash
git add web/engine/measure/null/band.ts web/engine/measure/null/band.test.ts
git commit -m "Give the worst-moment readout a worst-moment null, from the pairs the band already had"
```

---

### Task 9: `perAgentDeviationByUid` and `pedestrianTimeLost`

**Files:**
- Create: `web/engine/job/report.ts`
- Create: `web/engine/job/__tests__/uidOrder.test.ts`
- Test: `web/engine/job/__tests__/uidOrder.test.ts`

**Interfaces:**
- Consumes: `pairedAgents(pair: PairedRun): readonly (readonly [Trajectory, Trajectory])[]` (ordered by **string-sorted** `agentId`), `Trajectory.agentUid: number`, `deviation(pair: PairedRun): Deviation` where `Deviation.perAgentM: Float64Array`, `RunResult.treated.positions` / `RunResult.control.positions` (both **uid**-ordered), `fail(message: string): never`.
- Produces:
  - `perAgentDeviationByUid(pair: PairedRun, dev: Deviation): ReadonlyMap<number, number>`
  - `pedestrianTimeLost(r: RunResult, dt: number): { readonly meanS: number; readonly nUsed: number; readonly nAgents: number }`

  Task 11's columns call both. Nothing anywhere may join `perAgentM` to `positions` by index again.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/uidOrder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import { pairedAgents } from "../../contracts/pairedRun.js";
import { deviation } from "../../measure/metrics.js";
import { runPair } from "../../sim/run.js";
import { perAgentDeviationByUid, pedestrianTimeLost } from "../report.js";

/**
 * Fourteen pedestrians, not eight, and both directions pinned.
 *
 * `deviation().perAgentM` is ordered by string-sorted agent id: ped0, ped1, ped10, ped11, ped12,
 * ped13, ped2, ... `ArmResult.positions` is ordered by uid: 0, 1, 2, ... The two agree up to ten
 * pedestrians and diverge from eleven, so a crowd of eight cannot tell a correct join from a
 * scrambled one, and a test that only asserted the correct value would stay green after someone
 * reverted the fix.
 *
 * So this asserts the right answer AND the wrong one: `byUid.get(2)` is ped2's displacement, and
 * `perAgentM[2]` is ped10's. If those two ever become the same number this crowd is too small
 * and the test has stopped testing anything.
 */
describe("per-agent values are keyed by uid", () => {
  const config = makeRunConfig({ crowd: { nPedestrians: 14 } });
  const result = runPair(config);
  const dev = deviation(result.pair);
  const agents = pairedAgents(result.pair);

  it("orders pairedAgents by string-sorted id, which is not uid order", () => {
    const ids: string[] = [];
    for (const entry of agents) {
      ids.push(entry[0].agentId);
    }
    expect(ids.slice(0, 7)).toEqual(["ped0", "ped1", "ped10", "ped11", "ped12", "ped13", "ped2"]);
  });

  it("maps uid 2 to ped2's displacement", () => {
    const byUid = perAgentDeviationByUid(result.pair, dev);
    expect(byUid.get(2)).toBe(0.010656577085919248);
  });

  it("still has ped10's displacement sitting at index 2 of the raw array", () => {
    expect(dev.perAgentM[2]).toBe(0.12794199862109434);
    expect(agents[2]?.[0].agentId).toBe("ped10");
  });

  it("covers every uid exactly once", () => {
    const byUid = perAgentDeviationByUid(result.pair, dev);
    expect(byUid.size).toBe(14);
    for (let uid = 0; uid < 14; uid++) {
      expect(byUid.has(uid)).toBe(true);
    }
  });

  it("refuses a deviation whose length does not match the pair", () => {
    const shortened = { ...dev, perAgentM: new Float64Array(3) };
    expect(() => perAgentDeviationByUid(result.pair, shortened)).toThrow(
      /perAgentDeviationByUid was given 3 per-agent values for 14 paired agents/,
    );
  });
});

describe("pedestrianTimeLost", () => {
  it("differences each person against themselves and reports how many settled", () => {
    const config = makeRunConfig();
    const lost = pedestrianTimeLost(runPair(config), config.dt);
    expect(lost.nAgents).toBe(18);
    expect(lost.nUsed).toBe(18);
    expect(lost.meanS).toBe(-0.08333333333333333);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/job/__tests__/uidOrder.test.ts`
Expected: FAIL with `Failed to resolve import "../report.js"` — the file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `web/engine/job/report.ts`:

```ts
import type { PairedRun } from "../contracts/pairedRun.js";
import { pairedAgents } from "../contracts/pairedRun.js";
import { fail } from "../core/errors.js";
import type { Deviation } from "../measure/metrics.js";
import type { RunResult } from "../sim/run.js";

/**
 * The measurement report layer.
 *
 * Nothing here computes a divergence or a quantile: those live in `web/engine/measure/`, which
 * has a Python oracle. This file joins, gates and packages, and it has no oracle and must not
 * acquire one.
 */

/**
 * Per-agent displacement keyed by the uid the position buffers are keyed by.
 *
 * `deviation().perAgentM[i]` belongs to `pairedAgents(pair)[i]`, which is ordered by string-sorted
 * agent id — ped0, ped1, ped10, ped2. `ArmResult.positions[i]` is ordered by uid. Joining those
 * two arrays positionally silently rebinds every person from the eleventh onwards to a stranger,
 * and it shipped once. This is the only supported way to ask what one person's displacement was.
 */
export function perAgentDeviationByUid(pair: PairedRun, dev: Deviation): ReadonlyMap<number, number> {
  const agents = pairedAgents(pair);
  if (dev.perAgentM.length !== agents.length) {
    fail(
      `perAgentDeviationByUid was given ${dev.perAgentM.length} per-agent values for ` +
        `${agents.length} paired agents; they must come from the same pair`,
    );
  }
  const byUid = new Map<number, number>();
  for (let i = 0; i < agents.length; i++) {
    const entry = agents[i] as readonly [{ agentUid: number }, { agentUid: number }];
    const uid = entry[0].agentUid;
    const value = dev.perAgentM[i] as number;
    byUid.set(uid, value);
  }
  return byUid;
}

export interface PedestrianTimeLost {
  readonly meanS: number;
  readonly nUsed: number;
  readonly nAgents: number;
}

/**
 * How much longer each person took to settle with the robot in the room than without it.
 *
 * This is the ONE legitimate positional join in the codebase: `treated.positions[i]` and
 * `control.positions[i]` are both uid-ordered by `runArm`, so index i is the same person in both.
 * It is legitimate because neither side came from `pairedAgents`. Nothing else may join by index.
 *
 * A person who never settles in either arm is dropped and counted, never averaged as a zero.
 */
export function pedestrianTimeLost(r: RunResult, dt: number): PedestrianTimeLost {
  const nAgents = r.treated.positions.length;
  let nUsed = 0;
  let total = 0;
  for (let i = 0; i < nAgents; i++) {
    const treatedPath = r.treated.positions[i] as Float64Array;
    const controlPath = r.control.positions[i] as Float64Array;
    const treatedSettled = settledStep(treatedPath);
    const controlSettled = settledStep(controlPath);
    if (treatedSettled >= 0 && controlSettled >= 0) {
      nUsed++;
      total += (treatedSettled - controlSettled) * dt;
    }
  }
  let meanS = Number.NaN;
  if (nUsed > 0) {
    meanS = total / nUsed;
  }
  return { meanS, nUsed, nAgents };
}

/** First step after which a pedestrian never moves again. -1 if they never settle. */
function settledStep(path: Float64Array): number {
  const nSteps = path.length / 2;
  for (let s = 1; s < nSteps; s++) {
    const dx = (path[2 * s] as number) - (path[2 * s - 2] as number);
    const dy = (path[2 * s + 1] as number) - (path[2 * s - 1] as number);
    if (Math.sqrt(dx * dx + dy * dy) < 1e-9) {
      return s;
    }
  }
  return -1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/job/__tests__/uidOrder.test.ts`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add web/engine/job/report.ts web/engine/job/__tests__/uidOrder.test.ts
git commit -m "Key per-person displacement by uid, and pin the scramble a crowd of eight cannot see"
```

---

### Task 10: Clearance measured after both bodies have started moving, and `ReportContext`

**Files:**
- Modify: `web/engine/job/report.ts` (append; created in Task 9)
- Create: `web/engine/job/__tests__/clearance.test.ts`
- Test: `web/engine/job/__tests__/clearance.test.ts`

**Interfaces:**
- Consumes: `clearance(robotPath, pedestrianPaths, robotRadiusM, pedRadiusM, thresholdM): Clearance` from `web/engine/measure/metrics.js` (for the contrast the test asserts), `SIM_CONSTANTS`, `deviation`, `ArmResult.arrivedTick` (Task 7), `RunToRunBand` (Task 8), `SplitHalfNull`, `RunConfig`, `RunResult`.
- Produces:
  - `startedMovingStep(path: Float64Array, thresholdM: number): number`
  - `GatedClearance` and `clearanceAfterBothMove(robotPath: Float64Array | null, pedestrianPaths: readonly Float64Array[], robotRadiusM: number, pedRadiusM: number, thresholdM: number): GatedClearance`
  - `arrivalSecondsOf(arm: ArmResult, dt: number): number`
  - `ReportContext` and `buildContext(init: BuildContextInit): ReportContext`

  `MeasurementParams` is imported as a **type only** from `./spec.js` (Task 15). Write Task 15's `spec.ts` before running this task's test, or run the tasks in the order given and accept one unresolved import for the duration of Step 2 — the order below assumes you build `spec.ts` later, so add the type import in Task 15 and use a local structural type here.

  To keep this task self-contained, `report.ts` declares the parameter record itself and Task 15 re-exports it. Exact declaration is in Step 3.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/clearance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeRunConfig, SIM_CONSTANTS } from "../../contracts/config.js";
import { clearance } from "../../measure/metrics.js";
import { runPair } from "../../sim/run.js";
import { arrivalSecondsOf, clearanceAfterBothMove, startedMovingStep } from "../report.js";

/**
 * Pedestrians spawn from a strip 0.8 to 2.4 m in from whichever wall they start at, and the robot
 * starts at x = 2. So somebody is standing on the robot at step 0 about as often as not: at the
 * default settings the nearest person is 0.0099 m away before anybody has taken a step, and the
 * ungated minimum clearance is -0.5501 m at step 0 under nine of the eleven world sliders.
 *
 * That is a spawn artifact, not a near miss. Moving the spawn would move every published number
 * and invalidate the Python parity fixtures, so the spawn stays and the RULER changes: the gap
 * between the robot and one person is measured only from the moment both of them have left where
 * they were standing, and the tile says so.
 */
describe("clearanceAfterBothMove", () => {
  const config = makeRunConfig();
  const result = runPair(config);
  const robotPath = result.treated.robotPositions as Float64Array;

  it("finds the step each body left its starting position", () => {
    expect(startedMovingStep(robotPath, SIM_CONSTANTS.robotRadiusM)).toBe(8);
    expect(startedMovingStep(new Float64Array([0, 0, 0, 0]), 0.1)).toBe(-1);
  });

  it("reports a real brush instead of the spawn overlap", () => {
    const gated = clearanceAfterBothMove(
      robotPath,
      result.treated.positions,
      SIM_CONSTANTS.robotRadiusM,
      SIM_CONSTANTS.pedRadiusM,
      0.5,
    );
    expect(gated.minM).toBe(-0.04979741026062734);
    expect(gated.minAtStep).toBe(182);
    expect(gated.nearMissEpisodes).toBe(2);
    expect(gated.firstMeasuredStep).toBe(8);
    expect(gated.nStepsMeasured).toBe(793);
  });

  it("is measuring something different from the ungated ruler, and better", () => {
    const ungated = clearance(
      robotPath,
      result.treated.positions,
      SIM_CONSTANTS.robotRadiusM,
      SIM_CONSTANTS.pedRadiusM,
      0.5,
    );
    expect(ungated.minM).toBe(-0.5500943960256908);
    expect(ungated.minAtStep).toBe(0);
  });

  it("reports nothing measured when there is no robot", () => {
    const gated = clearanceAfterBothMove(
      null,
      result.control.positions,
      SIM_CONSTANTS.robotRadiusM,
      SIM_CONSTANTS.pedRadiusM,
      0.5,
    );
    expect(Number.isNaN(gated.minM)).toBe(true);
    expect(gated.minAtStep).toBe(-1);
    expect(gated.nStepsMeasured).toBe(0);
    expect(gated.nearMissEpisodes).toBe(0);
  });
});

describe("arrivalSecondsOf", () => {
  it("converts the arrival tick to the second of the sample that recorded it", () => {
    const config = makeRunConfig();
    const result = runPair(config);
    expect(arrivalSecondsOf(result.treated, config.dt)).toBe(328 * 0.05);
  });

  it("is NaN when the robot never arrived", () => {
    const config = makeRunConfig({ robot: { deflectionWeight: 3 } });
    const result = runPair(config);
    expect(Number.isNaN(arrivalSecondsOf(result.treated, config.dt))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/job/__tests__/clearance.test.ts`
Expected: FAIL with `No "clearanceAfterBothMove" export is defined on the "../report.js" mock` / `SyntaxError: The requested module '../report.js' does not provide an export named 'clearanceAfterBothMove'`.

- [ ] **Step 3: Write minimal implementation**

Append to `web/engine/job/report.ts` (and add `import type { RunConfig } from "../contracts/config.js";`, `import type { ArmResult } from "../sim/run.js";`, `import { deviation } from "../measure/metrics.js";`, `import type { RunToRunBand } from "../measure/null/band.js";`, `import type { SplitHalfNull } from "../measure/null/splitHalf.js";` to the existing import block, and change the `Deviation` import to `import { deviation, type Deviation } from "../measure/metrics.js";`):

```ts
/** How the ruler was set. Task 15's `spec.ts` re-exports this and validates it. */
export interface MeasurementParams {
  readonly kind: "measurementParams";
  /** Default 60 steps, which is 3.00 s. Not 16: at 16 the forecaster reads below the band. */
  readonly forecastHorizonSteps: number;
  /** Required, never defaulted. With no end step the forecaster reads exactly 0 on this crowd. */
  readonly forecastEndStep: number;
  readonly nearMissThresholdM: number;
  readonly recoveryToleranceFraction: number;
  readonly recoveryDwellSteps: number;
}

/** First step at which a path is further than `thresholdM` from where it began. -1 if never. */
export function startedMovingStep(path: Float64Array, thresholdM: number): number {
  const nSteps = path.length / 2;
  const x0 = path[0] as number;
  const y0 = path[1] as number;
  for (let s = 0; s < nSteps; s++) {
    const dx = (path[2 * s] as number) - x0;
    const dy = (path[2 * s + 1] as number) - y0;
    if (Math.sqrt(dx * dx + dy * dy) > thresholdM) {
      return s;
    }
  }
  return -1;
}

export interface GatedClearance {
  readonly kind: "gatedClearance";
  readonly minM: number;
  readonly minAtStep: number;
  readonly nearMissEpisodes: number;
  readonly thresholdM: number;
  /** Earliest step any robot-person pair qualified. -1 if none ever did. */
  readonly firstMeasuredStep: number;
  readonly nStepsMeasured: number;
}

/**
 * Surface-to-surface gap between the robot and the nearest person, measured only from the moment
 * both of them have left where they were standing.
 *
 * "Has left" means further than its own body radius from its step-0 position. Before that a
 * pedestrian who spawned on the robot's start tile reports a gap of -0.55 m at step 0, which is
 * an artifact of where the crowd is placed and not something the robot did.
 *
 * Episodes rather than ticks, matching `clearance()`: counting ticks below a threshold makes the
 * safety number scale with 1/dt. A step where no pair yet qualifies breaks an episode.
 */
export function clearanceAfterBothMove(
  robotPath: Float64Array | null,
  pedestrianPaths: readonly Float64Array[],
  robotRadiusM: number,
  pedRadiusM: number,
  thresholdM: number,
): GatedClearance {
  const empty: GatedClearance = {
    kind: "gatedClearance",
    minM: Number.NaN,
    minAtStep: -1,
    nearMissEpisodes: 0,
    thresholdM,
    firstMeasuredStep: -1,
    nStepsMeasured: 0,
  };
  if (robotPath === null) {
    return empty;
  }
  const robotStart = startedMovingStep(robotPath, robotRadiusM);
  if (robotStart < 0) {
    return empty;
  }

  const gateOf: number[] = [];
  for (const path of pedestrianPaths) {
    const pedStart = startedMovingStep(path, pedRadiusM);
    if (pedStart < 0) {
      gateOf.push(-1);
    } else if (pedStart > robotStart) {
      gateOf.push(pedStart);
    } else {
      gateOf.push(robotStart);
    }
  }

  const nSteps = robotPath.length / 2;
  const contactRadius = robotRadiusM + pedRadiusM;
  let minM = Number.POSITIVE_INFINITY;
  let minAtStep = -1;
  let firstMeasuredStep = -1;
  let nStepsMeasured = 0;
  let episodes = 0;
  let inside = false;

  for (let s = 0; s < nSteps; s++) {
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pedestrianPaths.length; i++) {
      const gate = gateOf[i] as number;
      if (gate < 0 || s < gate) {
        continue;
      }
      const path = pedestrianPaths[i] as Float64Array;
      const dx = (path[2 * s] as number) - (robotPath[2 * s] as number);
      const dy = (path[2 * s + 1] as number) - (robotPath[2 * s + 1] as number);
      const gap = Math.sqrt(dx * dx + dy * dy) - contactRadius;
      if (gap < closest) {
        closest = gap;
      }
    }
    if (closest === Number.POSITIVE_INFINITY) {
      inside = false;
      continue;
    }
    nStepsMeasured++;
    if (firstMeasuredStep < 0) {
      firstMeasuredStep = s;
    }
    if (closest < minM) {
      minM = closest;
      minAtStep = s;
    }
    if (closest < thresholdM) {
      if (!inside) {
        episodes++;
        inside = true;
      }
    } else {
      inside = false;
    }
  }

  if (nStepsMeasured === 0) {
    return empty;
  }
  return {
    kind: "gatedClearance",
    minM,
    minAtStep,
    nearMissEpisodes: episodes,
    thresholdM,
    firstMeasuredStep,
    nStepsMeasured,
  };
}

/**
 * When the robot got there, in seconds, or NaN if it never did.
 *
 * `arrivedTick` is set after the robot moves on that tick, and that position is recorded as
 * sample `arrivedTick + 1`, so the arrival second is `(arrivedTick + 1) * dt`. Non-arrival is NaN
 * here and is rendered as censored by the column, never as a number and never as zero.
 */
export function arrivalSecondsOf(arm: ArmResult, dt: number): number {
  if (arm.arrivedTick < 0) {
    return Number.NaN;
  }
  return (arm.arrivedTick + 1) * dt;
}

/** Everything a column extractor is allowed to look at. Built once per run, never per column. */
export interface ReportContext {
  readonly kind: "reportContext";
  readonly config: RunConfig;
  readonly params: MeasurementParams;
  readonly run: RunResult;
  readonly deviation: Deviation;
  readonly band: RunToRunBand | null;
  readonly floor: SplitHalfNull | null;
  readonly zeroRun: RunResult | null;
  readonly frechetMeanM: number | null;
  /**
   * The shortest crossing that counts as arriving: straight-line start-to-goal minus the goal
   * radius the robot stops inside. 16.90 m at the default config, where start and goal are
   * 18.00 m apart and the robot stops within 1.1 m. It is a bound, and the tile says so.
   */
  readonly straightLineM: number;
}

export interface BuildContextInit {
  readonly config: RunConfig;
  readonly params: MeasurementParams;
  readonly run: RunResult;
  readonly band: RunToRunBand | null;
  readonly floor: SplitHalfNull | null;
  readonly zeroRun: RunResult | null;
  readonly frechetMeanM: number | null;
}

export function buildContext(init: BuildContextInit): ReportContext {
  const startX = init.config.robot.startXY[0];
  const startY = init.config.robot.startXY[1];
  const goalX = init.config.robot.goalXY[0];
  const goalY = init.config.robot.goalXY[1];
  const dx = goalX - startX;
  const dy = goalY - startY;
  const straightLine = Math.sqrt(dx * dx + dy * dy) - SIM_CONSTANTS.goalReachedM;
  let straightLineM = straightLine;
  if (straightLine < 0) {
    straightLineM = 0;
  }
  return Object.freeze({
    kind: "reportContext" as const,
    config: init.config,
    params: init.params,
    run: init.run,
    deviation: deviation(init.run.pair),
    band: init.band,
    floor: init.floor,
    zeroRun: init.zeroRun,
    frechetMeanM: init.frechetMeanM,
    straightLineM,
  });
}
```

Add `SIM_CONSTANTS` to the config import: `import { SIM_CONSTANTS, type RunConfig } from "../contracts/config.js";`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/job/__tests__/clearance.test.ts`
Then `npx tsc --noEmit`.
Expected: 6 passing, clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add web/engine/job/report.ts web/engine/job/__tests__/clearance.test.ts
git commit -m "Measure clearance from the moment both bodies have moved, without touching the spawn"
```

---

### Task 11: The column catalogue

**Files:**
- Create: `web/engine/job/columns.ts`
- Create: `web/engine/job/__tests__/columns.test.ts`
- Test: `web/engine/job/__tests__/columns.test.ts`

**Interfaces:**
- Consumes: `ReportContext`, `arrivalSecondsOf`, `clearanceAfterBothMove`, `pedestrianTimeLost` (Tasks 8–9); `robotCost(treated, control, dt): RobotCost`, `recovery(series, disturbanceStep, dt, toleranceM, dwellSteps): Recovery`, `paired(pair): Estimate`, `cvmResidual(pair, horizonSteps, endStep?): Estimate`, `pathLength(path): number`, `SIM_CONSTANTS`.
- Produces: `ColumnKey`, `UnitKey`, `ColumnGroup`, `ColumnNeeds`, `Statistic`, `Availability`, `Reading`, `makeReading`, `ZeroReference`, `ColumnDescriptor`, `COLUMNS`, `COLUMN_ORDER`. Tasks 11–15 all consume `ColumnKey`, `COLUMNS`, `COLUMN_ORDER` and `Reading`.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/columns.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import type { TreatmentSpec } from "../../contracts/pairedRun.js";
import { runPair } from "../../sim/run.js";
import { COLUMNS, COLUMN_ORDER, type ColumnKey } from "../columns.js";
import { buildContext, type MeasurementParams, type ReportContext } from "../report.js";

const PARAMS: MeasurementParams = Object.freeze({
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.25,
  recoveryDwellSteps: 20,
});

function contextWith(treatment: TreatmentSpec): ReportContext {
  const config = makeRunConfig({ treatment });
  return buildContext({
    config,
    params: PARAMS,
    run: runPair(config),
    band: null,
    floor: null,
    zeroRun: null,
    frechetMeanM: null,
  });
}

/** A term the operator has never met, spelled the way a program spells it. */
const CODE_IDENTIFIER = /\b(?:[a-z]+[A-Z][A-Za-z]*|[a-z_]+_[a-z_]+)\b|[()[\]{}]|=>/;

describe("the column catalogue is total and self-consistent", () => {
  it("orders every key exactly once", () => {
    const keys = Object.keys(COLUMNS) as ColumnKey[];
    expect([...COLUMN_ORDER].sort()).toEqual([...keys].sort());
    expect(new Set(COLUMN_ORDER).size).toBe(COLUMN_ORDER.length);
  });

  it("gives every column its own key back", () => {
    for (const key of COLUMN_ORDER) {
      expect(COLUMNS[key].key).toBe(key);
      expect(COLUMNS[key].kind).toBe("column");
    }
  });

  it("matches every column's statistic to its zero-reference's statistic", () => {
    // A max-over-steps readout judged against a mean-over-steps floor clears it for free, because
    // max >= mean for any series. So a companion zero must be measured the same way.
    for (const key of COLUMN_ORDER) {
      const column = COLUMNS[key];
      if (column.zero.kind === "companionColumn") {
        expect(COLUMNS[column.zero.column].statistic).toBe(column.statistic);
      }
    }
  });

  it("writes labels, zeros and assumptions in English, not in code", () => {
    const context = contextWith({ kind: "robot-presence" });
    for (const key of COLUMN_ORDER) {
      const column = COLUMNS[key];
      expect(column.label.length).toBeGreaterThan(3);
      expect(column.label).not.toMatch(CODE_IDENTIFIER);
      expect(column.zero.how.length).toBeGreaterThan(20);
      expect(column.zero.how).not.toMatch(CODE_IDENTIFIER);
      const assumption = column.assumption(context);
      expect(assumption.length).toBeGreaterThan(20);
      expect(assumption).not.toMatch(CODE_IDENTIFIER);
    }
  });

  it("anchors every metre column against something with scale", () => {
    // Guardrail 7. A metre on its own means nothing to a beginner, so a metres column either
    // declares that it needs a body-scale anchor beside it or carries a zero that gives scale.
    for (const key of COLUMN_ORDER) {
      const column = COLUMNS[key];
      if (column.unit === "metres") {
        const hasScale =
          column.needsAnchor ||
          column.zero.kind === "geometricBound" ||
          column.zero.kind === "companionColumn";
        expect(hasScale).toBe(true);
      }
    }
  });
});

describe("availability", () => {
  const context = contextWith({ kind: "robot-presence" });

  it("is NaN if and only if the reading is not measured", () => {
    for (const key of COLUMN_ORDER) {
      const reading = COLUMNS[key].extract(context);
      const measured = reading.availability.kind === "measured";
      expect(Number.isNaN(reading.value)).toBe(!measured);
    }
  });

  it("declares honestly what it needs, with band, floor, zero run and Frechet all absent", () => {
    // The context above has all four optional inputs null. Every column that says it needs one
    // must decline to report, and every column that says it needs only the run must report.
    for (const key of COLUMN_ORDER) {
      const column = COLUMNS[key];
      const reading = column.extract(context);
      if (column.needs !== "run") {
        expect(reading.availability.kind).not.toBe("measured");
      }
    }
    expect(COLUMNS.trueEffectM.extract(context).availability.kind).toBe("measured");
    expect(COLUMNS.worstMomentM.extract(context).availability.kind).toBe("measured");
    expect(COLUMNS.robotPathM.extract(context).availability.kind).toBe("measured");
    expect(COLUMNS.minClearanceM.extract(context).availability.kind).toBe("measured");
  });

  it("reads the values the simulator actually produced at the default settings", () => {
    expect(COLUMNS.trueEffectM.extract(context).value).toBe(0.35157013372697155);
    expect(COLUMNS.worstMomentM.extract(context).value).toBe(0.7611531942454374);
    expect(COLUMNS.robotPathM.extract(context).value).toBe(17.780036918665008);
    expect(COLUMNS.robotArrivalS.extract(context).value).toBe(328 * 0.05);
    expect(COLUMNS.minClearanceM.extract(context).value).toBe(-0.04979741026062734);
    expect(COLUMNS.nearMissEpisodes.extract(context).value).toBe(2);
    expect(COLUMNS.pedestrianTimeLostS.extract(context).value).toBe(-0.08333333333333333);
    expect(context.straightLineM).toBe(16.9);
  });

  it("censors a recovery that never came back inside its tolerance", () => {
    const reading = COLUMNS.recoveryS.extract(context);
    expect(reading.availability.kind).toBe("censored");
    expect(Number.isNaN(reading.value)).toBe(true);
  });

  it("calls the robot's extra path not applicable when the control arm has no robot", () => {
    const reading = COLUMNS.extraPathM.extract(context);
    expect(reading.availability.kind).toBe("notApplicable");
    if (reading.availability.kind === "notApplicable") {
      expect(reading.availability.why).toMatch(/no robot/);
    }
  });

  it("refuses to report a near-miss count of zero when there is no robot to miss with", () => {
    // A finite zero is the dangerous case: it averages happily and reads as a real measurement.
    const noRobot = contextWith({ kind: "none" });
    const reading = COLUMNS.nearMissEpisodes.extract(noRobot);
    expect(reading.availability.kind).toBe("notApplicable");
    expect(Number.isNaN(reading.value)).toBe(true);
  });

  it("rewrites the identifying assumption when the robot is in both arms", () => {
    const shared = contextWith({ kind: "none" });
    const withRobot = contextWith({ kind: "robot-presence" });
    const a = COLUMNS.trueEffectM.assumption(shared);
    const b = COLUMNS.trueEffectM.assumption(withRobot);
    expect(a).not.toBe(b);
    expect(b).toMatch(/whether the robot is there/);
    expect(a).not.toMatch(/whether the robot is there/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/job/__tests__/columns.test.ts`
Expected: FAIL with `Failed to resolve import "../columns.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/engine/job/columns.ts`:

```ts
import { SIM_CONSTANTS } from "../contracts/config.js";
import { fail } from "../core/errors.js";
import { cvmResidual, paired } from "../measure/estimator/index.js";
import { pathLength } from "../measure/kernels.js";
import { recovery, robotCost } from "../measure/metrics.js";
import {
  arrivalSecondsOf,
  clearanceAfterBothMove,
  pedestrianTimeLost,
  type ReportContext,
} from "./report.js";

/**
 * One descriptor per column: the arithmetic, the words, the unit and the zero, in one literal.
 *
 * This guarantees the DIFF is visible, not that the words are right. Nothing in the build checks
 * that `assumption` describes what `extract` computed. What it does guarantee is that changing a
 * formula without changing its sentence is a one-hunk diff you have to look at, which is more
 * than the arrangement it replaces managed: a panel has already once explained a different
 * quantity from the one printed above it, and it compiled.
 *
 * A closed catalogue is not a registry. There is no `register` function and nothing is added at
 * runtime. It is a table so a test can iterate it and prove the set is total, which is the
 * opposite of an extension point.
 */

export type ColumnKey =
  | "trueEffectM"
  | "worstMomentM"
  | "forecastReportM"
  | "forecastZeroM"
  | "runToRunBandM"
  | "worstMomentNullM"
  | "detectionFloorM"
  | "robotPathM"
  | "robotArrivalS"
  | "extraPathM"
  | "pedestrianTimeLostS"
  | "minClearanceM"
  | "nearMissEpisodes"
  | "recoveryS"
  | "frechetMeanM";

export type UnitKey = "metres" | "seconds" | "count" | "ratio" | "people" | "none";
export type ColumnGroup =
  | "effect"
  | "forecast"
  | "null"
  | "cost"
  | "safety"
  | "recovery"
  | "otherRulers";
export type ColumnNeeds = "run" | "zeroRun" | "band" | "floor" | "frechet";
export type Statistic = "meanOverSteps" | "maxOverSteps" | "perAgent" | "pathScalar";

export type Availability =
  | { readonly kind: "measured" }
  | { readonly kind: "censored"; readonly why: string }
  | { readonly kind: "notApplicable"; readonly why: string };

export interface Reading {
  readonly kind: "reading";
  /** NaN if and only if `availability.kind !== "measured"`. */
  readonly value: number;
  readonly availability: Availability;
}

export function makeReading(value: number, availability: Availability): Reading {
  if (availability.kind === "measured") {
    if (!Number.isFinite(value)) {
      fail(`a measured reading must be a finite number, got ${value}`);
    }
  } else if (!Number.isNaN(value)) {
    fail(`a ${availability.kind} reading must carry NaN, got ${value}`);
  }
  return Object.freeze({ kind: "reading" as const, value, availability });
}

const MEASURED: Availability = Object.freeze({ kind: "measured" as const });

function measured(value: number): Reading {
  return makeReading(value, MEASURED);
}

function censored(why: string): Reading {
  return makeReading(Number.NaN, { kind: "censored", why });
}

function notApplicable(why: string): Reading {
  return makeReading(Number.NaN, { kind: "notApplicable", why });
}

export type ZeroReference =
  | { readonly kind: "exactZero"; readonly how: string }
  | { readonly kind: "companionColumn"; readonly column: ColumnKey; readonly how: string }
  | { readonly kind: "geometricBound"; readonly how: string }
  | { readonly kind: "notAPerturbation"; readonly how: string };

export interface ColumnDescriptor {
  readonly kind: "column";
  readonly key: ColumnKey;
  readonly label: string;
  readonly unit: UnitKey;
  readonly group: ColumnGroup;
  readonly needs: ColumnNeeds;
  readonly statistic: Statistic;
  readonly needsAnchor: boolean;
  readonly zero: ZeroReference;
  readonly assumption: (ctx: ReportContext) => string;
  readonly extract: (ctx: ReportContext) => Reading;
}

const NO_BAND = "The run-to-run band was not measured for this run, so there is nothing to report.";
const NO_FLOOR = "The detection floor was not measured for this run, so there is nothing to report.";
const NO_ZERO_RUN =
  "The reference run in which nobody responds to the robot was not measured for this run.";
const NO_FRECHET = "The longest-leash ruler was not switched on for this run.";
const NO_ROBOT = "This run has no robot in the treated arm, so there is nothing to measure.";

/**
 * The paired estimator's own sentence is true only when the robot is the treatment.
 *
 * Under a shove treatment the robot is in both arms, and under the null treatment nothing differs
 * at all, so quoting "differ only in whether the robot is there" would be false on screen.
 */
function pairedAssumption(ctx: ReportContext): string {
  if (ctx.config.treatment.kind === "robot-presence") {
    return (
      "Both runs share a seed, a starting state and the same random wobble, and differ only in " +
      "whether the robot is there. Because nothing else can differ, the gap between a person's " +
      "two paths is the robot's effect on them and nothing is estimated."
    );
  }
  if (ctx.config.treatment.kind === "disturbance") {
    return (
      "Both runs share a seed, a starting state and the same random wobble, and the robot is in " +
      "both of them. They differ only in whether one scheduled shove happened, so the gap " +
      "between a person's two paths is the effect of that shove and of nothing else."
    );
  }
  return (
    "Both runs share a seed, a starting state and the same random wobble, and nothing was done " +
    "to either of them. Anything other than a flat zero here is the measurement moving, not the " +
    "room."
  );
}

function forecastAssumption(): string {
  return (
    "This does not identify the robot's effect. It guesses where each person was about to walk " +
    "from their own recent past, assuming they carry straight on, then reports how wrong the " +
    "guess was as if that were the robot's doing. The number contains every reason a person " +
    "might not walk in a straight line, all of which would be there with no robot in the room."
  );
}

export const COLUMNS: Readonly<Record<ColumnKey, ColumnDescriptor>> = Object.freeze({
  trueEffectM: Object.freeze({
    kind: "column" as const,
    key: "trueEffectM" as const,
    label: "How far the crowd was moved",
    unit: "metres" as const,
    group: "effect" as const,
    needs: "run" as const,
    statistic: "meanOverSteps" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "Switch off the setting that lets people notice the robot and this reads 0.000 m, exactly and every time.",
    }),
    assumption: pairedAssumption,
    extract: (ctx: ReportContext): Reading => measured(paired(ctx.run.pair).value),
  }),

  worstMomentM: Object.freeze({
    kind: "column" as const,
    key: "worstMomentM" as const,
    label: "Worst moment",
    unit: "metres" as const,
    group: "effect" as const,
    needs: "run" as const,
    statistic: "maxOverSteps" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "companionColumn" as const,
      column: "worstMomentNullM" as const,
      how: "Two runs of this room with nothing done to either of them still drift apart, and this is the widest that drift ever gets.",
    }),
    assumption: pairedAssumption,
    extract: (ctx: ReportContext): Reading => measured(ctx.deviation.maxM),
  }),

  forecastReportM: Object.freeze({
    kind: "column" as const,
    key: "forecastReportM" as const,
    label: "What a forecaster would report",
    unit: "metres" as const,
    group: "forecast" as const,
    needs: "run" as const,
    statistic: "meanOverSteps" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "companionColumn" as const,
      column: "forecastZeroM" as const,
      how: "The same forecaster, on a run at these same settings in which nobody responded to the robot at all.",
    }),
    assumption: forecastAssumption,
    extract: (ctx: ReportContext): Reading =>
      measured(
        cvmResidual(ctx.run.pair, ctx.params.forecastHorizonSteps, ctx.params.forecastEndStep).value,
      ),
  }),

  forecastZeroM: Object.freeze({
    kind: "column" as const,
    key: "forecastZeroM" as const,
    label: "What the forecaster reports when the answer is zero",
    unit: "metres" as const,
    group: "forecast" as const,
    needs: "zeroRun" as const,
    statistic: "meanOverSteps" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "Nobody in this reference run responded to the robot, so the honest answer for it is 0.000 m and whatever appears here is the forecaster's own error.",
    }),
    assumption: forecastAssumption,
    extract: (ctx: ReportContext): Reading => {
      const zeroRun = ctx.zeroRun;
      if (zeroRun === null) {
        return notApplicable(NO_ZERO_RUN);
      }
      return measured(
        cvmResidual(zeroRun.pair, ctx.params.forecastHorizonSteps, ctx.params.forecastEndStep).value,
      );
    },
  }),

  runToRunBandM: Object.freeze({
    kind: "column" as const,
    key: "runToRunBandM" as const,
    label: "Ordinary difference between two runs",
    unit: "metres" as const,
    group: "null" as const,
    needs: "band" as const,
    statistic: "meanOverSteps" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "notAPerturbation" as const,
      how: "Nothing was done to any of the runs behind this number. It is the zero line itself, not a reading judged against one.",
    }),
    assumption: (): string =>
      "Several runs of this same room, all of them with no robot in them, paired against each " +
      "other. Whatever they differ by is what this room does on its own.",
    extract: (ctx: ReportContext): Reading => {
      const band = ctx.band;
      if (band === null) {
        return notApplicable(NO_BAND);
      }
      return measured(band.value);
    },
  }),

  worstMomentNullM: Object.freeze({
    kind: "column" as const,
    key: "worstMomentNullM" as const,
    label: "Widest ordinary difference between two runs",
    unit: "metres" as const,
    group: "null" as const,
    needs: "band" as const,
    statistic: "maxOverSteps" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "notAPerturbation" as const,
      how: "Nothing was done to any of the runs behind this number. It is the zero line for a worst-moment reading, not a reading itself.",
    }),
    assumption: (): string =>
      "The same robot-free runs the ordinary difference comes from, reduced the way the worst " +
      "moment is reduced: the widest the crowd ever drifted apart at any single instant.",
    extract: (ctx: ReportContext): Reading => {
      const band = ctx.band;
      if (band === null) {
        return notApplicable(NO_BAND);
      }
      return measured(band.peakValue);
    },
  }),

  detectionFloorM: Object.freeze({
    kind: "column" as const,
    key: "detectionFloorM" as const,
    label: "Smallest effect this crowd could resolve",
    unit: "metres" as const,
    group: "null" as const,
    needs: "floor" as const,
    statistic: "pathScalar" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "notAPerturbation" as const,
      how: "Both halves being compared come from the same robot-free crowd, so there is nothing to find and whatever appears is sampling noise.",
    }),
    assumption: (): string =>
      "Split one robot-free crowd into two random halves and ask how far apart the halves look. " +
      "It is a property of how many people were pooled, not of the room.",
    extract: (ctx: ReportContext): Reading => {
      const floor = ctx.floor;
      if (floor === null) {
        return notApplicable(NO_FLOOR);
      }
      return measured(floor.floor);
    },
  }),

  robotPathM: Object.freeze({
    kind: "column" as const,
    key: "robotPathM" as const,
    label: "How far the robot travelled",
    unit: "metres" as const,
    group: "cost" as const,
    needs: "run" as const,
    statistic: "pathScalar" as const,
    needsAnchor: false,
    zero: Object.freeze({
      kind: "geometricBound" as const,
      how: "An empty room still costs the robot the straight line from where it started to the edge of its goal, so no run can read below that.",
    }),
    assumption: (): string =>
      "The length of the line the robot actually walked. It is not a comparison with anything, " +
      "so the only thing it can be judged against is the shortest crossing that would count.",
    extract: (ctx: ReportContext): Reading => {
      const path = ctx.run.treated.robotPositions;
      if (path === null) {
        return notApplicable(NO_ROBOT);
      }
      return measured(pathLength(path));
    },
  }),

  robotArrivalS: Object.freeze({
    kind: "column" as const,
    key: "robotArrivalS" as const,
    label: "How long the robot took to arrive",
    unit: "seconds" as const,
    group: "cost" as const,
    needs: "run" as const,
    statistic: "pathScalar" as const,
    needsAnchor: false,
    zero: Object.freeze({
      kind: "geometricBound" as const,
      how: "The shortest crossing that counts as arriving, walked flat out at the robot's own speed limit, is the fastest this could possibly read.",
    }),
    assumption: (): string =>
      "The first moment the robot came inside the radius that counts as reaching its goal. A " +
      "robot that never got there is reported as not having arrived, never as a time.",
    extract: (ctx: ReportContext): Reading => {
      if (ctx.run.treated.robotPositions === null) {
        return notApplicable(NO_ROBOT);
      }
      const seconds = arrivalSecondsOf(ctx.run.treated, ctx.config.dt);
      if (Number.isNaN(seconds)) {
        return censored(
          "The robot never came inside its goal radius before the episode ended, so all that can " +
            "be said is that it took longer than the episode.",
        );
      }
      return measured(seconds);
    },
  }),

  extraPathM: Object.freeze({
    kind: "column" as const,
    key: "extraPathM" as const,
    label: "Extra distance the robot walked because of the treatment",
    unit: "metres" as const,
    group: "cost" as const,
    needs: "run" as const,
    statistic: "pathScalar" as const,
    needsAnchor: false,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "A treatment that changed nothing about the robot's route leaves this at exactly 0.000 m.",
    }),
    assumption: (): string =>
      "The difference between the robot's two routes. It exists only when the robot is in both " +
      "runs, because otherwise there is no second route to subtract.",
    extract: (ctx: ReportContext): Reading => {
      if (ctx.run.control.robotPositions === null) {
        return notApplicable(
          "The comparison run has no robot in it at all, so there is no second route to " +
            "subtract and no difference to report.",
        );
      }
      const cost = robotCost(ctx.run.treated, ctx.run.control, ctx.config.dt);
      if (!Number.isFinite(cost.extraPathM)) {
        return notApplicable(NO_ROBOT);
      }
      return measured(cost.extraPathM);
    },
  }),

  pedestrianTimeLostS: Object.freeze({
    kind: "column" as const,
    key: "pedestrianTimeLostS" as const,
    label: "How much longer people took to settle",
    unit: "seconds" as const,
    group: "cost" as const,
    needs: "run" as const,
    statistic: "perAgent" as const,
    needsAnchor: false,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "If nobody was slowed or hurried, every person settles at the same instant in both runs and this reads exactly 0.0 s.",
    }),
    assumption: (): string =>
      "Each person is compared with themselves in the other run, and anyone who never settled " +
      "in one of the two runs is dropped and counted rather than averaged in as a zero.",
    extract: (ctx: ReportContext): Reading => {
      const lost = pedestrianTimeLost(ctx.run, ctx.config.dt);
      if (lost.nUsed === 0) {
        return censored(
          "Nobody in this run settled in both versions of the room, so there is nothing to " +
            "difference.",
        );
      }
      return measured(lost.meanS);
    },
  }),

  minClearanceM: Object.freeze({
    kind: "column" as const,
    key: "minClearanceM" as const,
    label: "Closest the robot came to anybody",
    unit: "metres" as const,
    group: "safety" as const,
    needs: "run" as const,
    statistic: "pathScalar" as const,
    needsAnchor: false,
    zero: Object.freeze({
      kind: "geometricBound" as const,
      how: "Zero means the two outlines just touched; below zero they overlapped, and above zero that is the gap between them.",
    }),
    assumption: (): string =>
      "Measured surface to surface, and only from the moment both the robot and that person have " +
      "left where they were standing. People are placed at the start without being told where " +
      "the robot is, so somebody standing on it before anyone moves is an artefact of the " +
      "placement rather than something the robot did.",
    extract: (ctx: ReportContext): Reading => {
      const gated = clearanceAfterBothMove(
        ctx.run.treated.robotPositions,
        ctx.run.treated.positions,
        SIM_CONSTANTS.robotRadiusM,
        SIM_CONSTANTS.pedRadiusM,
        ctx.params.nearMissThresholdM,
      );
      if (Number.isNaN(gated.minM)) {
        return notApplicable(NO_ROBOT);
      }
      return measured(gated.minM);
    },
  }),

  nearMissEpisodes: Object.freeze({
    kind: "column" as const,
    key: "nearMissEpisodes" as const,
    label: "Separate occasions it came closer than the near-miss line",
    unit: "count" as const,
    group: "safety" as const,
    needs: "run" as const,
    statistic: "pathScalar" as const,
    needsAnchor: false,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "A robot that never came closer than the near-miss line reads exactly 0 occasions.",
    }),
    assumption: (): string =>
      "Occasions, not instants. Counting instants below the line would make the number grow " +
      "simply by simulating in finer steps, which is a property of the settings and not of the " +
      "room. A run with no robot in it reports nothing rather than zero.",
    extract: (ctx: ReportContext): Reading => {
      const gated = clearanceAfterBothMove(
        ctx.run.treated.robotPositions,
        ctx.run.treated.positions,
        SIM_CONSTANTS.robotRadiusM,
        SIM_CONSTANTS.pedRadiusM,
        ctx.params.nearMissThresholdM,
      );
      // A finite zero is the dangerous answer here: it averages happily and reads like a
      // measurement. Nothing to miss with is not the same as nothing missed.
      if (gated.nStepsMeasured === 0) {
        return notApplicable(NO_ROBOT);
      }
      return measured(gated.nearMissEpisodes);
    },
  }),

  recoveryS: Object.freeze({
    kind: "column" as const,
    key: "recoveryS" as const,
    label: "How long until the crowd was back inside tolerance",
    unit: "seconds" as const,
    group: "recovery" as const,
    needs: "run" as const,
    statistic: "pathScalar" as const,
    needsAnchor: false,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "A crowd that never left the tolerance in the first place is back inside it at 0.0 s.",
    }),
    assumption: (): string =>
      "Recovered is a property of the tolerance that was chosen, not of the room. The tolerance " +
      "here is a share of this run's own worst moment, and an episode that ends before the crowd " +
      "comes back is reported as not having recovered rather than as a number.",
    extract: (ctx: ReportContext): Reading => {
      const tolerance = ctx.params.recoveryToleranceFraction * ctx.deviation.maxM;
      const result = recovery(
        ctx.deviation.series,
        ctx.deviation.maxAtStep,
        ctx.config.dt,
        tolerance,
        ctx.params.recoveryDwellSteps,
      );
      if (result.censored) {
        return censored(
          "The crowd had not come back inside the tolerance and stayed there before the episode " +
            "ended, so all that can be said is that it took longer than the run.",
        );
      }
      return measured(result.recoveryS);
    },
  }),

  frechetMeanM: Object.freeze({
    kind: "column" as const,
    key: "frechetMeanM" as const,
    label: "Shortest leash between a person's two paths",
    unit: "metres" as const,
    group: "otherRulers" as const,
    needs: "frechet" as const,
    statistic: "pathScalar" as const,
    needsAnchor: true,
    zero: Object.freeze({
      kind: "exactZero" as const,
      how: "Two identical paths need no leash at all, so this reads exactly 0.000 m when nobody moved differently.",
    }),
    assumption: (): string =>
      "The shortest leash that would let somebody walk both of their paths at once without ever " +
      "going backwards. It notices a detour that ends where it started, which an average over " +
      "instants does not.",
    extract: (ctx: ReportContext): Reading => {
      const value = ctx.frechetMeanM;
      if (value === null) {
        return notApplicable(NO_FRECHET);
      }
      return measured(value);
    },
  }),
});

export const COLUMN_ORDER: readonly ColumnKey[] = Object.freeze([
  "trueEffectM",
  "forecastReportM",
  "runToRunBandM",
  "worstMomentM",
  "worstMomentNullM",
  "forecastZeroM",
  "detectionFloorM",
  "robotPathM",
  "robotArrivalS",
  "minClearanceM",
  "nearMissEpisodes",
  "extraPathM",
  "pedestrianTimeLostS",
  "recoveryS",
  "frechetMeanM",
] as const);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/job/__tests__/columns.test.ts`
Expected: 12 passing. If `refuses to report a near-miss count of zero` fails, the `{ kind: "none" }` treatment still has a robot in both arms — check that `nStepsMeasured` is the guard and not `robotPositions === null`.

- [ ] **Step 5: Commit**

```bash
git add web/engine/job/columns.ts web/engine/job/__tests__/columns.test.ts
git commit -m "Put every column's arithmetic, unit, zero and assumption in one literal"
```

---

### Task 12: `runReport`

**Files:**
- Modify: `web/engine/job/report.ts` (append)
- Create: `web/engine/job/__tests__/report.test.ts`
- Create: `web/engine/job/__tests__/report.golden.json`
- Test: `web/engine/job/__tests__/report.test.ts`

**Interfaces:**
- Consumes: `COLUMNS`, `COLUMN_ORDER`, `ColumnKey`, `Reading` (Task 11); `ReportContext`, `buildContext` (Task 10).
- Produces: `runReport(ctx: ReportContext, keys: readonly ColumnKey[]): Readonly<Partial<Record<ColumnKey, Reading>>>`. Task 16's runner calls this once per unit.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import { runPair } from "../../sim/run.js";
import { COLUMN_ORDER, type ColumnKey } from "../columns.js";
import { buildContext, runReport, type MeasurementParams } from "../report.js";

const PARAMS: MeasurementParams = Object.freeze({
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.25,
  recoveryDwellSteps: 20,
});

function defaultContext() {
  const config = makeRunConfig();
  const run = runPair(config);
  const zeroConfig = makeRunConfig({ pedestriansSeeRobot: false });
  return buildContext({
    config,
    params: PARAMS,
    run,
    band: null,
    floor: null,
    zeroRun: runPair(zeroConfig),
    frechetMeanM: null,
  });
}

describe("runReport", () => {
  it("reports exactly the keys it was asked for", () => {
    const context = defaultContext();
    const keys: readonly ColumnKey[] = ["trueEffectM", "minClearanceM"];
    const report = runReport(context, keys);
    expect(Object.keys(report).sort()).toEqual(["minClearanceM", "trueEffectM"]);
  });

  it("reads the values the simulator produced at the default settings", () => {
    const report = runReport(defaultContext(), COLUMN_ORDER);
    expect(report.trueEffectM?.value).toBe(0.35157013372697155);
    expect(report.worstMomentM?.value).toBe(0.7611531942454374);
    expect(report.forecastReportM?.value).toBe(0.2854565210301339);
    expect(report.robotPathM?.value).toBe(17.780036918665008);
    expect(report.robotArrivalS?.value).toBe(328 * 0.05);
    expect(report.minClearanceM?.value).toBe(-0.04979741026062734);
    expect(report.nearMissEpisodes?.value).toBe(2);
    expect(report.pedestrianTimeLostS?.value).toBe(-0.08333333333333333);
  });

  it("shows the forecaster reporting a third of a metre on a run whose true effect is zero", () => {
    // The console's central argument, made from the two numbers the console actually prints.
    const report = runReport(defaultContext(), COLUMN_ORDER);
    expect(report.forecastZeroM?.availability.kind).toBe("measured");
    expect(report.forecastZeroM?.value).toBe(0.3341109929554126);
  });

  it("declines every column whose input was absent", () => {
    const report = runReport(defaultContext(), COLUMN_ORDER);
    expect(report.runToRunBandM?.availability.kind).toBe("notApplicable");
    expect(report.worstMomentNullM?.availability.kind).toBe("notApplicable");
    expect(report.detectionFloorM?.availability.kind).toBe("notApplicable");
    expect(report.frechetMeanM?.availability.kind).toBe("notApplicable");
  });

  it("returns the same numbers when the same run is reported twice", () => {
    // Determinism is compared as bytes. `toBe` is Object.is, so a NaN matches a NaN and a value
    // that has drifted by one bit does not.
    const a = runReport(defaultContext(), COLUMN_ORDER);
    const b = runReport(defaultContext(), COLUMN_ORDER);
    for (const key of COLUMN_ORDER) {
      expect(b[key]?.value).toBe(a[key]?.value);
      expect(b[key]?.availability.kind).toBe(a[key]?.availability.kind);
    }
  });

  it("refuses a key that is not in the catalogue", () => {
    const context = defaultContext();
    const bogus = ["notAColumn"] as unknown as readonly ColumnKey[];
    expect(() => runReport(context, bogus)).toThrow(/'notAColumn' is not a column/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/job/__tests__/report.test.ts`
Expected: FAIL with `The requested module '../report.js' does not provide an export named 'runReport'`.

- [ ] **Step 3: Write minimal implementation**

Append to `web/engine/job/report.ts`, and add the import `import { COLUMNS, type ColumnKey, type Reading } from "./columns.js";` to the import block:

```ts
/**
 * Every requested column, extracted from one context.
 *
 * The context is built once per run and the extractors only read it, so ordering the keys
 * differently cannot change a number. `runReport` re-checks the NaN rule on the way out: a
 * descriptor that returns a finite value alongside a censored availability would otherwise be
 * averaged as though it were a measurement.
 */
export function runReport(
  ctx: ReportContext,
  keys: readonly ColumnKey[],
): Readonly<Partial<Record<ColumnKey, Reading>>> {
  const report: Partial<Record<ColumnKey, Reading>> = {};
  for (const key of keys) {
    const column = COLUMNS[key];
    if (column === undefined) {
      fail(`'${String(key)}' is not a column; the catalogue in columns.ts is closed`);
    }
    const reading = column.extract(ctx);
    const isMeasured = reading.availability.kind === "measured";
    if (isMeasured === Number.isNaN(reading.value)) {
      fail(
        `column '${key}' returned a ${reading.availability.kind} reading whose value is ` +
          `${reading.value}; a value is NaN if and only if it was not measured`,
      );
    }
    report[key] = reading;
  }
  return Object.freeze(report);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/job/__tests__/report.test.ts`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add web/engine/job/report.ts web/engine/job/__tests__/report.test.ts
git commit -m "Extract a run's whole report from one context, and pin what it says at the defaults"
```

---

- [ ] **Step 6: Pin every column at one fixed config and seed**

Step 1's test pins eight values by hand, which leaves the rest of the catalogue free to change
without anything going red. The spec's test-strategy table requires a golden file covering **every**
column, so add one.

Append to `web/engine/job/__tests__/report.test.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every column at one fixed config and seed.
 *
 * The hand-pinned expectations above cover the columns whose behaviour the lesson turns on. This
 * covers the rest, so that a formula change anywhere in the catalogue is a red test rather than a
 * number nobody was watching. It stores the availability KIND alongside the value because a column
 * silently flipping from "measured" to "notApplicable" keeps a NaN in the value slot either way.
 *
 * Regenerate deliberately, never reflexively: `MIRN_UPDATE_GOLDEN=1 npx vitest run
 * web/engine/job/__tests__/report.test.ts`. If you cannot say in the commit message which formula
 * changed and why, do not regenerate it.
 */
const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), "report.golden.json");

describe("the whole column catalogue", () => {
  it("matches the committed golden report", () => {
    const context = fullContext();
    const report = runReport(context, COLUMN_ORDER);
    const actual: Record<string, { value: number; availability: string }> = {};
    for (const key of COLUMN_ORDER) {
      const reading = report[key];
      if (reading === undefined) {
        throw new Error(`runReport returned nothing for '${key}', which COLUMN_ORDER names`);
      }
      actual[key] = { value: reading.value, availability: reading.availability.kind };
    }

    if (process.env["MIRN_UPDATE_GOLDEN"] === "1") {
      writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
    }

    const expected = JSON.parse(readFileSync(GOLDEN, "utf8")) as typeof actual;
    // Bytes, not approximations: this run is deterministic, so any drift at all is a real change.
    expect(JSON.stringify(actual, null, 2)).toBe(JSON.stringify(expected, null, 2));
  });
});
```

`fullContext()` is the helper Step 1 already defines — the default config at seed index 0 with the
band, the floor, the zero-effect run and Fréchet all present, so no column reports `notApplicable`
for want of an input.

- [ ] **Step 7: Generate the fixture and confirm it is stable**

Run: `MIRN_UPDATE_GOLDEN=1 npx vitest run web/engine/job/__tests__/report.golden.json 2>/dev/null; MIRN_UPDATE_GOLDEN=1 npx vitest run web/engine/job/__tests__/report.test.ts`
Expected: PASS, and `git status --short` now shows `?? web/engine/job/__tests__/report.golden.json`.

Then run it a second time **without** the environment variable:

Run: `npx vitest run web/engine/job/__tests__/report.test.ts`
Expected: PASS. If it fails on the second run, the report is not deterministic and that is a bug in
a column extractor, not in the fixture — find it before going further.

- [ ] **Step 8: Commit**

```bash
git add web/engine/job/__tests__/report.test.ts web/engine/job/__tests__/report.golden.json
git commit -m "Pin every column at one fixed config and seed

The hand-written expectations cover the columns the lesson turns on. This covers
the rest, so a formula change anywhere in the catalogue goes red instead of
quietly moving a number nobody was watching."
```

### Task 13: `Aggregate`, `aggregate`, `RunKey`, `RunRow`

**Files:**
- Modify: `web/engine/job/stats.ts` (append after `sdOf`; the file was created in Task 1)
- Create: `web/engine/job/__tests__/aggregate-readings.test.ts`
- Test: `web/engine/job/__tests__/aggregate-readings.test.ts`

**Interfaces:**
- Consumes: `meanOf(values: readonly number[]): number`, `sdOf(values: readonly number[]): number`, `finiteCount(values: readonly number[]): number` (commit 1, same file); `Reading`, `ColumnKey` (Task 11, **type-only** import so `stats.ts` stays free of anything that runs).
- Produces: `AggregateReason`, `Aggregate`, `aggregate(readings: readonly Reading[]): Aggregate`, `RunKey`, `RunRow`. Task 16 consumes all five.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/aggregate-readings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeReading, type Reading } from "../columns.js";
import { aggregate } from "../stats.js";

const measuredReading = (value: number): Reading => makeReading(value, { kind: "measured" });
const censoredReading = (why: string): Reading =>
  makeReading(Number.NaN, { kind: "censored", why });
const notApplicableReading = (why: string): Reading =>
  makeReading(Number.NaN, { kind: "notApplicable", why });

/**
 * A mean never exists without its count.
 *
 * Recovery time was once averaged over as few as two of eight runs and presented as a property of
 * the eight, with nothing anywhere saying so. Dropping a censored value is right; dropping it
 * silently is not, so `nUsed` and `nAttempted` are separate fields and the reason is carried, not
 * inferred from whether the value happens to be NaN.
 */
describe("aggregate", () => {
  it("averages the survivors and reports both counts", () => {
    const result = aggregate([measuredReading(1), measuredReading(2), measuredReading(3)]);
    expect(result.value).toBe(2);
    expect(result.nUsed).toBe(3);
    expect(result.nAttempted).toBe(3);
    expect(result.reason.kind).toBe("measured");
    expect(result.sd).toBe(1);
  });

  it("leaves the spread NaN below two survivors, never zero", () => {
    // A zero there would read as "no spread", which is a claim, and one run makes no claim.
    const result = aggregate([measuredReading(4), censoredReading("ran out of episode")]);
    expect(result.value).toBe(4);
    expect(result.nUsed).toBe(1);
    expect(result.nAttempted).toBe(2);
    expect(Number.isNaN(result.sd)).toBe(true);
    expect(result.reason.kind).toBe("partiallyCensored");
    if (result.reason.kind === "partiallyCensored") {
      expect(result.reason.why).toMatch(/1 of 2/);
      expect(result.reason.why).toMatch(/ran out of episode/);
    }
  });

  it("reports the reason, not a number, when nothing survived", () => {
    const result = aggregate([
      censoredReading("the robot never arrived"),
      censoredReading("the robot never arrived"),
    ]);
    expect(Number.isNaN(result.value)).toBe(true);
    expect(Number.isNaN(result.sd)).toBe(true);
    expect(result.nUsed).toBe(0);
    expect(result.nAttempted).toBe(2);
    expect(result.reason.kind).toBe("allCensored");
    if (result.reason.kind === "allCensored") {
      expect(result.reason.why).toMatch(/the robot never arrived/);
    }
  });

  it("keeps not-applicable distinct from censored", () => {
    // Censored means the measurement was attempted and ran out. Not applicable means the quantity
    // does not exist under this design. Averaging them together would erase the difference.
    const result = aggregate([
      notApplicableReading("the comparison run has no robot in it at all"),
      notApplicableReading("the comparison run has no robot in it at all"),
    ]);
    expect(result.reason.kind).toBe("notApplicable");
    expect(result.nUsed).toBe(0);
  });

  it("calls a mix of censored and not-applicable censored, because something was attempted", () => {
    const result = aggregate([
      notApplicableReading("no robot"),
      censoredReading("never arrived"),
    ]);
    expect(result.reason.kind).toBe("allCensored");
  });

  it("refuses an empty cell", () => {
    expect(() => aggregate([])).toThrow(/aggregate needs at least one reading/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/job/__tests__/aggregate-readings.test.ts`
Expected: FAIL with `The requested module '../stats.js' does not provide an export named 'aggregate'` (or `Failed to resolve import "../stats.js"` if commit 1's file is not there yet — in that case create it with the three commit-1 helpers exactly as they appear in `scripts/measure-experiments.ts:42-56` before continuing).

- [ ] **Step 3: Write minimal implementation**

Append to `web/engine/job/stats.ts`, with `import { fail } from "../core/errors.js";` and `import type { ColumnKey, Reading } from "./columns.js";` added at the top:

```ts
export type AggregateReason =
  | { readonly kind: "measured" }
  | { readonly kind: "partiallyCensored"; readonly why: string }
  | { readonly kind: "allCensored"; readonly why: string }
  | { readonly kind: "notApplicable"; readonly why: string };

export interface Aggregate {
  readonly kind: "aggregate";
  readonly value: number;
  /** NaN below two survivors. A zero there would read as "no spread", which is a claim. */
  readonly sd: number;
  readonly nUsed: number;
  readonly nAttempted: number;
  readonly reason: AggregateReason;
}

/**
 * One cell's number, and everything needed to say what stands behind it.
 *
 * The reason is built from the readings' own reasons rather than inferred from a NaN downstream,
 * because "the robot never arrived" and "this quantity does not exist for this treatment" are
 * different sentences and the ledger renders them differently.
 */
export function aggregate(readings: readonly Reading[]): Aggregate {
  if (readings.length === 0) {
    fail("aggregate needs at least one reading; a cell with no runs has nothing to average");
  }

  const values: number[] = [];
  const censoredWhy: string[] = [];
  const notApplicableWhy: string[] = [];
  for (const reading of readings) {
    if (reading.availability.kind === "measured") {
      values.push(reading.value);
    } else if (reading.availability.kind === "censored") {
      censoredWhy.push(reading.availability.why);
    } else {
      notApplicableWhy.push(reading.availability.why);
    }
  }

  const nUsed = values.length;
  const nAttempted = readings.length;
  const value = meanOf(values);
  const sd = sdOf(values);

  let reason: AggregateReason = { kind: "measured" };
  if (nUsed === nAttempted) {
    reason = { kind: "measured" };
  } else if (nUsed > 0) {
    reason = {
      kind: "partiallyCensored",
      why: `averaged ${nUsed} of ${nAttempted} runs; the rest were not measured: ${firstReason(
        censoredWhy,
        notApplicableWhy,
      )}`,
    };
  } else if (censoredWhy.length > 0) {
    reason = {
      kind: "allCensored",
      why: `none of ${nAttempted} runs produced a number: ${firstReason(
        censoredWhy,
        notApplicableWhy,
      )}`,
    };
  } else {
    reason = {
      kind: "notApplicable",
      why: `this quantity does not exist for any of these ${nAttempted} runs: ${firstReason(
        censoredWhy,
        notApplicableWhy,
      )}`,
    };
  }

  return Object.freeze({ kind: "aggregate" as const, value, sd, nUsed, nAttempted, reason });
}

/** Censored explanations first: something was attempted and ran out, which is the sharper fact. */
function firstReason(censoredWhy: readonly string[], notApplicableWhy: readonly string[]): string {
  if (censoredWhy.length > 0) {
    return censoredWhy[0] as string;
  }
  if (notApplicableWhy.length > 0) {
    return notApplicableWhy[0] as string;
  }
  return "no reason was recorded";
}

/**
 * The addressable unit under a ledger row.
 *
 * A ledger row is a CELL — one axis value aggregated over that cell's seeds — and a cell has no
 * seed, so it cannot be rebuilt and cannot be played back. A run can. Cells are computed from
 * runs at render time and never stored.
 */
export interface RunKey {
  readonly axisIndex: number;
  readonly axisValue: number;
  readonly seedIndex: number;
}

export interface RunRow {
  readonly kind: "runRow";
  readonly key: RunKey;
  readonly readings: Readonly<Partial<Record<ColumnKey, Reading>>>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/job/__tests__/aggregate-readings.test.ts`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add web/engine/job/stats.ts web/engine/job/__tests__/aggregate-readings.test.ts
git commit -m "Aggregate a cell without letting a censored run hide inside the average"
```

---

### Task 14: The axis catalogue, and the test that drags every dial

**Files:**
- Create: `web/engine/job/axes.ts`
- Create: `web/engine/job/__tests__/axes.slow.test.ts`
- Test: `web/engine/job/__tests__/axes.slow.test.ts`

**Interfaces:**
- Consumes: `RunConfigOverrides`, `makeRunConfig`, `DEFAULT_CONFIG` (`web/engine/contracts/config.js`); `ColumnKey`, `UnitKey` (Task 11); `MeasurementParams` (Task 10).
- Produces: `AxisKey`, `AxisCommon`, `WorldAxis`, `MeasurementAxis`, `AxisEntry`, `AXES`, `AXIS_ORDER`. Task 15's `configForCell`/`paramsForCell` look entries up by key; the control panel and the sweep-axis picker are both generated from this one table.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/axes.slow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeRunConfig, type RunConfigOverrides } from "../../contracts/config.js";
import { runPair } from "../../sim/run.js";
import { COLUMNS, type ColumnKey } from "../columns.js";
import { AXES, AXIS_ORDER, type AxisEntry } from "../axes.js";
import { buildContext, runReport, type MeasurementParams } from "../report.js";

/**
 * SLOW ON PURPOSE: about 200 paired runs, roughly ten to twenty seconds.
 *
 * Do not speed this up by lowering `nTicks`. A shorter episode gives the crowd less room to
 * respond, so a genuinely real axis moves its readout less; the difference stops clearing the
 * seed noise, the test goes red for an entirely good reason, and the natural repair is to loosen
 * the threshold until it passes again. That is exactly the move that would have destroyed the
 * placebo gate. If this is too slow, cut the number of AXES you are checking in a local run, not
 * the length of the episode.
 *
 * The comparison is PAIRED and the threshold is the standard error of the paired difference, not
 * the run-to-run band. The band is the unpaired spread between two runs of the same room; both
 * endpoints here share their seeds, so that spread is exactly the thing the pairing removes.
 * Judging a paired difference against an unpaired floor is the confounded comparison this whole
 * console exists to teach against.
 */

const SEED_INDICES = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const BASE_SEED = 20260816;
const SEED_STRIDE = 7919;

const BASE_PARAMS: MeasurementParams = Object.freeze({
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.25,
  recoveryDwellSteps: 20,
});

/** Every dotted leaf of a config, so a diff can name the fields an axis actually wrote. */
function flatten(value: unknown, prefix: string, out: Map<string, string>): void {
  if (value === null || typeof value !== "object") {
    out.set(prefix, JSON.stringify(value));
    return;
  }
  if (Array.isArray(value)) {
    out.set(prefix, JSON.stringify(value));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = prefix === "" ? key : `${prefix}.${key}`;
    flatten(child, next, out);
  }
}

function changedPaths(before: RunConfigOverrides, after: RunConfigOverrides): string[] {
  const a = new Map<string, string>();
  const b = new Map<string, string>();
  flatten(makeRunConfig(before), "", a);
  flatten(makeRunConfig(after), "", b);
  const changed: string[] = [];
  for (const [path, value] of b) {
    if (a.get(path) !== value) {
      changed.push(path);
    }
  }
  return changed.sort();
}

function stepsOf(axis: AxisEntry): number[] {
  const values: number[] = [];
  let index = 0;
  for (;;) {
    const value = axis.min + index * axis.step;
    if (value > axis.max + 1e-9) {
      break;
    }
    values.push(value);
    index++;
    if (index > 5000) {
      throw new Error(`axis '${axis.key}' has an implausible number of steps`);
    }
  }
  if (values[values.length - 1] !== axis.max) {
    values.push(axis.max);
  }
  return values;
}

function columnAt(
  axis: AxisEntry,
  value: number,
  seedIndex: number,
  key: ColumnKey,
): number {
  let overrides: RunConfigOverrides = {};
  let params = BASE_PARAMS;
  if (axis.kind === "worldAxis") {
    overrides = axis.apply({}, value);
  } else {
    params = axis.apply(BASE_PARAMS, value);
  }
  const config = makeRunConfig({ ...overrides, seed: BASE_SEED + seedIndex * SEED_STRIDE });
  const run = runPair(config);
  const context = buildContext({
    config,
    params,
    run,
    band: null,
    floor: null,
    zeroRun: null,
    frechetMeanM: null,
  });
  const reading = runReport(context, [key])[key];
  if (reading === undefined || reading.availability.kind !== "measured") {
    throw new Error(`axis '${axis.key}' produced no measured '${key}' at value ${value}`);
  }
  return reading.value;
}

describe("the axis catalogue", () => {
  it("orders every key exactly once and names each one in English", () => {
    const keys = Object.keys(AXES);
    expect([...AXIS_ORDER].sort()).toEqual([...keys].sort());
    for (const key of AXIS_ORDER) {
      const axis = AXES[key];
      expect(axis.key).toBe(key);
      expect(axis.label.length).toBeGreaterThan(3);
      expect(axis.label).not.toMatch(/\b[a-z]+[A-Z][A-Za-z]*\b/);
      expect(axis.note.length).toBeGreaterThan(20);
      expect(axis.unit.length).toBeGreaterThan(0);
      expect(axis.movesColumns.length).toBeGreaterThan(0);
      expect(axis.min).toBeLessThan(axis.max);
      expect(axis.step).toBeGreaterThan(0);
      expect(axis.defaultValue).toBeGreaterThanOrEqual(axis.min);
      expect(axis.defaultValue).toBeLessThanOrEqual(axis.max);
      for (const column of axis.movesColumns) {
        expect(COLUMNS[column]).toBeDefined();
      }
    }
  });

  it("produces a legal setting at the bottom, the top and every notch between", () => {
    for (const key of AXIS_ORDER) {
      const axis = AXES[key];
      for (const value of stepsOf(axis)) {
        if (axis.kind === "worldAxis") {
          expect(() => makeRunConfig(axis.apply({}, value))).not.toThrow();
        } else {
          const params = axis.apply(BASE_PARAMS, value);
          expect(Number.isInteger(params.forecastHorizonSteps)).toBe(true);
          expect(Number.isInteger(params.forecastEndStep)).toBe(true);
          expect(params.forecastHorizonSteps).toBeGreaterThan(0);
          expect(params.forecastEndStep).toBeGreaterThan(params.forecastHorizonSteps);
          expect(params.forecastEndStep).toBeLessThanOrEqual(makeRunConfig().nTicks);
        }
      }
    }
  });

  it("writes exactly the fields it says it writes", () => {
    for (const key of AXIS_ORDER) {
      const axis = AXES[key];
      if (axis.kind !== "worldAxis") {
        continue;
      }
      // At the top of its range, so an axis whose default IS its minimum still shows a diff.
      const changed = changedPaths({}, axis.apply({}, axis.max));
      expect(changed).toEqual([...axis.writes].sort());
    }
  });

  it("moves each declared readout by more than the paired seed noise", { timeout: 180_000 }, () => {
    for (const key of AXIS_ORDER) {
      const axis = AXES[key];
      for (const column of axis.movesColumns) {
        const differences: number[] = [];
        for (const seedIndex of SEED_INDICES) {
          const low = columnAt(axis, axis.min, seedIndex, column);
          const high = columnAt(axis, axis.max, seedIndex, column);
          differences.push(high - low);
        }
        let total = 0;
        for (const difference of differences) {
          total += difference;
        }
        const meanDifference = total / differences.length;
        let squared = 0;
        for (const difference of differences) {
          squared += (difference - meanDifference) ** 2;
        }
        const sd = Math.sqrt(squared / (differences.length - 1));
        const standardError = sd / Math.sqrt(differences.length);
        expect(Math.abs(meanDifference)).toBeGreaterThan(2 * standardError);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/job/__tests__/axes.slow.test.ts`
Expected: FAIL with `Failed to resolve import "../axes.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/engine/job/axes.ts`:

```ts
import { DEFAULT_CONFIG, type RunConfigOverrides } from "../contracts/config.js";
import type { ColumnKey, UnitKey } from "./columns.js";
import type { MeasurementParams } from "./report.js";

/**
 * The closed axis catalogue: one table behind both the control panel and the sweep picker.
 *
 * A closed catalogue is not a registry. There is no `registerAxis`, nothing is added at runtime,
 * and an axis cannot be built from a config path supplied by a caller. It is a table so a test
 * can iterate it and prove the set is total, and so the label, unit, range and behaviour of one
 * knob live in one place instead of drifting across a switch and a template.
 *
 * `apply` is a function and functions do not survive `postMessage`, so a job carries the axis KEY
 * and the worker looks the entry up in its own copy of this module. One table, no serialised
 * behaviour.
 *
 * The `worldAxis` / `measurementAxis` split is a correctness statement, not an optimisation: a
 * measurement axis changes only how a ruler is applied to a run that already happened. Re-running
 * the simulation for it would be wrong as well as slow, because the point is that the robot has
 * not changed.
 */

export type AxisKey =
  | "pushStrength"
  | "crowdSize"
  | "holdingLine"
  | "crowdFidget"
  | "walkingPace"
  | "robotSpeed"
  | "reactionTime"
  | "politeness"
  | "perceptionError"
  | "passingOffset"
  | "episodeSeconds"
  | "forecastHorizon"
  | "forecastWindowEnd";

interface AxisCommon {
  readonly key: AxisKey;
  readonly label: string;
  readonly unit: UnitKey;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  readonly note: string;
  /** Dotted config paths this axis writes. A test diffs the produced config against it. */
  readonly writes: readonly string[];
  /** The readouts this axis was MEASURED to move, not the ones it sounds like it should. */
  readonly movesColumns: readonly ColumnKey[];
}

export interface WorldAxis extends AxisCommon {
  readonly kind: "worldAxis";
  readonly apply: (base: RunConfigOverrides, value: number) => RunConfigOverrides;
}

export interface MeasurementAxis extends AxisCommon {
  readonly kind: "measurementAxis";
  readonly apply: (params: MeasurementParams, value: number) => MeasurementParams;
}

export type AxisEntry = WorldAxis | MeasurementAxis;

/** The centre line the robot crosses on, which `passingOffset` walks it away from. */
const CENTRE_LINE_Y = 6.5;

export const AXES: Readonly<Record<AxisKey, AxisEntry>> = Object.freeze({
  pushStrength: Object.freeze({
    kind: "worldAxis" as const,
    key: "pushStrength" as const,
    label: "How much space the robot demands",
    unit: "ratio" as const,
    min: 0,
    max: 3,
    step: 0.25,
    defaultValue: 1,
    note: "At zero the robot is socially invisible: people walk as if it were not there, and the effect on them is exactly nothing.",
    writes: Object.freeze(["robot.repulsionScale"]),
    movesColumns: Object.freeze(["trueEffectM", "worstMomentM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      robot: { ...(base.robot ?? {}), repulsionScale: value },
    }),
  }),

  crowdSize: Object.freeze({
    kind: "worldAxis" as const,
    key: "crowdSize" as const,
    label: "How many people are in the room",
    unit: "people" as const,
    min: 4,
    max: 44,
    step: 1,
    defaultValue: 18,
    note: "A fuller room gives the robot more to push against, and it also makes two runs of the same room differ more, so both the reading and the floor it is judged against move together.",
    writes: Object.freeze(["crowd.nPedestrians"]),
    movesColumns: Object.freeze(["trueEffectM", "forecastReportM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      crowd: { ...(base.crowd ?? {}), nPedestrians: Math.round(value) },
    }),
  }),

  holdingLine: Object.freeze({
    kind: "worldAxis" as const,
    key: "holdingLine" as const,
    label: "How stubbornly people hold their line",
    unit: "seconds" as const,
    min: 0.2,
    max: 1.5,
    step: 0.05,
    defaultValue: 0.5,
    note: "How long a person takes to get back to the speed and direction they wanted. Larger values mean they give way more slowly and recover more slowly.",
    writes: Object.freeze(["crowd.relaxationTimeS"]),
    movesColumns: Object.freeze(["trueEffectM", "worstMomentM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      crowd: { ...(base.crowd ?? {}), relaxationTimeS: value },
    }),
  }),

  crowdFidget: Object.freeze({
    kind: "worldAxis" as const,
    key: "crowdFidget" as const,
    label: "Random wobble",
    unit: "none" as const,
    min: 0,
    max: 3,
    step: 0.1,
    defaultValue: 1.1,
    note: "How much people wander for no reason at all. It barely touches what the robot actually did, and it moves what a forecaster reports, which is the point.",
    writes: Object.freeze(["crowd.noiseAmplitude"]),
    movesColumns: Object.freeze(["forecastReportM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      crowd: { ...(base.crowd ?? {}), noiseAmplitude: value },
    }),
  }),

  walkingPace: Object.freeze({
    kind: "worldAxis" as const,
    key: "walkingPace" as const,
    label: "How fast people want to walk",
    unit: "none" as const,
    min: 0.4,
    max: 2,
    step: 0.05,
    defaultValue: 1.34,
    note: "In metres per second. It is not monotone: the effect peaks around a strolling pace, so a sentence claiming faster always means more would be false at one end of this dial.",
    writes: Object.freeze(["crowd.desiredSpeed"]),
    movesColumns: Object.freeze(["trueEffectM", "forecastReportM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      crowd: { ...(base.crowd ?? {}), desiredSpeed: value },
    }),
  }),

  robotSpeed: Object.freeze({
    kind: "worldAxis" as const,
    key: "robotSpeed" as const,
    label: "How fast the robot may go",
    unit: "none" as const,
    min: 0.2,
    max: 1.8,
    step: 0.05,
    defaultValue: 1.1,
    note: "In metres per second. A slow robot barely gets across the room in the time available, which is why the distance it covers moves far more than the effect it has.",
    writes: Object.freeze(["robot.maxSpeed"]),
    movesColumns: Object.freeze(["robotPathM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      robot: { ...(base.robot ?? {}), maxSpeed: value },
    }),
  }),

  reactionTime: Object.freeze({
    kind: "worldAxis" as const,
    key: "reactionTime" as const,
    label: "How slowly the robot changes its mind",
    unit: "seconds" as const,
    min: 0.05,
    max: 1,
    step: 0.05,
    defaultValue: 0.15,
    note: "A sluggish robot commits to a heading and carries it further, which lengthens its route and brings it closer to people. It leaves the crowd's overall displacement almost untouched.",
    writes: Object.freeze(["robot.reactionTimeS"]),
    movesColumns: Object.freeze(["robotPathM", "minClearanceM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      robot: { ...(base.robot ?? {}), reactionTimeS: value },
    }),
  }),

  politeness: Object.freeze({
    kind: "worldAxis" as const,
    key: "politeness" as const,
    label: "How hard the robot tries to go around",
    unit: "none" as const,
    min: 0,
    max: 6,
    step: 0.25,
    defaultValue: 0,
    note: "It buys a longer route, and at the top of this dial the robot may wander so much that it never reaches its goal at all, which is reported as not having arrived rather than as a time.",
    writes: Object.freeze(["robot.deflectionWeight"]),
    movesColumns: Object.freeze(["robotPathM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      robot: { ...(base.robot ?? {}), deflectionWeight: value },
    }),
  }),

  perceptionError: Object.freeze({
    kind: "worldAxis" as const,
    key: "perceptionError" as const,
    label: "How badly the robot mis-sees people",
    unit: "metres" as const,
    min: 0,
    max: 0.8,
    step: 0.05,
    defaultValue: 0,
    note: "Error here does not make the robot bump into anyone. It makes it swerve away from people who are not there, which brings it closer to the ones who are.",
    writes: Object.freeze(["perception.positionSigmaM"]),
    movesColumns: Object.freeze(["minClearanceM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      perception: { ...(base.perception ?? {}), positionSigmaM: value },
    }),
  }),

  passingOffset: Object.freeze({
    kind: "worldAxis" as const,
    key: "passingOffset" as const,
    label: "How wide a berth the robot takes",
    unit: "metres" as const,
    min: 0,
    max: 3,
    step: 0.25,
    defaultValue: 0,
    note: "How far off the middle of the room the robot's whole crossing is shifted. It moves the start and the goal together, because exposing four raw coordinates is the fastest way to put a goal outside the wall.",
    writes: Object.freeze(["robot.goalXY", "robot.startXY"]),
    movesColumns: Object.freeze(["worstMomentM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => ({
      ...base,
      robot: {
        ...(base.robot ?? {}),
        startXY: [DEFAULT_CONFIG.robot.startXY[0], CENTRE_LINE_Y - value],
        goalXY: [DEFAULT_CONFIG.robot.goalXY[0], CENTRE_LINE_Y - value],
      },
    }),
  }),

  episodeSeconds: Object.freeze({
    kind: "worldAxis" as const,
    key: "episodeSeconds" as const,
    label: "How long the episode runs",
    unit: "seconds" as const,
    min: 10,
    max: 80,
    step: 5,
    defaultValue: 40,
    note: "A short episode ends before the robot has crossed the room. It is also the fastest way to make a worst-moment reading look smaller without changing the physics at all.",
    writes: Object.freeze(["nTicks"]),
    movesColumns: Object.freeze(["robotPathM"] as ColumnKey[]),
    apply: (base: RunConfigOverrides, value: number): RunConfigOverrides => {
      const dt = base.dt ?? DEFAULT_CONFIG.dt;
      return { ...base, nTicks: Math.round(value / dt) };
    },
  }),

  forecastHorizon: Object.freeze({
    kind: "measurementAxis" as const,
    key: "forecastHorizon" as const,
    label: "How far ahead the forecaster guesses",
    unit: "seconds" as const,
    min: 0.2,
    max: 3,
    step: 0.1,
    defaultValue: 3,
    note: "This changes only how the ruler is applied to a run that already happened. The robot has not changed, and re-running the room for it would be wrong as well as slow.",
    writes: Object.freeze(["forecastHorizonSteps"]),
    movesColumns: Object.freeze(["forecastReportM"] as ColumnKey[]),
    apply: (params: MeasurementParams, value: number): MeasurementParams => ({
      ...params,
      forecastHorizonSteps: Math.round(value / DEFAULT_CONFIG.dt),
    }),
  }),

  forecastWindowEnd: Object.freeze({
    kind: "measurementAxis" as const,
    key: "forecastWindowEnd" as const,
    label: "When the forecaster is checked",
    unit: "seconds" as const,
    min: 5,
    max: 40,
    step: 0.5,
    defaultValue: 10,
    note: "Late in the episode everyone has arrived and stopped, and a guess that a stationary person carries straight on is exactly right, so the forecaster reads almost nothing however bad it is.",
    writes: Object.freeze(["forecastEndStep"]),
    movesColumns: Object.freeze(["forecastReportM"] as ColumnKey[]),
    apply: (params: MeasurementParams, value: number): MeasurementParams => ({
      ...params,
      forecastEndStep: Math.round(value / DEFAULT_CONFIG.dt),
    }),
  }),
});

export const AXIS_ORDER: readonly AxisKey[] = Object.freeze([
  "crowdSize",
  "holdingLine",
  "walkingPace",
  "crowdFidget",
  "pushStrength",
  "robotSpeed",
  "reactionTime",
  "politeness",
  "perceptionError",
  "passingOffset",
  "episodeSeconds",
  "forecastHorizon",
  "forecastWindowEnd",
] as const);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/job/__tests__/axes.slow.test.ts`
Expected: 4 passing in roughly 10–20 s. The paired-difference margins measured on this machine, smallest first, are politeness on distance travelled at 1.73x the threshold, crowd fidget on the forecaster at 2.07x and passing offset on the worst moment at 2.04x; everything else clears by 3x or more. If any of them goes below 1.0 after a physics change, that is a real finding — write it down before touching the threshold.

- [ ] **Step 5: Commit**

```bash
git add web/engine/job/axes.ts web/engine/job/__tests__/axes.slow.test.ts
git commit -m "One table behind every knob, and a test that drags each one end to end"
```

---

### Task 15: `SweepJob`, and validating the whole grid before the first simulation

**Files:**
- Create: `web/engine/job/spec.ts`
- Create: `web/engine/job/__tests__/spec.test.ts`
- Test: `web/engine/job/__tests__/spec.test.ts`

**Interfaces:**
- Consumes: `AXES`, `AxisKey`, `AXIS_ORDER` (Task 14); `COLUMNS`, `ColumnKey` (Task 11); `MeasurementParams` (Task 10, re-exported here); `makeRunConfig`, `RunConfig`, `RunConfigOverrides`; `ContractError`, `fail`.
- Produces: `BASE_SEED`, `SEED_STRIDE`, `makeMeasurementParams`, `FloorParams`, `makeFloorParams`, `SweepJob`, `SweepJobInit`, `makeSweepJob`, `seedFor`, `configForCell`, `paramsForCell`. Task 16 and the worker protocol consume all of them.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/spec.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ContractError } from "../../core/errors.js";
import {
  BASE_SEED,
  SEED_STRIDE,
  configForCell,
  makeMeasurementParams,
  makeSweepJob,
  paramsForCell,
  seedFor,
  type SweepJobInit,
} from "../spec.js";

const PARAMS = makeMeasurementParams({
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.25,
  recoveryDwellSteps: 20,
});

function init(overrides: Partial<SweepJobInit> = {}): SweepJobInit {
  return {
    base: {},
    axis: "crowdSize",
    axisValues: [4, 18, 44],
    seedIndices: [0, 1],
    baseSeed: BASE_SEED,
    seedStride: SEED_STRIDE,
    measurement: PARAMS,
    columns: ["trueEffectM", "minClearanceM"],
    bandReplicates: { n: 8, scope: "perCell" },
    floor: null,
    zeroReferenceRun: true,
    frechet: false,
    ...overrides,
  };
}

describe("makeMeasurementParams", () => {
  it("refuses an end step that leaves no room to fit a velocity", () => {
    expect(() => makeMeasurementParams({ ...PARAMS, forecastEndStep: 60 })).toThrow(ContractError);
    expect(() => makeMeasurementParams({ ...PARAMS, forecastEndStep: 60 })).toThrow(
      /forecastEndStep must be greater than forecastHorizonSteps/,
    );
  });

  it("never defaults the end step", () => {
    // With no end step the forecaster is evaluated at the last tick, by which time everyone has
    // arrived and parked, a straight-line guess about a stationary person is exactly right, and
    // the console's second headline is a permanent zero.
    const missing = { ...PARAMS } as Record<string, unknown>;
    delete missing.forecastEndStep;
    expect(() => makeMeasurementParams(missing as never)).toThrow(/forecastEndStep/);
  });
});

describe("makeSweepJob", () => {
  it("freezes a job that survives structuredClone", () => {
    const job = makeSweepJob(init());
    const copy = structuredClone(job);
    expect(copy.kind).toBe("sweepJob");
    expect(copy.axisValues).toEqual([4, 18, 44]);
    expect(copy.seedIndices).toEqual([0, 1]);
    expect(Object.isFrozen(job)).toBe(true);
  });

  it("derives a seed from the index and never anywhere else", () => {
    const job = makeSweepJob(init());
    expect(seedFor(job, 0)).toBe(20260816);
    expect(seedFor(job, 3)).toBe(20260816 + 3 * 7919);
  });

  it("applies a world axis to the cell and leaves the ruler alone", () => {
    const job = makeSweepJob(init());
    expect(configForCell(job, 2, 1).crowd.nPedestrians).toBe(44);
    expect(configForCell(job, 2, 1).seed).toBe(seedFor(job, 1));
    expect(paramsForCell(job, 2).forecastHorizonSteps).toBe(60);
  });

  it("applies a measurement axis to the ruler and leaves the room alone", () => {
    const job = makeSweepJob(
      init({ axis: "forecastHorizon", axisValues: [0.2, 3] }),
    );
    expect(paramsForCell(job, 0).forecastHorizonSteps).toBe(4);
    expect(paramsForCell(job, 1).forecastHorizonSteps).toBe(60);
    expect(configForCell(job, 0, 0).crowd.nPedestrians).toBe(
      configForCell(job, 1, 0).crowd.nPedestrians,
    );
  });

  it("accepts the degenerate single run as one cell with one value", () => {
    const job = makeSweepJob(init({ axis: null, axisValues: [0], seedIndices: [0] }));
    expect(job.axis).toBeNull();
    expect(configForCell(job, 0, 0).crowd.nPedestrians).toBe(18);
  });

  it("refuses an axis value outside the axis's own range", () => {
    expect(() => makeSweepJob(init({ axisValues: [4, 400] }))).toThrow(
      /axis 'crowdSize' value 400 is outside its range of 4 to 44/,
    );
  });

  it("refuses a repeated seed index, because the denominator is read off the list", () => {
    expect(() => makeSweepJob(init({ seedIndices: [0, 0, 1] }))).toThrow(/repeated seed index 0/);
  });

  it("refuses a band of one replicate", () => {
    expect(() => makeSweepJob(init({ bandReplicates: { n: 1, scope: "perCell" } }))).toThrow(
      /at least 2 replicates/,
    );
  });

  it("names the cell when a config in the grid is illegal", () => {
    // A room 15 m wide leaves the default goal at x = 20 outside the wall.
    expect(() => makeSweepJob(init({ base: { widthM: 15 } }))).toThrow(
      /sweep cell 0 \(crowdSize = 4\), seed index 0: /,
    );
    expect(() => makeSweepJob(init({ base: { widthM: 15 } }))).toThrow(/must be inside the room/);
  });

  it("validates the whole grid before running anything", () => {
    // A 20 x 8 grid is 160 paired runs and about six seconds of simulation. Construction that
    // stays under a fifth of a second cannot have simulated any of them. Discovering an illegal
    // value forty seconds into a sweep teaches the operator that Run means "wait, then lose it".
    const values: number[] = [];
    for (let i = 0; i < 20; i++) {
      values.push(4 + i * 2);
    }
    const started = performance.now();
    expect(() =>
      makeSweepJob(
        init({ base: { widthM: 15 }, axisValues: values, seedIndices: [0, 1, 2, 3, 4, 5, 6, 7] }),
      ),
    ).toThrow(ContractError);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("refuses a column that is not in the catalogue", () => {
    const bogus = ["madeUpColumn"] as unknown as SweepJobInit["columns"];
    expect(() => makeSweepJob(init({ columns: bogus }))).toThrow(/'madeUpColumn' is not a column/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/job/__tests__/spec.test.ts`
Expected: FAIL with `Failed to resolve import "../spec.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/engine/job/spec.ts`:

```ts
import { makeRunConfig, type RunConfig, type RunConfigOverrides } from "../contracts/config.js";
import { ContractError, fail } from "../core/errors.js";
import { AXES, type AxisKey } from "./axes.js";
import { COLUMNS, type ColumnKey } from "./columns.js";
import type { MeasurementParams } from "./report.js";

export type { MeasurementParams } from "./report.js";

/** Seeds are derived, never stored per run: base + index * stride, and nowhere else. */
export const BASE_SEED = 20260816;
export const SEED_STRIDE = 7919;

export function makeMeasurementParams(init: {
  readonly forecastHorizonSteps: number;
  readonly forecastEndStep: number;
  readonly nearMissThresholdM: number;
  readonly recoveryToleranceFraction: number;
  readonly recoveryDwellSteps: number;
}): MeasurementParams {
  if (!Number.isInteger(init.forecastHorizonSteps) || init.forecastHorizonSteps < 1) {
    fail(
      `MeasurementParams.forecastHorizonSteps must be a positive whole number of steps, got ` +
        `${init.forecastHorizonSteps}`,
    );
  }
  // Required and never defaulted. Left to default, the forecaster is checked at the last tick,
  // where everyone has arrived and stopped and a straight-line guess about a stationary person is
  // exactly right, so it reads 0.0000 however bad it actually is.
  if (!Number.isInteger(init.forecastEndStep) || init.forecastEndStep < 1) {
    fail(
      `MeasurementParams.forecastEndStep must be a positive whole number of steps and is never ` +
        `defaulted, got ${init.forecastEndStep}`,
    );
  }
  if (init.forecastEndStep <= init.forecastHorizonSteps) {
    fail(
      `MeasurementParams.forecastEndStep must be greater than forecastHorizonSteps, or there is ` +
        `no room before it to fit a velocity; got ${init.forecastEndStep} against a horizon of ` +
        `${init.forecastHorizonSteps}`,
    );
  }
  if (!(init.nearMissThresholdM > 0)) {
    fail(`MeasurementParams.nearMissThresholdM must be > 0, got ${init.nearMissThresholdM}`);
  }
  if (!(init.recoveryToleranceFraction > 0) || init.recoveryToleranceFraction >= 1) {
    fail(
      `MeasurementParams.recoveryToleranceFraction must be between 0 and 1, got ` +
        `${init.recoveryToleranceFraction}`,
    );
  }
  if (!Number.isInteger(init.recoveryDwellSteps) || init.recoveryDwellSteps < 1) {
    fail(`MeasurementParams.recoveryDwellSteps must be a positive integer, got ${init.recoveryDwellSteps}`);
  }
  return Object.freeze({
    kind: "measurementParams" as const,
    forecastHorizonSteps: init.forecastHorizonSteps,
    forecastEndStep: init.forecastEndStep,
    nearMissThresholdM: init.nearMissThresholdM,
    recoveryToleranceFraction: init.recoveryToleranceFraction,
    recoveryDwellSteps: init.recoveryDwellSteps,
  });
}

export interface FloorParams {
  readonly kind: "floorParams";
  readonly nSplits: number;
  readonly alpha: number;
  readonly strideSteps: number;
  readonly permutationSeed: number;
}

export function makeFloorParams(init: {
  readonly nSplits: number;
  readonly alpha: number;
  readonly strideSteps: number;
  readonly permutationSeed: number;
}): FloorParams {
  if (!Number.isInteger(init.nSplits) || init.nSplits < 1) {
    fail(`FloorParams.nSplits must be a positive integer, got ${init.nSplits}`);
  }
  if (!(init.alpha > 0) || init.alpha >= 1) {
    fail(`FloorParams.alpha must be between 0 and 1, got ${init.alpha}`);
  }
  if (!Number.isInteger(init.strideSteps) || init.strideSteps < 1) {
    fail(`FloorParams.strideSteps must be a positive integer, got ${init.strideSteps}`);
  }
  if (!Number.isInteger(init.permutationSeed)) {
    fail(`FloorParams.permutationSeed must be an integer, got ${init.permutationSeed}`);
  }
  return Object.freeze({
    kind: "floorParams" as const,
    nSplits: init.nSplits,
    alpha: init.alpha,
    strideSteps: init.strideSteps,
    permutationSeed: init.permutationSeed,
  });
}

export interface BandReplicates {
  readonly n: number;
  /**
   * `perSeed` measures a band for every seed and averages them, which is what the research script
   * did. `perCell` measures one band per axis value. They differ by about six per cent, so the
   * count and the scope ride on the cell and into the export rather than being assumed.
   */
  readonly scope: "perSeed" | "perCell";
}

export interface SweepJob {
  readonly kind: "sweepJob";
  readonly base: RunConfigOverrides;
  /** null is the degenerate single run. */
  readonly axis: AxisKey | null;
  readonly axisValues: readonly number[];
  /** An explicit list, never a count. Every denominator is read off this and recomputed nowhere. */
  readonly seedIndices: readonly number[];
  readonly baseSeed: number;
  readonly seedStride: number;
  readonly measurement: MeasurementParams;
  readonly columns: readonly ColumnKey[];
  readonly bandReplicates: BandReplicates | null;
  readonly floor: FloorParams | null;
  readonly zeroReferenceRun: boolean;
  readonly frechet: boolean;
}

export interface SweepJobInit {
  readonly base: RunConfigOverrides;
  readonly axis: AxisKey | null;
  readonly axisValues: readonly number[];
  readonly seedIndices: readonly number[];
  readonly baseSeed: number;
  readonly seedStride: number;
  readonly measurement: MeasurementParams;
  readonly columns: readonly ColumnKey[];
  readonly bandReplicates: BandReplicates | null;
  readonly floor: FloorParams | null;
  readonly zeroReferenceRun: boolean;
  readonly frechet: boolean;
}

export function seedFor(job: SweepJob, seedIndex: number): number {
  return job.baseSeed + seedIndex * job.seedStride;
}

export function configForCell(job: SweepJob, cellIndex: number, seedIndex: number): RunConfig {
  const value = job.axisValues[cellIndex];
  if (value === undefined) {
    fail(`sweep cell ${cellIndex} does not exist; this job has ${job.axisValues.length} cells`);
  }
  let overrides: RunConfigOverrides = job.base;
  if (job.axis !== null) {
    const axis = AXES[job.axis];
    if (axis.kind === "worldAxis") {
      overrides = axis.apply(job.base, value);
    }
  }
  return makeRunConfig({ ...overrides, seed: seedFor(job, seedIndex) });
}

export function paramsForCell(job: SweepJob, cellIndex: number): MeasurementParams {
  const value = job.axisValues[cellIndex];
  if (value === undefined) {
    fail(`sweep cell ${cellIndex} does not exist; this job has ${job.axisValues.length} cells`);
  }
  if (job.axis === null) {
    return job.measurement;
  }
  const axis = AXES[job.axis];
  if (axis.kind !== "measurementAxis") {
    return job.measurement;
  }
  return makeMeasurementParams(axis.apply(job.measurement, value));
}

/**
 * Every cell and every seed is validated here, before a single tick is simulated.
 *
 * Building a config is microseconds, so a twenty-by-eight grid validates in well under a
 * millisecond. Discovering an illegal axis value forty seconds into a sweep teaches the operator
 * that pressing Run means "wait, then lose it".
 */
export function makeSweepJob(init: SweepJobInit): SweepJob {
  if (init.axisValues.length === 0) {
    fail("a sweep needs at least one axis value");
  }
  if (init.axis === null && init.axisValues.length !== 1) {
    fail(
      `a job with no axis is the single-run case and must carry exactly one axis value, got ` +
        `${init.axisValues.length}`,
    );
  }
  if (init.axis !== null) {
    const axis = AXES[init.axis];
    for (const value of init.axisValues) {
      if (!Number.isFinite(value)) {
        fail(`axis '${init.axis}' was given a value of ${value}, which is not a number`);
      }
      if (value < axis.min || value > axis.max) {
        fail(
          `axis '${axis.key}' value ${value} is outside its range of ${axis.min} to ${axis.max}`,
        );
      }
    }
  }

  if (init.seedIndices.length === 0) {
    fail("a sweep needs at least one seed index");
  }
  const seenSeeds = new Set<number>();
  for (const seedIndex of init.seedIndices) {
    if (!Number.isInteger(seedIndex) || seedIndex < 0) {
      fail(`seed index must be a non-negative integer, got ${seedIndex}`);
    }
    if (seenSeeds.has(seedIndex)) {
      fail(
        `repeated seed index ${seedIndex}; every count on screen is read off this list, so a ` +
          `duplicate would report more runs than were made`,
      );
    }
    seenSeeds.add(seedIndex);
  }

  if (!Number.isInteger(init.baseSeed)) {
    fail(`baseSeed must be an integer, got ${init.baseSeed}`);
  }
  if (!Number.isInteger(init.seedStride) || init.seedStride < 1) {
    fail(`seedStride must be a positive integer, got ${init.seedStride}`);
  }

  if (init.columns.length === 0) {
    fail("a sweep needs at least one column to report");
  }
  for (const column of init.columns) {
    if (COLUMNS[column] === undefined) {
      fail(`'${String(column)}' is not a column; the catalogue in columns.ts is closed`);
    }
  }

  if (init.bandReplicates !== null) {
    if (!Number.isInteger(init.bandReplicates.n) || init.bandReplicates.n < 2) {
      fail(
        `the run-to-run band needs at least 2 replicates to have a pair to compare, got ` +
          `${init.bandReplicates.n}`,
      );
    }
    if (init.bandReplicates.scope !== "perSeed" && init.bandReplicates.scope !== "perCell") {
      fail(`band scope must be 'perSeed' or 'perCell', got '${String(init.bandReplicates.scope)}'`);
    }
  }

  const job: SweepJob = Object.freeze({
    kind: "sweepJob" as const,
    base: init.base,
    axis: init.axis,
    axisValues: Object.freeze([...init.axisValues]),
    seedIndices: Object.freeze([...init.seedIndices]),
    baseSeed: init.baseSeed,
    seedStride: init.seedStride,
    measurement: init.measurement,
    columns: Object.freeze([...init.columns]),
    bandReplicates: init.bandReplicates === null ? null : Object.freeze({ ...init.bandReplicates }),
    floor: init.floor,
    zeroReferenceRun: init.zeroReferenceRun,
    frechet: init.frechet,
  });

  for (let cellIndex = 0; cellIndex < job.axisValues.length; cellIndex++) {
    const axisValue = job.axisValues[cellIndex] as number;
    const label = job.axis === null ? "single run" : `${job.axis} = ${axisValue}`;
    try {
      paramsForCell(job, cellIndex);
    } catch (error) {
      throw wrapCell(cellIndex, label, -1, error);
    }
    for (const seedIndex of job.seedIndices) {
      try {
        configForCell(job, cellIndex, seedIndex);
      } catch (error) {
        throw wrapCell(cellIndex, label, seedIndex, error);
      }
    }
  }

  return job;
}

function wrapCell(cellIndex: number, label: string, seedIndex: number, error: unknown): Error {
  let detail = String(error);
  if (error instanceof Error) {
    detail = error.message;
  }
  const where = seedIndex < 0 ? "the ruler" : `seed index ${seedIndex}`;
  return new ContractError(`sweep cell ${cellIndex} (${label}), ${where}: ${detail}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/job/__tests__/spec.test.ts`
Then `npx tsc --noEmit`.
Expected: 12 passing.

- [ ] **Step 5: Commit**

```bash
git add web/engine/job/spec.ts web/engine/job/__tests__/spec.test.ts
git commit -m "Validate every cell of a sweep before simulating any of it"
```

---

### Task 16: `planSweep`, `sweepUnits`, `accumulate`, and the determinism gate

**Files:**
- Create: `web/engine/job/plan.ts`
- Create: `web/engine/job/runner.ts`
- Create: `web/engine/job/__tests__/determinism.test.ts`
- Test: `web/engine/job/__tests__/determinism.test.ts`

**Interfaces:**
- Consumes: `SweepJob`, `configForCell`, `paramsForCell`, `seedFor`, `makeMeasurementParams` (Task 15); `RunKey`, `RunRow`, `Aggregate`, `aggregate` (Task 13); `buildContext`, `runReport` (Tasks 9, 11); `ColumnKey`, `Reading` (Task 11); `runPair`, `makeRunConfig`; `replicateBand`; `splitHalfNull`, `seededPermutations`; `frechet`; `pairedAgents`.
- Produces: `Unit`, `WorkPlan`, `planSweep(job: SweepJob): WorkPlan`; `BandReading`, `UnitOutput`, `sweepUnits(job: SweepJob): Generator<UnitOutput, void, undefined>`, `accumulate(rows: readonly RunRow[], columns: readonly ColumnKey[]): ReadonlyMap<number, Readonly<Partial<Record<ColumnKey, Aggregate>>>>`. The worker shell pumps `sweepUnits` and posts each `UnitOutput`; the main thread calls the same `accumulate`.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/determinism.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runPair } from "../../sim/run.js";
import { accumulate, sweepUnits } from "../runner.js";
import { planSweep } from "../plan.js";
import {
  BASE_SEED,
  SEED_STRIDE,
  configForCell,
  makeMeasurementParams,
  makeSweepJob,
  type SweepJob,
} from "../spec.js";
import type { RunRow } from "../stats.js";

const PARAMS = makeMeasurementParams({
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.25,
  recoveryDwellSteps: 20,
});

function job(): SweepJob {
  return makeSweepJob({
    base: {},
    axis: "crowdSize",
    axisValues: [6, 12],
    seedIndices: [0, 1],
    baseSeed: BASE_SEED,
    seedStride: SEED_STRIDE,
    measurement: PARAMS,
    columns: ["trueEffectM", "worstMomentM", "robotPathM", "robotArrivalS", "minClearanceM"],
    bandReplicates: { n: 4, scope: "perCell" },
    floor: null,
    zeroReferenceRun: false,
    frechet: false,
  });
}

function collect(source: SweepJob): RunRow[] {
  const rows: RunRow[] = [];
  for (const output of sweepUnits(source)) {
    rows.push(output.row);
  }
  return rows;
}

/** First differing byte between two Float64Arrays, or -1. Determinism is compared as bytes. */
function firstDifferingByte(a: Float64Array, b: Float64Array): number {
  const left = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const right = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  if (left.length !== right.length) {
    return 0;
  }
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return i;
    }
  }
  return -1;
}

describe("planSweep", () => {
  it("counts one unit per cell per seed and buys one band per cell", () => {
    const plan = planSweep(job());
    expect(plan.units.length).toBe(4);
    expect(plan.unitsTotal).toBe(4);
    let bandUnits = 0;
    for (const unit of plan.units) {
      if (unit.needsBand) {
        bandUnits++;
      }
    }
    expect(bandUnits).toBe(2);
  });

  it("buys a band for every seed when the scope says so", () => {
    const perSeed = makeSweepJob({
      ...job(),
      bandReplicates: { n: 4, scope: "perSeed" },
    });
    let bandUnits = 0;
    for (const unit of planSweep(perSeed).units) {
      if (unit.needsBand) {
        bandUnits++;
      }
    }
    expect(bandUnits).toBe(4);
  });
});

describe("determinism", () => {
  it("gives byte-identical readings for the same job twice", () => {
    const first = collect(job());
    const second = collect(job());
    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i++) {
      const a = first[i] as RunRow;
      const b = second[i] as RunRow;
      expect(b.key).toEqual(a.key);
      for (const key of Object.keys(a.readings) as (keyof typeof a.readings)[]) {
        // toBe is Object.is, so NaN matches NaN and a value off by one bit does not.
        expect(b.readings[key]?.value).toBe(a.readings[key]?.value);
        expect(b.readings[key]?.availability.kind).toBe(a.readings[key]?.availability.kind);
      }
    }
  });

  it("rebuilds a run from its key as the same bytes the sweep measured", () => {
    // The worker returns numbers, never trajectories: a 72-run sweep of paths is about 33 MB and
    // its readings are about 90 KB. Playback re-simulates instead, which is only legal because
    // the rebuild is the same run down to the last bit. So it is asserted, not assumed.
    const source = job();
    const rows = collect(source);
    const row = rows[3] as RunRow;

    const duringTheSweep = runPair(configForCell(source, row.key.axisIndex, row.key.seedIndex));
    const rebuiltFromTheKey = runPair(
      configForCell(source, row.key.axisIndex, row.key.seedIndex),
    );

    expect(rebuiltFromTheKey.treated.positions.length).toBe(
      duringTheSweep.treated.positions.length,
    );
    for (let i = 0; i < duringTheSweep.treated.positions.length; i++) {
      const a = duringTheSweep.treated.positions[i] as Float64Array;
      const b = rebuiltFromTheKey.treated.positions[i] as Float64Array;
      expect(firstDifferingByte(a, b)).toBe(-1);
    }
    const robotA = duringTheSweep.treated.robotPositions as Float64Array;
    const robotB = rebuiltFromTheKey.treated.robotPositions as Float64Array;
    expect(firstDifferingByte(robotA, robotB)).toBe(-1);
    expect(rebuiltFromTheKey.treated.arrivedTick).toBe(duringTheSweep.treated.arrivedTick);
  });

  it("keys every row to the cell it came from", () => {
    const rows = collect(job());
    expect(rows[0]?.key).toEqual({ axisIndex: 0, axisValue: 6, seedIndex: 0 });
    expect(rows[3]?.key).toEqual({ axisIndex: 1, axisValue: 12, seedIndex: 1 });
  });
});

describe("accumulate", () => {
  it("aggregates a cell from its runs and counts what stood behind it", () => {
    const source = job();
    const rows = collect(source);
    const cells = accumulate(rows, source.columns);
    expect(cells.size).toBe(2);
    const firstCell = cells.get(0);
    expect(firstCell?.trueEffectM?.nAttempted).toBe(2);
    expect(firstCell?.trueEffectM?.nUsed).toBe(2);
    expect(firstCell?.trueEffectM?.reason.kind).toBe("measured");
    expect(Number.isFinite(firstCell?.trueEffectM?.value as number)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/job/__tests__/determinism.test.ts`
Expected: FAIL with `Failed to resolve import "../runner.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/engine/job/plan.ts`:

```ts
import type { SweepJob } from "./spec.js";
import type { RunKey } from "./stats.js";

/**
 * One unit of work is one paired run, plus whatever extras that run has been asked to buy.
 *
 * The plan is computed up front so the progress rule has a real denominator rather than a guess,
 * and so the cost of switching the band on can be shown beside the switch before it is pressed.
 */
export interface Unit {
  readonly kind: "unit";
  readonly key: RunKey;
  readonly cellIndex: number;
  readonly needsBand: boolean;
  readonly needsFloor: boolean;
  readonly needsZeroRun: boolean;
  readonly needsFrechet: boolean;
}

export interface WorkPlan {
  readonly kind: "workPlan";
  readonly units: readonly Unit[];
  readonly unitsTotal: number;
}

export function planSweep(job: SweepJob): WorkPlan {
  const units: Unit[] = [];
  const firstSeedIndex = job.seedIndices[0] as number;
  for (let cellIndex = 0; cellIndex < job.axisValues.length; cellIndex++) {
    const axisValue = job.axisValues[cellIndex] as number;
    for (const seedIndex of job.seedIndices) {
      let needsBand = false;
      if (job.bandReplicates !== null) {
        // The band is measured per axis value, not once for the sweep. Crowd size genuinely moves
        // it, so one band drawn across a people-sweep is a false floor.
        if (job.bandReplicates.scope === "perSeed") {
          needsBand = true;
        } else {
          needsBand = seedIndex === firstSeedIndex;
        }
      }
      units.push(
        Object.freeze({
          kind: "unit" as const,
          key: Object.freeze({ axisIndex: cellIndex, axisValue, seedIndex }),
          cellIndex,
          needsBand,
          needsFloor: job.floor !== null,
          needsZeroRun: job.zeroReferenceRun,
          needsFrechet: job.frechet,
        }),
      );
    }
  }
  return Object.freeze({ kind: "workPlan" as const, units: Object.freeze(units), unitsTotal: units.length });
}
```

Create `web/engine/job/runner.ts`:

```ts
import { makeRunConfig } from "../contracts/config.js";
import { pairedAgents } from "../contracts/pairedRun.js";
import { frechet } from "../measure/divergence/index.js";
import { replicateBand, type RunToRunBand } from "../measure/null/band.js";
import { seededPermutations, splitHalfNull, type SplitHalfNull } from "../measure/null/splitHalf.js";
import { runPair, type RunResult } from "../sim/run.js";
import type { ColumnKey, Reading } from "./columns.js";
import { planSweep } from "./plan.js";
import { buildContext, runReport } from "./report.js";
import { configForCell, paramsForCell, type SweepJob } from "./spec.js";
import { aggregate, type Aggregate, type RunRow } from "./stats.js";

/**
 * What one finished unit hands back.
 *
 * Numbers only. A seventy-two-run sweep of trajectories is about 33 MB and its readings are about
 * 90 KB, and playback re-simulates the selected run from its key instead. That substitution is
 * legal only because the rebuild is bitwise identical, which `determinism.test.ts` asserts rather
 * than assumes.
 */
export interface BandReading {
  readonly axisIndex: number;
  readonly meanM: number;
  readonly peakM: number;
  readonly nReplicates: number;
}

export interface UnitOutput {
  readonly kind: "unitOutput";
  readonly row: RunRow;
  readonly band: BandReading | null;
}

export function* sweepUnits(job: SweepJob): Generator<UnitOutput, void, undefined> {
  const plan = planSweep(job);
  for (const unit of plan.units) {
    const config = configForCell(job, unit.cellIndex, unit.key.seedIndex);
    const params = paramsForCell(job, unit.cellIndex);
    const run = runPair(config);

    let band: RunToRunBand | null = null;
    let bandReading: BandReading | null = null;
    if (unit.needsBand && job.bandReplicates !== null) {
      band = replicateBand(config, job.bandReplicates.n);
      bandReading = {
        axisIndex: unit.key.axisIndex,
        meanM: band.value,
        peakM: band.peakValue,
        nReplicates: band.nReplicates,
      };
    }

    let floor: SplitHalfNull | null = null;
    if (unit.needsFloor && job.floor !== null) {
      floor = splitHalfNull(
        run.control.positions,
        job.floor.nSplits,
        seededPermutations(job.floor.permutationSeed),
        job.floor.alpha,
        job.floor.strideSteps,
      );
    }

    let zeroRun: RunResult | null = null;
    if (unit.needsZeroRun) {
      // The zero-effect reference is measured at THIS cell's own settings. The forecaster's zero
      // reading moves more than threefold from an empty room to a full one, so quoting one cell's
      // zero beside another cell's number is the same error already caught for the band.
      zeroRun = runPair(makeRunConfig({ ...config, pedestriansSeeRobot: false }));
    }

    let frechetMeanM: number | null = null;
    if (unit.needsFrechet) {
      frechetMeanM = meanFrechet(run);
    }

    const context = buildContext({
      config,
      params,
      run,
      band,
      floor,
      zeroRun,
      frechetMeanM,
    });
    const readings = runReport(context, job.columns);

    yield {
      kind: "unitOutput" as const,
      row: Object.freeze({ kind: "runRow" as const, key: unit.key, readings }),
      band: bandReading,
    };
  }
}

function meanFrechet(run: RunResult): number {
  const agents = pairedAgents(run.pair);
  let total = 0;
  for (const entry of agents) {
    total += frechet(entry[0].positions, entry[1].positions);
  }
  if (agents.length === 0) {
    return Number.NaN;
  }
  return total / agents.length;
}

/**
 * Cells from runs, on whichever thread is asking.
 *
 * The worker returns per-seed readings and the main thread aggregates them with this same
 * function, so the table and the export cannot disagree and a per-run export costs nothing.
 */
export function accumulate(
  rows: readonly RunRow[],
  columns: readonly ColumnKey[],
): ReadonlyMap<number, Readonly<Partial<Record<ColumnKey, Aggregate>>>> {
  const byCell = new Map<number, RunRow[]>();
  for (const row of rows) {
    const existing = byCell.get(row.key.axisIndex);
    if (existing === undefined) {
      byCell.set(row.key.axisIndex, [row]);
    } else {
      existing.push(row);
    }
  }

  const out = new Map<number, Readonly<Partial<Record<ColumnKey, Aggregate>>>>();
  for (const [axisIndex, cellRows] of byCell) {
    const cell: Partial<Record<ColumnKey, Aggregate>> = {};
    for (const column of columns) {
      const readings: Reading[] = [];
      for (const row of cellRows) {
        const reading = row.readings[column];
        if (reading !== undefined) {
          readings.push(reading);
        }
      }
      if (readings.length > 0) {
        cell[column] = aggregate(readings);
      }
    }
    out.set(axisIndex, Object.freeze(cell));
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/engine/job/__tests__/determinism.test.ts`
Then the whole engine project and the typechecker: `npx vitest run --project engine && npx tsc --noEmit`
Expected: all green. Paste the vitest summary line into the commit review — never claim this passed without it.

- [ ] **Step 5: Commit**

```bash
git add web/engine/job/plan.ts web/engine/job/runner.ts web/engine/job/__tests__/determinism.test.ts
git commit -m "Run a sweep as numbers only, and prove a run rebuilt from its key is the same bytes"
```

---

### Task 17: Worker message protocol

**Files:**
- Create: `web/app/worker/protocol.ts`
- Test: `web/app/worker/__tests__/clone.test.ts`

**Interfaces:**
- Consumes: `makeSweepJob(init: SweepJobInit): SweepJob`, `BASE_SEED`, `SEED_STRIDE`, `type SweepJob`, `type MeasurementParams`, `type FloorParams` from `web/engine/job/spec.ts` (Task 14). `SweepJobInit` carries every `SweepJob` field except `kind`, mirroring `makePairedRun(init)` in `web/engine/contracts/pairedRun.ts:31`. Also `HEADLINE_COLUMNS` and `type ColumnKey` from `web/engine/job/columns.ts` (Task 11), and `type RunRow` from `web/engine/job/runner.ts` (Task 15).
- Produces: `web/app/worker/protocol.ts` exporting **types only** — `ToWorker`, `FromWorker`. Tasks 18, and the console Run handler in Tasks 21-29, import these and nothing else from this file.
- The `web/app/**/*.test.ts` glob in `vitest.workspace.ts:16` already matches `web/app/worker/__tests__/`, so the workspace file is **not** modified by any task in this slice. The `ui` project runs `environment: "node"` with no `setupFiles`, so `Math.random` is not banned here (that ban is the `engine` project's `web/engine/__tests__/setup.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// web/app/worker/__tests__/clone.test.ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BASE_SEED,
  SEED_STRIDE,
  makeSweepJob,
  type SweepJob,
} from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS, type ColumnKey } from "../../../engine/job/columns.js";

/**
 * The Worker boundary is a structural clone, not a function call.
 *
 * Section 4.2 of the design turns on this: `apply` is a function, functions throw
 * `DataCloneError` across `postMessage`, so the job carries an axis KEY and the worker looks the
 * entry up in its own copy of the table. This file is the thing that keeps that true. It asserts
 * both halves — every job we actually build survives the crossing, and a job that grew a function
 * member does not survive it quietly.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PROTOCOL_SOURCE = join(HERE, "..", "protocol.ts");

const MEASUREMENT = {
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.1,
  recoveryDwellSteps: 20,
};

const headline: ColumnKey[] = [];
for (const key of HEADLINE_COLUMNS) {
  headline.push(key);
}

const preview: SweepJob = makeSweepJob({
  base: { crowd: { nPedestrians: 18 } },
  axis: null,
  axisValues: [0],
  seedIndices: [0],
  baseSeed: BASE_SEED,
  seedStride: SEED_STRIDE,
  measurement: MEASUREMENT,
  columns: headline,
  bandReplicates: null,
  floor: null,
  zeroReferenceRun: true,
  frechet: false,
});

const worldSweep: SweepJob = makeSweepJob({
  base: { crowd: { noiseAmplitude: 1.1 }, robot: { maxSpeed: 1.1 } },
  axis: "crowdSize",
  axisValues: [4, 8, 12, 18, 24, 32, 44],
  seedIndices: [0, 1, 2, 3, 4, 5, 6, 7],
  baseSeed: BASE_SEED,
  seedStride: SEED_STRIDE,
  measurement: MEASUREMENT,
  columns: headline,
  bandReplicates: { n: 8, scope: "perCell" },
  floor: { kind: "floorParams", nSplits: 200, alpha: 0.05, strideSteps: 20, permutationSeed: BASE_SEED },
  zeroReferenceRun: true,
  frechet: true,
});

const measurementSweep: SweepJob = makeSweepJob({
  base: {},
  axis: "forecastHorizon",
  axisValues: [20, 40, 60, 80],
  seedIndices: [0, 1],
  baseSeed: BASE_SEED,
  seedStride: SEED_STRIDE,
  measurement: MEASUREMENT,
  columns: headline,
  bandReplicates: null,
  floor: null,
  zeroReferenceRun: false,
  frechet: false,
});

const jobs: readonly (readonly [string, SweepJob])[] = [
  ["the 1x1 preview", preview],
  ["a world-axis sweep with band, floor and Frechet", worldSweep],
  ["a measurement-axis sweep", measurementSweep],
];

describe("the worker boundary", () => {
  for (const [name, job] of jobs) {
    it(`carries ${name} across structuredClone unchanged`, () => {
      const clone = structuredClone(job);
      expect(clone).not.toBe(job);
      expect(clone).toEqual(job);
      // Bytes, not approximations. structuredClone preserves own-property insertion order, so a
      // field silently reordered or dropped shows up here as a string difference.
      expect(JSON.stringify(clone)).toBe(JSON.stringify(job));
    });
  }

  it("refuses a job that grew a function member, loudly", () => {
    const illegal = { ...structuredClone(worldSweep), apply: (value: number): number => value };
    let name = "nothing was thrown";
    try {
      structuredClone(illegal);
    } catch (error) {
      name = (error as { name?: string }).name ?? "an error with no name";
    }
    expect(name).toBe("DataCloneError");
  });

  it("holds message types and nothing else", () => {
    const source = readFileSync(PROTOCOL_SOURCE, "utf8");
    const valueExport = /^export (?!type |interface )/m;
    expect(valueExport.test(source)).toBe(false);
  });

  it("does not import the measurement layer", () => {
    const source = readFileSync(PROTOCOL_SOURCE, "utf8");
    const reachesIntoMeasure = /from\s+["'][^"']*engine\/measure/;
    expect(reachesIntoMeasure.test(source)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/app/worker/__tests__/clone.test.ts`
Expected: FAIL with `ENOENT: no such file or directory, open '/Users/sanjay/projects/ProjOTW/mirn/web/app/worker/protocol.ts'`

(The `import type` of the protocol is erased by `verbatimModuleSyntax`, so the file's absence is caught by `readFileSync`, not by module resolution. `npm run typecheck` is the other half of this file's gate.)

- [ ] **Step 3: Write minimal implementation**

```ts
// web/app/worker/protocol.ts
import type { SweepJob } from "../../engine/job/spec.js";
import type { RunRow } from "../../engine/job/runner.js";

/**
 * The two message unions that cross the Worker boundary, and nothing else.
 *
 * Types only, on purpose. A function on a message throws `DataCloneError` at `postMessage`, and
 * the design's answer (section 4.2) is that behaviour never crosses: the job carries an axis key
 * and the worker looks the entry up in its own copy of `web/engine/job/axes.ts`. A helper defined
 * here would be a place for that rule to start leaking, so there is no helper.
 *
 * This file must not import `web/engine/measure/`. The worker's arithmetic lives behind
 * `web/engine/job/runner.ts`; a protocol that could measure something would invite a second
 * implementation of the numbers.
 *
 * `progress.phase` is a sentence a reader sees, so it is written in plain English by
 * `web/app/worker/pump.ts` and never carries a code identifier.
 */

export type ToWorker =
  | { readonly kind: "start"; readonly job: SweepJob }
  | { readonly kind: "cancel" };

export type FromWorker =
  | {
      readonly kind: "progress";
      readonly unitsDone: number;
      readonly unitsTotal: number;
      readonly phase: string;
    }
  | { readonly kind: "row"; readonly row: RunRow }
  | {
      readonly kind: "band";
      readonly axisIndex: number;
      readonly meanM: number;
      readonly peakM: number;
      readonly nReplicates: number;
    }
  | { readonly kind: "done" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly message: string };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/app/worker/__tests__/clone.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/app/worker/protocol.ts web/app/worker/__tests__/clone.test.ts
git commit -m "Give the worker a message contract, and prove behaviour cannot cross it"
```

---

### Task 18: The slice pump, the worker shell and the main-thread client

**Files:**
- Create: `web/app/worker/pump.ts`
- Create: `web/app/worker/sweep.worker.ts`
- Create: `web/app/worker/client.ts`
- Modify: `vite.config.ts:26-45` (add `worker: { format: "es" }` between `base: "./"` on line 28 and `build: {` on line 29)
- Test: `web/app/worker/__tests__/pump.test.ts`
- Test: `web/app/worker/__tests__/client.test.ts`

**Interfaces:**
- Consumes, from Task 15, exactly these signatures. **If Task 15's draft names them differently, this task's imports change, not Task 15's exports.**
  ```ts
  // web/engine/job/plan.ts
  export interface Unit { readonly kind: "unit"; readonly axisIndex: number;
    readonly seedIndex: number; readonly phase: "run" | "band" | "floor"; readonly costMs: number; }
  export interface WorkPlan { readonly kind: "workPlan"; readonly units: readonly Unit[];
    readonly totalCostMs: number; }
  export function planSweep(job: SweepJob): WorkPlan;
  // web/engine/job/runner.ts
  export type UnitOutcome =
    | { readonly kind: "row"; readonly row: RunRow }
    | { readonly kind: "band"; readonly axisIndex: number; readonly meanM: number;
        readonly peakM: number; readonly nReplicates: number };
  /** Yields exactly one outcome per plan unit, in plan order. */
  export function sweepUnits(job: SweepJob, plan: WorkPlan): Generator<UnitOutcome, void, void>;
  ```
  Also `configForCell(job, cellIndex, seedIndex): RunConfig` from `web/engine/job/spec.ts` (Task 14), `AXES` / `AXIS_ORDER` from `web/engine/job/axes.ts` (Task 12), `runPair(config, nowMs?)` returning `RunResult` from `web/engine/sim/run.ts:114`, `ContractError` and `fail` from `web/engine/core/errors.ts`, and `ToWorker` / `FromWorker` from Task 17.
- Produces:
  ```ts
  // web/app/worker/pump.ts
  export interface PumpPort { postMessage(message: FromWorker): void }
  export interface PumpDeps { readonly nowMs: () => number;
    readonly yieldToHost: () => Promise<void>; readonly isCancelled: () => boolean;
    readonly sliceBudgetMs: number }
  export function phraseFor(job: SweepJob, unit: Unit): string
  export async function pumpSweep(job: SweepJob, port: PumpPort, deps: PumpDeps): Promise<void>
  // web/app/worker/client.ts
  export interface SweepPort { postMessage(message: ToWorker): void;
    addEventListener(type: "message", handler: (event: { readonly data: FromWorker }) => void): void }
  export interface SweepHandlers { readonly onProgress: (unitsDone: number, unitsTotal: number, phase: string) => void;
    readonly onRow: (row: RunRow) => void;
    readonly onBand: (axisIndex: number, meanM: number, peakM: number, nReplicates: number) => void;
    readonly onDone: () => void; readonly onCancelled: () => void;
    readonly onFailed: (message: string) => void }
  export interface SweepClient { readonly kind: "sweepClient"; readonly start: (job: SweepJob) => void;
    readonly cancel: () => void; readonly isRunning: () => boolean;
    readonly recomputeForPlayback: (job: SweepJob, cellIndex: number, seedIndex: number) => RunResult }
  export function makeSweepClient(port: SweepPort, handlers: SweepHandlers): SweepClient
  export function sweepPortFor(worker: Worker): SweepPort
  export function spawnSweepWorker(): Worker
  ```
- **Deviation from the design's module map, stated rather than smuggled.** Section 3.1 lists three files in `web/app/worker/`. This task ships four. `sweep.worker.ts` registers a `message` handler at module scope, so importing it under `environment: "node"` is a `ReferenceError` on `self`; the alternatives are an environment sniff inside the worker or an untested pump. Splitting the pump into `pump.ts` leaves `sweep.worker.ts` as twenty lines of glue that no test imports and no test needs to.
- **How the worker is constructed under Vite:** `new Worker(new URL("./sweep.worker.ts", import.meta.url), { type: "module" })`, written exactly that way inside `spawnSweepWorker()`. Vite's static analysis matches that syntactic form and bundles the worker as its own chunk; a string path (`new Worker("/sweep.worker.js")`) builds green and 404s in production, so `client.test.ts` pins the literal. `vite.config.ts` gains `worker: { format: "es" }` because Vite's default worker output format is `iife`, which cannot serve a `{ type: "module" }` worker.
- **How it is tested without a real Worker:** `pump.test.ts` imports `pumpSweep` directly with `planSweep` and `sweepUnits` mocked, a fake clock and a fake yield, so the slice and cancel behaviour are deterministic and the test costs milliseconds. `client.test.ts` drives `makeSweepClient` through a hand-built `SweepPort` that records outgoing messages and lets the test deliver incoming ones. Verified in this repo that a module containing the `new Worker(new URL(...))` form imports cleanly under `vite-node` (the same transform pipeline vitest uses), so keeping `spawnSweepWorker` in `client.ts` does not break `client.test.ts`.

- [ ] **Step 1: Write the failing pump test**

```ts
// web/app/worker/__tests__/pump.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  BASE_SEED,
  SEED_STRIDE,
  makeSweepJob,
  type SweepJob,
} from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS, type ColumnKey } from "../../../engine/job/columns.js";
import type { FromWorker } from "../protocol.js";

/**
 * The pump is the only place that decides what a reader is told while they wait, and the only
 * place a cancel can land. Both are asserted here against a fake runner, so the test costs
 * milliseconds rather than the 4.8 s a real 72-run sweep costs.
 */

const { plannedUnits, outcomes, thrower } = vi.hoisted(() => ({
  plannedUnits: [] as {
    kind: "unit";
    axisIndex: number;
    seedIndex: number;
    phase: "run" | "band" | "floor";
    costMs: number;
  }[],
  outcomes: [] as unknown[],
  thrower: { message: null as string | null },
}));

vi.mock("../../../engine/job/plan.js", () => ({
  planSweep: () => ({ kind: "workPlan", units: plannedUnits, totalCostMs: 0 }),
}));

vi.mock("../../../engine/job/runner.js", () => ({
  sweepUnits: function* () {
    for (const outcome of outcomes) {
      if (thrower.message !== null) {
        throw new Error(thrower.message);
      }
      yield outcome;
    }
    if (thrower.message !== null) {
      throw new Error(thrower.message);
    }
  },
}));

import { phraseFor, pumpSweep, type PumpDeps, type PumpPort } from "../pump.js";

const headline: ColumnKey[] = [];
for (const key of HEADLINE_COLUMNS) {
  headline.push(key);
}

function jobWithAxis(axis: "crowdSize" | null): SweepJob {
  return makeSweepJob({
    base: {},
    axis,
    axisValues: axis === null ? [0] : [4, 18, 44],
    seedIndices: [0, 1],
    baseSeed: BASE_SEED,
    seedStride: SEED_STRIDE,
    measurement: {
      kind: "measurementParams",
      forecastHorizonSteps: 60,
      forecastEndStep: 200,
      nearMissThresholdM: 0.5,
      recoveryToleranceFraction: 0.1,
      recoveryDwellSteps: 20,
    },
    columns: headline,
    bandReplicates: null,
    floor: null,
    zeroReferenceRun: true,
    frechet: false,
  });
}

function reset(): void {
  plannedUnits.length = 0;
  outcomes.length = 0;
  thrower.message = null;
}

function recorder(): { readonly port: PumpPort; readonly sent: FromWorker[] } {
  const sent: FromWorker[] = [];
  const port: PumpPort = {
    postMessage: (message: FromWorker): void => {
      sent.push(message);
    },
  };
  return { port, sent };
}

function deps(overrides: Partial<PumpDeps>): PumpDeps {
  const base: PumpDeps = {
    nowMs: () => 0,
    yieldToHost: () => Promise.resolve(),
    isCancelled: () => false,
    sliceBudgetMs: 50,
  };
  return { ...base, ...overrides };
}

describe("the slice pump", () => {
  it("posts a row and a progress message for every unit, then done", async () => {
    reset();
    for (let index = 0; index < 3; index++) {
      plannedUnits.push({ kind: "unit", axisIndex: 0, seedIndex: index, phase: "run", costMs: 38 });
      outcomes.push({
        kind: "row",
        row: { kind: "runRow", key: { axisIndex: 0, axisValue: 18, seedIndex: index }, readings: {} },
      });
    }
    const { port, sent } = recorder();
    await pumpSweep(jobWithAxis(null), port, deps({}));

    const kinds: string[] = [];
    for (const message of sent) {
      kinds.push(message.kind);
    }
    expect(kinds).toEqual(["row", "progress", "row", "progress", "row", "progress", "done"]);

    const done: number[] = [];
    for (const message of sent) {
      if (message.kind === "progress") {
        done.push(message.unitsDone);
        expect(message.unitsTotal).toBe(3);
      }
    }
    expect(done).toEqual([1, 2, 3]);
  });

  it("posts a band message with its replicate count", async () => {
    reset();
    plannedUnits.push({ kind: "unit", axisIndex: 2, seedIndex: 0, phase: "band", costMs: 267 });
    outcomes.push({ kind: "band", axisIndex: 2, meanM: 0.29304, peakM: 0.51201, nReplicates: 8 });
    const { port, sent } = recorder();
    await pumpSweep(jobWithAxis("crowdSize"), port, deps({}));

    const first = sent[0];
    expect(first?.kind).toBe("band");
    if (first?.kind === "band") {
      expect(first.axisIndex).toBe(2);
      expect(first.meanM).toBe(0.29304);
      expect(first.peakM).toBe(0.51201);
      expect(first.nReplicates).toBe(8);
    }
  });

  it("stops between units when cancelled, and says so", async () => {
    reset();
    for (let index = 0; index < 4; index++) {
      plannedUnits.push({ kind: "unit", axisIndex: 0, seedIndex: index, phase: "run", costMs: 38 });
      outcomes.push({
        kind: "row",
        row: { kind: "runRow", key: { axisIndex: 0, axisValue: 18, seedIndex: index }, readings: {} },
      });
    }
    const { port, sent } = recorder();
    // Budget 0 forces a yield after every unit, which is where a cancel can land.
    await pumpSweep(jobWithAxis(null), port, deps({ sliceBudgetMs: 0, isCancelled: () => true }));

    let rows = 0;
    for (const message of sent) {
      if (message.kind === "row") {
        rows++;
      }
    }
    expect(rows).toBe(1);
    expect(sent[sent.length - 1]?.kind).toBe("cancelled");
    for (const message of sent) {
      expect(message.kind).not.toBe("done");
    }
  });

  it("reports a failure instead of dying silently", async () => {
    reset();
    plannedUnits.push({ kind: "unit", axisIndex: 0, seedIndex: 0, phase: "run", costMs: 38 });
    thrower.message = "the robot's goal is outside the room";
    const { port, sent } = recorder();
    await pumpSweep(jobWithAxis(null), port, deps({}));

    const last = sent[sent.length - 1];
    expect(last?.kind).toBe("failed");
    if (last?.kind === "failed") {
      expect(last.message).toBe("the robot's goal is outside the room");
    }
  });

  it("describes what it is doing in plain English", () => {
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    const phrases: string[] = [
      phraseFor(jobWithAxis(null), { kind: "unit", axisIndex: 0, seedIndex: 0, phase: "run", costMs: 38 }),
      phraseFor(jobWithAxis("crowdSize"), { kind: "unit", axisIndex: 1, seedIndex: 1, phase: "run", costMs: 38 }),
      phraseFor(jobWithAxis("crowdSize"), { kind: "unit", axisIndex: 2, seedIndex: 0, phase: "band", costMs: 267 }),
      phraseFor(jobWithAxis("crowdSize"), { kind: "unit", axisIndex: 0, seedIndex: 0, phase: "floor", costMs: 1500 }),
    ];
    for (const phrase of phrases) {
      expect(phrase.length).toBeGreaterThan(10);
      expect(identifier.test(phrase), `"${phrase}" carries a code identifier`).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the pump test to verify it fails**

Run: `npx vitest run web/app/worker/__tests__/pump.test.ts`
Expected: FAIL with `Failed to load url ../pump.js (resolved id: ../pump.js) in /Users/sanjay/projects/ProjOTW/mirn/web/app/worker/__tests__/pump.test.ts. Does the file exist?`

- [ ] **Step 3: Write the pump**

```ts
// web/app/worker/pump.ts
import { AXES } from "../../engine/job/axes.js";
import { planSweep, type Unit } from "../../engine/job/plan.js";
import { sweepUnits } from "../../engine/job/runner.js";
import type { SweepJob } from "../../engine/job/spec.js";
import type { FromWorker } from "./protocol.js";

/**
 * Turns a job into a stream of messages, in slices.
 *
 * The runner is synchronous inside one unit — one `runPair` is 38 ms at 18 people and there is no
 * point in the middle of it to check anything. So cancellation is a flag read BETWEEN units, and
 * the pump has to hand the event loop back periodically or the flag can never change: a worker
 * that never yields never receives the cancel message it is waiting for. `yieldToHost` is a
 * macrotask in the worker and a resolved promise in tests.
 *
 * No arithmetic lives here. Every number this file posts came out of `sweepUnits`.
 */

export interface PumpPort {
  postMessage(message: FromWorker): void;
}

export interface PumpDeps {
  readonly nowMs: () => number;
  readonly yieldToHost: () => Promise<void>;
  readonly isCancelled: () => boolean;
  readonly sliceBudgetMs: number;
}

/**
 * What the operator is told while they wait.
 *
 * This is reader-facing prose, so it names the axis by its plain-English label from the
 * catalogue and never by its key. The unit is deliberately omitted: several axes carry units
 * ("count", "ratio", "none") that read as nonsense inside a sentence.
 */
export function phraseFor(job: SweepJob, unit: Unit): string {
  let where = "at the settings in the panel";
  if (job.axis !== null) {
    const entry = AXES[job.axis];
    const value = job.axisValues[unit.axisIndex];
    if (value !== undefined) {
      where = `with ${entry.label.toLowerCase()} set to ${String(value)}`;
    } else {
      where = `with ${entry.label.toLowerCase()} varying`;
    }
  }

  if (unit.phase === "band") {
    return `measuring the ordinary difference between two runs, ${where}`;
  }
  if (unit.phase === "floor") {
    return `measuring the detection floor, ${where}`;
  }

  let seedOrdinal = 0;
  for (let index = 0; index < job.seedIndices.length; index++) {
    if (job.seedIndices[index] === unit.seedIndex) {
      seedOrdinal = index + 1;
    }
  }
  return `running the room ${where}, seed ${String(seedOrdinal)} of ${String(job.seedIndices.length)}`;
}

export async function pumpSweep(job: SweepJob, port: PumpPort, deps: PumpDeps): Promise<void> {
  try {
    const plan = planSweep(job);
    const unitsTotal = plan.units.length;
    let unitsDone = 0;
    let sliceStartedMs = deps.nowMs();

    for (const outcome of sweepUnits(job, plan)) {
      if (outcome.kind === "row") {
        port.postMessage({ kind: "row", row: outcome.row });
      } else {
        port.postMessage({
          kind: "band",
          axisIndex: outcome.axisIndex,
          meanM: outcome.meanM,
          peakM: outcome.peakM,
          nReplicates: outcome.nReplicates,
        });
      }

      unitsDone++;
      const unit = plan.units[unitsDone - 1];
      let phase = "finishing";
      if (unit !== undefined) {
        phase = phraseFor(job, unit);
      }
      port.postMessage({ kind: "progress", unitsDone, unitsTotal, phase });

      const elapsedMs = deps.nowMs() - sliceStartedMs;
      if (elapsedMs >= deps.sliceBudgetMs) {
        await deps.yieldToHost();
        sliceStartedMs = deps.nowMs();
        if (deps.isCancelled()) {
          port.postMessage({ kind: "cancelled" });
          return;
        }
      }
    }

    if (deps.isCancelled()) {
      port.postMessage({ kind: "cancelled" });
      return;
    }
    port.postMessage({ kind: "done" });
  } catch (error) {
    let message = "the sweep stopped before it finished, and gave no reason";
    if (error instanceof Error && error.message.length > 0) {
      message = error.message;
    }
    port.postMessage({ kind: "failed", message });
  }
}
```

- [ ] **Step 4: Run the pump test to verify it passes**

Run: `npx vitest run web/app/worker/__tests__/pump.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Write the failing client test**

```ts
// web/app/worker/__tests__/client.test.ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BASE_SEED,
  SEED_STRIDE,
  makeSweepJob,
  type SweepJob,
} from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS, type ColumnKey } from "../../../engine/job/columns.js";
import { ContractError } from "../../../engine/core/errors.js";
import type { FromWorker, ToWorker } from "../protocol.js";
import { makeSweepClient, type SweepHandlers, type SweepPort } from "../client.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const headline: ColumnKey[] = [];
for (const key of HEADLINE_COLUMNS) {
  headline.push(key);
}

const job: SweepJob = makeSweepJob({
  base: {},
  axis: null,
  axisValues: [0],
  seedIndices: [0],
  baseSeed: BASE_SEED,
  seedStride: SEED_STRIDE,
  measurement: {
    kind: "measurementParams",
    forecastHorizonSteps: 60,
    forecastEndStep: 200,
    nearMissThresholdM: 0.5,
    recoveryToleranceFraction: 0.1,
    recoveryDwellSteps: 20,
  },
  columns: headline,
  bandReplicates: null,
  floor: null,
  zeroReferenceRun: true,
  frechet: false,
});

interface Harness {
  readonly port: SweepPort;
  readonly sent: ToWorker[];
  readonly deliver: (message: FromWorker) => void;
  readonly seen: string[];
}

function harness(): Harness {
  const sent: ToWorker[] = [];
  const seen: string[] = [];
  const listeners: ((event: { readonly data: FromWorker }) => void)[] = [];

  const port: SweepPort = {
    postMessage: (message: ToWorker): void => {
      sent.push(message);
    },
    addEventListener: (
      _type: "message",
      handler: (event: { readonly data: FromWorker }) => void,
    ): void => {
      listeners.push(handler);
    },
  };

  const deliver = (message: FromWorker): void => {
    for (const handler of listeners) {
      handler({ data: message });
    }
  };

  return { port, sent, deliver, seen };
}

function handlersInto(seen: string[]): SweepHandlers {
  return {
    onProgress: (unitsDone, unitsTotal, phase) => {
      seen.push(`progress ${String(unitsDone)}/${String(unitsTotal)} ${phase}`);
    },
    onRow: (row) => {
      seen.push(`row ${String(row.key.seedIndex)}`);
    },
    onBand: (axisIndex, meanM, peakM, nReplicates) => {
      seen.push(`band ${String(axisIndex)} ${String(meanM)} ${String(peakM)} ${String(nReplicates)}`);
    },
    onDone: () => {
      seen.push("done");
    },
    onCancelled: () => {
      seen.push("cancelled");
    },
    onFailed: (message) => {
      seen.push(`failed ${message}`);
    },
  };
}

describe("the main-thread client", () => {
  it("starts a job by posting it once", () => {
    const h = harness();
    const client = makeSweepClient(h.port, handlersInto(h.seen));
    client.start(job);
    expect(h.sent.length).toBe(1);
    expect(h.sent[0]?.kind).toBe("start");
    expect(client.isRunning()).toBe(true);
  });

  it("refuses a second job while one is in flight", () => {
    const h = harness();
    const client = makeSweepClient(h.port, handlersInto(h.seen));
    client.start(job);
    expect(() => client.start(job)).toThrow(ContractError);
  });

  it("routes every message kind to its handler", () => {
    const h = harness();
    const client = makeSweepClient(h.port, handlersInto(h.seen));
    client.start(job);
    h.deliver({ kind: "progress", unitsDone: 1, unitsTotal: 2, phase: "running the room" });
    h.deliver({
      kind: "row",
      row: { kind: "runRow", key: { axisIndex: 0, axisValue: 18, seedIndex: 3 }, readings: {} },
    });
    h.deliver({ kind: "band", axisIndex: 0, meanM: 0.31059, peakM: 0.512, nReplicates: 8 });
    h.deliver({ kind: "done" });
    expect(h.seen).toEqual([
      "progress 1/2 running the room",
      "row 3",
      "band 0 0.31059 0.512 8",
      "done",
    ]);
    expect(client.isRunning()).toBe(false);
  });

  it("drops rows that arrive after the operator cancelled", () => {
    const h = harness();
    const client = makeSweepClient(h.port, handlersInto(h.seen));
    client.start(job);
    client.cancel();
    expect(h.sent[1]?.kind).toBe("cancel");
    h.deliver({
      kind: "row",
      row: { kind: "runRow", key: { axisIndex: 0, axisValue: 18, seedIndex: 0 }, readings: {} },
    });
    h.deliver({ kind: "cancelled" });
    expect(h.seen).toEqual(["cancelled"]);
    expect(client.isRunning()).toBe(false);
  });

  it("ignores a message that arrives when nothing is running", () => {
    const h = harness();
    makeSweepClient(h.port, handlersInto(h.seen));
    h.deliver({ kind: "done" });
    expect(h.seen).toEqual([]);
  });

  it("rebuilds a run for playback bitwise, which is what lets the worker return numbers only", () => {
    const h = harness();
    const client = makeSweepClient(h.port, handlersInto(h.seen));
    const first = client.recomputeForPlayback(job, 0, 0);
    const second = client.recomputeForPlayback(job, 0, 0);

    expect(second.treated.positions.length).toBe(first.treated.positions.length);
    for (let agent = 0; agent < first.treated.positions.length; agent++) {
      const a = first.treated.positions[agent] as Float64Array;
      const b = second.treated.positions[agent] as Float64Array;
      expect(b.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) {
        expect(b[i]).toBe(a[i]);
      }
    }
  });

  it("constructs the worker in the form Vite can bundle", () => {
    const source = readFileSync(join(HERE, "..", "client.ts"), "utf8");
    expect(
      source.includes('new Worker(new URL("./sweep.worker.ts", import.meta.url), { type: "module" })'),
      "a string path here builds green and 404s in production",
    ).toBe(true);
  });

  it("keeps the worker shell a shell", () => {
    const source = readFileSync(join(HERE, "..", "sweep.worker.ts"), "utf8");
    const imports = source.match(/from\s+"([^"]+)"/g) ?? [];
    expect(imports).toEqual(['from "./pump.js"', 'from "./protocol.js"']);
  });
});
```

- [ ] **Step 6: Run the client test to verify it fails**

Run: `npx vitest run web/app/worker/__tests__/client.test.ts`
Expected: FAIL with `Failed to load url ../client.js (resolved id: ../client.js) in /Users/sanjay/projects/ProjOTW/mirn/web/app/worker/__tests__/client.test.ts. Does the file exist?`

- [ ] **Step 7: Write the client**

```ts
// web/app/worker/client.ts
import { fail } from "../../engine/core/errors.js";
import { configForCell, type SweepJob } from "../../engine/job/spec.js";
import type { RunRow } from "../../engine/job/runner.js";
import { runPair, type RunResult } from "../../engine/sim/run.js";
import type { FromWorker, ToWorker } from "./protocol.js";

/**
 * The main thread's whole view of the worker.
 *
 * Two things are worth stating. First, the worker returns numbers and never trajectories: a
 * 72-run sweep of paths is about 33 MB and the readings are about 90 KB. Playback re-simulates
 * the selected run here instead, which is legal only because the run is a pure function of
 * `(config)` — `client.test.ts` asserts the rebuild is bitwise rather than assuming it.
 *
 * Second, cancelling is not instant and is not pretended to be. `cancel()` posts a flag the
 * worker reads between units and then ignores everything until `cancelled` comes back, so a row
 * still in flight from an abandoned sweep never reaches the ledger.
 */

export interface SweepPort {
  postMessage(message: ToWorker): void;
  addEventListener(
    type: "message",
    handler: (event: { readonly data: FromWorker }) => void,
  ): void;
}

export interface SweepHandlers {
  readonly onProgress: (unitsDone: number, unitsTotal: number, phase: string) => void;
  readonly onRow: (row: RunRow) => void;
  readonly onBand: (
    axisIndex: number,
    meanM: number,
    peakM: number,
    nReplicates: number,
  ) => void;
  readonly onDone: () => void;
  readonly onCancelled: () => void;
  readonly onFailed: (message: string) => void;
}

export interface SweepClient {
  readonly kind: "sweepClient";
  readonly start: (job: SweepJob) => void;
  readonly cancel: () => void;
  readonly isRunning: () => boolean;
  readonly recomputeForPlayback: (
    job: SweepJob,
    cellIndex: number,
    seedIndex: number,
  ) => RunResult;
}

type ClientPhase = "idle" | "running" | "cancelling";

export function makeSweepClient(port: SweepPort, handlers: SweepHandlers): SweepClient {
  let phase: ClientPhase = "idle";

  port.addEventListener("message", (event: { readonly data: FromWorker }) => {
    const message = event.data;
    if (phase === "idle") {
      return;
    }
    if (phase === "cancelling") {
      if (message.kind === "cancelled" || message.kind === "done" || message.kind === "failed") {
        phase = "idle";
        handlers.onCancelled();
      }
      return;
    }
    if (message.kind === "progress") {
      handlers.onProgress(message.unitsDone, message.unitsTotal, message.phase);
      return;
    }
    if (message.kind === "row") {
      handlers.onRow(message.row);
      return;
    }
    if (message.kind === "band") {
      handlers.onBand(message.axisIndex, message.meanM, message.peakM, message.nReplicates);
      return;
    }
    if (message.kind === "done") {
      phase = "idle";
      handlers.onDone();
      return;
    }
    if (message.kind === "cancelled") {
      phase = "idle";
      handlers.onCancelled();
      return;
    }
    phase = "idle";
    handlers.onFailed(message.message);
  });

  const start = (job: SweepJob): void => {
    if (phase !== "idle") {
      fail(
        "a sweep is already running; press the button that stops it before starting another, " +
          "because two sweeps would land in the same ledger with no way to tell them apart",
      );
    }
    phase = "running";
    port.postMessage({ kind: "start", job });
  };

  const cancel = (): void => {
    if (phase !== "running") {
      return;
    }
    phase = "cancelling";
    port.postMessage({ kind: "cancel" });
  };

  const isRunning = (): boolean => phase !== "idle";

  const recomputeForPlayback = (
    job: SweepJob,
    cellIndex: number,
    seedIndex: number,
  ): RunResult => {
    const config = configForCell(job, cellIndex, seedIndex);
    return runPair(config);
  };

  return Object.freeze({
    kind: "sweepClient" as const,
    start,
    cancel,
    isRunning,
    recomputeForPlayback,
  });
}

/** A real `Worker` narrowed to the two methods the client uses, so nothing else can be reached. */
export function sweepPortFor(worker: Worker): SweepPort {
  return {
    postMessage: (message: ToWorker): void => {
      worker.postMessage(message);
    },
    addEventListener: (
      type: "message",
      handler: (event: { readonly data: FromWorker }) => void,
    ): void => {
      worker.addEventListener(type, (event: MessageEvent<FromWorker>) => {
        handler({ data: event.data });
      });
    },
  };
}

/**
 * The one construction Vite can analyse. Keep it written exactly this way — a string path builds
 * green and 404s in production, and `client.test.ts` pins the literal for that reason.
 */
export function spawnSweepWorker(): Worker {
  return new Worker(new URL("./sweep.worker.ts", import.meta.url), { type: "module" });
}
```

```ts
// web/app/worker/sweep.worker.ts
import { pumpSweep } from "./pump.js";
import type { FromWorker, ToWorker } from "./protocol.js";

/**
 * Twenty lines of glue and no arithmetic. Everything numeric is behind `pumpSweep`, which is
 * behind `web/engine/job/runner.ts`. No test imports this file: it registers a listener at module
 * scope, so importing it under Node would be a ReferenceError on `self`.
 *
 * `self` is typed by hand rather than by referencing lib="webworker", which collides with the DOM
 * lib this project already compiles against.
 */

interface WorkerScope {
  postMessage(message: FromWorker): void;
  addEventListener(type: "message", handler: (event: MessageEvent<ToWorker>) => void): void;
}

const scope = self as unknown as WorkerScope;

let cancelled = false;
let running = false;

scope.addEventListener("message", (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  if (message.kind === "cancel") {
    cancelled = true;
    return;
  }
  if (running) {
    scope.postMessage({
      kind: "failed",
      message: "a sweep was already running when another was asked for",
    });
    return;
  }
  running = true;
  cancelled = false;
  void pumpSweep(
    message.job,
    { postMessage: (out: FromWorker): void => scope.postMessage(out) },
    {
      nowMs: () => performance.now(),
      // A macrotask, not a microtask: only a macrotask lets the pending cancel message be
      // delivered, and a pump that never yields can never be stopped.
      yieldToHost: () => new Promise<void>((resolve) => { setTimeout(resolve, 0); }),
      isCancelled: () => cancelled,
      sliceBudgetMs: 50,
    },
  ).then(() => {
    running = false;
  });
});
```

```ts
// vite.config.ts — insert between line 28 (`base: "./",`) and line 29 (`build: {`)
  // Vite's default worker output is `iife`, which cannot serve a `{ type: "module" }` worker.
  // `web/app/worker/client.ts` constructs one, so the format is stated rather than inherited.
  worker: {
    format: "es",
  },
```

- [ ] **Step 8: Run the client test to verify it passes**

Run: `npx vitest run web/app/worker/__tests__/client.test.ts`
Expected: 8 passed.

- [ ] **Step 9: Typecheck and build**

Run: `npm run typecheck && npx vite build`
Expected: typecheck silent; the build emits a separate chunk for the worker.

- [ ] **Step 10: Commit**

```bash
git add web/app/worker/pump.ts web/app/worker/sweep.worker.ts web/app/worker/client.ts \
        web/app/worker/__tests__/pump.test.ts web/app/worker/__tests__/client.test.ts vite.config.ts
git commit -m "Put the sweep on a worker, in slices a cancel can land between"
```

---

### Task 19: Console state, settings and the two jobs

**Files:**
- Create: `web/app/console/state.ts`
- Test: `web/app/console/__tests__/state.test.ts`

**Interfaces:**
- Consumes: `AXES`, `AXIS_ORDER`, `type AxisKey` from `web/engine/job/axes.ts` (Task 12) — each `AxisEntry` carrying `kind: "worldAxis" | "measurementAxis"`, `key`, `label`, `unit`, `min`, `max`, `step`, `defaultValue`, `note`, `writes: readonly string[]`, `movesColumns`, and `apply` (`(base: RunConfigOverrides, value: number) => RunConfigOverrides` on a world axis, `(params: MeasurementParams, value: number) => MeasurementParams` on a measurement axis). `COLUMNS`, `COLUMN_ORDER`, `type ColumnKey` from `web/engine/job/columns.ts` (Task 11). `makeSweepJob`, `configForCell`, `BASE_SEED`, `SEED_STRIDE`, `type SweepJob`, `type MeasurementParams` from `web/engine/job/spec.ts` (Task 14). `type RunRow` from `web/engine/job/runner.ts` (Task 15). `type RunConfigOverrides` from `web/engine/contracts/config.ts:126`. `ContractError` / `fail` from `web/engine/core/errors.ts`.
- Produces: `ConsoleSettings`, `ConsoleSettingsInit`, `makeConsoleSettings`, `DEFAULT_SETTINGS`, `CellRef`, `makeCellRef`, `BandReading`, `RunGroup`, `ConsoleUi`, `ConsoleState`, `baseOverridesFor`, `measurementParamsFor`, `jobForPreview`, `jobForRun`, `sameSettings`, `ledgerIsStale`, `STALE_LEDGER_NOTICE`. Task 20 imports `DEFAULT_SETTINGS`, `makeConsoleSettings` and the `ConsoleSettings` type; Tasks 21-29 import the rest.
- Note for the sweep-curve task in 21-29, from reading `web/ui/plot.ts`: it exports exactly `PlotSeries { key, label, values, sd?, accent? }`, `PlotView { x, xLabel, yLabel, series }`, and `drawSweep(context, view, width, height)`. Dots, dashes, greyscale ramp, gridlines, axis labels and the one accent series all already exist, so the wireframe's `*====*` and `.....` series need nothing added. The wireframe's `::::` shaded floor region does **not** exist: the `sd` field draws a ribbon from `value - sd` to `value + sd` with the lower edge clamped at zero (`plot.ts:150-160`), which cannot fill from the axis up to the band. The minimum addition is one optional field, `readonly fillFromZero?: boolean` on `PlotSeries`, plus a branch in that same block that walks the upper edge at `values[i]` and returns along `sy(0)`. `niceCeiling` already tops out on `values` alone, which is correct for a zero-fill series.
- No change to `vitest.workspace.ts`: `web/app/**/*.test.ts` on line 16 already matches `web/app/console/__tests__/`.

- [ ] **Step 1: Write the failing test**

```ts
// web/app/console/__tests__/state.test.ts
import { describe, expect, it } from "vitest";
import { AXES, AXIS_ORDER } from "../../../engine/job/axes.js";
import { configForCell } from "../../../engine/job/spec.js";
import { ContractError } from "../../../engine/core/errors.js";
import type { RunConfig } from "../../../engine/contracts/config.js";
import {
  DEFAULT_SETTINGS,
  STALE_LEDGER_NOTICE,
  jobForPreview,
  jobForRun,
  ledgerIsStale,
  makeConsoleSettings,
  measurementParamsFor,
  sameSettings,
  type ConsoleSettings,
  type ConsoleState,
  type RunGroup,
} from "../state.js";

/** Reads a dotted config path, so a test can use an axis's declared `writes` as data. */
function readNumberAt(config: RunConfig, path: string): number {
  const parts = path.split(".");
  let cursor: unknown = config;
  for (const part of parts) {
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor as number;
}

function withAxis(
  settings: ConsoleSettings,
  key: "crowdSize" | "robotSpeed",
  value: number,
): ConsoleSettings {
  const axisValues = { ...settings.axisValues };
  axisValues[key] = value;
  return makeConsoleSettings({ ...settings, axisValues });
}

describe("console settings", () => {
  it("starts every knob where the catalogue says", () => {
    for (const key of AXIS_ORDER) {
      expect(DEFAULT_SETTINGS.axisValues[key]).toBe(AXES[key].defaultValue);
    }
  });

  it("forecasts over three seconds and reads at step 200 by default", () => {
    // The console's central argument: at a 16-step horizon the forecaster reads 0.0262 m on a
    // robot-blind run against a band of 0.3106 m, twelve times below the noise floor, and the
    // page would ship refuted by its own default state.
    const params = measurementParamsFor(DEFAULT_SETTINGS);
    expect(params.forecastHorizonSteps).toBe(60);
    expect(params.forecastEndStep).toBe(200);
  });

  it("rejects an axis value outside the range the catalogue allows", () => {
    expect(() => withAxis(DEFAULT_SETTINGS, "crowdSize", AXES.crowdSize.max + 1)).toThrow(
      ContractError,
    );
    expect(() => withAxis(DEFAULT_SETTINGS, "crowdSize", AXES.crowdSize.min - 1)).toThrow(
      ContractError,
    );
  });

  it("rejects a sweep whose shape is impossible", () => {
    expect(() =>
      makeConsoleSettings({ ...DEFAULT_SETTINGS, sweepAxis: null, sweepValues: [4, 8] }),
    ).toThrow(ContractError);
    expect(() =>
      makeConsoleSettings({ ...DEFAULT_SETTINGS, sweepAxis: "crowdSize", sweepValues: [] }),
    ).toThrow(ContractError);
    expect(() =>
      makeConsoleSettings({ ...DEFAULT_SETTINGS, sweepAxis: "crowdSize", sweepValues: [18, 4] }),
    ).toThrow(ContractError);
    expect(() =>
      makeConsoleSettings({ ...DEFAULT_SETTINGS, sweepAxis: "crowdSize", sweepValues: [4, 4] }),
    ).toThrow(ContractError);
  });

  it("rejects counts that cannot produce what they promise", () => {
    expect(() => makeConsoleSettings({ ...DEFAULT_SETTINGS, seedCount: 0 })).toThrow(ContractError);
    // A band is a quantile over pairwise comparisons; one replicate has no pair.
    expect(() => makeConsoleSettings({ ...DEFAULT_SETTINGS, bandReplicates: 1 })).toThrow(
      ContractError,
    );
    expect(() => makeConsoleSettings({ ...DEFAULT_SETTINGS, nearMissThresholdM: 0 })).toThrow(
      ContractError,
    );
    expect(() => makeConsoleSettings({ ...DEFAULT_SETTINGS, recoveryDwellSteps: 0 })).toThrow(
      ContractError,
    );
  });
});

describe("the live preview", () => {
  it("is one run at the settings now in the panel, never cell zero of the sweep", () => {
    const swept = makeConsoleSettings({
      ...withAxis(DEFAULT_SETTINGS, "crowdSize", 18).axisValues === undefined
        ? DEFAULT_SETTINGS
        : withAxis(DEFAULT_SETTINGS, "crowdSize", 18),
      sweepAxis: "crowdSize",
      sweepValues: [4, 8, 12, 18, 24, 32, 44],
    });
    const preview = jobForPreview(swept);
    expect(preview.axis).toBe(null);
    expect(preview.seedIndices.length).toBe(1);
    expect(preview.axisValues.length).toBe(1);

    const path = AXES.crowdSize.writes[0] as string;
    const previewConfig = configForCell(preview, 0, 0);
    expect(readNumberAt(previewConfig, path)).toBe(18);

    // The sweep's own cell zero is 4 people, which is the number the panel is NOT showing.
    const run = jobForRun(swept);
    expect(readNumberAt(configForCell(run, 0, 0), path)).toBe(4);
  });

  it("buys the zero-effect reference run and does not buy the band", () => {
    const preview = jobForPreview(DEFAULT_SETTINGS);
    // Without this, headline two reads "not applicable" on first load and the console's central
    // argument is dead before the operator touches anything. One extra paired run, 38 ms.
    expect(preview.zeroReferenceRun).toBe(true);
    // 267 ms cannot be live at every input event.
    expect(preview.bandReplicates).toBe(null);
    expect(preview.floor).toBe(null);
    expect(preview.frechet).toBe(false);
  });
});

describe("the run job", () => {
  it("honours the sliders that are not being swept", () => {
    const fast = withAxis(DEFAULT_SETTINGS, "robotSpeed", AXES.robotSpeed.max);
    const swept = makeConsoleSettings({
      ...fast,
      sweepAxis: "crowdSize",
      sweepValues: [4, 18, 44],
      seedCount: 2,
    });
    const job = jobForRun(swept);
    const speedPath = AXES.robotSpeed.writes[0] as string;
    const peoplePath = AXES.crowdSize.writes[0] as string;

    expect(readNumberAt(configForCell(job, 2, 1), speedPath)).toBe(AXES.robotSpeed.max);
    expect(readNumberAt(configForCell(job, 2, 1), peoplePath)).toBe(44);
  });

  it("counts its seeds by listing them, never by holding a number", () => {
    const job = jobForRun(makeConsoleSettings({ ...DEFAULT_SETTINGS, seedCount: 8 }));
    expect(job.seedIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("does not report a column it did not buy", () => {
    const plain = jobForRun(
      makeConsoleSettings({
        ...DEFAULT_SETTINGS,
        bandReplicates: 0,
        withFloor: false,
        withFrechet: false,
      }),
    );
    for (const key of plain.columns) {
      expect(["run", "zeroRun"]).toContain(COLUMN_NEEDS_FOR(key));
    }
  });
});

describe("the stale-ledger notice", () => {
  const group: RunGroup = {
    kind: "runGroup",
    groupId: "g1",
    label: "people sweep",
    settings: DEFAULT_SETTINGS,
    job: jobForRun(DEFAULT_SETTINGS),
    rows: [],
    bands: [],
  };

  it("is quiet while the panel still matches the selected row", () => {
    const state: ConsoleState = {
      kind: "consoleState",
      settings: DEFAULT_SETTINGS,
      groups: [group],
      ui: {
        kind: "consoleUi",
        selected: { kind: "cellRef", groupId: "g1", axisIndex: 0, seedIndex: 0 },
        pinned: [],
        visibleColumns: [],
        playing: true,
        sample: 0,
        running: false,
        progress: null,
      },
    };
    expect(ledgerIsStale(state)).toBe(false);
  });

  it("speaks the moment one knob moves", () => {
    const moved = withAxis(DEFAULT_SETTINGS, "crowdSize", AXES.crowdSize.max);
    const state: ConsoleState = {
      kind: "consoleState",
      settings: moved,
      groups: [group],
      ui: {
        kind: "consoleUi",
        selected: { kind: "cellRef", groupId: "g1", axisIndex: 0, seedIndex: 0 },
        pinned: [],
        visibleColumns: [],
        playing: true,
        sample: 0,
        running: false,
        progress: null,
      },
    };
    expect(sameSettings(DEFAULT_SETTINGS, moved)).toBe(false);
    expect(ledgerIsStale(state)).toBe(true);
    expect(STALE_LEDGER_NOTICE).toBe(
      "these numbers were measured at the settings in the link, not the ones now in the panel.",
    );
  });
});
```

Replace the placeholder helper reference by adding this import and function at the top of the file, beside the others:

```ts
import { COLUMNS } from "../../../engine/job/columns.js";
import type { ColumnKey } from "../../../engine/job/columns.js";

function COLUMN_NEEDS_FOR(key: ColumnKey): string {
  return COLUMNS[key].needs;
}
```

and simplify the swept fixture in "is one run at the settings now in the panel" to:

```ts
    const atEighteen = withAxis(DEFAULT_SETTINGS, "crowdSize", 18);
    const swept = makeConsoleSettings({
      ...atEighteen,
      sweepAxis: "crowdSize",
      sweepValues: [4, 8, 12, 18, 24, 32, 44],
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/state.test.ts`
Expected: FAIL with `Failed to load url ../state.js (resolved id: ../state.js) in /Users/sanjay/projects/ProjOTW/mirn/web/app/console/__tests__/state.test.ts. Does the file exist?`

- [ ] **Step 3: Write the implementation**

```ts
// web/app/console/state.ts
import { fail } from "../../engine/core/errors.js";
import type { RunConfigOverrides } from "../../engine/contracts/config.js";
import { AXES, AXIS_ORDER, type AxisKey } from "../../engine/job/axes.js";
import { COLUMNS, COLUMN_ORDER, type ColumnKey } from "../../engine/job/columns.js";
import type { RunRow } from "../../engine/job/runner.js";
import {
  BASE_SEED,
  SEED_STRIDE,
  makeSweepJob,
  type MeasurementParams,
  type SweepJob,
} from "../../engine/job/spec.js";

/**
 * Everything the console knows, as frozen records with no behaviour in them.
 *
 * This file is where a slider's clamp becomes a contract check. The panel will clamp on the way
 * in, but a permalink is a hand-editable string and nobody has to go through the panel at all, so
 * `makeConsoleSettings` is the last line of defence and it throws rather than coerces.
 *
 * It is deliberately NOT the last line of defence for everything. Whether 18.3 people is a legal
 * crowd is `makeRunConfig`'s question, and it is asked before the first simulation because
 * `makeSweepJob` walks the whole grid. Duplicating that here would give the two checks somewhere
 * to disagree.
 */

/** Only used when an axis catalogue somehow omits the forecast axes; the axes overwrite both. */
const SEED_FORECAST_HORIZON_STEPS = 60;
const SEED_FORECAST_END_STEP = 200;

/** Not panel controls. Two floors computed at different strides are not comparable, so the
 *  numbers are named here once rather than typed at each call. */
const FLOOR_SPLITS = 200;
const FLOOR_ALPHA = 0.05;
const FLOOR_STRIDE_STEPS = 20;

export interface ConsoleSettings {
  readonly kind: "consoleSettings";
  /** Every knob in the catalogue, at its panel position. One table, so the panel and the sweep
   *  picker cannot drift. */
  readonly axisValues: Readonly<Record<AxisKey, number>>;
  readonly pedestriansSeeRobot: boolean;
  readonly nearMissThresholdM: number;
  readonly recoveryToleranceFraction: number;
  readonly recoveryDwellSteps: number;
  readonly sweepAxis: AxisKey | null;
  readonly sweepValues: readonly number[];
  readonly seedCount: number;
  /** 0 means the band was not bought. Otherwise the replicate count, which rides on the cell. */
  readonly bandReplicates: number;
  readonly withFloor: boolean;
  readonly withFrechet: boolean;
  readonly withZeroReference: boolean;
}

export interface ConsoleSettingsInit {
  kind?: "consoleSettings";
  axisValues: Readonly<Record<AxisKey, number>>;
  pedestriansSeeRobot: boolean;
  nearMissThresholdM: number;
  recoveryToleranceFraction: number;
  recoveryDwellSteps: number;
  sweepAxis: AxisKey | null;
  sweepValues: readonly number[];
  seedCount: number;
  bandReplicates: number;
  withFloor: boolean;
  withFrechet: boolean;
  withZeroReference: boolean;
}

export function makeConsoleSettings(init: ConsoleSettingsInit): ConsoleSettings {
  const axisValues: Record<AxisKey, number> = { ...init.axisValues };
  for (const key of AXIS_ORDER) {
    const entry = AXES[key];
    const value = axisValues[key];
    if (!Number.isFinite(value)) {
      fail(`${entry.label} must be a number, got ${String(value)}`);
    }
    if (value < entry.min) {
      fail(
        `${entry.label} must be at least ${String(entry.min)}, got ${String(value)}`,
      );
    }
    if (value > entry.max) {
      fail(`${entry.label} must be at most ${String(entry.max)}, got ${String(value)}`);
    }
  }

  if (!Number.isFinite(init.nearMissThresholdM) || init.nearMissThresholdM <= 0) {
    fail(
      `The near-miss line must be a distance greater than zero, got ` +
        `${String(init.nearMissThresholdM)}`,
    );
  }
  if (init.nearMissThresholdM > 5) {
    fail(
      `The near-miss line must be at most 5 metres, because a wider line counts the whole room ` +
        `as a near miss, got ${String(init.nearMissThresholdM)}`,
    );
  }
  if (
    !Number.isFinite(init.recoveryToleranceFraction) ||
    init.recoveryToleranceFraction <= 0 ||
    init.recoveryToleranceFraction > 1
  ) {
    fail(
      `The recovery tolerance must be a fraction above zero and at most one, got ` +
        `${String(init.recoveryToleranceFraction)}`,
    );
  }
  if (!Number.isInteger(init.recoveryDwellSteps) || init.recoveryDwellSteps < 1) {
    fail(
      `The recovery dwell must be a whole number of steps, at least one, got ` +
        `${String(init.recoveryDwellSteps)}`,
    );
  }
  if (init.recoveryDwellSteps > 400) {
    fail(
      `The recovery dwell must be at most 400 steps, which is half the longest episode, got ` +
        `${String(init.recoveryDwellSteps)}`,
    );
  }

  const sweepValues: number[] = [];
  for (const value of init.sweepValues) {
    sweepValues.push(value);
  }

  if (init.sweepAxis === null) {
    if (sweepValues.length > 0) {
      fail(
        `Nothing is being varied, so there is nothing for ${String(sweepValues.length)} values ` +
          `to be values of`,
      );
    }
  } else {
    const entry = AXES[init.sweepAxis];
    if (sweepValues.length < 1) {
      fail(`${entry.label} is being varied, so it needs at least one value to vary over`);
    }
    let previous: number | null = null;
    for (const value of sweepValues) {
      if (!Number.isFinite(value)) {
        fail(`Every value ${entry.label} is varied over must be a number, got ${String(value)}`);
      }
      if (value < entry.min || value > entry.max) {
        fail(
          `${entry.label} is varied over ${String(value)}, which is outside the range ` +
            `${String(entry.min)} to ${String(entry.max)}`,
        );
      }
      if (previous !== null && value <= previous) {
        fail(
          `The values ${entry.label} is varied over must climb, so the curve reads left to ` +
            `right, got ${String(previous)} then ${String(value)}`,
        );
      }
      previous = value;
    }
  }

  if (!Number.isInteger(init.seedCount) || init.seedCount < 1) {
    fail(`The number of seeds must be a whole number, at least one, got ${String(init.seedCount)}`);
  }
  if (init.seedCount > 32) {
    fail(`The number of seeds is capped at 32, got ${String(init.seedCount)}`);
  }

  if (!Number.isInteger(init.bandReplicates) || init.bandReplicates < 0) {
    fail(
      `The number of band replicates must be a whole number, or zero for no band, got ` +
        `${String(init.bandReplicates)}`,
    );
  }
  if (init.bandReplicates === 1) {
    fail(
      `A band is a percentile over comparisons between pairs of runs, so one replicate has ` +
        `nothing to compare against; use zero for no band, or two or more`,
    );
  }
  if (init.bandReplicates > 32) {
    fail(`The number of band replicates is capped at 32, got ${String(init.bandReplicates)}`);
  }

  return Object.freeze({
    kind: "consoleSettings" as const,
    axisValues: Object.freeze(axisValues),
    pedestriansSeeRobot: init.pedestriansSeeRobot,
    nearMissThresholdM: init.nearMissThresholdM,
    recoveryToleranceFraction: init.recoveryToleranceFraction,
    recoveryDwellSteps: init.recoveryDwellSteps,
    sweepAxis: init.sweepAxis,
    sweepValues: Object.freeze(sweepValues),
    seedCount: init.seedCount,
    bandReplicates: init.bandReplicates,
    withFloor: init.withFloor,
    withFrechet: init.withFrechet,
    withZeroReference: init.withZeroReference,
  });
}

function defaultAxisValues(): Record<AxisKey, number> {
  const values: Partial<Record<AxisKey, number>> = {};
  for (const key of AXIS_ORDER) {
    values[key] = AXES[key].defaultValue;
  }
  return values as Record<AxisKey, number>;
}

export const DEFAULT_SETTINGS: ConsoleSettings = makeConsoleSettings({
  axisValues: defaultAxisValues(),
  pedestriansSeeRobot: true,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.1,
  recoveryDwellSteps: 20,
  sweepAxis: null,
  sweepValues: [],
  seedCount: 1,
  bandReplicates: 8,
  withFloor: false,
  withFrechet: false,
  withZeroReference: true,
});

export function baseOverridesFor(settings: ConsoleSettings): RunConfigOverrides {
  let overrides: RunConfigOverrides = { pedestriansSeeRobot: settings.pedestriansSeeRobot };
  for (const key of AXIS_ORDER) {
    const entry = AXES[key];
    if (entry.kind !== "worldAxis") {
      continue;
    }
    overrides = entry.apply(overrides, settings.axisValues[key]);
  }
  return Object.freeze(overrides);
}

export function measurementParamsFor(settings: ConsoleSettings): MeasurementParams {
  let params: MeasurementParams = {
    kind: "measurementParams",
    forecastHorizonSteps: SEED_FORECAST_HORIZON_STEPS,
    forecastEndStep: SEED_FORECAST_END_STEP,
    nearMissThresholdM: settings.nearMissThresholdM,
    recoveryToleranceFraction: settings.recoveryToleranceFraction,
    recoveryDwellSteps: settings.recoveryDwellSteps,
  };
  for (const key of AXIS_ORDER) {
    const entry = AXES[key];
    if (entry.kind !== "measurementAxis") {
      continue;
    }
    params = entry.apply(params, settings.axisValues[key]);
  }
  return Object.freeze(params);
}

function columnsFor(
  settings: ConsoleSettings,
  hasBand: boolean,
  hasFloor: boolean,
  hasFrechet: boolean,
): readonly ColumnKey[] {
  const chosen: ColumnKey[] = [];
  for (const key of COLUMN_ORDER) {
    const descriptor = COLUMNS[key];
    if (descriptor.needs === "run") {
      // Cheap columns are always reported: all six composers together are 3.4 ms against a 38 ms
      // paired run, so the picker hides a column rather than gating it, and ticking one after a
      // Run fills it in without re-running.
      chosen.push(key);
      continue;
    }
    if (descriptor.needs === "zeroRun" && settings.withZeroReference) {
      chosen.push(key);
      continue;
    }
    if (descriptor.needs === "band" && hasBand) {
      chosen.push(key);
      continue;
    }
    if (descriptor.needs === "floor" && hasFloor) {
      chosen.push(key);
      continue;
    }
    if (descriptor.needs === "frechet" && hasFrechet) {
      chosen.push(key);
    }
  }
  return Object.freeze(chosen);
}

/**
 * One run, at the settings now in the panel.
 *
 * Never cell zero of the configured sweep. With a people sweep set up, cell zero is four people
 * while the slider reads eighteen, and every tile would describe a room the operator is not
 * looking at. The zero-effect reference run is bought here — one extra paired run, 38 ms — because
 * without it the forecaster's tile reads "not applicable" on first load and the console's central
 * argument is dead before anything is touched. The band is not bought: 267 ms cannot be live, and
 * its gauge reads "not yet measured" rather than showing a floor from other settings.
 */
export function jobForPreview(settings: ConsoleSettings): SweepJob {
  return makeSweepJob({
    base: baseOverridesFor(settings),
    axis: null,
    axisValues: [0],
    seedIndices: [0],
    baseSeed: BASE_SEED,
    seedStride: SEED_STRIDE,
    measurement: measurementParamsFor(settings),
    columns: columnsFor(settings, false, false, false),
    bandReplicates: null,
    floor: null,
    zeroReferenceRun: true,
    frechet: false,
  });
}

export function jobForRun(settings: ConsoleSettings): SweepJob {
  const hasBand = settings.bandReplicates > 0;
  const seedIndices: number[] = [];
  for (let index = 0; index < settings.seedCount; index++) {
    seedIndices.push(index);
  }

  const axisValues: number[] = [];
  if (settings.sweepAxis === null) {
    axisValues.push(0);
  } else {
    for (const value of settings.sweepValues) {
      axisValues.push(value);
    }
  }

  return makeSweepJob({
    base: baseOverridesFor(settings),
    axis: settings.sweepAxis,
    axisValues,
    seedIndices,
    baseSeed: BASE_SEED,
    seedStride: SEED_STRIDE,
    measurement: measurementParamsFor(settings),
    columns: columnsFor(settings, hasBand, settings.withFloor, settings.withFrechet),
    bandReplicates: hasBand ? { n: settings.bandReplicates, scope: "perCell" } : null,
    floor: settings.withFloor
      ? {
          kind: "floorParams",
          nSplits: FLOOR_SPLITS,
          alpha: FLOOR_ALPHA,
          strideSteps: FLOOR_STRIDE_STEPS,
          permutationSeed: BASE_SEED,
        }
      : null,
    zeroReferenceRun: settings.withZeroReference,
    frechet: settings.withFrechet,
  });
}

export interface CellRef {
  readonly kind: "cellRef";
  /** Which press of Run produced it. */
  readonly groupId: string;
  readonly axisIndex: number;
  /** Which run inside the cell the transport is playing. */
  readonly seedIndex: number;
}

export function makeCellRef(init: {
  groupId: string;
  axisIndex: number;
  seedIndex: number;
}): CellRef {
  if (init.groupId.length === 0) {
    fail("A selected result must name the press of Run it came from");
  }
  if (!Number.isInteger(init.axisIndex) || init.axisIndex < 0) {
    fail(`A selected result's position must be a whole number, got ${String(init.axisIndex)}`);
  }
  if (!Number.isInteger(init.seedIndex) || init.seedIndex < 0) {
    fail(`A selected run's seed must be a whole number, got ${String(init.seedIndex)}`);
  }
  return Object.freeze({
    kind: "cellRef" as const,
    groupId: init.groupId,
    axisIndex: init.axisIndex,
    seedIndex: init.seedIndex,
  });
}

export interface BandReading {
  readonly kind: "bandReading";
  readonly axisIndex: number;
  readonly meanM: number;
  readonly peakM: number;
  readonly nReplicates: number;
}

/**
 * One press of Run. The stored unit is a run, not a cell: a cell has no seed, so it cannot be
 * rebuilt, and playback, pinning and the recompute trick all need something that can. A cell is a
 * pure function of the runs sharing an axis value, aggregated at render time.
 */
export interface RunGroup {
  readonly kind: "runGroup";
  readonly groupId: string;
  readonly label: string;
  /** The settings these numbers were measured at. Every readout prints them, always. */
  readonly settings: ConsoleSettings;
  readonly job: SweepJob;
  readonly rows: readonly RunRow[];
  readonly bands: readonly BandReading[];
}

export interface ConsoleUi {
  readonly kind: "consoleUi";
  readonly selected: CellRef | null;
  /** `${groupId}:${axisIndex}` for each pinned cell. */
  readonly pinned: readonly string[];
  readonly visibleColumns: readonly ColumnKey[];
  readonly playing: boolean;
  readonly sample: number;
  readonly running: boolean;
  readonly progress: {
    readonly unitsDone: number;
    readonly unitsTotal: number;
    readonly phase: string;
  } | null;
}

export interface ConsoleState {
  readonly kind: "consoleState";
  /** What the panel reads now, which is not necessarily what any group was measured at. */
  readonly settings: ConsoleSettings;
  readonly groups: readonly RunGroup[];
  readonly ui: ConsoleUi;
}

export function sameSettings(a: ConsoleSettings, b: ConsoleSettings): boolean {
  for (const key of AXIS_ORDER) {
    if (a.axisValues[key] !== b.axisValues[key]) {
      return false;
    }
  }
  if (a.pedestriansSeeRobot !== b.pedestriansSeeRobot) {
    return false;
  }
  if (a.nearMissThresholdM !== b.nearMissThresholdM) {
    return false;
  }
  if (a.recoveryToleranceFraction !== b.recoveryToleranceFraction) {
    return false;
  }
  if (a.recoveryDwellSteps !== b.recoveryDwellSteps) {
    return false;
  }
  if (a.sweepAxis !== b.sweepAxis) {
    return false;
  }
  if (a.sweepValues.length !== b.sweepValues.length) {
    return false;
  }
  for (let index = 0; index < a.sweepValues.length; index++) {
    if (a.sweepValues[index] !== b.sweepValues[index]) {
      return false;
    }
  }
  if (a.seedCount !== b.seedCount) {
    return false;
  }
  if (a.bandReplicates !== b.bandReplicates) {
    return false;
  }
  if (a.withFloor !== b.withFloor) {
    return false;
  }
  if (a.withFrechet !== b.withFrechet) {
    return false;
  }
  if (a.withZeroReference !== b.withZeroReference) {
    return false;
  }
  return true;
}

export const STALE_LEDGER_NOTICE =
  "these numbers were measured at the settings in the link, not the ones now in the panel.";

export function ledgerIsStale(state: ConsoleState): boolean {
  const selected = state.ui.selected;
  if (selected === null) {
    return false;
  }
  for (const group of state.groups) {
    if (group.groupId === selected.groupId) {
      return !sameSettings(state.settings, group.settings);
    }
  }
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/state.test.ts`
Expected: 11 passed.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/app/console/state.ts web/app/console/__tests__/state.test.ts
git commit -m "Make the panel's settings a contract, and pin the preview to the room on screen"
```

---

### Task 20: The permalink

**Files:**
- Create: `web/app/console/permalink.ts`
- Test: `web/app/console/__tests__/permalink.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_SETTINGS`, `makeConsoleSettings`, `type ConsoleSettings` from `web/app/console/state.ts` (Task 19). `AXES`, `AXIS_ORDER`, `type AxisKey` from `web/engine/job/axes.ts` (Task 12).
- Produces: `AXIS_QUERY_KEY: Readonly<Record<AxisKey, string>>`, `SETTING_QUERY_KEYS: readonly string[]`, `encodeSettings(settings: ConsoleSettings): string`, `DecodeResult { kind: "decodeResult"; settings: ConsoleSettings; notices: readonly string[] }`, `decodeSettings(query: string): DecodeResult`. The Copy-link button and the boot path in Tasks 21-29 call exactly these two functions.
- The link carries the recipe and never a result. A URL asserting `true_effect=0.352` would forge a number the current code did not produce: change a formula and the old link quotes the old answer with the new page's authority.

- [ ] **Step 1: Write the failing test**

```ts
// web/app/console/__tests__/permalink.test.ts
import { describe, expect, it } from "vitest";
import { AXES, AXIS_ORDER, type AxisKey } from "../../../engine/job/axes.js";
import { DEFAULT_SETTINGS, makeConsoleSettings, type ConsoleSettings } from "../state.js";
import { AXIS_QUERY_KEY, decodeSettings, encodeSettings } from "../permalink.js";

function awkward(): ConsoleSettings {
  const axisValues = { ...DEFAULT_SETTINGS.axisValues };
  axisValues.crowdSize = 44;
  axisValues.robotSpeed = 1.1;
  axisValues.reactionTime = 0.15;
  axisValues.crowdFidget = 1.1;
  axisValues.walkingPace = 1.34;
  return makeConsoleSettings({
    ...DEFAULT_SETTINGS,
    axisValues,
    pedestriansSeeRobot: false,
    nearMissThresholdM: 0.5,
    sweepAxis: "crowdSize",
    sweepValues: [4, 8, 12, 18, 24, 32, 44],
    seedCount: 8,
    bandReplicates: 8,
    withFloor: true,
    withFrechet: false,
    withZeroReference: true,
  });
}

describe("the permalink key table", () => {
  it("names every axis", () => {
    for (const key of AXIS_ORDER) {
      const queryKey = AXIS_QUERY_KEY[key];
      expect(queryKey.length).toBeGreaterThan(0);
    }
  });

  it("gives no two axes the same name", () => {
    const seen: string[] = [];
    for (const key of AXIS_ORDER) {
      const queryKey = AXIS_QUERY_KEY[key];
      expect(seen).not.toContain(queryKey);
      seen.push(queryKey);
    }
  });
});

describe("encoding and decoding", () => {
  it("round-trips every setting, byte for byte", () => {
    const original = awkward();
    const decoded = decodeSettings(encodeSettings(original));

    expect(decoded.notices).toEqual([]);
    for (const key of AXIS_ORDER) {
      expect(decoded.settings.axisValues[key]).toBe(original.axisValues[key]);
    }
    expect(decoded.settings.pedestriansSeeRobot).toBe(original.pedestriansSeeRobot);
    expect(decoded.settings.nearMissThresholdM).toBe(original.nearMissThresholdM);
    expect(decoded.settings.recoveryToleranceFraction).toBe(original.recoveryToleranceFraction);
    expect(decoded.settings.recoveryDwellSteps).toBe(original.recoveryDwellSteps);
    expect(decoded.settings.sweepAxis).toBe(original.sweepAxis);
    expect(decoded.settings.sweepValues).toEqual(original.sweepValues);
    expect(decoded.settings.seedCount).toBe(original.seedCount);
    expect(decoded.settings.bandReplicates).toBe(original.bandReplicates);
    expect(decoded.settings.withFloor).toBe(original.withFloor);
    expect(decoded.settings.withFrechet).toBe(original.withFrechet);
    expect(decoded.settings.withZeroReference).toBe(original.withZeroReference);
  });

  it("encodes the same settings to the same string every time", () => {
    const original = awkward();
    expect(encodeSettings(original)).toBe(encodeSettings(original));
  });

  it("tolerates a leading question mark", () => {
    const query = encodeSettings(awkward());
    expect(decodeSettings(`?${query}`).settings.seedCount).toBe(8);
  });

  it("carries no result, only the recipe", () => {
    const query = encodeSettings(awkward());
    expect(query).not.toMatch(/effect|forecast_value|band_value|true_/);
  });
});

describe("a hand-edited link", () => {
  it("ignores a key this bench does not have, and says so", () => {
    const result = decodeSettings("people=18&unicorns=7");
    expect(result.settings.axisValues.crowdSize).toBe(18);
    expect(result.notices.length).toBe(1);
    expect(result.notices[0]).toContain("unicorns");
  });

  it("brings an out-of-range value back into range, and says so", () => {
    const high = String(AXES.crowdSize.max + 1000);
    const result = decodeSettings(`people=${high}`);
    expect(result.settings.axisValues.crowdSize).toBe(AXES.crowdSize.max);
    expect(result.notices.length).toBe(1);
    expect(result.notices[0]).toContain(AXES.crowdSize.label);
  });

  it("brings a low value up, and says so", () => {
    const low = String(AXES.crowdSize.min - 1000);
    const result = decodeSettings(`people=${low}`);
    expect(result.settings.axisValues.crowdSize).toBe(AXES.crowdSize.min);
    expect(result.notices.length).toBe(1);
  });

  it("never throws, whatever is in it", () => {
    const hostile: readonly string[] = [
      "",
      "?",
      "people",
      "people=",
      "people=abc",
      "people=NaN",
      "people=Infinity",
      "vary=unicorns&values=1,2,3",
      "vary=people&values=",
      "vary=people&values=abc,def",
      "vary=people&values=999999,999999",
      "seeds=0",
      "seeds=-4",
      "seeds=99999",
      "band=1",
      "band=-3",
      "near_miss=0",
      "near_miss=-1",
      "recovery_dwell=0",
      "notice=maybe",
      "floor=yes",
      "zero=2",
      "people=18&people=44",
    ];
    for (const query of hostile) {
      const result = decodeSettings(query);
      expect(result.kind).toBe("decodeResult");
      expect(result.settings.kind).toBe("consoleSettings");
    }
  });

  it("drops a sweep whose values all fell outside the range", () => {
    const beyond = String(AXES.crowdSize.max + 5000);
    const result = decodeSettings(`vary=people&values=${beyond},${beyond}`);
    // Clamping collapsed both to the same number, which is not a curve.
    expect(result.settings.sweepValues.length).toBeLessThanOrEqual(1);
    expect(result.notices.length).toBeGreaterThan(0);
  });

  it("writes its notices in plain English", () => {
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    const result = decodeSettings(
      `people=${String(AXES.crowdSize.max + 10)}&seeds=99999&band=1¬ice=maybe`,
    );
    expect(result.notices.length).toBeGreaterThan(0);
    for (const notice of result.notices) {
      expect(identifier.test(notice), `"${notice}" carries a code identifier`).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/permalink.test.ts`
Expected: FAIL with `Failed to load url ../permalink.js (resolved id: ../permalink.js) in /Users/sanjay/projects/ProjOTW/mirn/web/app/console/__tests__/permalink.test.ts. Does the file exist?`

- [ ] **Step 3: Write the implementation**

```ts
// web/app/console/permalink.ts
import { AXES, AXIS_ORDER, type AxisKey } from "../../engine/job/axes.js";
import { DEFAULT_SETTINGS, makeConsoleSettings, type ConsoleSettings } from "./state.js";

/**
 * The link carries the recipe, never the results.
 *
 * Encoding a number would forge it: a URL saying the true effect was 0.352 m asserts a value the
 * current code did not produce, and after a formula changes the old link quotes the old answer
 * with the new page's authority. Determinism is what makes the recipe sufficient — reloading a
 * permalink shows an empty ledger and a primed Run that reproduces the sweep exactly.
 *
 * Decoding never throws. A hand-edited query string is a reader poking at a URL bar, not a
 * programming error, so an unknown key is ignored with a notice and an out-of-range value is
 * brought back into range with a notice. `makeConsoleSettings` still throws if this file ever
 * hands it something illegal, which would be a bug here rather than in the link.
 *
 * Numbers are written with `String`, which produces the shortest text that reads back as the
 * identical double, so the round trip is exact rather than approximately exact.
 */

export const AXIS_QUERY_KEY: Readonly<Record<AxisKey, string>> = Object.freeze({
  pushStrength: "space",
  crowdSize: "people",
  holdingLine: "hold_line",
  crowdFidget: "fidget",
  walkingPace: "pace",
  robotSpeed: "robot_speed",
  reactionTime: "reaction",
  politeness: "berth",
  perceptionError: "mis_sees",
  passingOffset: "offset",
  episodeSeconds: "episode",
  forecastHorizon: "horizon",
  forecastWindowEnd: "window_end",
});

const NOTICE_ROBOT = "notice";
const NEAR_MISS = "near_miss";
const RECOVERY_TOLERANCE = "recovery_tol";
const RECOVERY_DWELL = "recovery_dwell";
const VARY = "vary";
const VALUES = "values";
const SEEDS = "seeds";
const BAND = "band";
const FLOOR = "floor";
const FRECHET = "frechet";
const ZERO = "zero";

export const SETTING_QUERY_KEYS: readonly string[] = Object.freeze([
  NOTICE_ROBOT,
  NEAR_MISS,
  RECOVERY_TOLERANCE,
  RECOVERY_DWELL,
  VARY,
  VALUES,
  SEEDS,
  BAND,
  FLOOR,
  FRECHET,
  ZERO,
]);

export function encodeSettings(settings: ConsoleSettings): string {
  const parts: string[] = [];
  for (const key of AXIS_ORDER) {
    parts.push(`${AXIS_QUERY_KEY[key]}=${String(settings.axisValues[key])}`);
  }
  parts.push(`${NOTICE_ROBOT}=${settings.pedestriansSeeRobot ? "1" : "0"}`);
  parts.push(`${NEAR_MISS}=${String(settings.nearMissThresholdM)}`);
  parts.push(`${RECOVERY_TOLERANCE}=${String(settings.recoveryToleranceFraction)}`);
  parts.push(`${RECOVERY_DWELL}=${String(settings.recoveryDwellSteps)}`);

  if (settings.sweepAxis !== null) {
    parts.push(`${VARY}=${AXIS_QUERY_KEY[settings.sweepAxis]}`);
    const values: string[] = [];
    for (const value of settings.sweepValues) {
      values.push(String(value));
    }
    // A comma is legal unencoded in a query string, and a readable link is worth keeping.
    parts.push(`${VALUES}=${values.join(",")}`);
  }

  parts.push(`${SEEDS}=${String(settings.seedCount)}`);
  parts.push(`${BAND}=${String(settings.bandReplicates)}`);
  parts.push(`${FLOOR}=${settings.withFloor ? "1" : "0"}`);
  parts.push(`${FRECHET}=${settings.withFrechet ? "1" : "0"}`);
  parts.push(`${ZERO}=${settings.withZeroReference ? "1" : "0"}`);
  return parts.join("&");
}

export interface DecodeResult {
  readonly kind: "decodeResult";
  readonly settings: ConsoleSettings;
  readonly notices: readonly string[];
}

function readFlag(
  params: URLSearchParams,
  name: string,
  fallback: boolean,
  label: string,
  notices: string[],
): boolean {
  const raw = params.get(name);
  if (raw === null) {
    return fallback;
  }
  if (raw === "1") {
    return true;
  }
  if (raw === "0") {
    return false;
  }
  notices.push(
    `${label} was written in the link as something that is neither on nor off, so it was left ` +
      `as it was.`,
  );
  return fallback;
}

function readBounded(
  params: URLSearchParams,
  name: string,
  fallback: number,
  low: number,
  high: number,
  wholeNumber: boolean,
  label: string,
  notices: string[],
): number {
  const raw = params.get(name);
  if (raw === null) {
    return fallback;
  }
  const parsed = Number(raw);
  if (raw.length === 0 || !Number.isFinite(parsed)) {
    notices.push(`${label} was not a number in the link, so it was left at ${String(fallback)}.`);
    return fallback;
  }
  let value = parsed;
  if (wholeNumber) {
    value = Math.round(value);
  }
  if (value < low) {
    notices.push(
      `${label} was ${String(parsed)} in the link, below the lowest this bench allows, so it was ` +
        `brought up to ${String(low)}.`,
    );
    return low;
  }
  if (value > high) {
    notices.push(
      `${label} was ${String(parsed)} in the link, above the highest this bench allows, so it ` +
        `was brought down to ${String(high)}.`,
    );
    return high;
  }
  return value;
}

export function decodeSettings(query: string): DecodeResult {
  const trimmed = query.startsWith("?") ? query.slice(1) : query;
  const params = new URLSearchParams(trimmed);
  const notices: string[] = [];

  const known = new Set<string>();
  for (const key of AXIS_ORDER) {
    known.add(AXIS_QUERY_KEY[key]);
  }
  for (const name of SETTING_QUERY_KEYS) {
    known.add(name);
  }
  const alreadyReported = new Set<string>();
  for (const name of params.keys()) {
    if (!known.has(name) && !alreadyReported.has(name)) {
      alreadyReported.add(name);
      notices.push(
        `The link carried a setting this bench does not have, written as "${name}". It was ignored.`,
      );
    }
  }

  const axisValues: Record<AxisKey, number> = { ...DEFAULT_SETTINGS.axisValues };
  for (const key of AXIS_ORDER) {
    const entry = AXES[key];
    const raw = params.get(AXIS_QUERY_KEY[key]);
    if (raw === null) {
      continue;
    }
    const parsed = Number(raw);
    if (raw.length === 0 || !Number.isFinite(parsed)) {
      notices.push(
        `${entry.label} was not a number in the link, so it was left at ` +
          `${String(entry.defaultValue)}.`,
      );
      continue;
    }
    if (parsed < entry.min) {
      notices.push(
        `${entry.label} was ${String(parsed)} in the link, below the lowest this bench allows, ` +
          `so it was brought up to ${String(entry.min)}.`,
      );
      axisValues[key] = entry.min;
      continue;
    }
    if (parsed > entry.max) {
      notices.push(
        `${entry.label} was ${String(parsed)} in the link, above the highest this bench allows, ` +
          `so it was brought down to ${String(entry.max)}.`,
      );
      axisValues[key] = entry.max;
      continue;
    }
    axisValues[key] = parsed;
  }

  let sweepAxis: AxisKey | null = null;
  const varyRaw = params.get(VARY);
  if (varyRaw !== null) {
    for (const key of AXIS_ORDER) {
      if (AXIS_QUERY_KEY[key] === varyRaw) {
        sweepAxis = key;
      }
    }
    if (sweepAxis === null) {
      notices.push(
        `The link asked to vary something this bench cannot vary, written as "${varyRaw}". ` +
          `Nothing is being varied.`,
      );
    }
  }

  const sweepValues: number[] = [];
  if (sweepAxis !== null) {
    const entry = AXES[sweepAxis];
    const valuesRaw = params.get(VALUES);
    const gathered: number[] = [];
    if (valuesRaw !== null) {
      for (const piece of valuesRaw.split(",")) {
        const parsed = Number(piece);
        if (piece.length === 0 || !Number.isFinite(parsed)) {
          notices.push(
            `One of the values to vary ${entry.label.toLowerCase()} over was not a number, so ` +
              `it was dropped.`,
          );
          continue;
        }
        let value = parsed;
        if (value < entry.min) {
          notices.push(
            `One of the values to vary ${entry.label.toLowerCase()} over was ${String(parsed)}, ` +
              `below the lowest this bench allows, so it was brought up to ${String(entry.min)}.`,
          );
          value = entry.min;
        }
        if (value > entry.max) {
          notices.push(
            `One of the values to vary ${entry.label.toLowerCase()} over was ${String(parsed)}, ` +
              `above the highest this bench allows, so it was brought down to ` +
              `${String(entry.max)}.`,
          );
          value = entry.max;
        }
        gathered.push(value);
      }
    }
    gathered.sort((a, b) => a - b);
    for (const value of gathered) {
      const last = sweepValues[sweepValues.length - 1];
      if (last !== undefined && last === value) {
        notices.push(
          `Two of the values to vary ${entry.label.toLowerCase()} over ended up the same once ` +
            `they were brought into range, so one was dropped.`,
        );
        continue;
      }
      sweepValues.push(value);
    }
    if (sweepValues.length === 0) {
      notices.push(
        `The link asked to vary ${entry.label.toLowerCase()} but gave no usable values, so ` +
          `nothing is being varied.`,
      );
      sweepAxis = null;
    }
  }

  const pedestriansSeeRobot = readFlag(
    params,
    NOTICE_ROBOT,
    DEFAULT_SETTINGS.pedestriansSeeRobot,
    "Whether the people notice the robot",
    notices,
  );
  const nearMissThresholdM = readBounded(
    params,
    NEAR_MISS,
    DEFAULT_SETTINGS.nearMissThresholdM,
    0.05,
    5,
    false,
    "The near-miss line",
    notices,
  );
  const recoveryToleranceFraction = readBounded(
    params,
    RECOVERY_TOLERANCE,
    DEFAULT_SETTINGS.recoveryToleranceFraction,
    0.01,
    1,
    false,
    "The recovery tolerance",
    notices,
  );
  const recoveryDwellSteps = readBounded(
    params,
    RECOVERY_DWELL,
    DEFAULT_SETTINGS.recoveryDwellSteps,
    1,
    400,
    true,
    "The recovery dwell",
    notices,
  );
  const seedCount = readBounded(
    params,
    SEEDS,
    DEFAULT_SETTINGS.seedCount,
    1,
    32,
    true,
    "The number of seeds",
    notices,
  );

  let bandReplicates = readBounded(
    params,
    BAND,
    DEFAULT_SETTINGS.bandReplicates,
    0,
    32,
    true,
    "The number of band replicates",
    notices,
  );
  if (bandReplicates === 1) {
    notices.push(
      `The link asked for a single band replicate, which has nothing to compare against, so the ` +
        `ordinary difference between two runs is not being measured.`,
    );
    bandReplicates = 0;
  }

  const withFloor = readFlag(params, FLOOR, DEFAULT_SETTINGS.withFloor, "The detection floor", notices);
  const withFrechet = readFlag(params, FRECHET, DEFAULT_SETTINGS.withFrechet, "The Frechet ruler", notices);
  const withZeroReference = readFlag(
    params,
    ZERO,
    DEFAULT_SETTINGS.withZeroReference,
    "The zero-effect reference run",
    notices,
  );

  const settings = makeConsoleSettings({
    axisValues,
    pedestriansSeeRobot,
    nearMissThresholdM,
    recoveryToleranceFraction,
    recoveryDwellSteps,
    sweepAxis,
    sweepValues,
    seedCount,
    bandReplicates,
    withFloor,
    withFrechet,
    withZeroReference,
  });

  return Object.freeze({
    kind: "decodeResult" as const,
    settings,
    notices: Object.freeze(notices),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/permalink.test.ts`
Expected: 11 passed.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm run typecheck && npm run test`
Expected: typecheck silent; both vitest projects green.

- [ ] **Step 6: Commit**

```bash
git add web/app/console/permalink.ts web/app/console/__tests__/permalink.test.ts
git commit -m "Put the recipe in the link, and nothing that could pass for a result"
```

---

### Task 21: CSV export with its provenance block

**Files:**
- Create: `web/app/console/csv.ts`
- Test: `web/app/console/__tests__/csv.test.ts`

**Interfaces:**
- Consumes, from Task 11 `web/engine/job/columns.ts`: `type ColumnKey` (the literal union), `type UnitKey = "metres" | "seconds" | "count" | "ratio" | "people" | "none"`, `COLUMNS: Readonly<Record<ColumnKey, ColumnDescriptor>>` (fields used here: `.label`, `.unit`), `HEADLINE_COLUMNS: readonly ColumnKey[]`.
- Consumes, from Task 14 `web/engine/job/spec.ts`: `type SweepJob`, `type MeasurementParams`, `type FloorParams`, `makeSweepJob(init: SweepJobInit): SweepJob` where `SweepJobInit` is `SweepJob`'s fields minus `kind`, `seedFor(job: SweepJob, seedIndex: number): number`.
- Consumes, from Task 12 `web/engine/job/axes.ts`: `type AxisKey`, `AXES: Readonly<Record<AxisKey, AxisEntry>>` (fields used here: `.label`, `.unit`).
- Consumes, from Task 15 `web/engine/job/runner.ts`: `type RunRow`, `type RunKey`, `accumulate(rows, columns): ReadonlyMap<number, Readonly<Partial<Record<ColumnKey, Aggregate>>>>`. **This module calls `accumulate` and never groups rows itself** — that is mandatory fix 7, and it is the only reason `table.ts` and this file can never disagree.
- Consumes, from Task 16 `web/engine/job/stats.ts`: `interface Aggregate { value; sd; nUsed; nAttempted; reason: AggregateReason }` where `AggregateReason` is a discriminated union whose `kind` is `"measured" | "censored" | "notApplicable"` and whose non-measured variants carry `readonly why: string` (the same three-valued shape as `Availability` in §5.2, propagated by `accumulate`).
- Consumes, from `web/engine/contracts/config.ts`: `type RunConfigOverrides`; from `web/engine/contracts/pairedRun.ts`: `type TreatmentSpec`; from `web/engine/core/errors.ts`: `ContractError`, `fail(message: string): never`.
- Produces, relied on by Task 23 and by the ledger-bar task: `INVENTED_CROWD_DISCLOSURE: string`, `DISCLOSURE_CLAUSES: readonly string[]`, `interface CsvOptions { readonly kind: "csvOptions"; readonly granularity: "cell" | "run"; readonly generatedAtIso: string }`, `makeCsvOptions(init: { granularity?: "cell" | "run"; generatedAtIso: string }): CsvOptions`, `toCsv(job: SweepJob, rows: readonly RunRow[], options: CsvOptions): string`.

The clock is injected as `generatedAtIso` rather than read from `new Date()` inside the module, because a file that changes its bytes every time it is written cannot be tested for anything except its own timestamp.

- [ ] **Step 1: Write the failing test**

```ts
// web/app/console/__tests__/csv.test.ts
import { describe, expect, it } from "vitest";
import { makeSweepJob } from "../../../engine/job/spec.js";
import type { SweepJob } from "../../../engine/job/spec.js";
import type { RunRow } from "../../../engine/job/runner.js";
import type { Reading } from "../../../engine/job/columns.js";
import { DISCLOSURE_CLAUSES, INVENTED_CROWD_DISCLOSURE, makeCsvOptions, toCsv } from "../csv.js";

/**
 * The CSV is the one surface that outlives the page it came from. A spreadsheet has no standing
 * disclosure line, no expander and no tile, so every obligation the console discharges by
 * adjacency this file has to discharge in text: what the crowd is, what a row means, which seeds
 * produced it, and what a marker in a numeric column stands for.
 */

const AT = "2026-08-22T09:41:07.000Z";

function measured(value: number): Reading {
  return { kind: "reading", value, availability: { kind: "measured" } };
}

function censored(why: string): Reading {
  return { kind: "reading", value: NaN, availability: { kind: "censored", why } };
}

function job(): SweepJob {
  return makeSweepJob({
    base: { crowd: { nPedestrians: 18 } },
    axis: "crowdSize",
    axisValues: [4, 18],
    seedIndices: [0, 1],
    baseSeed: 20260816,
    seedStride: 7919,
    measurement: {
      kind: "measurementParams",
      forecastHorizonSteps: 60,
      forecastEndStep: 200,
      nearMissThresholdM: 0.5,
      recoveryToleranceFraction: 0.2,
      recoveryDwellSteps: 20,
    },
    columns: ["trueEffectM", "forecastM", "runToRunBandM"],
    bandReplicates: { n: 8, scope: "perCell" },
    floor: null,
    zeroReferenceRun: true,
    frechet: false,
  });
}

function rows(): readonly RunRow[] {
  return [
    {
      kind: "runRow",
      key: { axisIndex: 0, axisValue: 4, seedIndex: 0 },
      readings: {
        trueEffectM: measured(0.153),
        forecastM: measured(0.201),
        runToRunBandM: measured(0.172),
      },
    },
    {
      kind: "runRow",
      key: { axisIndex: 0, axisValue: 4, seedIndex: 1 },
      readings: {
        trueEffectM: measured(0.161),
        forecastM: measured(0.209),
        runToRunBandM: measured(0.174),
      },
    },
    {
      kind: "runRow",
      key: { axisIndex: 1, axisValue: 18, seedIndex: 0 },
      readings: {
        trueEffectM: measured(0.352),
        forecastM: censored("the forecast window ended before this crowd started moving"),
        runToRunBandM: measured(0.311),
      },
    },
    {
      kind: "runRow",
      key: { axisIndex: 1, axisValue: 18, seedIndex: 1 },
      readings: {
        trueEffectM: measured(0.344),
        forecastM: censored("the forecast window ended before this crowd started moving"),
        runToRunBandM: measured(0.309),
      },
    },
  ];
}

describe("the CSV discloses before it reports", () => {
  it("puts the invented-crowd line on line 1, before any header or number", () => {
    const text = toCsv(job(), rows(), makeCsvOptions({ generatedAtIso: AT }));
    const lines = text.split("\n");
    expect(lines[0]).toBe(`# ${INVENTED_CROWD_DISCLOSURE}`);
    for (const clause of DISCLOSURE_CLAUSES) {
      expect(lines[0]).toContain(clause);
    }
  });

  it("carries every provenance field the numbers cannot be read without", () => {
    const text = toCsv(job(), rows(), makeCsvOptions({ generatedAtIso: AT }));
    const header = text.split("\n").filter((line) => line.startsWith("#")).join("\n");

    expect(header).toContain("generated: 2026-08-22T09:41:07.000Z");
    expect(header).toContain("one row per axis value, aggregated over that value's seeds");
    expect(header).toContain("varying: how many people are in the room");
    expect(header).toContain("values: 4, 18");
    expect(header).toContain("seed = 20260816 + 7919 x seed index");
    expect(header).toContain("seed indices: 0, 1");
    expect(header).toContain("the same room run twice, once with a robot and once without");
    expect(header).toContain("forecast horizon: 60 steps (3.00 s)");
    expect(header).toContain("forecaster evaluated at step 200");
    expect(header).toContain("run-to-run band: 8 replicates, measured once per axis value");
    expect(header).toContain("detection floor: not measured");
    expect(header).toContain("completeness: 2 of 2 axis values returned at least one run");
    expect(header).toContain("completeness: 4 of 4 runs returned");
    expect(header).toContain('marker "censored:');
    expect(header).toContain('marker "not applicable:');
    expect(header).toContain('marker "no runs"');
    expect(header).toContain('marker "spread not defined below two runs"');
  });

  it("exports a censored cell as its reason and never as a bare number", () => {
    const text = toCsv(job(), rows(), makeCsvOptions({ generatedAtIso: AT }));
    const dataLines = text.split("\n").filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(dataLines.length).toBe(3); // one header row, two cells

    const cell18 = dataLines[2] as string;
    expect(cell18).toContain("censored: the forecast window ended before this crowd started moving");
    // The reason is in the value field, so nothing downstream can read a number out of it.
    const fields = cell18.split(",");
    for (const field of fields) {
      if (field.includes("censored")) {
        expect(Number.isNaN(Number(field.replaceAll('"', "")))).toBe(true);
      }
    }
  });

  it("names every column in plain English, never by its key", () => {
    const text = toCsv(job(), rows(), makeCsvOptions({ generatedAtIso: AT }));
    const headerRow = text.split("\n").filter((l) => l.length > 0 && !l.startsWith("#"))[0] as string;
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    expect(identifier.exec(headerRow)).toBeNull();
  });

  it("exports per seed as a free variant, one row per run, with the seed spelled out", () => {
    const text = toCsv(job(), rows(), makeCsvOptions({ granularity: "run", generatedAtIso: AT }));
    const header = text.split("\n").filter((line) => line.startsWith("#")).join("\n");
    expect(header).toContain("one row per run: one axis value at one seed");

    const dataLines = text.split("\n").filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(dataLines.length).toBe(5); // header row plus four runs
    expect(dataLines[1]).toContain("20260816");
    expect(dataLines[2]).toContain("20268735");
  });

  it("quotes a field containing a comma so the reason cannot split a row", () => {
    const withComma: readonly RunRow[] = [
      {
        kind: "runRow",
        key: { axisIndex: 0, axisValue: 4, seedIndex: 0 },
        readings: { trueEffectM: censored("nobody moved, so there was nothing to difference") },
      },
    ];
    const text = toCsv(job(), withComma, makeCsvOptions({ generatedAtIso: AT }));
    expect(text).toContain('"censored: nobody moved, so there was nothing to difference"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/csv.test.ts`
Expected: FAIL with `Error: Failed to resolve import "../csv.js" from "web/app/console/__tests__/csv.test.ts". Does the file exist?`

- [ ] **Step 3: Write minimal implementation**

```ts
// web/app/console/csv.ts
import { fail } from "../../engine/core/errors.js";
import { AXES } from "../../engine/job/axes.js";
import { COLUMNS, type ColumnKey, type UnitKey } from "../../engine/job/columns.js";
import { accumulate, type RunRow } from "../../engine/job/runner.js";
import type { Aggregate } from "../../engine/job/stats.js";
import { seedFor, type SweepJob } from "../../engine/job/spec.js";

/**
 * The export, and the one surface where the standing disclosure line cannot stand.
 *
 * A page carries its honesty by adjacency: the invented-crowd sentence sits above the arena and
 * every tile carries its own zero one interaction away. A file has none of that. It gets opened
 * in a spreadsheet six months later by somebody who never saw the page, so everything the page
 * says by being a page this file has to say in words, in its own first lines.
 *
 * Grouping lives in `accumulate`, in runner.ts, and is not reimplemented here. The ledger and
 * this file call the same function on the same rows, which is what makes "the table disagrees
 * with the CSV" impossible rather than merely unlikely.
 */

export const INVENTED_CROWD_DISCLOSURE =
  "Everything in this file is simulated. The crowd is a social-force model - invented people " +
  "obeying invented rules - and no number here is a measurement of real pedestrians. What is " +
  "real is the ruler: the same room is run twice, once with a robot and once without, from the " +
  "same starting positions and the same random wobble, and the difference between a person's " +
  "two paths is the robot's effect on them.";

/**
 * The clauses the disclosure must contain wherever it appears. The page says "on this page" and
 * the file says "in this file", so the two sentences are not identical and cannot be compared
 * whole; these are the parts that carry the obligation, and `console.html` is checked against
 * this list rather than against a copy of the sentence.
 */
export const DISCLOSURE_CLAUSES: readonly string[] = Object.freeze([
  "simulated",
  "social-force model",
  "invented people obeying invented rules",
  "no number here is a measurement of real pedestrians",
]);

export interface CsvOptions {
  readonly kind: "csvOptions";
  readonly granularity: "cell" | "run";
  readonly generatedAtIso: string;
}

export function makeCsvOptions(init: {
  granularity?: "cell" | "run";
  generatedAtIso: string;
}): CsvOptions {
  const granularity = init.granularity ?? "cell";
  if (granularity !== "cell" && granularity !== "run") {
    fail(`CsvOptions.granularity must be "cell" or "run", got ${String(granularity)}`);
  }
  if (init.generatedAtIso.length === 0) {
    fail("CsvOptions.generatedAtIso must be a non-empty timestamp");
  }
  return Object.freeze({ kind: "csvOptions" as const, granularity, generatedAtIso: init.generatedAtIso });
}

const NO_RUNS = "no runs";
const NO_SPREAD = "spread not defined below two runs";

function csvField(text: string): string {
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function formatValue(unit: UnitKey, value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (unit === "metres") {
    return value.toFixed(4);
  }
  if (unit === "seconds") {
    return value.toFixed(2);
  }
  if (unit === "count" || unit === "people") {
    return String(Math.round(value));
  }
  if (unit === "ratio") {
    return value.toFixed(3);
  }
  return String(value);
}

function aggregateFields(key: ColumnKey, entry: Aggregate | undefined): readonly string[] {
  const descriptor = COLUMNS[key];
  if (entry === undefined) {
    return [csvField(NO_RUNS), csvField(NO_RUNS), "0", "0"];
  }
  const reason = entry.reason;
  if (reason.kind === "censored") {
    return [csvField(`censored: ${reason.why}`), "", String(entry.nUsed), String(entry.nAttempted)];
  }
  if (reason.kind === "notApplicable") {
    return [
      csvField(`not applicable: ${reason.why}`),
      "",
      String(entry.nUsed),
      String(entry.nAttempted),
    ];
  }
  if (reason.kind !== "measured") {
    fail(`unknown aggregate reason kind on column ${key}`);
  }
  const spread = Number.isFinite(entry.sd)
    ? formatValue(descriptor.unit, entry.sd)
    : csvField(NO_SPREAD);
  return [
    formatValue(descriptor.unit, entry.value),
    spread,
    String(entry.nUsed),
    String(entry.nAttempted),
  ];
}

function readingField(key: ColumnKey, row: RunRow): string {
  const descriptor = COLUMNS[key];
  const reading = row.readings[key];
  if (reading === undefined) {
    return csvField(NO_RUNS);
  }
  const availability = reading.availability;
  if (availability.kind === "censored") {
    return csvField(`censored: ${availability.why}`);
  }
  if (availability.kind === "notApplicable") {
    return csvField(`not applicable: ${availability.why}`);
  }
  return formatValue(descriptor.unit, reading.value);
}

function treatmentSentence(job: SweepJob): string {
  const treatment = job.base.treatment;
  const kind = treatment === undefined ? "robot-presence" : treatment.kind;
  if (kind === "robot-presence") {
    return "the same room run twice, once with a robot and once without";
  }
  if (kind === "disturbance") {
    return "the same room run twice, with the robot present in both runs and shoved in one";
  }
  return "the same room run twice with nothing done differently in either run";
}

function axisSentence(job: SweepJob): readonly string[] {
  if (job.axis === null) {
    return [
      "# varying: nothing - one setting, run at every seed listed below",
      `# values: ${job.axisValues.join(", ")}`,
    ];
  }
  const entry = AXES[job.axis];
  return [
    `# varying: ${entry.label}`,
    `# values: ${job.axisValues.join(", ")}`,
  ];
}

function bandSentence(job: SweepJob): string {
  const band = job.bandReplicates;
  if (band === null) {
    return "# run-to-run band: not measured";
  }
  const scope = band.scope === "perCell" ? "once per axis value" : "once per seed";
  return `# run-to-run band: ${band.n} replicates, measured ${scope}`;
}

function floorSentence(job: SweepJob): string {
  const floor = job.floor;
  if (floor === null) {
    return "# detection floor: not measured";
  }
  return (
    `# detection floor: ${floor.nSplits} splits at the ` +
    `${((1 - floor.alpha) * 100).toFixed(0)}th percentile, every ${floor.strideSteps} steps, ` +
    `permutation seed ${floor.permutationSeed}`
  );
}

function provenance(job: SweepJob, rows: readonly RunRow[], options: CsvOptions): readonly string[] {
  const cellsExpected = job.axisValues.length;
  const runsExpected = cellsExpected * job.seedIndices.length;
  const seen = new Set<number>();
  for (const row of rows) {
    seen.add(row.key.axisIndex);
  }
  const horizonSeconds = job.measurement.forecastHorizonSteps * 0.05;
  const rowSemantics =
    options.granularity === "cell"
      ? "# rows: one row per axis value, aggregated over that value's seeds"
      : "# rows: one row per run: one axis value at one seed";

  const lines: string[] = [
    `# ${INVENTED_CROWD_DISCLOSURE}`,
    `# generated: ${options.generatedAtIso}`,
    rowSemantics,
  ];
  for (const line of axisSentence(job)) {
    lines.push(line);
  }
  lines.push(`# seeds: seed = ${job.baseSeed} + ${job.seedStride} x seed index`);
  lines.push(`# seed indices: ${job.seedIndices.join(", ")}`);
  lines.push(`# treatment: ${treatmentSentence(job)}`);
  lines.push(
    `# forecast horizon: ${job.measurement.forecastHorizonSteps} steps ` +
      `(${horizonSeconds.toFixed(2)} s); forecaster evaluated at step ${job.measurement.forecastEndStep}`,
  );
  lines.push(bandSentence(job));
  lines.push(floorSentence(job));
  lines.push(
    `# zero-effect reference run: ${job.zeroReferenceRun ? "measured at each axis value" : "not measured"}`,
  );
  lines.push(`# completeness: ${seen.size} of ${cellsExpected} axis values returned at least one run`);
  lines.push(`# completeness: ${rows.length} of ${runsExpected} runs returned`);
  lines.push(
    '# marker "censored: ...": the measurement ran and no value existed for this room; the reason follows the colon',
  );
  lines.push(
    '# marker "not applicable: ...": the quantity does not exist under this experiment\'s design; the reason follows the colon',
  );
  lines.push(`# marker "${NO_RUNS}": no run in this cell reported this column at all`);
  lines.push(`# marker "${NO_SPREAD}": fewer than two runs survived, so a spread would be invented`);
  return lines;
}

function unitSuffix(unit: UnitKey): string {
  if (unit === "none") {
    return "";
  }
  return ` (${unit})`;
}

function cellRows(job: SweepJob, rows: readonly RunRow[]): readonly string[] {
  const grouped = accumulate(rows, job.columns);
  const header: string[] = [csvField(job.axis === null ? "setting" : AXES[job.axis].label)];
  for (const key of job.columns) {
    const descriptor = COLUMNS[key];
    const name = `${descriptor.label}${unitSuffix(descriptor.unit)}`;
    header.push(csvField(name));
    header.push(csvField(`${name}, spread across seeds`));
    header.push(csvField(`${name}, runs used`));
    header.push(csvField(`${name}, runs attempted`));
  }

  const indices: number[] = [];
  for (const axisIndex of grouped.keys()) {
    indices.push(axisIndex);
  }
  indices.sort((a, b) => a - b);

  const out: string[] = [header.join(",")];
  for (const axisIndex of indices) {
    const byColumn = grouped.get(axisIndex);
    const axisValue = job.axisValues[axisIndex];
    const fields: string[] = [axisValue === undefined ? "" : String(axisValue)];
    for (const key of job.columns) {
      const entry = byColumn === undefined ? undefined : byColumn[key];
      for (const field of aggregateFields(key, entry)) {
        fields.push(field);
      }
    }
    out.push(fields.join(","));
  }
  return out;
}

function runRows(job: SweepJob, rows: readonly RunRow[]): readonly string[] {
  const header: string[] = [
    csvField(job.axis === null ? "setting" : AXES[job.axis].label),
    "seed index",
    "seed",
  ];
  for (const key of job.columns) {
    const descriptor = COLUMNS[key];
    header.push(csvField(`${descriptor.label}${unitSuffix(descriptor.unit)}`));
  }

  const sorted: RunRow[] = [...rows];
  sorted.sort((a, b) => {
    if (a.key.axisIndex !== b.key.axisIndex) {
      return a.key.axisIndex - b.key.axisIndex;
    }
    return a.key.seedIndex - b.key.seedIndex;
  });

  const out: string[] = [header.join(",")];
  for (const row of sorted) {
    const fields: string[] = [
      String(row.key.axisValue),
      String(row.key.seedIndex),
      String(seedFor(job, row.key.seedIndex)),
    ];
    for (const key of job.columns) {
      fields.push(readingField(key, row));
    }
    out.push(fields.join(","));
  }
  return out;
}

export function toCsv(job: SweepJob, rows: readonly RunRow[], options: CsvOptions): string {
  const lines: string[] = [...provenance(job, rows, options)];
  const body = options.granularity === "cell" ? cellRows(job, rows) : runRows(job, rows);
  for (const line of body) {
    lines.push(line);
  }
  return `${lines.join("\n")}\n`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/csv.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add web/app/console/csv.ts web/app/console/__tests__/csv.test.ts
git commit -m "Export a CSV that says what it is before it says a number

The page carries its honesty by adjacency; a file opened six months later
in a spreadsheet has no arena above it and no expander beside it. So the
invented-crowd line is line 1, and the provenance block spells out row
semantics, axis, seed derivation, treatment, horizon, band scope, floor
and completeness. Grouping is accumulate() from runner.ts, called, never
reimplemented - the ledger and this file cannot disagree."
```

---

### Task 22: the sweep curve — what `web/ui/plot.ts` needs before it can draw one

**Files:**
- Modify: `web/ui/plot.ts:1` (drop the unused `SERIES` import, add `FONT_MONO`)
- Modify: `web/ui/plot.ts:11-25` (add `PlotRegion`, add `PlotView.regions`)
- Modify: `web/ui/plot.ts:59-70` (fold regions into the y-scale)
- Modify: `web/ui/plot.ts:82` (remove the `getComputedStyle(document…)` call)
- Modify: `web/ui/plot.ts:117-124` (draw regions beneath the series)
- Modify: `web/ui/plot.ts:167-183` (break a polyline at a non-finite value instead of bridging it)
- Test: `web/ui/plot.test.ts`

**Interfaces:**

The module's real shapes today, quoted from `web/ui/plot.ts:11-25`:

```ts
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
```

and `export function drawSweep(context: CanvasRenderingContext2D, view: PlotView, width: number, height: number): void`.

**It does not already suffice. Four things are missing, and one of them means the module cannot currently be tested at all.**

1. **`drawSweep` reads the DOM.** Line 82 is `context.font = \`10px ${getComputedStyle(document.documentElement).getPropertyValue("--mirn-font-mono") || "monospace"}\``. The `ui` vitest project runs `environment: "node"` (`vitest.workspace.ts:16-24`), so `document` is undefined and any test of `drawSweep` throws `ReferenceError` before it draws a mark. That is why `plot.ts` is the only `web/ui/` module with no `.test.ts` beside it. `web/ui/theme.ts:70` already exports `FONT_MONO`, and `--mirn-font-mono` is emitted *from* that constant by `cssTokens()`, so reading it back out of the cascade is a round trip through the DOM to fetch a value the module could have imported. Import it.
2. **There is no region primitive.** `PlotSeries.sd` draws `value ± sd` around a line — a ribbon centred on a series. The run-to-run band is not that. It is a floor: a filled area from zero up to a per-axis-value height, measured separately at each axis value (§3.2: 0.172 m at 4 people, 0.462 m at 44), against which the two lines are read. Rendering it as a series with `sd = values` and `values = 0` would put a line at zero the plot does not mean.
3. **The y-scale ignores anything but series.** Lines 59-70 walk `view.series` only. A band region taller than both lines is drawn off the top of the frame: with band 0.80 and a top series value 0.30, `niceCeiling(0.30)` is 0.5 and the region's top edge lands at y = -143.2 against a frame top of 14. Verified by arithmetic against the real `niceCeiling` and the real frame `{ left: 56, right: width-12, top: 14, bottom: height-44 }`.
4. **A non-finite value bridges the gap instead of breaking the line.** Lines 167-183 `continue` past a `NaN` without clearing `started`, so the next finite point draws a straight segment across it. On the console that segment is a censored cell rendered as a value — the exact thing §6.5 forbids everywhere else.

- Consumes: `PALETTE` and `FONT_MONO` from `web/ui/theme.ts`.
- Produces, relied on by the sweep-curve mount: `interface PlotRegion { readonly kind: "plotRegion"; readonly key: string; readonly label: string; readonly upper: readonly number[]; readonly lower: readonly number[] | null }` and `readonly regions?: readonly PlotRegion[]` on `PlotView`. `regions` is optional because `web/notes.ts:660` still constructs a `PlotView` literal in commit 2 and `exactOptionalPropertyTypes` lets it keep omitting the field; commit 3 deletes that caller.

- [ ] **Step 1: Write the failing test**

```ts
// web/ui/plot.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/ui/plot.test.ts`
Expected: FAIL with `ReferenceError: document is not defined` from `web/ui/plot.ts:82`, on every one of the five cases.

- [ ] **Step 3: Write minimal implementation**

Replace `web/ui/plot.ts:1` with:

```ts
import { FONT_MONO, PALETTE } from "./theme.js";
```

Replace `web/ui/plot.ts:11-25` (the two interfaces) with:

```ts
export interface PlotSeries {
  readonly key: string;
  readonly label: string;
  readonly values: readonly number[];
  /** Optional per-point standard deviation, drawn as a band. */
  readonly sd?: readonly number[];
  readonly accent?: boolean;
}

/**
 * A filled area rather than a line: the run-to-run band, which is a floor the two lines are read
 * against and not a spread around either of them.
 *
 * `upper` is per point because the band is measured separately at every axis value. Crowd size
 * moves it from 0.172 m at 4 people to 0.462 m at 44, so one flat line drawn across a people
 * sweep would be a false floor at both ends. `lower: null` means the x axis.
 */
export interface PlotRegion {
  readonly kind: "plotRegion";
  readonly key: string;
  readonly label: string;
  readonly upper: readonly number[];
  readonly lower: readonly number[] | null;
}

export interface PlotView {
  readonly x: readonly number[];
  readonly xLabel: string;
  readonly yLabel: string;
  readonly series: readonly PlotSeries[];
  /** Optional so the notes' existing call sites keep compiling until they are deleted. */
  readonly regions?: readonly PlotRegion[];
}
```

Replace the y-scale walk at `web/ui/plot.ts:59-70` with:

```ts
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
  const regions = view.regions ?? [];
  for (const region of regions) {
    for (let i = 0; i < region.upper.length; i++) {
      const top = region.upper[i] as number;
      if (Number.isFinite(top) && top > yMax) {
        yMax = top;
      }
    }
  }
  yMax = niceCeiling(yMax);
```

Replace `web/ui/plot.ts:82` with:

```ts
  context.font = `10px ${FONT_MONO}`;
```

Insert, immediately before the `// Series.` comment at `web/ui/plot.ts:117`:

```ts
  // Regions first, so every line is drawn on top of the floor it is read against.
  for (const region of regions) {
    context.fillStyle = PALETTE.grid;
    context.beginPath();
    for (let i = 0; i < view.x.length; i++) {
      const top = region.upper[i] ?? 0;
      const px = sx(view.x[i] as number);
      const py = sy(Number.isFinite(top) ? top : 0);
      if (i === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    for (let i = view.x.length - 1; i >= 0; i--) {
      const floor = region.lower === null ? 0 : (region.lower[i] ?? 0);
      context.lineTo(sx(view.x[i] as number), sy(Number.isFinite(floor) ? floor : 0));
    }
    context.closePath();
    context.fill();

    context.strokeStyle = PALETTE.rule;
    context.lineWidth = 1;
    context.setLineDash([2, 3]);
    context.beginPath();
    for (let i = 0; i < view.x.length; i++) {
      const top = region.upper[i] ?? 0;
      const px = sx(view.x[i] as number);
      const py = sy(Number.isFinite(top) ? top : 0);
      if (i === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    context.stroke();
    context.setLineDash([]);
  }
```

Replace the polyline loop at `web/ui/plot.ts:167-183` with:

```ts
    context.strokeStyle = stroke;
    context.lineWidth = isAccent ? 2 : 1.5;
    context.setLineDash(dash);
    context.beginPath();
    let started = false;
    for (let i = 0; i < view.x.length; i++) {
      const value = s.values[i] as number;
      if (!Number.isFinite(value)) {
        // A gap, not a shortcut. Bridging it would draw a straight segment through a cell that
        // was censored or does not apply, which is a value the run never produced.
        started = false;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/ui/plot.test.ts && npx vitest run web/app/__tests__/render.test.ts && npx tsc --noEmit`
Expected: 5 passed in `plot.test.ts`; `render.test.ts` still green (its jsdom boot no longer needs to supply `getComputedStyle` for the plot, but supplying it is harmless); no type errors from `web/notes.ts:660`, which omits `regions`.

- [ ] **Step 5: Commit**

```bash
git add web/ui/plot.ts web/ui/plot.test.ts
git commit -m "Give the sweep plot a band region, a broken line, and no DOM

Three additions and one removal. PlotRegion fills from zero to a per-axis
-value height, because the run-to-run band is measured separately at every
axis value and one flat line across a people sweep is a false floor at both
ends. The y scale now sees regions, so a band above both lines is inside the
frame instead of 143 px above it. A non-finite value breaks the polyline
rather than bridging it: a bridged segment is a censored cell drawn as a
number. And the font comes from FONT_MONO instead of getComputedStyle, which
is why this module has had no test since it was written - it threw
ReferenceError in the node test environment before drawing a mark."
```

---

### Task 23: `web/console.html`, its Vite entry, and the two tests that keep it

**Files:**
- Create: `web/console.html`
- Create: `web/console.css`
- Create: `web/app/console/boot.ts`
- Modify: `vite.config.ts:34-38`
- Modify: `web/style.css:517` (append a global `:focus-visible` rule after the existing scoped one)
- Test: `web/app/console/__tests__/disclosure.test.ts`

**Interfaces:**
- Consumes: `DISCLOSURE_CLAUSES: readonly string[]` from `web/app/console/csv.ts`; `cssTokens(): string` from `web/ui/theme.ts` (`web/ui/theme.ts:73`).
- Produces, relied on by every later console task: the element ids `arena`, `transport`, `readouts`, `sweep`, `ledger`, `settings`, `run`; the file `web/app/console/boot.ts` exporting `mountTokens(doc: Document): void`, which later tasks extend rather than replace.

**This task must not touch `web/index.html` or `.gitignore`.** `scripts/build-notes.ts:485` is `writeFileSync("web/index.html", contentsPage(ordered))`, unconditional, and `package.json:11-13` wires `dev`, `build` and `check` as `npm run notes && …`. A console written to `index.html` in commit 2 is overwritten by the next `npm run check`, and the build goes green on the wrong page. `.gitignore:66-67` lists `web/index.html` and `web/generated/`; both stay listed until commit 3.

The page carries no numbers. Every slider, tile and ledger row is mounted by script into a named host, so the static file has nothing in it that a `\d+\.\d+\s*m` search could find and nothing to reorder around the disclosure.

- [ ] **Step 1: Write the failing test**

```ts
// web/app/console/__tests__/disclosure.test.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DISCLOSURE_CLAUSES } from "../csv.js";

/**
 * The ordering assertion runs against the FILE, not the booted DOM. A script can move a paragraph
 * after load, and a test that boots the page and then asks what comes first would pass a page
 * whose source puts the disclosure at the bottom. What is being defended is the document order a
 * reader with no JavaScript, a screen reader, or a print stylesheet actually gets.
 *
 * The git assertion exists because scripts/build-notes.ts:485 writes web/index.html
 * unconditionally and npm run check runs the notes build first. An untracked console page would
 * be clobbered by a green build of the wrong page. Tracked, the clobber cannot come back.
 */

const HTML = readFileSync("web/console.html", "utf8");
const FLAT = HTML.replace(/\s+/g, " ");

describe("the console page is the page the build ships", () => {
  it("is tracked by git", () => {
    const run = (): string =>
      execFileSync("git", ["ls-files", "--error-unmatch", "web/console.html"], {
        encoding: "utf8",
      });
    expect(run).not.toThrow();
    expect(run().trim()).toBe("web/console.html");
  });

  it("is a Vite entry point, beside index and instrument", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain('console: resolve(__dirname, "web/console.html")');
    expect(config).toContain('index: resolve(__dirname, "web/index.html")');
  });

  it("leaves the generated contents page and the ignore list alone", () => {
    const ignore = readFileSync(".gitignore", "utf8");
    expect(ignore).toContain("web/index.html");
    expect(HTML).not.toContain("index.html");
  });
});

describe("the invented-crowd disclosure comes first", () => {
  it("carries every clause the CSV carries", () => {
    for (const clause of DISCLOSURE_CLAUSES) {
      expect(FLAT).toContain(clause);
    }
  });

  it("precedes the arena, the readouts, the sweep curve and the ledger in document order", () => {
    const disclosure = HTML.indexOf('id="disclosure"');
    expect(disclosure).toBeGreaterThan(-1);
    for (const anchor of ['id="arena"', 'id="readouts"', 'id="sweep"', 'id="ledger"', 'id="settings"']) {
      const at = HTML.indexOf(anchor);
      expect(at, `${anchor} is missing from web/console.html`).toBeGreaterThan(-1);
      expect(disclosure, `${anchor} precedes the disclosure`).toBeLessThan(at);
    }
  });

  it("ships no measurement in its own markup, so nothing can be read before it is run", () => {
    const literal = /\d+\.\d+\s*(m|s)\b/.exec(FLAT);
    expect(literal).toBeNull();
  });
});

describe("the keyboard is not left behind by the notebook's deletion", () => {
  it("has a focus ring that is not scoped to three notes classes", () => {
    const css = readFileSync("web/style.css", "utf8");
    expect(css).toMatch(/^:focus-visible \{/m);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/disclosure.test.ts`
Expected: FAIL with `ENOENT: no such file or directory, open 'web/console.html'` at the top-level `readFileSync`.

- [ ] **Step 3: Write minimal implementation**

Create `web/console.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>A bench for one question — MIRN</title>
<link rel="stylesheet" href="./style.css">
<link rel="stylesheet" href="./console.css">
</head>
<body class="console">
<header class="console-masthead">
  <p class="eyebrow">A bench for one question</p>
  <h1>How much did the robot move the crowd?</h1>
  <p class="standfirst" id="disclosure">
    Everything on this page is simulated. The crowd is a social-force model — invented people
    obeying invented rules — and no number here is a measurement of real pedestrians. What is
    real is the ruler: the same room is run twice, once with a robot and once without, from the
    same starting positions and the same random wobble, and the difference between a person's
    two paths is the robot's effect on them.
  </p>
</header>

<main class="console-main">
  <section class="stage" aria-labelledby="stage-title">
    <h2 class="region-title" id="stage-title">Stage</h2>
    <p class="region-note">Simulated crowd. Every number below comes from a model.</p>
    <canvas id="arena" aria-label="Two crowds, one with a robot and one without"></canvas>
    <div class="transport" id="transport"></div>
    <div class="readouts" id="readouts"></div>
    <section class="sweep" aria-labelledby="sweep-title">
      <h2 class="region-title" id="sweep-title">Sweep curve</h2>
      <canvas id="sweep" role="img" aria-label="Each measurement against the setting being varied"></canvas>
      <ul class="sweep-legend" id="sweep-legend"></ul>
    </section>
  </section>

  <aside class="settings" id="settings" aria-label="Settings"></aside>
</main>

<section class="ledger-region" aria-labelledby="ledger-title">
  <h2 class="region-title" id="ledger-title">Kept results</h2>
  <div class="ledger-bar" id="ledger-bar"></div>
  <p class="region-note">The link carries the settings, not the results. Pressing Run reproduces
    them exactly.</p>
  <div class="ledger" id="ledger"></div>
</section>

<script type="module" src="./app/console/boot.ts"></script>
</body>
</html>
```

Create `web/app/console/boot.ts`:

```ts
import { cssTokens } from "../../ui/theme.js";

/**
 * The console's entry point.
 *
 * Its only job right now is the palette. Every colour token has exactly one definition, in
 * web/ui/theme.ts, and the stylesheets read them as custom properties — so the tokens have to
 * reach the document before the first paint. The notes build wrote them to a generated
 * theme.gen.css; that script is deleted with the notebook, so the console injects them instead
 * and depends on nothing generated.
 *
 * Later tasks mount the panel, the arena, the tiles, the sweep curve and the ledger into the
 * hosts named in console.html. They extend this file; they do not replace it.
 */
export function mountTokens(doc: Document): void {
  const style = doc.createElement("style");
  style.id = "mirn-tokens";
  style.textContent = cssTokens();
  doc.head.prepend(style);
}

mountTokens(document);
```

Create `web/console.css`:

```css
/* Every colour token is injected from web/ui/theme.ts. Never write a colour literal in this file. */

.console-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20rem;
  gap: 2rem;
  max-width: 76rem;
  margin: 0 auto;
  padding: 0 2rem;
}
.console-masthead { max-width: 52rem; margin: 0 auto; padding: 3rem 2rem 1.5rem; }

.region-title {
  margin: 0 0 0.35rem;
  font-family: var(--mirn-font-mono);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--mirn-ink-muted);
}
.region-note { margin: 0 0 0.9rem; font-size: 0.82rem; color: var(--mirn-ink-muted); }

.stage > canvas#arena { width: 100%; height: 22rem; display: block; }
.sweep > canvas#sweep { width: 100%; height: 16rem; display: block; }

.readouts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.4rem 1.6rem;
  margin: 1.4rem 0;
}

.ledger-region { max-width: 76rem; margin: 2.5rem auto 0; padding: 0 2rem; }
.ledger { font-variant-numeric: tabular-nums; }
.ledger-region > .ledger-bar { display: flex; gap: 0.8rem; align-items: baseline; }

@media (max-width: 60rem) {
  .console-main { grid-template-columns: minmax(0, 1fr); }
  .readouts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

Modify `vite.config.ts:34-38` to:

```ts
      input: {
        index: resolve(__dirname, "web/index.html"),
        instrument: resolve(__dirname, "web/instrument.html"),
        console: resolve(__dirname, "web/console.html"),
        ...generatedPages(),
      },
```

Append to `web/style.css` after line 517:

```css
/* A global focus ring. The rule above it is scoped to three notes-only classes and goes with the
   notebook; on a page whose entire content is controls, a keyboard user losing the ring is not a
   regression anybody would notice from a screenshot. */
:focus-visible {
  outline: 2px solid var(--mirn-ink);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/disclosure.test.ts && npm run build && git status --porcelain web/index.html .gitignore`
Expected: 7 passed; `dist/console.html` emitted by the build; the `git status` line prints nothing, proving the build did not modify a tracked `index.html` or the ignore list.

- [ ] **Step 5: Commit**

```bash
git add web/console.html web/console.css web/app/console/boot.ts vite.config.ts web/style.css web/app/console/__tests__/disclosure.test.ts
git commit -m "Add the console page as its own Vite entry, tracked by git

Not web/index.html: build-notes.ts:485 writes that file unconditionally and
npm run check runs the notes build first, so a console written there is
clobbered and the build goes green on the wrong page. The test asserts the
file is tracked so the clobber cannot come back.

The disclosure ordering is checked with indexOf against the file on disk
rather than the booted DOM, because a script can reorder a paragraph after
load and what is being defended is the order a reader without JavaScript
gets. The page ships no measurement of its own - every tile, slider and row
is mounted into a named host - so there is nothing in the markup to read
before it has been run.

Also lands the global :focus-visible rule. The only one in the stylesheet
today is scoped to three notes classes that commit 3 deletes."
```

---

### Task 24: the control panel, generated from `AXES`

**Files:**
- Create: `web/app/console/panel.ts`
- Test: `web/app/console/__tests__/panel.test.ts`

**Interfaces:**
- Consumes, from Task 12 `web/engine/job/axes.ts`: `type AxisKey`, `AXES: Readonly<Record<AxisKey, AxisEntry>>`, `AXIS_ORDER: readonly AxisKey[]`. Fields read here: `kind` (`"worldAxis" | "measurementAxis"`), `key`, `label`, `unit`, `min`, `max`, `step`, `defaultValue`, `note`, `movesColumns: readonly ColumnKey[]`. `writes` and `apply` are never read on this side — the panel produces numbers, and `configForCell` is what applies them.
- Consumes, from Task 11 `web/engine/job/columns.ts`: `COLUMNS` (field read: `.label`), `type ColumnKey`.
- Consumes, from `web/ui/labels.ts:36`: `unitLabel(units: string): string`.
- Consumes, from `web/engine/core/errors.ts`: `fail(message: string): never`.
- Produces, relied on by the preview task and the Run task: `interface PanelValues` (frozen, clone-safe, no functions), `makePanelValues(init): PanelValues`, `mountPanel(host: HTMLElement, options: PanelOptions): PanelHandle`, `estimateRunSeconds(values: PanelValues): number`, `PREVIEW_DEBOUNCE_PEOPLE: number`, `SEED_COUNT_CHOICES: readonly number[]`.

`PanelValues` is the frozen record and is the only thing that crosses to a job. `PanelHandle` has function members and never leaves the main thread — the same arrangement as `ColumnDescriptor`, whose `extract` and `assumption` also live in a table both sides import rather than in a message.

**One table feeds both.** The sliders and the sweep-axis picker are both built by walking `AXIS_ORDER` and reading `AXES`. There is no second list of "sweepable" axes to fall out of step with the list of knobs.

**The guardrail-3 consequence.** Every control renders the plain-English labels of the columns its axis declares in `movesColumns`, beside the slider, always. So a live knob can never sit above only the readouts it does not move — the failure `instrument.html` already ships, where a reaction-time slider sits directly above a true-effect tile and reaction time is flat on true effect (0.290 to 0.269, inside seed noise) while moving minimum clearance monotonically. The test iterates all of `AXIS_ORDER`, so a new axis with an empty `movesColumns` cannot be added quietly.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { AXES, AXIS_ORDER } from "../../../engine/job/axes.js";
import { COLUMNS } from "../../../engine/job/columns.js";
import { ContractError } from "../../../engine/core/errors.js";
import {
  estimateRunSeconds,
  makePanelValues,
  mountPanel,
  PREVIEW_DEBOUNCE_PEOPLE,
  SEED_COUNT_CHOICES,
  type PanelValues,
} from "../panel.js";

/**
 * The panel and the sweep picker are one table walked twice, and this file is what stops them
 * becoming two.
 *
 * The movesColumns assertion is guardrail 3 with the sequencing removed. instrument.html already
 * ships the violation it catches: a reaction-time slider sitting directly above a true-effect
 * tile, when reaction time is flat on true effect and moves minimum clearance instead. On a page
 * where every knob is on screen at once, the only defensible fix is that every knob names what it
 * moves, in words, beside itself.
 */

function host(): HTMLElement {
  const node = document.createElement("div");
  document.body.replaceChildren(node);
  return node;
}

function mount(): { readonly root: HTMLElement; readonly seen: PanelValues[] } {
  const seen: PanelValues[] = [];
  const handle = mountPanel(host(), { onInput: (values) => seen.push(values) });
  return { root: handle.root, seen };
}

describe("one table feeds the sliders and the picker", () => {
  it("renders a control for every axis in AXIS_ORDER, in that order", () => {
    const { root } = mount();
    const controls = Array.from(root.querySelectorAll<HTMLElement>("[data-axis]"));
    expect(controls.length).toBe(AXIS_ORDER.length);
    for (let i = 0; i < AXIS_ORDER.length; i++) {
      expect((controls[i] as HTMLElement).dataset["axis"]).toBe(AXIS_ORDER[i]);
    }
  });

  it("offers exactly the same axes in the sweep picker, plus not sweeping at all", () => {
    const { root } = mount();
    const select = root.querySelector<HTMLSelectElement>("#sweep-axis");
    expect(select).not.toBeNull();
    const options = Array.from((select as HTMLSelectElement).options);
    expect(options.length).toBe(AXIS_ORDER.length + 1);
    expect(options[0]?.value).toBe("");
    for (let i = 0; i < AXIS_ORDER.length; i++) {
      expect(options[i + 1]?.value).toBe(AXIS_ORDER[i]);
      expect(options[i + 1]?.textContent).toBe(AXES[AXIS_ORDER[i] as never].label);
    }
  });

  it("gives every slider the range its entry declares, and starts at its default", () => {
    const { root } = mount();
    for (const key of AXIS_ORDER) {
      const entry = AXES[key];
      const input = root.querySelector<HTMLInputElement>(`[data-axis="${key}"] input[type="range"]`);
      expect(input, `${key} has no slider`).not.toBeNull();
      const slider = input as HTMLInputElement;
      expect(Number(slider.min)).toBe(entry.min);
      expect(Number(slider.max)).toBe(entry.max);
      expect(Number(slider.step)).toBe(entry.step);
      expect(Number(slider.value)).toBe(entry.defaultValue);
    }
  });
});

describe("a knob names what it moves, wherever it sits", () => {
  it("shows every column an axis declares it moves, beside that axis", () => {
    const { root } = mount();
    for (const key of AXIS_ORDER) {
      const entry = AXES[key];
      const control = root.querySelector<HTMLElement>(`[data-axis="${key}"]`) as HTMLElement;
      const text = control.textContent ?? "";
      expect(entry.movesColumns.length, `${key} declares no column it moves`).toBeGreaterThan(0);
      for (const column of entry.movesColumns) {
        expect(text, `${key} does not name ${column}`).toContain(COLUMNS[column].label);
      }
    }
  });

  it("puts no bare code identifier in front of a reader", () => {
    const { root } = mount();
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    const found = identifier.exec(root.textContent ?? "");
    expect(found === null ? "" : found[0]).toBe("");
  });
});

describe("the panel reports what it is set to", () => {
  it("reads every axis back at its default", () => {
    const handle = mountPanel(host(), { onInput: () => {} });
    const values = handle.read();
    for (const key of AXIS_ORDER) {
      expect(values.axisValues[key]).toBe(AXES[key].defaultValue);
    }
    expect(values.sweepAxis).toBeNull();
    expect(values.sweepValues).toEqual([]);
    expect(values.zeroReferenceRun).toBe(true);
    expect(values.bandReplicates).toBe(8);
    expect(values.detectionFloor).toBe(false);
    expect(values.frechet).toBe(false);
  });

  it("fills the sweep values from the picked axis's own range, never from a literal", () => {
    const { root, seen } = mount();
    const select = root.querySelector<HTMLSelectElement>("#sweep-axis") as HTMLSelectElement;
    select.value = "crowdSize";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    const last = seen[seen.length - 1] as PanelValues;
    expect(last.sweepAxis).toBe("crowdSize");
    expect(last.sweepValues.length).toBeGreaterThan(1);
    for (const value of last.sweepValues) {
      expect(value).toBeGreaterThanOrEqual(AXES["crowdSize"].min);
      expect(value).toBeLessThanOrEqual(AXES["crowdSize"].max);
    }
  });

  it("emits on every slider move", () => {
    const { root, seen } = mount();
    const slider = root.querySelector<HTMLInputElement>(
      '[data-axis="crowdSize"] input[type="range"]',
    ) as HTMLInputElement;
    slider.value = String(AXES["crowdSize"].max);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    const last = seen[seen.length - 1] as PanelValues;
    expect(last.axisValues["crowdSize"]).toBe(AXES["crowdSize"].max);
  });

  it("says when the preview will stop following the drag", () => {
    const { root } = mount();
    const note = root.querySelector<HTMLElement>("#preview-note") as HTMLElement;
    expect(note.textContent).toBe("");

    const slider = root.querySelector<HTMLInputElement>(
      '[data-axis="crowdSize"] input[type="range"]',
    ) as HTMLInputElement;
    slider.value = String(PREVIEW_DEBOUNCE_PEOPLE + AXES["crowdSize"].step);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(note.textContent).toContain("waits until you let go");
  });
});

describe("a hand-edited value is a contract check, not a shrug", () => {
  it("refuses an axis value outside its declared range", () => {
    expect(() =>
      makePanelValues({
        axisValues: { ...defaults(), crowdSize: AXES["crowdSize"].max + 1 },
        pedestriansSeeRobot: true,
        sweepAxis: null,
        sweepValues: [],
        seedCount: 1,
        bandReplicates: 8,
        detectionFloor: false,
        frechet: false,
        zeroReferenceRun: true,
      }),
    ).toThrow(ContractError);
  });

  it("refuses a sweep with an axis and no values", () => {
    expect(() =>
      makePanelValues({
        axisValues: defaults(),
        pedestriansSeeRobot: true,
        sweepAxis: "crowdSize",
        sweepValues: [],
        seedCount: 1,
        bandReplicates: 8,
        detectionFloor: false,
        frechet: false,
        zeroReferenceRun: true,
      }),
    ).toThrow(ContractError);
  });

  it("refuses a one-replicate band, which has no pair to compare", () => {
    expect(() =>
      makePanelValues({
        axisValues: defaults(),
        pedestriansSeeRobot: true,
        sweepAxis: null,
        sweepValues: [],
        seedCount: 1,
        bandReplicates: 1,
        detectionFloor: false,
        frechet: false,
        zeroReferenceRun: true,
      }),
    ).toThrow(ContractError);
  });
});

describe("the cost of pressing Run is quoted before it is spent", () => {
  it("costs more with more seeds, and more again with the band on", () => {
    const one = makePanelValues({
      axisValues: defaults(),
      pedestriansSeeRobot: true,
      sweepAxis: null,
      sweepValues: [],
      seedCount: 1,
      bandReplicates: null,
      detectionFloor: false,
      frechet: false,
      zeroReferenceRun: false,
    });
    const eight = makePanelValues({ ...structuredClone(one), seedCount: 8 } as never);
    const banded = makePanelValues({ ...structuredClone(one), seedCount: 8, bandReplicates: 8 } as never);
    expect(estimateRunSeconds(eight)).toBeGreaterThan(estimateRunSeconds(one));
    expect(estimateRunSeconds(banded)).toBeGreaterThan(estimateRunSeconds(eight));
  });

  it("offers seed counts a reader can pick from", () => {
    expect(SEED_COUNT_CHOICES.length).toBeGreaterThan(1);
    expect(SEED_COUNT_CHOICES[0]).toBe(1);
  });
});

function defaults(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of AXIS_ORDER) {
    out[key] = AXES[key].defaultValue;
  }
  return out;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/panel.test.ts`
Expected: FAIL with `Error: Failed to resolve import "../panel.js" from "web/app/console/__tests__/panel.test.ts". Does the file exist?`

- [ ] **Step 3: Write minimal implementation**

```ts
// web/app/console/panel.ts
import { fail } from "../../engine/core/errors.js";
import { AXES, AXIS_ORDER, type AxisKey } from "../../engine/job/axes.js";
import { COLUMNS } from "../../engine/job/columns.js";
import { unitLabel } from "../../ui/labels.js";

/**
 * Every knob on the page, built by walking one table.
 *
 * The sliders and the sweep-axis picker come from the same walk of AXIS_ORDER, so there is no
 * second list of "things you can sweep" to fall out of step with the list of things you can turn.
 * Adding an axis to the table puts it in both, with its range, its unit and its plain-English
 * name, and there is nowhere to add it to only one.
 *
 * Each control also prints the readouts its entry declares it moves. On a page with no reading
 * order, that is the only form guardrail 3 can take: a knob is always on screen, so it always has
 * to say what it does. instrument.html ships the failure - a reaction-time slider directly above a
 * true-effect tile, when reaction time is flat on true effect (0.290 to 0.269, inside seed noise)
 * and moves minimum clearance monotonically instead.
 *
 * PanelValues is a frozen plain record and is what a job is built from. PanelHandle has function
 * members and never leaves the main thread.
 */

export interface PanelValues {
  readonly kind: "panelValues";
  readonly axisValues: Readonly<Record<AxisKey, number>>;
  readonly pedestriansSeeRobot: boolean;
  readonly sweepAxis: AxisKey | null;
  readonly sweepValues: readonly number[];
  readonly seedCount: number;
  /** null is the band switched off. Never 1: one replicate has nothing to be paired against. */
  readonly bandReplicates: number | null;
  readonly detectionFloor: boolean;
  readonly frechet: boolean;
  readonly zeroReferenceRun: boolean;
}

export interface PanelOptions {
  readonly onInput: (values: PanelValues) => void;
}

export interface PanelHandle {
  readonly kind: "panelHandle";
  readonly root: HTMLElement;
  readonly read: () => PanelValues;
}

export const SEED_COUNT_CHOICES: readonly number[] = Object.freeze([1, 2, 4, 8, 16]);

/** Above this crowd, the preview waits for the end of the drag. 92 ms a frame is not a preview. */
export const PREVIEW_DEBOUNCE_PEOPLE = 44;

const DEFAULT_BAND_REPLICATES = 8;
const SWEEP_VALUE_COUNT = 5;

/**
 * Measured on this machine at nTicks=800, dt=0.05: runPair is 38 ms at 18 pedestrians, 92 ms at
 * 44 and 210 ms at 80, so a paired run costs about 2.2 ms per pedestrian. replicateBand at 8
 * replicates is 267 ms at 18 and 738 ms at 44 - about 1.9 ms per pedestrian per replicate. These
 * are quoted to the operator before Run is pressed, never after.
 */
const MS_PER_RUN_PER_PEDESTRIAN = 2.2;
const MS_PER_BAND_REPLICATE_PER_PEDESTRIAN = 1.9;
const MS_PER_FLOOR_PER_PEDESTRIAN = 1.5;
const MS_PER_FRECHET_PER_PEDESTRIAN = 6.5;

export function makePanelValues(init: {
  axisValues: Readonly<Record<string, number>>;
  pedestriansSeeRobot: boolean;
  sweepAxis: AxisKey | null;
  sweepValues: readonly number[];
  seedCount: number;
  bandReplicates: number | null;
  detectionFloor: boolean;
  frechet: boolean;
  zeroReferenceRun: boolean;
}): PanelValues {
  const axisValues: Record<string, number> = {};
  for (const key of AXIS_ORDER) {
    const entry = AXES[key];
    const value = init.axisValues[key];
    if (value === undefined) {
      fail(`the panel has no value for ${entry.label}`);
    }
    if (!Number.isFinite(value)) {
      fail(`${entry.label} must be a finite number, got ${value}`);
    }
    if (value < entry.min || value > entry.max) {
      fail(`${entry.label} must be between ${entry.min} and ${entry.max}, got ${value}`);
    }
    axisValues[key] = value;
  }

  if (init.sweepAxis !== null) {
    const entry = AXES[init.sweepAxis];
    if (init.sweepValues.length === 0) {
      fail(`a sweep of ${entry.label} needs at least one value to sweep over`);
    }
    for (const value of init.sweepValues) {
      if (!Number.isFinite(value) || value < entry.min || value > entry.max) {
        fail(`a swept ${entry.label} must be between ${entry.min} and ${entry.max}, got ${value}`);
      }
    }
  } else if (init.sweepValues.length !== 0) {
    fail("sweep values were given with nothing to sweep");
  }

  if (!Number.isInteger(init.seedCount) || init.seedCount < 1) {
    fail(`the number of seeds must be a whole number of at least one, got ${init.seedCount}`);
  }
  if (init.bandReplicates !== null) {
    if (!Number.isInteger(init.bandReplicates) || init.bandReplicates < 2) {
      fail(
        `the run-to-run band needs at least two replicates to compare, got ${init.bandReplicates}`,
      );
    }
  }

  return Object.freeze({
    kind: "panelValues" as const,
    axisValues: Object.freeze(axisValues) as Readonly<Record<AxisKey, number>>,
    pedestriansSeeRobot: init.pedestriansSeeRobot,
    sweepAxis: init.sweepAxis,
    sweepValues: Object.freeze([...init.sweepValues]),
    seedCount: init.seedCount,
    bandReplicates: init.bandReplicates,
    detectionFloor: init.detectionFloor,
    frechet: init.frechet,
    zeroReferenceRun: init.zeroReferenceRun,
  });
}

export function estimateRunSeconds(values: PanelValues): number {
  const people = values.axisValues["crowdSize"];
  const cells = values.sweepAxis === null ? 1 : values.sweepValues.length;
  const runs = cells * values.seedCount;

  let totalMs = runs * people * MS_PER_RUN_PER_PEDESTRIAN;
  if (values.zeroReferenceRun) {
    totalMs += cells * people * MS_PER_RUN_PER_PEDESTRIAN;
  }
  if (values.bandReplicates !== null) {
    totalMs += cells * values.bandReplicates * people * MS_PER_BAND_REPLICATE_PER_PEDESTRIAN;
  }
  if (values.detectionFloor) {
    totalMs += runs * people * MS_PER_FLOOR_PER_PEDESTRIAN;
  }
  if (values.frechet) {
    totalMs += runs * people * MS_PER_FRECHET_PER_PEDESTRIAN;
  }
  return totalMs / 1000;
}

function sweepValuesFor(key: AxisKey): readonly number[] {
  const entry = AXES[key];
  const span = entry.max - entry.min;
  const out: number[] = [];
  for (let i = 0; i < SWEEP_VALUE_COUNT; i++) {
    const raw = entry.min + (span * i) / (SWEEP_VALUE_COUNT - 1);
    const snapped = entry.min + Math.round((raw - entry.min) / entry.step) * entry.step;
    const clamped = snapped > entry.max ? entry.max : snapped;
    const rounded = Number(clamped.toFixed(6));
    if (!out.includes(rounded)) {
      out.push(rounded);
    }
  }
  return out;
}

function movesSentence(key: AxisKey): string {
  const entry = AXES[key];
  const names: string[] = [];
  for (const column of entry.movesColumns) {
    names.push(COLUMNS[column].label);
  }
  return `Moves: ${names.join(" · ")}`;
}

function formatAxisValue(key: AxisKey, value: number): string {
  const entry = AXES[key];
  if (Number.isInteger(entry.step) && Number.isInteger(value)) {
    return String(value);
  }
  const decimals = String(entry.step).includes(".")
    ? (String(entry.step).split(".")[1] as string).length
    : 2;
  return value.toFixed(decimals);
}

function groupNode(doc: Document, title: string): HTMLElement {
  const group = doc.createElement("section");
  group.className = "panel-group";
  const heading = doc.createElement("p");
  heading.className = "panel-title";
  heading.textContent = title;
  group.append(heading);
  return group;
}

export function mountPanel(host: HTMLElement, options: PanelOptions): PanelHandle {
  const doc = host.ownerDocument;
  const root = doc.createElement("div");
  root.className = "panel";

  const sliders = new Map<AxisKey, HTMLInputElement>();
  const outputs = new Map<AxisKey, HTMLOutputElement>();

  const worldGroup = groupNode(doc, "The room and the robot");
  const rulerGroup = groupNode(doc, "The ruler");

  for (const key of AXIS_ORDER) {
    const entry = AXES[key];
    const control = doc.createElement("label");
    control.className = "control";
    control.dataset["axis"] = key;

    const heading = doc.createElement("span");
    heading.className = "control-label";
    const readout = doc.createElement("output");
    readout.value = formatAxisValue(key, entry.defaultValue);
    heading.append(`${entry.label} `, readout, ` ${unitLabel(entry.unit)}`);

    const slider = doc.createElement("input");
    slider.type = "range";
    slider.min = String(entry.min);
    slider.max = String(entry.max);
    slider.step = String(entry.step);
    slider.value = String(entry.defaultValue);

    const note = doc.createElement("span");
    note.className = "control-note";
    note.textContent = entry.note;

    const moves = doc.createElement("span");
    moves.className = "control-moves";
    moves.textContent = movesSentence(key);

    control.append(heading, slider, note, moves);
    sliders.set(key, slider);
    outputs.set(key, readout);

    if (entry.kind === "worldAxis") {
      worldGroup.append(control);
    } else {
      rulerGroup.append(control);
    }
  }

  const seeRobot = doc.createElement("input");
  seeRobot.type = "checkbox";
  seeRobot.id = "see-robot";
  seeRobot.checked = true;
  const seeRobotLabel = doc.createElement("label");
  seeRobotLabel.className = "toggle";
  seeRobotLabel.append(seeRobot, doc.createTextNode("People notice the robot"));
  worldGroup.append(seeRobotLabel);

  const previewNote = doc.createElement("p");
  previewNote.className = "panel-note";
  previewNote.id = "preview-note";
  previewNote.textContent = "";
  worldGroup.append(previewNote);

  const runGroup = groupNode(doc, "One press of Run");

  const axisSelect = doc.createElement("select");
  axisSelect.id = "sweep-axis";
  const noSweep = doc.createElement("option");
  noSweep.value = "";
  noSweep.textContent = "nothing — one setting only";
  axisSelect.append(noSweep);
  for (const key of AXIS_ORDER) {
    const option = doc.createElement("option");
    option.value = key;
    option.textContent = AXES[key].label;
    axisSelect.append(option);
  }
  const axisLabel = doc.createElement("label");
  axisLabel.className = "control";
  axisLabel.append(doc.createTextNode("Vary "), axisSelect);

  const valuesField = doc.createElement("input");
  valuesField.type = "text";
  valuesField.id = "sweep-values";
  valuesField.value = "";
  valuesField.disabled = true;
  const valuesLabel = doc.createElement("label");
  valuesLabel.className = "control";
  valuesLabel.append(doc.createTextNode("Values "), valuesField);

  const seedSelect = doc.createElement("select");
  seedSelect.id = "seed-count";
  for (const count of SEED_COUNT_CHOICES) {
    const option = doc.createElement("option");
    option.value = String(count);
    option.textContent = count === 1 ? "one crowd" : `${count} crowds`;
    seedSelect.append(option);
  }
  seedSelect.value = "1";
  const seedLabel = doc.createElement("label");
  seedLabel.className = "control";
  seedLabel.append(doc.createTextNode("Seeds "), seedSelect);

  const bandToggle = doc.createElement("input");
  bandToggle.type = "checkbox";
  bandToggle.id = "band-on";
  bandToggle.checked = true;
  const bandCount = doc.createElement("input");
  bandCount.type = "number";
  bandCount.id = "band-replicates";
  bandCount.min = "2";
  bandCount.step = "1";
  bandCount.value = String(DEFAULT_BAND_REPLICATES);
  const bandLabel = doc.createElement("label");
  bandLabel.className = "toggle";
  bandLabel.append(bandToggle, doc.createTextNode("run-to-run band, replicates "), bandCount);

  const floorToggle = doc.createElement("input");
  floorToggle.type = "checkbox";
  floorToggle.id = "floor-on";
  const floorLabel = doc.createElement("label");
  floorLabel.className = "toggle";
  floorLabel.append(floorToggle, doc.createTextNode("detection floor"));

  const frechetToggle = doc.createElement("input");
  frechetToggle.type = "checkbox";
  frechetToggle.id = "frechet-on";
  const frechetLabel = doc.createElement("label");
  frechetLabel.className = "toggle";
  frechetLabel.append(frechetToggle, doc.createTextNode("the walked-together ruler"));

  const zeroToggle = doc.createElement("input");
  zeroToggle.type = "checkbox";
  zeroToggle.id = "zero-on";
  zeroToggle.checked = true;
  const zeroLabel = doc.createElement("label");
  zeroLabel.className = "toggle";
  zeroLabel.append(zeroToggle, doc.createTextNode("zero-effect reference run"));

  const cost = doc.createElement("p");
  cost.className = "panel-note";
  cost.id = "run-cost";

  runGroup.append(axisLabel, valuesLabel, seedLabel, bandLabel, floorLabel, frechetLabel, zeroLabel, cost);
  root.append(worldGroup, rulerGroup, runGroup);
  host.append(root);

  function currentAxisValues(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const key of AXIS_ORDER) {
      const slider = sliders.get(key);
      out[key] = slider === undefined ? AXES[key].defaultValue : Number(slider.value);
    }
    return out;
  }

  function parseValues(): readonly number[] {
    const parts = valuesField.value.split(/[\s,]+/);
    const out: number[] = [];
    for (const part of parts) {
      if (part.length === 0) {
        continue;
      }
      out.push(Number(part));
    }
    return out;
  }

  function read(): PanelValues {
    const axisKey = axisSelect.value === "" ? null : (axisSelect.value as AxisKey);
    return makePanelValues({
      axisValues: currentAxisValues(),
      pedestriansSeeRobot: seeRobot.checked,
      sweepAxis: axisKey,
      sweepValues: axisKey === null ? [] : parseValues(),
      seedCount: Number(seedSelect.value),
      bandReplicates: bandToggle.checked ? Number(bandCount.value) : null,
      detectionFloor: floorToggle.checked,
      frechet: frechetToggle.checked,
      zeroReferenceRun: zeroToggle.checked,
    });
  }

  function refresh(): void {
    for (const key of AXIS_ORDER) {
      const slider = sliders.get(key);
      const readout = outputs.get(key);
      if (slider !== undefined && readout !== undefined) {
        readout.value = formatAxisValue(key, Number(slider.value));
      }
    }

    const people = Number(sliders.get("crowdSize")?.value ?? AXES["crowdSize"].defaultValue);
    previewNote.textContent =
      people > PREVIEW_DEBOUNCE_PEOPLE
        ? "This many people take long enough to simulate that the preview waits until you let go of the slider."
        : "";

    const values = read();
    cost.textContent = `${runsIn(values)} runs — about ${estimateRunSeconds(values).toFixed(1)} s`;
    options.onInput(values);
  }

  function runsIn(values: PanelValues): number {
    const cells = values.sweepAxis === null ? 1 : values.sweepValues.length;
    return cells * values.seedCount;
  }

  for (const key of AXIS_ORDER) {
    const slider = sliders.get(key);
    if (slider !== undefined) {
      slider.addEventListener("input", refresh);
    }
  }
  seeRobot.addEventListener("change", refresh);
  seedSelect.addEventListener("change", refresh);
  bandToggle.addEventListener("change", refresh);
  bandCount.addEventListener("input", refresh);
  floorToggle.addEventListener("change", refresh);
  frechetToggle.addEventListener("change", refresh);
  zeroToggle.addEventListener("change", refresh);
  valuesField.addEventListener("input", refresh);

  axisSelect.addEventListener("change", () => {
    if (axisSelect.value === "") {
      valuesField.value = "";
      valuesField.disabled = true;
    } else {
      valuesField.disabled = false;
      valuesField.value = sweepValuesFor(axisSelect.value as AxisKey).join(" ");
    }
    refresh();
  });

  const initial = read();
  cost.textContent = `${runsIn(initial)} runs — about ${estimateRunSeconds(initial).toFixed(1)} s`;

  return Object.freeze({ kind: "panelHandle" as const, root, read });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/panel.test.ts && npx tsc --noEmit`
Expected: 12 passed, no type errors.

- [ ] **Step 5: Commit**

```bash
git add web/app/console/panel.ts web/app/console/__tests__/panel.test.ts
git commit -m "Build the control panel by walking the axis table once

The sliders and the sweep-axis picker are the same walk of AXIS_ORDER, so
there is no second list of sweepable axes to drift from the list of knobs.
Ranges, steps, defaults, units and notes all come from the entry.

Every control prints the readouts its entry declares it moves. On a page
with no reading order that is the only form guardrail 3 can take: a knob is
always on screen, so it always has to say what it does. instrument.html
ships the violation - reaction time slid directly above a true-effect tile,
when reaction time is flat on true effect and moves minimum clearance.

makePanelValues is where a hand-edited value stops being a UI clamp and
becomes a contract check, and estimateRunSeconds quotes what Run will cost
before it is spent."
```

---

### Task 25: Headline tile and band gauge

**Files:**
- Create: `web/app/console/tile.ts`
- Test: `web/app/console/__tests__/tile.test.ts`

**Interfaces:**
- Consumes (real source): `ContractError` from `web/engine/core/errors.ts:9`; `anchorFor(metres: number): string` from `web/ui/labels.ts:63`.
- Consumes (Task 11, `web/engine/job/columns.ts`): `type UnitKey`, `type ColumnKey`, `interface Reading`, `type Availability`, `type ZeroReference`.
- Produces, and every later task in this slice uses these exact names:
  - `export function formatValue(value: number, unit: UnitKey): string` — number only, no suffix.
  - `export function unitSuffix(unit: UnitKey): string`
  - `export interface ZeroRendering { readonly kind: "zeroRendering"; readonly how: string; readonly value: number; readonly unit: UnitKey; readonly bound: boolean }`
  - `export function zeroRenderingFor(reference: ZeroReference, resolved: number, unit: UnitKey): ZeroRendering`
  - `export type BandGauge = { readonly kind: "bandMeasured"; readonly bandM: number; readonly nReplicates: number } | { readonly kind: "bandNotMeasured" }`
  - `export const BAND_NOT_MEASURED = "not yet measured — press Run"`
  - `export interface SettingStamp { readonly kind: "settingStamp"; readonly label: string; readonly value: number; readonly unit: UnitKey }`
  - `export interface TilePropsInit { column, label, unit, reading, zero, gauge, stamps, assumption, anchor }` — every field required, `zero` included; `anchor` is `string | null`.
  - `export interface TileProps extends TilePropsInit { readonly kind: "tileProps" }`
  - `export function makeTileProps(init: TilePropsInit): TileProps` — frozen, throws `ContractError`.
  - `export function renderTile(doc: Document, props: TileProps): HTMLElement`

`zeroRenderingFor` takes the already-resolved number rather than a `ReportContext`, so `tile.ts` imports no engine runtime at all and the jsdom test needs no simulation. Task 26 and Task 28 each resolve `ZeroReference.value(ctx)` themselves (that switch is repeated in both, deliberately).

- [ ] **Step 1: Write the failing test**

```ts
// web/app/console/__tests__/tile.test.ts
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { ContractError } from "../../../engine/core/errors.js";
import type { Reading, ZeroReference } from "../../../engine/job/columns.js";
import {
  BAND_NOT_MEASURED,
  makeTileProps,
  renderTile,
  zeroRenderingFor,
  type TilePropsInit,
} from "../tile.js";

/**
 * The two rules this file exists to hold, both of them structural rather than editorial:
 *
 *   Guardrail 6 — the zero reading is inseparable from the value. It is a required prop, it is a
 *   sibling of the value inside the same tile, and no <details> may wrap it. A zero the reader has
 *   to click for is a zero that is not shown.
 *
 *   No literal metre or second value in any tile string. Every number renders from data at paint
 *   time, into a named slot, so a copy edit can never leave a stale figure behind.
 */

const doc = new JSDOM("<!doctype html><body></body>").window.document;

function measured(value: number): Reading {
  return { kind: "reading", value, availability: { kind: "measured" } };
}

function censored(why: string): Reading {
  return { kind: "reading", value: Number.NaN, availability: { kind: "censored", why } };
}

const EXACT_ZERO: ZeroReference = {
  kind: "exactZero",
  how: "when nobody in the room responds to the robot",
  value: () => 0,
};

const GEOMETRIC_BOUND: ZeroReference = {
  kind: "geometricBound",
  how: "the shortest crossing this room allows",
  value: () => 40,
};

const BASE: TilePropsInit = {
  column: "trueEffectM",
  label: "How far the crowd was moved",
  unit: "metres",
  reading: measured(0.352),
  zero: zeroRenderingFor(EXACT_ZERO, 0, "metres"),
  gauge: { kind: "bandNotMeasured" },
  stamps: [
    { kind: "settingStamp", label: "people", value: 18, unit: "people" },
    { kind: "settingStamp", label: "forecast horizon", value: 3, unit: "seconds" },
  ],
  assumption:
    "Both runs share a seed, a starting state and an exogenous noise draw, and differ only in " +
    "whether the robot is there.",
  anchor: "half a stride",
};

function leafText(root: Element): readonly { readonly className: string; readonly text: string }[] {
  const leaves: { className: string; text: string }[] = [];
  const all = Array.from(root.querySelectorAll("*"));
  for (const node of all) {
    if (node.children.length === 0) {
      leaves.push({ className: node.getAttribute("class") ?? "", text: node.textContent ?? "" });
    }
  }
  return leaves;
}

describe("the headline tile", () => {
  it("puts the zero reading beside the value, never inside a disclosure", () => {
    const tile = renderTile(doc, makeTileProps(BASE));
    const value = tile.querySelector(".tile-value");
    const zero = tile.querySelector(".tile-zero");
    expect(value).not.toBeNull();
    expect(zero).not.toBeNull();
    expect(zero?.parentElement).toBe(value?.parentElement);
    expect(zero?.closest("details")).toBeNull();
  });

  it("still shows the zero when the value itself is unavailable", () => {
    const tile = renderTile(doc, makeTileProps({ ...BASE, reading: censored("nobody arrived") }));
    expect(tile.querySelector(".tile-number")).toBeNull();
    expect(tile.querySelector(".tile-reason")?.textContent).toBe("nobody arrived");
    expect(tile.querySelector(".tile-zero-how")?.textContent).toBe(
      "when nobody in the room responds to the robot",
    );
  });

  it("refuses to build a tile with no zero at all", () => {
    const withoutZero = { ...BASE } as unknown as Record<string, unknown>;
    delete withoutZero["zero"];
    expect(() => makeTileProps(withoutZero as unknown as TilePropsInit)).toThrow(ContractError);
  });

  it("renders a bound as a bound", () => {
    const props = makeTileProps({
      ...BASE,
      unit: "seconds",
      reading: measured(41.5),
      zero: zeroRenderingFor(GEOMETRIC_BOUND, 40, "seconds"),
    });
    const tile = renderTile(doc, props);
    expect(tile.querySelector(".tile-zero-value")?.textContent).toBe("> 40.0");
    expect(tile.querySelector(".tile-zero-unit")?.textContent).toBe("s");
  });

  it("prints no metre or second value outside a value slot", () => {
    const tile = renderTile(
      doc,
      makeTileProps({
        ...BASE,
        gauge: { kind: "bandMeasured", bandM: 0.311, nReplicates: 8 },
      }),
    );
    const slots = ["tile-number", "tile-zero-value", "stamp-value", "gauge-number"];
    const literal = /\d+\.\d+\s*(m|s)\b/;
    const offenders: string[] = [];
    for (const leaf of leafText(tile)) {
      if (slots.includes(leaf.className)) {
        continue;
      }
      if (literal.test(leaf.text)) {
        offenders.push(`${leaf.className}: ${leaf.text}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("says the band is unmeasured rather than drawing one", () => {
    const tile = renderTile(doc, makeTileProps(BASE));
    expect(tile.querySelector(".gauge-caption")?.textContent).toBe(BAND_NOT_MEASURED);
    expect(tile.querySelectorAll(".gauge-wedge").length).toBe(0);
    expect(tile.querySelectorAll(".gauge-tick").length).toBe(0);
  });

  it("draws one wedge and one tick when the band has been measured", () => {
    const tile = renderTile(
      doc,
      makeTileProps({ ...BASE, gauge: { kind: "bandMeasured", bandM: 0.311, nReplicates: 8 } }),
    );
    expect(tile.querySelectorAll(".gauge-wedge").length).toBe(1);
    expect(tile.querySelectorAll(".gauge-tick").length).toBe(1);
    expect(tile.querySelector(".gauge-number")?.textContent).toBe("8");
    expect(tile.querySelector(".gauge-figure")?.getAttribute("aria-hidden")).toBe("true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/tile.test.ts`
Expected: FAIL with `Failed to resolve import "../tile.js" from "web/app/console/__tests__/tile.test.ts". Does the file exist?`

- [ ] **Step 3: Write minimal implementation**

```ts
// web/app/console/tile.ts
import { ContractError } from "../../engine/core/errors.js";
import type { ColumnKey, Reading, UnitKey, ZeroReference } from "../../engine/job/columns.js";

/**
 * One headline readout, and the one-dimensional ruler underneath it.
 *
 * The gauge is a hairline scale from zero, a filled wedge covering the run-to-run band, and one
 * tick at the value. It is a ruler rather than a box on purpose: it discharges guardrail 6 (what
 * this would read if the answer were zero) and guardrail 7 (a metre never appears alone) in a
 * single glyph, and it is one of the four non-rectangular elements on the page.
 *
 * `zero` is a required prop. It is not optional, it is not inside the <details>, and the tests
 * beside this file assert both. A zero-reference the reader has to open is a zero-reference that
 * was not shown.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

const DECIMALS: Readonly<Record<UnitKey, number>> = Object.freeze({
  metres: 3,
  seconds: 1,
  count: 0,
  ratio: 2,
  people: 0,
  none: 3,
});

const SUFFIX: Readonly<Record<UnitKey, string>> = Object.freeze({
  metres: "m",
  seconds: "s",
  count: "",
  ratio: "×",
  people: "people",
  none: "",
});

export const BAND_NOT_MEASURED = "not yet measured — press Run";

export function formatValue(value: number, unit: UnitKey): string {
  const places = DECIMALS[unit];
  return value.toFixed(places);
}

export function unitSuffix(unit: UnitKey): string {
  return SUFFIX[unit];
}

export interface ZeroRendering {
  readonly kind: "zeroRendering";
  /** The phrase alone. It never contains a number — the number is `value`. */
  readonly how: string;
  /** NaN only when the reference is `notAPerturbation`. */
  readonly value: number;
  readonly unit: UnitKey;
  readonly bound: boolean;
}

export function zeroRenderingFor(
  reference: ZeroReference,
  resolved: number,
  unit: UnitKey,
): ZeroRendering {
  if (reference.how.length === 0) {
    throw new ContractError("a zero-reference must carry a phrase saying what its number means");
  }
  let value = resolved;
  let bound = false;
  if (reference.kind === "notAPerturbation") {
    value = Number.NaN;
  } else if (reference.kind === "geometricBound") {
    bound = true;
  }
  if (reference.kind !== "notAPerturbation" && !Number.isFinite(value)) {
    throw new ContractError(
      `the zero-reference '${reference.how}' resolved to ${resolved}, which cannot be shown ` +
        `beside a number; a zero with no value is the error this tile exists to prevent`,
    );
  }
  return Object.freeze({ kind: "zeroRendering" as const, how: reference.how, value, unit, bound });
}

export type BandGauge =
  | { readonly kind: "bandMeasured"; readonly bandM: number; readonly nReplicates: number }
  | { readonly kind: "bandNotMeasured" };

export interface SettingStamp {
  readonly kind: "settingStamp";
  readonly label: string;
  readonly value: number;
  readonly unit: UnitKey;
}

export interface TilePropsInit {
  readonly column: ColumnKey;
  readonly label: string;
  readonly unit: UnitKey;
  readonly reading: Reading;
  readonly zero: ZeroRendering;
  readonly gauge: BandGauge;
  /** What this was measured at. Printed always, never on hover. */
  readonly stamps: readonly SettingStamp[];
  readonly assumption: string;
  /** Guardrail 7's body-scale phrase, or null for a unit that needs no anchor. */
  readonly anchor: string | null;
}

export interface TileProps extends TilePropsInit {
  readonly kind: "tileProps";
}

export function makeTileProps(init: TilePropsInit): TileProps {
  if (init.zero === undefined || init.zero.kind !== "zeroRendering") {
    throw new ContractError(
      `the tile for '${String(init.column)}' was built without a zero reading; every number on ` +
        `this page shows what it would read if the answer were zero`,
    );
  }
  if (init.reading === undefined || init.reading.kind !== "reading") {
    throw new ContractError(`the tile for '${String(init.column)}' was built without a reading`);
  }
  if (init.reading.availability.kind === "measured" && !Number.isFinite(init.reading.value)) {
    throw new ContractError(
      `the tile for '${String(init.column)}' claims a measured value of ${init.reading.value}`,
    );
  }
  if (init.label.length === 0) {
    throw new ContractError(`the tile for '${String(init.column)}' has no plain-English name`);
  }
  if (init.assumption.length === 0) {
    throw new ContractError(`the tile for '${String(init.column)}' states no assumption`);
  }
  for (const stamp of init.stamps) {
    if (stamp.kind !== "settingStamp" || !Number.isFinite(stamp.value)) {
      throw new ContractError(
        `the tile for '${String(init.column)}' carries a setting stamp with no value`,
      );
    }
  }
  return Object.freeze({ kind: "tileProps" as const, ...init, stamps: Object.freeze([...init.stamps]) });
}

function element(doc: Document, tag: string, className: string, content: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  if (content.length > 0) {
    node.textContent = content;
  }
  return node;
}

function svgLine(
  doc: Document,
  className: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Element {
  const node = doc.createElementNS(SVG_NS, "line");
  node.setAttribute("class", className);
  node.setAttribute("x1", x1.toFixed(2));
  node.setAttribute("y1", y1.toFixed(2));
  node.setAttribute("x2", x2.toFixed(2));
  node.setAttribute("y2", y2.toFixed(2));
  return node;
}

/** The gauge's top of scale: whichever of the band and the value is larger, with headroom. */
function gaugeDomain(bandM: number, reading: Reading): number {
  let top = bandM;
  if (reading.availability.kind === "measured" && reading.value > top) {
    top = reading.value;
  }
  const padded = top * 1.25;
  if (padded > 0) {
    return padded;
  }
  return 1;
}

function renderGauge(doc: Document, props: TileProps): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.className = "band-gauge";

  // Redundant with the tile's own text, so it is hidden from assistive technology rather than
  // given a label full of numbers that the text already carries.
  const figure = doc.createElementNS(SVG_NS, "svg");
  figure.setAttribute("class", "gauge-figure");
  figure.setAttribute("viewBox", "0 0 200 22");
  figure.setAttribute("aria-hidden", "true");
  figure.appendChild(svgLine(doc, "gauge-scale", 8, 15, 192, 15));
  figure.appendChild(svgLine(doc, "gauge-zero", 8, 11, 8, 19));

  if (props.gauge.kind === "bandMeasured") {
    const domain = gaugeDomain(props.gauge.bandM, props.reading);
    const xBand = 8 + (props.gauge.bandM / domain) * 184;
    const wedge = doc.createElementNS(SVG_NS, "path");
    wedge.setAttribute("class", "gauge-wedge");
    wedge.setAttribute("d", `M 8 15 L ${xBand.toFixed(2)} 15 L ${xBand.toFixed(2)} 7 Z`);
    figure.appendChild(wedge);
    if (props.reading.availability.kind === "measured") {
      const xValue = 8 + (props.reading.value / domain) * 184;
      figure.appendChild(svgLine(doc, "gauge-tick", xValue, 4, xValue, 19));
    }
  }
  wrap.appendChild(figure);

  const caption = doc.createElement("p");
  caption.className = "gauge-caption";
  if (props.gauge.kind === "bandNotMeasured") {
    caption.textContent = BAND_NOT_MEASURED;
  } else {
    caption.appendChild(element(doc, "span", "gauge-number", String(props.gauge.nReplicates)));
    caption.appendChild(
      element(
        doc,
        "span",
        "gauge-words",
        " replicate runs of this room with no robot in it, 95th percentile",
      ),
    );
  }
  wrap.appendChild(caption);
  return wrap;
}

function renderZero(doc: Document, zero: ZeroRendering): HTMLElement {
  const row = doc.createElement("p");
  row.className = "tile-zero";
  if (Number.isFinite(zero.value)) {
    const prefix = zero.bound ? "> " : "";
    row.appendChild(
      element(doc, "span", "tile-zero-value", `${prefix}${formatValue(zero.value, zero.unit)}`),
    );
    const suffix = unitSuffix(zero.unit);
    if (suffix.length > 0) {
      row.appendChild(element(doc, "span", "tile-zero-unit", suffix));
    }
  }
  row.appendChild(element(doc, "span", "tile-zero-how", zero.how));
  return row;
}

function renderStamps(doc: Document, stamps: readonly SettingStamp[]): HTMLElement {
  const row = doc.createElement("p");
  row.className = "tile-stamps";
  for (const stamp of stamps) {
    const wrap = doc.createElement("span");
    wrap.className = "stamp";
    wrap.appendChild(element(doc, "span", "stamp-label", stamp.label));
    wrap.appendChild(element(doc, "span", "stamp-value", formatValue(stamp.value, stamp.unit)));
    const suffix = unitSuffix(stamp.unit);
    if (suffix.length > 0) {
      wrap.appendChild(element(doc, "span", "stamp-unit", suffix));
    }
    row.appendChild(wrap);
  }
  return row;
}

export function renderTile(doc: Document, props: TileProps): HTMLElement {
  const tile = doc.createElement("section");
  tile.className = "tile";
  tile.setAttribute("data-column", String(props.column));

  tile.appendChild(element(doc, "p", "tile-label", props.label));

  const value = doc.createElement("p");
  value.className = "tile-value";
  if (props.reading.availability.kind === "measured") {
    value.appendChild(element(doc, "span", "tile-number", formatValue(props.reading.value, props.unit)));
    const suffix = unitSuffix(props.unit);
    if (suffix.length > 0) {
      value.appendChild(element(doc, "span", "tile-unit", suffix));
    }
  } else {
    value.classList.add("is-unavailable");
    value.appendChild(element(doc, "span", "tile-reason", props.reading.availability.why));
  }
  tile.appendChild(value);

  if (props.anchor !== null) {
    tile.appendChild(element(doc, "p", "tile-anchor", props.anchor));
  }

  tile.appendChild(renderGauge(doc, props));
  tile.appendChild(renderZero(doc, props.zero));
  tile.appendChild(renderStamps(doc, props.stamps));

  const working = doc.createElement("details");
  working.className = "tile-working";
  const summary = doc.createElement("summary");
  summary.textContent = "show the working";
  working.appendChild(summary);
  working.appendChild(element(doc, "p", "tile-assumption", props.assumption));
  tile.appendChild(working);

  return tile;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/tile.test.ts`

- [ ] **Step 5: Commit**

```bash
git add web/app/console/tile.ts web/app/console/__tests__/tile.test.ts
git commit -m "The headline tile, with its zero welded to its value

renderTile takes (reading, zeroRendering) as required props. The zero is a
sibling of the value, never inside the <details>, and a jsdom test holds both.
The band gauge is a hairline scale, a wedge over the band and one tick at the
value; before a Run it says so rather than drawing a floor from other settings.
Every number renders from data into a named slot, and a test walks the leaf
nodes to prove no other string carries a metre or a second."
```

---

### Task 26: Console boot and the live 1x1 preview

**Files:**
- Create: `web/app/console/preview.ts`
- Create: `web/console.ts`
- Modify: `web/console.html` (created in Task 24 — the masthead disclosure and the settings panel already exist there)
- Modify: `vite.config.ts:33-39`
- Modify: `web/style.css` (append the console block)
- Test: `web/app/console/__tests__/preview.test.ts`
- Test: `web/app/console/__tests__/boot.test.ts`
- Test: `web/app/console/__tests__/entry.test.ts`

**Interfaces:**
- Consumes (real source): `makeRunConfig(overrides?: RunConfigOverrides): RunConfig` and `SIM_CONSTANTS` from `web/engine/contracts/config.ts:149`; `runPair(config: RunConfig, nowMs?: () => number): RunResult` from `web/engine/sim/run.ts:114`; `drawArena(context, view: ArenaView, width, height): void` and `fitCanvas(canvas, dpr): { width, height }` from `web/ui/arena.ts:192,62`; `frameIndexAt(nowMs, base: PlaybackBase, nSamples): number` from `web/app/clock.ts:20`; `anchorFor(metres: number): string` from `web/ui/labels.ts:63`.
- Consumes (Task 14, `web/engine/job/spec.ts`): `BASE_SEED`, `interface MeasurementParams`.
- Consumes (Task 11, `web/engine/job/columns.ts`): `COLUMNS`, `COLUMN_ORDER`, `HEADLINE_COLUMNS`, `type ColumnKey`, `type Reading`, `type ZeroReference`.
- Consumes (Task 10, `web/engine/job/report.ts`):
  `export interface BuildContextInit { readonly config: RunConfig; readonly params: MeasurementParams; readonly run: RunResult; readonly band: RunToRunBand | null; readonly floor: SplitHalfNull | null; readonly zeroRun: RunResult | null; readonly frechetMeanM: number | null }` (Task 10 — note the field names: `floor` and `frechetMeanM`, not `floorM`/`frechetM`),
  `export interface ReportContext { readonly kind: "reportContext"; readonly config: RunConfig; readonly params: MeasurementParams; readonly run: RunResult; readonly deviation: Deviation; readonly band: RunToRunBand | null; readonly floor: SplitHalfNull | null; readonly zeroRun: RunResult | null; readonly frechetMeanM: number | null; readonly straightLineM: number }` — it is NOT `BuildContextInit` plus a kind; `buildContext` computes `deviation` and `straightLineM` for you,
  `export function buildContext(init: BuildContextInit): ReportContext`,
  `export function runReport(ctx: ReportContext, columns: readonly ColumnKey[]): Readonly<Partial<Record<ColumnKey, Reading>>>`.
- Consumes (Task 20, `web/app/console/state.ts`):
  `export interface ConsoleSettings { readonly kind: "consoleSettings"; readonly base: RunConfigOverrides; readonly measurement: MeasurementParams; readonly axis: AxisKey | null; readonly axisValues: readonly number[]; readonly seedIndices: readonly number[]; readonly columns: readonly ColumnKey[]; readonly bandReplicates: number; readonly wantBand: boolean; readonly wantFloor: boolean; readonly wantFrechet: boolean; readonly wantZeroRun: boolean }`.
- Consumes (Task 21, `web/app/console/panel.ts`): `export function mountPanel(doc: Document): void`, `export function readPanel(doc: Document): ConsoleSettings`.
- Consumes (Task 25): `makeTileProps`, `renderTile`, `zeroRenderingFor`, `formatValue`, `unitSuffix`, `BAND_NOT_MEASURED`, `type BandGauge`, `type SettingStamp`.
- Produces: `web/app/console/preview.ts` exporting `DEBOUNCE_PEOPLE = 44`, `DEBOUNCE_MS = 180`, `interface Preview`, `runPreview(settings): Preview`, `stampsFor(preview): readonly SettingStamp[]`, `shouldDebounce(settings): boolean`, `resolveZero(reference, ctx, readings): number`, `peopleIn(settings): number`. `web/console.ts` exporting `bootConsole(doc: Document): void` and calling it on import.

- [ ] **Step 1: Write the failing test for the preview**

```ts
// web/app/console/__tests__/preview.test.ts
import { describe, expect, it } from "vitest";
import { makeConsoleSettings } from "../state.js";
import { paired } from "../../../engine/measure/estimator/index.js";
import { HEADLINE_COLUMNS } from "../../../engine/job/columns.js";
import { DEBOUNCE_PEOPLE, peopleIn, runPreview, shouldDebounce, stampsFor } from "../preview.js";

/**
 * The preview is the page's honesty at the moment of turning a knob: what the arena shows and what
 * the six tiles say must both describe the room whose settings are in the panel right now.
 *
 * The bug this file exists to prevent is a specific one. With a people-sweep configured, cell 0 of
 * the job is 4 people while the slider reads 18, so a preview built through `configForCell` would
 * describe a room nobody is looking at, in six tiles, with no visible tell.
 */

const settings = makeConsoleSettings({
  base: { crowd: { nPedestrians: 18 } },
  measurement: {
    kind: "measurementParams",
    forecastHorizonSteps: 60,
    forecastEndStep: 200,
    nearMissThresholdM: 0.5,
    recoveryToleranceFraction: 0.1,
    recoveryDwellSteps: 20,
  },
  axis: "crowdSize",
  axisValues: [4, 8, 12, 18, 24, 32, 44],
  seedIndices: [0, 1, 2, 3, 4, 5, 6, 7],
  columns: [...HEADLINE_COLUMNS],
  bandReplicates: 8,
  wantBand: true,
  wantFloor: false,
  wantFrechet: false,
  wantZeroRun: true,
});

describe("the live preview", () => {
  it("simulates the settings in the panel, not the first cell of the sweep", () => {
    const preview = runPreview(settings);
    expect(preview.config.crowd.nPedestrians).toBe(18);
    expect(peopleIn(settings)).toBe(18);
  });

  it("computes the zero-effect reference run at the same settings", () => {
    const preview = runPreview(settings);
    expect(preview.zeroRun.config.pedestriansSeeRobot).toBe(false);
    expect(preview.zeroRun.config.crowd.nPedestrians).toBe(18);
    expect(preview.zeroRun.config.seed).toBe(preview.config.seed);
    // Determinism, not approximation: the zero run's true effect is exactly zero.
    expect(paired(preview.zeroRun.pair).value).toBe(0);
  });

  it("reports every headline column, with the forecaster actually measured", () => {
    const preview = runPreview(settings);
    for (const key of HEADLINE_COLUMNS) {
      expect(preview.readings[key], `no reading for ${String(key)}`).toBeDefined();
    }
    const forecast = preview.readings["forecastM"];
    expect(forecast?.availability.kind).toBe("measured");
    expect(Number.isFinite(forecast?.value ?? Number.NaN)).toBe(true);
  });

  it("stamps every readout with the settings it was measured at", () => {
    const stamps = stampsFor(runPreview(settings));
    const labels = stamps.map((stamp) => stamp.label);
    expect(labels).toContain("people");
    expect(labels).toContain("forecast horizon");
    expect(labels).toContain("measured at");
  });

  it("debounces only above the crowd size the panel warns about", () => {
    expect(shouldDebounce(settings)).toBe(false);
    const crowded = makeConsoleSettings({
      ...settings,
      base: { crowd: { nPedestrians: DEBOUNCE_PEOPLE + 1 } },
    });
    expect(shouldDebounce(crowded)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/preview.test.ts`
Expected: FAIL with `Failed to resolve import "../preview.js" from "web/app/console/__tests__/preview.test.ts". Does the file exist?`

- [ ] **Step 3: Write `web/app/console/preview.ts`**

```ts
// web/app/console/preview.ts
import { DEFAULT_CONFIG, makeRunConfig, type RunConfig } from "../../engine/contracts/config.js";
import { runPair, type RunResult } from "../../engine/sim/run.js";
import { BASE_SEED } from "../../engine/job/spec.js";
import { buildContext, runReport, type ReportContext } from "../../engine/job/report.js";
import { COLUMN_ORDER, type ColumnKey, type Reading, type ZeroReference } from "../../engine/job/columns.js";
import type { ConsoleSettings } from "./state.js";
import type { SettingStamp } from "./tile.js";

/**
 * The 1x1 run behind the arena and the six tiles.
 *
 * Two things about it are load-bearing.
 *
 * It is built from the panel's own settings and never from `configForCell`. With a people-sweep
 * configured, cell 0 is 4 people while the slider reads 18, and every tile would then describe a
 * room the operator is not looking at.
 *
 * It computes the zero-effect reference run as well — the same settings with `pedestriansSeeRobot`
 * off, one extra 38 ms paired run. Without it the second headline reads "not applicable" and the
 * console's central argument is missing on first load.
 *
 * What it does NOT compute is the run-to-run band: 267 ms is not a keystroke budget. The gauge
 * says it has not been measured rather than showing a floor from other settings.
 */

export const DEBOUNCE_PEOPLE = 44;
export const DEBOUNCE_MS = 180;

export interface Preview {
  readonly kind: "preview";
  readonly config: RunConfig;
  readonly run: RunResult;
  readonly zeroRun: RunResult;
  readonly context: ReportContext;
  readonly readings: Readonly<Partial<Record<ColumnKey, Reading>>>;
}

export function peopleIn(settings: ConsoleSettings): number {
  const crowd = settings.base.crowd;
  if (crowd === undefined || crowd.nPedestrians === undefined) {
    return DEFAULT_CONFIG.crowd.nPedestrians;
  }
  return crowd.nPedestrians;
}

export function shouldDebounce(settings: ConsoleSettings): boolean {
  return peopleIn(settings) > DEBOUNCE_PEOPLE;
}

export function runPreview(settings: ConsoleSettings): Preview {
  const config = makeRunConfig({ ...settings.base, seed: BASE_SEED, replicate: 0 });
  const zeroConfig = makeRunConfig({
    ...settings.base,
    seed: BASE_SEED,
    replicate: 0,
    pedestriansSeeRobot: false,
  });

  const run = runPair(config);
  const zeroRun = runPair(zeroConfig);

  const context = buildContext({
    config,
    run,
    zeroRun,
    params: settings.measurement,
    band: null,
    floor: null,
    frechetMeanM: null,
  });

  // Every cheap column, not just the ticked ones: all six composers together are ~3.4 ms against a
  // 38 ms paired run, so the picker hides rather than gates, and a column ticked after the fact
  // fills in without a re-run.
  const readings = runReport(context, COLUMN_ORDER);

  return Object.freeze({ kind: "preview" as const, config, run, zeroRun, context, readings });
}

export function stampsFor(preview: Preview): readonly SettingStamp[] {
  const dt = preview.config.dt;
  return Object.freeze([
    Object.freeze({
      kind: "settingStamp" as const,
      label: "people",
      value: preview.config.crowd.nPedestrians,
      unit: "people" as const,
    }),
    Object.freeze({
      kind: "settingStamp" as const,
      label: "forecast horizon",
      value: preview.context.params.forecastHorizonSteps * dt,
      unit: "seconds" as const,
    }),
    Object.freeze({
      kind: "settingStamp" as const,
      label: "measured at",
      value: preview.context.params.forecastEndStep * dt,
      unit: "seconds" as const,
    }),
  ]);
}

/**
 * The number a zero-reference resolves to at this cell.
 *
 * Repeated in table.ts on purpose: the ledger resolves companion columns out of a row's aggregates
 * rather than out of a single run's readings, so the two switches read the same but do not share a
 * body. What both refuse to do is hold the number as a string.
 */
export function resolveZero(
  reference: ZeroReference,
  ctx: ReportContext,
  readings: Readonly<Partial<Record<ColumnKey, Reading>>>,
): number {
  if (reference.kind === "exactZero" || reference.kind === "geometricBound") {
    return reference.value(ctx);
  }
  if (reference.kind === "companionColumn") {
    const companion = readings[reference.column];
    if (companion === undefined) {
      return Number.NaN;
    }
    return companion.value;
  }
  return Number.NaN;
}
```

- [ ] **Step 4: Run the preview test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/preview.test.ts`

- [ ] **Step 5: Write the failing boot test**

```ts
// web/app/console/__tests__/boot.test.ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { BAND_NOT_MEASURED } from "../tile.js";

/**
 * The page boots, and six tiles carry live numbers.
 *
 * Every expensive bug on the last version of this project built cleanly and passed every unit
 * test: a panel explaining a quantity the page was not showing, six dials the copy told the reader
 * to drag that were never drawn. Only booting the real HTML with the real module finds those.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function boot(): Promise<Document> {
  const html = readFileSync(join(ROOT, "console.html"), "utf8");
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: "https://example.test/console" });

  // jsdom has no canvas, so `getContext` returns null and the boot stops at its guard before it
  // ever draws. A proxy that accepts every call and records none is enough: what is asserted here
  // is the tiles, and arena.test.ts covers the drawing itself.
  const stub = new Proxy({}, { get: () => (): void => {}, set: () => true });
  const prototype = dom.window.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown };
  prototype.getContext = (): unknown => stub;

  const globals = globalThis as unknown as Record<string, unknown>;
  globals["window"] = dom.window;
  globals["document"] = dom.window.document;
  globals["HTMLElement"] = dom.window.HTMLElement;
  globals["getComputedStyle"] = dom.window.getComputedStyle.bind(dom.window);
  globals["requestAnimationFrame"] = (): number => 0;

  vi.resetModules();
  await import("../../../console.js");
  return dom.window.document;
}

describe("the console boots", () => {
  let document: Document;

  beforeAll(async () => {
    document = await boot();
  });

  it("paints six headline tiles", () => {
    expect(document.querySelectorAll(".tile").length).toBe(6);
  });

  it("puts a live number in the true-effect tile", () => {
    const tile = document.querySelector('[data-column="trueEffectM"]');
    const text = tile?.querySelector(".tile-number")?.textContent ?? "";
    expect(text).toMatch(/^\d+\.\d{3}$/);
  });

  it("shows the forecaster as measured, because the zero-effect run was computed", () => {
    const tile = document.querySelector('[data-column="forecastM"]');
    expect(tile?.querySelector(".tile-number")).not.toBeNull();
    expect(tile?.querySelector(".tile-zero-value")).not.toBeNull();
  });

  it("never shows a band before a Run", () => {
    const captions = Array.from(document.querySelectorAll(".gauge-caption"));
    expect(captions.length).toBe(6);
    for (const caption of captions) {
      expect(caption.textContent).toBe(BAND_NOT_MEASURED);
    }
  });

  it("stamps the settings the preview was measured at onto every tile", () => {
    const tiles = Array.from(document.querySelectorAll(".tile"));
    for (const tile of tiles) {
      expect(tile.querySelectorAll(".stamp").length).toBe(3);
    }
  });
});
```

- [ ] **Step 6: Run the boot test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/boot.test.ts`
Expected: FAIL with `Failed to resolve import "../../../console.js" from "web/app/console/__tests__/boot.test.ts". Does the file exist?`

- [ ] **Step 7: Add the stage markup and the module script to `web/console.html`**

Insert this block immediately after the `<main class="console">` opening tag, before the `<aside class="settings">` the panel task wrote, and add the script tag as the last child of `<body>`:

```html
  <section class="stage">
    <p class="stage-note">Simulated crowd. Every number below comes from a model.</p>
    <canvas id="arena" aria-label="One invented crowd, run with a robot and without"></canvas>
    <div class="transport">
      <button id="playpause" type="button">Pause</button>
      <label class="scrub">
        <span class="visually-hidden">Timeline</span>
        <input id="scrub" type="range" min="0" max="800" step="1" value="0">
      </label>
      <span class="readout">t <output id="clock">0.0</output> s</span>
    </div>
    <div class="readouts" id="tiles"></div>
  </section>
```

```html
<script type="module" src="./console.ts"></script>
```

- [ ] **Step 8: Write `web/console.ts`**

```ts
// web/console.ts
import { SIM_CONSTANTS } from "./engine/contracts/config.js";
import { COLUMNS, HEADLINE_COLUMNS } from "./engine/job/columns.js";
import { mountPanel, readPanel } from "./app/console/panel.js";
import { DEBOUNCE_MS, resolveZero, runPreview, shouldDebounce, stampsFor, type Preview } from "./app/console/preview.js";
import { makeTileProps, renderTile, zeroRenderingFor, type BandGauge } from "./app/console/tile.js";
import { anchorFor } from "./ui/labels.js";
import { drawArena, fitCanvas, type ArenaView } from "./ui/arena.js";
import { frameIndexAt, type PlaybackBase } from "./app/clock.js";

/**
 * The console's wiring. Every number it shows is computed elsewhere; this file moves values into
 * the DOM and nothing else.
 */

const el = <T extends HTMLElement>(doc: Document, id: string): T => {
  const node = doc.getElementById(id);
  if (node === null) {
    throw new Error(`missing element #${id}`);
  }
  return node as T;
};

let preview: Preview | null = null;
let playing = true;
let sample = 0;
let base: PlaybackBase = { wallStartMs: 0, sampleAtStart: 0, dtMs: 50, rate: 1 };
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function bootConsole(doc: Document): void {
  mountPanel(doc);

  const canvas = el<HTMLCanvasElement>(doc, "arena");
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("2d canvas context unavailable");
  }
  const tiles = el<HTMLDivElement>(doc, "tiles");
  const scrub = el<HTMLInputElement>(doc, "scrub");
  const clock = el<HTMLOutputElement>(doc, "clock");
  const playpause = el<HTMLButtonElement>(doc, "playpause");
  const settingsPanel = el<HTMLElement>(doc, "settings");

  const paintTiles = (): void => {
    const current = preview;
    if (current === null) {
      return;
    }
    const stamps = stampsFor(current);
    // The gauge is empty during a preview, always. A floor measured at other settings beside this
    // cell's number is the same error the band was already caught making.
    const gauge: BandGauge = { kind: "bandNotMeasured" };

    while (tiles.firstChild !== null) {
      tiles.removeChild(tiles.firstChild);
    }
    for (const key of HEADLINE_COLUMNS) {
      const descriptor = COLUMNS[key];
      const reading = current.readings[key];
      if (reading === undefined) {
        continue;
      }
      const resolved = resolveZero(descriptor.zero, current.context, current.readings);
      let anchor: string | null = null;
      if (descriptor.needsAnchor && reading.availability.kind === "measured") {
        anchor = anchorFor(reading.value);
      }
      const props = makeTileProps({
        column: key,
        label: descriptor.label,
        unit: descriptor.unit,
        reading,
        zero: zeroRenderingFor(descriptor.zero, resolved, descriptor.unit),
        gauge,
        stamps,
        assumption: descriptor.assumption(current.context),
        anchor,
      });
      tiles.appendChild(renderTile(doc, props));
    }
  };

  const recompute = (): void => {
    const settings = readPanel(doc);
    preview = runPreview(settings);
    const nSamples = preview.config.nTicks + 1;
    scrub.max = String(nSamples - 1);
    if (sample > nSamples - 1) {
      sample = nSamples - 1;
    }
    base = {
      wallStartMs: performance.now(),
      sampleAtStart: sample,
      dtMs: preview.config.dt * 1000,
      rate: 1,
    };
    paintTiles();
  };

  const scheduleRecompute = (): void => {
    const settings = readPanel(doc);
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (shouldDebounce(settings)) {
      // A big crowd costs 92 ms and up per run, so the drag would stutter under a per-event
      // recompute. The trailing edge only, and the panel says so beside the crowd-size slider.
      debounceTimer = setTimeout(recompute, DEBOUNCE_MS);
      return;
    }
    recompute();
  };

  const render = (): void => {
    const current = preview;
    if (current === null) {
      return;
    }
    const box = fitCanvas(canvas, window.devicePixelRatio);
    const view: ArenaView = {
      widthM: current.config.widthM,
      heightM: current.config.heightM,
      sample,
      nSamples: current.config.nTicks + 1,
      treated: current.run.treated.positions,
      control: current.run.control.positions,
      robot: current.run.treated.robotPositions,
      showControl: true,
      showGaps: true,
      trailSamples: 90,
      pedRadiusM: SIM_CONSTANTS.pedRadiusM,
      robotRadiusM: SIM_CONSTANTS.robotRadiusM,
      highlight: null,
    };
    drawArena(context, view, box.width, box.height);
    clock.value = (sample * current.config.dt).toFixed(1);
    scrub.value = String(sample);
  };

  const frame = (nowMs: number): void => {
    const current = preview;
    if (current !== null && playing) {
      const nSamples = current.config.nTicks + 1;
      const next = frameIndexAt(nowMs, base, nSamples);
      if (next >= nSamples - 1) {
        sample = 0;
        base = { ...base, wallStartMs: nowMs, sampleAtStart: 0 };
      } else {
        sample = next;
      }
    }
    render();
    requestAnimationFrame(frame);
  };

  settingsPanel.addEventListener("input", scheduleRecompute);
  settingsPanel.addEventListener("change", scheduleRecompute);

  scrub.addEventListener("input", () => {
    sample = Number(scrub.value);
    base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
  });

  playpause.addEventListener("click", () => {
    playing = !playing;
    playpause.textContent = playing ? "Pause" : "Play";
    base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
  });

  recompute();
  requestAnimationFrame(frame);
}

bootConsole(document);
```

- [ ] **Step 9: Run the boot test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/boot.test.ts`

- [ ] **Step 10: Write the failing entry-point test**

```ts
// web/app/console/__tests__/entry.test.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The clobber this prevents, in full.
 *
 * `scripts/build-notes.ts:485` is an unconditional `writeFileSync("web/index.html", …)`, and
 * package.json wires dev, build and check as `npm run notes && …`. While the notes build still
 * exists, a console written to index.html is regenerated away on the next `npm run check` — a
 * green build of the wrong page. So the console is `web/console.html` until commit 3 deletes the
 * notes build, and both facts below are asserted rather than remembered.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

describe("the console is a real, built entry point", () => {
  it("is tracked by git", () => {
    expect(() =>
      execFileSync("git", ["ls-files", "--error-unmatch", "web/console.html"], { cwd: REPO }),
    ).not.toThrow();
  });

  it("is an entry in the vite build", () => {
    const config = readFileSync(join(REPO, "vite.config.ts"), "utf8");
    expect(config).toContain('console: resolve(__dirname, "web/console.html")');
  });

  it("is not web/index.html, which the notes build still overwrites", () => {
    const builder = readFileSync(join(REPO, "scripts", "build-notes.ts"), "utf8");
    expect(builder).toContain('writeFileSync("web/index.html"');
  });
});
```

- [ ] **Step 11: Run the entry test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/entry.test.ts`
Expected: FAIL with `expected 'import { defineConfig } from "vite";…' to contain 'console: resolve(__dirname, "web/console.html")'`

- [ ] **Step 12: Add the console entry to `vite.config.ts:33-39`**

```ts
    rollupOptions: {
      input: {
        index: resolve(__dirname, "web/index.html"),
        instrument: resolve(__dirname, "web/instrument.html"),
        console: resolve(__dirname, "web/console.html"),
        ...generatedPages(),
      },
    },
```

- [ ] **Step 13: Run the entry test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/entry.test.ts`

- [ ] **Step 14: Append the console block to `web/style.css`**

```css
/* ---------------------------------------------------------------- the console */

.console { display: grid; grid-template-columns: minmax(0, 1fr) 19rem; gap: 2rem; }
@media (max-width: 900px) { .console { grid-template-columns: minmax(0, 1fr); } }

.stage-note {
  margin: 0 0 0.5rem;
  font-family: var(--mirn-font-mono);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--mirn-ink-faint);
}

.readouts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.6rem 2rem; margin-top: 1.4rem; }
@media (max-width: 760px) { .readouts { grid-template-columns: minmax(0, 1fr); } }

.tile { border-top: 1px solid var(--mirn-rule); padding-top: 0.6rem; }
.tile-label {
  margin: 0 0 0.35rem;
  font-family: var(--mirn-font-mono);
  font-size: 0.64rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--mirn-ink-faint);
}
.tile-value { margin: 0; font-size: 1.6rem; font-variant-numeric: tabular-nums; line-height: 1.1; }
.tile-value .tile-unit { font-size: 0.9rem; color: var(--mirn-ink-muted); margin-left: 0.25rem; }
.tile-value.is-unavailable { font-size: 0.86rem; color: var(--mirn-ink-muted); line-height: 1.4; }
.tile-anchor { margin: 0.25rem 0 0; font-size: 0.78rem; color: var(--mirn-ink-muted); }
.tile-zero { margin: 0.35rem 0 0; font-size: 0.78rem; color: var(--mirn-ink-muted); font-variant-numeric: tabular-nums; }
.tile-zero-value { color: var(--mirn-ink); }
.tile-zero-unit { margin: 0 0.3rem 0 0.15rem; }
.tile-stamps { margin: 0.3rem 0 0; font-family: var(--mirn-font-mono); font-size: 0.66rem; color: var(--mirn-ink-faint); }
.stamp { margin-right: 0.9rem; }
.stamp-value { margin-left: 0.3rem; color: var(--mirn-ink-muted); font-variant-numeric: tabular-nums; }
.stamp-unit { margin-left: 0.15rem; }
.tile-working { margin-top: 0.4rem; font-size: 0.78rem; }
.tile-working summary { font-family: var(--mirn-font-mono); font-size: 0.66rem; color: var(--mirn-ink-faint); cursor: pointer; }
.tile-assumption { margin: 0.4rem 0 0; color: var(--mirn-ink-muted); line-height: 1.5; }

/* A ruler, not a box: hairline scale, a wedge over the band, one tick at the value. */
.band-gauge { margin-top: 0.45rem; }
.gauge-figure { display: block; width: 100%; height: 22px; overflow: visible; }
.gauge-scale, .gauge-zero { stroke: var(--mirn-rule); stroke-width: 1; }
.gauge-wedge { fill: var(--mirn-grid); }
.gauge-tick { stroke: var(--mirn-perturbation); stroke-width: 2; }
.gauge-caption { margin: 0.2rem 0 0; font-family: var(--mirn-font-mono); font-size: 0.64rem; color: var(--mirn-ink-faint); }
.gauge-number { color: var(--mirn-ink-muted); }
```

- [ ] **Step 15: Run the whole suite**

Run: `npx vitest run && npx tsc --noEmit`

- [ ] **Step 16: Commit**

```bash
git add web/console.ts web/console.html web/app/console/preview.ts \
        web/app/console/__tests__/preview.test.ts web/app/console/__tests__/boot.test.ts \
        web/app/console/__tests__/entry.test.ts vite.config.ts web/style.css
git commit -m "Boot the console on a live preview of the settings in the panel

The preview simulates what the sliders say, never cell 0 of a configured sweep:
with a people-sweep set up, cell 0 is 4 people while the slider reads 18, and
six tiles would then describe a room nobody is looking at. It computes the
zero-effect reference run at the same settings too, so the forecaster's tile is
a measurement rather than a not-applicable on first load. The band gauge says
'not yet measured' rather than quoting a floor from other settings, and above
44 people the preview waits for the end of the drag.

The page is web/console.html, added to vite's inputs and asserted tracked:
scripts/build-notes.ts writes web/index.html unconditionally, so a console
living there would be a green build of the wrong page."
```

---

### Task 27: Run wiring — job, worker, progress, cancel, commit

**Files:**
- Create: `web/app/console/cost.ts`
- Create: `web/app/console/group.ts`
- Modify: `web/console.ts`
- Modify: `web/console.html`
- Test: `web/app/console/__tests__/cost.test.ts`
- Test: `web/app/console/__tests__/group.test.ts`
- Test: `web/app/console/__tests__/run.test.ts`

**Interfaces:**
- Consumes (Task 14): `makeSweepJob(init: SweepJobInit): SweepJob`, `configForCell(job, cellIndex, seedIndex): RunConfig`, `BASE_SEED`, `SEED_STRIDE`, `type SweepJob`.
- Consumes (Task 12): `AXES`, `type AxisKey` — each `AxisEntry` carries `kind: "worldAxis" | "measurementAxis"`, `label`, `unit`.
- Consumes (Task 15, `web/engine/job/runner.ts`): `interface RunRow`, `interface RunKey`, `interface BandReading { readonly kind: "bandReading"; readonly axisIndex: number; readonly meanM: number; readonly peakM: number; readonly nReplicates: number }`, `accumulate(rows, columns)`.
- Consumes (Task 19, `web/app/worker/client.ts`):
  `export interface SweepClient { readonly kind: "sweepClient"; readonly start: (job: SweepJob) => void; readonly cancel: () => void }`,
  `export function makeSweepClient(handlers: { readonly onProgress: (unitsDone: number, unitsTotal: number, phase: string) => void; readonly onRow: (row: RunRow) => void; readonly onBand: (band: BandReading) => void; readonly onDone: () => void; readonly onCancelled: () => void; readonly onFailed: (message: string) => void }): SweepClient`.
- Consumes (Task 20/21): `ConsoleSettings`, `readPanel(doc)`.
- Produces:
  - `cost.ts`: `perRunMs(nPedestrians: number): number`, `FRECHET_MS`, `FLOOR_MS`, `CHEAP_COLUMNS_MS`, `runsFor(job: SweepJob): number`, `estimateCostMs(job: SweepJob): number`, `describeCost(job: SweepJob): string`.
  - `group.ts`: `interface RunGroup`, `makeRunGroup(init): RunGroup`, `interface GroupBuilder`, `makeGroupBuilder(job: SweepJob): GroupBuilder`, `labelForJob(job): string`, `labelForCell(job, axisIndex): string`.
  - `console.ts`: `jobFromSettings(settings: ConsoleSettings): SweepJob`, and the module-level `keptGroups: RunGroup[]` that Task 28 renders.

`group.ts` is not in the spec's module map. It exists because a completed group is the unit the Run wiring produces and the ledger consumes, and neither of those two files can own it without the other importing across the commit's task order.

- [ ] **Step 1: Write the failing cost test**

```ts
// web/app/console/__tests__/cost.test.ts
import { describe, expect, it } from "vitest";
import { makeSweepJob } from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS } from "../../../engine/job/columns.js";
import { describeCost, estimateCostMs, perRunMs, runsFor } from "../cost.js";

/**
 * The operator is told what a press costs before they make it, so the button never means
 * "wait, and then lose it".
 *
 * The per-run curve is fitted to three measurements on this machine — 38 ms at 18 people, 92 at
 * 44, 210 at 80 — and is deliberately an over-estimate for the band, whose replicates run a
 * little cheaper than a full paired run.
 */

const MEASUREMENT = {
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.1,
  recoveryDwellSteps: 20,
};

function job(overrides: Parameters<typeof makeSweepJob>[0]): ReturnType<typeof makeSweepJob> {
  return makeSweepJob(overrides);
}

const SINGLE = job({
  base: { crowd: { nPedestrians: 18 } },
  axis: null,
  axisValues: [0],
  seedIndices: [0],
  measurement: MEASUREMENT,
  columns: [...HEADLINE_COLUMNS],
  bandReplicates: null,
  floor: null,
  zeroReferenceRun: false,
  frechet: false,
});

describe("what a press of Run costs", () => {
  it("tracks the three runs that were actually timed", () => {
    expect(perRunMs(18)).toBeCloseTo(38, 0);
    expect(perRunMs(44)).toBeCloseTo(92, 0);
    expect(perRunMs(80)).toBeCloseTo(210, 0);
  });

  it("counts a single run as one run", () => {
    expect(runsFor(SINGLE)).toBe(1);
    expect(estimateCostMs(SINGLE)).toBeLessThan(100);
  });

  it("charges the band per cell, at the replicate count actually asked for", () => {
    const withBand = job({
      base: { crowd: { nPedestrians: 18 } },
      axis: null,
      axisValues: [0],
      seedIndices: [0],
      measurement: MEASUREMENT,
      columns: [...HEADLINE_COLUMNS],
      bandReplicates: { n: 8, scope: "perCell" },
      floor: null,
      zeroReferenceRun: false,
      frechet: false,
    });
    const marginal = estimateCostMs(withBand) - estimateCostMs(SINGLE);
    expect(marginal).toBeCloseTo(8 * perRunMs(18), 0);
  });

  it("does not charge a measurement-axis sweep for simulations it will not run", () => {
    const world = job({
      base: { crowd: { nPedestrians: 18 } },
      axis: "robotSpeed",
      axisValues: [0.6, 0.8, 1.0, 1.2, 1.4],
      seedIndices: [0, 1, 2, 3],
      measurement: MEASUREMENT,
      columns: [...HEADLINE_COLUMNS],
      bandReplicates: null,
      floor: null,
      zeroReferenceRun: false,
      frechet: false,
    });
    const measurementAxis = job({
      base: { crowd: { nPedestrians: 18 } },
      axis: "forecastHorizon",
      axisValues: [20, 30, 40, 50, 60],
      seedIndices: [0, 1, 2, 3],
      measurement: MEASUREMENT,
      columns: [...HEADLINE_COLUMNS],
      bandReplicates: null,
      floor: null,
      zeroReferenceRun: false,
      frechet: false,
    });
    expect(estimateCostMs(measurementAxis)).toBeLessThan(estimateCostMs(world) / 3);
  });

  it("says both how many runs and how long, in words", () => {
    const sweep = job({
      base: { crowd: { nPedestrians: 18 } },
      axis: "crowdSize",
      axisValues: [4, 8, 12, 18, 24, 32, 44],
      seedIndices: [0, 1, 2, 3, 4, 5, 6, 7],
      measurement: MEASUREMENT,
      columns: [...HEADLINE_COLUMNS],
      bandReplicates: null,
      floor: null,
      zeroReferenceRun: false,
      frechet: false,
    });
    expect(runsFor(sweep)).toBe(56);
    expect(describeCost(sweep)).toMatch(/^56 runs — about \d+(\.\d)? s$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/cost.test.ts`
Expected: FAIL with `Failed to resolve import "../cost.js" from "web/app/console/__tests__/cost.test.ts". Does the file exist?`

- [ ] **Step 3: Write `web/app/console/cost.ts`**

```ts
// web/app/console/cost.ts
import { AXES } from "../../engine/job/axes.js";
import { configForCell, type SweepJob } from "../../engine/job/spec.js";

/**
 * What one press of Run will cost, in words, before it is pressed.
 *
 * `perRunMs` is a quadratic through three timings measured on this machine at nTicks=800: 38 ms
 * at 18 pedestrians, 92 at 44, 210 at 80. It is quadratic because the social-force step is
 * pairwise, and a linear fit under-reports a big room by a factor of two.
 *
 * This is an estimate and says so. It over-charges the run-to-run band slightly — its replicates
 * are single arms and come in about 14% under a full paired run — which is the direction an
 * estimate shown before a wait should err in.
 */

export const FRECHET_MS = 117;
export const FLOOR_MS = 1500;
/** All six cheap composers together, measured against a 38 ms paired run. */
export const CHEAP_COLUMNS_MS = 3.4;

export function perRunMs(nPedestrians: number): number {
  const n = nPedestrians;
  return 15.9 + 0.876 * n + 0.01937 * n * n;
}

export function runsFor(job: SweepJob): number {
  return job.axisValues.length * job.seedIndices.length;
}

function isMeasurementAxis(job: SweepJob): boolean {
  if (job.axis === null) {
    return false;
  }
  return AXES[job.axis].kind === "measurementAxis";
}

export function estimateCostMs(job: SweepJob): number {
  const measurementOnly = isMeasurementAxis(job);
  let total = 0;

  for (let cellIndex = 0; cellIndex < job.axisValues.length; cellIndex++) {
    const firstSeed = job.seedIndices[0] ?? 0;
    const config = configForCell(job, cellIndex, firstSeed);
    const people = config.crowd.nPedestrians;
    const simulationMs = perRunMs(people);

    for (let s = 0; s < job.seedIndices.length; s++) {
      // A measurement axis re-applies the forecaster to a run that already exists; only the first
      // cell pays for the simulation. That is a correctness statement, not an optimisation: the
      // robot has not changed, so re-simulating would be wrong as well as slow.
      const simulates = !measurementOnly || cellIndex === 0;
      if (simulates) {
        total += simulationMs;
        if (job.zeroReferenceRun) {
          total += simulationMs;
        }
      }
      total += CHEAP_COLUMNS_MS;
      if (job.frechet) {
        total += FRECHET_MS;
      }
    }

    if (job.bandReplicates !== null && !measurementOnly) {
      const perBand = job.bandReplicates.n * simulationMs;
      if (job.bandReplicates.scope === "perCell") {
        total += perBand;
      } else {
        total += perBand * job.seedIndices.length;
      }
    }
    if (job.floor !== null) {
      total += FLOOR_MS;
    }
  }
  return total;
}

export function describeCost(job: SweepJob): string {
  const runs = runsFor(job);
  const seconds = estimateCostMs(job) / 1000;
  const shown = seconds < 10 ? seconds.toFixed(1) : seconds.toFixed(0);
  const noun = runs === 1 ? "run" : "runs";
  return `${runs} ${noun} — about ${shown} s`;
}
```

- [ ] **Step 4: Run the cost test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/cost.test.ts`

- [ ] **Step 5: Write the failing group test**

```ts
// web/app/console/__tests__/group.test.ts
import { describe, expect, it } from "vitest";
import { ContractError } from "../../../engine/core/errors.js";
import { makeSweepJob } from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS } from "../../../engine/job/columns.js";
import type { RunRow } from "../../../engine/job/runner.js";
import { labelForCell, labelForJob, makeGroupBuilder, makeRunGroup } from "../group.js";

const MEASUREMENT = {
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.1,
  recoveryDwellSteps: 20,
};

const JOB = makeSweepJob({
  base: { crowd: { nPedestrians: 18 } },
  axis: "crowdSize",
  axisValues: [4, 18],
  seedIndices: [0, 1],
  measurement: MEASUREMENT,
  columns: [...HEADLINE_COLUMNS],
  bandReplicates: { n: 8, scope: "perCell" },
  floor: null,
  zeroReferenceRun: true,
  frechet: false,
});

function row(axisIndex: number, axisValue: number, seedIndex: number, value: number): RunRow {
  return {
    kind: "runRow",
    key: { axisIndex, axisValue, seedIndex },
    readings: { trueEffectM: { kind: "reading", value, availability: { kind: "measured" } } },
  };
}

describe("a completed group of runs", () => {
  it("collects rows and bands as the worker sends them", () => {
    const builder = makeGroupBuilder(JOB);
    builder.addRow(row(0, 4, 0, 0.151));
    builder.addRow(row(0, 4, 1, 0.155));
    builder.addBand({ kind: "bandReading", axisIndex: 0, meanM: 0.172, peakM: 0.34, nReplicates: 8 });
    expect(builder.count()).toBe(2);

    const group = builder.finish({ id: "group-1", completedAtMs: 1000 });
    expect(group.kind).toBe("runGroup");
    expect(group.rows.length).toBe(2);
    expect(group.bands.length).toBe(1);
    expect(group.job).toBe(JOB);
    expect(Object.isFrozen(group)).toBe(true);
  });

  it("names the group and its cells in plain English", () => {
    expect(labelForJob(JOB)).toBe("how many people are in the room — sweep");
    expect(labelForCell(JOB, 1)).toBe("how many people are in the room 18");
  });

  it("refuses a group whose rows do not belong to its job", () => {
    const builder = makeGroupBuilder(JOB);
    builder.addRow(row(7, 99, 0, 0.2));
    expect(() => builder.finish({ id: "group-2", completedAtMs: 1 })).toThrow(ContractError);
  });

  it("refuses a group with no identity", () => {
    expect(() =>
      makeRunGroup({ id: "", label: "x", job: JOB, rows: [], bands: [], completedAtMs: 0 }),
    ).toThrow(ContractError);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/group.test.ts`
Expected: FAIL with `Failed to resolve import "../group.js" from "web/app/console/__tests__/group.test.ts". Does the file exist?`

- [ ] **Step 7: Write `web/app/console/group.ts`**

```ts
// web/app/console/group.ts
import { ContractError } from "../../engine/core/errors.js";
import { AXES } from "../../engine/job/axes.js";
import type { SweepJob } from "../../engine/job/spec.js";
import type { BandReading, RunRow } from "../../engine/job/runner.js";

/**
 * One press of Run, finished.
 *
 * A group holds RUNS, not cells. A cell — one axis value, aggregated over its seeds — is what the
 * operator reads, but a cell has no seed and so cannot be rebuilt, and playback, pinning and the
 * recompute trick all need something that can. The ledger derives cells from these rows at render
 * time; nothing here stores an aggregate.
 */

export interface RunGroup {
  readonly kind: "runGroup";
  readonly id: string;
  readonly label: string;
  readonly job: SweepJob;
  readonly rows: readonly RunRow[];
  readonly bands: readonly BandReading[];
  readonly completedAtMs: number;
}

export interface RunGroupInit {
  readonly id: string;
  readonly label: string;
  readonly job: SweepJob;
  readonly rows: readonly RunRow[];
  readonly bands: readonly BandReading[];
  readonly completedAtMs: number;
}

export function labelForJob(job: SweepJob): string {
  if (job.axis === null) {
    return "single run";
  }
  return `${AXES[job.axis].label} — sweep`;
}

export function labelForCell(job: SweepJob, axisIndex: number): string {
  const value = job.axisValues[axisIndex];
  if (job.axis === null || value === undefined) {
    return "single run";
  }
  return `${AXES[job.axis].label} ${value}`;
}

export function makeRunGroup(init: RunGroupInit): RunGroup {
  if (init.id.length === 0) {
    throw new ContractError("a kept result must have an id, or nothing can select it");
  }
  if (init.label.length === 0) {
    throw new ContractError(`kept result '${init.id}' has no plain-English name`);
  }
  for (const row of init.rows) {
    const axisValue = init.job.axisValues[row.key.axisIndex];
    if (axisValue === undefined) {
      throw new ContractError(
        `kept result '${init.id}' holds a run at axis index ${row.key.axisIndex}, which this job ` +
          `does not have; the ledger would then show a cell nothing can rebuild`,
      );
    }
    if (!init.job.seedIndices.includes(row.key.seedIndex)) {
      throw new ContractError(
        `kept result '${init.id}' holds a run at seed index ${row.key.seedIndex}, which this job ` +
          `did not ask for`,
      );
    }
  }
  return Object.freeze({
    kind: "runGroup" as const,
    id: init.id,
    label: init.label,
    job: init.job,
    rows: Object.freeze([...init.rows]),
    bands: Object.freeze([...init.bands]),
    completedAtMs: init.completedAtMs,
  });
}

export interface GroupBuilder {
  readonly kind: "groupBuilder";
  readonly addRow: (row: RunRow) => void;
  readonly addBand: (band: BandReading) => void;
  readonly count: () => number;
  readonly finish: (init: { readonly id: string; readonly completedAtMs: number }) => RunGroup;
}

export function makeGroupBuilder(job: SweepJob): GroupBuilder {
  const rows: RunRow[] = [];
  const bands: BandReading[] = [];
  return Object.freeze({
    kind: "groupBuilder" as const,
    addRow: (row: RunRow): void => {
      rows.push(row);
    },
    addBand: (band: BandReading): void => {
      bands.push(band);
    },
    count: (): number => rows.length,
    finish: (init: { readonly id: string; readonly completedAtMs: number }): RunGroup =>
      makeRunGroup({
        id: init.id,
        label: labelForJob(job),
        job,
        rows,
        bands,
        completedAtMs: init.completedAtMs,
      }),
  });
}
```

- [ ] **Step 8: Run the group test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/group.test.ts`

- [ ] **Step 9: Add the Run block to `web/console.html`**

Insert as the last child of `<aside class="settings" id="settings">`:

```html
    <p class="panel-title">One press of Run</p>
    <div class="run-block">
      <button id="run" type="button" class="run">Run</button>
      <p class="run-cost" id="run-cost">1 run — about 0.1 s</p>
      <p class="run-status" id="run-status"></p>
    </div>
```

And immediately after the `</section>` that closes the stage, so the rule sits between the stage and the ledger:

```html
  <div class="progress-rule" id="progress-rule" role="progressbar"
       aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
  <section class="kept" id="kept"><p class="kept-empty" id="kept-empty">No results kept yet.</p></section>
```

- [ ] **Step 10: Write the failing Run-wiring test**

```ts
// web/app/console/__tests__/run.test.ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import type { SweepJob } from "../../../engine/job/spec.js";
import type { BandReading, RunRow } from "../../../engine/job/runner.js";

/**
 * The Run button is the verb on this page, and the previous draft of this work shipped it wired to
 * nothing. So the worker is replaced by a recorder here and every branch is driven by hand:
 * a job is built from the panel, progress reaches the hairline rule, cancel is reachable while it
 * runs, a failure is said out loud rather than left spinning, and a finished sweep lands in the
 * kept list.
 */

interface Captured {
  readonly onProgress: (unitsDone: number, unitsTotal: number, phase: string) => void;
  readonly onRow: (row: RunRow) => void;
  readonly onBand: (band: BandReading) => void;
  readonly onDone: () => void;
  readonly onCancelled: () => void;
  readonly onFailed: (message: string) => void;
}

const { started, cancelled, handlers } = vi.hoisted(() => ({
  started: [] as SweepJob[],
  cancelled: [] as number[],
  handlers: [] as Captured[],
}));

vi.mock("../../worker/client.js", () => ({
  makeSweepClient: (captured: Captured) => {
    handlers.push(captured);
    return {
      kind: "sweepClient",
      start: (job: SweepJob): void => {
        started.push(job);
      },
      cancel: (): void => {
        cancelled.push(1);
      },
    };
  },
}));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function boot(): Promise<{ readonly document: Document; readonly window: JSDOM["window"] }> {
  const html = readFileSync(join(ROOT, "console.html"), "utf8");
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: "https://example.test/console" });
  const stub = new Proxy({}, { get: () => (): void => {}, set: () => true });
  const prototype = dom.window.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown };
  prototype.getContext = (): unknown => stub;

  const globals = globalThis as unknown as Record<string, unknown>;
  globals["window"] = dom.window;
  globals["document"] = dom.window.document;
  globals["HTMLElement"] = dom.window.HTMLElement;
  globals["getComputedStyle"] = dom.window.getComputedStyle.bind(dom.window);
  globals["requestAnimationFrame"] = (): number => 0;

  started.length = 0;
  cancelled.length = 0;
  handlers.length = 0;
  vi.resetModules();
  await import("../../../console.js");
  return { document: dom.window.document, window: dom.window };
}

function click(target: Element | null, window: JSDOM["window"]): void {
  target?.dispatchEvent(new window.Event("click", { bubbles: true }));
}

function row(axisIndex: number, axisValue: number, seedIndex: number): RunRow {
  return {
    kind: "runRow",
    key: { axisIndex, axisValue, seedIndex },
    readings: { trueEffectM: { kind: "reading", value: 0.352, availability: { kind: "measured" } } },
  };
}

describe("pressing Run", () => {
  it("prices the press before it happens", async () => {
    const { document } = await boot();
    expect(document.getElementById("run-cost")?.textContent).toMatch(/^\d+ runs? — about /);
  });

  it("starts a job built from the panel", async () => {
    const { document, window } = await boot();
    click(document.getElementById("run"), window);
    expect(started.length).toBe(1);
    const job = started[0] as SweepJob;
    expect(job.kind).toBe("sweepJob");
    expect(job.measurement.forecastEndStep).toBe(200);
    expect(job.seedIndices.length).toBeGreaterThan(0);
  });

  it("fills the hairline rule as the work lands", async () => {
    const { document, window } = await boot();
    click(document.getElementById("run"), window);
    (handlers[0] as Captured).onProgress(14, 56, "simulating");
    const rule = document.getElementById("progress-rule");
    expect(rule?.style.getPropertyValue("--mirn-progress")).toBe("0.25");
    expect(rule?.getAttribute("aria-valuenow")).toBe("25");
  });

  it("turns into Cancel while it runs, and back again", async () => {
    const { document, window } = await boot();
    const button = document.getElementById("run");
    click(button, window);
    expect(button?.textContent).toBe("Cancel");
    click(button, window);
    expect(cancelled.length).toBe(1);
    (handlers[0] as Captured).onCancelled();
    expect(button?.textContent).toBe("Run");
    expect(document.getElementById("run-status")?.textContent).toBe("Cancelled. Nothing was kept.");
  });

  it("says what went wrong rather than spinning", async () => {
    const { document, window } = await boot();
    click(document.getElementById("run"), window);
    (handlers[0] as Captured).onFailed("crowd size must be a positive integer");
    expect(document.getElementById("run-status")?.textContent).toBe(
      "The sweep stopped: crowd size must be a positive integer",
    );
    expect(document.getElementById("run")?.textContent).toBe("Run");
  });

  it("commits the finished runs to the kept list", async () => {
    const { document, window } = await boot();
    click(document.getElementById("run"), window);
    const captured = handlers[0] as Captured;
    captured.onRow(row(0, 18, 0));
    captured.onBand({ kind: "bandReading", axisIndex: 0, meanM: 0.311, peakM: 0.62, nReplicates: 8 });
    captured.onDone();
    expect(document.getElementById("kept-empty")).toBeNull();
    expect(document.querySelectorAll("[data-group-id]").length).toBe(1);
  });
});
```

- [ ] **Step 11: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/run.test.ts`
Expected: FAIL with `expected null to match /^\d+ runs? — about / ` — the Run block exists in the HTML but `console.ts` never fills it, and no click handler is attached.

- [ ] **Step 12: Wire Run into `web/console.ts`**

Add these imports at the top:

```ts
import { makeSweepJob, type SweepJob } from "./engine/job/spec.js";
import type { BandReading, RunRow } from "./engine/job/runner.js";
import { makeSweepClient } from "./app/worker/client.js";
import { describeCost } from "./app/console/cost.js";
import { makeGroupBuilder, type GroupBuilder, type RunGroup } from "./app/console/group.js";
import type { ConsoleSettings } from "./app/console/state.js";
```

Add above `bootConsole`:

```ts
export const keptGroups: RunGroup[] = [];
let running: GroupBuilder | null = null;
let groupCounter = 0;

/**
 * The whole grid is validated here, before the first simulation.
 *
 * `makeSweepJob` builds and checks every (cell, seed) config up front — microseconds for a 20x8
 * grid — so an illegal axis value is a message beside the button rather than a failure forty
 * seconds into a sweep that then has nothing to show for itself.
 */
export function jobFromSettings(settings: ConsoleSettings): SweepJob {
  return makeSweepJob({
    base: settings.base,
    axis: settings.axis,
    axisValues: settings.axis === null ? [0] : settings.axisValues,
    seedIndices: settings.seedIndices,
    measurement: settings.measurement,
    columns: settings.columns,
    bandReplicates: settings.wantBand ? { n: settings.bandReplicates, scope: "perCell" } : null,
    floor: settings.wantFloor
      ? { kind: "floorParams", nSplits: 200, alpha: 0.05, strideSteps: 1, permutationSeed: 20260816 }
      : null,
    zeroReferenceRun: settings.wantZeroRun,
    frechet: settings.wantFrechet,
  });
}
```

Add inside `bootConsole`, after the existing element lookups:

```ts
  const runButton = el<HTMLButtonElement>(doc, "run");
  const runCost = el<HTMLParagraphElement>(doc, "run-cost");
  const runStatus = el<HTMLParagraphElement>(doc, "run-status");
  const progressRule = el<HTMLDivElement>(doc, "progress-rule");
  const kept = el<HTMLElement>(doc, "kept");

  const setProgress = (fraction: number): void => {
    let clamped = fraction;
    if (clamped < 0) {
      clamped = 0;
    }
    if (clamped > 1) {
      clamped = 1;
    }
    progressRule.style.setProperty("--mirn-progress", String(clamped));
    progressRule.setAttribute("aria-valuenow", String(Math.round(clamped * 100)));
  };

  const setIdle = (): void => {
    running = null;
    runButton.textContent = "Run";
    setProgress(0);
  };

  const priceThepress = (): void => {
    // Recomputed from the panel every time it moves, so the figure beside the button is never a
    // price for a sweep the operator has already changed.
    try {
      runCost.textContent = describeCost(jobFromSettings(readPanel(doc)));
      runStatus.textContent = "";
    } catch (error) {
      runCost.textContent = "";
      runStatus.textContent = `These settings cannot be run: ${(error as Error).message}`;
    }
  };

  const renderKept = (): void => {
    // Task 28 replaces this with the ledger. Until then a kept group is one addressable line, so
    // the Run path is complete and testable on its own.
    while (kept.firstChild !== null) {
      kept.removeChild(kept.firstChild);
    }
    for (const group of keptGroups) {
      const line = doc.createElement("p");
      line.className = "kept-line";
      line.setAttribute("data-group-id", group.id);
      line.textContent = `${group.label} · ${group.rows.length} runs kept`;
      kept.appendChild(line);
    }
  };

  const client = makeSweepClient({
    onProgress: (unitsDone: number, unitsTotal: number, phase: string): void => {
      setProgress(unitsTotal === 0 ? 0 : unitsDone / unitsTotal);
      runStatus.textContent = `${phase} · ${unitsDone} of ${unitsTotal}`;
    },
    onRow: (row: RunRow): void => {
      running?.addRow(row);
    },
    onBand: (band: BandReading): void => {
      running?.addBand(band);
    },
    onDone: (): void => {
      const builder = running;
      if (builder !== null) {
        groupCounter++;
        keptGroups.push(builder.finish({ id: `group-${groupCounter}`, completedAtMs: Date.now() }));
        renderKept();
      }
      setIdle();
      runStatus.textContent = "";
    },
    onCancelled: (): void => {
      setIdle();
      runStatus.textContent = "Cancelled. Nothing was kept.";
    },
    onFailed: (message: string): void => {
      setIdle();
      runStatus.textContent = `The sweep stopped: ${message}`;
    },
  });

  runButton.addEventListener("click", () => {
    if (running !== null) {
      client.cancel();
      return;
    }
    let job: SweepJob;
    try {
      job = jobFromSettings(readPanel(doc));
    } catch (error) {
      runStatus.textContent = `These settings cannot be run: ${(error as Error).message}`;
      return;
    }
    running = makeGroupBuilder(job);
    runButton.textContent = "Cancel";
    setProgress(0);
    runStatus.textContent = "starting";
    client.start(job);
  });
```

Then extend the two existing panel listeners so the price tracks the panel — replace their bodies with:

```ts
  settingsPanel.addEventListener("input", () => {
    priceThePress();
    scheduleRecompute();
  });
  settingsPanel.addEventListener("change", () => {
    priceThePress();
    scheduleRecompute();
  });
```

and add `priceThePress();` immediately before the existing `recompute();` at the end of `bootConsole`.

- [ ] **Step 13: Add the progress rule and Run button to `web/style.css`**

```css
/* The one inverted element on the page. One solid mass tells the eye where the verb is. */
.run {
  width: 100%;
  padding: 0.7rem 1rem;
  background: var(--mirn-ink);
  color: var(--mirn-paper);
  border: 1px solid var(--mirn-ink);
  font-size: 0.8rem;
}
.run:hover { background: var(--mirn-ink-muted); }
.run-cost, .run-status {
  margin: 0.4rem 0 0;
  font-family: var(--mirn-font-mono);
  font-size: 0.66rem;
  color: var(--mirn-ink-faint);
}
.run-status:empty { display: none; }

/* A hairline filling left to right. Not a bar, and no radius. */
.progress-rule { height: 1px; background: var(--mirn-grid); margin: 1.6rem 0; }
.progress-rule > span {
  display: block;
  height: 1px;
  width: calc(var(--mirn-progress, 0) * 100%);
  background: var(--mirn-perturbation);
}
.kept-line { margin: 0.3rem 0; font-family: var(--mirn-font-mono); font-size: 0.72rem; }
```

- [ ] **Step 14: Run the Run test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/run.test.ts`

- [ ] **Step 15: Commit**

```bash
git add web/app/console/cost.ts web/app/console/group.ts web/console.ts web/console.html \
        web/style.css web/app/console/__tests__/cost.test.ts \
        web/app/console/__tests__/group.test.ts web/app/console/__tests__/run.test.ts
git commit -m "Wire the Run button to the worker, and price it before the press

One press builds a SweepJob from the panel, validates the whole grid before the
first simulation, and streams rows back onto a hairline progress rule. Cancel is
the same button while it runs; a failure is said out loud instead of spinning.
A finished press lands as a group of RUNS keyed {axisIndex, axisValue,
seedIndex} — never as aggregates, because a cell cannot be rebuilt and a run
can. The cost line is recomputed from the panel on every change, from a
quadratic fitted to the three run timings actually measured, and it charges a
measurement-axis sweep for M simulations rather than N x M."
```

---

### Task 28: The ledger

**Files:**
- Create: `web/app/console/table.ts`
- Modify: `web/console.ts`
- Modify: `web/console.html`
- Modify: `web/style.css`
- Test: `web/app/console/__tests__/table.test.ts`
- Test: `web/app/console/__tests__/ledger-dom.test.ts`

**Interfaces:**
- Consumes (Task 15/16): `accumulate(rows: readonly RunRow[], columns: readonly ColumnKey[]): ReadonlyMap<number, Readonly<Partial<Record<ColumnKey, Aggregate>>>>`; `interface Aggregate { value; sd; nUsed; nAttempted; reason: AggregateReason }` where
  `export type AggregateReason = { readonly kind: "aggregated" } | { readonly kind: "censored"; readonly why: string } | { readonly kind: "notApplicable"; readonly why: string } | { readonly kind: "empty"; readonly why: string }`.
- Consumes (Task 27): `RunGroup`, `labelForCell(job, axisIndex)`.
- Consumes (Task 25): `formatValue`, `unitSuffix`.
- Consumes (Task 22, `web/app/console/csv.ts`): `export function toCsv(init: { readonly job: SweepJob; readonly rows: readonly RunRow[]; readonly bands: readonly BandReading[]; readonly columns: readonly ColumnKey[]; readonly generatedAtIso: string }): string`.
- Consumes (Task 21, `web/app/console/permalink.ts`): `export function encodeSettings(settings: ConsoleSettings): string` — a query string beginning `?`.
- Produces: `interface CellRef`, `makeCellRef`, `type SortKey`, `interface LedgerView`, `makeLedgerView`, `interface LedgerRow`, `ledgerRows(view): readonly LedgerRow[]`, `interface ColumnDelta`, `compareRows(view): readonly ColumnDelta[]`, `settingsMatchJob(settings, job): boolean`, `STALE_MESSAGE`, `renderLedger(doc, view): HTMLElement`, `renderColumnPicker(doc, view): HTMLElement`, `downloadCsv(doc, filename, text): void`.

The ledger never groups or averages anything itself. `accumulate` from `runner.ts` is the only implementation of per-cell grouping, and `csv.ts` calls it too — which is what kills the "the table disagrees with the CSV" class of bug.

- [ ] **Step 1: Write the failing table test**

```ts
// web/app/console/__tests__/table.test.ts
import { describe, expect, it } from "vitest";
import { makeSweepJob } from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS, type ColumnKey } from "../../../engine/job/columns.js";
import type { RunRow } from "../../../engine/job/runner.js";
import { makeConsoleSettings } from "../state.js";
import { makeRunGroup } from "../group.js";
import {
  compareRows,
  ledgerRows,
  makeCellRef,
  makeLedgerView,
  settingsMatchJob,
} from "../table.js";

const MEASUREMENT = {
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.1,
  recoveryDwellSteps: 20,
};

const JOB = makeSweepJob({
  base: { crowd: { nPedestrians: 18 } },
  axis: "crowdSize",
  axisValues: [4, 18, 44],
  seedIndices: [0, 1],
  measurement: MEASUREMENT,
  columns: [...HEADLINE_COLUMNS],
  bandReplicates: null,
  floor: null,
  zeroReferenceRun: true,
  frechet: false,
});

function row(axisIndex: number, axisValue: number, seedIndex: number, value: number): RunRow {
  return {
    kind: "runRow",
    key: { axisIndex, axisValue, seedIndex },
    readings: {
      trueEffectM: { kind: "reading", value, availability: { kind: "measured" } },
      robotCrossingM: {
        kind: "reading",
        value: Number.NaN,
        availability: { kind: "censored", why: "the robot never reached its goal" },
      },
    },
  };
}

const GROUP = makeRunGroup({
  id: "group-1",
  label: "how many people are in the room — sweep",
  job: JOB,
  rows: [
    row(0, 4, 0, 0.150),
    row(0, 4, 1, 0.156),
    row(1, 18, 0, 0.350),
    row(1, 18, 1, 0.354),
    row(2, 44, 0, 0.380),
    row(2, 44, 1, 0.386),
  ],
  bands: [],
  completedAtMs: 1000,
});

const COLUMNS: readonly ColumnKey[] = ["trueEffectM", "robotCrossingM"];

function view(overrides: {
  readonly selected?: ReturnType<typeof makeCellRef> | null;
  readonly pinned?: readonly ReturnType<typeof makeCellRef>[];
  readonly sort?: { readonly kind: "byAxis" } | { readonly kind: "byColumn"; readonly column: ColumnKey };
  readonly direction?: "ascending" | "descending";
  readonly staleMessage?: string | null;
}) {
  return makeLedgerView({
    groups: [GROUP],
    columns: COLUMNS,
    selected: overrides.selected ?? null,
    pinned: overrides.pinned ?? [],
    sort: overrides.sort ?? { kind: "byAxis" },
    direction: overrides.direction ?? "ascending",
    staleMessage: overrides.staleMessage ?? null,
  });
}

describe("the ledger", () => {
  it("makes one row per cell, aggregated over that cell's seeds", () => {
    const rows = ledgerRows(view({}));
    expect(rows.length).toBe(3);
    const first = rows[0];
    expect(first?.axisValue).toBe(4);
    expect(first?.nUsed).toBe(2);
    expect(first?.nAttempted).toBe(2);
    expect(first?.cells["trueEffectM"]?.value).toBeCloseTo(0.153, 6);
  });

  it("carries a censored cell through as its reason, never as a number", () => {
    const rows = ledgerRows(view({}));
    const crossing = rows[0]?.cells["robotCrossingM"];
    expect(crossing?.reason.kind).toBe("censored");
    expect(Number.isNaN(crossing?.value ?? 0)).toBe(true);
  });

  it("sorts by a column, with unmeasured cells last in both directions", () => {
    const descending = ledgerRows(
      view({ sort: { kind: "byColumn", column: "trueEffectM" }, direction: "descending" }),
    );
    expect(descending.map((r) => r.axisValue)).toEqual([44, 18, 4]);
    const ascending = ledgerRows(
      view({ sort: { kind: "byColumn", column: "robotCrossingM" }, direction: "ascending" }),
    );
    expect(ascending.map((r) => r.axisValue)).toEqual([4, 18, 44]);
  });

  it("keeps pinned rows at the top whatever the sort", () => {
    const pin = makeCellRef({ groupId: "group-1", axisIndex: 2 });
    const rows = ledgerRows(view({ pinned: [pin], sort: { kind: "byAxis" }, direction: "ascending" }));
    expect(rows[0]?.axisValue).toBe(44);
    expect(rows[0]?.pinned).toBe(true);
    expect(rows[1]?.pinned).toBe(false);
  });

  it("compares exactly two pinned rows, and otherwise compares nothing", () => {
    const a = makeCellRef({ groupId: "group-1", axisIndex: 0 });
    const b = makeCellRef({ groupId: "group-1", axisIndex: 1 });
    const deltas = compareRows(view({ pinned: [a, b] }));
    const trueEffect = deltas.find((d) => d.column === "trueEffectM");
    expect(trueEffect?.deltaM).toBeCloseTo(0.199, 6);
    expect(compareRows(view({ pinned: [a] })).length).toBe(0);
  });

  it("knows when the panel has moved away from what was measured", () => {
    const same = makeConsoleSettings({
      base: { crowd: { nPedestrians: 18 } },
      measurement: MEASUREMENT,
      axis: "crowdSize",
      axisValues: [4, 18, 44],
      seedIndices: [0, 1],
      columns: [...HEADLINE_COLUMNS],
      bandReplicates: 8,
      wantBand: false,
      wantFloor: false,
      wantFrechet: false,
      wantZeroRun: true,
    });
    expect(settingsMatchJob(same, JOB)).toBe(true);

    const moved = makeConsoleSettings({ ...same, base: { crowd: { nPedestrians: 19 } } });
    expect(settingsMatchJob(moved, JOB)).toBe(false);

    const differentHorizon = makeConsoleSettings({
      ...same,
      measurement: { ...MEASUREMENT, forecastHorizonSteps: 20 },
    });
    expect(settingsMatchJob(differentHorizon, JOB)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/table.test.ts`
Expected: FAIL with `Failed to resolve import "../table.js" from "web/app/console/__tests__/table.test.ts". Does the file exist?`

- [ ] **Step 3: Write `web/app/console/table.ts`**

```ts
// web/app/console/table.ts
import { ContractError } from "../../engine/core/errors.js";
import { makeRunConfig } from "../../engine/contracts/config.js";
import { COLUMNS, COLUMN_ORDER, type ColumnKey } from "../../engine/job/columns.js";
import { accumulate, type Aggregate } from "../../engine/job/runner.js";
import type { SweepJob } from "../../engine/job/spec.js";
import type { ConsoleSettings } from "./state.js";
import { labelForCell, type RunGroup } from "./group.js";
import { formatValue, unitSuffix } from "./tile.js";

/**
 * The kept-results ledger.
 *
 * A row is a CELL: one axis value, aggregated over that cell's seeds. The stored unit underneath
 * it is a RUN, keyed {axisIndex, axisValue, seedIndex}, because a cell has no seed and so cannot
 * be rebuilt, and playback needs something that can.
 *
 * The aggregation is not implemented here. `accumulate` in runner.ts is the only per-cell grouping
 * in the project, and csv.ts calls the same one — which is what stops the table and the export
 * ever disagreeing.
 */

export const STALE_MESSAGE =
  "these numbers were measured at the settings in the link, not the ones now in the panel.";

export interface CellRef {
  readonly kind: "cellRef";
  readonly groupId: string;
  readonly axisIndex: number;
}

export function makeCellRef(init: { readonly groupId: string; readonly axisIndex: number }): CellRef {
  if (init.groupId.length === 0) {
    throw new ContractError("a ledger selection must name a kept result");
  }
  if (!Number.isInteger(init.axisIndex) || init.axisIndex < 0) {
    throw new ContractError(`a ledger selection must name a cell, got ${init.axisIndex}`);
  }
  return Object.freeze({ kind: "cellRef" as const, groupId: init.groupId, axisIndex: init.axisIndex });
}

export type SortKey =
  | { readonly kind: "byAxis" }
  | { readonly kind: "byColumn"; readonly column: ColumnKey };

export interface LedgerViewInit {
  readonly groups: readonly RunGroup[];
  readonly columns: readonly ColumnKey[];
  readonly selected: CellRef | null;
  readonly pinned: readonly CellRef[];
  readonly sort: SortKey;
  readonly direction: "ascending" | "descending";
  readonly staleMessage: string | null;
}

export interface LedgerView extends LedgerViewInit {
  readonly kind: "ledgerView";
}

export function makeLedgerView(init: LedgerViewInit): LedgerView {
  if (init.columns.length === 0) {
    throw new ContractError("the ledger must show at least one column");
  }
  return Object.freeze({
    kind: "ledgerView" as const,
    groups: Object.freeze([...init.groups]),
    columns: Object.freeze([...init.columns]),
    selected: init.selected,
    pinned: Object.freeze([...init.pinned]),
    sort: init.sort,
    direction: init.direction,
    staleMessage: init.staleMessage,
  });
}

export interface LedgerRow {
  readonly kind: "ledgerRow";
  readonly ref: CellRef;
  readonly label: string;
  readonly axisValue: number;
  readonly nUsed: number;
  readonly nAttempted: number;
  readonly cells: Readonly<Partial<Record<ColumnKey, Aggregate>>>;
  readonly pinned: boolean;
  readonly selected: boolean;
}

function isSameRef(a: CellRef, b: CellRef): boolean {
  return a.groupId === b.groupId && a.axisIndex === b.axisIndex;
}

function sortValue(row: LedgerRow, sort: SortKey): number {
  if (sort.kind === "byAxis") {
    return row.axisValue;
  }
  const cell = row.cells[sort.column];
  if (cell === undefined) {
    return Number.NaN;
  }
  return cell.value;
}

export function ledgerRows(view: LedgerView): readonly LedgerRow[] {
  const built: LedgerRow[] = [];

  for (const group of view.groups) {
    const byCell = accumulate(group.rows, view.columns);
    for (const [axisIndex, cells] of byCell) {
      const ref = makeCellRef({ groupId: group.id, axisIndex });
      let nUsed = 0;
      let nAttempted = group.job.seedIndices.length;
      for (const key of view.columns) {
        const cell = cells[key];
        if (cell !== undefined && cell.nUsed > nUsed) {
          nUsed = cell.nUsed;
          nAttempted = cell.nAttempted;
        }
      }
      let pinned = false;
      for (const pin of view.pinned) {
        if (isSameRef(pin, ref)) {
          pinned = true;
        }
      }
      const selected = view.selected !== null && isSameRef(view.selected, ref);
      built.push({
        kind: "ledgerRow",
        ref,
        label: labelForCell(group.job, axisIndex),
        axisValue: group.job.axisValues[axisIndex] ?? 0,
        nUsed,
        nAttempted,
        cells,
        pinned,
        selected,
      });
    }
  }

  // Pinned first, whatever the sort — a pin means "keep this one where I can see it". Then the
  // sort key, with unmeasured cells always last so a column of reasons never floats to the top.
  const sorted = [...built];
  sorted.sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    const av = sortValue(a, view.sort);
    const bv = sortValue(b, view.sort);
    const aFinite = Number.isFinite(av);
    const bFinite = Number.isFinite(bv);
    if (aFinite !== bFinite) {
      return aFinite ? -1 : 1;
    }
    if (!aFinite && !bFinite) {
      return 0;
    }
    return view.direction === "ascending" ? av - bv : bv - av;
  });
  return Object.freeze(sorted);
}

export interface ColumnDelta {
  readonly kind: "columnDelta";
  readonly column: ColumnKey;
  readonly aValue: number;
  readonly bValue: number;
  readonly deltaM: number;
}

export function compareRows(view: LedgerView): readonly ColumnDelta[] {
  if (view.pinned.length !== 2) {
    return Object.freeze([]);
  }
  const rows = ledgerRows(view);
  const pinnedRows: LedgerRow[] = [];
  for (const row of rows) {
    if (row.pinned) {
      pinnedRows.push(row);
    }
  }
  const first = pinnedRows[0];
  const second = pinnedRows[1];
  if (first === undefined || second === undefined) {
    return Object.freeze([]);
  }
  const deltas: ColumnDelta[] = [];
  for (const key of view.columns) {
    const a = first.cells[key];
    const b = second.cells[key];
    if (a === undefined || b === undefined) {
      continue;
    }
    deltas.push({
      kind: "columnDelta",
      column: key,
      aValue: a.value,
      bValue: b.value,
      deltaM: b.value - a.value,
    });
  }
  return Object.freeze(deltas);
}

/**
 * Whether the panel still describes what a kept result was measured at.
 *
 * Both sides go through `makeRunConfig`, so the comparison is between two fully defaulted configs
 * with the same key order rather than between two override bags that happen to differ in shape.
 */
export function settingsMatchJob(settings: ConsoleSettings, job: SweepJob): boolean {
  const fromPanel = makeRunConfig({ ...settings.base, seed: job.baseSeed, replicate: 0 });
  const fromJob = makeRunConfig({ ...job.base, seed: job.baseSeed, replicate: 0 });
  if (JSON.stringify(fromPanel) !== JSON.stringify(fromJob)) {
    return false;
  }
  return JSON.stringify(settings.measurement) === JSON.stringify(job.measurement);
}

function cellText(doc: Document, column: ColumnKey, cell: Aggregate | undefined): HTMLElement {
  const node = doc.createElement("td");
  node.className = "ledger-cell";
  if (cell === undefined) {
    node.appendChild(reasonSpan(doc, "not measured in this run"));
    return node;
  }
  if (cell.reason.kind !== "aggregated") {
    node.appendChild(reasonSpan(doc, cell.reason.why));
    return node;
  }
  const unit = COLUMNS[column].unit;
  const value = doc.createElement("span");
  value.className = "cell-number";
  value.textContent = formatValue(cell.value, unit);
  node.appendChild(value);
  const suffix = unitSuffix(unit);
  if (suffix.length > 0) {
    const unitNode = doc.createElement("span");
    unitNode.className = "cell-unit";
    unitNode.textContent = suffix;
    node.appendChild(unitNode);
  }
  // A mean never appears without its count, and a spread never appears as a zero it does not have:
  // sd is NaN below two survivors, and a 0 printed there would read as "no spread".
  if (Number.isFinite(cell.sd)) {
    const spread = doc.createElement("span");
    spread.className = "cell-spread";
    spread.textContent = `± ${formatValue(cell.sd, unit)}`;
    node.appendChild(spread);
  }
  return node;
}

function reasonSpan(doc: Document, why: string): HTMLElement {
  const node = doc.createElement("span");
  node.className = "cell-reason";
  node.textContent = why;
  return node;
}

export function renderLedger(doc: Document, view: LedgerView): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.className = "ledger-wrap";

  if (view.staleMessage !== null) {
    const note = doc.createElement("p");
    note.className = "ledger-stale";
    note.textContent = view.staleMessage;
    wrap.appendChild(note);
  }

  const table = doc.createElement("table");
  table.className = view.staleMessage === null ? "ledger" : "ledger is-stale";

  const head = doc.createElement("thead");
  const headRow = doc.createElement("tr");
  for (const label of ["", "result", "seeds"]) {
    const th = doc.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  }
  for (const key of view.columns) {
    const descriptor = COLUMNS[key];
    const th = doc.createElement("th");
    th.setAttribute("data-column", String(key));
    th.className = "ledger-heading";
    const name = doc.createElement("span");
    name.className = "col-label";
    name.textContent = descriptor.label;
    th.appendChild(name);
    const unit = doc.createElement("span");
    unit.className = "col-unit";
    unit.textContent = descriptor.unit;
    th.appendChild(unit);
    headRow.appendChild(th);
  }
  head.appendChild(headRow);
  table.appendChild(head);

  const body = doc.createElement("tbody");
  for (const row of ledgerRows(view)) {
    const tr = doc.createElement("tr");
    tr.className = row.selected ? "ledger-row is-selected" : "ledger-row";
    tr.setAttribute("data-group-id", row.ref.groupId);
    tr.setAttribute("data-axis-index", String(row.ref.axisIndex));
    tr.setAttribute("aria-selected", row.selected ? "true" : "false");

    const pinCell = doc.createElement("td");
    const pin = doc.createElement("button");
    pin.type = "button";
    pin.className = "pin";
    pin.setAttribute("aria-pressed", row.pinned ? "true" : "false");
    pin.setAttribute("aria-label", row.pinned ? "unpin this result" : "pin this result");
    // Filled disc against hollow — the same glyph pair the arena uses for treated and control, so
    // the ledger and the picture share one vocabulary.
    pin.textContent = row.pinned ? "●" : "○";
    pinCell.appendChild(pin);
    tr.appendChild(pinCell);

    const label = doc.createElement("td");
    label.className = "ledger-label";
    label.textContent = row.label;
    tr.appendChild(label);

    const seeds = doc.createElement("td");
    seeds.className = "ledger-seeds";
    seeds.textContent = `${row.nUsed}/${row.nAttempted}`;
    tr.appendChild(seeds);

    for (const key of view.columns) {
      tr.appendChild(cellText(doc, key, row.cells[key]));
    }
    body.appendChild(tr);
  }
  table.appendChild(body);
  wrap.appendChild(table);

  const deltas = compareRows(view);
  if (deltas.length > 0) {
    const strip = doc.createElement("p");
    strip.className = "ledger-compare";
    for (const delta of deltas) {
      const unit = COLUMNS[delta.column].unit;
      const item = doc.createElement("span");
      item.className = "compare-item";
      const name = doc.createElement("span");
      name.className = "compare-label";
      name.textContent = COLUMNS[delta.column].label;
      const value = doc.createElement("span");
      value.className = "compare-number";
      value.textContent = formatValue(delta.deltaM, unit);
      item.appendChild(name);
      item.appendChild(value);
      strip.appendChild(item);
    }
    wrap.appendChild(strip);
  }

  return wrap;
}

/**
 * The picker hides; it does not gate.
 *
 * Every column whose `needs` is "run" is computed on every unit — all six cheap composers together
 * are ~3.4 ms against a 38 ms paired run — so ticking one after a Run fills it in with no
 * re-simulation. Band, floor and Frechet are the three that had to be bought before the press, and
 * a column nobody bought says so rather than pretending to be empty.
 */
export function renderColumnPicker(doc: Document, view: LedgerView): HTMLElement {
  const list = doc.createElement("div");
  list.className = "column-picker";

  for (const key of COLUMN_ORDER) {
    const descriptor = COLUMNS[key];
    let bought = descriptor.needs === "run";
    for (const group of view.groups) {
      if (descriptor.needs === "band" && group.job.bandReplicates !== null) {
        bought = true;
      }
      if (descriptor.needs === "floor" && group.job.floor !== null) {
        bought = true;
      }
      if (descriptor.needs === "frechet" && group.job.frechet) {
        bought = true;
      }
      if (descriptor.needs === "zeroRun" && group.job.zeroReferenceRun) {
        bought = true;
      }
    }

    const label = doc.createElement("label");
    label.className = "column-option";
    const box = doc.createElement("input");
    box.type = "checkbox";
    box.value = String(key);
    box.checked = view.columns.includes(key);
    box.disabled = !bought;
    label.appendChild(box);

    const name = doc.createElement("span");
    name.className = "column-name";
    name.textContent = descriptor.label;
    label.appendChild(name);

    if (!bought) {
      const note = doc.createElement("span");
      note.className = "column-note";
      note.textContent = "not measured in any kept result — tick it before pressing Run";
      label.appendChild(note);
    }
    list.appendChild(label);
  }
  return list;
}

/**
 * Hand the operator the file.
 *
 * A blob URL where the browser offers one, a data URL otherwise. There is no server to post to and
 * there is not going to be one.
 */
export function downloadCsv(doc: Document, filename: string, text: string): void {
  const anchor = doc.createElement("a");
  anchor.download = filename;
  const maker = (globalThis as unknown as { URL?: { createObjectURL?: (blob: Blob) => string } }).URL;
  if (maker !== undefined && typeof maker.createObjectURL === "function") {
    anchor.href = maker.createObjectURL(new Blob([text], { type: "text/csv" }));
  } else {
    anchor.href = `data:text/csv;charset=utf-8,${encodeURIComponent(text)}`;
  }
  doc.body.appendChild(anchor);
  anchor.click();
  doc.body.removeChild(anchor);
}
```

- [ ] **Step 4: Run the table test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/table.test.ts`

- [ ] **Step 5: Add the ledger bar to `web/console.html`**

Replace the `<section class="kept" id="kept">…</section>` written in Task 27 with:

```html
  <section class="kept">
    <div class="ledger-bar">
      <h2 class="ledger-title">Kept results</h2>
      <button id="columns-toggle" type="button">Columns</button>
      <button id="export-csv" type="button">Export CSV</button>
      <button id="copy-link" type="button">Copy link</button>
      <button id="clear-kept" type="button">Clear</button>
    </div>
    <p class="ledger-note">The link carries the settings, not the results. Pressing Run reproduces
      them exactly.</p>
    <div id="columns-panel" hidden></div>
    <div id="ledger"><p class="kept-empty" id="kept-empty">No results kept yet.</p></div>
  </section>
```

- [ ] **Step 6: Write the failing ledger DOM test**

```ts
// web/app/console/__tests__/ledger-dom.test.ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import type { SweepJob } from "../../../engine/job/spec.js";
import type { BandReading, RunRow } from "../../../engine/job/runner.js";
import { STALE_MESSAGE } from "../table.js";

interface Captured {
  readonly onProgress: (unitsDone: number, unitsTotal: number, phase: string) => void;
  readonly onRow: (row: RunRow) => void;
  readonly onBand: (band: BandReading) => void;
  readonly onDone: () => void;
  readonly onCancelled: () => void;
  readonly onFailed: (message: string) => void;
}

const { handlers, csvCalls } = vi.hoisted(() => ({
  handlers: [] as Captured[],
  csvCalls: [] as unknown[],
}));

vi.mock("../../worker/client.js", () => ({
  makeSweepClient: (captured: Captured) => {
    handlers.push(captured);
    return { kind: "sweepClient", start: (): void => {}, cancel: (): void => {} };
  },
}));

vi.mock("../csv.js", () => ({
  toCsv: (init: unknown): string => {
    csvCalls.push(init);
    return "disclosure line\nheader\nrow";
  },
}));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function boot(): Promise<{ readonly document: Document; readonly window: JSDOM["window"] }> {
  const html = readFileSync(join(ROOT, "console.html"), "utf8");
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: "https://example.test/console" });
  const stub = new Proxy({}, { get: () => (): void => {}, set: () => true });
  const prototype = dom.window.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown };
  prototype.getContext = (): unknown => stub;
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["window"] = dom.window;
  globals["document"] = dom.window.document;
  globals["HTMLElement"] = dom.window.HTMLElement;
  globals["getComputedStyle"] = dom.window.getComputedStyle.bind(dom.window);
  globals["requestAnimationFrame"] = (): number => 0;
  handlers.length = 0;
  csvCalls.length = 0;
  vi.resetModules();
  await import("../../../console.js");
  return { document: dom.window.document, window: dom.window };
}

function click(target: Element | null, window: JSDOM["window"]): void {
  target?.dispatchEvent(new window.Event("click", { bubbles: true }));
}

function row(seedIndex: number, value: number): RunRow {
  return {
    kind: "runRow",
    key: { axisIndex: 0, axisValue: 0, seedIndex },
    readings: {
      trueEffectM: { kind: "reading", value, availability: { kind: "measured" } },
      robotCrossingM: {
        kind: "reading",
        value: Number.NaN,
        availability: { kind: "notApplicable", why: "the robot-free run has no robot to compare" },
      },
    },
  };
}

async function bootWithOneResult(): Promise<{ readonly document: Document; readonly window: JSDOM["window"] }> {
  const booted = await boot();
  click(booted.document.getElementById("run"), booted.window);
  const captured = handlers[0] as Captured;
  captured.onRow(row(0, 0.352));
  captured.onDone();
  return booted;
}

describe("the ledger on the page", () => {
  it("renders a row per cell once a run is kept", async () => {
    const { document } = await bootWithOneResult();
    expect(document.getElementById("kept-empty")).toBeNull();
    expect(document.querySelectorAll(".ledger-row").length).toBe(1);
  });

  it("renders a not-applicable cell as its reason", async () => {
    const { document } = await bootWithOneResult();
    const reasons = Array.from(document.querySelectorAll(".cell-reason")).map((n) => n.textContent);
    expect(reasons).toContain("the robot-free run has no robot to compare");
  });

  it("greys the ledger and says so when the panel has moved", async () => {
    const { document, window } = await bootWithOneResult();
    const people = document.getElementById("axis-crowdSize") as HTMLInputElement;
    people.value = String(Number(people.value) + 1);
    people.dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(document.querySelector(".ledger")?.classList.contains("is-stale")).toBe(true);
    expect(document.querySelector(".ledger-stale")?.textContent).toBe(STALE_MESSAGE);
  });

  it("pins with a filled disc and unpins with a hollow one", async () => {
    const { document, window } = await bootWithOneResult();
    const pin = document.querySelector(".pin");
    expect(pin?.textContent).toBe("○");
    click(pin, window);
    expect(document.querySelector(".pin")?.textContent).toBe("●");
  });

  it("exports the kept runs through the one CSV writer", async () => {
    const { document, window } = await bootWithOneResult();
    click(document.getElementById("export-csv"), window);
    expect(csvCalls.length).toBe(1);
  });

  it("puts the settings, not the results, in the address bar", async () => {
    const { document, window } = await bootWithOneResult();
    click(document.getElementById("copy-link"), window);
    expect(window.location.search.length).toBeGreaterThan(1);
    expect(window.location.search).not.toContain("0.352");
  });

  it("clears the kept results without clearing the panel", async () => {
    const { document, window } = await bootWithOneResult();
    click(document.getElementById("clear-kept"), window);
    expect(document.querySelectorAll(".ledger-row").length).toBe(0);
    expect(document.getElementById("kept-empty")).not.toBeNull();
    expect(document.querySelectorAll(".tile").length).toBe(6);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/ledger-dom.test.ts`
Expected: FAIL with `expected 0 to be 1` on `.ledger-row` — `console.ts` still renders the Task 27 placeholder lines.

- [ ] **Step 8: Replace the placeholder ledger in `web/console.ts`**

Add imports:

```ts
import {
  compareRows,
  downloadCsv,
  makeCellRef,
  makeLedgerView,
  renderColumnPicker,
  renderLedger,
  settingsMatchJob,
  STALE_MESSAGE,
  type CellRef,
  type SortKey,
} from "./app/console/table.js";
import { toCsv } from "./app/console/csv.js";
import { encodeSettings } from "./app/console/permalink.js";
import { COLUMN_ORDER, type ColumnKey } from "./engine/job/columns.js";
```

Add beside `keptGroups`:

```ts
let selectedCell: CellRef | null = null;
let pinnedCells: CellRef[] = [];
let ledgerColumns: ColumnKey[] = [...HEADLINE_COLUMNS];
let ledgerSort: SortKey = { kind: "byAxis" };
let ledgerDirection: "ascending" | "descending" = "ascending";
```

Replace `renderKept` and its element lookups with:

```ts
  const ledgerHost = el<HTMLDivElement>(doc, "ledger");
  const columnsPanel = el<HTMLDivElement>(doc, "columns-panel");
  const columnsToggle = el<HTMLButtonElement>(doc, "columns-toggle");
  const exportButton = el<HTMLButtonElement>(doc, "export-csv");
  const copyButton = el<HTMLButtonElement>(doc, "copy-link");
  const clearButton = el<HTMLButtonElement>(doc, "clear-kept");

  const currentView = (): ReturnType<typeof makeLedgerView> => {
    // Stale is derived from the panel against the SELECTED result, never stored. A status nobody
    // can persist is a status nobody can persist wrongly.
    let stale: string | null = null;
    if (selectedCell !== null) {
      for (const group of keptGroups) {
        if (group.id === selectedCell.groupId && !settingsMatchJob(readPanel(doc), group.job)) {
          stale = STALE_MESSAGE;
        }
      }
    }
    return makeLedgerView({
      groups: keptGroups,
      columns: ledgerColumns,
      selected: selectedCell,
      pinned: pinnedCells,
      sort: ledgerSort,
      direction: ledgerDirection,
      staleMessage: stale,
    });
  };

  const renderKept = (): void => {
    while (ledgerHost.firstChild !== null) {
      ledgerHost.removeChild(ledgerHost.firstChild);
    }
    if (keptGroups.length === 0) {
      const empty = doc.createElement("p");
      empty.className = "kept-empty";
      empty.id = "kept-empty";
      empty.textContent = "No results kept yet.";
      ledgerHost.appendChild(empty);
      return;
    }
    const view = currentView();
    ledgerHost.appendChild(renderLedger(doc, view));
    while (columnsPanel.firstChild !== null) {
      columnsPanel.removeChild(columnsPanel.firstChild);
    }
    columnsPanel.appendChild(renderColumnPicker(doc, view));
  };

  ledgerHost.addEventListener("click", (event: Event) => {
    const target = event.target as HTMLElement;
    const rowNode = target.closest(".ledger-row");
    if (rowNode === null) {
      return;
    }
    const groupId = rowNode.getAttribute("data-group-id") ?? "";
    const axisIndex = Number(rowNode.getAttribute("data-axis-index") ?? "0");
    const ref = makeCellRef({ groupId, axisIndex });
    if (target.classList.contains("pin")) {
      const kept: CellRef[] = [];
      let removed = false;
      for (const pin of pinnedCells) {
        if (pin.groupId === ref.groupId && pin.axisIndex === ref.axisIndex) {
          removed = true;
        } else {
          kept.push(pin);
        }
      }
      pinnedCells = removed ? kept : [...pinnedCells, ref];
      renderKept();
      return;
    }
    selectedCell = ref;
    renderKept();
  });

  ledgerHost.addEventListener("click", (event: Event) => {
    const heading = (event.target as HTMLElement).closest(".ledger-heading");
    if (heading === null) {
      return;
    }
    const column = heading.getAttribute("data-column");
    if (column === null) {
      return;
    }
    ledgerSort = { kind: "byColumn", column: column as ColumnKey };
    ledgerDirection = ledgerDirection === "ascending" ? "descending" : "ascending";
    renderKept();
  });

  columnsToggle.addEventListener("click", () => {
    columnsPanel.hidden = !columnsPanel.hidden;
  });

---

### Task 29: Playback, the sweep curve, and the focus ring

Split into three commits inside the task, because the three touch unrelated files and the CSS one is a guardrail repair that must not wait on a curve.

**Files:**
- Create: `web/app/console/playback.ts`
- Create: `web/app/console/curve.ts`
- Modify: `web/ui/plot.ts:11-18` and `web/ui/plot.ts:137-159`
- Modify: `web/console.ts`
- Modify: `web/console.html`
- Modify: `web/style.css`
- Test: `web/app/console/__tests__/playback.test.ts`
- Test: `web/ui/plot.test.ts`
- Test: `web/app/console/__tests__/curve.test.ts`
- Test: `web/app/console/__tests__/focus.test.ts`

**Interfaces:**
- Consumes (real source): `runPair(config: RunConfig, nowMs?: () => number): RunResult` from `web/engine/sim/run.ts:114`; `drawSweep(context: CanvasRenderingContext2D, view: PlotView, width: number, height: number): void` from `web/ui/plot.ts:51`; `fitCanvas` from `web/ui/arena.ts:62`.
- Consumes (Task 14): `configForCell(job, cellIndex, seedIndex): RunConfig`, `seedFor(job, seedIndex): number`.
- Consumes (Task 12): `AXES`.
- Consumes (Task 15): `accumulate`.
- Consumes (Task 27): `RunGroup`.
- Produces: `playback.ts` — `interface PlaybackSelection`, `makePlaybackSelection(init)`, `recomputeForPlayback(job, axisIndex, seedIndex): RunResult`, `stepSeed(current, delta, seedIndices): number`, `describeSeed(seedIndices, seedIndex): string`. `curve.ts` — `sweepPlotView(group: RunGroup): PlotView | null`. `plot.ts` gains one optional field on `PlotSeries`.

**On `web/ui/plot.ts` as it stands.** The real shapes are:

```ts
export interface PlotSeries { readonly key: string; readonly label: string;
  readonly values: readonly number[]; readonly sd?: readonly number[]; readonly accent?: boolean; }
export interface PlotView { readonly x: readonly number[]; readonly xLabel: string;
  readonly yLabel: string; readonly series: readonly PlotSeries[]; }
```

It does **not** already suffice for the shaded floor region the wireframe draws under the curve. Its only fill is the `sd` ribbon at `plot.ts:137-159`, which sweeps the upper edge at `value + sd` and the lower edge at `value - sd` clamped to zero — so a band series passed as `values = band, sd = band` shades from 0 to *twice* the band, and `values = band/2, sd = band/2` shades the right region but puts the line and its dots at half the band. Either is a false floor drawn under real numbers. One field is enough: `readonly fillToZero?: boolean`, which fills between the series and y=0 and suppresses that series' point markers, because a floor is a region and not a set of measurements. `yMax` already accounts for it (`sd` undefined contributes 0 at `plot.ts:66`), and the axis, gridline and label code is untouched.

- [ ] **Step 1: Write the failing playback test**

```ts
// web/app/console/__tests__/playback.test.ts
import { describe, expect, it } from "vitest";
import { makeSweepJob } from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS } from "../../../engine/job/columns.js";
import { describeSeed, recomputeForPlayback, stepSeed } from "../playback.js";

/**
 * The Worker returns numbers, never trajectories — a 72-run sweep of paths is about 33 MB. So
 * selecting a row for playback rebuilds that run's config and re-simulates it, 38 ms at 18 people.
 *
 * That substitution is only legal because of guardrail 4, and this file asserts it rather than
 * assuming it: two rebuilds of the same run are compared as BYTES, not approximations. Inexactness
 * would mean the picture on screen is not the run whose number is printed beside it.
 */

const JOB = makeSweepJob({
  base: { crowd: { nPedestrians: 8 }, nTicks: 200 },
  axis: "crowdSize",
  axisValues: [8, 12],
  seedIndices: [0, 1, 2, 3],
  measurement: {
    kind: "measurementParams",
    forecastHorizonSteps: 60,
    forecastEndStep: 150,
    nearMissThresholdM: 0.5,
    recoveryToleranceFraction: 0.1,
    recoveryDwellSteps: 20,
  },
  columns: [...HEADLINE_COLUMNS],
  bandReplicates: null,
  floor: null,
  zeroReferenceRun: false,
  frechet: false,
});

function bytesOf(paths: readonly Float64Array[]): string {
  const parts: string[] = [];
  for (const path of paths) {
    parts.push(Buffer.from(path.buffer, path.byteOffset, path.byteLength).toString("hex"));
  }
  return parts.join("|");
}

describe("rebuilding a run for playback", () => {
  it("is bitwise identical every time", () => {
    const first = recomputeForPlayback(JOB, 1, 2);
    const second = recomputeForPlayback(JOB, 1, 2);
    expect(bytesOf(second.treated.positions)).toBe(bytesOf(first.treated.positions));
    expect(bytesOf(second.control.positions)).toBe(bytesOf(first.control.positions));
  });

  it("actually plumbs the seed index through", () => {
    const a = recomputeForPlayback(JOB, 1, 0);
    const b = recomputeForPlayback(JOB, 1, 3);
    expect(a.config.seed).not.toBe(b.config.seed);
    expect(bytesOf(a.treated.positions)).not.toBe(bytesOf(b.treated.positions));
  });

  it("rebuilds the cell that was asked for", () => {
    expect(recomputeForPlayback(JOB, 0, 0).config.crowd.nPedestrians).toBe(8);
    expect(recomputeForPlayback(JOB, 1, 0).config.crowd.nPedestrians).toBe(12);
  });

  it("steps through the seeds inside a cell without falling off either end", () => {
    expect(stepSeed(0, -1, JOB.seedIndices)).toBe(0);
    expect(stepSeed(0, 1, JOB.seedIndices)).toBe(1);
    expect(stepSeed(3, 1, JOB.seedIndices)).toBe(3);
  });

  it("says which run of the cell is playing", () => {
    expect(describeSeed(JOB.seedIndices, 0)).toBe("seed 1 of 4");
    expect(describeSeed(JOB.seedIndices, 3)).toBe("seed 4 of 4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/playback.test.ts`
Expected: FAIL with `Failed to resolve import "../playback.js" from "web/app/console/__tests__/playback.test.ts". Does the file exist?`

- [ ] **Step 3: Write `web/app/console/playback.ts`**

```ts
// web/app/console/playback.ts
import { ContractError } from "../../engine/core/errors.js";
import { runPair, type RunResult } from "../../engine/sim/run.js";
import { configForCell, type SweepJob } from "../../engine/job/spec.js";

/**
 * Selecting a row selects a CELL. A cell has no seed, so it cannot be played — the transport's
 * "seed 1 of 8" control chooses which run inside it does.
 *
 * The run is not stored. It is rebuilt from (job, axisIndex, seedIndex) and re-simulated, which
 * determinism makes bitwise the run the worker measured. That is what lets the Worker return about
 * 90 KB of readings instead of 33 MB of paths.
 */

export interface PlaybackSelection {
  readonly kind: "playbackSelection";
  readonly groupId: string;
  readonly axisIndex: number;
  readonly seedIndex: number;
}

export function makePlaybackSelection(init: {
  readonly groupId: string;
  readonly axisIndex: number;
  readonly seedIndex: number;
}): PlaybackSelection {
  if (init.groupId.length === 0) {
    throw new ContractError("playback must name the kept result it is playing from");
  }
  if (!Number.isInteger(init.axisIndex) || init.axisIndex < 0) {
    throw new ContractError(`playback needs a cell, got axis index ${init.axisIndex}`);
  }
  if (!Number.isInteger(init.seedIndex) || init.seedIndex < 0) {
    throw new ContractError(`playback needs a run, got seed index ${init.seedIndex}`);
  }
  return Object.freeze({
    kind: "playbackSelection" as const,
    groupId: init.groupId,
    axisIndex: init.axisIndex,
    seedIndex: init.seedIndex,
  });
}

export function recomputeForPlayback(
  job: SweepJob,
  axisIndex: number,
  seedIndex: number,
): RunResult {
  const config = configForCell(job, axisIndex, seedIndex);
  return runPair(config);
}

export function stepSeed(current: number, delta: number, seedIndices: readonly number[]): number {
  const position = seedIndices.indexOf(current);
  let next = position < 0 ? 0 : position + delta;
  if (next < 0) {
    next = 0;
  }
  if (next > seedIndices.length - 1) {
    next = seedIndices.length - 1;
  }
  return seedIndices[next] ?? current;
}

export function describeSeed(seedIndices: readonly number[], seedIndex: number): string {
  const position = seedIndices.indexOf(seedIndex);
  const shown = position < 0 ? 1 : position + 1;
  return `seed ${shown} of ${seedIndices.length}`;
}
```

- [ ] **Step 4: Run the playback test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/playback.test.ts`

- [ ] **Step 5: Commit the playback module**

```bash
git add web/app/console/playback.ts web/app/console/__tests__/playback.test.ts
git commit -m "Rebuild a selected run for playback, and prove it is bitwise

A ledger row is a cell and a cell has no seed, so the transport picks which run
inside it plays. That run is re-simulated rather than stored — 38 ms against the
33 MB the Worker would otherwise have to send back — and the test compares two
rebuilds as bytes, because inexactness would mean the picture on screen is not
the run whose number is printed beside it."
```

- [ ] **Step 6: Write the failing plot test**

```ts
// web/ui/plot.test.ts
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";
import { drawSweep, type PlotView } from "./plot.js";

/**
 * The sweep curve's third series is the run-to-run band, and it is a REGION from zero rather than
 * a line with a ribbon around it.
 *
 * The `sd` ribbon this file's fill code already had cannot express that: it sweeps value+sd down
 * to value-sd, so a band passed as its own sd shades to twice the band, and passing half the band
 * puts the line in the wrong place. Either way the reader is given a false floor under real
 * numbers, which is the exact error this project exists to teach against.
 */

const WIDTH = 320;
const HEIGHT = 200;
/** The frame's baseline in `drawSweep`: `bottom: height - 44`. */
const BASELINE = HEIGHT - 44;

interface Recorded {
  readonly fills: (readonly (readonly [number, number])[])[];
  readonly arcs: number;
}

function record(view: PlotView): Recorded {
  const fills: (readonly [number, number])[][] = [];
  let points: [number, number][] = [];
  let arcs = 0;

  const context = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    clearRect: (): void => {},
    fillRect: (): void => {},
    save: (): void => {},
    restore: (): void => {},
    translate: (): void => {},
    rotate: (): void => {},
    setLineDash: (): void => {},
    fillText: (): void => {},
    beginPath: (): void => {
      points = [];
    },
    closePath: (): void => {},
    moveTo: (x: number, y: number): void => {
      points.push([x, y]);
    },
    lineTo: (x: number, y: number): void => {
      points.push([x, y]);
    },
    arc: (): void => {
      arcs++;
    },
    stroke: (): void => {},
    fill: (): void => {
      fills.push([...points]);
    },
  };

  drawSweep(context as unknown as CanvasRenderingContext2D, view, WIDTH, HEIGHT);
  return { fills, arcs };
}

beforeAll(() => {
  // plot.ts reads the page's own type stack off the document before it draws a label.
  const dom = new JSDOM("<!doctype html><body></body>");
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["document"] = dom.window.document;
  globals["getComputedStyle"] = dom.window.getComputedStyle.bind(dom.window);
});

describe("a floor region under the sweep curve", () => {
  it("fills from the series down to zero, not to value minus itself", () => {
    const view: PlotView = {
      x: [4, 18, 44],
      xLabel: "how many people are in the room",
      yLabel: "metres",
      series: [
        { key: "band", label: "ordinary difference between two runs", values: [0.2, 0.2, 0.2], fillToZero: true },
      ],
    };
    const recorded = record(view);
    expect(recorded.fills.length).toBe(1);
    const polygon = recorded.fills[0] as readonly (readonly [number, number])[];
    expect(polygon.length).toBe(6);
    const baseline = polygon.slice(3).map((point) => point[1]);
    expect(baseline).toEqual([BASELINE, BASELINE, BASELINE]);
  });

  it("draws no point markers on a region", () => {
    const view: PlotView = {
      x: [4, 18],
      xLabel: "how many people are in the room",
      yLabel: "metres",
      series: [{ key: "band", label: "band", values: [0.2, 0.3], fillToZero: true }],
    };
    expect(record(view).arcs).toBe(0);
  });

  it("still draws markers on an ordinary series", () => {
    const view: PlotView = {
      x: [4, 18],
      xLabel: "how many people are in the room",
      yLabel: "metres",
      series: [{ key: "true", label: "true effect", values: [0.2, 0.35], accent: true }],
    };
    const recorded = record(view);
    expect(recorded.arcs).toBe(2);
    expect(recorded.fills.length).toBe(0);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run web/ui/plot.test.ts`
Expected: FAIL with `Object literal may only specify known properties, and 'fillToZero' does not exist in type 'PlotSeries'` at typecheck, and at runtime `expected 0 to be 1` on `recorded.fills.length`.

- [ ] **Step 8: Add `fillToZero` to `web/ui/plot.ts`**

Replace `web/ui/plot.ts:11-18`:

```ts
export interface PlotSeries {
  readonly key: string;
  readonly label: string;
  readonly values: readonly number[];
  /** Optional per-point standard deviation, drawn as a band. */
  readonly sd?: readonly number[];
  /**
   * Shade the area between this series and zero, and draw no point markers on it.
   *
   * For a floor — the run-to-run band under a sweep — which is a region rather than a set of
   * measurements. The `sd` ribbon cannot stand in for it: it sweeps value+sd down to value-sd, so
   * a band passed as its own sd shades to twice the band, and half the band puts the line in the
   * wrong place. Both draw a false floor under real numbers.
   */
  readonly fillToZero?: boolean;
  readonly accent?: boolean;
}
```

Replace the fill block at `web/ui/plot.ts:137-159` with:

```ts
    if (s.fillToZero === true) {
      context.fillStyle = isAccent ? PALETTE.perturbation : PALETTE.rule;
      context.globalAlpha = 0.14;
      context.beginPath();
      for (let i = 0; i < view.x.length; i++) {
        const point = sx(view.x[i] as number);
        const y = sy(s.values[i] as number);
        if (i === 0) {
          context.moveTo(point, y);
        } else {
          context.lineTo(point, y);
        }
      }
      for (let i = view.x.length - 1; i >= 0; i--) {
        context.lineTo(sx(view.x[i] as number), sy(0));
      }
      context.closePath();
      context.fill();
      context.globalAlpha = 1;
    } else if (s.sd !== undefined) {
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
```

And guard the marker loop at `web/ui/plot.ts:183-192` by wrapping it in:

```ts
    if (s.fillToZero !== true) {
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
```

- [ ] **Step 9: Run the plot test to verify it passes**

Run: `npx vitest run web/ui/plot.test.ts`

- [ ] **Step 10: Write the failing curve test**

```ts
// web/app/console/__tests__/curve.test.ts
import { describe, expect, it } from "vitest";
import { makeSweepJob } from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS } from "../../../engine/job/columns.js";
import type { RunRow } from "../../../engine/job/runner.js";
import { makeRunGroup } from "../group.js";
import { sweepPlotView } from "../curve.js";

const MEASUREMENT = {
  kind: "measurementParams" as const,
  forecastHorizonSteps: 60,
  forecastEndStep: 200,
  nearMissThresholdM: 0.5,
  recoveryToleranceFraction: 0.1,
  recoveryDwellSteps: 20,
};

function sweepJob(axis: "crowdSize" | null) {
  return makeSweepJob({
    base: { crowd: { nPedestrians: 18 } },
    axis,
    axisValues: axis === null ? [0] : [4, 18, 44],
    seedIndices: [0],
    measurement: MEASUREMENT,
    columns: [...HEADLINE_COLUMNS],
    bandReplicates: { n: 8, scope: "perCell" },
    floor: null,
    zeroReferenceRun: true,
    frechet: false,
  });
}

function row(axisIndex: number, axisValue: number, trueEffect: number, forecast: number): RunRow {
  return {
    kind: "runRow",
    key: { axisIndex, axisValue, seedIndex: 0 },
    readings: {
      trueEffectM: { kind: "reading", value: trueEffect, availability: { kind: "measured" } },
      forecastM: { kind: "reading", value: forecast, availability: { kind: "measured" } },
    },
  };
}

const JOB = sweepJob("crowdSize");
const GROUP = makeRunGroup({
  id: "group-1",
  label: "how many people are in the room — sweep",
  job: JOB,
  rows: [row(0, 4, 0.153, 0.201), row(1, 18, 0.352, 0.286), row(2, 44, 0.383, 0.331)],
  bands: [
    { kind: "bandReading", axisIndex: 0, meanM: 0.172, peakM: 0.33, nReplicates: 8 },
    { kind: "bandReading", axisIndex: 1, meanM: 0.311, peakM: 0.60, nReplicates: 8 },
    { kind: "bandReading", axisIndex: 2, meanM: 0.462, peakM: 0.88, nReplicates: 8 },
  ],
  completedAtMs: 1000,
});

describe("the sweep curve", () => {
  it("has nothing to draw for a single run", () => {
    const single = makeRunGroup({
      id: "group-2",
      label: "single run",
      job: sweepJob(null),
      rows: [row(0, 0, 0.352, 0.286)],
      bands: [],
      completedAtMs: 1,
    });
    expect(sweepPlotView(single)).toBeNull();
  });

  it("plots the axis on x, in plain English, with metres on y", () => {
    const view = sweepPlotView(GROUP);
    expect(view?.x).toEqual([4, 18, 44]);
    expect(view?.xLabel).toBe("how many people are in the room");
    expect(view?.yLabel).toBe("metres");
  });

  it("draws the true effect in the accent and the band as a region from zero", () => {
    const view = sweepPlotView(GROUP);
    const series = view?.series ?? [];
    expect(series.map((s) => s.key)).toEqual(["trueEffectM", "forecastM", "runToRunBandM"]);
    expect(series[0]?.accent).toBe(true);
    expect(series[2]?.fillToZero).toBe(true);
    // The band moves with crowd size — 0.172 m at 4 people to 0.462 m at 44 — so one line drawn
    // across a people-sweep would be a false floor.
    expect(series[2]?.values).toEqual([0.172, 0.311, 0.462]);
  });
});
```

- [ ] **Step 11: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/curve.test.ts`
Expected: FAIL with `Failed to resolve import "../curve.js" from "web/app/console/__tests__/curve.test.ts". Does the file exist?`

- [ ] **Step 12: Write `web/app/console/curve.ts`**

```ts
// web/app/console/curve.ts
import { AXES } from "../../engine/job/axes.js";
import { accumulate } from "../../engine/job/runner.js";
import type { ColumnKey } from "../../engine/job/columns.js";
import type { PlotSeries, PlotView } from "../../ui/plot.js";
import type { RunGroup } from "./group.js";

/**
 * The sweep curve: the true effect, what a forecaster reports, and the run-to-run band underneath
 * them as a shaded region from zero.
 *
 * The band is read per axis value, never once. Crowd size genuinely moves it — 0.172 m at 4 people
 * to 0.462 m at 44 — so a single line drawn across a people-sweep is a false floor, and the same
 * error was already caught once on the tiles.
 */

const TRUE_EFFECT: ColumnKey = "trueEffectM";
const FORECAST: ColumnKey = "forecastM";
const BAND: ColumnKey = "runToRunBandM";

export function sweepPlotView(group: RunGroup): PlotView | null {
  if (group.job.axis === null) {
    return null;
  }
  const axis = AXES[group.job.axis];
  const byCell = accumulate(group.rows, [TRUE_EFFECT, FORECAST, BAND]);

  const trueValues: number[] = [];
  const forecastValues: number[] = [];
  const bandValues: number[] = [];

  for (let axisIndex = 0; axisIndex < group.job.axisValues.length; axisIndex++) {
    const cells = byCell.get(axisIndex);
    const trueEffect = cells === undefined ? undefined : cells[TRUE_EFFECT];
    const forecast = cells === undefined ? undefined : cells[FORECAST];
    trueValues.push(trueEffect === undefined ? Number.NaN : trueEffect.value);
    forecastValues.push(forecast === undefined ? Number.NaN : forecast.value);

    let band = Number.NaN;
    for (const reading of group.bands) {
      if (reading.axisIndex === axisIndex) {
        band = reading.meanM;
      }
    }
    if (!Number.isFinite(band)) {
      const fallback = cells === undefined ? undefined : cells[BAND];
      band = fallback === undefined ? Number.NaN : fallback.value;
    }
    bandValues.push(band);
  }

  const series: PlotSeries[] = [
    { key: TRUE_EFFECT, label: "how far the crowd was moved", values: trueValues, accent: true },
    { key: FORECAST, label: "what a forecaster would report", values: forecastValues },
    {
      key: BAND,
      label: "ordinary difference between two runs of this room",
      values: bandValues,
      fillToZero: true,
    },
  ];

  return {
    x: [...group.job.axisValues],
    xLabel: axis.label,
    yLabel: "metres",
    series,
  };
}
```

- [ ] **Step 13: Run the curve test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/curve.test.ts`

- [ ] **Step 14: Add the transport seed control and the curve canvas to `web/console.html`**

Replace the `<div class="transport">` block written in Task 26 with:

```html
    <div class="transport">
      <button id="playpause" type="button">Pause</button>
      <label class="scrub">
        <span class="visually-hidden">Timeline</span>
        <input id="scrub" type="range" min="0" max="800" step="1" value="0">
      </label>
      <span class="readout">t <output id="clock">0.0</output> s</span>
      <span class="seed-picker">
        <button id="seed-prev" type="button" aria-label="previous run in this cell"><</button>
        <output id="seed-readout">seed 1 of 1</output>
        <button id="seed-next" type="button" aria-label="next run in this cell">></button>
      </span>
    </div>
    <p class="playing-note" id="playing-note">Live preview of the settings in the panel.</p>
```

And immediately before `<section class="kept">`:

```html
  <section class="curve" id="curve-block" hidden>
    <p class="panel-title">Sweep curve</p>
    <canvas id="curve" aria-label="How each measurement moves along the swept setting"></canvas>
    <ul class="legend">
      <li><span class="key key-gap"></span>how far the crowd was moved</li>
      <li><span class="key key-control"></span>what a forecaster would report</li>
      <li><span class="key key-grid"></span>ordinary difference between two runs of this room</li>
    </ul>
  </section>
```

- [ ] **Step 15: Wire selection, the seed stepper and the curve into `web/console.ts`**

Add imports:

```ts
import { describeSeed, recomputeForPlayback, stepSeed } from "./app/console/playback.js";
import { sweepPlotView } from "./app/console/curve.js";
import { drawSweep } from "./ui/plot.js";
```

Add beside the other module-level state:

```ts
let playbackSeedIndex = 0;
let playbackRun: RunResult | null = null;
```

Add inside `bootConsole`, after the ledger lookups:

```ts
  const seedPrev = el<HTMLButtonElement>(doc, "seed-prev");
  const seedNext = el<HTMLButtonElement>(doc, "seed-next");
  const seedReadout = el<HTMLOutputElement>(doc, "seed-readout");
  const playingNote = el<HTMLParagraphElement>(doc, "playing-note");
  const curveBlock = el<HTMLElement>(doc, "curve-block");
  const curveCanvas = el<HTMLCanvasElement>(doc, "curve");
  const curveContext = curveCanvas.getContext("2d");

  const selectedGroup = (): RunGroup | null => {
    if (selectedCell === null) {
      return null;
    }
    for (const group of keptGroups) {
      if (group.id === selectedCell.groupId) {
        return group;
      }
    }
    return null;
  };

  const drawCurve = (): void => {
    const group = selectedGroup();
    if (group === null || curveContext === null) {
      curveBlock.hidden = true;
      return;
    }
    const view = sweepPlotView(group);
    if (view === null) {
      curveBlock.hidden = true;
      return;
    }
    curveBlock.hidden = false;
    const box = fitCanvas(curveCanvas, window.devicePixelRatio);
    drawSweep(curveContext, view, box.width, box.height);
  };

  const playSelected = (): void => {
    const group = selectedGroup();
    if (group === null || selectedCell === null) {
      playbackRun = null;
      playingNote.textContent = "Live preview of the settings in the panel.";
      seedReadout.value = "seed 1 of 1";
      return;
    }
    // Rebuilt, not stored. Determinism is what makes this the same run the worker measured.
    playbackRun = recomputeForPlayback(group.job, selectedCell.axisIndex, playbackSeedIndex);
    seedReadout.value = describeSeed(group.job.seedIndices, playbackSeedIndex);
    playingNote.textContent = `Playing ${labelForCell(group.job, selectedCell.axisIndex)}.`;
    sample = 0;
    base = {
      wallStartMs: performance.now(),
      sampleAtStart: 0,
      dtMs: playbackRun.config.dt * 1000,
      rate: 1,
    };
    scrub.max = String(playbackRun.config.nTicks);
  };

  seedPrev.addEventListener("click", () => {
    const group = selectedGroup();
    if (group === null) {
      return;
    }
    playbackSeedIndex = stepSeed(playbackSeedIndex, -1, group.job.seedIndices);
    playSelected();
  });

  seedNext.addEventListener("click", () => {
    const group = selectedGroup();
    if (group === null) {
      return;
    }
    playbackSeedIndex = stepSeed(playbackSeedIndex, 1, group.job.seedIndices);
    playSelected();
  });
```

Add `import { labelForCell } from "./app/console/group.js";` alongside the existing group import, then in the row-click handler in Task 28's block, after `selectedCell = ref;` insert:

```ts
    playbackSeedIndex = 0;
    playSelected();
    drawCurve();
```

and in the Clear handler, after `selectedCell = null;` insert `playSelected();` and `drawCurve();`.

Finally, in `render()`, replace the first two lines with a source switch so playback wins over the preview:

```ts
    const current = playbackRun === null ? (preview === null ? null : preview.run) : playbackRun;
    const config = playbackRun === null ? preview?.config ?? null : playbackRun.config;
    if (current === null || config === null) {
      return;
    }
```

and read `config` in place of `current.config` throughout the `ArenaView` and the clock line.

- [ ] **Step 16: Run the whole console suite**

Run: `npx vitest run web/app web/ui && npx tsc --noEmit`

- [ ] **Step 17: Commit the curve and the transport**

```bash
git add web/ui/plot.ts web/ui/plot.test.ts web/app/console/curve.ts \
        web/app/console/__tests__/curve.test.ts web/console.ts web/console.html
git commit -m "Draw the sweep curve, and let the transport choose which run plays

plot.ts gains one field, fillToZero, because its sd ribbon cannot express a
floor: passing the band as its own sd shades to twice the band, and half the
band puts the line in the wrong place. Both draw a false floor under real
numbers. The band is read per axis value — 0.172 m at 4 people to 0.462 m at
44 — never once across the sweep.

Selecting a ledger row selects a cell, the seed stepper picks the run inside it,
and that run is re-simulated on the spot rather than shipped back from the
worker."
```

- [ ] **Step 18: Write the failing focus-ring test**

```ts
// web/app/console/__tests__/focus.test.ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The stylesheet's only :focus-visible rule today is scoped to `.quantity`, `.quantity-trigger`
 * and `.predict-option` — three classes that exist on the notes pages and nowhere else, and that
 * commit 3 deletes along with them. The console is a page you drive from the keyboard: a Run
 * button, a seed stepper, a column picker, a sortable table. It needs a global rule, and it needs
 * it to land in this commit rather than after the scoped one has been removed.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

describe("keyboard focus is visible everywhere", () => {
  const css = readFileSync(join(REPO, "web", "style.css"), "utf8");

  it("has an unscoped :focus-visible rule", () => {
    expect(css).toMatch(/^:focus-visible\s*\{/m);
  });

  it("gives that rule a real outline, in a token", () => {
    const rule = /^:focus-visible\s*\{([^}]*)\}/m.exec(css);
    expect(rule?.[1]).toContain("outline: 2px solid var(--mirn-ink)");
    expect(rule?.[1]).toContain("outline-offset");
  });

  it("never removes an outline anywhere in the stylesheet", () => {
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });
});
```

- [ ] **Step 19: Run test to verify it fails**

Run: `npx vitest run web/app/console/__tests__/focus.test.ts`
Expected: FAIL with `expected '/* Every colour token is injected from…' to match /^:focus-visible\s*\{/m`

- [ ] **Step 20: Add the global rule to `web/style.css`**

Insert immediately above the existing scoped rule at `web/style.css:512`:

```css
/* Every interactive element on the console — the Run button, the seed stepper, the column picker,
   the sortable table headings — is reachable from the keyboard, so the ring is global rather than
   named class by named class. The scoped rule below is the notes pages' and dies with them. */
:focus-visible {
  outline: 2px solid var(--mirn-ink);
  outline-offset: 2px;
}
```

- [ ] **Step 21: Run the focus test to verify it passes**

Run: `npx vitest run web/app/console/__tests__/focus.test.ts`

- [ ] **Step 22: Run the full gate**

Run: `npm run typecheck && npm run test && .venv/bin/python -m ruff check src tests`

- [ ] **Step 23: Commit the focus ring**

```bash
git add web/style.css web/app/console/__tests__/focus.test.ts
git commit -m "Give keyboard focus a ring that is not scoped to three dying classes

The stylesheet's only :focus-visible rule is scoped to .quantity,
.quantity-trigger and .predict-option — notes-page classes that commit 3
deletes, taking the focus ring with them. The console is driven from the
keyboard, so the rule lands here, global, with a test that also refuses any
outline: none anywhere in the file."
```

---

## Commit 3 — Delete

The teaching layer goes, the console becomes the front door, and the working agreement is rewritten. The Python side is not touched.

---

### Task 30: Verify commit 2 paid its debts before anything is deleted

**Files:**
- Test: `web/engine/job/__tests__/sweep.golden.test.ts` (created in Task 5; re-run here, not rewritten)

**Interfaces:**
- Consumes: `runSweep(opts: { values, seedIndices, config, measure })` and `aggregateSweep(points, axisName)` from `web/engine/job/sweep.ts` (commit 1); `MetricPoint = Readonly<Record<string, number>>`; `makeRunConfig(overrides: RunConfigOverrides): RunConfig` from `web/engine/contracts/config.ts:149`; `RunResult` from `web/engine/sim/run.ts:99`; `deviation(pair: PairedRun): Deviation` from `web/engine/measure/metrics.ts:33`, whose result carries `meanM` and `maxM`.
- Produces: `web/engine/job/__tests__/sweep.golden.json` — the `e1_push_strength` block lifted out of `web/data/experiment-facts.json`, shaped `{ axis: string; nSeeds: number; rows: Record<string, number>[] }`. This is the only surviving evidence that the extraction preserved behaviour once Task 32 deletes both the script and the facts file.

Nothing in this task touches `src/mirn/`, `tests/`, `pyproject.toml` or `tests/golden/parity/`. The Python oracle is not part of this pivot at all.

- [ ] **Step 1: Verify the guardrail-12 identifier regex was re-homed onto the catalogues**

Guardrail 12's only mechanical enforcement anywhere in this repo is the identifier regex at `web/app/__tests__/render.test.ts:187`:

```
const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
```

Task 32 deletes that file. Commit 2 was required to re-home the regex onto `COLUMNS` and `AXES` first.

Run: `grep -rn '\[a-z\]+\[A-Z\]' web/engine/job/__tests__/`

Expected: at least one hit in `web/engine/job/__tests__/columns.test.ts` and at least one in `web/engine/job/__tests__/axes.slow.test.ts`. If either directory is silent, STOP — commit 2 is incomplete and deleting `render.test.ts` would remove the rule's last enforcement from the repository.

- [ ] **Step 2: Prove the re-homed check actually bites**

A grep only proves the characters are present. Mutate a reader-facing label into a code identifier and confirm the catalogue test goes red.

Temporarily edit `web/engine/job/columns.ts` and change the `label` of the first entry in `COLUMNS` to the string `"trueEffectM"`.

Run: `npx vitest run web/engine/job/__tests__/columns.test.ts`

Expected: FAIL, naming `trueEffectM` as an offender. Then revert the edit (`git checkout -- web/engine/job/columns.ts`) and re-run the same command; expected: PASS.

- [ ] **Step 3: Verify the console page is tracked by git**

Commit 2 hand-wrote `web/console.html`. `scripts/build-notes.ts:485` writes `web/index.html` unconditionally, which is why the console was not put there yet. Task 33 renames it, and `git mv` requires it to be under version control.

Run: `git ls-files --error-unmatch web/console.html`

Expected: prints `web/console.html` and exits 0. A `fatal: ... did not match any file(s) known to git` means STOP.

- [ ] **Step 4: Re-run the golden fixture that Task 5 committed**

The sweep module is already pinned. Task 5 created `web/engine/job/__tests__/sweep.golden.json` and
`sweep.golden.test.ts` precisely so that the numbers survive the deletion of the script that
produced them. Do not regenerate either file here — regenerating from `web/data/experiment-facts.json`
at this point would re-derive the fixture from a file this commit is about to delete, which is the
opposite of pinning.

Run: `npx vitest run web/engine/job/__tests__/sweep.golden.test.ts`
Expected: `Test Files 1 passed`, `Tests 2 passed`.

If it is red, STOP. The extraction has drifted since commit 1 and nothing in this commit may
proceed until it is green again.

- [ ] **Step 5: Commit the verification**

```bash
git commit --allow-empty -m "Verify commit 2's debts before deleting the teaching layer

The identifier regex is re-homed onto the catalogues, the re-homed check bites,
web/console.html is tracked, and the sweep golden fixture from commit 1 is green.
Nothing is deleted until all four hold."
```

### Task 31: Commit the palette stylesheet before its generator is deleted

**Files:**
- Modify: `web/theme.gen.css` (currently untracked and git-ignored; becomes a tracked file)
- Modify: `.gitignore:67` (remove the `web/theme.gen.css` line)
- Test: `web/ui/theme.gen.test.ts`

**Interfaces:**
- Consumes: `cssTokens(): string` from `web/ui/theme.ts:68`. It returns `:root {\n` + one `  --mirn-<kebab>: <value>;` line per `PALETTE` entry + the two font lines + `\n}` — no trailing newline, no header comment.
- Produces: a tracked `web/theme.gen.css` and a test that fails if it ever drifts from `web/ui/theme.ts`.

Why this task exists at all: `scripts/build-notes.ts:438` is the only writer of `web/theme.gen.css`, `.gitignore:67` ignores it, and `web/console.html` links it. Task 32 deletes that script. Without this task the next clean checkout has no `theme.gen.css`, and `vite build` fails on a missing stylesheet — the exact failure mode `.github/workflows/ci.yml` already records for the notes build. The file becomes a committed artifact with a test standing in for the generator.

- [ ] **Step 1: Write the failing test**

Create `web/ui/theme.gen.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cssTokens } from "./theme.js";

/**
 * The palette stylesheet is committed rather than built.
 *
 * It used to be written by scripts/build-notes.ts on every build. That script is gone, and the
 * console page still links the stylesheet, so the file is now checked in — which means nothing
 * mechanical keeps it in step with web/ui/theme.ts. This test is that mechanism. Change a colour
 * in theme.ts and this goes red with the exact text the file should contain.
 *
 * It is emitted as a real stylesheet rather than injected by script for the reason the old build
 * recorded: with JavaScript disabled every custom property would be undefined, so every
 * `font-family: var(--mirn-font-sans)` declaration would become invalid and the page would fall
 * back to Times.
 */

const HEADER =
  "/* Generated from web/ui/theme.ts. Committed, not built: web/ui/theme.gen.test.ts fails if it drifts. */";

const STYLESHEET_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "theme.gen.css");

describe("web/theme.gen.css", () => {
  it("is exactly the header plus what web/ui/theme.ts produces", () => {
    const onDisk = readFileSync(STYLESHEET_PATH, "utf8");
    const expected = `${HEADER}\n${cssTokens()}\n`;
    expect(onDisk).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/ui/theme.gen.test.ts -t "is exactly the header plus what web/ui/theme.ts produces"`

Expected: FAIL, with a string diff whose first differing line is the header: the file on disk opens `/* Generated from web/ui/theme.ts. Do not edit. */`.

- [ ] **Step 3: Stop ignoring the stylesheet**

Edit `.gitignore`. The final block reads:

```
# Generated by scripts/build-notes.ts on every build. Source of truth is web/notes/*.md.
web/generated/
web/index.html
web/theme.gen.css
```

Delete only the `web/theme.gen.css` line, leaving the other three lines untouched — Task 33 removes the rest.

- [ ] **Step 4: Write the stylesheet**

Replace the whole of `web/theme.gen.css` with exactly this, trailing newline included:

```css
/* Generated from web/ui/theme.ts. Committed, not built: web/ui/theme.gen.test.ts fails if it drifts. */
:root {
  --mirn-paper: #fdfcfa;
  --mirn-surface: #f4f2ef;
  --mirn-ink: #111111;
  --mirn-ink-muted: #585858;
  --mirn-ink-faint: #767676;
  --mirn-rule: #c9c9c9;
  --mirn-grid: #e6e6e6;
  --mirn-perturbation: #c2410c;
  --mirn-font-sans: "Inter", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --mirn-font-mono: "SF Mono", ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run web/ui/theme.gen.test.ts`

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add .gitignore web/theme.gen.css web/ui/theme.gen.test.ts
git commit -m "Commit the palette stylesheet, with a test standing in for its generator

scripts/build-notes.ts was the only writer of web/theme.gen.css and is deleted next.
The console page links it, so a clean checkout would have failed vite build on a
missing stylesheet. It is now tracked, and web/ui/theme.gen.test.ts goes red the
moment it disagrees with cssTokens() in web/ui/theme.ts."
```

---

### Task 32: Delete the teaching layer, its build pipeline, and everything that only served it

**Files:**
- Delete: `web/notes/` (17 markdown files: 10 at the top level, 7 under `web/notes/experiments/`)
- Delete: `web/notes.ts`, `web/vocab.ts`, `web/hero.ts`, `web/main.ts`, `web/instrument.html`, `web/katex.css`
- Delete: `web/build/` (`lints.ts`, `lints.test.ts`, `quantities.ts`, `quantities.test.ts`, `render.ts`, `render.test.ts`, `vocabulary.ts`, `vocabulary.test.ts`, `widgets.ts`, `widgets.test.ts`)
- Delete: `web/data/experiment-facts.json` (leaving `web/data/` empty, so git drops the directory)
- Delete: `web/app/__tests__/landing.test.ts`, `web/app/__tests__/render.test.ts`
- Delete: `scripts/build-notes.ts`, `scripts/measure-experiments.ts`
- Delete: `docs/teaching/authoring.md`
- Delete (untracked, ignored): `web/generated/`, `web/index.html`
- Modify: `package.json:7-16` (scripts), `package.json:17-32` (devDependencies)
- Modify: `vite.config.ts:1-40` (whole file)
- Modify: `vitest.workspace.ts:22` (the `ui` project's `include`)
- Modify: `scripts/check:24-27` (the notes step)
- Modify: `.github/workflows/ci.yml:19-30` (the notes step)

**Interfaces:**
- Consumes: nothing. Every deletion below was grep-verified to have no importer outside the deleted set.
- Produces: an `npm run check` that is `typecheck → vitest → vite build`, with no notes step and no `npm run measure`.

The import closure, verified by `grep -rn "^import" web scripts --include='*.ts'` and by `grep -rn` for each filename:

| Doomed module | Every importer |
|---|---|
| `web/build/widgets.ts` | `web/notes.ts:9` only |
| `web/build/vocabulary.ts` | `scripts/build-notes.ts:32`, `web/build/vocabulary.test.ts:2` |
| `web/build/render.ts` | `scripts/build-notes.ts:33`, `web/app/__tests__/render.test.ts:6`, `web/build/render.test.ts` |
| `web/build/quantities.ts` | `scripts/build-notes.ts:34`, `web/build/quantities.test.ts:2` |
| `web/vocab.ts` | `scripts/build-notes.ts:24`, `web/build/render.ts:31`, `web/build/render.test.ts:6`, `web/build/vocabulary.ts:20`, `web/build/vocabulary.test.ts:3` |
| `web/notes.ts` | `web/app/__tests__/render.test.ts:99` only |
| `web/hero.ts` | `web/index.html:58` (generated), `web/app/__tests__/landing.test.ts:134` |
| `web/main.ts` | `web/instrument.html:116` only |
| `web/katex.css` | `scripts/build-notes.ts:265` and the generated pages only |
| `web/data/experiment-facts.json` | `web/notes.ts:10`, `scripts/build-notes.ts:42`, `web/build/quantities.test.ts:2` |

Every one of those importers is itself deleted here, so the set closes.

- [ ] **Step 1: Confirm `web/main.ts` has exactly one consumer before deleting it**

`web/main.ts` is the instrument page's script and is not named in the design's delete list, so confirm it is orphaned rather than assume it.

Run: `grep -rn "main\.ts\|main\.js" web scripts vite.config.ts --include='*.ts' --include='*.html'`

Expected: exactly one line, `web/instrument.html:116:<script type="module" src="./main.ts"></script>`. If `web/console.html` also appears, commit 2 reused the filename — STOP and resolve that before deleting anything.

- [ ] **Step 2: Delete the tracked files**

Run:

```bash
git rm -r --quiet web/notes web/build
git rm --quiet web/notes.ts web/vocab.ts web/hero.ts web/main.ts web/instrument.html web/katex.css
git rm --quiet web/data/experiment-facts.json
git rm --quiet web/app/__tests__/landing.test.ts web/app/__tests__/render.test.ts
git rm --quiet scripts/build-notes.ts scripts/measure-experiments.ts
git rm --quiet docs/teaching/authoring.md
```

Then remove the two build outputs, which are ignored and untracked so `git rm` cannot see them:

```bash
rm -rf web/generated web/index.html
```

`web/style.css` is deliberately left alone. It carries notes-only selectors that are now dead, but `web/console.html` links it and pruning it here would risk the page commit 2 just built. That is a separate, later job.

- [ ] **Step 3: Rewrite `package.json`'s scripts block**

Replace lines 7–16 of `package.json` with:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "check": "npm run typecheck && npm run test && npm run build"
  },
```

`notes` and `measure` are gone; `dev` and `build` lose their `npm run notes &&` prefix; `check` loses the notes step.

- [ ] **Step 4: Uninstall the five dependencies and their three type packages**

Run:

```bash
npm uninstall markdown-it gray-matter js-yaml katex @types/markdown-it @types/js-yaml
```

Then confirm what is left.

Run: `node --input-type=commonjs -e "console.log(Object.keys(require('./package.json').devDependencies).join(' '))"`

Expected: `@types/node fast-check typescript vite vitest` — nothing else. `fast-check` stays: it is used by `web/engine/__tests__/setup.ts`, `web/engine/measure/divergence/divergence.test.ts`, `web/engine/sim/lockstep.test.ts` and `web/engine/rng/rng.test.ts`.

- [ ] **Step 5: Rewrite `vite.config.ts`**

Replace the whole file with:

```ts
import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * One page, one entry point.
 *
 * There used to be a generatedPages() helper here that swept web/generated/*.html into the input
 * map, because every notes page was compiled to real HTML before Vite ran. There are no notes and
 * no pre-build step: the console is hand-written HTML that Vite reads directly.
 */
export default defineConfig({
  root: "web",
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        console: resolve(__dirname, "web/console.html"),
      },
    },
  },
});
```

`generatedPages()` and its `readdirSync`/`existsSync` import are gone, as are the `index` and `instrument` entries. The key stays `console` for now; Task 33 renames it.

- [ ] **Step 6: Drop `web/build` from the vitest workspace**

Edit `vitest.workspace.ts:22`. Change:

```ts
      include: ["web/ui/**/*.test.ts", "web/app/**/*.test.ts", "web/build/**/*.test.ts"],
```

to:

```ts
      include: ["web/ui/**/*.test.ts", "web/app/**/*.test.ts"],
```

The `engine` project is untouched: it already globs `web/engine/**/*.test.ts`, which picks up `web/engine/job/**` without an edit.

- [ ] **Step 7: Drop the notes step from `scripts/check` and from CI**

In `scripts/check`, delete these four lines (currently 24–27):

```
# Notes before vitest: the render suite boots the real widget code against the compiled pages, so
# web/generated has to exist. The other order works on any machine that has built once before,
# which is why it survived here and failed on CI's first clean checkout.
echo "==> notes (lints, vocabulary ladder, quantity references)"
npm run notes
```

In `.github/workflows/ci.yml`, delete the whole `- name: Build the notes` step (its `name`, its comment block and its `run: npm run notes`), leaving the `web` job as `npm ci`, `npm run typecheck`, `npx vitest run`, `npx vite build`.

- [ ] **Step 8: Confirm `resolveJsonModule` was never set, and leave `tsconfig.json` alone**

The only JSON imports in TypeScript were `web/notes.ts:10`, `web/build/quantities.test.ts:2` and `scripts/build-notes.ts:42`, all now deleted — plus `web/engine/job/__tests__/sweep.golden.test.ts`, which reads its fixture with `readFileSync` and `JSON.parse` rather than importing it, so no compiler flag is involved either way.

Run: `grep -n resolveJsonModule tsconfig.json`

Expected: no output, exit 1. The flag was never in the file (verified: `npx tsc --noEmit` passes today without it). There is nothing to remove, and `tsconfig.json` is not edited in this commit.

- [ ] **Step 9: Confirm nothing still references a deleted file**

Run:

```bash
grep -rn "instrument\|notes\.js\|notes\.ts\|vocab\|experiment-facts\|katex\|hero\.\|generated/" \
  web scripts vite.config.ts vitest.workspace.ts package.json .github/workflows/ci.yml \
  --include='*.ts' --include='*.html' --include='*.css' --include='*.json' --include='*.yml' 2>/dev/null
```

Expected: no output. Any hit is a dangling reference that would break `vite build` or `tsc`.

- [ ] **Step 10: Run the full check**

Run: `npm run check`

Expected: `tsc --noEmit` clean; `vitest run` green across both projects with `web/build/*` and the two `web/app/__tests__` suites absent from the run; `vite build` writing `dist/console.html` plus its assets.

- [ ] **Step 11: Confirm the Python side was not touched**

The oracle, its tests and the parity fixtures are outside this pivot entirely. Nobody deletes them by association.

Run: `git status --porcelain src tests pyproject.toml`

Expected: no output.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "Delete the teaching notebook and everything that only served it

Gone: web/notes/ (17 md), notes.ts, vocab.ts, build/ (5 modules + 5 test files),
hero.ts, main.ts, instrument.html, katex.css, data/experiment-facts.json,
scripts/build-notes.ts, scripts/measure-experiments.ts, docs/teaching/authoring.md,
the landing and render suites, and the generated/ output. About 6,100 lines.

With them go markdown-it, gray-matter, js-yaml, katex and jsdom. Nothing left in the
tree imports any of the five; the console's disclosure test reads the HTML file on
disk with indexOf rather than booting a DOM, which is why jsdom can go.

npm run notes and npm run measure are deleted; dev, build and check lose their notes
prefix. vite.config.ts loses generatedPages() and is down to one entry. The vitest ui
project stops globbing web/build.

src/mirn, tests/, pyproject.toml and tests/golden/parity are untouched: the Python
oracle is not part of this pivot."
```

---

### Task 33: Make the console the site's front door

**Files:**
- Rename: `web/console.html` → `web/index.html`
- Modify: `.gitignore` (delete the final three-line block: the `scripts/build-notes.ts` comment, `web/generated/`, `web/index.html`)
- Modify: `vite.config.ts` (the single `rollupOptions.input` entry)
- Modify: `web/app/console/__tests__/disclosure.test.ts` (the path it reads)

**Interfaces:**
- Consumes: `web/console.html` from commit 2, and `web/app/console/__tests__/disclosure.test.ts`, which asserts by `indexOf` against the HTML file on disk that the invented-crowd line precedes every number in document order.
- Produces: `web/index.html` as a tracked, hand-written file, and `dist/index.html` as the build output.

Order matters here and is the reason this is its own task. `web/index.html` is currently git-ignored (`.gitignore`, last block) because `scripts/build-notes.ts:485` used to write it. The ignore rule has to go before `git mv`, or the moved file lands ignored.

- [ ] **Step 1: Confirm the old generated index is gone from the working tree**

Run: `ls web/index.html`

Expected: `ls: web/index.html: No such file or directory`. Task 32 removed it. If it is present, someone re-ran a build; `rm -f web/index.html` before continuing, because `git mv` will not overwrite an existing file.

- [ ] **Step 2: Stop ignoring `web/index.html` and `web/generated/`**

Edit `.gitignore` and delete the final block in its entirety:

```
# Generated by scripts/build-notes.ts on every build. Source of truth is web/notes/*.md.
web/generated/
web/index.html
```

(The `web/theme.gen.css` line was already removed in Task 31, so these three lines are all that remain of that block.)

Run: `git check-ignore -v web/index.html`

Expected: no output, exit 1 — the path is no longer ignored.

- [ ] **Step 3: Rename the console page**

Run: `git mv web/console.html web/index.html`

Then confirm: `git ls-files web/index.html web/console.html`

Expected: exactly one line, `web/index.html`.

- [ ] **Step 4: Point Vite at the new filename**

Edit `vite.config.ts`. Change:

```ts
        console: resolve(__dirname, "web/console.html"),
```

to:

```ts
        index: resolve(__dirname, "web/index.html"),
```

- [ ] **Step 5: Point the disclosure-ordering test at `web/index.html`**

Run: `grep -rn "console\.html" web scripts vite.config.ts --include='*.ts' --include='*.html'`

Expected: one or more hits inside `web/app/console/__tests__/disclosure.test.ts` (the path constant it reads with `readFileSync`), and nothing else. Replace every `"console.html"` string literal in that file with `"index.html"`, and update the surrounding comment if it names the old filename.

Re-run the same grep afterwards. Expected: no output.

- [ ] **Step 6: Run the disclosure test**

Run: `npx vitest run web/app/console/__tests__/disclosure.test.ts`

Expected: PASS — the invented-crowd line still precedes every number by `indexOf` on the file, now read from `web/index.html`.

- [ ] **Step 7: Run the full check and confirm the build output**

Run: `npm run check && ls dist/index.html`

Expected: all three stages green, and `dist/index.html` present. `dist/console.html` must not exist.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "The console becomes web/index.html

web/index.html was git-ignored because scripts/build-notes.ts wrote it on every
build. That script is gone, so the ignore rule goes with it, and the hand-written
console moves into the site's front door under version control. web/generated/ is
un-ignored for the same reason: nothing generates it any more.

The disclosure-ordering test now reads web/index.html — repointed after the move, not
before, so it never had a window where it was asserting against a file that did not
exist."
```

---

### Task 34: Rewrite CLAUDE.md as the console's working agreement

**Files:**
- Modify: `CLAUDE.md:3-4` (the header), `CLAUDE.md:11-29` (identity), `CLAUDE.md:37-47` (guardrails 1–2), `CLAUDE.md:49-56` (guardrail 3), `CLAUDE.md:67-74` (guardrails 6–7), `CLAUDE.md:85-96` (guardrails 10–12), `CLAUDE.md:171-179` (the co-location bullet), `CLAUDE.md:189-213` (Testing), `CLAUDE.md:215-238` (Commands), `CLAUDE.md:240-257` (Content)

**Interfaces:**
- Consumes: the replacement prose in the design's §8, quoted verbatim below, plus §2's one-sentence replacement for the page-ordering shape and §6.4's naming of the storage APIs.
- Produces: a `CLAUDE.md` with no reference to any file this pivot deleted, and with guardrails 4, 5, 8, 9 and 13 unchanged.

Guardrails 5, 8 and 13 are untouched by design, and 4 and 9 name nothing that was deleted, so they are untouched here too. Where §8's prose is pasted, add bold to the first sentence to match the file's list style; change no words.

- [ ] **Step 1: Replace the header and the identity section**

`CLAUDE.md:3-4` currently reads:

> MIRN is an **interactive learning environment** for perturbation in robotics. Read
> `docs/teaching/authoring.md` before writing any page copy. This file is the operational contract.

Replace with:

> MIRN is a **simulator console** for perturbation in robotics. This file is the operational
> contract, and it is the only one — `docs/teaching/authoring.md` governed page copy and there are
> no pages.

Then replace `CLAUDE.md:11-29` — the whole `## What this project is` section body — with, quoting §2 and §8:

```markdown
## What this project is

MIRN becomes a **simulator console** for perturbation in robotics: set up an invented crowd, press
Run, and compare what different rulers say about what the robot did to it.

The operator is unchanged — a curious person with no robotics background, willing to press Run and
read carefully for twenty minutes. What changed is that they act instead of read.

The notebook carried its explanation in seventeen pages, in a fixed order, before any number
appeared. The console has no order at all: every number is reachable in any state. So the
explanation stops *preceding* the number and starts *hanging off* it. The
`intuition → visualization → measurement → mathematics → interpretation` shape was a page ordering
and there are no pages. It is replaced by the one sentence that survives its loss, because that is
what guardrails 1, 6 and 7 now rest on:

> **Every number on screen is one interaction from what it assumes and from what it would read if
> the answer were zero.**

The simulator exists so the mathematics has something concrete to refer to. It is not the product;
the understanding is.

**It is not** a robotics platform, a motion-planning framework, a dataset, a benchmark, or a
research result. If a proposed change moves it toward any of those, say so and push back before
implementing.
```

- [ ] **Step 2: Reword guardrails 1 and 2 off the page vocabulary**

In guardrail 1 (`CLAUDE.md:37-41`), replace the final sentence:

> A lesson that lets a reader think they are watching real pedestrians has failed, however good the number is.

with:

> A console that lets an operator think they are watching real pedestrians has failed, however good the number is. The disclosure sits above the arena and above the readouts in document order in the static HTML, and it is line one of every CSV, because a file outlives the page it came from.

In guardrail 2 (`CLAUDE.md:43-47`), replace `Where the copy wants one of those, it says instead what would have to be measured to find out.` with `Where a readout or an expander wants one of those, it says instead what would have to be measured to find out.`

- [ ] **Step 3: Replace guardrail 3 with §8's rewrite, verbatim**

Replace `CLAUDE.md:49-56` in full with:

```markdown
3. **The knobs are one closed table and each entry names, as data, the measurement it moves.** The
   build checks four mechanical shadows: every axis's `apply` produces a legal `RunConfig` at both
   ends and every step between; every axis moves its declared measurement by more than the band
   measured at the same settings; the console shows an axis's declared measurement whenever that
   axis is on screen; every axis and column has a plain-English name and a unit.

   The second is the check `lintComparatives` could never make — it only measured how close a
   comparative word sat to a number. It immediately catches a violation already shipped:
   `instrument.html` puts a reaction-time slider directly above a True-effect tile, and reaction
   time is flat on true effect (0.290 to 0.269, inside seed noise) while moving minimum clearance
   monotonically (-0.134 to -0.402 m). None of the four knows whether an expander's wording is
   *true*, and three axes are measurably non-monotone, so reading the console at both ends of every
   dial is still the author's job.
```

The `instrument.html` reference is historical — that page is deleted, and the sentence records the violation that motivated the check. Quote it as written; do not update it.

- [ ] **Step 4: Reword guardrails 6 and 7 onto the tiles**

Replace guardrail 6's last sentence (`CLAUDE.md:69-70`) — `This binds the readout tiles, not just the return type.` — with:

> This binds the readout tiles, not just the return type: the tile's props are `(reading, zeroRendering)`, the zero is a rendered value plus phrase, and a zero-reference inside a closed `<details>` is not shown. The zero is measured per axis value, never quoted from another cell.

Replace guardrail 7's second sentence (`CLAUDE.md:72`) — `A beginner needs to see metres once, early, or a ratio means nothing to them.` — with:

> A beginner needs to see metres against something, or a ratio means nothing to them. On a 72-row table a body-scale phrase per cell is absurd, so the anchor appears on the tiles and in the column header, once.

- [ ] **Step 5: Name the storage APIs in guardrail 10**

Replace `CLAUDE.md:85-87` with:

```markdown
10. **No server, no backend, no account, no persistence beyond the URL.** Static files only. This
    includes analytics, saved sessions, comment threads and share endpoints — and it names
    `localStorage`, `sessionStorage` and `IndexedDB`, which are exactly the loophole a reviewer
    reads as compliant. The ledger does not survive a reload. A permalink is a query string and it
    carries the recipe, never the results: a link asserting `true_effect=0.352` would quote an old
    answer with the new page's authority.
```

- [ ] **Step 6: Replace guardrails 11 and 12 with §8's rewrites, verbatim**

Replace `CLAUDE.md:89-96` in full with:

```markdown
11. **The line is not "do not be a simulator"; it is between this toy, measured well, and robots,
    characterised.** The operative half of the old rule — "which page does this make clearer?" —
    stops working when there are no pages, and it was the half that did the refusing. No ROS, no
    planner benchmark, no dataset loader, no trained model, no physics-engine dependency, no second
    simulator backend, no leaderboard, no bring-your-own-method import path. The CSV is an export,
    never an input format — the moment something else can be read in and scored, this is a benchmark
    and the numbers start being about someone else's robot. A run list with pinning, diffing, a
    sweep and an export is precisely the shape of a benchmark harness, and a column picker is an
    extension point wearing a checkbox, so the columns are a closed table with no user-defined
    column and no formula field. The refusal test is now: **"which readout does this move, and what
    does that readout say when the answer is zero?"** — no answer, no feature. It folds guardrail 6
    into the admission criterion, so a feature cannot enter without bringing its own zero.

12. **No bare code identifier on any surface a reader sees, and every term defined in plain English
    at first use.** Half of this guardrail genuinely died: `web/vocab.ts`, the `introduces`/`uses`
    front matter, `checkVocabulary` and `lintForwardTerms` all go, because with one page there is no
    order to fix. What survives is the whole rule. Its only mechanical enforcement is the identifier
    regex, re-homed from the deleted render suite onto `COLUMNS` and `AXES` in
    `web/engine/job/__tests__/columns.test.ts` and `axes.test.ts`. Pointed at the catalogue rather
    than a rendered DOM, it also covers a column nobody ticked.
```

- [ ] **Step 7: Repoint the co-location bullet away from `web/notes.ts`**

In the TypeScript conventions bullet at `CLAUDE.md:171-179`, replace:

> The wording a reader opens underneath a number is written by hand, by the derivation builders in `web/notes.ts`.

with:

> The wording a reader opens underneath a number is written by hand, in the `assumption` and `zero` fields of each descriptor in `web/engine/job/columns.ts`.

The rest of that bullet — the warning that a panel once explained a different quantity from the one printed above it, and it compiled — stays word for word. Co-location makes the drift *visible*, not impossible; nothing checks the sentence is true.

- [ ] **Step 8: Fix the two page references in Testing**

In `CLAUDE.md:196-202`, replace `The finding itself is taught on page 9 instead.` with `The finding itself is not taught anywhere now; it is why the placebo gate is analytic, and this paragraph is the record of it.`

Replace the `**Pedagogy is a functional requirement.**` paragraph (`CLAUDE.md:210-213`) with:

> **Legibility is a functional requirement.** For a console, "the demonstration is legible at every position of every dial" is behaviour, and a physics change that breaks it should fail a test rather than be noticed three weeks later. That is what `axes.test.ts` is for, and its failure mode is named in its own comment: reducing `nTicks` to speed it up makes a genuinely real axis move less than the band, it goes red for a good reason, and the natural repair is loosening the threshold — which is how the placebo gate would have been destroyed.

- [ ] **Step 9: Rewrite the Commands block**

Replace the fenced block at `CLAUDE.md:220-227` with the design's §9 command set:

```bash
npm run check                            # typecheck, vitest, vite build — no notes step
npm run test -- --project engine         # the fast loop
.venv/bin/python -m pytest -q            # 297 tests, 6 min; one calibration test is 134 s of it
.venv/bin/python -m pytest -q -m "not slow"   # 274 of them in 20 s, minus the heavy nulls
.venv/bin/python -m ruff check src tests
.venv/bin/python -m mirn.cli fixtures --out tests/golden/parity   # after any formula change
```

`npm run measure` is deleted along with its script; the paragraph after the block that describes the fast pytest loop stays unchanged.

- [ ] **Step 10: Replace the Content section**

Replace `CLAUDE.md:240-257` in full with:

```markdown
## Content

There is no prose file. Every word a reader sees is a `label`, a `zero`, an `assumption` or a
`note` on an entry in `web/engine/job/columns.ts` or `web/engine/job/axes.ts`, and those two
catalogues are closed.

**No numeric literal appears in console copy.** Every zero line, band figure and caption renders
from the cell actually on screen. A test asserts no tile string contains a literal metre value,
because a hardcoded number is a claim that outlives the settings that produced it.

**No wording may be written before its measurement has been run.** Copy asserting a phenomenon the
operator is watching not happen is the worst failure this project has. Four sim bugs and two
badly-posed measurements were found by running the experiments first; none would have been caught
by writing the words first.

Voice: short declaratives, concrete nouns before abstract ones, a defined term introduced in one
plain sentence and then used. Self-limitation stated as flatly as the claims — "we have not found"
rather than "nobody has published". The recurring metaphor is **the ruler and the room**: the ruler
is real, the room is invented.

Never use the word *estimand*.
```

- [ ] **Step 11: Confirm nothing deleted is still named**

Run:

```bash
grep -n "docs/teaching\|web/notes\|vocab\.ts\|web/build/\|lintComparatives\|npm run notes\|npm run measure\|experiment-facts\|instrument\.html" CLAUDE.md
```

Expected: exactly two lines — the `lintComparatives` and `instrument.html` mentions inside guardrail 3's quoted second paragraph, which are deliberate historical references to the check that could not be made and the violation it catches. Any other hit is a stale reference to delete.

- [ ] **Step 12: Commit**

```bash
git add CLAUDE.md
git commit -m "Rewrite the working agreement for a console with no pages

Guardrails 3, 11 and 12 are replaced with the design's text verbatim. The identity
sections lose the page-ordering shape and gain the one sentence that survives it:
every number on screen is one interaction from what it assumes and from what it would
read if the answer were zero.

Ten reword off the page vocabulary; 10 now names localStorage, sessionStorage and
IndexedDB by hand, because those are the loophole a reviewer reads as compliant.
Guardrails 4, 5, 8, 9 and 13 are untouched.

Commands lose the notes step and npm run measure."
```

---

### Task 35: Rewrite the README, and prove the Python side never moved

**Files:**
- Modify: `README.md:1-133` (whole file)

**Interfaces:**
- Consumes: the surviving command set from Task 34's `CLAUDE.md` rewrite, and the measured figures the design records in §12 and §13 (72 runs in 4.8 s; a 9×8 sweep with the band on at about 10 s; `runPair` 38 ms at 18 people).
- Produces: nothing another task depends on. This is the last task in commit 3.

- [ ] **Step 1: Confirm the current README describes a product that no longer exists**

Run: `grep -n "notebook\|npm run notes\|npm run measure\|notes/\|vocabulary ladder\|Nine short pages" README.md`

Expected: hits on lines 3, 5, 41, 43, 78, 84, 100–110 and 116. Every one is a description of the deleted teaching layer. This is why the file is replaced rather than patched.

- [ ] **Step 2: Replace `README.md` in full**

Write this as the entire file:

```markdown
# MIRN

**A bench for one question: how much did a robot move a crowd, and how would you know?**

A robot crosses a room full of people. Some of them move differently than they would have. MIRN is
a console for measuring how much — set up an invented crowd, press Run, and compare what different
rulers say about what the robot did to it.

You need no robotics background. The mathematics goes no further than the distance between two
points.

```bash
npm install
npm run dev          # then open the address it prints
```

---

## The idea in ninety seconds

Run one crowd twice. Same people, same starting positions, same random wobble — once with a robot
in the room and once without. Because everything else is held identical, **the gap between a
person's two paths is the robot's effect on them**, with nothing predicted or guessed at.

Then measure it the way you would have to in a real corridor, where the second run does not exist:
guess where each person was about to walk, and call the error the robot's doing.

Now switch the robot off — leave it crossing the room but let nobody respond to it — so the true
answer is exactly zero, and watch what the second method says. At the console's default forecast
horizon it reports 0.334 m on a run whose true effect is exactly zero, and 0.286 m on a run whose
true effect is 0.352 m. Its number is essentially unrelated to the truth.

---

## What is on the page

One page. A settings panel, an arena you can scrub, six headline readouts with a column picker for
everything else, a sweep curve, and a ledger of every result you have kept.

One press of Run executes **(N axis values × M seeds)**; a single run is the degenerate 1×1 case of
the same mechanism. A 72-run sweep takes about 4.8 seconds; with a per-axis-value run-to-run band
switched on, a 9-value × 8-seed sweep is about 10 seconds. Editing a setting re-simulates a live
1×1 preview at about 38 ms; Run is what commits a result to the ledger and what buys seeds, sweeps,
bands and floors.

**Every number is one interaction from what it assumes and from what it would read if the answer
were zero.** The zero reference is not optional and is never collapsible — it is rendered beside
the value, measured at the same settings, because a value with nothing to judge it against is the
exact error this thing exists to show.

Nothing persists. The ledger does not survive a reload and there is no storage of any kind. A
permalink carries the settings, never the results, and reloading one shows an empty ledger with a
primed Run that reproduces the sweep exactly.

---

## How it is built

The browser owns the simulation. A frozen configuration goes in and a complete paired result comes
out, so the renderer is a scrubber over a finished run rather than a live loop — which is what
keeps the physics, the measurement and the drawing separable. Both arms of a pair are driven by one
addressable noise tape, so they share their randomness by construction and there is nothing to keep
in step. Sweeps run in a Worker that returns numbers only, never trajectories; selecting a row for
playback rebuilds that run from its key and re-simulates it, which is legal only because the same
seed gives the same bytes, and a test asserts that bitwise rather than assuming it.

Python is the oracle. `src/mirn/` holds the reference implementations of the divergences,
estimators and calibration, and `.venv/bin/python -m mirn.cli fixtures` writes their answers to
`tests/golden/parity/`. The TypeScript has to reproduce them, at a tolerance the oracle author
declares in the fixture itself. Fréchet is compared bitwise and is the canary.

Nothing from the virtualenv is on PATH, so the Python commands are spelled out in full.

```bash
npm run check                                     # typecheck, tests, site build
npm run test -- --project engine                  # the fast loop
.venv/bin/python -m pytest -q                     # the oracle: 297 tests, about six minutes
.venv/bin/python -m pytest -q -m "not slow"       # 274 of them, minus the heavy nulls, in 20 s
.venv/bin/python -m mirn.cli fixtures --out tests/golden/parity
```

The axes and the columns are two closed tables, and the build checks four mechanical shadows of the
promise that a knob you can turn changes something you can see: every axis produces a legal
configuration at both ends and every step between; every axis moves the measurement it declares by
more than the run-to-run band at those same settings; the console shows an axis's declared
measurement whenever that axis is on screen; and every axis and column has a plain-English name and
a unit, with no bare code identifier anywhere a reader can see one.

None of those four knows whether an expander's wording is *true*, and three of the axes are
measurably non-monotone. Reading the console at both ends of every dial is still a person's job.

---

## Layout

```
web/            the product
  index.html    the console — one page, hand-written, no build step
  engine/       sim, contracts, measurement, job — no DOM anywhere in here
  app/          the worker boundary and the console's own state
  ui/           canvas renderers and the palette
src/mirn/       the oracle: divergences, estimators, calibration, paper figures
tests/golden/   parity fixtures and theme goldens
docs/archive/   the research assessment this project began as. Not maintained
```

---

## What this is not

**Not a research result.** The crowd is a model. A toy crowd is exactly the kind of environment
that would make the underlying research question circular — we decided how people respond to
robots and then measured how people respond to robots. Nothing here may be cited as a finding.

**Not a benchmark.** The CSV is an export, never an input format. The moment something else can be
read in and scored, the numbers stop being about this toy and start being about someone else's
robot. There is no user-defined column and no formula field.

**Not a robotics simulator to build on.** It is deliberately narrow. Every request to widen it has
to answer one question: which readout does this move, and what does that readout say when the
answer is zero?

---

## Provenance

MIRN began as a research measurement instrument for robot-induced perturbation of pedestrian
motion — an estimator with an identification strategy, a calibration procedure and a detection
floor. That assessment, its literature review, and its `UNVERIFIED` markers are preserved unchanged
in `docs/archive/`. It is not maintained and it does not govern current work.

It then spent a while as a teaching notebook, which explained the thesis faster than the paper did.
The console explains it faster still, because the reader stops reading and starts turning the dial.

> The ruler is real. The room is invented. Turn the dial.
```

- [ ] **Step 3: Confirm no stale reference survived**

Run: `grep -n "notebook\|npm run notes\|npm run measure\|web/notes\|instrument\|vocabulary ladder\|Nine short pages\|prose lints" README.md`

Expected: no output.

- [ ] **Step 4: Run the full check one last time**

Run: `npm run check`

Expected: all three stages green.

Then run the oracle, which this commit series never touched: `.venv/bin/python -m pytest -q -m "not slow"` and `.venv/bin/python -m ruff check src tests`.

Expected: 274 passed, and ruff clean.

- [ ] **Step 5: Prove the Python side was never modified across the whole of commit 3**

Six commits were made in this phase (Tasks 24, 25, 26, 27, 28, 29 — the last one after this step).

Run: `git diff --name-only HEAD~5..HEAD -- src tests pyproject.toml`

Expected: no output. `src/mirn/`, `tests/`, `pyproject.toml` and `tests/golden/parity/` are outside this pivot entirely — the parity fixtures are untouched because nothing in this design enters `web/engine/measure/`, and `web/engine/job/` must never acquire an oracle.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "Rewrite the README for the console

The old one described nine pages in four parts, a vocabulary ladder, four prose lints
and npm run measure. None of those exist. The new one describes a bench: press Run,
compare rulers, and read every number next to what it would say if the answer were
zero.

src/mirn, tests/ and tests/golden/parity were not touched by any commit in this
series, and git diff over the six of them says so."
```