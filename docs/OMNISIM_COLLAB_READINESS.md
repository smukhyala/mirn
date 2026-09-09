# MIRN × OmniSim Collaboration Readiness

**Status:** internal call-prep audit. Written 2026-09-09 against `main` at `fa96531`.
**Scope:** what MIRN *actually* is today, not what it could be. Nothing here was implemented; this
document changed no code.

Every claim below traces to a file path or a symbol. Where something could not be verified from the
repository it is marked **UNVERIFIED** and left that way.

---

## 1. Executive Summary

- **The integration boundary already exists and is already simulator-agnostic.**
  `web/engine/contracts/` defines `Trajectory`, `Scene` and `PairedRun` as plain frozen records with
  no reference to MIRN's simulator. `runPair` is *one producer* of them. A second producer is
  structurally possible today.
- **There is direct precedent in git history.** `src/mirn/data/base.py` still defines a
  `DatasetAdapter` ABC whose contract is `load(condition) -> tuple[Scene, ...]`, and a deleted
  `PeroiAdapter` (`git show 29b57ee^:src/mirn/data/peroi.py`) mapped a long-format
  `agent_id, frame, x, y` CSV into `Scene`s. That is very close to the proposed OmniSim output.
- **But only 5 of MIRN's 14 reader-facing metrics consume `PairedRun`.** The other nine reach past
  it into simulator-internal structures: raw uid-ordered buffers, an `arrivedTick` field, hardcoded
  body radii in `SIM_CONSTANTS`, or the ability to *re-run the simulator*.
- **Three numbers cannot be computed from a delivered trajectory file at all.** The run-to-run band
  and the widest normal gap call `replicateBand(config)`, which re-simulates 8 robot-absent runs. The
  forecaster's zero-reference calls `runPair()` again with `pedestriansSeeRobot: false`. A file
  cannot supply these; only a callable simulator can.
- **That is a product constraint, not only an engineering one.** Guardrail 6 forbids showing a
  perturbation number without saying what it reads when the answer is zero. The band and the
  zero-run *are* those zeroes. So "MIRN ingests OmniSim files" is not a complete feature unless
  OmniSim can also be asked for the null runs.
- **The existing "read in real trajectories" path is a deliberate dead end and cannot be reused.**
  `web/engine/fit/recording.ts` reduces a recording to a pooled bag of speeds and never constructs a
  `Trajectory`. That is guardrail 11 made structural. An OmniSim adapter is a *new* path, not an
  extension of this one, and pitching it as the latter will confuse the discussion.
- **Answer to "could I hand MIRN a JSON file today?" — no.** Four concrete blockers, listed in §5.
  There is no `JSON.parse` anywhere in `web/`, CSV is export-only, and there is no import path of any
  kind.
- **Determinism and pairing are the strongest parts of the codebase.** The noise tape is a pure
  function of `(seed, tick, uid, channel)`; `runArm` takes a tape rather than a seed, so it is
  *structurally* incapable of giving the two arms different randomness. `makePairedRun` asserts
  bit-identical first positions — stricter than the Python side.
- **The argument that most helps on the call:** guardrail 11 forbids real recordings from producing
  a disturbance number because *a corridor cannot be filmed twice*. A simulator **can** be run twice.
  OmniSim trajectories are therefore paired-capable, and that specific refusal does not apply to
  them. This is the cleanest justification for the collaboration and it should be said early.
- **The guardrail that actually needs an owner's decision is 11's "no physics-engine dependency"**,
  plus guardrail 10's absolute ban on servers, network and storage. Neither is a technical problem;
  both are decisions only Sanjay can make. See §8.

---

## 2. Current MIRN Architecture

### 2.1 Shape of the thing

A **static site**. No backend, no server, no database, no runtime dependencies. `package.json` lists
seven devDependencies (TypeScript, Vite, Vitest, jsdom, fast-check, two `@types`) and **zero**
runtime dependencies. Vite builds five hand-written HTML pages from `web/` into `dist/`.

A **Python package** (`src/mirn/`) survives from the project's research era. It is not shipped to the
browser and is not a backend. Its only live job is to be the **numerical oracle**: it computes
reference answers for every formula that exists in both languages, writes them to
`tests/golden/parity/`, and CI asserts the browser reproduces them.

### 2.2 Real data flow

```
  URL query string                 panel controls
  web/app/console/permalink.ts     web/app/console/panel.ts
            \                          /
             \                        /
              v                      v
        RunConfigOverrides  --AXES[key].apply()-->  RunConfig
        web/engine/job/axes.ts        web/engine/contracts/config.ts
                          |
                          |  packaged as a SweepJob (axis, axisValues, seedIndices, columns, ...)
                          |  web/engine/job/spec.ts
                          v
              planSweep() -> WorkPlan of Units
              web/engine/job/plan.ts
                          |
                          v
   +====================== runPair(config) ==========================+
   |  web/engine/sim/run.ts                                          |
   |                                                                 |
   |   makeTape(seed)                 -> spawnTape  \                |
   |   makeTape(mix4(seed,replicate)) -> noiseTape   |  ONE tape     |
   |   web/engine/rng/tape.ts                        |  TWO consumers|
   |                                                 v               |
   |   runArm(cfg, spawnTape, noiseTape, "treated", withRobot=true )  |
   |   runArm(cfg, spawnTape, noiseTape, "control", withRobot=?    )  |
   |          |                                                      |
   |          |  per tick: perceive -> planRobot -> forces -> step    |
   |          |  web/engine/sim/{perceive,robot,forces,world}.ts      |
   |          v                                                      |
   |   ArmResult { scene, positions[], robotPositions, arrivedTick }  |
   |          |                                                      |
   |          v                                                      |
   |   makePairedRun(treated.scene, control.scene, treatment)         |
   |   web/engine/contracts/pairedRun.ts   <-- INVARIANTS ASSERTED    |
   +=================================================================+
                          |
                          |  RunResult { config, pair, treated, control, timingMs }
                          v
        optional extras, each re-running the simulator:
          replicateBand(config, 8)      -> RunToRunBand   [8 more runPair calls]
          runPair(cfg + blindfold)      -> zeroRun        [1 more runPair call]
          splitHalfNull(control.positions, ...) -> floor  [no re-run; plain arrays]
                          |
                          v
        buildContext(...) -> ReportContext
        web/engine/job/report.ts:271
          { config, params, run, deviation, band, floor, zeroRun, frechetMeanM, straightLineM }
                          |
                          v
        runReport(ctx, keys) -- COLUMNS[key].extract(ctx) --> Reading per column
        web/engine/job/columns.ts   (closed catalogue, 14 entries)
                          |
                          v
        accumulate() / aggregate() across seeds -> Aggregate per cell
        web/engine/job/{runner,stats}.ts
                          |
        +-----------------+-----------------+------------------+
        v                 v                 v                  v
   readout tiles      sweep table       line plots         CSV export
   console/tile.ts    console/table.ts  ui/plot.ts         console/csv.ts
                                        console/curve.ts
                                                            (EXPORT ONLY -
   canvas replay: ui/arena.ts <- console/playback.ts         no import path)
     re-simulates the selected run from its key
```

### 2.3 Component map

| Component | Files | Notes |
|---|---|---|
| Contracts / data model | `web/engine/contracts/{config,trajectory,scene,pairedRun}.ts` | Mirrored in `src/mirn/contracts.py`. **This is the integration surface.** |
| RNG | `web/engine/rng/{mulberry32,tape}.ts` | `NoiseTape = (tick, uid, channel) => number`. No global RNG; `Math.random` throws in the engine suite. |
| Simulator | `web/engine/sim/{run,world,state,forces,anticipatory,robot,perceive,disturbance}.ts` | Struct-of-arrays over `Float64Array`. Two crowd kernels. |
| Measurement (oracle-backed) | `web/engine/measure/{kernels,metrics}.ts`, `measure/divergence/`, `measure/estimator/`, `measure/null/` | Only directory with a Python oracle. `Math.hypot` banned here. |
| Job / report layer | `web/engine/job/{columns,axes,report,runner,plan,spec,stats,cards,families,questions,powerCurve,supplied,...}.ts` | Closed catalogues. Joins and gates; no arithmetic that needs an oracle. |
| Workers | `web/app/worker/{client,pump,protocol}.ts` + `probe.*`, `supplied.*`, `fit.*`, `sweep.worker.ts` | Four separate worker protocols. Types-only message unions; functions never cross. |
| Console UI | `web/app/console/*.ts` (~8,000 lines), `web/console.ts` | Direct DOM; no framework, no state library. |
| Visualization | `web/ui/{arena,plot,labels,theme}.ts` | Bespoke Canvas 2D. No charting library. |
| Recording ingestion (fit only) | `web/engine/fit/{recording,distance,search}.ts`, `web/fit.ts` | Reads a real recording; **cannot** produce a trajectory. See §5.4. |
| Python oracle | `src/mirn/` (33 modules) | `contracts`, `divergence/`, `estimator/`, `calibration/`, `data/`, `experiments/`, `viz/`, `method/`. |
| Parity fixtures | `tests/golden/parity/*.json` (8 files) | Tolerances declared *in the fixture* by the oracle author. |

### 2.4 The five pages

`web/index.html` (console), `web/how.html` (the arithmetic in sentences), `web/drill.html` (referee
drill), `web/method.html` (method card), `web/fit.html` (fit page). Listed by hand in
`vite.config.ts`; `disclosure.test.ts` reads that input map and asserts every page links every other.

### 2.5 What does not exist

Traced and confirmed absent, so nobody assumes otherwise on the call:

- No backend, no API, no persistence. `nostorage.test.ts` greps every `.ts`, `.html` and `.css` under
  `web/` for `localStorage`, `sessionStorage`, `IndexedDB`, `fetch`, `XMLHttpRequest`, `WebSocket`.
- No `JSON.parse` anywhere in `web/`.
- No trajectory import. No trajectory *export* either — CSV carries aggregated readings only.
- No obstacles or static map. Geometry is `widthM` × `heightM` with soft walls.
- No orientation, no velocity field, no per-sample timestamps, no collision-event records, no
  completion state in the data model.
- No charting library; no 3D; no ROS; no physics engine.

---

## 3. Current Paired-Run System

The most important section for the call. Question by question.

### Does MIRN actually execute two paired worlds?

**Yes, genuinely two.** `runPair` (`web/engine/sim/run.ts`) calls `runArm` twice, to completion, and
neither arm is derived from the other by arithmetic. The control arm is a real simulation, not the
treated arm minus an offset.

Contrast with the Python `SyntheticAdapter`, where the counterfactual *is* the pre-robot trajectory
and the factual is that plus an analytic displacement. That one is a fixture, not a simulator, and
its own docstring says so. **The browser's is the real thing.**

### What differs between them?

Exactly one declared thing, typed as `TreatmentSpec` (`contracts/pairedRun.ts`):

```ts
export type TreatmentSpec =
  | { readonly kind: "none" }
  | { readonly kind: "robot-presence" }
  | { readonly kind: "disturbance"; readonly disturbanceId: string };
```

- `robot-presence` — treated has the robot, control has none. This is the default and it mirrors
  Python's `RolloutPair` semantics exactly.
- `disturbance` — the robot is in **both** arms; the control arm's disturbance list is the treated
  list minus exactly that one spec. `runPair` throws if the named id is not in the list, because the
  arms would then be identical and the pair would identify nothing.
- `none` — the null treatment. Both arms identical; used by `lockstep.test.ts`.

### What is held constant?

Seed, config, initial state, and exogenous noise — the last **by construction**, which is the design's
best idea.

### Is randomness deterministic? Is there an explicit seed?

Yes to both, and more strongly than usual. `web/engine/rng/tape.ts`:

```ts
export type NoiseTape = (tick: number, uid: number, channel: Channel) => number;

export function makeTape(seed: number): NoiseTape {
  const base = seed | 0;
  return function tape(tick, uid, channel) {
    return toUnit(mulberry32Raw(mix4(base, tick, uid, channel)));
  };
}
```

There is **no cursor and no stream**. The value at an address is a pure function of that address, so
there is nothing for the two arms to keep in step and no way for a third draw to desynchronise them.
`runArm`'s signature takes a `NoiseTape`, **not a seed** — so it is structurally incapable of
constructing a differently-seeded generator for one arm. That is a type-level guarantee rather than
a convention.

Eight named channels (`NoiseX`, `NoiseY`, `PerceptX`, `PerceptY`, `PerceptMiss`, `SpawnX`, `SpawnY`,
`SpawnGoalY`) mean the robot's perception error for a given person at a given tick is the *same draw*
whether or not the robot happened to look at them.

Two tapes: `spawnTape` from the seed alone, `noiseTape` from `mix4(seed, replicate, 0, 0)`. Deliberate
— a replicate must be the *same crowd* with a different roll of the dice. The comment records that
mixing the replicate into placement made every replicate a different crowd and inflated the
run-to-run band to room scale (11 m).

`RunConfig.seed` is an explicit integer, validated. `runPair(config)` is a pure function of the
config. `determinism.test.ts` compares **bytes**, not approximations.

### Are initial agent states identical? Are agent identities preserved?

Yes and yes, and both are asserted rather than assumed.

`initialState` is called with the same tape and the same config in both arms, so they start identical
by construction rather than by a copy step. `makePairedRun` then verifies:

```ts
// STRICTER THAN PYTHON, deliberately. contracts.py allows 1e-9 because third-party adapters
// have to be accommodated. Here both arms come out of one function against one noise tape, so
// any difference at all at t=0 means the tape leaked arm state.
if (treatedTrajectory.positions[0] !== controlTrajectory.positions[0] ||
    treatedTrajectory.positions[1] !== controlTrajectory.positions[1]) { fail(...) }
```

**Note that 1e-9 tolerance in Python and why it exists: it is there precisely to accommodate
third-party adapters.** That is a direct signal for the OmniSim work — see §6.

Identity: `agentUid: number` is assigned in `initialState` (base pedestrians take `0..n-1`,
disturbance-injected agents start at `INJECTED_UID_BASE = 10000`, robot is `-1`), and `agentIdFor`
maps it to `ped{uid}` / `inj{uid}` / `robot`. `makePairedRun` asserts the two arms have **identical
`agentId` sets** and `makeScene` asserts no duplicate id or uid within an arm.

### How are trajectories aligned between runs?

By `agentId`, sorted, via `pairedAgents(pair)`. Never by array index.

```ts
export function pairedAgents(pair: PairedRun): readonly (readonly [Trajectory, Trajectory])[]
```

Time alignment is implicit: both arms share `dt`, share `t0 = 0`, and share `nSteps`, so sample *i*
is the same instant in both.

**There is a live footgun here and the codebase documents it as one.** `deviation().perAgentM[i]`
belongs to `pairedAgents(pair)[i]`, which is ordered by **string-sorted** agent id —
`ped0, ped1, ped10, ped2`. But `ArmResult.positions[i]` is ordered by **uid**. Joining those two
positionally silently rebinds every person from the eleventh onward to a stranger, **and it shipped
once**. `perAgentDeviationByUid` exists as the only supported way to ask what one person's
displacement was.

### What happens if simulations have different lengths?

**It throws.** `makePairedRun` fails on unequal `nSteps` per shared agent, and again if any agent's
`nSteps` differs from the others'. Its comment: *"Both arms are generated by one call over a fixed
tick count, so unequal length is a bug rather than an adapter quirk."*

That comment is written from the assumption that MIRN owns the simulator. **Under an OmniSim
integration it stops being true** — two runs of an external simulator can legitimately terminate at
different times (goal reached, timeout, collision abort). See §8, BLOCKERS.

There is machinery that could help: `resampleTo(trajectory, dt)` in `contracts/trajectory.ts` does
linear interpolation onto a new uniform grid. It is parity-pinned (a `+ 1e-9` decides output length
and has its own fixture case) and it does **not** truncate or pad — it regrids, so unequal spans
still produce unequal `nSteps`.

### How does MIRN distinguish normal movement from robot-induced movement?

This is the entire point of the project, and it does it three ways:

1. **The paired difference itself** — `paired()` in `measure/estimator/index.ts` is the mean over
   agents of ADE between each person's two paths. Because nothing but the treatment can differ, the
   gap *is* the robot's effect. Its `identification` string says so: *"nothing is estimated."*
2. **The run-to-run band** — `replicateBand(config, 8)` runs 8 **robot-absent** replicates that differ
   only in exogenous noise and takes the 95th percentile of the pairwise mean gap. That is how far
   apart two runs of the same room drift with nothing done to either. Any reading inside it is not
   distinguishable from ordinary variation.
3. **The detection floor** — `splitHalfNull(pedestrianPaths, nSplits, permutations, alpha, stride)`
   splits one robot-absent crowd into two disjoint halves and measures the gap between them.

The blindfold (`pedestriansSeeRobot: false`) is the cleanest demonstration on the site: the true
effect is **exactly zero** while the forecaster's number is not.

### Is the counterfactual truly generated independently?

**Yes, and that is unusually strong.** It is a full independent simulation sharing only the seed, the
config and one addressable noise tape. Nothing is subtracted, offset or reconstructed.

### Weaknesses and assumptions in the current paired system

Named plainly, because they all become negotiation items:

1. **`makePairedRun` is only reachable from `runPair`.** Its own comment: *"`makePairedRun` is not
   re-exported from the engine entry point, so there is no way to hand-assemble a mismatched pair from
   outside."* That is a deliberate safety property today and **exactly the wall an OmniSim adapter
   hits.** It is a re-export decision, not a redesign, but it is a decision.
2. **Equal-length and equal-agent-set are hard assertions with no tolerance and no reconciliation.**
   Fine for one simulator; brittle for two.
3. **Bit-identical first positions.** Correct for MIRN's own arms. An external simulator that writes
   float32, or serialises through JSON decimal text, will not round-trip bit-identically. Python's
   1e-9 path exists for this and TypeScript's does not.
4. **The uid is load-bearing beyond identity.** It addresses the noise tape. An adapter must
   synthesize uids, and they mean nothing to OmniSim.
5. **The band and the zero-run need a *callable* simulator, not a file.** Structural, and the deepest
   issue in this document.
6. **`arrivedTick` is simulator-internal state that leaked into the metric layer.** It is set inside
   `stepWorld` and read by `arrivalSecondsOf`. It is not in `Scene`, so it does not survive the
   contract boundary. An adapter has nowhere to put OmniSim's completion state.

---

## 4. Perturbation Metrics

### 4.1 The numeric layer — `web/engine/measure/`

This is the only directory with a Python oracle (guardrail 9). Everything here takes **plain
`Float64Array` buffers or a `PairedRun`** — nothing here imports the simulator except `metrics.ts`,
which imports `RunResult` as a type for `robotCost`.

#### Divergences — `web/engine/measure/divergence/index.ts`

| Name | Inputs | Formula | Output | Oracle |
|---|---|---|---|---|
| `ade(a, b)` | two flat `[T,2]` buffers | mean over steps of Euclidean distance | metres | `divergence.ade.between_paths` |
| `fde(a, b)` | two flat `[T,2]` buffers | Euclidean distance at the final step | metres | `divergence.fde.between_paths` |
| `adeBetweenClouds(a, b)` | two clouds | ADE generalised to point clouds | metres | `divergence.ade.between_clouds` |
| `fdeBetweenClouds(a, b)` | two clouds | FDE generalised to point clouds | metres | `divergence.fde.between_clouds` |
| `frechet(a, b)` | two flat `[T,2]` buffers | discrete Fréchet ("shortest leash") | metres | `divergence.frechet.between_paths` |

**Assumptions:** both buffers same length; uniform time grid; index *i* is the same instant in both.
Property-tested for non-negativity, exact zero on identical inputs, symmetry, translation and
rotation invariance, monotonicity under injected deviation. *Bitwise* translation invariance holds
only for integer coordinates — asserting it for arbitrary doubles asserts something false.

`sinkhorn_w2` exists in Python only and is deliberately unported (every step is `exp`/`log`, not
bit-portable; a tolerance-based stopping rule halts at different iteration counts).

#### Estimators — `web/engine/measure/estimator/index.ts`

**`paired(pair: PairedRun): Estimate`**
- **Inputs:** a `PairedRun` and nothing else.
- **Formula:** mean over agents of `ade(treated.positions, control.positions)`, agents from
  `pairedAgents()`.
- **Output:** `{ value, nSamples, estimatorName, divergenceName, identification }`.
- **Intent:** the true, unconfounded robot effect.
- **Assumption:** the identifying one, and it is met by construction here — *"Both runs share a seed,
  a starting state and an exogenous noise draw, and differ only in whether the robot is there…
  nothing is estimated."*
- **Portability: fully portable.** Consumes only the contract. Oracle: `estimator.paired.per_run`.

**`cvmResidual(pair, horizonSteps, endStep?): Estimate`**
- **Inputs:** the **treated arm only** (the control is never consulted), a horizon, an end step.
- **Formula:** fit a velocity from the two samples ending `horizonSteps` before `endStep`, roll it
  forward at constant velocity, report the mean Euclidean residual over the horizon.
- **Intent:** to *impersonate* what published work has to do without a counterfactual — this is the
  method being critiqued.
- **Assumption:** explicitly `UNMET`. Its identification string opens with the word and says the
  number contains every reason a person might not walk straight, all of which would be there with no
  robot in the room.
- **`endStep` is required in practice.** These pedestrians arrive and park; by the end of the episode
  the room is motionless, a constant-velocity forecast of a stationary person is exactly right, and
  the estimator reads `0.0000` no matter how bad it is.
- **Portability: fully portable.** Oracle: `estimator.cvm_residual.per_run`.

#### Nulls — `web/engine/measure/null/`

**`splitHalfNull(pedestrianPaths, nSplits, permutations, alpha, stride): SplitHalfNull`**
- **Inputs:** a plain `readonly Float64Array[]` — **not a `PairedRun`, not a `Scene`.**
- **Formula:** split one robot-absent crowd into two disjoint halves, measure the cloud divergence,
  repeat over injected permutations, take the `alpha` quantile.
- **Portability: fully portable — the most portable thing in the codebase.** Takes raw arrays.
  Permutation source is injectable, which is how the parity fixture makes both languages run
  identical splits. Oracle: `calibration.split_half_null.floor`.

**`replicateBand(config: RunConfig, nReplicates = 8): RunToRunBand`**
- **Inputs:** a `RunConfig`. **Not trajectories.**
- **Formula:** run 8 **robot-absent** replicates differing only in exogenous noise; 95th percentile of
  the pairwise mean gap (`value`) and of the pairwise peak gap (`peakValue`).
- **Portability: NOT PORTABLE.** It re-runs the simulator. It has no oracle and is explicitly not a
  two-implementation item.
- **Note the recorded bug:** the first version used `treatment: none`, which leaves the robot in both
  arms and folded the robot's own chaotic amplification into a "nothing happened" null. The tell was
  that `repulsionScale` moved the band at all.

#### Composed measurements — `web/engine/measure/metrics.ts`

| Function | Inputs | Output | Portable? |
|---|---|---|---|
| `deviation(pair)` | `PairedRun` | `{ series, meanM, maxM, maxAtStep, perAgentM }` | **Yes** |
| `robotCost(treated, control)` | two `ArmResult`s | `{ extraPathM, treatedPathM, controlPathM }` | Only needs `.robotPositions` |
| `clearance(robotPath, pedPaths, robotRadiusM, pedRadiusM, thresholdM)` | plain arrays **+ radii as arguments** | `{ minM, minAtStep, nearMissEpisodes, thresholdM }` | **Yes — radii are parameters** |
| `recovery(series, disturbanceStep, dt, toleranceM, dwellSteps)` | plain array + params | `{ recoveryS, censored, peakM, peakAtS, toleranceM }` | **Yes** |

Two design decisions worth quoting on the call, because they are exactly the ambiguities two teams
will define differently:

- `clearance` counts **episodes, not ticks**. *"Counting ticks below a threshold makes the 'safety'
  number scale with 1/dt, which is a wonderful demonstration of a metric that depends on your
  simulator settings rather than on the world — but a terrible default."*
- `robotCost.extraPathM` is **signed**. A shove toward the goal genuinely shortens the path and
  clipping it to zero would be a lie.
- Clearance is **surface to surface**: `distance − (robotRadius + pedRadius)`. It can go negative.

### 4.2 The reader-facing layer — the 14 columns

`web/engine/job/columns.ts`. Closed catalogue, no `register`, nothing added at runtime. Each entry
carries an `assumption`, a `zero`, a unit, a plain-English label, and a `corridorReadable` flag
(*could a real corridor produce this number?* — false for anything reading the run without the robot;
proved, not asserted, by `unpaired.test.ts` swapping in a decoy control arm).

| Column | Unit | Corridor-readable | Computed from | **Portable to external trajectories?** |
|---|---|---|---|---|
| `trueEffectM` | m | no | `paired(ctx.run.pair)` | **Yes** |
| `worstMomentM` | m | no | `ctx.deviation.maxM` | **Yes** |
| `forecastReportM` | m | **yes** | `cvmResidual(ctx.run.pair, ...)` | **Yes** |
| `forecastZeroM` | m | no | `cvmResidual(ctx.zeroRun.pair, ...)` | Formula yes; **needs a re-run** to get `zeroRun` |
| `runToRunBandM` | m | no | `ctx.band` ← `replicateBand(config)` | **No — needs 8 re-runs** |
| `worstMomentNullM` | m | no | `ctx.band.peakValue` | **No — needs 8 re-runs** |
| `detectionFloorM` | m | no | `splitHalfNull(run.control.positions, ...)` | **Yes** (plain arrays) |
| `robotPathM` | m | **yes** | `pathLength(ctx.run.treated.robotPositions)` | Yes, if the adapter supplies a robot path |
| `robotArrivalS` | s | **yes** | `arrivalSecondsOf(ctx.run.treated, dt)` → **`arrivedTick`** | **No — simulator-internal field** |
| `extraPathM` | m | no | `robotCost(treated, control)` | Yes, if both arms have a robot path |
| `pedestrianTimeLostS` | s | no | `pedestrianTimeLost(ctx.run, dt)` — **positional join** on `ArmResult.positions` | Yes, but adapter must preserve uid ordering in both arms |
| `minClearanceM` | m | **yes** | `clearanceAfterBothMove(..., SIM_CONSTANTS.robotRadiusM, SIM_CONSTANTS.pedRadiusM, ...)` | **Partially — radii hardcoded to MIRN's** |
| `nearMissEpisodes` | count | **yes** | same, `.nearMissEpisodes` | **Partially — same** |
| `recoveryS` | s | no | `recovery(ctx.deviation.series, ...)` | **Yes** (+ `ctx.config.dt`) |
| `frechetMeanM` | m | no | mean `frechet` over `pairedAgents` | **Yes** |

**Summary of the coupling:** 6 columns are cleanly portable, 3 more are portable given an adapter
that preserves ordering and supplies a robot path, 2 are portable only if the body radii become
inputs, 1 depends on a simulator-internal field with nowhere in `Scene` to live, and 2 (plus the
zero-run behind a third) require the ability to *call* the simulator again.

### 4.3 Classification against the proposed v0 MIRN outputs

Strict: **READY** means the current implementation could consume externally supplied trajectories
with minimal or no change.

| v0 output | Verdict | Why |
|---|---|---|
| **Aggregate displacement** | **READY** | `paired(pair)` and `deviation(pair).meanM` consume `PairedRun` and nothing else. Both are oracle-backed and parity-pinned. Hand it a valid `PairedRun` and it produces the number today. The only work is constructing the `PairedRun`. |
| **Peak displacement** | **READY** | `deviation(pair).maxM` plus `maxAtStep`. Same reasoning. Exposed as `worstMomentM`. |
| **Minimum separation** | **PARTIALLY READY** | The *kernel* is ready — `clearance()` takes radii as explicit parameters. The *column* is not: `minClearanceM` hardcodes `SIM_CONSTANTS.robotRadiusM` (0.32) and `pedRadiusM` (0.24). MIRN also defines it **surface to surface** and gates it on "both robot and a person have left where they were standing" (`clearanceAfterBothMove`). Both are definitional choices OmniSim will not share by default. |
| **Displaced-agent count** | **NOT IMPLEMENTED** | No thresholded count of affected agents exists anywhere. The ingredient exists — `deviation().perAgentM` is a per-agent mean, and `perAgentDeviationByUid` maps it safely to uids — but nothing counts how many exceed a threshold, and no threshold is defined. It would also need a `zero` under guardrail 6, and "how many agents does the band alone displace" is a question nobody has answered here yet. **This is a new metric, not an exposure of an existing one.** |
| **Plots** | **PARTIALLY READY** | `web/ui/plot.ts` is a real, tested line-plot renderer (~290 lines, monochrome, censored-point-aware) and `web/ui/arena.ts` is a real canvas replay (~377 lines). Both are pure functions of their arguments. But `web/app/console/curve.ts` — the only thing that builds series for them — reads the console's `Aggregate` maps, and `arena.ts` is driven by `playback.ts`, which **re-simulates the selected run from its key** rather than replaying stored trajectories. Feeding external trajectories to the arena needs a playback path that does not re-simulate. Python's `src/mirn/viz/figures.py` is a separate, paper-figure path with its own theme fixtures. |

**Nothing is READY that would survive a strict reading of "and shows its zero."** Both READY entries
are readings whose zero-references (`worstMomentNullM`, and the exact-zero blindfold claim) come from
the band and the re-run machinery. The arithmetic is ready; the *presentation contract* is not.

---

## 5. Current Trajectory / Data Model

### 5.1 The types, in full

```ts
// web/engine/contracts/trajectory.ts
export interface Trajectory {
  readonly kind: "trajectory";
  readonly agentId: string;      // must match /^[a-z][a-z0-9_]*$/
  readonly agentUid: number;     // integer; -1 is the robot; >=10000 is injected
  readonly positions: Float64Array;  // FLAT [x0,y0,x1,y1,...], length 2*nSteps
  readonly nSteps: number;
  readonly t0: number;           // seconds
  readonly dt: number;           // seconds, > 0
}

// web/engine/contracts/scene.ts
export interface Scene {
  readonly kind: "scene";
  readonly sceneId: string;
  readonly pedestrians: readonly Trajectory[];
  readonly robot: Trajectory | null;
  readonly robotPresent: boolean;
  readonly source: string;       // the sim writes "sfm"
  readonly seed: number;
}

// web/engine/contracts/pairedRun.ts
export interface PairedRun {
  readonly kind: "pairedRun";
  readonly treated: Scene;
  readonly control: Scene;
  readonly treatment: TreatmentSpec;
  readonly seed: number;
  readonly nSteps: number;
}
```

So the answer to *"does MIRN have something like `{agent_id, timestamp, x, y, orientation}`?"* is:
**it has `{agent_id, x, y}` on a uniform time grid, per agent, column-major.** Not per-sample rows,
and no orientation.

### 5.2 Field-by-field

| Question | Answer |
|---|---|
| **Coordinate representation** | 2-D Cartesian, flat `Float64Array` with stride 2. Deliberately byte-identical to row-major `(T,2)` float64, so `np.frombuffer(buf).reshape(T,2)` round-trips exactly — that is what makes the parity fixtures exact. |
| **Units** | Metres and seconds throughout. Never pixels; `web/ui/` holds the only pixel constants and nothing in `web/engine/` reads them. |
| **Timestamps vs ticks** | **Neither, exactly — a uniform grid.** `t0 + dt*i`, materialised on demand by `times()`. There is **no per-sample timestamp field**, so irregular sampling is unrepresentable. Ticks appear in `RunConfig` (`nTicks`, `DisturbanceSpec.atTick`) and in `ArmResult.arrivedTick`, but never in `Trajectory`. |
| **Coordinate frames** | **One implicit frame, and it is never named.** Origin at a room corner; positive x right, positive y up; the room is `[0, widthM] × [0, heightM]`. There is no frame identifier, no transform, no `frame_id` anywhere. |
| **Orientation** | **Absent from the data model entirely.** The robot has a heading internally (`planRobot` computes `Math.atan2`) but it is never recorded — only positions are. `ui/arena.ts` derives a drawing heading from consecutive positions. |
| **Velocity** | **Absent from the data model.** `WorldState` carries `vx`/`vy` during simulation; they are not recorded. Every consumer differences positions. |
| **Agent IDs** | `agentId: string`, charset-constrained. `agentUid: number` is the real key. Uniqueness of both asserted in `makeScene`. |
| **Robot ID** | `agentId === "robot"`, `agentUid === -1` (`ROBOT_UID`). The robot is **not** in `pedestrians`; it is a separate `Scene.robot` field, and `Scene.robotPresent` is a separate boolean whose consistency with `robot === null` is asserted. |
| **Run IDs** | None as such. `Scene.sceneId` is built as `` `${arm}-${seed}-${replicate}` ``. Sweep runs are keyed by `RunKey { axisIndex, axisValue, seedIndex }` (`job/stats.ts`) — a *position in a sweep*, not an identity. |
| **Scenario IDs** | **None.** The nearest thing is the whole `RunConfig`, which is the identity: a run is a pure function of it. |
| **Collision events** | **Not represented anywhere.** `SIM_CONSTANTS.collisionRadiusM` / `collisionPenalty` are inputs to the robot's *planner cost*, not records of anything. `nearMissEpisodes` is derived post-hoc from the clearance series, and `metrics.ts` explicitly rejects a separate collision count as *"a lossy summary of the clearance series whose value depends on the timestep."* |
| **Metadata** | `Scene.source: string` (provenance) and `Scene.seed: number`. That is all. There is no arbitrary metadata bag, no machine/build attribution, no timestamps-of-recording. |
| **Completion state** | **Not in the contract.** It lives in `ArmResult.arrivedTick`, which is outside `Scene` and does not survive to the report layer except through `arrivalSecondsOf`. There is no censoring flag, no termination reason, no success/failure. |

### 5.3 The question: could I hand MIRN a JSON file today?

**No.** Four blockers, in order of how hard they are.

**1. There is no parser, and no import path of any kind.** `grep -rn "JSON.parse" web/` returns
nothing. CSV is export-only (`web/app/console/csv.ts` writes; nothing reads). The only file input on
the entire site is `web/fit.ts`'s `FileReader`, and it feeds the fit path (see §5.4). This is the
easy blocker — a parser is an afternoon.

**2. `makePairedRun` is not reachable.** Its own comment: *"`makePairedRun` is not re-exported from
the engine entry point, so there is no way to hand-assemble a mismatched pair from outside. Both arms
are driven by the same tape object."* This is a deliberate safety property. It is also a one-line
re-export — but it is a **decision**, because it removes the guarantee that every `PairedRun` in
existence came out of one function.

**3. The contract will reject plausible OmniSim data.** `agentId` must match
`/^[a-z][a-z0-9_]*$/` — so `agent-1`, `Ped_01`, `robot_2`, and any UUID all `fail()` at construction.
`agentUid` must be an integer and must be unique, so the adapter has to synthesize it and keep the
mapping stable across both arms. First positions must be **bit-identical** between arms, which JSON
decimal text or float32 will not guarantee. And `nSteps` must be equal across both arms and across
every agent.

**4. Even past all that, only 6 of 14 metrics would compute.** This is the blocker that does not go
away with parsing. `ReportContext` holds `run: RunResult`, and nine extractors reach into it:

- `robotArrivalS` needs `ArmResult.arrivedTick` — a field with **no home in `Scene`**.
- `minClearanceM` and `nearMissEpisodes` use `SIM_CONSTANTS.robotRadiusM` / `pedRadiusM` — MIRN's own
  body sizes, hardcoded at the column, not read from the data.
- `runToRunBandM` and `worstMomentNullM` call `replicateBand(config)`, which **runs the simulator 8
  more times**.
- `forecastZeroM` needs `zeroRun`, produced by `runPair(config + blindfold)` — **another run**.

**What you could do today with a JSON file, concretely:** parse it, build two `Scene`s, call
`makePairedRun` (once re-exported), and call `paired()`, `deviation()`, `frechet()` and
`splitHalfNull()` directly. That gives aggregate displacement, peak displacement, per-agent
displacement, the Fréchet reading and the detection floor. It would **not** go through
`ReportContext`, would produce no column readings, would render in no tile, and would carry no zero.
So: the *arithmetic* is reachable today; the *console* is not.

### 5.4 Why the existing "real trajectories" path cannot be reused

This will come up, so it is worth being precise. `web/fit.html` does read a real pedestrian recording
from the reader's disk, in a whitespace-or-comma format `frame person x y`, via `FileReader` at
`web/fit.ts:96`. That looks like exactly the ingestion path an OmniSim adapter wants.

**It is not, and the difference is structural rather than incidental.** `makeRecording` groups rows by
person, sorts each track by frame, **drops the identifiers**, and produces:

```ts
export interface Track {  readonly samples: Float64Array;  // flat [f0,x0,y0, f1,x1,y1, ...]
                          readonly nSamples: number; }
export interface Recording { readonly tracks: readonly Track[];
                             readonly framesPerSecond: number;
                             readonly nSamples: number; }
```

and then `speedsFrom(recording)` reduces the whole thing to a **pooled bag of per-step speeds**. That
bag is the only thing any downstream code sees. `speedDistance` compares two bags via a 19-rung
quantile ladder (a gridded 1-Wasserstein distance in m/s), and `fitCrowd` grid-searches two crowd
parameters against it.

No `Trajectory` is ever constructed. No `Scene`. No pairing. The module docstring states the reason
plainly: *"nothing in this module or anything downstream of it computes a displacement, a residual,
or a difference between two arms… structurally incapable of answering 'how much did the robot move
this crowd'."*

`fit-dom.test.ts` asserts this over the page's **source**, not its DOM, so it survives whatever the
page later renders.

**Consequence for the call:** an OmniSim adapter is a *new* second producer of `Scene`, parallel to
`runPair`. It is not an extension of the fit path and should not be described as one — partly because
it is untrue, and partly because the fit path's restriction exists for a reason that does not apply to
OmniSim (see §8's guardrail analysis).

### 5.5 Python's data model, and the adapter that already existed

`src/mirn/contracts.py` mirrors all three types. Differences that matter:

- Python's `Trajectory` has `agent_id: str` and **no `agent_uid`**. The uid is a browser addition,
  load-bearing for the noise tape.
- Python's `RolloutPair` hard-codes the intervention (factual has a robot, counterfactual does not);
  the browser's `TreatmentSpec` generalises it.
- **Python's first-position check allows 1e-9, and its comment says why: *"because third-party
  adapters have to be accommodated."*** The browser tightened this to bitwise on the grounds that both
  arms come from one function. Under OmniSim that ground disappears.

And `src/mirn/data/base.py` still ships the extension point:

```python
class DatasetAdapter(ABC):
    name: str
    def conditions(self) -> tuple[str, ...]: ...
    def load(self, condition: str) -> tuple[Scene, ...]: ...
    def characterize(self) -> pd.DataFrame: ...
```

registered into a `DATASETS` registry. The only surviving implementation is `SyntheticAdapter`. The
deleted `PeroiAdapter` read `agent_id, frame, x, y` CSVs at 15 Hz, treated a row with
`agent_id == "robot"` as the robot, and built `Scene`s — **this is very nearly the OmniSim adapter,
already written once.** It was retired with the server layer in `29b57ee`, and `synthetic.py`'s
docstring records the reason it could never have been the real thing: PeRoI is *"structurally unable
to supply pairs."*

**OmniSim is not.** That is the whole difference.

---

## 6. OmniSim Contract Compatibility

### 6.1 Scenario input

| Contract field | Current MIRN equivalent | Relevant code | Compatibility | Changes likely needed | Questions for OmniSim |
|---|---|---|---|---|---|
| **seed** | `RunConfig.seed: number` (integer, validated). Also `Scene.seed`, and `PairedRun` asserts both arms share it. | `contracts/config.ts`, `rng/tape.ts` | **Strong** | None on MIRN's side. A seed that is a string or a struct needs a stable integer projection for `Scene.seed`. | Is one integer seed sufficient to make an OmniSim run bit-reproducible? What else is in the state (thread count, wall-clock, physics substeps)? |
| **static geometry** | **`widthM` × `heightM` only** — a bare rectangle with soft walls (`SIM_CONSTANTS.wallStrength`, `wallScaleM`, `wallRestitution`). **No obstacles, no occupancy grid, no mesh, no polygons.** | `contracts/config.ts` | **Weak** | A real gap. Metrics do not read geometry, so the *arithmetic* survives — but `web/ui/arena.ts` draws a plain rectangle and would render an OmniSim scene wrong, and `RunConfig` validates that robot start/goal lie inside the room. | What geometry format? Do the first scenarios need obstacles at all, or can v0 be an empty rectangular room MIRN can already draw? |
| **agent initial states** | Positions + goals drawn in `initialState` from the spawn tape; recorded as sample 0 of each `Trajectory`. There is no separate "initial state" record. | `sim/state.ts` | **Medium** | An adapter reads them off sample 0. But if OmniSim's initial state includes velocity or orientation, MIRN has nowhere to put it. | Do agents have initial velocity/orientation, and does the crowd model need them to be reproducible? |
| **robot start** | `RunConfig.robot.startXY: [number, number]`, validated inside the room. | `contracts/config.ts` | **Strong** | None. | — |
| **robot goal** | `RunConfig.robot.goalXY: [number, number]`, plus `SIM_CONSTANTS.goalReachedM = 1.1` defining arrival. | `contracts/config.ts` | **Strong** | The arrival radius is a MIRN constant. If OmniSim defines completion differently, `robotArrivalS` means two things. | How does OmniSim define "goal reached"? Radius, or a planner-reported success flag? |
| **robot trajectory** (as an alternative input) | **Not supported as an input.** The robot is always *driven* by `planRobot`, a 4-speed × 9-heading grid planner. There is no waypoint list and no way to prescribe a path. | `sim/robot.ts` | **Absent** | For the OmniSim direction this does not matter — OmniSim drives the robot and MIRN just reads the resulting path. It matters only if MIRN is ever asked to *emit* a scenario. | Who authors the robot's motion in v0 — OmniSim's planner, or a scripted waypoint list we both fix? A scripted path makes the paired guarantee far easier. |

### 6.2 OmniSim output

| Contract field | Current MIRN equivalent | Relevant code | Compatibility | Changes likely needed | Questions for OmniSim |
|---|---|---|---|---|---|
| **timestamps** | **Uniform grid only.** `t0 + dt*i`; `times()` materialises it. No per-sample timestamp field exists. | `contracts/trajectory.ts` | **Medium** | If OmniSim emits per-sample wall-clock or sim-time stamps that are not exactly uniform, they must be **resampled** onto a grid. `resampleTo(trajectory, dt)` already exists and is parity-pinned. The adapter must own that and say it did. | Is OmniSim's output on a fixed timestep? What is `dt`? Is it guaranteed identical between two paired runs? |
| **robot poses** | `Scene.robot: Trajectory \| null` — **position only**. Orientation is discarded. | `contracts/scene.ts` | **Medium** | Position maps cleanly. Orientation has nowhere to go and would be silently dropped — which is worse than rejecting it. Either extend `Trajectory` or state that MIRN ignores heading. | Does any metric either side wants need robot heading? (MIRN's current 14 do not.) |
| **agent poses** | `Scene.pedestrians: readonly Trajectory[]` — position only, uniform grid, unique `agentId` and `agentUid`. | `contracts/scene.ts` | **Medium-strong** | The charset rule (`/^[a-z][a-z0-9_]*$/`) will reject typical external ids; the adapter must map them, and the map must be **stable across both arms**. | Are agent ids stable across two runs of the same scenario? This is the single most important question on the list. |
| **collision / contact events** | **Not represented.** Nearest thing is `nearMissEpisodes`, derived post-hoc from the clearance series with MIRN's own radii and threshold. | `measure/metrics.ts`, `job/report.ts` | **Absent** | A new field on `Scene` (or a sibling record) and a new column, which must join the closed catalogue with a label, a unit and a zero. | Are contacts discrete events with timestamps, or a per-step contact flag? What counts as a contact — mesh intersection, or a distance threshold? |
| **completion state** | **Not in the contract.** `ArmResult.arrivedTick` is simulator-internal and does not reach `Scene`. `Reading.availability` has a `censored` kind used for unfinished measurements. | `sim/run.ts`, `job/columns.ts` | **Weak** | Needs a home. `Availability.censored` is the natural rendering target — MIRN already knows how to say "this run did not finish, so this number is not reported". | What are the possible termination reasons? Do paired runs ever terminate differently, and if so is the pair still valid? |
| **machine / build attribution** | `Scene.source: string` exists and is exactly this slot (the sim writes `"sfm"`). Nothing else. Python's parity fixtures carry an environment stamp that `test_fixtures.py` deliberately ignores. | `contracts/scene.ts` | **Medium** | `source` can carry a build id today. If richer attribution is wanted it needs a record, and CSV provenance lines would carry it. | What attribution do you want preserved — commit hash, simulator version, container digest? Does MIRN need to *display* it or only carry it? |

### 6.3 MIRN output

| Contract field | Status | Detail |
|---|---|---|
| **displaced-agent count** | **NOT IMPLEMENTED** | Ingredients exist (`deviation().perAgentM`, `perAgentDeviationByUid`). No threshold defined, no column, no zero-reference. A genuinely new metric. |
| **aggregate displacement** | **READY** (arithmetic) | `paired(pair).value` / `deviation(pair).meanM`. Oracle-backed. Consumes `PairedRun` only. |
| **peak displacement** | **READY** (arithmetic) | `deviation(pair).maxM` + `maxAtStep`. Consumes `PairedRun` only. |
| **minimum separation** | **PARTIALLY READY** | Kernel takes radii as arguments; the column hardcodes MIRN's. Surface-to-surface, can be negative, gated on both parties having moved. |
| **plots** | **PARTIALLY READY** | Renderers are real and tested; the series builders and the arena's playback path are wired to console-internal shapes and to re-simulation. |

### 6.4 What MIRN relies on that the proposed contract does NOT carry

**This is the section to bring to the call.** Every item is something MIRN needs and the v0 contract
as proposed cannot supply.

1. **The ability to re-run, not just the results of a run.** `runToRunBandM` and `worstMomentNullM`
   need 8 robot-absent replicates; `forecastZeroM` needs one blindfolded run. These are not outputs
   of an experiment — they are *more experiments*. Under guardrail 6 they are not optional garnish;
   they are what makes the primary numbers reportable. **A file-drop contract cannot deliver them.**
   Either the contract becomes "OmniSim runs a *set* of runs including nulls", or MIRN shows external
   numbers without a zero, which is the exact error the whole project exists to teach against.

2. **A declared treatment.** `PairedRun` requires a `TreatmentSpec` naming what differs. "Two runs
   that differ somehow" is not enough — MIRN asserts on it (`robot-presence` requires
   `treated.robotPresent === true` and `control.robotPresent === false`). The scenario format needs a
   field saying *what the intervention was*.

3. **Body radii.** `minClearanceM` is surface-to-surface. The contract carries poses but not extents,
   so clearance would silently use MIRN's 0.32 m robot and 0.24 m pedestrian on OmniSim's geometry.

4. **A stable agent-identity mapping across the two arms.** `makePairedRun` asserts identical
   `agentId` sets. If OmniSim assigns ids by spawn order and the robot's presence changes spawn
   order, the pair is rejected — or worse, accepted while meaning something different.

5. **Bit-identical (or near-identical) initial positions.** MIRN's browser check is exact. Any
   serialisation through decimal text or float32 breaks it. Python's 1e-9 tolerance exists for
   third-party adapters; the browser has no such path.

6. **Equal run lengths and equal agent sets.** Asserted with no tolerance and no reconciliation
   strategy. Real simulators terminate when they terminate.

7. **A `dt` that is identical between arms**, and a uniform sample grid.

8. **A uid ordering preserved across both arms.** `pedestrianTimeLostS` performs the codebase's one
   sanctioned positional join, on `ArmResult.positions[i]` in both arms. An adapter must reproduce
   that ordering property or that metric silently compares strangers.

9. **A room extent.** Not used by any metric, but `web/ui/arena.ts` needs one to draw, and
   `makeRunConfig` validates start/goal against it.

---

## 7. Recommended Integration Boundary

### 7.1 The abstraction already exists

The target diagram in the brief —

```
MIRN simulator ─────┐
                    ↓
              normalized trajectory format
                    ↓
              MIRN analysis
                    ↑
OmniSim adapter ────┘
```

— describes `web/engine/contracts/` as it stands today. `Scene` and `PairedRun` are the normalized
format. They are plain frozen structured-cloneable records with no import from `web/engine/sim/`.
`runPair` is one producer. **Do not invent `SimulationProvider`, `TrajectoryDataset` or
`ScenarioResult`.** They would duplicate types that already exist and are already mirrored in Python
and pinned by parity fixtures.

### 7.2 What is actually missing — three things, in dependency order

**(a) A second producer, and permission for one to exist.**
`makePairedRun` is intentionally unreachable from outside `sim/run.ts`. The change is a re-export
plus an adapter module — say `web/engine/adapter/` — whose job is: parse → map ids to
`agentId`/`agentUid` → build two `Scene`s → `makePairedRun`. It should live beside
`web/engine/fit/`, not inside it. Python's precedent is `DatasetAdapter.load() -> tuple[Scene, ...]`,
and the deleted `PeroiAdapter` is a working sketch of the same shape.

**(b) A finer-grained statement of what each column needs.**
`ColumnNeeds` already exists — `"run" | "zeroRun" | "band" | "floor" | "frechet"` — and it is
*almost* the right axis. It is too coarse in exactly one place: `needs: "run"` covers both
`paired(ctx.run.pair)` (portable) and `SIM_CONSTANTS.robotRadiusM` (not portable). Splitting `"run"`
into something like *needs-the-pair* versus *needs-the-simulator* would make the portable subset a
fact the type system knows, rather than a fact this document knows. That is a small, contained change
to a closed catalogue, and `columns.test.ts` already iterates it.

**(c) A `ReportContext` that an adapter can construct.**
Today it holds `run: RunResult`, which holds `RunConfig` and two `ArmResult`s. The minimum honest
change is to make the fields nine extractors reach for into *data* rather than *simulator internals*:
the robot's path, the per-arm uid-ordered buffers, the arrival time, and the two body radii. Most of
that is already present in `Scene` (the robot's path **is** `Scene.robot.positions`); the genuinely
missing pieces are **arrival/completion** and **radii**.

### 7.3 What should not be attempted

- **Do not port the simulator to Python** to check it. Guardrail 9; it doubles the drift surface to
  check a component whose correctness is behavioural.
- **Do not make `web/engine/fit/` general.** Its narrowness is a guarantee, asserted over source.
- **Do not add a registry.** The TypeScript side is deliberately "plain typed records, not a plugin
  system". One adapter is a module, not an extension point. If a second backend ever appears, revisit.
- **Do not put the band behind an interface that pretends a file can supply it.** If the band is
  unavailable, the honest rendering is `notApplicable` with `NO_BAND`, which already exists.

---

## 8. Integration Risks

### BLOCKERS

| Risk | Detail |
|---|---|
| **The nulls need a callable simulator** | `replicateBand(config)` re-runs 8 times; `forecastZeroM` re-runs once. Guardrail 6 makes these load-bearing, not optional. A file-drop contract structurally cannot supply them. **Resolve on the call: does OmniSim deliver a *set* of runs including nulls?** |
| **Unequal run lengths** | `makePairedRun` throws. Two runs of an external simulator can legitimately end at different ticks. No truncation or padding policy exists, and inventing one silently changes every maximum-style metric. |
| **Unstable agent identity across arms** | `makePairedRun` asserts identical `agentId` sets. If OmniSim ids depend on spawn order and the robot changes spawn order, pairing is impossible — this is the failure mode that killed the PeRoI adapter. |
| **Bit-identical initial positions** | The browser check has no tolerance. JSON decimal or float32 round-trips will fail it. Python allows 1e-9 explicitly for third-party adapters; TypeScript would need the same, and loosening a determinism assertion needs care. |
| **Guardrail 10: no server, no network, no storage** | `nostorage.test.ts` greps every `.ts`/`.html`/`.css` under `web/` for `fetch`, `XMLHttpRequest`, `WebSocket`, `localStorage`, `sessionStorage`, `IndexedDB`. **Any HTTP handoff from OmniSim to the browser is a build failure.** A locally-opened file is compliant. A Python-side ingestion is outside `web/` and unaffected. **This constrains the architecture, not just the code.** |
| **Guardrail 11: "no physics-engine dependency" is still refused** | Guardrail 11 lifted three refusals on 2026-08-27 (bring-your-own-method, method comparison, a second simulator backend) but explicitly kept four: *"no ROS, no planner benchmark, no trained model, no physics-engine dependency."* An OmniSim integration is arguably the lifted "second simulator backend" and arguably the retained "physics-engine dependency". **Only Sanjay can decide which. It is not a technical question and it should be settled before the call, not during it.** |

### IMPORTANT BUT EASY

| Risk | Detail |
|---|---|
| **`agentId` charset** | `/^[a-z][a-z0-9_]*$/` rejects hyphens, uppercase, UUIDs. Adapter maps them; the map must be stable across arms. |
| **`agentUid` synthesis** | An integer key that means nothing to OmniSim but is load-bearing here. Deterministic assignment from sorted external ids works. |
| **Hardcoded body radii** | `SIM_CONSTANTS.robotRadiusM` (0.32) / `pedRadiusM` (0.24) baked into two columns. The kernel already takes them as parameters — only the columns need changing. |
| **`arrivedTick` has no home in `Scene`** | Blocks `robotArrivalS`. `Availability.censored` is the right rendering when absent. |
| **No `JSON.parse` in `web/`** | A parser is straightforward; note it will be the first one, so the file-format choice sets a precedent. |
| **Resampling to a uniform grid** | `resampleTo` exists and is parity-pinned. Needs to be applied and *disclosed*, not applied quietly. |
| **The uid-vs-sorted-id ordering trap** | `pairedAgents()` sorts by string id (`ped0, ped1, ped10, ped2`); `ArmResult.positions` is uid-ordered. Joining them positionally shipped a bug once. Any adapter must use `perAgentDeviationByUid`. |
| **Room extent for drawing** | Metrics ignore it; `arena.ts` needs it; `makeRunConfig` validates against it. |

### LATER CONCERNS

| Risk | Detail |
|---|---|
| **2D vs 3D** | MIRN is 2-D throughout, hard-coded (`positions.length % 2`, stride 2, byte-compatible with `(T,2)` float64). A 3-D simulator must project to the ground plane, and someone must own that projection. |
| **Robot orientation** | Absent from the model. No current metric needs it; a future one (e.g. approach angle) would need a contract change. |
| **Collision/contact representation** | Genuinely undefined between the teams. MIRN deliberately refuses a tick-based collision count as dt-dependent. Expect real disagreement here. |
| **Coordinate frame** | MIRN has exactly one implicit frame and never names it. Any frame mismatch is silent — no `frame_id`, no transform, no validation. |
| **Metric definitions differing between teams** | "Minimum separation" is the obvious one: surface-to-surface or centre-to-centre? Gated on both parties moving, or not? "Displacement" — mean over steps, or final? Write these down. |
| **Number of agents** | `nPedestrians` is validated ≥ 1; the console's axis tops out at 44. `nTicks` is capped at 1600. Neither is a deep limit but both are asserted. |
| **Two crowd kernels** | `socialForce` and `anticipatory`. Any comparison must say which, and a confound appearing under only one is a fact about that kernel. |
| **Parity obligation (guardrail 8)** | The moment a formula exists in both TypeScript and Python it needs a fixture in `tests/golden/parity/`. Changing a formula is a two-file commit minimum. An adapter written in both languages triggers this. |
| **Guardrail 12 / catalogue discipline** | Any new column or axis joins a closed catalogue with a plain-English label, a unit and a zero, and passes the identifier regex in `web/testing/identifiers.ts`. "Displaced-agent count" is a new column and inherits all of this. |

### 8.1 Guardrail analysis

The technical work is tractable. The guardrails are where this collaboration succeeds or stalls, so
they are set out explicitly.

**Guardrail 11 — the decision that must be made first.** Its 2026-08-27 rewrite lifted three
refusals and kept four. An OmniSim adapter sits precisely on the seam: *"a second simulator backend"*
was lifted; *"no physics-engine dependency"* was kept. Both readings are defensible. This is an
owner's decision and it cannot be delegated to the call.

**The argument that works in the collaboration's favour, and it is a strong one.** Guardrail 11
forbids real recordings from ever producing a disturbance number, and the reason it gives is
arithmetic rather than caution:

> *"A corridor cannot be filmed twice. There is no second recording in which the same people, on the
> same day, in the same mood, walked past no robot. Real trajectories have exactly one arm, so the
> quantity this whole site is built to measure does not exist in them."*

**That reasoning does not transfer to a simulator.** OmniSim *can* be run twice, from the same seed
and the same initial state, with one declared change. It has two arms. So the specific refusal that
governs `web/fit.html` does not govern an OmniSim adapter — and MIRN's paired invariants, which are
its best work, remain fully meaningful. **Lead with this on the call.** It is also why the fit path
must not be described as the precedent: borrowing its framing would import a restriction that does
not apply.

**Guardrail 1 — a third kind of number appears, and its wording is undecided.** Guardrail 1 currently
keeps two kinds apart: readings about MIRN's invented crowd (which carry `INVENTED_CROWD_DISCLOSURE`)
and goodness-of-fit figures with real people on one side (which carry the three-clause
`FIT_DISCLOSURE` in `fitVerdict.ts`). An OmniSim reading is **neither**: it is a number about a
crowd invented by *somebody else's* simulator, under physics MIRN did not write and has not
characterised. Reusing the invented-crowd disclosure would be *almost* right and wrong in the
direction that matters — it implies MIRN knows what the crowd is. A third disclosure is needed, and
it should say plainly that the crowd is simulated, that MIRN did not write or validate its physics,
and that a disturbance number measured on it is a fact about that simulator rather than about robots.

**Guardrail 2 — unmoved, and it does the heaviest lifting.** A metric that fails on OmniSim's crowd
has still only failed on a simulated crowd. The integration must not be presented as establishing
effect sizes for real robots or as a benchmark of published methods. Guardrail 11's retained *"no
planner benchmark"* is directly relevant if the first public example compares robot behaviours.

**Guardrail 6 — the admission test, and it is what forces the hard question.** *"Which readout does
this move, and what does that readout say when the answer is zero?"* For an OmniSim reading the zero
is the run-to-run band and the blindfolded reference — and those are exactly what a delivered file
cannot carry. **This guardrail, not any engineering limit, is what makes "OmniSim must be able to run
the nulls too" a requirement rather than a nice-to-have.**

**Guardrail 8 — engages the moment an adapter exists in both languages.** A parser is arguably not a
formula, but a resampling or unit-conversion step is. If it lands in both, it needs a parity fixture.

**Guardrail 10 — architectural, and absolute.** No server, no network, no storage. Named APIs are
grepped by `nostorage.test.ts`, with `history.replaceState` the single asserted exception. The
handoff must therefore be a **file the user opens locally**, or must live entirely on the Python side
outside `web/`. Also: a permalink carries the recipe, never the results, and never executable code —
so an OmniSim scenario could in principle be named in a link, but its trajectories never could.

**Guardrails 3 and 12 — routine but not free.** New knobs join `AXES` with a declared measurement
that `axes.slow.test.ts` proves they move; new columns join `COLUMNS` with a label, a unit and a
zero; all reader-facing strings pass the identifier regex and carry no numeric literals.

**Guardrails 4, 5, 9, 13 — untouched.** Determinism and the paired invariant are strengthened by this
work rather than threatened, provided the adapter is held to the same assertions. Guardrail 9's "keep
the shared surface small" argues for the adapter living in **one** language rather than two.

---

## 9. Questions for OmniSim

Prioritized. None of these can be answered by reading MIRN.

**Tier 1 — blocking. Implementation cannot start without these.**

1. **Are agent identifiers stable across two runs of the same scenario?** If person 7 in the
   robot-present run is the same person as person 7 in the robot-absent run, pairing works. If ids
   are assigned by spawn order and the robot perturbs spawn order, **pairing is impossible** and the
   collaboration needs a different design. This killed the previous real-data adapter. Ask first.

2. **Can OmniSim run the *null* conditions, not just the treated and control pair?** MIRN needs ~8
   robot-absent replicates that differ only in exogenous noise (for the run-to-run band) and one run
   where the robot is present but nobody reacts to it (the zero-reference). Without these MIRN can
   produce a number but cannot say what it would read if the answer were zero — which its own rules
   forbid shipping. **Is "a scenario yields a set of runs" acceptable, or is v0 strictly one pair?**

3. **Is a paired run bit-reproducible from a seed, and is the pair's shared randomness actually
   shared?** Not "deterministic given identical inputs" — specifically: do the two arms consume the
   *same* noise for the *same* agent at the *same* timestep, so that a difference between them is
   attributable to the intervention alone? MIRN guarantees this structurally with an addressable
   noise tape. If OmniSim's two arms draw from a stream, the arms desynchronise the moment the robot
   changes anything, and the paired difference stops meaning what we both want it to mean. **This is
   the deepest technical question on the list.**

4. **What is the exact output schema, and in what file format?** Field names, types, units, one row
   per sample or one record per agent, and whether it is JSON, CSV, Parquet or something else. MIRN
   has no parser of any kind today, so whatever you pick, we write the first one.

**Tier 2 — shapes the v0 design.**

5. **Are both arms guaranteed the same number of timesteps and the same set of agents?** If a run can
   terminate early (goal reached, collision, timeout), what should MIRN do — truncate both to the
   shorter, reject the pair, or report a censored measurement?

6. **What are the coordinate system, units and origin?** Metres? Which axis is up? Is there a named
   frame, and is it identical between the two arms? MIRN has exactly one implicit 2-D frame and no
   validation, so a frame mismatch would be silent.

7. **Is output on a fixed timestep, and what is it?** If timestamps are irregular, MIRN must resample
   onto a uniform grid — it has the routine, but that is a lossy step someone must own and disclose.

8. **How are collisions and contacts represented?** Discrete timestamped events, a per-step boolean,
   or a penetration depth? And what counts — mesh intersection, or a distance threshold? MIRN has no
   representation for these at all and deliberately refuses tick-counted collision metrics as
   timestep-dependent.

9. **Do you emit agent and robot body radii or extents?** MIRN's minimum-separation metric is
   surface-to-surface and currently uses its own hardcoded 0.32 m / 0.24 m. Without extents from you
   we would be measuring OmniSim's geometry with MIRN's bodies.

**Tier 3 — ownership and the public example.**

10. **Who owns scenario definitions, and in what format?** Does OmniSim author them, does MIRN, or is
    there a shared scenario file both sides read? Related: does the scenario declare *what the
    intervention is*? MIRN requires a named treatment and asserts on it.

11. **Which simulator and which crowd/pedestrian model sits behind OmniSim for v0?** Not for
    credibility — for honesty. MIRN must state on the page whose physics produced the crowd, and
    "OmniSim" is an execution layer, not a crowd model.

12. **What geometry does v0 need?** MIRN can only represent and draw an empty rectangular room. Can
    the first example be exactly that, deferring obstacles?

13. **Who hosts the first public example, and where does it live?** MIRN is a static site with no
    server, no storage and no network calls — enforced by a test that greps for `fetch`. Any handoff
    must be a file a person opens locally, or must happen outside the browser entirely.

---

## 10. Decisions to Make on the Call

Concrete. Each should end with a written answer.

1. **Direction of the contract.** Does OmniSim emit files MIRN reads (loose coupling, MIRN stays
   static), or does MIRN call OmniSim (impossible in-browser under guardrail 10 — would have to be
   the Python side)? **Recommendation: files.**

2. **File format and schema, written down.** Field names, types, units. Recommendation: a single
   JSON document per *run set*, holding the scenario, the runs, and a `treatment` field naming what
   differs — rather than loose per-run CSVs, so pairing metadata cannot get separated from the data.

3. **Does a scenario yield one pair, or a run set including nulls?** Recommendation: a run set. If
   the answer is one pair, MIRN's external readings ship without a zero-reference, and Sanjay should
   decide now whether that is acceptable — it conflicts with guardrail 6.

4. **Agent identity contract.** Stable string ids, identical sets across arms, and a written
   guarantee. Decide who enforces it: OmniSim at emission, or MIRN's adapter at ingestion.

5. **Timestep contract.** Fixed `dt`, identical across arms, stated in the file. Decide whether MIRN
   resamples or rejects non-uniform input. **Recommendation: reject in v0.** Silent resampling is how
   a fitted number quietly becomes wrong by a constant factor.

6. **Tolerance on initial-state agreement.** MIRN's browser asserts bit-identical first positions;
   Python allows 1e-9 *specifically for third-party adapters*. Decide the number and write it into
   the contract.

7. **Metric definitions, in writing.** At minimum: minimum separation (surface-to-surface vs
   centre-to-centre; gated or not), displacement (mean over steps vs final), and displaced-agent
   count (what threshold, and what does it read when the answer is zero).

8. **Who owns the adapter, and in which language?** Recommendation: **Python first.** `DatasetAdapter`
   already exists, the deleted `PeroiAdapter` is a working sketch, guardrail 10 does not apply outside
   `web/`, and it keeps the browser untouched while the schema is still moving. Port to TypeScript
   once the schema is stable — and note guardrail 8 attaches once a formula lives in both.

9. **Scope of the first example** — see §11 — and explicitly what it will *not* claim.

10. **The guardrail decision.** Whether an OmniSim dependency counts as guardrail 11's retained "no
    physics-engine dependency" or its lifted "second simulator backend". **This is Sanjay's alone and
    should be settled before the call.**

---

## 11. Proposed First Public Example

### The scenario: one robot crossing a rectangular room of walking people

Deliberately unimpressive. Optimized for being debuggable and for having a checkable answer.

- **Room:** empty rectangle, roughly 22 m × 13 m, no obstacles — because that is the only geometry
  MIRN can represent *and draw* today.
- **Crowd:** ~18 agents crossing left-to-right and right-to-left, whatever pedestrian model OmniSim
  provides, named on the page.
- **Robot:** crosses the long axis, start to goal, straight line. **Recommendation: a scripted
  waypoint path rather than a planner.** A planner is one more thing that can differ between arms; a
  scripted path makes the paired guarantee trivial to verify and the failure modes obvious.
- **Fixed:** seed, initial agent states, `dt`, tick count, agent id assignment.

### The runs

| Run | Description |
|---|---|
| **A — baseline** | The scenario with **no robot**. This is the control arm. |
| **B — intervention** | Byte-identical scenario **with the robot**, same seed, same initial states, same exogenous noise. |

The declared difference is robot presence — which maps exactly onto MIRN's existing
`TreatmentSpec { kind: "robot-presence" }` and onto Python's `RolloutPair` semantics with no new
concepts on either side.

### The known-zero validation run — the part that makes this worth doing

Add a third run: **B′, the robot present but socially invisible** — agents do not react to it. MIRN
already has this exact demonstration (`RunConfig.pedestriansSeeRobot: false`), and it is described in
the codebase as *"the cleanest demonstration on the whole site: switch it off and the true effect is
EXACTLY zero while the measured one is not."*

Pairing A against B′ gives a case where **the correct answer is known to be exactly zero.** So the
first integration is validated against a number both teams can check, rather than against a plausible
figure nobody can falsify. If MIRN reads a non-zero displacement on the A/B′ pair, something in the
pipeline is broken — wrong id mapping, desynchronised noise, misaligned timesteps — and it will say
so loudly instead of producing a believable wrong answer.

**If OmniSim cannot make the robot socially invisible, the substitute is a robot that spawns and does
not move, far from every agent's path.** Weaker (it perturbs nothing rather than provably nothing)
but still a near-zero check.

### Inputs and outputs

**Into OmniSim:** seed, room extent, agent initial states, robot waypoints (or absence), `dt`, tick
count.

**Out of OmniSim:** per-run timestamped agent poses and robot poses, agent ids stable across runs,
completion state, build attribution. Ideally also: agent/robot radii, and ~8 extra robot-absent
replicates for the band.

**Into MIRN:** the run set. **Out of MIRN:** aggregate displacement (mean, metres), peak displacement
(metres, plus the step it happened on), per-agent displacement, minimum separation (metres), and —
if the replicates are supplied — the run-to-run band beside every one of them.

### Visualization

1. **The arena replay** (`web/ui/arena.ts`) — the two arms overlaid, treated filled and control
   hollow, which is the glyph pair the console already uses. This is the one picture that makes
   "paired" obvious to somebody who has not read anything.
2. **The deviation series** (`web/ui/plot.ts`) — mean gap between the two worlds over time, with the
   run-to-run band drawn as the floor beneath it.
3. **Three numbers side by side:** the A/B reading, the A/B′ reading (which should be zero), and the
   band. That triple *is* the lesson, and it is also the integration test.

### What this DOES demonstrate

- That an external simulator can produce a genuinely paired run set, and that MIRN can ingest it and
  measure it end to end.
- That the pipeline is correct, evidenced by the A/B′ pair reading zero.
- That a measured displacement can be set against the variation the room produces on its own.
- That a metric with no counterfactual reports a non-zero effect on a run whose true effect is zero.

### What this does NOT demonstrate — to be stated on the page, not just here

- **Nothing about real human crowds.** The agents are a simulated crowd model. Guardrail 2 is
  unmoved: fitting or realism claims are not on offer, and a metric that fails here has failed on a
  simulated crowd.
- **Nothing about effect sizes for real robots.** Not how much real robots disturb real people, in
  metres or in any other unit.
- **Nothing about which published method wins.** Comparing MIRN's paired estimator against a
  forecast-based one shows which is confounded *on this world*. Guardrail 11 still refuses a planner
  benchmark, and a result that reads as a leaderboard is the failure mode.
- **Nothing about OmniSim's physics being correct.** MIRN did not write it and has not characterised
  it. The page must name whose crowd model produced the numbers.

The risk to manage is that a real robotics simulator *looks* authoritative in a way MIRN's own
invented crowd does not. That is the same hazard guardrail 1 identifies for calibration — a reader
shown something that resembles the real thing is the reader most likely to over-believe the next
number. The disclosure has to be written for that reader.

---

## 12. Post-Call Implementation Checklist

Ordered. Items whose shape depends on a call decision are marked.

**Phase 0 — before any code**

- [ ] **Settle the guardrail 11 question** (physics-engine dependency vs second simulator backend).
      *Sanjay's decision; blocks everything.*
- [ ] Write the agreed schema into a spec under `docs/superpowers/specs/`, following the existing
      dated-design-doc convention. *Depends on decisions 2, 4, 5, 6.*
- [ ] Amend `CLAUDE.md`'s guardrails 1 and 11 to record what was decided and why, in the style the
      2026-08-27 amendment used. *Depends on decision 10.*
- [ ] Decide adapter language and location. *Depends on decision 8.*

**Phase 1 — ingestion, no UI**

- [ ] Write the parser against the agreed schema, with a committed fixture file. *Depends on
      decision 2.*
- [ ] Write the id-mapping layer: external id → `agentId` (charset-legal) → `agentUid`, stable across
      arms, with a test that the mapping is identical in both. *Depends on decision 4.*
- [ ] Decide and implement the initial-state tolerance. If TypeScript, this means loosening
      `makePairedRun`'s bitwise check for adapter-sourced pairs **without** loosening it for
      `runPair` — likely a separate constructor rather than a relaxed assertion. *Depends on
      decision 6.*
- [ ] Decide and implement the unequal-length policy (reject / truncate / censor). *Depends on
      decision 5.*
- [ ] Build `Scene` × 2 → `makePairedRun`. Re-export `makePairedRun` if TypeScript.
- [ ] **Gate: the A/B′ known-zero pair must read exactly zero.** No further work until it does.

**Phase 2 — measurement**

- [ ] Run `paired()`, `deviation()`, `frechet()` and `splitHalfNull()` over the ingested pair. These
      need no changes.
- [ ] Make body radii inputs rather than `SIM_CONSTANTS` reads in `minClearanceM` and
      `nearMissEpisodes`. *Depends on decision 7 and on whether OmniSim emits extents.*
- [ ] Decide where completion state lives, so `robotArrivalS` is either computable or honestly
      `censored`. *Depends on the completion-state answer.*
- [ ] Split `ColumnNeeds`' `"run"` into needs-the-pair vs needs-the-simulator, so portability is a
      typed fact.
- [ ] If the band and zero-run are supplied: wire them through `buildContext` unchanged. If not:
      render `notApplicable` with the existing `NO_BAND` / `NO_ZERO_RUN` strings and **decide whether
      shipping externally-sourced numbers without a zero is acceptable at all.** *Depends on
      decision 3; this is a guardrail 6 question, not an engineering one.*
- [ ] Implement displaced-agent count as a new `COLUMNS` entry — label, unit, `assumption`, `zero`,
      `corridorReadable`, and a threshold with a stated justification. *Depends on decision 7.*

**Phase 3 — surfacing**

- [ ] Write the third disclosure (externally-simulated crowd), with its own test asserting each
      clause by content, modelled on `fitVerdict.test.ts`. *Depends on decision 10.*
- [ ] Decide whether this is a sixth page or a mode of an existing one. A sixth page must be added to
      `vite.config.ts`'s input map and will be caught by `disclosure.test.ts`'s every-page-links-every-
      other assertion.
- [ ] Add a playback path for stored trajectories — `web/app/console/playback.ts` currently
      re-simulates from a key, which external data cannot do.
- [ ] Extend CSV provenance lines with build attribution and the source simulator.

**Phase 4 — honesty checks**

- [ ] Parity fixture for any formula that ends up in both languages. *Guardrail 8; two-file commit
      minimum.*
- [ ] Identifier-regex and numeric-literal scans over every new reader-facing string.
- [ ] `npm run check` and `.venv/bin/python -m pytest -q` green before any push.

---

## Call Cheat Sheet

**CURRENT MIRN**

- A static browser console (no server, no backend, no storage) that simulates an invented crowd,
  runs it **twice** — once with the robot, once without, sharing seed, initial state and an
  addressable noise tape — and measures the difference. Python is a numerical oracle, not a backend.
- The paired machinery is the strong part: `runArm` receives a *noise tape, not a seed*, so it is
  structurally incapable of giving the two arms different randomness. `makePairedRun` asserts
  identical agent sets, identical `dt`, identical lengths, and **bit-identical** starting positions.
- 14 reader-facing metrics, in a closed catalogue. Every one carries, by rule, what it would read if
  the answer were zero.
- **`Trajectory` / `Scene` / `PairedRun` are already a simulator-agnostic format**, mirrored in
  Python and pinned by parity fixtures. Position only: no orientation, no velocity, no per-sample
  timestamps, no collision events, no completion state, no obstacles.
- Green as of this audit: **1173 TypeScript tests across 87 files (76.7 s)**; **275 Python tests
  (21.5 s)** on the fast cut.

**PROPOSED COLLAB**

- OmniSim executes; MIRN measures. The boundary is a normalized trajectory format — which MIRN
  already has, so this is an adapter, not a redesign.
- v0: reproduce one small paired experiment end to end. Scenario → OmniSim → trajectories → MIRN →
  displacement / separation metrics → plots.
- MIRN's browser cannot make network calls (a test enforces it), so the handoff is a **file**, or it
  happens on the Python side.
- Strong precedent: a `DatasetAdapter` ABC still exists in Python, and a deleted PeRoI adapter already
  mapped `agent_id, frame, x, y` into `Scene`s.

**BIGGEST TECHNICAL QUESTION**

Does OmniSim give the two arms the *same* randomness for the *same* agent at the *same* timestep — so
the difference between them is the intervention and nothing else — and are agent identities stable
across the pair? If either fails, the paired comparison is not a paired comparison, and everything
MIRN does downstream measures the wrong thing while still returning a plausible number.

**QUESTIONS I NEED ANSWERED**

- Are agent ids stable across two runs of the same scenario? (If no, the collaboration needs a
  different design — this is what killed the previous real-data adapter.)
- Is the arms' shared randomness genuinely shared per-agent-per-timestep, or just "same seed"?
- Can OmniSim run the **null** conditions too — ~8 robot-absent replicates, and a run where the robot
  is present but nobody reacts? Without these MIRN cannot show what a reading looks like at zero,
  which its own rules require.
- Exact output schema, format, units, coordinate frame and origin?
- Fixed timestep? Identical between arms? Same number of steps, same agent set?
- How are collisions/contacts represented, and do you emit body radii?
- Who owns scenario definitions, and does a scenario declare *what the intervention is*?

**IDEAL V0**

One robot crossing an empty rectangular room of ~18 walking agents, run as a pair (robot / no robot)
plus a third run where the robot is present but socially invisible. MIRN ingests all three, reports
aggregate and peak displacement, per-agent displacement and minimum separation, and draws the two
arms overlaid with the deviation series beneath. **The socially-invisible pair must read exactly
zero** — that is the integration test, and it means the first result is one both teams can check
rather than one nobody can falsify. It demonstrates that the pipeline works; it demonstrates nothing
about real human crowds, real robot effect sizes, or which published method is better.
