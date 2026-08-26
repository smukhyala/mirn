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
 *     forecaster still reports more than two runs of the room differ by.
 *   FALSE NEGATIVE — the true effect is comfortably above the floor, and the forecaster reports
 *     less than the band.
 *
 * Everything else is a card where the confounded number happens to agree with the truth, which
 * teaches nothing and must not be shipped as though it did.
 *
 * ## This screen judges the two numbers against two different nulls, and that is not the score
 *
 * Read this before quoting a shape out of this file. The two labels above compare the TRUTH to the
 * split-half detection floor and the FORECASTER to the run-to-run band — each estimator against its
 * own null, which is a defensible screen and is how the census that picked the eight cards was run.
 *
 * It is not what the drill's card asks the reader, and it does not license the phrase "a reader
 * trusting the forecaster calls this and is wrong". The card asks one question — did the robot
 * move this crowd by more than two runs of the same room differ by on their own? — and that is the
 * truth against the RUN-TO-RUN BAND alone. On three of the eight cards this script found, the two
 * nulls put the truth on opposite sides, so on those three the reader who trusted the forecaster
 * was right and the label said otherwise. That was caught while the reveal was being built and
 * fixed in commit `a6c6c06`.
 *
 * So: this file is a SCREEN for finding rooms worth looking at, and nothing more. The shipped
 * classification is `CardShape` in `web/engine/job/cards.ts`, re-derived against the band and
 * asserted in `web/engine/job/__tests__/cards.slow.test.ts`, which also keeps this screen's own
 * floor classification alive as `CENSUS_FLOOR_SHAPE` so the provenance stays checked. Nothing
 * imports this script.
 *
 * RESTRUCTURED from the brief's literal script (which is an 8x5x4x3x4x4x4 = 30,720-cell nested
 * loop that reruns the world for every ruler setting). The true effect, the run-to-run band and
 * the split-half floor depend only on (seed, people, pace, fidget, space) — never on the two
 * ruler settings (forecastHorizon, forecastWindowEnd), because a ruler setting only changes how
 * `cvmResidual` reads a run that already happened. So each WORLD (one seed x one crowd/robot
 * setting) is simulated once, its band and floor computed once, and only `cvmResidual` —
 * cheap, no re-simulation — is recomputed for each of the 16 ruler combinations. That turns
 * 30,720 simulations into 1,920 (or, at the seed count actually used below, 960).
 *
 * SEED COUNT: a timing probe of one full world (runPair + replicateBand(8) + splitHalfNull(200))
 * at the most expensive crowd size (44 people) measured ~1.6 s, and averaged over the five PEOPLE
 * values ~0.77 s/world. At 8 seeds that is 1,920 worlds x ~0.77 s ~= 24.5 minutes — far past the
 * brief's 10-minute ceiling even after the restructuring above. The brief's own fallback
 * ("if it still takes more than ten minutes, cut SEEDS to four") was applied BEFORE running,
 * using that measurement, rather than after burning 25 minutes to rediscover it. Four seeds is
 * 960 worlds, ~12 minutes by the same estimate; the actual measured wall time is printed below and
 * recorded in the census note.
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

// Cut from the brief's eight to four: see the timing note above. First four of the brief's list,
// in the brief's order — not re-picked to manufacture a result.
const SEEDS = [20260816, 1, 7, 424242];

// Values on the axes' own step grids (web/engine/job/axes.ts). Nothing here is outside a
// slider's reach:
//   crowdSize      min 4   max 44  step 1     -> PEOPLE
//   walkingPace    min 0.4 max 2   step 0.01  -> PACE
//   crowdFidget    min 0   max 3   step 0.1   -> FIDGET
//   pushStrength   min 0   max 3   step 0.25  -> SPACE (robot.repulsionScale)
//   forecastHorizon    min 0.2 max 3  step 0.1  -> HORIZON_S
//   forecastWindowEnd  min 5   max 40 step 0.5  -> WINDOW_END_S
const PEOPLE = [4, 14, 24, 34, 44];
const PACE = [0.4, 0.9, 1.34, 1.8];
const FIDGET = [0, 1.1, 3];
const SPACE = [0, 1, 2, 3];
const HORIZON_S = [0.2, 1, 2, 3];
const WINDOW_END_S = [5, 10, 15, 20];

interface World {
  readonly config: RunConfig;
  readonly trueEffect: number;
  readonly band: number;
  readonly floor: number;
  readonly pair: ReturnType<typeof runPair>["pair"];
}

function buildWorld(seed: number, people: number, pace: number, fidget: number, space: number): World {
  const config: RunConfig = makeRunConfig({
    seed,
    crowd: { nPedestrians: people, desiredSpeed: pace, noiseAmplitude: fidget },
    robot: { repulsionScale: space },
  });
  const run = runPair(config, () => 0);
  const trueEffect = paired(run.pair).value;
  const band = replicateBand(config, 8).value;
  // Exactly what web/engine/job/runner.ts does: the control arm, 200 splits, stride 20.
  const floor = splitHalfNull(run.control.positions, 200, seededPermutations(seed), 0.05, 20).floor;
  return { config, trueEffect, band, floor, pair: run.pair };
}

function classify(
  world: World,
  horizonSteps: number,
  windowEndStep: number,
): { forecast: number; shape: Cell["shape"] } {
  let forecast: number;
  try {
    forecast = cvmResidual(world.pair, horizonSteps, windowEndStep).value;
  } catch {
    return { forecast: NaN, shape: "unusable" };
  }
  let shape: Cell["shape"];
  if (!Number.isFinite(world.trueEffect) || !Number.isFinite(forecast)) {
    shape = "unusable";
    // Truth against the floor, forecaster against the band — see this file's header. A screen,
    // never a score.
  } else if (world.trueEffect < world.floor && forecast > world.band) {
    shape = "false positive";
  } else if (world.trueEffect > world.floor && forecast < world.band) {
    shape = "false negative";
  } else {
    shape = "agrees";
  }
  return { forecast, shape };
}

const wallStart = Date.now();
const cells: Cell[] = [];
let worldsBuilt = 0;

for (const seed of SEEDS) {
  for (const people of PEOPLE) {
    for (const pace of PACE) {
      for (const fidget of FIDGET) {
        for (const space of SPACE) {
          const world = buildWorld(seed, people, pace, fidget, space);
          worldsBuilt++;
          const dt = world.config.dt;
          for (const horizonS of HORIZON_S) {
            for (const windowEndS of WINDOW_END_S) {
              const horizonSteps = Math.round(horizonS / dt);
              const windowEndStep = Math.round(windowEndS / dt);
              const { forecast, shape } = classify(world, horizonSteps, windowEndStep);
              const label = `n${people} pace${pace} fidget${fidget} space${space} h${horizonS} w${windowEndS}`;
              cells.push({
                label,
                seed,
                people,
                pace,
                fidget,
                space,
                horizonSteps,
                windowEndStep,
                trueEffect: world.trueEffect,
                forecast,
                band: world.band,
                floor: world.floor,
                shape,
              });
            }
          }
        }
      }
    }
  }
}

const wallMs = Date.now() - wallStart;

const falsePositives = cells.filter((c) => c.shape === "false positive");
const falseNegatives = cells.filter((c) => c.shape === "false negative");

console.log(`seeds used: ${SEEDS.join(", ")}  (cut from the brief's 8 to 4 — see header comment)`);
console.log(`worlds built (one runPair + replicateBand(8) + splitHalfNull(200) each): ${worldsBuilt}`);
console.log(`cells measured: ${cells.length}`);
console.log(`wall time: ${(wallMs / 1000).toFixed(1)} s`);
console.log(`false positives: ${falsePositives.length}`);
console.log(`false negatives: ${falseNegatives.length}`);
console.log(`agrees:          ${cells.filter((c) => c.shape === "agrees").length}`);
console.log(`unusable:        ${cells.filter((c) => c.shape === "unusable").length}`);
console.log("");

// A "world" for the kill criterion is a label WITHOUT the seed — exactly what the reader can
// reach with the panel's sliders, since seed is not a slider. For each such label, judge whether
// a MAJORITY of the seeds tested at that label produced the shape.
function majorityWorlds(shape: Cell["shape"]): { label: string; count: number; of: number }[] {
  const byLabel = new Map<string, number>();
  const seedsPerLabel = new Map<string, Set<number>>();
  for (const c of cells) {
    if (!seedsPerLabel.has(c.label)) {
      seedsPerLabel.set(c.label, new Set());
    }
    (seedsPerLabel.get(c.label) as Set<number>).add(c.seed);
    if (c.shape === shape) {
      byLabel.set(c.label, (byLabel.get(c.label) ?? 0) + 1);
    }
  }
  const result: { label: string; count: number; of: number }[] = [];
  for (const [label, count] of byLabel) {
    const of = (seedsPerLabel.get(label) as Set<number>).size;
    if (count > of / 2) {
      result.push({ label, count, of });
    }
  }
  result.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return result;
}

const fpMajority = majorityWorlds("false positive");
const fnMajority = majorityWorlds("false negative");

console.log(`distinct worlds (label = crowd/robot/ruler, no seed) holding FALSE POSITIVE on a majority of seeds: ${fpMajority.length}`);
for (const w of fpMajority) {
  console.log(`  ${w.label}  (${w.count}/${w.of} seeds)`);
}
console.log("");
console.log(`distinct worlds holding FALSE NEGATIVE on a majority of seeds: ${fnMajority.length}`);
for (const w of fnMajority) {
  console.log(`  ${w.label}  (${w.count}/${w.of} seeds)`);
}
console.log("");

// Per-seed numbers for the top majority worlds of each shape, for the census note.
function dumpWorld(label: string): void {
  console.log(`--- ${label} ---`);
  for (const c of cells.filter((x) => x.label === label)) {
    console.log(
      `  seed=${c.seed}  shape=${c.shape}  trueEffect=${c.trueEffect.toFixed(4)}  ` +
        `floor=${c.floor.toFixed(4)}  forecast=${c.forecast.toFixed(4)}  band=${c.band.toFixed(4)}`,
    );
  }
}

console.log("=== detail for majority false-positive worlds ===");
for (const w of fpMajority) {
  dumpWorld(w.label);
}
console.log("");
console.log("=== detail for majority false-negative worlds ===");
for (const w of fnMajority) {
  dumpWorld(w.label);
}
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
