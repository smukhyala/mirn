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
 * acquire one. The `Deviation` import above is type-only — erased at compile time under
 * `verbatimModuleSyntax`/`isolatedModules` — so it carries no runtime dependency on `measure/`;
 * it exists only so `perAgentDeviationByUid` can name the shape it is given.
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

/**
 * First step after which a pedestrian never moves again. -1 if they never settle.
 *
 * The 1e-9 tolerance here is deliberately not `metrics.ts`'s 1e-4, and the difference is
 * physical, not stylistic. A pedestrian who has arrived is frozen exactly: `stepWorld` zeroes
 * their velocity and skips their position update, so two consecutive samples are bit-identical.
 * The robot is never frozen this way — its planner can return `(0, 0)`, but `applyCommand`
 * integrates that through a first-order lag, so the robot's velocity decays geometrically toward
 * zero and its per-step displacement keeps shrinking without ever hitting it. A tolerance loose
 * enough to call that "settled" would call every long-idle robot tick settled too.
 */
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
