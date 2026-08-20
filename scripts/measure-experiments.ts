/**
 * Runs every curated experiment and writes the numbers to web/data/experiment-facts.json.
 *
 * Not results/, which is gitignored because it holds reproducible experiment output. This file is
 * a BUILD INPUT: the notes pages cite it and the sweep figures read it, so it is committed.
 *
 * This exists because the explanation paragraph for an experiment cannot honestly be written
 * before the experiment has been run. Prose that asserts a phenomenon the reader is watching not
 * happen is the worst failure this site has, so the copy is written from this file.
 *
 * Every point is averaged over several scene seeds. A single-seed curve here is noise: an early
 * pass at the density question drew the wrong conclusion from one seed.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { makeRunConfig, SIM_CONSTANTS, type RunConfigOverrides } from "../web/engine/contracts/config.js";
import { runPair, type RunResult } from "../web/engine/sim/run.js";
import { paired, cvmResidual } from "../web/engine/measure/estimator/index.js";
import { replicateBand } from "../web/engine/measure/null/band.js";
import { clearance, deviation, recovery, robotCost } from "../web/engine/measure/metrics.js";
import { seededPermutations, splitHalfNull } from "../web/engine/measure/null/splitHalf.js";

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
const BASE_SEED = 20260816;
const N_TICKS = 800;
const DT = 0.05;
const ACTIVE_STEP = 200;

function cfg(seedIndex: number, o: RunConfigOverrides = {}) {
  return makeRunConfig({ seed: BASE_SEED + seedIndex * 7919, nTicks: N_TICKS, ...o });
}

/**
 * Mean over the FINITE values, which is a survivorship trap and is why every swept column now
 * also reports how many runs it actually averaged.
 *
 * A censored measurement — recovery that never came inside its tolerance, an arrival that never
 * happened — comes back NaN and gets dropped here. Recovery time was being averaged over as few
 * as two of eight runs and presented as a property of the eight, with nothing on the page or in
 * the facts file to say so. Dropping the value is right; dropping it silently is not.
 */
function meanOf(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return Number.NaN;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

function finiteCount(values: readonly number[]): number {
  return values.filter((v) => Number.isFinite(v)).length;
}
function sdOf(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return Number.NaN;
  const m = meanOf(finite);
  return Math.sqrt(finite.reduce((a, b) => a + (b - m) ** 2, 0) / (finite.length - 1));
}

/** First step after which a pedestrian never moves again. -1 if they never settle. */
function arrivalStep(path: Float64Array): number {
  const n = path.length / 2;
  for (let s = 1; s < n; s++) {
    const dx = (path[2 * s]! - path[2 * s - 2]!);
    const dy = (path[2 * s + 1]! - path[2 * s - 1]!);
    if (Math.sqrt(dx * dx + dy * dy) < 1e-9) return s;
  }
  return -1;
}

/** Mean over agents of (treated arrival - control arrival), in seconds. */
function pedestrianTimeLost(r: RunResult): number {
  const out: number[] = [];
  for (let i = 0; i < r.treated.positions.length; i++) {
    const a = arrivalStep(r.treated.positions[i]!);
    const b = arrivalStep(r.control.positions[i]!);
    if (a >= 0 && b >= 0) out.push((a - b) * DT);
  }
  return meanOf(out);
}

/** Mean deviation restricted to people who never came within `radiusM` of the robot. */
function bystanderDeviation(r: RunResult, radiusM: number): { meanM: number; n: number } {
  const robot = r.treated.robotPositions;
  if (robot === null) return { meanM: Number.NaN, n: 0 };
  const dev = deviation(r.pair);
  const kept: number[] = [];
  for (let i = 0; i < r.control.positions.length; i++) {
    const path = r.control.positions[i]!;
    let minD = Infinity;
    for (let s = 0; s < path.length / 2; s++) {
      const dx = path[2 * s]! - robot[2 * s]!;
      const dy = path[2 * s + 1]! - robot[2 * s + 1]!;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minD) minD = d;
    }
    // Selection is judged on the CONTROL arm — never the treated one. Selecting on the treated
    // arm selects partly on the very displacement being measured.
    if (minD > radiusM) kept.push(dev.perAgentM[i]!);
  }
  return { meanM: meanOf(kept), n: kept.length };
}

type Point = Record<string, number>;
const facts: Record<string, unknown> = {};

function sweep(name: string, axis: string, values: readonly number[], build: (v: number, seed: number) => RunConfigOverrides, measure: (r: RunResult, v: number, seedIndex: number) => Point): void {
  const rows: Point[] = [];
  for (const v of values) {
    const collected: Record<string, number[]> = {};
    for (const s of SEEDS) {
      const r = runPair(cfg(s, build(v, s)));
      const point = measure(r, v, s);
      for (const [k, val] of Object.entries(point)) {
        (collected[k] ??= []).push(val);
      }
    }
    const row: Point = { [axis]: v };
    for (const [k, vals] of Object.entries(collected)) {
      row[k] = meanOf(vals);
      row[`${k}_sd`] = sdOf(vals);
      // How many runs this cell actually averaged. Equal to the seed count unless the measurement
      // was censored for some of them, which a page citing the cell has to be able to say.
      row[`${k}_n`] = finiteCount(vals);
    }
    rows.push(row);
  }
  facts[name] = { axis, nSeeds: SEEDS.length, rows };
  console.log(`\n== ${name} (axis: ${axis}, ${SEEDS.length} seeds) ==`);
  const keys = Object.keys(rows[0]!).filter((k) => !k.endsWith("_sd") && !k.endsWith("_n"));
  console.log(keys.map((k) => k.padStart(13)).join(""));
  for (const row of rows) {
    console.log(keys.map((k) => (row[k] as number).toFixed(3).padStart(13)).join(""));
  }
  // Shout about censoring rather than letting it hide inside an average.
  for (const row of rows) {
    for (const k of keys) {
      const n = row[`${k}_n`];
      if (n !== undefined && n < SEEDS.length) {
        console.log(
          `    NOTE ${name} ${axis}=${row[axis]} ${k}: averaged ${n} of ${SEEDS.length} runs; ` +
            `the rest were censored`,
        );
      }
    }
  }
}

// ---- E1: does pushing harder move people further? --------------------------------------------
sweep("e1_push_strength", "repulsionScale", [0, 0.5, 1, 1.5, 2, 2.5, 3],
  (v) => ({ robot: { repulsionScale: v } }),
  (r) => { const d = deviation(r.pair); return { meanDeviationM: d.meanM, maxDeviationM: d.maxM }; });

// ---- E2: denser crowd — bigger effect, or harder to see? -------------------------------------
{
  const rows: Point[] = [];
  for (const n of [4, 8, 12, 18, 24, 32, 44]) {
    const means: number[] = [], maxes: number[] = [], bands: number[] = [];
    for (const s of SEEDS) {
      const c = cfg(s, { crowd: { nPedestrians: n } });
      const d = deviation(runPair(c).pair);
      means.push(d.meanM); maxes.push(d.maxM);
      if (s < 2) bands.push(replicateBand(c, 6).value);
    }
    rows.push({
      nPedestrians: n,
      meanDeviationM: meanOf(means), meanDeviationM_sd: sdOf(means),
      maxDeviationM: meanOf(maxes),
      totalPersonMetres: meanOf(means) * n,
      runToRunBandM: meanOf(bands),
      signalToBand: meanOf(means) / meanOf(bands),
    });
  }
  facts["e2_density"] = { axis: "nPedestrians", nSeeds: SEEDS.length, rows };
  console.log("\n== e2_density ==");
  console.log(Object.keys(rows[0]!).filter(k=>!k.endsWith("_sd")).map(k=>k.padStart(17)).join(""));
  for (const r of rows) console.log(Object.keys(rows[0]!).filter(k=>!k.endsWith("_sd")).map(k=>(r[k] as number).toFixed(3).padStart(17)).join(""));
}

// ---- E3: hurry up or slow down? ---------------------------------------------------------------
sweep("e3_robot_speed", "maxSpeed", [0.4, 0.7, 1.0, 1.3, 1.6, 1.8],
  (v) => ({ robot: { maxSpeed: v } }),
  (r) => {
    const d = deviation(r.pair);
    const cost = robotCost(r.treated, r.control, DT);
    return { meanDeviationM: d.meanM, maxDeviationM: d.maxM, pedTimeLostS: pedestrianTimeLost(r), robotArrivalS: cost.treatedArrivalS };
  });

// ---- E4: once it has gone, is everything back to normal? --------------------------------------
sweep("e4_recovery", "passingOffsetM", [0, 0.5, 1, 1.5, 2, 3],
  (v) => ({ robot: { startXY: [2, 6.5 - v], goalXY: [20, 6.5 - v] } }),
  (r) => {
    const d = deviation(r.pair);
    // Tolerance as a fraction of this run's own peak. A fixed 5 cm sat below the residual
    // deviation, so recovery never registered and every cell read NaN — which looks like "never
    // recovers" and is actually "the question was asked wrong".
    const rec = recovery(d.series, d.maxAtStep, DT, 0.25 * d.maxM, 20);
    const finalDeviation = d.series[d.series.length - 1]!;
    return {
      peakDeviationM: d.maxM,
      finalDeviationM: finalDeviation,
      fractionRecovered: 1 - finalDeviation / d.maxM,
      recoveryS: rec.recoveryS,
      pedTimeLostS: pedestrianTimeLost(r),
    };
  });

// ---- E5: can it affect somebody it never went near? -------------------------------------------
// Binned by each person's own closest approach rather than by a fixed exclusion radius: in a
// 22x13 m room with a robot crossing the middle, no pedestrian ever stays more than about 4 m
// away, so the fixed-radius version measured an empty set and reported NaN.
{
  const edges = [0, 1, 2, 3, 4, 5, 7];
  const buckets: number[][] = edges.slice(0, -1).map(() => []);
  const counts: number[] = edges.slice(0, -1).map(() => 0);
  // More seeds than the other experiments: the far bins are sparse by construction, since
  // few people in a 13 m room manage to stay 5 m from a robot crossing the middle of it.
  for (const s of [...SEEDS, 8, 9, 10, 11, 12, 13, 14, 15]) {
    const r = runPair(cfg(s, { crowd: { nPedestrians: 40 } }));
    const robot = r.treated.robotPositions!;
    const d = deviation(r.pair);
    for (let i = 0; i < r.control.positions.length; i++) {
      const path = r.control.positions[i]!;
      let minD = Infinity;
      for (let st = 0; st < path.length / 2; st++) {
        const dx = path[2 * st]! - robot[2 * st]!;
        const dy = path[2 * st + 1]! - robot[2 * st + 1]!;
        const dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < minD) minD = dd;
      }
      for (let b = 0; b < edges.length - 1; b++) {
        if (minD >= edges[b]! && minD < edges[b + 1]!) {
          buckets[b]!.push(d.perAgentM[i]!);
          counts[b]!++;
        }
      }
    }
  }
  const rows: Point[] = [];
  for (let b = 0; b < edges.length - 1; b++) {
    rows.push({
      closestApproachFromM: edges[b]!,
      closestApproachToM: edges[b + 1]!,
      meanDeviationM: meanOf(buckets[b]!),
      nPeople: counts[b]!,
    });
  }
  facts["e5_propagation"] = { axis: "closestApproachFromM", nSeeds: SEEDS.length, rows };
  console.log("\n== e5_propagation (binned by closest approach) ==");
  const keys = Object.keys(rows[0]!);
  console.log(keys.map((k) => k.padStart(22)).join(""));
  for (const r of rows) console.log(keys.map((k) => (r[k] as number).toFixed(3).padStart(22)).join(""));
}

// ---- E6: what if it cannot see properly? ------------------------------------------------------
sweep("e6_perception", "positionSigmaM", [0, 0.1, 0.2, 0.4, 0.6, 0.8],
  (v) => ({ perception: { positionSigmaM: v } }),
  (r) => {
    const d = deviation(r.pair);
    const cost = robotCost(r.treated, r.control, DT);
    const cl = clearance(r.treated.robotPositions, r.treated.positions, SIM_CONSTANTS.robotRadiusM, SIM_CONSTANTS.pedRadiusM, 0.5);
    return { meanDeviationM: d.meanM, robotPathM: cost.treatedPathM, minClearanceM: cl.minM, nearMissEpisodes: cl.nearMissEpisodes };
  });

// ---- E7: the robot could go around. is it worth it? -------------------------------------------
sweep("e7_politeness", "deflectionWeight", [0, 0.25, 0.5, 1, 2, 3, 4, 6],
  (v) => ({ robot: { deflectionWeight: v } }),
  (r) => {
    const d = deviation(r.pair);
    const cost = robotCost(r.treated, r.control, DT);
    return { meanDeviationM: d.meanM, robotArrivalS: cost.treatedArrivalS, robotPathM: cost.treatedPathM };
  });

// ---- the confounding squeeze, which is the site's thesis --------------------------------------
{
  const rows: Point[] = [];
  for (const h of [4, 8, 16, 24, 30, 40, 50, 60]) {
    const reports: number[] = [], floors: number[] = [], trues: number[] = [];
    for (const s of SEEDS) {
      const real = runPair(cfg(s));
      const zero = runPair(cfg(s, { pedestriansSeeRobot: false }));
      reports.push(cvmResidual(real.pair, h, ACTIVE_STEP).value);
      floors.push(cvmResidual(zero.pair, h, ACTIVE_STEP).value);
      trues.push(paired(real.pair).value);
    }
    rows.push({
      horizonS: h * DT,
      trueEffectM: meanOf(trues),
      reportsM: meanOf(reports),
      zeroEffectFloorM: meanOf(floors),
      reportsOverFloor: meanOf(reports) / meanOf(floors),
    });
  }
  facts["confounding_squeeze"] = { axis: "horizonS", nSeeds: SEEDS.length, rows };
  console.log("\n== confounding_squeeze ==");
  const keys = Object.keys(rows[0]!);
  console.log(keys.map((k) => k.padStart(18)).join(""));
  for (const r of rows) console.log(keys.map((k) => (r[k] as number).toFixed(4).padStart(18)).join(""));
}

// ---- the detection floor, and its dependence on how many people you pooled ---------------------
// Page 7's sharpest claim is that the floor is not a property of the world but a property of your
// sample, so the sweep is over pool size rather than over anything physical.
{
  const perm = seededPermutations(20260816);
  const rows: Point[] = [];
  for (const nPedestrians of [8, 12, 18, 24, 32, 44]) {
    const floors: number[] = [];
    const means: number[] = [];
    for (const s of SEEDS) {
      // Measured on the ROBOT-ABSENT arm: a population that carries no robot effect at all.
      const control = runPair(cfg(s, { crowd: { nPedestrians } })).control.positions;
      const nullResult = splitHalfNull(control, 40, perm);
      floors.push(nullResult.floor);
      means.push(nullResult.mean);
    }
    rows.push({
      nPedestrians,
      floorM: meanOf(floors),
      floorM_sd: sdOf(floors),
      nullMeanM: meanOf(means),
    });
  }
  facts["detection_floor"] = { axis: "nPedestrians", nSeeds: SEEDS.length, rows };
  console.log("\n== detection_floor ==");
  const keys = Object.keys(rows[0]!).filter((k) => !k.endsWith("_sd") && !k.endsWith("_n"));
  console.log(keys.map((k) => k.padStart(16)).join(""));
  for (const r of rows) console.log(keys.map((k) => (r[k] as number).toFixed(3).padStart(16)).join(""));
}

mkdirSync("web/data", { recursive: true });
writeFileSync("web/data/experiment-facts.json", JSON.stringify(facts, null, 2) + "\n");
console.log("\nwrote web/data/experiment-facts.json");
