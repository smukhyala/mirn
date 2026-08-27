import { fail, requireFinite } from "../core/errors.js";
import type { ArmResult } from "../sim/run.js";

/**
 * What a supplied method is handed, and what its answer is judged to be.
 *
 * ## The one decision this file exists to enforce
 *
 * A supplied method never sees the run without the robot. It receives what a corridor gives you:
 * one run, the people's paths, the robot's path, and the time step between samples. There is no
 * control arm here, no `PairedRun`, no `Scene`, and no way to reach one from what is returned.
 *
 * That is not a safety measure, it is the product. The site's claim is that a method which cannot
 * see the counterfactual has to guess it and that the guess is confounded. A method handed both
 * arms could subtract them and return the exact truth, and every number reported about it would
 * then describe this harness rather than the reader's ruler.
 *
 * ## Every array is a copy, and that is load-bearing
 *
 * `web/engine/contracts/trajectory.ts` records that JS cannot freeze a TypedArray's contents, and
 * `ArmResult.positions` wraps the *same buffers* the Scene's trajectories wrap — `runArm` builds
 * one set of buffers and hands them to both. `readonly` is a compile-time note, and a supplied
 * function is not compiled against these types at all: it is source a reader typed, so nothing it
 * does is checked by the compiler. Handed the live buffers it could write into the arms mid-probe
 * and silently corrupt every seed that came after, and the corruption would look like a physics
 * result rather than a bug.
 *
 * So every buffer that crosses this boundary is `new Float64Array(source)`. Never the live one.
 * `__tests__/supplied.test.ts` mutates what comes back and asserts the arm is untouched, and
 * carries a meta-test proving that the same mutation through a shared buffer WOULD be visible —
 * without it, a copy test passes just as happily against a view that shares its memory.
 *
 * ## What is deliberately absent
 *
 * `agentId` is not passed. It encodes the uid ordering the measurement layer depends on, and a
 * corridor does not hand you stable person identifiers across runs. A method that keyed off it
 * would be reading a fact about this harness.
 */

export interface SuppliedPath {
  readonly kind: "suppliedPath";
  /** Flat [x0,y0,x1,y1,...], length 2 * nSteps. Always a COPY — see the note above. */
  readonly positions: Float64Array;
  readonly nSteps: number;
}

export interface SuppliedRun {
  readonly kind: "suppliedRun";
  readonly people: readonly SuppliedPath[];
  readonly robot: SuppliedPath | null;
  readonly dt: number;
  readonly nSteps: number;
}

/**
 * One path, copied out of the arm and then validated.
 *
 * The copy happens FIRST and the checks run over the copy, so what is validated is exactly the
 * buffer the caller receives rather than a source that could differ from it.
 */
function makeSuppliedPath(source: Float64Array, whose: string): SuppliedPath {
  const positions = new Float64Array(source);

  if (positions.length % 2 !== 0) {
    fail(
      `a supplied path must be a flat (T, 2) buffer with even length, got length ` +
        `${positions.length} for ${whose}`,
    );
  }
  const nSteps = positions.length / 2;
  if (nSteps < 1) {
    fail(`a supplied path must have at least one timestep, got length 0 for ${whose}`);
  }
  for (let i = 0; i < positions.length; i++) {
    const value = positions[i] as number;
    if (!Number.isFinite(value)) {
      fail(`a supplied path must contain only finite values; index ${i} of ${whose} is ${value}`);
    }
  }

  return Object.freeze({
    kind: "suppliedPath" as const,
    positions,
    nSteps,
  });
}

/**
 * The corridor-readable view of ONE arm.
 *
 * `arm.positions` is already in uid order, and that order is preserved without being named: the
 * people arrive as a list and nothing in the returned record says which person is which.
 */
export function suppliedRunFrom(arm: ArmResult, dt: number): SuppliedRun {
  requireFinite(dt, "the time step of a supplied run");
  if (dt <= 0) {
    fail(`the time step of a supplied run must be > 0, got ${dt}`);
  }
  if (arm.positions.length < 1) {
    fail("a supplied run needs at least one person's path; a run of nobody measures nothing");
  }

  const people: SuppliedPath[] = [];
  let nSteps = -1;
  for (let i = 0; i < arm.positions.length; i++) {
    const source = arm.positions[i] as Float64Array;
    const path = makeSuppliedPath(source, `the person at position ${i}`);
    if (nSteps === -1) {
      nSteps = path.nSteps;
    } else if (path.nSteps !== nSteps) {
      fail(
        `every path in a supplied run must share a step count, got ${path.nSteps} for the ` +
          `person at position ${i} against ${nSteps} for the others`,
      );
    }
    people.push(path);
  }

  let robot: SuppliedPath | null = null;
  const robotSource = arm.robotPositions;
  if (robotSource !== null) {
    const robotPath = makeSuppliedPath(robotSource, "the robot");
    if (robotPath.nSteps !== nSteps) {
      fail(
        `the robot's path in a supplied run must share the crowd's step count, got ` +
          `${robotPath.nSteps} against ${nSteps}`,
      );
    }
    robot = robotPath;
  }

  return Object.freeze({
    kind: "suppliedRun" as const,
    people: Object.freeze([...people]),
    robot,
    dt,
    nSteps,
  });
}

/**
 * What a supplied method did, once it has been run twice on identical input.
 *
 * Four outcomes and no fifth. `timedOut` is produced by the client that owns the wall clock —
 * a runaway function cannot be interrupted from inside the worker it runs in, so the limit is
 * enforced by terminating from outside and reported here rather than decided here.
 */
export type SuppliedOutcome =
  | { readonly kind: "read"; readonly valueM: number }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "nondeterministic"; readonly firstM: number; readonly secondM: number }
  | { readonly kind: "timedOut"; readonly limitMs: number };

/** What came back from one run: a distance we can use, or a plain-English name for what it was. */
type Returned =
  | { readonly kind: "distance"; readonly valueM: number }
  | { readonly kind: "notADistance"; readonly what: string };

/**
 * Name what came back, in words a reader who has never seen a program would understand.
 *
 * Guardrail 12: this string reaches the page. It says "nothing at all" and not the name of the
 * empty value, "a piece of text" and not the name of the text type. A reader whose method
 * forgot to return is owed a sentence about their method, not a word out of a language spec.
 */
function readReturned(value: unknown): Returned {
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return { kind: "distance", valueM: value };
    }
    if (Number.isNaN(value)) {
      return { kind: "notADistance", what: "a result that is not a number" };
    }
    if (value > 0) {
      return { kind: "notADistance", what: "an endless distance, larger than any number" };
    }
    return { kind: "notADistance", what: "an endless negative distance, smaller than any number" };
  }
  if (value === undefined) {
    return { kind: "notADistance", what: "nothing at all" };
  }
  if (value === null) {
    return { kind: "notADistance", what: "an empty result" };
  }
  if (typeof value === "string") {
    return { kind: "notADistance", what: "a piece of text" };
  }
  if (typeof value === "boolean") {
    return { kind: "notADistance", what: "a yes-or-no answer" };
  }
  if (typeof value === "bigint") {
    return { kind: "notADistance", what: "a whole number of a kind a distance cannot be read from" };
  }
  if (typeof value === "function") {
    return { kind: "notADistance", what: "another method" };
  }
  if (typeof value === "symbol") {
    return { kind: "notADistance", what: "a name rather than a distance" };
  }
  if (Array.isArray(value)) {
    return { kind: "notADistance", what: "a list of results" };
  }
  return { kind: "notADistance", what: "a bundle of results" };
}

const FIRST_TIME = "the first time it was run";
const SECOND_TIME = "the second time it was run";

function failedOutcome(what: string, when: string): SuppliedOutcome {
  return Object.freeze({
    kind: "failed" as const,
    message: `Your method returned ${what} ${when}, and a reading has to be a distance in metres.`,
  });
}

/**
 * Judge two returns of the same method on the same input.
 *
 * The two are compared bitwise, and any difference at all is a finding rather than noise.
 * Guardrail 4 makes determinism a property of this bench: a method that answers differently on
 * identical input is answering a different question every time it is asked, and averaging the two
 * would report the mean of two different quantities as though it were one.
 */
export function judgeSuppliedResult(first: unknown, second: unknown): SuppliedOutcome {
  const firstReturned = readReturned(first);
  if (firstReturned.kind === "notADistance") {
    return failedOutcome(firstReturned.what, FIRST_TIME);
  }
  const secondReturned = readReturned(second);
  if (secondReturned.kind === "notADistance") {
    return failedOutcome(secondReturned.what, SECOND_TIME);
  }

  const firstM = firstReturned.valueM;
  const secondM = secondReturned.valueM;
  if (firstM !== secondM) {
    return Object.freeze({ kind: "nondeterministic" as const, firstM, secondM });
  }

  return Object.freeze({ kind: "read" as const, valueM: firstM });
}
