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
    // Ruling A, overriding the brief's own draft (which wrote `atStep`): the schema field is
    // `completion.atSample`, a SAMPLE INDEX, not a tick. `sim/run.ts` documents that the sample
    // recorded for an arrival on tick T is T + 1 (`stepWorld` sets `arrivedTick` after moving the
    // robot on it, and that motion's result lands in the NEXT sample), and `build.ts` inverts this
    // with `atSample - 1`. Emitting anything else here would silently shift every adapted arrival
    // time by one sample against the simulator's own convention.
    completion = { outcome: "reachedGoal", atSample: arm.arrivedTick + 1 };
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

/**
 * One replicate run: the same room, run again with different exogenous noise, robot absent.
 *
 * Ruling C. The brief as written passes `band: null` everywhere, which would leave `bandFrom`
 * (Task 2) and `AdaptedRunSet.replicates` (Task 5) with no caller in the whole codebase — dead
 * code guardrail 6 would rightly be asked about. So the fixture carries several of these, produced
 * the same way `replicateBand` in `web/engine/measure/null/band.ts` produces its own: vary
 * `replicate` on the `RunConfig`, run the pair, and take the CONTROL arm — the robot-absent world.
 * `role: "replicate"` is not deduplicated by `buildAdapted` the way `treated`/`control` and the
 * zero pair are, so any number of these may appear.
 */
function replicateRun(config: RunConfig, replicate: number, index: number): unknown {
  const replicateConfig = makeRunConfig({ ...config, replicate, treatment: { kind: "robot-presence" } });
  const control = runPair(replicateConfig).control;
  return armToRuns(control, `replicate-${index}`, "replicate", replicateConfig.seed);
}

export function fixtureText(
  config: RunConfig = makeRunConfig({ nTicks: 500, crowd: { nPedestrians: 8 } }),
  nReplicates = 8,
): string {
  const real = runPair(config);
  const blind = runPair(makeRunConfig({ ...config, pedestriansSeeRobot: false }));

  const runs: unknown[] = [
    armToRuns(real.treated, "treated", "treated", config.seed),
    armToRuns(real.control, "control", "control", config.seed),
    armToRuns(blind.treated, "zero-treated", "zeroTreated", config.seed),
    armToRuns(blind.control, "zero-control", "zeroControl", config.seed),
  ];
  for (let i = 1; i <= nReplicates; i++) {
    runs.push(replicateRun(config, i, i));
  }

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
