# OmniSim adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let MIRN read a JSON run set produced by an external simulator, assemble it into the
existing `PairedRun` contract, and measure it with the rulers it already has.

**Architecture:** Two movements. First a behaviour-preserving refactor that decouples the report
layer from `RunConfig` and from `SIM_CONSTANTS`, so a column extractor consumes data rather than
simulator internals. Then a new `web/engine/adapter/` that parses a versioned JSON run set,
reconciles it against MIRN's paired invariants (without relaxing them), and produces the same
`MeasuredRun` shape `runPair` already produces.

**Tech Stack:** TypeScript strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
Vitest, no runtime dependencies. Frozen plain records validated in `make*` factories that throw
`ContractError` via `fail()` from `web/engine/core/errors.ts`.

**Spec:** `docs/superpowers/specs/2026-09-09-omnisim-adapter-design.md`

## Global Constraints

- **No new runtime dependency.** `package.json` has zero `dependencies` and must keep zero.
- **No network, no storage.** `web/app/console/__tests__/nostorage.test.ts` greps every `.ts`,
  `.html` and `.css` under `web/` for `localStorage`, `sessionStorage`, `indexedDB`, `fetch(`,
  `XMLHttpRequest`, `WebSocket`. The parser takes a **string**, never a `File` or a URL.
- **No `Math.random`.** `web/engine/__tests__/setup.ts` makes it throw in the engine project.
- **No `Math.hypot` in `web/engine/measure/`.** Use `Math.sqrt(dx*dx + dy*dy)` everywhere for
  consistency; `web/engine/measure/__tests__/hypot.test.ts` greps that directory.
- **Explicit loops with named intermediates.** No chained expressions to save lines. No
  `isinstance`-style type sniffing — every record carries an explicit `kind: string`.
- **Frozen, structured-cloneable plain objects.** Never a class: everything may cross a Worker
  boundary.
- **Tests live in `__tests__/` beside the code.** Files under `web/engine/**` run in the `engine`
  Vitest project (Node, **no DOM** — `document`/`window`/`navigator` fail at import).
- **Determinism tests compare bytes:** `toBe(0)`, never `toBeCloseTo(0)`.
- **No numeric literal in reader-facing copy**, and no bare code identifier. New reader-facing
  strings are scanned with `CODE_IDENTIFIER` from `web/testing/identifiers.ts`.
- **Write the test with the implementation, in the same commit.**
- **Gate:** `npm run typecheck && npm run test` must be green before any push.

---

### Task 1: Decouple `ReportContext` from `RunConfig` and `SIM_CONSTANTS`

Behaviour-preserving. **No number may move.** The existing suite is the proof: every current test
must pass unchanged after this task.

**Files:**
- Modify: `web/engine/job/report.ts` (`ReportContext`, `BuildContextInit`, `buildContext`)
- Create: `web/engine/job/simContext.ts`
- Modify: `web/engine/job/columns.ts` (5 reads of `ctx.config`, 4 reads of `SIM_CONSTANTS` radii)
- Modify call sites: `web/engine/job/runner.ts:79`, `web/engine/job/familyProbe.ts:293`,
  `web/drill.ts:306`, `web/drill.ts:341`, `web/app/console/preview.ts:125`
- Modify tests: `web/engine/job/__tests__/report.test.ts:27,133`,
  `web/engine/job/__tests__/columns.test.ts:23`, `web/engine/job/__tests__/unpaired.test.ts:71`,
  `web/engine/job/__tests__/axes.slow.test.ts:118`, `web/app/console/__tests__/tile.test.ts:122`

**Interfaces:**
- Consumes: nothing.
- Produces: `MeasuredRun`, `Bodies`, `contextInitFromConfig(config)`. Task 5 builds a `MeasuredRun`;
  Task 7 calls `buildContext` with adapter-supplied `dt` and `bodies`.

- [ ] **Step 1: Write the failing test**

Add to `web/engine/job/__tests__/report.test.ts`:

```ts
import { contextInitFromConfig } from "../simContext.js";
import { DEFAULT_CONFIG, SIM_CONSTANTS } from "../../contracts/config.js";

describe("the report layer consumes data, not the simulator", () => {
  it("carries the body sizes the clearance columns measure with", () => {
    const init = contextInitFromConfig(DEFAULT_CONFIG);
    expect(init.bodies.robotRadiusM).toBe(SIM_CONSTANTS.robotRadiusM);
    expect(init.bodies.pedRadiusM).toBe(SIM_CONSTANTS.pedRadiusM);
  });

  it("carries the time step without carrying the whole configuration", () => {
    const init = contextInitFromConfig(DEFAULT_CONFIG);
    expect(init.dt).toBe(DEFAULT_CONFIG.dt);
  });

  it("reduces the room's geometry to the shortest crossing that counts as arriving", () => {
    const init = contextInitFromConfig(DEFAULT_CONFIG);
    // 18.00 m apart, minus the 1.1 m goal radius the robot stops inside.
    expect(init.straightLineM).toBeCloseTo(16.9, 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/job/__tests__/report.test.ts`
Expected: FAIL — cannot resolve `../simContext.js`.

- [ ] **Step 3: Create `web/engine/job/simContext.ts`**

```ts
import { SIM_CONSTANTS, type RunConfig } from "../contracts/config.js";
import type { Bodies } from "./report.js";

/**
 * The one module that turns a simulator configuration into what the report layer needs.
 *
 * `report.ts` used to hold a whole `RunConfig`, and read three things out of it: the time step, the
 * treatment (which is on `PairedRun` already) and the robot's start and goal, which it immediately
 * reduced to one distance. Holding the config for that meant every column extractor could reach the
 * simulator's own settings, and two of them reached `SIM_CONSTANTS` for the body sizes as well — so
 * "how close did the robot come to anybody" was measured with MIRN's bodies whatever produced the
 * run.
 *
 * Keeping this conversion here rather than in `report.ts` is the whole point: `report.ts` imports no
 * `RunConfig` and no `SIM_CONSTANTS`, so a run that did not come from this simulator can be reported
 * on without pretending to have a configuration it never had.
 */
export interface SimContextInit {
  readonly dt: number;
  readonly bodies: Bodies;
  readonly straightLineM: number;
}

export function contextInitFromConfig(config: RunConfig): SimContextInit {
  const startX = config.robot.startXY[0];
  const startY = config.robot.startXY[1];
  const goalX = config.robot.goalXY[0];
  const goalY = config.robot.goalXY[1];
  const dx = goalX - startX;
  const dy = goalY - startY;
  const straightLine = Math.sqrt(dx * dx + dy * dy) - SIM_CONSTANTS.goalReachedM;
  let straightLineM = straightLine;
  if (straightLine < 0) {
    straightLineM = 0;
  }

  return Object.freeze({
    dt: config.dt,
    bodies: Object.freeze({
      kind: "bodies" as const,
      robotRadiusM: SIM_CONSTANTS.robotRadiusM,
      pedRadiusM: SIM_CONSTANTS.pedRadiusM,
    }),
    straightLineM,
  });
}
```

- [ ] **Step 4: Change `ReportContext` in `web/engine/job/report.ts`**

Add above `ReportContext`:

```ts
/** How big the bodies are that a clearance is measured between, surface to surface. */
export interface Bodies {
  readonly kind: "bodies";
  readonly robotRadiusM: number;
  readonly pedRadiusM: number;
}

/**
 * A run that has been measured, whoever produced it.
 *
 * `RunResult` is structurally assignable to this, so `runPair`'s output needs no conversion. What
 * this leaves out is the point: no `RunConfig`, so nothing downstream can read a setting that only
 * MIRN's own simulator has.
 */
export interface MeasuredRun {
  readonly pair: PairedRun;
  readonly treated: ArmResult;
  readonly control: ArmResult;
}
```

Replace `ReportContext`'s `config` and `run` fields, and add `bodies`:

```ts
export interface ReportContext {
  readonly kind: "reportContext";
  readonly dt: number;
  readonly bodies: Bodies;
  readonly params: MeasurementParams;
  readonly run: MeasuredRun;
  readonly deviation: Deviation;
  readonly band: RunToRunBand | null;
  readonly floor: SplitHalfNull | null;
  readonly zeroRun: MeasuredRun | null;
  readonly frechetMeanM: number | null;
  readonly straightLineM: number;
}

export interface BuildContextInit {
  readonly dt: number;
  readonly bodies: Bodies;
  readonly straightLineM: number;
  readonly params: MeasurementParams;
  readonly run: MeasuredRun;
  readonly band: RunToRunBand | null;
  readonly floor: SplitHalfNull | null;
  readonly zeroRun: MeasuredRun | null;
  readonly frechetMeanM: number | null;
}

export function buildContext(init: BuildContextInit): ReportContext {
  return Object.freeze({
    kind: "reportContext" as const,
    dt: init.dt,
    bodies: init.bodies,
    params: init.params,
    run: init.run,
    deviation: deviation(init.run.pair),
    band: init.band,
    floor: init.floor,
    zeroRun: init.zeroRun,
    frechetMeanM: init.frechetMeanM,
    straightLineM: init.straightLineM,
  });
}
```

Delete the `SIM_CONSTANTS` and `RunConfig` imports from `report.ts`. Change
`pedestrianTimeLost(r: RunResult, dt: number)` to `pedestrianTimeLost(r: MeasuredRun, dt: number)`
and `arrivalSecondsOf` keeps its `ArmResult` parameter unchanged.

- [ ] **Step 5: Update the five reads in `web/engine/job/columns.ts`**

- Line ~157: `ctx.config.treatment.kind` → `ctx.run.pair.treatment.kind`
- Line ~164: `ctx.config.treatment.kind` → `ctx.run.pair.treatment.kind`
- Line ~402: `arrivalSecondsOf(ctx.run.treated, ctx.config.dt)` → `arrivalSecondsOf(ctx.run.treated, ctx.dt)`
- Line ~471: `pedestrianTimeLost(ctx.run, ctx.config.dt)` → `pedestrianTimeLost(ctx.run, ctx.dt)`
- Line ~588: `ctx.config.dt,` → `ctx.dt,`

And the four radii reads at lines ~510, ~511, ~552, ~553:

```ts
        ctx.bodies.robotRadiusM,
        ctx.bodies.pedRadiusM,
```

Remove the now-unused `SIM_CONSTANTS` import if nothing else in the file uses it (it is also used
for `goalReachedM` in an assumption string — check before deleting).

- [ ] **Step 6: Update the five production call sites**

Each currently passes `config`. Replace with the spread:

```ts
    const context = buildContext({
      ...contextInitFromConfig(config),
      params,
      run,
      band,
      floor,
      zeroRun,
      frechetMeanM,
    });
```

Apply at `web/engine/job/runner.ts:79`, `web/engine/job/familyProbe.ts:293`, `web/drill.ts:306`,
`web/drill.ts:341`, `web/app/console/preview.ts:125`, importing `contextInitFromConfig` from
`web/engine/job/simContext.js` (relative path per file). Do the same at the five test call sites.

- [ ] **Step 7: Run the whole suite — nothing may move**

Run: `npm run typecheck && npm run test`
Expected: PASS, **1173 tests**, the same count as before. Any changed number is a bug in this task,
not a new finding.

- [ ] **Step 8: Commit**

```bash
git add web/engine/job/report.ts web/engine/job/simContext.ts web/engine/job/columns.ts \
        web/engine/job/runner.ts web/engine/job/familyProbe.ts web/drill.ts \
        web/app/console/preview.ts web/engine/job/__tests__ web/app/console/__tests__/tile.test.ts
git commit -m "Let the report layer consume data instead of the simulator"
```

---

### Task 2: Split `replicateBand` into simulating and computing

**Files:**
- Modify: `web/engine/measure/null/band.ts`
- Test: `web/engine/measure/null/band.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `bandFrom(runs: readonly (readonly Float64Array[])[], nReplicates): RunToRunBand`.
  Task 7 calls it with replicate runs read from a file.

- [ ] **Step 1: Write the failing test**

Add to `web/engine/measure/null/band.test.ts`:

```ts
import { bandFrom, replicateBand } from "./band.js";
import { makeRunConfig } from "../../contracts/config.js";
import { runPair } from "../../sim/run.js";

describe("a band can be computed from runs somebody else produced", () => {
  it("gives the same answer as running them here, on the same runs", () => {
    const config = makeRunConfig({ seed: 4242, nTicks: 60, crowd: { nPedestrians: 6 } });
    const viaSimulator = replicateBand(config, 3);

    const runs: (readonly Float64Array[])[] = [];
    for (let replicate = 1; replicate <= 3; replicate++) {
      const replicateConfig = makeRunConfig({
        ...config,
        replicate,
        treatment: { kind: "robot-presence" },
      });
      runs.push(runPair(replicateConfig).control.positions);
    }
    const viaArrays = bandFrom(runs);

    expect(viaArrays.value).toBe(viaSimulator.value);
    expect(viaArrays.peakValue).toBe(viaSimulator.peakValue);
  });

  it("refuses fewer than two runs, because one run has nothing to differ from", () => {
    expect(() => bandFrom([[new Float64Array([0, 0, 1, 1])]])).toThrow(/at least 2/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/measure/null/band.test.ts`
Expected: FAIL — `bandFrom` is not exported.

- [ ] **Step 3: Extract `bandFrom` from `replicateBand`**

Read the existing `replicateBand` body. It builds `runs: (readonly Float64Array[])[]` by calling
`runPair` per replicate, then computes the pairwise statistics. Move **everything after the
run-collecting loop** into a new exported function, unchanged:

```ts
/**
 * The band's arithmetic, over runs that already exist.
 *
 * Split out of `replicateBand` so a set of robot-absent runs produced elsewhere can be turned into
 * the same floor. Nothing here re-runs anything, and nothing here knows what produced its input —
 * which is the only reason a run set read off a file can have a floor at all.
 */
export function bandFrom(
  runs: readonly (readonly Float64Array[])[],
  quantile = 0.95,
): RunToRunBand {
  if (runs.length < 2) {
    throw new Error(`a band needs at least 2 runs to differ from one another, got ${runs.length}`);
  }
  // ...the existing pairwise-gap body, verbatim...
}

export function replicateBand(config: RunConfig, nReplicates = 8): RunToRunBand {
  if (!Number.isInteger(nReplicates) || nReplicates < 2) {
    throw new Error(`replicateBand needs at least 2 replicates, got ${nReplicates}`);
  }
  const runs: (readonly Float64Array[])[] = [];
  for (let replicate = 1; replicate <= nReplicates; replicate++) {
    // ...the existing loop body, verbatim...
  }
  return bandFrom(runs);
}
```

Preserve the existing comment about every replicate being a robot-absent run — it belongs on
`replicateBand`, which is what chooses that.

- [ ] **Step 4: Run tests**

Run: `npx vitest run web/engine/measure/null/band.test.ts`
Expected: PASS, including the pre-existing band tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add web/engine/measure/null/band.ts web/engine/measure/null/band.test.ts
git commit -m "Split the run-to-run band into running and computing"
```

---

### Task 3: The run-set schema and its parser

**Files:**
- Create: `web/engine/adapter/schema.ts`
- Create: `web/engine/adapter/parse.ts`
- Test: `web/engine/adapter/__tests__/parse.test.ts`

**Interfaces:**
- Consumes: `fail` from `web/engine/core/errors.js`.
- Produces: `RunSet`, `RunRecord`, `RunRole`, `parseRunSet(text: string): RunSet`. Task 4 consumes
  `RunSet`; Task 5 consumes `RunRecord`.

- [ ] **Step 1: Write the failing test**

Create `web/engine/adapter/__tests__/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRunSet } from "../parse.js";

function minimalText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    mirnTrajectoryFormat: 1,
    scenario: { scenarioId: "s", widthM: 10, heightM: 8, dt: 0.1, nSteps: 3 },
    provenance: { producer: "omnisim", producerVersion: "0", simulator: "x", crowdModel: "y", build: "b" },
    bodies: { pedestrianRadiusM: 0.24, robotRadiusM: 0.32 },
    treatment: { kind: "robot-presence" },
    runs: [
      { runId: "t", role: "treated", seed: 7, robotPresent: true, completion: null,
        robot: { positions: [0, 0, 1, 0, 2, 0] },
        agents: [{ id: "a", positions: [0, 1, 0, 2, 0, 3] }, { id: "b", positions: [1, 1, 1, 2, 1, 3] }] },
      { runId: "c", role: "control", seed: 7, robotPresent: false, completion: null,
        robot: null,
        agents: [{ id: "a", positions: [0, 1, 0, 2, 0, 3] }, { id: "b", positions: [1, 1, 1, 2, 1, 3] }] },
    ],
    ...overrides,
  });
}

describe("reading a run set", () => {
  it("reads a well-formed run set", () => {
    const set = parseRunSet(minimalText());
    expect(set.kind).toBe("runSet");
    expect(set.runs.length).toBe(2);
    expect(set.runs[0]?.role).toBe("treated");
    expect(set.scenario.dt).toBe(0.1);
    expect(set.bodies.pedRadiusM).toBe(0.24);
  });

  it("refuses a format version it does not know", () => {
    expect(() => parseRunSet(minimalText({ mirnTrajectoryFormat: 2 }))).toThrow(/version/i);
  });

  it("refuses text that is not a run set at all", () => {
    expect(() => parseRunSet("not json")).toThrow(/could not be read/i);
  });

  it("refuses a run whose positions do not divide into pairs", () => {
    const broken = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = broken["runs"] as { agents: { positions: number[] }[] }[];
    (runs[0] as { agents: { positions: number[] }[] }).agents[0]!.positions = [0, 1, 2];
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(/pairs/i);
  });

  it("refuses a position that is not a number", () => {
    const broken = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = broken["runs"] as { agents: { positions: unknown[] }[] }[];
    (runs[0] as { agents: { positions: unknown[] }[] }).agents[0]!.positions[0] = "over there";
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(/number/i);
  });

  it("refuses a run set with no runs in it", () => {
    expect(() => parseRunSet(minimalText({ runs: [] }))).toThrow(/holds no runs/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/adapter/__tests__/parse.test.ts`
Expected: FAIL — cannot resolve `../parse.js`.

- [ ] **Step 3: Write `web/engine/adapter/schema.ts`**

```ts
/**
 * The shape of a run set read in from another simulator.
 *
 * One document per RUN SET rather than per run, so the pairing metadata cannot be separated from
 * the data it describes. Loose per-run files are how a control arm ends up matched to the wrong
 * treated arm, and nothing downstream could detect it.
 *
 * `FORMAT_VERSION` is refused if it is anything else. A format that will be renegotiated needs a
 * version before its first byte, not after the first disagreement.
 */
export const FORMAT_VERSION = 1;

/**
 * What a run is FOR.
 *
 * `treated` and `control` are the pair. The other three exist so the format itself asks for the
 * numbers guardrail 6 requires: `zeroTreated` and `zeroControl` are a pair in which nobody responds
 * to the robot, so the honest answer is exactly nothing; `replicate` runs are robot-absent runs
 * differing only in exogenous noise, which is what a run-to-run band is measured from.
 *
 * When they are absent, the columns that need them report that they were not measured. They are
 * never inferred, and no floor is invented in their place.
 */
export type RunRole = "treated" | "control" | "zeroTreated" | "zeroControl" | "replicate";

export const RUN_ROLES: readonly RunRole[] = Object.freeze([
  "treated", "control", "zeroTreated", "zeroControl", "replicate",
]);

export interface Scenario {
  readonly kind: "scenario";
  readonly scenarioId: string;
  readonly widthM: number;
  readonly heightM: number;
  readonly dt: number;
  readonly nSteps: number;
}

/** Who made this, in enough detail that a results file can say so. */
export interface Provenance {
  readonly kind: "provenance";
  readonly producer: string;
  readonly producerVersion: string;
  readonly simulator: string;
  readonly crowdModel: string;
  readonly build: string;
}

/** Renamed on the way in: the file says `pedestrianRadiusM`, the engine says `pedRadiusM`. */
export interface SuppliedBodies {
  readonly kind: "suppliedBodies";
  readonly pedRadiusM: number;
  readonly robotRadiusM: number;
}

/** Why a run stopped. `atStep` is the sample the robot first counted as arrived. */
export interface Completion {
  readonly kind: "completion";
  readonly outcome: string;
  readonly atStep: number;
}

export interface SuppliedPathRecord {
  readonly kind: "suppliedPathRecord";
  /** Flat [x0,y0,x1,y1,...], exactly as `Trajectory.positions` is laid out. */
  readonly positions: Float64Array;
  readonly nSteps: number;
}

export interface SuppliedAgent {
  readonly kind: "suppliedAgent";
  /** The producer's own identifier. Never reaches a `Trajectory`; see `identity.ts`. */
  readonly id: string;
  readonly path: SuppliedPathRecord;
}

export interface RunRecord {
  readonly kind: "runRecord";
  readonly runId: string;
  readonly role: RunRole;
  readonly seed: number;
  readonly robotPresent: boolean;
  readonly completion: Completion | null;
  readonly robot: SuppliedPathRecord | null;
  readonly agents: readonly SuppliedAgent[];
}

export interface RunSet {
  readonly kind: "runSet";
  readonly scenario: Scenario;
  readonly provenance: Provenance;
  readonly bodies: SuppliedBodies;
  readonly treatment: { readonly kind: "robot-presence" } | { readonly kind: "none" };
  readonly runs: readonly RunRecord[];
}
```

- [ ] **Step 4: Write `web/engine/adapter/parse.ts`**

```ts
import { fail } from "../core/errors.js";
import {
  FORMAT_VERSION, RUN_ROLES,
  type Completion, type Provenance, type RunRecord, type RunRole, type RunSet,
  type Scenario, type SuppliedAgent, type SuppliedBodies, type SuppliedPathRecord,
} from "./schema.js";

/**
 * Text to a validated run set.
 *
 * A string, never a `File` and never a URL. Guardrail 10 leaves this site with no server to fetch
 * from and no storage to read from, so the only way a document arrives is a reader opening it; the
 * page does that with `FileReader` and hands the text here, exactly as `web/fit.ts` already does.
 *
 * Every failure names what was wrong in a sentence, because the reader of this error is somebody
 * holding a file another team produced and needing to know which end to fix.
 */

function asRecord(value: unknown, whose: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${whose} must be a block of named values, and it is not`);
  }
  return value as Record<string, unknown>;
}

function asFinite(value: unknown, whose: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${whose} must be a number, and it is ${JSON.stringify(value)}`);
  }
  return value;
}

function asText(value: unknown, whose: string): string {
  if (typeof value !== "string") {
    fail(`${whose} must be text, and it is ${JSON.stringify(value)}`);
  }
  return value;
}

function asFlag(value: unknown, whose: string): boolean {
  if (typeof value !== "boolean") {
    fail(`${whose} must be true or false, and it is ${JSON.stringify(value)}`);
  }
  return value;
}

function readPath(value: unknown, whose: string): SuppliedPathRecord {
  const holder = asRecord(value, whose);
  const raw = holder["positions"];
  if (!Array.isArray(raw)) {
    fail(`${whose} must carry a list of positions, and it does not`);
  }
  const list = raw as unknown[];
  if (list.length % 2 !== 0) {
    fail(
      `${whose} has ${list.length} position values, which do not divide into pairs of an ` +
        `across-the-room and an up-the-room figure`,
    );
  }
  const nSteps = list.length / 2;
  if (nSteps < 1) {
    fail(`${whose} has no positions in it, so there is no path there to measure`);
  }
  const positions = new Float64Array(list.length);
  for (let i = 0; i < list.length; i++) {
    positions[i] = asFinite(list[i], `position ${i} of ${whose}`);
  }
  return Object.freeze({ kind: "suppliedPathRecord" as const, positions, nSteps });
}

function readCompletion(value: unknown, whose: string): Completion | null {
  if (value === null || value === undefined) {
    return null;
  }
  const holder = asRecord(value, `the finish of ${whose}`);
  const atStep = asFinite(holder["atStep"], `the finishing sample of ${whose}`);
  if (!Number.isInteger(atStep) || atStep < 0) {
    fail(`the finishing sample of ${whose} must be a whole sample number, and it is ${atStep}`);
  }
  return Object.freeze({
    kind: "completion" as const,
    outcome: asText(holder["outcome"], `the finishing state of ${whose}`),
    atStep,
  });
}

function readRun(value: unknown, index: number): RunRecord {
  const whose = `the run at position ${index}`;
  const holder = asRecord(value, whose);
  const runId = asText(holder["runId"], `the name of ${whose}`);

  const roleText = asText(holder["role"], `the part played by ${whose}`);
  let role: RunRole | null = null;
  for (const candidate of RUN_ROLES) {
    if (candidate === roleText) {
      role = candidate;
    }
  }
  if (role === null) {
    fail(
      `${whose} says it plays the part '${roleText}', which is not one this bench knows; the ` +
        `parts are ${RUN_ROLES.join(", ")}`,
    );
  }

  const seed = asFinite(holder["seed"], `the seed of ${whose}`);
  if (!Number.isInteger(seed)) {
    fail(`the seed of ${whose} must be a whole number, and it is ${seed}`);
  }

  const robotPresent = asFlag(holder["robotPresent"], `whether a robot is in ${whose}`);
  const robotValue = holder["robot"];
  let robot: SuppliedPathRecord | null = null;
  if (robotValue !== null && robotValue !== undefined) {
    robot = readPath(robotValue, `the robot's path in ${whose}`);
  }
  if (robotPresent && robot === null) {
    fail(`${whose} says a robot is in it and carries no path for one`);
  }
  if (!robotPresent && robot !== null) {
    fail(`${whose} says no robot is in it and carries a path for one`);
  }

  const agentsValue = holder["agents"];
  if (!Array.isArray(agentsValue)) {
    fail(`${whose} must carry a list of the people in it, and it does not`);
  }
  const agentsList = agentsValue as unknown[];
  if (agentsList.length < 1) {
    fail(`${whose} holds nobody, and a run of nobody measures nothing`);
  }
  const agents: SuppliedAgent[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < agentsList.length; i++) {
    const agentHolder = asRecord(agentsList[i], `the person at position ${i} of ${whose}`);
    const id = asText(agentHolder["id"], `the name of the person at position ${i} of ${whose}`);
    if (seen.has(id)) {
      fail(`${whose} names the person '${id}' twice, so its names do not name one person each`);
    }
    seen.add(id);
    agents.push(
      Object.freeze({
        kind: "suppliedAgent" as const,
        id,
        path: readPath(agentHolder, `the path of the person '${id}' in ${whose}`),
      }),
    );
  }

  return Object.freeze({
    kind: "runRecord" as const,
    runId,
    role,
    seed,
    robotPresent,
    completion: readCompletion(holder["completion"], whose),
    robot,
    agents: Object.freeze(agents),
  });
}

export function parseRunSet(text: string): RunSet {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("the run set could not be read: it is not a well-formed document");
  }

  const holder = asRecord(parsed, "a run set");
  const version = holder["mirnTrajectoryFormat"];
  if (version !== FORMAT_VERSION) {
    fail(
      `this bench reads run sets written to version ${FORMAT_VERSION} of the format, and this one ` +
        `says ${JSON.stringify(version)}`,
    );
  }

  const scenarioHolder = asRecord(holder["scenario"], "the scenario");
  const nSteps = asFinite(scenarioHolder["nSteps"], "the number of samples in the scenario");
  if (!Number.isInteger(nSteps) || nSteps < 2) {
    fail(`the scenario must run for at least two samples, and it says ${nSteps}`);
  }
  const dt = asFinite(scenarioHolder["dt"], "the time between samples");
  if (dt <= 0) {
    fail(`the time between samples must be above nought, and it is ${dt}`);
  }
  const scenario: Scenario = Object.freeze({
    kind: "scenario" as const,
    scenarioId: asText(scenarioHolder["scenarioId"], "the name of the scenario"),
    widthM: asFinite(scenarioHolder["widthM"], "the width of the room"),
    heightM: asFinite(scenarioHolder["heightM"], "the height of the room"),
    dt,
    nSteps,
  });

  const provenanceHolder = asRecord(holder["provenance"], "the record of who produced this");
  const provenance: Provenance = Object.freeze({
    kind: "provenance" as const,
    producer: asText(provenanceHolder["producer"], "the producer"),
    producerVersion: asText(provenanceHolder["producerVersion"], "the producer's version"),
    simulator: asText(provenanceHolder["simulator"], "the simulator"),
    crowdModel: asText(provenanceHolder["crowdModel"], "the crowd model"),
    build: asText(provenanceHolder["build"], "the build"),
  });

  const bodiesHolder = asRecord(holder["bodies"], "the body sizes");
  const bodies: SuppliedBodies = Object.freeze({
    kind: "suppliedBodies" as const,
    pedRadiusM: asFinite(bodiesHolder["pedestrianRadiusM"], "how wide a person is"),
    robotRadiusM: asFinite(bodiesHolder["robotRadiusM"], "how wide the robot is"),
  });

  const treatmentHolder = asRecord(holder["treatment"], "what the two runs differ by");
  const treatmentKind = asText(treatmentHolder["kind"], "what the two runs differ by");
  if (treatmentKind !== "robot-presence" && treatmentKind !== "none") {
    fail(
      `the two runs are said to differ by '${treatmentKind}', and a run set read in from ` +
        `elsewhere may differ by whether the robot is there, or by nothing at all`,
    );
  }

  const runsValue = holder["runs"];
  if (!Array.isArray(runsValue)) {
    fail("a run set must carry a list of runs, and it does not");
  }
  const runsList = runsValue as unknown[];
  if (runsList.length < 1) {
    fail("this run set holds no runs at all, so there is nothing in it to measure");
  }
  const runs: RunRecord[] = [];
  for (let i = 0; i < runsList.length; i++) {
    runs.push(readRun(runsList[i], i));
  }

  return Object.freeze({
    kind: "runSet" as const,
    scenario,
    provenance,
    bodies,
    treatment: Object.freeze({ kind: treatmentKind }) as RunSet["treatment"],
    runs: Object.freeze(runs),
  });
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run web/engine/adapter/__tests__/parse.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add web/engine/adapter/schema.ts web/engine/adapter/parse.ts web/engine/adapter/__tests__/parse.test.ts
git commit -m "Read a run set another simulator wrote"
```

---

### Task 4: Identity and the three reconciliation policies

**Files:**
- Create: `web/engine/adapter/identity.ts`
- Create: `web/engine/adapter/reconcile.ts`
- Test: `web/engine/adapter/__tests__/identity.test.ts`
- Test: `web/engine/adapter/__tests__/reconcile.test.ts`

**Interfaces:**
- Consumes: `RunRecord` from Task 3.
- Produces: `identityFor(ids: readonly string[]): IdentityMap` with
  `{ agentIdOf(externalId): string, agentUidOf(externalId): number, orderedIds: readonly string[] }`;
  `INITIAL_TOLERANCE_M`; `reconcileInitial(treated, control): Reconciliation` returning
  `{ maxDisagreementM, snapped }`; `requireSameLength(treated, control)`.

- [ ] **Step 1: Write the failing tests**

Create `web/engine/adapter/__tests__/identity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { identityFor } from "../identity.js";

describe("naming people a producer named differently", () => {
  it("gives the same person the same name whatever order they arrived in", () => {
    const a = identityFor(["ped-2", "ped-1", "ped-10"]);
    const b = identityFor(["ped-10", "ped-2", "ped-1"]);
    expect(a.agentIdOf("ped-2")).toBe(b.agentIdOf("ped-2"));
    expect(a.agentUidOf("ped-2")).toBe(b.agentUidOf("ped-2"));
  });

  it("mints names the trajectory contract accepts", () => {
    const map = identityFor(["Agent_7", "a-b-c", "5150", "élodie"]);
    for (const id of ["Agent_7", "a-b-c", "5150", "élodie"]) {
      expect(map.agentIdOf(id)).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("counts from nought so the uids are dense", () => {
    const map = identityFor(["c", "a", "b"]);
    const uids = [map.agentUidOf("a"), map.agentUidOf("b"), map.agentUidOf("c")];
    expect([...uids].sort((x, y) => x - y)).toEqual([0, 1, 2]);
  });

  it("refuses a name it was not given", () => {
    const map = identityFor(["a"]);
    expect(() => map.agentUidOf("b")).toThrow(/was not in/i);
  });

  it("refuses the same name twice", () => {
    expect(() => identityFor(["a", "a"])).toThrow(/twice/i);
  });
});
```

Create `web/engine/adapter/__tests__/reconcile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { INITIAL_TOLERANCE_M, reconcileInitial, requireSameLength } from "../reconcile.js";

function path(values: number[]): Float64Array {
  return new Float64Array(values);
}

describe("making two arms start in exactly the same place", () => {
  it("leaves arms that already agree exactly alone, and says they agreed exactly", () => {
    const treated = path([1, 2, 3, 4]);
    const control = path([1, 2, 9, 9]);
    const result = reconcileInitial([treated], [control]);
    expect(result.maxDisagreementM).toBe(0);
    expect(result.snapped).toBe(false);
    expect(control[0]).toBe(1);
  });

  it("snaps a disagreement inside the tolerance onto the treated arm", () => {
    const treated = path([1, 2, 3, 4]);
    const control = path([1 + 1e-12, 2, 9, 9]);
    const result = reconcileInitial([treated], [control]);
    expect(result.snapped).toBe(true);
    expect(result.maxDisagreementM).toBeGreaterThan(0);
    // The point of snapping: the contract's bitwise check now passes honestly.
    expect(control[0]).toBe(treated[0]);
    expect(control[1]).toBe(treated[1]);
  });

  it("refuses a disagreement outside the tolerance rather than papering over it", () => {
    const treated = path([1, 2, 3, 4]);
    const control = path([1.5, 2, 9, 9]);
    expect(() => reconcileInitial([treated], [control])).toThrow(/started in different places/i);
  });

  it("has a tolerance matching the one the oracle allows third parties", () => {
    expect(INITIAL_TOLERANCE_M).toBe(1e-9);
  });
});

describe("two arms of different lengths", () => {
  it("is refused, naming both lengths", () => {
    expect(() => requireSameLength(4, 5)).toThrow(/4[\s\S]*5|5[\s\S]*4/);
  });

  it("passes when they agree", () => {
    expect(() => requireSameLength(4, 4)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run web/engine/adapter/__tests__/`
Expected: FAIL — cannot resolve `../identity.js` and `../reconcile.js`.

- [ ] **Step 3: Write `web/engine/adapter/identity.ts`**

```ts
import { fail } from "../core/errors.js";

/**
 * Turning a producer's own names for people into the two this engine needs.
 *
 * A `Trajectory` carries an `agentId` constrained to `/^[a-z][a-z0-9_]*$/` — so that sorting agrees
 * between Python and JavaScript — and an integer `agentUid`, which is the pairing key. A producer's
 * names meet neither rule: `ped-1`, `Agent_7` and a bare number are all perfectly reasonable and all
 * refused at construction.
 *
 * The mapping is by SORTED POSITION rather than by arrival order. Two arms of one run set list their
 * people in whatever order each happened to write them, and the two must agree about who is who or
 * the pair compares strangers; sorting makes them agree without either arm's file order mattering.
 * `makePairedRun` asserts the two arms' name sets are identical, so a producer whose names differ
 * between arms fails there with both sets in the message rather than silently here.
 *
 * The minted prefix is `ext` rather than `ped`, which the simulator uses. An adapted person is not
 * one of this bench's own, and the prefix is the cheapest place to keep that visible in every buffer
 * dump, every error message and every sorted listing.
 */
export interface IdentityMap {
  readonly kind: "identityMap";
  readonly orderedIds: readonly string[];
  readonly agentIdOf: (externalId: string) => string;
  readonly agentUidOf: (externalId: string) => number;
}

export function identityFor(ids: readonly string[]): IdentityMap {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      fail(`the run set names the person '${id}' twice, and a name must name one person`);
    }
    seen.add(id);
  }

  const orderedIds = [...ids].sort();
  const uidById = new Map<string, number>();
  for (let i = 0; i < orderedIds.length; i++) {
    uidById.set(orderedIds[i] as string, i);
  }

  const uidOf = (externalId: string): number => {
    const uid = uidById.get(externalId);
    if (uid === undefined) {
      fail(`'${externalId}' was not in the run set this naming was built from`);
    }
    return uid;
  };

  return Object.freeze({
    kind: "identityMap" as const,
    orderedIds: Object.freeze(orderedIds),
    agentUidOf: uidOf,
    agentIdOf: (externalId: string): string => `ext${uidOf(externalId)}`,
  });
}
```

- [ ] **Step 4: Write `web/engine/adapter/reconcile.ts`**

```ts
import { fail } from "../core/errors.js";

/**
 * Where a third party's arithmetic is met, so that the contracts never have to bend.
 *
 * `makePairedRun` asserts the two arms' first positions are BIT-IDENTICAL, and that assertion is
 * correct and stays. Its own comment gives the reason: both arms come out of one function against
 * one noise tape, so any difference at all means the tape leaked arm state. A run set written by
 * somebody else has no such guarantee — a value that went through decimal text, or through a
 * thirty-two-bit float, will not come back bit-identical however carefully it was produced.
 *
 * So the tolerance lives HERE, in the thing accommodating a third party, and not in the contract.
 * The alternative — a second, laxer `PairedRun` constructor — was considered and rejected: it makes
 * the strict guarantee conditional on which constructor a caller reached for, and the whole value of
 * that assertion is that it admits no exceptions.
 *
 * What this does is verify agreement within a bound and then SNAP: the control arm's first sample is
 * set to the treated arm's. The contract's check then passes because the values genuinely are
 * identical, not because it was weakened. That edits data, which deserves saying out loud rather
 * than burying, so the residual is returned and a caller can report it.
 */

/**
 * The bound, matching `src/mirn/contracts.py`'s, whose comment says it is there because third-party
 * adapters have to be accommodated. This is that adapter, so it takes that number rather than
 * inventing one.
 */
export const INITIAL_TOLERANCE_M = 1e-9;

export interface Reconciliation {
  readonly kind: "reconciliation";
  /** The largest first-sample gap seen, before snapping. Nought when they already agreed. */
  readonly maxDisagreementM: number;
  readonly snapped: boolean;
}

export function reconcileInitial(
  treatedPaths: readonly Float64Array[],
  controlPaths: readonly Float64Array[],
): Reconciliation {
  if (treatedPaths.length !== controlPaths.length) {
    fail(
      `the two runs hold ${treatedPaths.length} and ${controlPaths.length} people, and a pair ` +
        `compares the same room twice`,
    );
  }

  let maxDisagreementM = 0;
  for (let i = 0; i < treatedPaths.length; i++) {
    const treated = treatedPaths[i] as Float64Array;
    const control = controlPaths[i] as Float64Array;
    const dx = (treated[0] as number) - (control[0] as number);
    const dy = (treated[1] as number) - (control[1] as number);
    const gap = Math.sqrt(dx * dx + dy * dy);
    if (gap > maxDisagreementM) {
      maxDisagreementM = gap;
    }
  }

  if (maxDisagreementM > INITIAL_TOLERANCE_M) {
    fail(
      `the two runs started in different places: the person who moved furthest between them ` +
        `began ${maxDisagreementM} m away from where the other run put them, and a pair only ` +
        `measures one thing if both runs begin identically`,
    );
  }

  let snapped = false;
  if (maxDisagreementM > 0) {
    for (let i = 0; i < treatedPaths.length; i++) {
      const treated = treatedPaths[i] as Float64Array;
      const control = controlPaths[i] as Float64Array;
      control[0] = treated[0] as number;
      control[1] = treated[1] as number;
    }
    snapped = true;
  }

  return Object.freeze({ kind: "reconciliation" as const, maxDisagreementM, snapped });
}

/**
 * Two arms of unequal length are refused rather than trimmed.
 *
 * Trimming to the shorter would move every maximum-style reading — the worst moment, the closest the
 * robot came, the number of near misses — by an amount nobody looking at the answer could see. A run
 * set whose arms ran for different times is a run set with a problem in it, and the right place to
 * fix that is the scenario that produced it.
 */
export function requireSameLength(treatedSteps: number, controlSteps: number): void {
  if (treatedSteps !== controlSteps) {
    fail(
      `one run is ${treatedSteps} samples long and the other is ${controlSteps}; this bench ` +
        `compares them sample by sample, and it will not trim one to fit the other because doing ` +
        `so would quietly change every reading that reports a worst moment`,
    );
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run web/engine/adapter/__tests__/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/engine/adapter/identity.ts web/engine/adapter/reconcile.ts web/engine/adapter/__tests__/
git commit -m "Name adapted people, and meet a third party's arithmetic in one place"
```

---

### Task 5: Build a `MeasuredRun` from a run set

**Files:**
- Create: `web/engine/adapter/build.ts`
- Test: `web/engine/adapter/__tests__/build.test.ts`
- Modify: `web/engine/contracts/trajectory.ts` (correct the stale comment at line 15)

**Interfaces:**
- Consumes: `RunSet`/`RunRecord` (Task 3), `identityFor`/`reconcileInitial`/`requireSameLength`
  (Task 4), `MeasuredRun`/`Bodies` (Task 1).
- Produces: `buildAdapted(set: RunSet): AdaptedRunSet` with
  `{ run: MeasuredRun, zeroRun: MeasuredRun | null, replicates: readonly (readonly Float64Array[])[], bodies: Bodies, dt: number, straightLineM: number, reconciliation: Reconciliation, provenance: Provenance }`.

- [ ] **Step 1: Write the failing test**

Create `web/engine/adapter/__tests__/build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAdapted } from "../build.js";
import { parseRunSet } from "../parse.js";
import { paired } from "../../measure/estimator/index.js";

/** Two people walking straight; the treated arm nudges one of them sideways after the first step. */
function text(nudgeM: number): string {
  const steps = 4;
  const control: number[][] = [[], []];
  const treated: number[][] = [[], []];
  for (let s = 0; s < steps; s++) {
    control[0]!.push(s * 0.5, 1);
    control[1]!.push(s * 0.5, 3);
    treated[0]!.push(s * 0.5, 1 + (s === 0 ? 0 : nudgeM));
    treated[1]!.push(s * 0.5, 3);
  }
  const robot: number[] = [];
  for (let s = 0; s < steps; s++) {
    robot.push(1 + s * 0.4, 2);
  }
  return JSON.stringify({
    mirnTrajectoryFormat: 1,
    scenario: { scenarioId: "s", widthM: 10, heightM: 8, dt: 0.1, nSteps: steps },
    provenance: { producer: "omnisim", producerVersion: "0", simulator: "x", crowdModel: "y", build: "b" },
    bodies: { pedestrianRadiusM: 0.2, robotRadiusM: 0.3 },
    treatment: { kind: "robot-presence" },
    runs: [
      { runId: "t", role: "treated", seed: 7, robotPresent: true,
        completion: { outcome: "reachedGoal", atStep: 2 },
        robot: { positions: robot }, agents: [
          { id: "p-1", positions: treated[0] }, { id: "p-2", positions: treated[1] }] },
      { runId: "c", role: "control", seed: 7, robotPresent: false, completion: null,
        robot: null, agents: [
          { id: "p-1", positions: control[0] }, { id: "p-2", positions: control[1] }] },
    ],
  });
}

describe("building a paired run from a run set", () => {
  it("produces a pair the contract accepts", () => {
    const built = buildAdapted(parseRunSet(text(0.25)));
    expect(built.run.pair.kind).toBe("pairedRun");
    expect(built.run.pair.nSteps).toBe(4);
    expect(built.run.pair.treated.pedestrians.length).toBe(2);
  });

  it("reads exactly nothing when the two arms are identical", () => {
    const built = buildAdapted(parseRunSet(text(0)));
    expect(paired(built.run.pair).value).toBe(0);
  });

  it("reads something when they are not", () => {
    const built = buildAdapted(parseRunSet(text(0.25)));
    expect(paired(built.run.pair).value).toBeGreaterThan(0);
  });

  it("carries the producer's body sizes, not this bench's", () => {
    const built = buildAdapted(parseRunSet(text(0.25)));
    expect(built.bodies.robotRadiusM).toBe(0.3);
    expect(built.bodies.pedRadiusM).toBe(0.2);
  });

  it("carries the finishing sample as the moment the robot arrived", () => {
    const built = buildAdapted(parseRunSet(text(0.25)));
    expect(built.run.treated.arrivedTick).toBe(2);
  });

  it("says the robot never arrived when the run set does not say it did", () => {
    const built = buildAdapted(parseRunSet(text(0.25)));
    expect(built.run.control.arrivedTick).toBe(-1);
  });

  it("names the producer on the scene, so a results file can say who made it", () => {
    const built = buildAdapted(parseRunSet(text(0.25)));
    expect(built.run.pair.treated.source).toContain("omnisim");
  });

  it("refuses a run set with no treated arm", () => {
    const holder = JSON.parse(text(0.25)) as { runs: { role: string }[] };
    holder.runs[0]!.role = "replicate";
    expect(() => buildAdapted(parseRunSet(JSON.stringify(holder)))).toThrow(/treated/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/adapter/__tests__/build.test.ts`
Expected: FAIL — cannot resolve `../build.js`.

- [ ] **Step 3: Write `web/engine/adapter/build.ts`**

```ts
import { makePairedRun, type PairedRun } from "../contracts/pairedRun.js";
import { makeScene, type Scene } from "../contracts/scene.js";
import { makeTrajectory, type Trajectory } from "../contracts/trajectory.js";
import { fail } from "../core/errors.js";
import type { ArmResult } from "../sim/run.js";
import type { Bodies, MeasuredRun } from "../job/report.js";
import { identityFor, type IdentityMap } from "./identity.js";
import { reconcileInitial, requireSameLength, type Reconciliation } from "./reconcile.js";
import type { Provenance, RunRecord, RunRole, RunSet } from "./schema.js";

/**
 * A run set, assembled into the shapes the measurement layer already speaks.
 *
 * Nothing here computes a reading. It maps names, checks the invariants a pair rests on, and hands
 * back a `MeasuredRun` — the same record `runPair` produces, minus a `RunConfig` it never had. The
 * rulers downstream are then exactly the ones this bench already ships, which is the point: a run
 * from somewhere else is measured with the same arithmetic, or the comparison means nothing.
 */

export interface AdaptedRunSet {
  readonly kind: "adaptedRunSet";
  readonly run: MeasuredRun;
  /** The pair in which nobody responded to the robot, if the run set carried one. */
  readonly zeroRun: MeasuredRun | null;
  /** Robot-absent runs differing only in noise, for a run-to-run band. Empty if none were given. */
  readonly replicates: readonly (readonly Float64Array[])[];
  readonly bodies: Bodies;
  readonly dt: number;
  readonly straightLineM: number;
  readonly reconciliation: Reconciliation;
  readonly provenance: Provenance;
}

function only(set: RunSet, role: RunRole): RunRecord | null {
  let found: RunRecord | null = null;
  for (const run of set.runs) {
    if (run.role === role) {
      if (found !== null) {
        fail(`this run set carries two runs playing the part '${role}', and it may carry one`);
      }
      found = run;
    }
  }
  return found;
}

function requireRole(set: RunSet, role: RunRole): RunRecord {
  const found = only(set, role);
  if (found === null) {
    fail(`this run set carries no run playing the part '${role}', so there is no pair in it`);
  }
  return found;
}

/** Paths in uid order, which is what `ArmResult.positions` means. */
function pathsInUidOrder(record: RunRecord, identity: IdentityMap): Float64Array[] {
  const byUid = new Map<number, Float64Array>();
  for (const agent of record.agents) {
    byUid.set(identity.agentUidOf(agent.id), agent.path.positions);
  }
  const paths: Float64Array[] = [];
  for (let uid = 0; uid < identity.orderedIds.length; uid++) {
    const path = byUid.get(uid);
    if (path === undefined) {
      fail(
        `the run '${record.runId}' is missing somebody the other run has, so the two runs are not ` +
          `the same room`,
      );
    }
    paths.push(path);
  }
  return paths;
}

function armFrom(
  record: RunRecord,
  identity: IdentityMap,
  dt: number,
  producer: string,
  paths: readonly Float64Array[],
): ArmResult {
  const pedestrians: Trajectory[] = [];
  for (let uid = 0; uid < identity.orderedIds.length; uid++) {
    pedestrians.push(
      makeTrajectory({
        agentId: identity.agentIdOf(identity.orderedIds[uid] as string),
        agentUid: uid,
        positions: paths[uid] as Float64Array,
        t0: 0,
        dt,
      }),
    );
  }

  let robotTrajectory: Trajectory | null = null;
  let robotPositions: Float64Array | null = null;
  if (record.robot !== null) {
    robotPositions = record.robot.positions;
    robotTrajectory = makeTrajectory({
      agentId: "robot",
      agentUid: -1,
      positions: robotPositions,
      t0: 0,
      dt,
    });
  }

  const scene: Scene = makeScene({
    sceneId: record.runId,
    pedestrians,
    robot: robotTrajectory,
    robotPresent: record.robotPresent,
    // The hole `Scene.source` was always for. Anything carrying results names what produced them.
    source: producer,
    seed: record.seed,
  });

  let arrivedTick = -1;
  if (record.completion !== null) {
    arrivedTick = record.completion.atStep;
  }

  return { scene, positions: paths, robotPositions, arrivedTick };
}

function pairFrom(
  set: RunSet,
  treatedRecord: RunRecord,
  controlRecord: RunRecord,
  identity: IdentityMap,
): { run: MeasuredRun; reconciliation: Reconciliation } {
  const treatedPaths = pathsInUidOrder(treatedRecord, identity);
  const controlPaths = pathsInUidOrder(controlRecord, identity);

  for (let uid = 0; uid < treatedPaths.length; uid++) {
    requireSameLength(
      (treatedPaths[uid] as Float64Array).length / 2,
      (controlPaths[uid] as Float64Array).length / 2,
    );
  }
  const reconciliation = reconcileInitial(treatedPaths, controlPaths);

  const producer = set.provenance.producer;
  const treated = armFrom(treatedRecord, identity, set.scenario.dt, producer, treatedPaths);
  const control = armFrom(controlRecord, identity, set.scenario.dt, producer, controlPaths);
  const pair: PairedRun = makePairedRun({
    treated: treated.scene,
    control: control.scene,
    treatment: set.treatment,
  });

  return { run: { pair, treated, control }, reconciliation };
}

export function buildAdapted(set: RunSet): AdaptedRunSet {
  const treatedRecord = requireRole(set, "treated");
  const controlRecord = requireRole(set, "control");

  const externalIds: string[] = [];
  for (const agent of treatedRecord.agents) {
    externalIds.push(agent.id);
  }
  const identity = identityFor(externalIds);

  const built = pairFrom(set, treatedRecord, controlRecord, identity);

  let zeroRun: MeasuredRun | null = null;
  const zeroTreated = only(set, "zeroTreated");
  const zeroControl = only(set, "zeroControl");
  if (zeroTreated !== null && zeroControl !== null) {
    zeroRun = pairFrom(set, zeroTreated, zeroControl, identity).run;
  } else if (zeroTreated !== null || zeroControl !== null) {
    fail(
      "this run set carries one half of the pair in which nobody responds to the robot, and that " +
        "pair is only a reference if both halves of it are here",
    );
  }

  const replicates: (readonly Float64Array[])[] = [];
  for (const record of set.runs) {
    if (record.role === "replicate") {
      replicates.push(pathsInUidOrder(record, identity));
    }
  }

  // The shortest crossing the robot could have made, used to give its journey a scale. Read off the
  // robot's own first and last recorded positions, because a run set carries no goal.
  let straightLineM = 0;
  const robotPath = built.run.treated.robotPositions;
  if (robotPath !== null) {
    const lastX = robotPath[robotPath.length - 2] as number;
    const lastY = robotPath[robotPath.length - 1] as number;
    const dx = lastX - (robotPath[0] as number);
    const dy = lastY - (robotPath[1] as number);
    straightLineM = Math.sqrt(dx * dx + dy * dy);
  }

  return Object.freeze({
    kind: "adaptedRunSet" as const,
    run: built.run,
    zeroRun,
    replicates: Object.freeze(replicates),
    bodies: Object.freeze({
      kind: "bodies" as const,
      robotRadiusM: set.bodies.robotRadiusM,
      pedRadiusM: set.bodies.pedRadiusM,
    }),
    dt: set.scenario.dt,
    straightLineM,
    reconciliation: built.reconciliation,
    provenance: set.provenance,
  });
}
```

- [ ] **Step 4: Correct the stale comment in `web/engine/contracts/trajectory.ts`**

Line 15 currently claims the `ped`/`inj`/`robot` naming is "asserted below and on the Python side".
It is not — `makeTrajectory` enforces only `AGENT_ID_PATTERN`. Replace that clause with:

```
 *    the Python side, is that `agentId === "ped" + uid` for base agents, `"inj" + uid` for
 *    injected ones, and `"robot"` for uid -1. That is a CONVENTION the producers keep, not an
 *    assertion this factory makes: only the charset is enforced, which is what lets
 *    `web/engine/adapter/` mint `ext0`, `ext1`, ... for people a different simulator named.
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run web/engine/adapter/`
Expected: PASS, 8 build tests plus Tasks 3 and 4's.

- [ ] **Step 6: Commit**

```bash
git add web/engine/adapter/build.ts web/engine/adapter/__tests__/build.test.ts web/engine/contracts/trajectory.ts
git commit -m "Assemble an adapted run set into the paired contract"
```

---

### Task 6: The disclosure for a third kind of number

**Files:**
- Create: `web/engine/adapter/disclosure.ts`
- Test: `web/engine/adapter/__tests__/disclosure.test.ts`

**Interfaces:**
- Consumes: `Provenance` (Task 3).
- Produces: `EXTERNAL_CROWD_DISCLOSURE`, `EXTERNAL_DISCLOSURE_CLAUSES`,
  `producedByLine(provenance): string`.

- [ ] **Step 1: Write the failing test**

Create `web/engine/adapter/__tests__/disclosure.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";
import {
  EXTERNAL_CROWD_DISCLOSURE, EXTERNAL_DISCLOSURE_CLAUSES, producedByLine,
} from "../disclosure.js";

describe("what a reading off somebody else's simulator has to say", () => {
  it("says the crowd was simulated by a simulator this bench did not write", () => {
    expect(EXTERNAL_CROWD_DISCLOSURE).toContain("did not write");
  });

  it("says this bench has not checked that simulator's physics", () => {
    expect(EXTERNAL_CROWD_DISCLOSURE.toLowerCase()).toMatch(/has not (checked|characterised)/);
  });

  it("says a number here describes that simulator and not robots or people", () => {
    const lower = EXTERNAL_CROWD_DISCLOSURE.toLowerCase();
    expect(lower).toContain("not a measurement of");
  });

  it("carries every clause it claims to carry", () => {
    for (const clause of EXTERNAL_DISCLOSURE_CLAUSES) {
      expect(EXTERNAL_CROWD_DISCLOSURE).toContain(clause);
    }
  });

  it("is not the invented-crowd sentence wearing a hat", () => {
    // Asserted by absence rather than by importing `web/app/console/csv.ts`: this suite runs in
    // the DOM-free engine project, and reaching into the console layer from here would couple the
    // two. The clause below is the one the invented-crowd sentence carries and this one must not.
    expect(EXTERNAL_CROWD_DISCLOSURE).not.toContain("invented model of pedestrians");
  });

  it("names the producer without naming a variable at anybody", () => {
    const line = producedByLine({
      kind: "provenance", producer: "omnisim", producerVersion: "1.2",
      simulator: "a walker", crowdModel: "a crowd", build: "abc123",
    });
    expect(line).toContain("omnisim");
    expect(line).toContain("abc123");
    expect(line).not.toMatch(CODE_IDENTIFIER);
  });

  it("puts no code identifier in front of a reader", () => {
    expect(EXTERNAL_CROWD_DISCLOSURE).not.toMatch(CODE_IDENTIFIER);
  });

  it("puts no bare figure in front of a reader", () => {
    expect(EXTERNAL_CROWD_DISCLOSURE).not.toMatch(/\d/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/engine/adapter/__tests__/disclosure.test.ts`
Expected: FAIL — cannot resolve `../disclosure.js`.

- [ ] **Step 3: Write `web/engine/adapter/disclosure.ts`**

```ts
import type { Provenance } from "./schema.js";

/**
 * The third kind of number, and why the two sentences this bench already has will not do.
 *
 * Guardrail 1 keeps two kinds apart. A reading about this bench's own crowd carries
 * `INVENTED_CROWD_DISCLOSURE`: the crowd is invented, and no number is a measurement of real
 * pedestrians. A goodness-of-fit figure has real people on one side and carries `FIT_DISCLOSURE`,
 * which says so in three clauses.
 *
 * A reading off another simulator is NEITHER. Reusing the invented-crowd sentence would be almost
 * right and wrong in the direction that matters: it says the crowd is invented, which is true, and
 * it implies this bench invented it and therefore knows what it is. It does not. It has not read
 * that simulator's physics, cannot reproduce it, and has run no property test against it.
 *
 * The third clause is the load-bearing one, for the reason guardrail 1 already gives about fitting:
 * a reader shown output from a real robotics simulator is exactly the reader most likely to believe
 * the next number they see. A toy that looks like an instrument is the hazard, and somebody else's
 * engine looks a great deal more like an instrument than a sketch of a crowd does.
 */
export const EXTERNAL_CROWD_DISCLOSURE =
  "This crowd was simulated by a simulator this bench did not write. It has not checked that " +
  "simulator's physics and cannot vouch for it, so what appears here is a reading about that " +
  "simulator and not a measurement of real people or of any real robot. What is this bench's own " +
  "is the ruler: the same room is run twice, once with a robot and once without, from the same " +
  "starting positions, and the difference between a person's two paths is the robot's effect on " +
  "them.";

/** The parts that carry the obligation, checked one at a time rather than as a whole sentence. */
export const EXTERNAL_DISCLOSURE_CLAUSES: readonly string[] = Object.freeze([
  "simulated by a simulator this bench did not write",
  "has not checked that simulator's physics",
  "not a measurement of real people or of any real robot",
]);

/** The line a results file carries naming what produced its rows. */
export function producedByLine(provenance: Provenance): string {
  return (
    `produced by ${provenance.producer} (version ${provenance.producerVersion}, build ` +
    `${provenance.build}), running ${provenance.simulator} with the crowd it calls ` +
    `${provenance.crowdModel}`
  );
}
```

If the identifier scan fails on a real word, adjust the wording rather than the pattern — the
pattern is guardrail 12's and is shared.

- [ ] **Step 4: Run tests**

Run: `npx vitest run web/engine/adapter/__tests__/disclosure.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add web/engine/adapter/disclosure.ts web/engine/adapter/__tests__/disclosure.test.ts
git commit -m "Say what a reading off somebody else's simulator is a reading of"
```

---

### Task 7: The gate — a run set MIRN produced, measured as if it came from elsewhere

**Files:**
- Create: `web/engine/adapter/__tests__/fixtures/makeFixture.ts`
- Create: `web/engine/adapter/__tests__/endToEnd.slow.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: nothing. This is the gate.

The fixture is **generated from MIRN's own simulator** rather than hand-written, so the expected
answers are known independently and the test proves the round trip rather than proving the fixture.

- [ ] **Step 1: Write the fixture generator**

Create `web/engine/adapter/__tests__/fixtures/makeFixture.ts`:

```ts
import { makeRunConfig, SIM_CONSTANTS, type RunConfig } from "../../../contracts/config.js";
import { runPair, type ArmResult } from "../../../sim/run.js";
import { FORMAT_VERSION } from "../../schema.js";

/**
 * A run set in the interchange format, produced by this bench's own simulator.
 *
 * Written this way round on purpose. Hand-writing a fixture would test the parser against whatever
 * the fixture's author believed; running the real simulator and re-reading its output through the
 * adapter tests the ROUND TRIP, and the answers on the far side are ones the simulator can be asked
 * for directly and compared against.
 *
 * The identifiers are deliberately awkward — hyphens and capitals, which `makeTrajectory` refuses —
 * so the naming layer is exercised rather than bypassed.
 */
function armToRuns(arm: ArmResult, runId: string, role: string, seed: number): unknown {
  const agents: unknown[] = [];
  for (let i = 0; i < arm.positions.length; i++) {
    agents.push({ id: `Walker-${i}`, positions: Array.from(arm.positions[i] as Float64Array) });
  }
  let robot: unknown = null;
  if (arm.robotPositions !== null) {
    robot = { positions: Array.from(arm.robotPositions) };
  }
  let completion: unknown = null;
  if (arm.arrivedTick >= 0) {
    completion = { outcome: "reachedGoal", atStep: arm.arrivedTick + 1 };
  }
  return {
    runId,
    role,
    seed,
    robotPresent: arm.robotPositions !== null,
    completion,
    robot,
    agents,
  };
}

export function fixtureText(config: RunConfig = makeRunConfig({ nTicks: 120, crowd: { nPedestrians: 8 } })): string {
  const real = runPair(config);
  const blind = runPair(makeRunConfig({ ...config, pedestriansSeeRobot: false }));

  const runs: unknown[] = [
    armToRuns(real.treated, "treated", "treated", config.seed),
    armToRuns(real.control, "control", "control", config.seed),
    armToRuns(blind.treated, "zero-treated", "zeroTreated", config.seed),
    armToRuns(blind.control, "zero-control", "zeroControl", config.seed),
  ];

  return JSON.stringify({
    mirnTrajectoryFormat: FORMAT_VERSION,
    scenario: {
      scenarioId: "round-trip",
      widthM: config.widthM,
      heightM: config.heightM,
      dt: config.dt,
      nSteps: config.nTicks + 1,
    },
    provenance: {
      producer: "this bench, pretending to be somewhere else",
      producerVersion: "0",
      simulator: "the social-force sketch",
      crowdModel: config.crowdModel,
      build: "round-trip",
    },
    bodies: {
      pedestrianRadiusM: SIM_CONSTANTS.pedRadiusM,
      robotRadiusM: SIM_CONSTANTS.robotRadiusM,
    },
    treatment: { kind: "robot-presence" },
    runs,
  });
}
```

- [ ] **Step 2: Write the gate**

Create `web/engine/adapter/__tests__/endToEnd.slow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAdapted } from "../build.js";
import { parseRunSet } from "../parse.js";
import { fixtureText } from "./fixtures/makeFixture.js";
import { buildContext, runReport, type MeasurementParams } from "../../job/report.js";
import { makeRunConfig } from "../../contracts/config.js";
import { runPair } from "../../sim/run.js";
import { paired } from "../../measure/estimator/index.js";
import { contextInitFromConfig } from "../../job/simContext.js";

const PARAMS: MeasurementParams = Object.freeze({
  kind: "measurementParams" as const,
  forecastHorizonSteps: 30,
  forecastEndStep: 100,
  nearMissThresholdM: 0.75,
  recoveryToleranceFraction: 0.2,
  recoveryDwellSteps: 10,
});

describe("a run set read back in measures what it measured before", () => {
  const config = makeRunConfig({ nTicks: 120, crowd: { nPedestrians: 8 } });
  const built = buildAdapted(parseRunSet(fixtureText(config)));

  it("reads the same effect as running it here", () => {
    const direct = runPair(config);
    expect(paired(built.run.pair).value).toBe(paired(direct.pair).value);
  });

  // THE GATE. A world in which nobody responds to the robot has a true effect of exactly nothing,
  // and two arms that differ nowhere give exactly nothing back. Any other value means an identity
  // was mis-mapped, a sample was misaligned, or precision was lost on the way through the file.
  // `toBe`, never `toBeCloseTo`: the exactness is available, so inexactness is a defect.
  it("reads EXACTLY nothing on the pair in which nobody responded to the robot", () => {
    expect(built.zeroRun).not.toBeNull();
    expect(paired((built.zeroRun as NonNullable<typeof built.zeroRun>).pair).value).toBe(0);
  });

  it("reads something on the pair in which they did, so the gate is not passed by reading nought", () => {
    expect(paired(built.run.pair).value).toBeGreaterThan(0);
  });

  it("reports through the ordinary column machinery, with the producer's bodies", () => {
    const context = buildContext({
      dt: built.dt,
      bodies: built.bodies,
      straightLineM: built.straightLineM,
      params: PARAMS,
      run: built.run,
      band: null,
      floor: null,
      zeroRun: built.zeroRun,
      frechetMeanM: null,
    });
    const report = runReport(context, [
      "trueEffectM", "worstMomentM", "forecastReportM", "forecastZeroM",
      "robotPathM", "robotArrivalS", "minClearanceM", "nearMissEpisodes", "runToRunBandM",
    ]);

    expect(report.trueEffectM?.availability.kind).toBe("measured");
    expect(report.worstMomentM?.availability.kind).toBe("measured");
    expect(report.forecastReportM?.availability.kind).toBe("measured");
    expect(report.forecastZeroM?.availability.kind).toBe("measured");
    expect(report.robotPathM?.availability.kind).toBe("measured");
    expect(report.robotArrivalS?.availability.kind).toBe("measured");
    expect(report.minClearanceM?.availability.kind).toBe("measured");
    expect(report.nearMissEpisodes?.availability.kind).toBe("measured");
  });

  it("says the run-to-run band was not measured rather than inventing a floor", () => {
    const context = buildContext({
      dt: built.dt, bodies: built.bodies, straightLineM: built.straightLineM,
      params: PARAMS, run: built.run, band: null, floor: null,
      zeroRun: built.zeroRun, frechetMeanM: null,
    });
    const report = runReport(context, ["runToRunBandM"]);
    expect(report.runToRunBandM?.availability.kind).toBe("notApplicable");
    expect(Number.isNaN(report.runToRunBandM?.value ?? 0)).toBe(true);
  });

  it("agrees with the simulator about how far the robot travelled", () => {
    const direct = runPair(config);
    const context = buildContext({
      dt: built.dt, bodies: built.bodies, straightLineM: built.straightLineM,
      params: PARAMS, run: built.run, band: null, floor: null,
      zeroRun: built.zeroRun, frechetMeanM: null,
    });
    const here = runReport(context, ["robotPathM"]).robotPathM?.value;

    const there = runReport(
      buildContext({
        ...contextInitFromConfig(config),
        params: PARAMS, run: direct, band: null, floor: null,
        zeroRun: null, frechetMeanM: null,
      }),
      ["robotPathM"],
    ).robotPathM?.value;

    expect(here).toBe(there);
  });
});
```

- [ ] **Step 3: Run the gate**

Run: `npx vitest run web/engine/adapter/__tests__/endToEnd.slow.test.ts`
Expected: PASS, 6 tests. **If the zero pair does not read exactly `0`, stop.** Do not loosen the
assertion — `toBe(0)` is the gate, and a `toBeCloseTo` here destroys it the same way loosening the
placebo tolerance would. Debug the identity map, the sample alignment, or the number formatting in
`JSON.stringify` (a `Float64Array` value that does not round-trip through decimal text is the most
likely cause, and if that is it, the fix is a different serialisation, not a looser test).

- [ ] **Step 4: Run everything**

Run: `npm run typecheck && npm run test`
Expected: PASS. Test count is now **1173 + the new tests**; record the actual number.

- [ ] **Step 5: Update `CLAUDE.md`**

Add to the commands section's test count, and add to guardrail 11 a paragraph recording the
2026-09-09 decision, in the register the 2026-08-27 amendment uses: what was lifted, by whom, when,
and the reasoning — that a corridor cannot be filmed twice but a simulator can be run twice, so the
refusal governing `web/fit.html` does not transfer, and that no physics-engine dependency is created
because MIRN parses numbers another process wrote. Add `web/engine/adapter/` to the layout, and add
`endToEnd.slow.test.ts` to the list of `.slow.test.ts` files the fast cut drops.

- [ ] **Step 6: Commit**

```bash
git add web/engine/adapter/__tests__/ CLAUDE.md
git commit -m "Gate the adapter on a world whose answer is exactly nothing"
```

---

## Self-Review

**Spec coverage.** Decoupling → Task 1. `bandFrom` → Task 2. Format, version stamp and roles →
Task 3. Identity, tolerance/snap, length rejection, completion → Tasks 4 and 5. Third disclosure →
Task 6. The gate → Task 7. `Scene.source` as backend identity → Task 5. Stale `trajectory.ts`
comment → Task 5. Guardrail 11 amendment → Task 7 Step 5.

**Deliberately deferred, and named in the spec's "What this does not build":** no sixth page, no
console control, no axis, no permalink field, no Python adapter, no `cost.ts` change. The
`producedByLine` helper from Task 6 has no caller until a surface exists; that is intentional and
it is tested directly.

**Known risk.** Task 7's round-trip goes through `JSON.stringify` of `Float64Array` values. If
decimal round-tripping loses a bit, the exact-equality assertions in Steps 3's first and last tests
will fail. That is the gate doing its job. The remedy is a serialisation that round-trips exactly —
not a loosened assertion.
