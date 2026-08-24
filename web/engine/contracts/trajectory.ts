import { fail, requireFinite } from "../core/errors.js";
import type { Vec2 } from "../core/vec.js";

/**
 * A single agent's 2-D position history on a uniform time grid.
 *
 * Mirrors `Trajectory` in src/mirn/contracts.py, with three deliberate deviations:
 *
 * 1. `positions` is a FLAT Float64Array of length `2 * nSteps`, not an (T, 2) ndarray. There is no
 *    ndarray in the browser, and flat-with-stride-2 is the only allocation-free layout. It is also
 *    what makes the parity fixture exact: row-major (T, 2) float64 is byte-identical to this
 *    buffer, so `np.frombuffer(buf).reshape(T, 2)` round-trips with no reinterpretation.
 * 2. `agentUid: number` is added. Python has only `agent_id: str`. The uid is load-bearing here —
 *    it addresses the noise tape and it is the pairing key. The parity rule, asserted below and on
 *    the Python side, is that `agentId === "ped" + uid` for base agents, `"inj" + uid` for
 *    injected ones, and `"robot"` for uid -1.
 * 3. Read-only is advisory. JS cannot freeze a TypedArray's contents; `readonly` catches it at
 *    compile time and `Object.freeze` catches attribute assignment. This is the same posture
 *    contracts.py already documents for numpy's `writeable = False`: a mistake-catcher, not a
 *    boundary.
 */
export interface Trajectory {
  readonly kind: "trajectory";
  readonly agentId: string;
  readonly agentUid: number;
  readonly positions: Float64Array;
  readonly nSteps: number;
  readonly t0: number;
  readonly dt: number;
}

const AGENT_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * The id charset is constrained so that sorting agrees across languages. Python sorts strings by
 * code point and JS `Array.prototype.sort` by UTF-16 code unit; the two agree for everything in
 * this charset, so `pairedAgents()` returns the same order on both sides. Asserting the charset
 * turns that agreement from an assumption into a guarantee.
 */
export function makeTrajectory(init: {
  agentId: string;
  agentUid: number;
  positions: Float64Array;
  t0: number;
  dt: number;
}): Trajectory {
  const { agentId, agentUid, positions, t0, dt } = init;

  if (!AGENT_ID_PATTERN.test(agentId)) {
    fail(
      `Trajectory.agentId must match ${String(AGENT_ID_PATTERN)} so that sort order agrees ` +
        `across Python and JS, got '${agentId}'`,
    );
  }
  if (!Number.isInteger(agentUid)) {
    fail(`Trajectory.agentUid must be an integer, got ${agentUid}`);
  }
  if (positions.length % 2 !== 0) {
    fail(
      `Trajectory.positions must be a flat (T, 2) buffer with even length, got ` +
        `length=${positions.length}`,
    );
  }
  const nSteps = positions.length / 2;
  if (nSteps < 1) {
    fail(`Trajectory.positions must have at least one timestep, got length=${positions.length}`);
  }
  requireFinite(dt, "Trajectory.dt");
  if (dt <= 0) {
    fail(`Trajectory.dt must be > 0, got ${dt}`);
  }
  requireFinite(t0, "Trajectory.t0");
  for (let i = 0; i < positions.length; i++) {
    const value = positions[i] as number;
    if (!Number.isFinite(value)) {
      fail(
        `Trajectory.positions must contain only finite values; index ${i} of agent ` +
          `'${agentId}' is ${value}`,
      );
    }
  }

  return Object.freeze({
    kind: "trajectory" as const,
    agentId,
    agentUid,
    positions,
    nSteps,
    t0,
    dt,
  });
}

export function positionAt(trajectory: Trajectory, step: number): Vec2 {
  if (!Number.isInteger(step) || step < 0 || step >= trajectory.nSteps) {
    fail(
      `positionAt step must be an integer in [0, ${trajectory.nSteps}) for agent ` +
        `'${trajectory.agentId}', got ${step}`,
    );
  }
  return [trajectory.positions[2 * step] as number, trajectory.positions[2 * step + 1] as number];
}

export function duration(trajectory: Trajectory): number {
  return trajectory.nSteps * trajectory.dt;
}

export function times(trajectory: Trajectory): Float64Array {
  const out = new Float64Array(trajectory.nSteps);
  for (let i = 0; i < trajectory.nSteps; i++) {
    out[i] = trajectory.t0 + trajectory.dt * i;
  }
  return out;
}

/**
 * Linear interpolation onto a new uniform grid.
 *
 * The `+ 1e-9` in the interval count is carried over from contracts.py verbatim and is NOT a
 * tidy-up candidate: it decides the output length when the spans are not exactly commensurate,
 * so changing it changes `nSteps` and breaks parity. It has its own fixture case.
 */
export function resampleTo(trajectory: Trajectory, dt: number): Trajectory {
  requireFinite(dt, "resampleTo dt");
  if (dt <= 0) {
    fail(`resampleTo dt must be > 0, got ${dt}`);
  }

  const oldTimes = times(trajectory);
  const span = (oldTimes[trajectory.nSteps - 1] as number) - (oldTimes[0] as number);

  let newNSteps: number;
  if (span <= 0) {
    newNSteps = 1;
  } else {
    newNSteps = Math.floor(span / dt + 1e-9) + 1;
  }

  const newPositions = new Float64Array(newNSteps * 2);
  for (let i = 0; i < newNSteps; i++) {
    const t = trajectory.t0 + dt * i;
    const raw = (t - trajectory.t0) / trajectory.dt;
    let lower = Math.floor(raw);
    if (lower < 0) {
      lower = 0;
    }
    if (lower > trajectory.nSteps - 1) {
      lower = trajectory.nSteps - 1;
    }
    let upper = lower + 1;
    if (upper > trajectory.nSteps - 1) {
      upper = trajectory.nSteps - 1;
    }
    const frac = upper === lower ? 0 : raw - lower;

    for (let dim = 0; dim < 2; dim++) {
      const a = trajectory.positions[2 * lower + dim] as number;
      const b = trajectory.positions[2 * upper + dim] as number;
      newPositions[2 * i + dim] = a + (b - a) * frac;
    }
  }

  return makeTrajectory({
    agentId: trajectory.agentId,
    agentUid: trajectory.agentUid,
    positions: newPositions,
    t0: trajectory.t0,
    dt,
  });
}
