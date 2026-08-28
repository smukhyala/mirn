import { makeRunConfig, type RunConfigOverrides } from "../contracts/config.js";
import { fail } from "../core/errors.js";
import { runPair, type ArmResult } from "../sim/run.js";
import { speedDistance } from "./distance.js";
import { speedsFrom, type Recording } from "./recording.js";

/**
 * Fitting the invented crowd to a recording: a coarse search, and what it is allowed to conclude.
 *
 * ## Two knobs, and why only two
 *
 * `crowd.desiredSpeed` and `crowd.noiseAmplitude` — the console's own "how fast people want to
 * walk" and "random wobble". They are the two a distribution of walking speeds can actually
 * identify: one sets where the distribution sits, the other how wide it is. Fitting more than a
 * sample can identify is how a fit comes back confident and meaningless, and the honest version of
 * this feature is the one that fits the parameters the evidence reaches.
 *
 * The crowd's other constants are left alone. `SIM_CONSTANTS` is deliberately "constants that are
 * not knobs", and turning them into fitted quantities on the strength of one speed histogram would
 * be inventing evidence.
 *
 * ## The crowd is compared without a robot in the room
 *
 * `runPair` produces two arms and only the CONTROL one is read — the run with no robot in it. That
 * is the arm a recording is comparable to, since nobody filmed a corridor with our robot in it, and
 * it is also the structural reason nothing here can drift into producing a disturbance number:
 * there is no second arm in play to difference against.
 *
 * ## What "best" means, and what it does not
 *
 * The grid's smallest distance. That is a fit, and it is worth exactly what a coarse grid over two
 * parameters against one recording is worth. It does not mean the crowd is now realistic, that the
 * fitted values are anybody's true walking speed, or that the numbers on the rest of this site have
 * become measurements of real people. Guardrail 2 is unmoved: a crowd fitted to a recording is a
 * crowd that resembles that recording, in the respects that were fitted, on the day it was filmed.
 *
 * ## The reference the fit is read against
 *
 * A distance of 0.06 m/s means nothing on its own, so the search also measures how far the invented
 * crowd sits **from itself** — the same statistic between two runs of the fitted crowd that differ
 * only by seed. That is the same move the whole site makes with the run-to-run band: it is the
 * resolution of the instrument. A recording no further from the crowd than the crowd is from itself
 * is as close as this measure can tell, and a fit that beats that has not been shown to be better,
 * it has been shown to be past the point where this can distinguish.
 */

/** Where the search looks for a walking pace, in metres per second. `AXES.walkingPace` spans this. */
export const PACE_LADDER: readonly number[] = Object.freeze([
  0.8, 0.95, 1.1, 1.25, 1.4, 1.55, 1.7,
]);

/** Where it looks for a wobble. `AXES.crowdFidget` spans 0 to 3. */
export const WOBBLE_LADDER: readonly number[] = Object.freeze([0, 0.5, 1, 1.5, 2, 2.5]);

/** How many seeds each candidate is judged on. More than one, because a seed is a room. */
const SEEDS_PER_CANDIDATE = 2;

export interface FitCandidate {
  readonly kind: "fitCandidate";
  readonly desiredSpeed: number;
  readonly noiseAmplitude: number;
  /** Mean distance to the recording's speeds, over the seeds this candidate was run on, in m/s. */
  readonly distance: number;
}

/**
 * One fitted parameter, and whether the recording actually pins it.
 *
 * `identified` is the field that matters and it exists because the first run of this feature
 * produced a fitted wobble that was not a measurement. Recordings written out of the simulator at a
 * known wobble of 1.5 and of 2.5 both came back fitted at 0, while the pace came back exact every
 * time — a speed distribution locates where the distribution sits and barely constrains how wide it
 * is, once the walking speed is free to absorb it.
 *
 * So a parameter counts as identified only if moving it across its whole ladder changes the
 * distance by more than the crowd's distance from ITSELF. That is the same test guardrail 3 applies
 * to every axis on the console — does this move its readout by more than the noise — and the same
 * one the run-to-run band exists for. Below it, the grid still has a winner, and the winner is an
 * artefact of where the grid happened to be finest rather than a fact about anybody's walking.
 */
export interface FitParameter {
  readonly kind: "fitParameter";
  /** Plain English, per guardrail 12. Never the config path it writes. */
  readonly label: string;
  readonly value: number;
  /** How far the distance moves across this parameter's ladder, the other held at its best. */
  readonly spread: number;
  /** Whether that movement clears the crowd's distance from itself. */
  readonly identified: boolean;
}

export interface FitResult {
  readonly kind: "fitResult";
  readonly candidates: readonly FitCandidate[];
  readonly best: FitCandidate;
  /** How fast the fitted crowd wants to walk, and whether the recording pins it. */
  readonly pace: FitParameter;
  /** How much it wanders for no reason, and whether the recording pins that. */
  readonly wobble: FitParameter;
  /**
   * How far the fitted crowd sits from itself: the same statistic between two runs differing only
   * by seed. The resolution of the measure, and the figure `best.distance` is read against.
   */
  readonly selfDistance: number;
  /** Provenance for the surface, so a figure cannot be shown without what produced it. */
  readonly nRecordedSpeeds: number;
  readonly nRecordedTracks: number;
  readonly framesPerSecond: number;
}

/**
 * Every step's speed in one arm, pooled across everybody, in metres per second.
 *
 * The simulated mirror of `speedsFrom`, and deliberately the same shape of quantity: pooled over
 * people, one value per step per person. Comparing a pooled sample against a per-person one would
 * be comparing two different statistics and calling the gap a fit.
 */
export function speedsFromArm(arm: ArmResult, dt: number): Float64Array {
  if (!Number.isFinite(dt) || dt <= 0) {
    fail(`speeds from a run need its time step, as a number above nought, and got ${String(dt)}`);
  }

  let total = 0;
  for (const path of arm.positions) {
    total = total + Math.max(0, path.length / 2 - 1);
  }

  const speeds = new Float64Array(total);
  let at = 0;
  for (const path of arm.positions) {
    const nSteps = path.length / 2;
    for (let i = 1; i < nSteps; i++) {
      const dx = (path[i * 2] as number) - (path[(i - 1) * 2] as number);
      const dy = (path[i * 2 + 1] as number) - (path[(i - 1) * 2 + 1] as number);
      speeds[at] = Math.sqrt(dx * dx + dy * dy) / dt;
      at = at + 1;
    }
  }

  return speeds;
}

/**
 * How much the distance moves along one parameter's ladder, and whether that clears the noise.
 *
 * The slice is the candidates that agree with the winner on the OTHER parameter, so what is
 * measured is the effect of this one alone rather than of the pair together. A single-candidate
 * slice has no spread to measure and is reported unidentified rather than as a spread of nought,
 * which would read as "moving it changes nothing" when what happened is that nothing was moved.
 */
function parameterAlong(
  label: string,
  value: number,
  along: readonly FitCandidate[],
  selfDistance: number,
): FitParameter {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const candidate of along) {
    low = Math.min(low, candidate.distance);
    high = Math.max(high, candidate.distance);
  }
  const spread = along.length > 1 ? high - low : 0;
  return Object.freeze({
    kind: "fitParameter" as const,
    label,
    value,
    spread,
    identified: along.length > 1 && spread > selfDistance,
  });
}

function armSpeedsAt(
  base: RunConfigOverrides,
  desiredSpeed: number,
  noiseAmplitude: number,
  seed: number,
): Float64Array {
  const config = makeRunConfig({
    ...base,
    crowd: { ...(base.crowd ?? {}), desiredSpeed, noiseAmplitude },
    seed,
  });
  // The control arm alone. See the header: there is no second arm in play here, by construction.
  return speedsFromArm(runPair(config).control, config.dt);
}

/**
 * Search the grid, then measure the crowd against itself at the winner.
 *
 * `baseSeed` fixes every run, so the same recording and the same settings give the same fit on
 * every reload — guardrail 4 applies here exactly as it does everywhere else, and a fit that moved
 * between two presses would be a parameter nobody could quote.
 */
export function fitCrowd(init: {
  readonly recording: Recording;
  readonly base?: RunConfigOverrides;
  readonly baseSeed: number;
}): FitResult {
  const recorded = speedsFrom(init.recording);
  if (recorded.length < 1) {
    fail("the recording holds no steps, so there are no speeds in it to fit anything to");
  }
  if (!Number.isInteger(init.baseSeed)) {
    fail(`a fit needs a whole-numbered seed to be repeatable, and got ${String(init.baseSeed)}`);
  }

  const base = init.base ?? {};
  const candidates: FitCandidate[] = [];
  let best: FitCandidate | null = null;

  for (const desiredSpeed of PACE_LADDER) {
    for (const noiseAmplitude of WOBBLE_LADDER) {
      let total = 0;
      for (let s = 0; s < SEEDS_PER_CANDIDATE; s++) {
        const speeds = armSpeedsAt(base, desiredSpeed, noiseAmplitude, init.baseSeed + s);
        total = total + speedDistance(recorded, speeds);
      }
      const candidate: FitCandidate = Object.freeze({
        kind: "fitCandidate" as const,
        desiredSpeed,
        noiseAmplitude,
        distance: total / SEEDS_PER_CANDIDATE,
      });
      candidates.push(candidate);
      // Strictly less than, so the first of an exact tie wins and the answer does not depend on
      // iteration order changing under a later edit.
      if (best === null || candidate.distance < best.distance) {
        best = candidate;
      }
    }
  }

  if (best === null) {
    fail("the search ran no candidates at all, so there is no fit to report");
  }

  // The resolution of the measure: the fitted crowd against itself, two seeds apart. Measured at
  // the winner rather than at the defaults, because it is THIS crowd's spread that says how finely
  // the distance above can be read.
  const selfA = armSpeedsAt(base, best.desiredSpeed, best.noiseAmplitude, init.baseSeed);
  const selfB = armSpeedsAt(
    base,
    best.desiredSpeed,
    best.noiseAmplitude,
    init.baseSeed + SEEDS_PER_CANDIDATE,
  );

  const selfDistance = speedDistance(selfA, selfB);

  return Object.freeze({
    kind: "fitResult" as const,
    candidates: Object.freeze(candidates),
    best,
    pace: parameterAlong(
      "How fast the crowd wants to walk",
      best.desiredSpeed,
      candidates.filter((c) => c.noiseAmplitude === best.noiseAmplitude),
      selfDistance,
    ),
    wobble: parameterAlong(
      "How much it wanders for no reason",
      best.noiseAmplitude,
      candidates.filter((c) => c.desiredSpeed === best.desiredSpeed),
      selfDistance,
    ),
    selfDistance,
    nRecordedSpeeds: recorded.length,
    nRecordedTracks: init.recording.tracks.length,
    framesPerSecond: init.recording.framesPerSecond,
  });
}
