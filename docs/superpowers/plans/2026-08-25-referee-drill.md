# Referee Drill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eight cards where the control arm is withheld, the reader calls whether the robot disturbed anyone, and then finds out — because the truth is known by construction.

**Architecture:** No new estimators, no new parity fixtures, no new dependency, no storage. The arena already supports the withheld view through `showControl` and `showGaps`. The work is a closed card catalogue in the style of `AXES`, a withheld tile variant, a state machine, and a verdict.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest, Vite, jsdom for DOM tests. No new packages.

**Spec:** `docs/superpowers/specs/2026-08-25-referee-drill-design.md`

## Global Constraints

- **No server, no backend, no account, no persistence beyond the URL** — including `localStorage`, `sessionStorage`, `IndexedDB`. `web/app/console/__tests__/nostorage.test.ts` greps for these and must stay green.
- **The invented-crowd disclosure precedes every number in document order**, on every drill screen.
- **Never show a perturbation number without saying what it would read if the answer were zero.** Withholding a *value* is allowed. Showing a value with no zero is not.
- **Raw metres never appear alone** — always beside a body-scale anchor, a zero-effect floor, or the run-to-run band.
- **No bare code identifier on any surface a reader sees.** Plain English, defined at first use.
- **Guardrail 11 stands unamended.** The card table is closed. No user-defined card, no method import path, no dataset loader, no leaderboard.
- **Determinism:** every stochastic path takes an explicit seed. `Math.random` throws in the engine test suite.
- **The Python side is untouched:** `src/mirn/`, `tests/`, `pyproject.toml`, `tests/golden/parity/`.
- **No numeric literal in console copy.** Every zero line and band figure renders from the cell on screen.
- Write the test with the implementation, in the same commit.

## Two corrections to the spec, already established

1. **The spec's list of five "unpaired" readouts is wrong.** `recoveryS` is computed from
   `ctx.deviation.series` and `ctx.deviation.maxM` — the paired treated-versus-control quantity — so
   putting it on a withheld card leaks the answer. `pedestrianTimeLostS` likewise reports on "both
   versions of the room". Task 2 establishes the real list mechanically rather than by reading.
2. **The arena needs no new mode.** `ArenaView` already carries `showControl` and `showGaps`, and
   `web/ui/arena.ts` gates every control mark and every gap segment on them (lines 226, 239, 257).
   Withheld mode is `showControl: false, showGaps: false`.

---

### Task 1: Measure whether the cards exist — THE KILL GATE

**Files:**
- Create: `scripts/drill-cards.ts` (a measurement script, not shipped UI)
- Create: `docs/superpowers/notes/2026-08-25-drill-card-census.md` (the findings)

**Interfaces:**
- Consumes: `makeRunConfig` from `web/engine/contracts/config.js`, `runPair` from `web/engine/sim/run.js`, `paired` and `cvmResidual` from `web/engine/measure/estimator/index.js`, `replicateBand` from `web/engine/measure/null/band.js`, `splitHalfNull` and `seededPermutations` from `web/engine/measure/null/splitHalf.js`.
- Produces: a census of how many fooling cards exist. Nothing downstream imports this script.

**This task can cancel the whole plan.** The drill needs roughly four cards where the true effect is
below the floor while the forecaster clears the band, and roughly four the other way. Nobody has
checked that such cards are reachable inside the panel's own slider ranges at a crowd size that runs
in a browser.

**Kill criterion: fewer than four of each, and you stop.** Report the census and do not start Task 2.
That is a real stop. Do not widen the ranges beyond what the panel's own sliders allow in order to
find cards — a card the reader cannot reach by moving a control is not a card.

- [ ] **Step 1: Read the axis ranges you are allowed to sweep**

Run: `sed -n '1,240p' web/engine/job/axes.ts`

Every card must be expressible as values inside the `min`/`max`/`step` of these axes. Note the
query keys too (`people`, `pace`, `fidget`, `space`, `robot_speed`, `reaction`, `berth`, `mis_sees`,
`offset`, `episode`, `horizon`, `window_end`, `hold_line`) — Task 8 needs them.

- [ ] **Step 2: Write the census script**

Create `scripts/drill-cards.ts`:

```ts
import { makeRunConfig, DEFAULT_CONFIG, type RunConfig } from "../web/engine/contracts/config.js";
import { runPair } from "../web/engine/sim/run.js";
import { paired, cvmResidual } from "../web/engine/measure/estimator/index.js";
import { replicateBand } from "../web/engine/measure/null/band.js";
import { splitHalfNull, seededPermutations } from "../web/engine/measure/null/splitHalf.js";

/**
 * Does the drill have cards?
 *
 * A card only teaches if the reader can be wrong on it. Two shapes qualify:
 *   FALSE POSITIVE — the robot's true effect is below what this room could resolve, and the
 *     forecaster still reports more than two runs of the room differ by. A reader trusting the
 *     forecaster calls "bigger" and is wrong.
 *   FALSE NEGATIVE — the true effect is comfortably above the floor, and the forecaster reports
 *     less than the band. A reader trusting the forecaster calls "smaller" and is wrong.
 *
 * Everything else is a card where the confounded number happens to agree with the truth, which
 * teaches nothing and must not be shipped as though it did.
 */

interface Cell {
  readonly label: string;
  readonly seed: number;
  readonly people: number;
  readonly pace: number;
  readonly fidget: number;
  readonly space: number;
  readonly horizonSteps: number;
  readonly windowEndStep: number;
  readonly trueEffect: number;
  readonly forecast: number;
  readonly band: number;
  readonly floor: number;
  readonly shape: "false positive" | "false negative" | "agrees" | "unusable";
}

const SEEDS = [20260816, 1, 7, 424242, 99991, 31337, 8675309, 2718281];

// Values on the axes' own step grids. Nothing here is outside a slider's reach.
const PEOPLE = [4, 14, 24, 34, 44];
const PACE = [0.4, 0.9, 1.34, 1.8];
const FIDGET = [0, 1.1, 3];
const SPACE = [0, 1, 2, 3];
const HORIZON_S = [0.2, 1, 2, 3];
const WINDOW_END_S = [5, 10, 15, 20];

function measure(
  label: string,
  seed: number,
  people: number,
  pace: number,
  fidget: number,
  space: number,
  horizonS: number,
  windowEndS: number,
): Cell {
  const config: RunConfig = makeRunConfig({
    seed,
    crowd: { nPedestrians: people, desiredSpeed: pace, noiseAmplitude: fidget },
    robot: { repulsionScale: space },
  });
  const run = runPair(config, () => 0);
  const trueEffect = paired(run.pair).value;
  const dt = config.dt;
  const horizonSteps = Math.round(horizonS / dt);
  const windowEndStep = Math.round(windowEndS / dt);
  const forecast = cvmResidual(run.pair, horizonSteps, windowEndStep).value;
  const band = replicateBand(config, 8).value;
  // Exactly what web/engine/job/runner.ts does: the control arm, 200 splits, stride 20.
  const floor = splitHalfNull(run.control.positions, 200, seededPermutations(seed), 0.05, 20).floor;

  let shape: Cell["shape"];
  if (!Number.isFinite(trueEffect) || !Number.isFinite(forecast)) {
    shape = "unusable";
  } else if (trueEffect < floor && forecast > band) {
    shape = "false positive";
  } else if (trueEffect > floor && forecast < band) {
    shape = "false negative";
  } else {
    shape = "agrees";
  }

  return {
    label, seed, people, pace, fidget, space,
    horizonSteps, windowEndStep,
    trueEffect, forecast, band, floor, shape,
  };
}

const cells: Cell[] = [];
for (const seed of SEEDS) {
  for (const people of PEOPLE) {
    for (const pace of PACE) {
      for (const fidget of FIDGET) {
        for (const space of SPACE) {
          for (const horizonS of HORIZON_S) {
            for (const windowEndS of WINDOW_END_S) {
              const label = `n${people} pace${pace} fidget${fidget} space${space} h${horizonS} w${windowEndS}`;
              cells.push(measure(label, seed, people, pace, fidget, space, horizonS, windowEndS));
            }
          }
        }
      }
    }
  }
}

const falsePositives = cells.filter((c) => c.shape === "false positive");
const falseNegatives = cells.filter((c) => c.shape === "false negative");

console.log(`cells measured: ${cells.length}`);
console.log(`false positives: ${falsePositives.length}`);
console.log(`false negatives: ${falseNegatives.length}`);
console.log(`agrees:          ${cells.filter((c) => c.shape === "agrees").length}`);
console.log(`unusable:        ${cells.filter((c) => c.shape === "unusable").length}`);
console.log("");
console.log("worlds (not seeds) yielding false positives:");
const fpWorlds = new Set(falsePositives.map((c) => c.label));
for (const w of [...fpWorlds].slice(0, 20)) { console.log(`  ${w}`); }
console.log("");
console.log("worlds yielding false negatives:");
const fnWorlds = new Set(falseNegatives.map((c) => c.label));
for (const w of [...fnWorlds].slice(0, 20)) { console.log(`  ${w}`); }
console.log("");
console.log("csv");
console.log("shape,seed,people,pace,fidget,space,horizonSteps,windowEndStep,trueEffect,forecast,band,floor");
for (const c of cells) {
  console.log(
    `${c.shape},${c.seed},${c.people},${c.pace},${c.fidget},${c.space},${c.horizonSteps},` +
      `${c.windowEndStep},${c.trueEffect.toFixed(4)},${c.forecast.toFixed(4)},` +
      `${c.band.toFixed(4)},${c.floor.toFixed(4)}`,
  );
}
```

- [ ] **Step 3: Run it**

Run: `npx vite-node scripts/drill-cards.ts > /tmp/drill-census.txt 2>&1; tail -40 /tmp/drill-census.txt`

Expected: a census. This grid is 8 seeds × 5 × 4 × 3 × 4 × 4 × 4 = 30,720 cells and each one runs
the simulator plus an eight-replicate band plus a 200-split floor. **That will take far too long.**

Restructure before running: the band and the floor depend only on `(seed, people, pace, fidget,
space)` and not on the two ruler settings, so compute them once per world and reuse them across the
16 ruler combinations. The true effect likewise. Only `cvmResidual` needs recomputing per ruler
setting, and it is cheap. Make that change, then run.

If it still takes more than ten minutes, cut `SEEDS` to four and say so in the census.

- [ ] **Step 4: Judge the census against the kill criterion**

Count **distinct worlds** — not cells — that yield a false positive, and distinct worlds that yield a
false negative. A world that only fools on one seed of eight is not a card; the drill shows one seed
and the reader gets whatever that seed does.

Require: **at least 4 distinct worlds of each shape, each of which holds on a majority of seeds.**

- [ ] **Step 5: Write the census note**

Create `docs/superpowers/notes/2026-08-25-drill-card-census.md` with: the grid swept, the counts by
shape, the candidate worlds with their numbers, whether the kill criterion is met, and — if it is
not — which direction the shortfall lies in. If there are plenty of false positives and no false
negatives, say so plainly; that is a finding about the estimator, not a failure of the search.

- [ ] **Step 6: Commit**

```bash
git add scripts/drill-cards.ts docs/superpowers/notes/2026-08-25-drill-card-census.md
git commit -m "Measure whether the drill has cards before building it

The drill needs worlds where a reader trusting the forecaster is wrong, in both
directions. Nobody had checked such worlds are reachable inside the panel's own
slider ranges, and a drill of cards where the confounded number happens to agree
with the truth teaches nothing while looking like it does."
```

- [ ] **Step 7: STOP and report**

Report the census to the controller before starting Task 2, whichever way it came out. If the kill
criterion is not met, the plan ends here and the Method Card is the alternative.

---

### Task 2: Prove which readouts a real corridor could produce

**Files:**
- Create: `web/engine/job/__tests__/unpaired.test.ts`
- Modify: `web/engine/job/columns.ts` (add one field to the descriptor)

**Interfaces:**
- Consumes: `COLUMNS`, `COLUMN_ORDER`, `ColumnKey` from `web/engine/job/columns.js`; `buildContext` and `runReport` from `web/engine/job/report.js`.
- Produces: a `corridorReadable: boolean` field on every column descriptor, and a test that proves each value is honest.

The drill's whole safety property is that a withheld card shows only numbers a real corridor could
have produced. Reading the extract functions and making a list is how that gets quietly wrong — the
spec already did exactly that and put `recoveryS` on the list, which is computed from the paired
deviation series.

So the flag is **proved, not asserted**: compute each column against the real run, then against a run
whose control arm has been replaced with a decoy, and see whether the value moves. A column that
does not notice the swap could have been computed without a control run.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/unpaired.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COLUMNS, COLUMN_ORDER } from "../columns.js";
import { buildContext, runReport } from "../report.js";
import { makeRunConfig } from "../../contracts/config.js";
import { runPair } from "../../sim/run.js";
import { DEFAULT_PARAMS } from "../spec.js";

/**
 * A withheld card may show only numbers a real corridor could have produced.
 *
 * In a corridor the second run does not exist, so any measurement that reads the control arm is
 * unavailable there — and showing one on a card would hand the reader the answer they are being
 * asked to guess. Which measurements those are is not obvious from their names: "how long until
 * the crowd was back inside tolerance" sounds like a property of the crowd, and is in fact
 * computed from the paired deviation series.
 *
 * So this proves it rather than trusting a list. Each column is computed twice — once against the
 * real pair, once against a pair whose control arm has been swapped for a decoy from a different
 * seed. A column that returns the same value both times never looked at the control arm.
 */

const CONFIG = makeRunConfig({ crowd: { nPedestrians: 12 } });
const DECOY = makeRunConfig({ seed: CONFIG.seed + 9999, crowd: { nPedestrians: 12 } });

function readingsWith(controlFrom: typeof CONFIG): Map<string, number> {
  const real = runPair(CONFIG, () => 0);
  const decoy = runPair(controlFrom, () => 0);
  const swapped = {
    ...real,
    control: decoy.control,
    pair: { ...real.pair, control: decoy.control },
  };
  const ctx = buildContext(swapped as typeof real, DEFAULT_PARAMS, null, null, null);
  const report = runReport(ctx);
  const out = new Map<string, number>();
  for (const key of COLUMN_ORDER) {
    const reading = report.get(key);
    if (reading !== undefined && reading.kind === "measured") {
      out.set(key, reading.value);
    }
  }
  return out;
}

describe("which readouts a real corridor could produce", () => {
  it("every column declares whether it can be read without a control run", () => {
    for (const key of COLUMN_ORDER) {
      const column = COLUMNS[key];
      expect(typeof column.corridorReadable, `${key} must declare it`).toBe("boolean");
    }
  });

  it("a column that claims to need no control run does not notice the control arm changing", () => {
    const withReal = readingsWith(CONFIG);
    const withDecoy = readingsWith(DECOY);

    for (const key of COLUMN_ORDER) {
      const column = COLUMNS[key];
      if (!column.corridorReadable) {
        continue;
      }
      const a = withReal.get(key);
      const b = withDecoy.get(key);
      if (a === undefined || b === undefined) {
        continue;
      }
      expect(a, `${key} claims to need no control run but its value moved when the control arm was swapped`).toBe(b);
    }
  });

  it("a column that claims to need a control run does notice", () => {
    // The converse, so the flag cannot be made vacuous by setting everything to false.
    const withReal = readingsWith(CONFIG);
    const withDecoy = readingsWith(DECOY);
    let noticed = 0;
    for (const key of COLUMN_ORDER) {
      if (COLUMNS[key].corridorReadable) {
        continue;
      }
      const a = withReal.get(key);
      const b = withDecoy.get(key);
      if (a !== undefined && b !== undefined && a !== b) {
        noticed += 1;
      }
    }
    expect(noticed, "no paired column noticed the swap, so this test proves nothing").toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run web/engine/job/__tests__/unpaired.test.ts`

Expected: FAIL on the first test — `corridorReadable` is not a field yet, so `typeof` is
`"undefined"`.

- [ ] **Step 3: Add the field to every descriptor**

In `web/engine/job/columns.ts`, add to the `ColumnDescriptor` interface:

```ts
  /**
   * Could a real corridor produce this number?
   *
   * False for anything that reads the run without the robot, which does not exist outside a
   * simulator. The drill may show only the true ones, because showing a paired number on a
   * withheld card hands the reader the answer. `unpaired.test.ts` proves each value by swapping
   * the control arm for a decoy and checking whether the reading moves.
   */
  readonly corridorReadable: boolean;
```

Then set it on each of the sixteen columns. Start from this list, which follows from the extract
functions, and **let the test correct you** — if the test disagrees, the test is right:

- `trueEffectM` — false. It is the paired difference.
- `worstMomentM` — false. The maximum of the same series.
- `forecastReportM` — **true.** It takes the pair but reads only the treated arm; the control arm
  decides whose paths to look at and nothing else.
- `forecastZeroM` — false. It needs a companion world.
- `runToRunBandM` — false. It re-runs the simulator.
- `worstMomentNullM` — false. Same.
- `detectionFloorM` — false. It pools the control arm.
- `robotPathM` — true. The robot's own trajectory.
- `robotArrivalS` — true. The robot's own trajectory.
- `extraPathM` — false. It differences against the untreated robot.
- `pedestrianTimeLostS` — false. It reports on both versions of the room.
- `minClearanceM` — true. Robot against the treated crowd.
- `nearMissEpisodes` — true. Same.
- `recoveryS` — **false.** Computed from the paired deviation series and its maximum. The spec had
  this wrong.
- `frechetMeanM` — false. Between a person's two paths.

- [ ] **Step 4: Run the test until it passes**

Run: `npx vitest run web/engine/job/__tests__/unpaired.test.ts`

Expected: 3 passed. If a column you marked true moved when the control arm was swapped, **change the
flag, not the test.** Record any correction in your report — a column whose name suggests one thing
and whose arithmetic does another is worth knowing about.

- [ ] **Step 5: Run the full suite**

Run: `npm run check`

Expected: exit 0. `columns.test.ts` iterates the catalogue, so a missing field there fails too.

- [ ] **Step 6: Commit**

```bash
git add web/engine/job/columns.ts web/engine/job/__tests__/unpaired.test.ts
git commit -m "Say which readouts a corridor could produce, and prove it by swapping the control arm

The drill shows a reader only what a real corridor would give them, so every
column now declares whether it can be read without the run that does not exist
there. The flag is proved rather than asserted: each column is computed against
the real pair and against a pair whose control arm came from a different seed,
and one that claims to need no control run must not notice the difference.

Reading the extract functions and writing the list by hand is how this gets
quietly wrong. The design doc did exactly that and put the crowd's recovery time
on the corridor-readable list; it is computed from the paired deviation series."
```

---

### Task 3: The card catalogue

**Files:**
- Create: `web/engine/job/cards.ts`
- Create: `web/engine/job/__tests__/cards.test.ts`

**Interfaces:**
- Consumes: `RunConfig` and `makeRunConfig` from `web/engine/contracts/config.js`; `AXES` from `web/engine/job/axes.js`.
- Produces: `DrillCard`, `DRILL_CARDS`, `CARD_ORDER`, `cardConfig(card: DrillCard): RunConfig`, `cardRulerParams(card: DrillCard): { horizonSteps: number; windowEndStep: number }`.

The eight cards, taken from Task 1's census. Closed, in the style of `AXES` and `COLUMNS`, so a test
can iterate and prove totality and no user-defined card can enter.

- [ ] **Step 1: Write the failing test**

Create `web/engine/job/__tests__/cards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DRILL_CARDS, CARD_ORDER, cardConfig, cardRulerParams } from "../cards.js";
import { AXES } from "../axes.js";

const CODE_IDENTIFIER = /\b(?:[a-z]+[A-Z][A-Za-z]*|[a-z_]+_[a-z_]+)\b|[()[\]{}]|=>/;

describe("the drill card catalogue", () => {
  it("has eight cards and the order names every one", () => {
    expect(CARD_ORDER).toHaveLength(8);
    expect(new Set(CARD_ORDER).size).toBe(8);
    for (const key of CARD_ORDER) {
      expect(DRILL_CARDS[key], `${key} is in the order but not the table`).toBeDefined();
    }
    expect(Object.keys(DRILL_CARDS)).toHaveLength(8);
  });

  it("carries both shapes, so a reader can be wrong in both directions", () => {
    const shapes = CARD_ORDER.map((k) => DRILL_CARDS[k].shape);
    expect(shapes.filter((s) => s === "false positive").length).toBeGreaterThanOrEqual(3);
    expect(shapes.filter((s) => s === "false negative").length).toBeGreaterThanOrEqual(3);
  });

  it("every card builds a legal configuration", () => {
    for (const key of CARD_ORDER) {
      expect(() => cardConfig(DRILL_CARDS[key]), `${key}`).not.toThrow();
    }
  });

  it("every setting a card names sits on its own control's grid", () => {
    // A control snaps whatever it is given to its own notches, so a card off the grid runs at a
    // setting the panel would show differently. jsdom does not snap, so only this catches it.
    for (const key of CARD_ORDER) {
      const card = DRILL_CARDS[key];
      for (const [axisKey, value] of Object.entries(card.settings)) {
        const axis = AXES[axisKey as keyof typeof AXES];
        expect(axis, `${key} names a control that does not exist`).toBeDefined();
        const steps = (value - axis.min) / axis.step;
        expect(Math.abs(steps - Math.round(steps)), `${key}: ${axisKey}=${value} is off its grid`)
          .toBeLessThan(1e-9);
        expect(value).toBeGreaterThanOrEqual(axis.min);
        expect(value).toBeLessThanOrEqual(axis.max);
      }
    }
  });

  it("says something a reader can read", () => {
    for (const key of CARD_ORDER) {
      const card = DRILL_CARDS[key];
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.name).not.toMatch(CODE_IDENTIFIER);
      expect(card.name).not.toMatch(/\d+\.\d+/);
    }
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run web/engine/job/__tests__/cards.test.ts`

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the catalogue**

Create `web/engine/job/cards.ts`. Fill `DRILL_CARDS` from **Task 1's census**, choosing four worlds
of each shape that hold on a majority of seeds. The structure:

```ts
import { makeRunConfig, type RunConfig } from "../contracts/config.js";
import { fail } from "../core/errors.js";

/**
 * The eight cards, closed.
 *
 * Each is a world where a reader who trusts the number a corridor could give them calls the
 * direction wrong. Both shapes are present, because a drill where the confounded number is always
 * too big teaches "that number is too big" rather than "that number is not telling you".
 *
 * The settings come from the census in docs/superpowers/notes/2026-08-25-drill-card-census.md,
 * which measured them against the real engine. No card may be added without re-running it: a card
 * whose confounded number happens to agree with the truth looks identical on screen and teaches
 * the opposite of the lesson.
 */
export type CardShape = "false positive" | "false negative";

export interface DrillCard {
  readonly kind: "drillCard";
  readonly key: string;
  /** Plain English, shown above the arena. Never a number, never a setting name. */
  readonly name: string;
  readonly shape: CardShape;
  readonly seed: number;
  /** Axis key to value. Every value must sit on that axis's own step grid. */
  readonly settings: Readonly<Record<string, number>>;
  readonly horizonSteps: number;
  readonly windowEndStep: number;
}
```

Then the frozen table, `CARD_ORDER`, and:

```ts
export function cardConfig(card: DrillCard): RunConfig {
  const s = card.settings;
  return makeRunConfig({
    seed: card.seed,
    crowd: {
      nPedestrians: s["crowdSize"] ?? 18,
      desiredSpeed: s["walkingPace"] ?? 1.34,
      noiseAmplitude: s["crowdFidget"] ?? 1.1,
    },
    robot: { repulsionScale: s["pushStrength"] ?? 1 },
  });
}

export function cardRulerParams(card: DrillCard): {
  readonly horizonSteps: number;
  readonly windowEndStep: number;
} {
  return { horizonSteps: card.horizonSteps, windowEndStep: card.windowEndStep };
}
```

Use the **real axis keys** from `web/engine/job/axes.ts` in `settings`, not invented ones — the grid
test resolves them against `AXES` and will fail on a wrong name.

- [ ] **Step 4: Run the test until it passes**

Run: `npx vitest run web/engine/job/__tests__/cards.test.ts`

Expected: 5 passed.

- [ ] **Step 5: Verify the cards still fool, at the settings you wrote down**

Write a throwaway check that, for every card, computes the true effect, the forecaster, the band and
the floor at exactly `cardConfig(card)` and `cardRulerParams(card)`, and asserts the shape the card
claims. Run it, paste the table into your report, then delete the file.

This is the step that catches a transcription slip between the census and the catalogue, which is
otherwise invisible until a reader is taught the opposite of the lesson.

- [ ] **Step 6: Commit**

```bash
git add web/engine/job/cards.ts web/engine/job/__tests__/cards.test.ts
git commit -m "Add the eight cards, closed and on their own controls' grids

Four worlds where the corridor-readable number clears the band while the truth
sits under the floor, and four the other way. Both shapes, because a drill where
the confounded number is always too big teaches that it is too big rather than
that it is not telling you anything.

Every setting is checked against its own control's step grid: a control snaps
what it is given to its own notches, jsdom does not, so a card off the grid would
run at one setting and display another."
```

---

### Task 4: The withheld tile

**Files:**
- Modify: `web/app/console/tile.ts`
- Modify: `web/app/console/__tests__/tile.test.ts`

**Interfaces:**
- Consumes: `TileProps`, `renderTile` from `web/app/console/tile.js`.
- Produces: `renderWithheldTile(doc: Document, label: string): HTMLElement`.

A tile with a label and the word withheld, and **no value slot at all** — so `tile.test.ts`'s ban on
numeric literals in leaves is untouched, and guardrail 6 cannot be violated by a number appearing
without its zero, because there is no number.

- [ ] **Step 1: Write the failing test**

Add to `web/app/console/__tests__/tile.test.ts`:

```ts
describe("a withheld tile", () => {
  it("shows the label and says the number is withheld, with no value anywhere", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const el = renderWithheldTile(dom.window.document, "How far the crowd was moved");
    expect(el.textContent).toContain("How far the crowd was moved");
    expect(el.textContent).toContain("withheld");
    // No value slot at all, so guardrail 6 cannot be violated here: there is no number to
    // show without its zero.
    expect(el.querySelector(".tile-value")).toBeNull();
    expect(el.textContent).not.toMatch(/\d+\.\d+/);
  });

  it("says why it is withheld, not merely that it is", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const el = renderWithheldTile(dom.window.document, "How far the crowd was moved");
    // A reader who is told a number is hidden and not why assumes the site is being coy.
    expect(el.textContent).toMatch(/second run|without the robot|corridor/i);
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run web/app/console/__tests__/tile.test.ts -t "withheld"`

Expected: FAIL — `renderWithheldTile` is not exported.

- [ ] **Step 3: Implement it**

In `web/app/console/tile.ts`:

```ts
/**
 * A measurement the reader is not being shown yet.
 *
 * There is deliberately no value slot. A withheld tile is not a tile with a blank number in it —
 * it is the shape of the thing a real corridor cannot give you, and the sentence says which thing
 * that is. A reader told only that something is hidden assumes the site is being coy; a reader
 * told the second run does not exist outside a simulator has learnt the point of the drill.
 */
export function renderWithheldTile(doc: Document, label: string): HTMLElement {
  const tile = doc.createElement("section");
  tile.className = "tile tile-withheld";
  tile.appendChild(element(doc, "p", "tile-label", label));
  tile.appendChild(
    element(
      doc,
      "p",
      "tile-withheld-note",
      "Withheld: this one needs the second run, the one without the robot, which a real corridor " +
        "does not have.",
    ),
  );
  return tile;
}
```

- [ ] **Step 4: Style it**

In `web/console.css`, before the media blocks at the end of the file (they must stay last — a test
asserts breakpoints are written widest first and a new block below would break it):

```css
/*
 * A withheld tile keeps the shape of a readout so the strip does not jump when the answer arrives,
 * but carries no number and no gauge. Muted, because it is not the thing to look at yet.
 */
.tile-withheld { opacity: 0.72; }
.tile-withheld-note {
  margin: 0.35rem 0 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--mirn-ink-faint);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run web/app/console/__tests__/tile.test.ts`

Expected: all pass, including the pre-existing numeric-literal scan over every column.

- [ ] **Step 6: Commit**

```bash
git add web/app/console/tile.ts web/app/console/__tests__/tile.test.ts web/console.css
git commit -m "Add a tile that withholds its number and says why

No value slot at all, rather than a blank one: guardrail 6 cannot be violated by
a number appearing without its zero when there is no number. The note says the
measurement needs the run a corridor does not have, because a reader told only
that something is hidden assumes the site is being coy."
```

---

### Task 5: The drill state machine

**Files:**
- Create: `web/app/console/drill.ts`
- Create: `web/app/console/__tests__/drill.test.ts`

**Interfaces:**
- Consumes: `DRILL_CARDS`, `CARD_ORDER`, `DrillCard` from `web/engine/job/cards.js`.
- Produces: `DrillCall` (`"bigger" | "smaller" | "cannot tell"`), `DrillState`, `makeDrillState()`, `answer(state, call)`, `reveal(state)`, `isComplete(state)`, `tally(state)`.

Pure state, no DOM, no storage. In memory only — the tally dies on reload and the page says so.

- [ ] **Step 1: Write the failing test**

Create `web/app/console/__tests__/drill.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeDrillState, answer, reveal, isComplete, tally } from "../drill.js";
import { CARD_ORDER } from "../../../engine/job/cards.js";

describe("the drill's state", () => {
  it("starts on the first card with nothing answered", () => {
    const s = makeDrillState();
    expect(s.index).toBe(0);
    expect(s.revealed).toBe(false);
    expect(s.calls).toHaveLength(0);
    expect(isComplete(s)).toBe(false);
  });

  it("records a call and reveals, and does not advance until told", () => {
    let s = makeDrillState();
    s = answer(s, "bigger");
    expect(s.calls).toHaveLength(1);
    expect(s.revealed).toBe(true);
    expect(s.index).toBe(0);
  });

  it("refuses a second call on the same card", () => {
    let s = makeDrillState();
    s = answer(s, "bigger");
    // Otherwise a reader could change their mind after seeing the answer, and the tally would
    // be a record of nothing.
    expect(() => answer(s, "smaller")).toThrow();
  });

  it("advances to the next card and clears the reveal", () => {
    let s = makeDrillState();
    s = answer(s, "bigger");
    s = reveal(s);
    expect(s.index).toBe(1);
    expect(s.revealed).toBe(false);
  });

  it("is complete after the last card is answered", () => {
    let s = makeDrillState();
    for (let i = 0; i < CARD_ORDER.length; i++) {
      s = answer(s, "bigger");
      s = reveal(s);
    }
    expect(isComplete(s)).toBe(true);
    expect(s.calls).toHaveLength(CARD_ORDER.length);
  });

  it("refuses to advance past the last card", () => {
    let s = makeDrillState();
    for (let i = 0; i < CARD_ORDER.length; i++) {
      s = answer(s, "bigger");
      s = reveal(s);
    }
    expect(() => reveal(s)).toThrow();
  });

  it("counts a call wrong when it disagrees with the card's shape", () => {
    // On a false-positive card the corridor number clears the band while the truth is under the
    // floor, so "bigger" is the wrong call and "smaller" is right.
    let s = makeDrillState();
    s = answer(s, "bigger");
    const first = CARD_ORDER[0] as string;
    const shape = (s.calls[0] as { readonly correct: boolean });
    expect(typeof shape.correct).toBe("boolean");
    expect(first.length).toBeGreaterThan(0);
  });

  it("tallies how many were called wrong", () => {
    let s = makeDrillState();
    for (let i = 0; i < CARD_ORDER.length; i++) {
      s = answer(s, "bigger");
      s = reveal(s);
    }
    const t = tally(s);
    expect(t.total).toBe(CARD_ORDER.length);
    expect(t.wrong + t.right).toBe(t.total);
  });

  it("never touches a storage API", () => {
    // Guardrail 10. The tally dies on reload and the page says so.
    const source = String(makeDrillState) + String(answer) + String(reveal) + String(tally);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run web/app/console/__tests__/drill.test.ts`

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement it**

Create `web/app/console/drill.ts` with frozen plain objects and a `make*` factory that throws
`ContractError`, following the codebase convention — never a class, because everything here must
stay structured-cloneable.

The correctness rule: on a **false positive** card the corridor-readable number clears the band while
the true effect is under the floor, so the right call is `"smaller"`. On a **false negative** card
the truth is above the floor while the number is under the band, so the right call is `"bigger"`.
`"cannot tell"` is never counted right — it is an honest answer and the verdict should say so
separately rather than scoring it.

- [ ] **Step 4: Run the tests until they pass**

Run: `npx vitest run web/app/console/__tests__/drill.test.ts`

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add web/app/console/drill.ts web/app/console/__tests__/drill.test.ts
git commit -m "Add the drill's state, in memory and refusing to be changed after the answer

A reader cannot re-answer a card once it has been revealed, or the tally records
nothing. 'Cannot tell' is never scored right: it is an honest answer to a card
designed to be unanswerable from what is shown, and the verdict says so
separately rather than marking it."
```

---

### Task 6: The drill screens

**Files:**
- Create: `web/drill.html`
- Create: `web/drill.ts`
- Modify: `vite.config.ts` (a third entry)
- Modify: `web/app/console/__tests__/disclosure.test.ts` (the entry-count assertion)
- Create: `web/app/console/__tests__/drill-dom.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–5, plus `drawArena` and `fitCanvas` from `web/ui/arena.js`, `renderTile` and `renderWithheldTile` from `web/app/console/tile.js`.
- Produces: the page.

- [ ] **Step 1: Write the failing DOM test**

Create `web/app/console/__tests__/drill-dom.test.ts`. It must assert, at minimum:

```ts
it("shows the invented-crowd disclosure before any number", () => {
  const html = readFileSync("web/drill.html", "utf8");
  const disclosure = html.indexOf('id="disclosure"');
  expect(disclosure).toBeGreaterThan(-1);
  for (const anchor of ['id="arena"', 'id="readouts"']) {
    expect(disclosure).toBeLessThan(html.indexOf(anchor));
  }
});

it("shows no paired readout before the reveal", async () => {
  const { document } = await bootDrill();
  const labels = [...document.querySelectorAll("#readouts .tile-label")].map((n) => n.textContent);
  // Proved from the catalogue rather than a hardcoded list, so a new paired column cannot leak in.
  for (const key of COLUMN_ORDER) {
    if (COLUMNS[key].corridorReadable) continue;
    const shown = labels.includes(COLUMNS[key].label);
    const withheld = [...document.querySelectorAll(".tile-withheld .tile-label")]
      .map((n) => n.textContent).includes(COLUMNS[key].label);
    expect(shown && !withheld, `${key} is a paired readout and is on the card`).toBe(false);
  }
});

it("draws no control mark on the arena before the reveal", async () => {
  const { view } = await bootDrill();
  expect(view.showControl).toBe(false);
  expect(view.showGaps).toBe(false);
});

it("lists only the marks it actually draws", async () => {
  const { document } = await bootDrill();
  const marks = [...document.querySelectorAll(".arena-key .key-mark")].map((n) => n.className);
  expect(marks.join(" ")).not.toContain("key-control");
  expect(marks.join(" ")).not.toContain("key-gap");
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run web/app/console/__tests__/drill-dom.test.ts`

Expected: FAIL — `web/drill.html` does not exist.

- [ ] **Step 3: Write the page**

`web/drill.html` reuses the masthead and disclosure markup verbatim from `web/index.html`, then a
card region: the arena, a dynamic key, the readouts strip, and three buttons. Link `./console.css`;
it is the only stylesheet.

`web/drill.ts` imports `./app/console/boot.js` for the palette side effect, exactly as
`web/console.ts` does, then mounts.

Build the view with `showControl: false, showGaps: false`. **No arena change is needed** — every
control mark and every gap segment is already gated on those two flags.

- [ ] **Step 4: Add the entry point**

In `vite.config.ts`, add `drill: resolve(__dirname, "web/drill.html")` beside the existing two.

Then update `web/app/console/__tests__/disclosure.test.ts`'s entry-count assertion honestly — it
currently asserts the build has exactly the pages that exist and that no deleted page survives.
Change the expected count, keep the absence assertions, and **do not** weaken it into a
`toContain` that would pass with a deleted page still building.

- [ ] **Step 5: Run everything**

Run: `npm run check`

Expected: exit 0, and `dist/drill.html` present.

- [ ] **Step 6: Look at it in a browser**

Run: `npm run dev`, open the drill page, and confirm: no white dots, no orange segments, the key
lists four marks rather than six, and the paired tiles read withheld.

- [ ] **Step 7: Commit**

```bash
git add web/drill.html web/drill.ts vite.config.ts web/app/console/__tests__/disclosure.test.ts web/app/console/__tests__/drill-dom.test.ts
git commit -m "Add the drill page, showing only what a corridor could give you

The arena needed no new mode: showControl and showGaps already gate every control
mark and every gap segment, so the withheld view is those two switched off.

The test that no paired readout reaches the card is derived from the catalogue
rather than a hardcoded list, so a column added later cannot leak onto a card by
being forgotten."
```

---

### Task 7: Reveal and verdict

**Files:**
- Modify: `web/drill.ts`
- Modify: `web/app/console/__tests__/drill-dom.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("fades the control arm in on the same frozen frame", async () => {
  const { document, window, viewAfter } = await bootDrill();
  click(document.querySelector('[data-call="bigger"]'), window);
  const view = viewAfter();
  expect(view.showControl).toBe(true);
  expect(view.showGaps).toBe(true);
  // The same instant, so the reader compares like with like rather than watching it move.
  expect(view.sample).toBe(frozenSampleBefore);
});

it("fills every withheld tile on reveal", async () => {
  const { document, window } = await bootDrill();
  click(document.querySelector('[data-call="bigger"]'), window);
  expect(document.querySelectorAll(".tile-withheld")).toHaveLength(0);
});

it("states the call, the truth, the band and what the corridor number said", async () => {
  const { document, window } = await bootDrill();
  click(document.querySelector('[data-call="bigger"]'), window);
  const line = document.querySelector(".drill-reveal")?.textContent ?? "";
  expect(line).toMatch(/you said/i);
  expect(line).toMatch(/\d/);
});

it("says the tally does not survive a reload", async () => {
  const { document } = await bootDrill();
  expect(document.body.textContent).toMatch(/reload|refresh/i);
});
```

**Correction to the snippet above:** `frozenSampleBefore` is not defined anywhere in this plan.
Capture the sample index from the view *before* the click and compare against that value:

```ts
const before = viewAfter().sample;
click(document.querySelector('[data-call="bigger"]'), window);
expect(viewAfter().sample).toBe(before);
```

The property being defended is that the reveal redraws the *same instant* with the control arm
switched on, so the reader compares like with like rather than watching the crowd move while they
read.

- [ ] **Step 2: Run it, implement, run it again**

Same cycle. The reveal redraws the arena at the identical `sample`, fills the tiles through the
normal `renderTile` path so every revealed number carries its zero, and writes one sentence.

- [ ] **Step 3: The verdict, after card eight**

How many were called wrong; whether the wrong ones shared a direction; and that on all eight the
paired reading was right — **not because it is a better estimator, but because both runs shared a
seed and differed only in the robot.** That sentence is the transferable claim and must appear.

Then: "Now open the settings and try to build a card that fools it worse," linking into the console
with the last card's settings in the query string.

- [ ] **Step 4: Commit**

```bash
git add web/drill.ts web/app/console/__tests__/drill-dom.test.ts
git commit -m "Reveal the second run, and say what the reader got wrong

The reveal redraws the same frozen instant with the control arm and the gaps
switched on, so the comparison is like with like rather than a crowd that moved
while the reader was reading. Every revealed number goes through the normal tile
path and carries its zero.

The verdict says the paired reading was right on all eight not because it is a
better estimator but because both runs shared a seed and differed only in the
robot. That sentence is the thing a reader is meant to leave with."
```

---

### Task 8: Permalink and export

**Files:**
- Modify: `web/app/console/permalink.ts`
- Modify: `web/app/console/csv.ts`
- Modify: `web/app/console/__tests__/permalink.test.ts`
- Modify: `web/app/console/__tests__/csv.test.ts`

**The permalink carries the eight card keys and never a single result.** A link asserting a score
would quote an old answer with the new page's authority, and the existing rule already says so.

- [ ] **Step 1: Write the failing tests**

```ts
it("carries the cards and never the calls or the answers", () => {
  const link = encodeDrill(stateAfterEightAnswers);
  expect(link).toContain("cards=");
  expect(link).not.toMatch(/wrong|right|score|calls?=/);
  for (const n of ["0.", "1.", "2."]) {
    expect(link, "a permalink may not carry a measured value").not.toContain(n);
  }
});

it("refuses a card key that is not in the catalogue", () => {
  const decoded = decodeDrill("?cards=not-a-real-card");
  expect(decoded.notices.length).toBeGreaterThan(0);
  expect(decoded.cards).toHaveLength(0);
});
```

- [ ] **Step 2: Implement, and run**

`decodeDrill` follows `decodeSettings`' existing convention: an unknown key is ignored **with a
notice a reader can read**, never silently and never by throwing.

- [ ] **Step 3: The CSV**

Disclosure on line one, exactly as the existing export does — a file outlives the page it came from.
Then one row per card: the card, the call, the true effect, the band, the floor, the corridor-readable
number, and what that number reads on a zero-effect world.

- [ ] **Step 4: Commit**

```bash
git add web/app/console/permalink.ts web/app/console/csv.ts web/app/console/__tests__/permalink.test.ts web/app/console/__tests__/csv.test.ts
git commit -m "Let a drill be shared as its cards, never as its score

The link carries the eight card keys and nothing measured, for the reason the
console's own links already do: a link asserting a result would quote an old
answer with the new page's authority. The export carries the disclosure on line
one, because a file outlives the page it came from."
```

---

### Task 9: The way in, and the documents

**Files:**
- Modify: `web/index.html` (a fifth item in the ways-in nav)
- Modify: `web/how.html` (a short section)
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `web/app/console/__tests__/presets.test.ts`

- [ ] **Step 1: Add the way in**

A fifth item in the existing `ways-in` list, linking to `./drill.html`. It is not a preset — it is a
different page — so check `presets.test.ts` still passes: it counts the links in that block and
decodes each one. Update it honestly to expect four preset addresses plus one page link, and keep it
decoding the four.

**How `presets.test.ts` breaks, and the honest fix.** Its `waysInHrefs()` matches *every* `href`
in the ways-in block and then puts each through `decodeSettings`. A fifth item pointing at
`./drill.html` therefore does two things: `toHaveLength(4)` fails, and the decode loop tries to read
a page path as a query string and reports notices.

Do not fix this by excluding the new link from the block or by relaxing the length assertion.
Split the two kinds of link explicitly, so both stay guarded:

```ts
function waysInHrefs(): readonly string[] {
  // ... unchanged block match ...
  return found;
}

/** The four that carry settings. These are the ones the decoder must accept without complaint. */
function presetHrefs(): readonly string[] {
  return waysInHrefs().filter((h) => h.startsWith("?"));
}

/** The links to other pages. A page link that carries a query string is a mistake. */
function pageHrefs(): readonly string[] {
  return waysInHrefs().filter((h) => !h.startsWith("?"));
}
```

Then: assert `presetHrefs()` has length 4 and decode each as before; assert `pageHrefs()` contains
`./drill.html`; and assert no page link contains a `?`, which is the mistake this split could
otherwise hide.

- [ ] **Step 2: Explain the drill on the explanations page**

A short section: what the drill withholds, why, and which readouts a corridor could produce. The page
states no measured values and a test enforces it — keep that property.

- [ ] **Step 3: Update the two documents**

`README.md`: the drill, and the transferable claim.

`CLAUDE.md`: a short entry recording that the card table is closed, that `corridorReadable` is proved
by control-arm swap rather than asserted, and that guardrail 11 was **not** amended — the drill
scores a reader, never a robot and never someone else's method.

- [ ] **Step 4: Full check and commit**

Run: `npm run check` and `.venv/bin/python -m pytest -q -m "not slow"`

```bash
git add -A
git commit -m "Put the drill on the front page and in the documents

Guardrail 11 is unamended and CLAUDE.md now says why the drill does not breach
it: the card table is closed, and what gets scored is a reader rather than a
robot or somebody else's method."
```

---

## Self-review

**Spec coverage.** Card screen → Task 6. Reveal → Task 7. Tally → Tasks 5, 7. Verdict → Task 7.
Permalink and CSV → Task 8. The gate → Task 1. The withheld-tile requirement → Task 4. Dynamic key →
Task 6. Guardrail 11 unamended → Tasks 3, 9.

**One spec requirement deliberately changed:** the spec's five corridor-readable readouts include
`recoveryS`, which is computed from the paired deviation series. Task 2 establishes the real list by
measurement and the spec is wrong on that point.

**Placeholders:** none. Task 3's card values come from Task 1's census, which is why Task 3 cannot
start until Task 1 reports — that is a sequencing fact, not a placeholder.

**Type consistency:** `DrillCard`, `DRILL_CARDS`, `CARD_ORDER`, `cardConfig`, `cardRulerParams`
(Task 3) are consumed by Tasks 5–8 under those names. `renderWithheldTile(doc, label)` (Task 4) is
consumed by Task 6. `corridorReadable` (Task 2) is consumed by Tasks 3 and 6.
