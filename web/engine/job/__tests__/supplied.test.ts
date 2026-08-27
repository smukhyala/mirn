import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import { ContractError } from "../../core/errors.js";
import { runPair, type ArmResult } from "../../sim/run.js";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";
import {
  judgeSuppliedResult,
  suppliedRunFrom,
  type SuppliedOutcome,
  type SuppliedPath,
  type SuppliedRun,
} from "../supplied.js";

/**
 * What a supplied method may touch, and what it may see.
 *
 * Two properties are proved here rather than asserted, because both are the kind that a test can
 * pass while being false:
 *
 * 1. **The buffers are copies.** A copy test passes just as happily against a view that shares its
 *    memory with the arm, so the meta-test below performs the same mutation through a deliberate
 *    alias and asserts the arm DOES change. Without that, "the source is unchanged" could be
 *    reporting that the mutation never happened rather than that it never reached the arm.
 * 2. **No control arm, no scene and no person identifier reach the reader's function.** That is
 *    checked by walking every key of the returned record rather than by naming the fields we
 *    happened to think of, so a field added later is a red test rather than a leak.
 */

const CONFIG = makeRunConfig({});

/** One run, shared by the tests that only read it. Anything that mutates builds its own. */
const RUN = runPair(CONFIG);

const MUTATED_VALUE = 1234.5;

describe("suppliedRunFrom builds the corridor-readable view of one arm", () => {
  it("carries every person, the robot, the step count and the time step", () => {
    const supplied = suppliedRunFrom(RUN.treated, CONFIG.dt);

    expect(supplied.kind).toBe("suppliedRun");
    expect(supplied.people.length).toBe(RUN.treated.positions.length);
    expect(supplied.people.length).toBe(CONFIG.crowd.nPedestrians);
    expect(supplied.nSteps).toBe(CONFIG.nTicks + 1);
    expect(supplied.dt).toBe(CONFIG.dt);
    expect(supplied.robot).not.toBeNull();

    const robot = supplied.robot as SuppliedPath;
    expect(robot.kind).toBe("suppliedPath");
    expect(robot.nSteps).toBe(supplied.nSteps);
    expect(robot.positions.length).toBe(2 * supplied.nSteps);

    for (let i = 0; i < supplied.people.length; i++) {
      const path = supplied.people[i] as SuppliedPath;
      expect(path.kind).toBe("suppliedPath");
      expect(path.nSteps).toBe(supplied.nSteps);
      expect(path.positions.length).toBe(2 * supplied.nSteps);
    }
  });

  it("reproduces the arm's numbers exactly, in the arm's own order", () => {
    const supplied = suppliedRunFrom(RUN.treated, CONFIG.dt);

    for (let i = 0; i < supplied.people.length; i++) {
      const path = supplied.people[i] as SuppliedPath;
      const source = RUN.treated.positions[i] as Float64Array;
      expect(Array.from(path.positions)).toEqual(Array.from(source));
    }
    const robot = supplied.robot as SuppliedPath;
    const robotSource = RUN.treated.robotPositions as Float64Array;
    expect(Array.from(robot.positions)).toEqual(Array.from(robotSource));
  });

  it("freezes the record, the people list and every path", () => {
    const supplied = suppliedRunFrom(RUN.treated, CONFIG.dt);

    expect(Object.isFrozen(supplied)).toBe(true);
    expect(Object.isFrozen(supplied.people)).toBe(true);
    expect(Object.isFrozen(supplied.robot)).toBe(true);
    for (const path of supplied.people) {
      expect(Object.isFrozen(path)).toBe(true);
    }
  });

  it("hands back a null robot for an arm that had none", () => {
    // The default treatment is robot-presence, so the control arm is the room with no robot in it.
    const supplied = suppliedRunFrom(RUN.control, CONFIG.dt);
    expect(RUN.control.robotPositions).toBeNull();
    expect(supplied.robot).toBeNull();
    expect(supplied.people.length).toBe(CONFIG.crowd.nPedestrians);
  });
});

describe("the arrays are copies", () => {
  it("leaves the arm's own buffer untouched when a person's path is written to", () => {
    const run = runPair(CONFIG);
    const supplied = suppliedRunFrom(run.treated, CONFIG.dt);

    const source = run.treated.positions[0] as Float64Array;
    const before = source[0] as number;
    const path = supplied.people[0] as SuppliedPath;

    path.positions[0] = MUTATED_VALUE;

    expect(path.positions[0]).toBe(MUTATED_VALUE);
    expect(source[0]).toBe(before);
    expect(source[0]).not.toBe(MUTATED_VALUE);
  });

  it("leaves the arm's own buffer untouched when the robot's path is written to", () => {
    const run = runPair(CONFIG);
    const supplied = suppliedRunFrom(run.treated, CONFIG.dt);

    const source = run.treated.robotPositions as Float64Array;
    const before = source[0] as number;
    const robot = supplied.robot as SuppliedPath;

    robot.positions[0] = MUTATED_VALUE;

    expect(robot.positions[0]).toBe(MUTATED_VALUE);
    expect(source[0]).toBe(before);
  });

  it("writes to no person's buffer when a whole path is filled", () => {
    const run = runPair(CONFIG);
    const supplied = suppliedRunFrom(run.treated, CONFIG.dt);

    const originals: number[][] = [];
    for (const buffer of run.treated.positions) {
      originals.push(Array.from(buffer));
    }

    for (const path of supplied.people) {
      path.positions.fill(MUTATED_VALUE);
    }

    for (let i = 0; i < run.treated.positions.length; i++) {
      const source = run.treated.positions[i] as Float64Array;
      expect(Array.from(source)).toEqual(originals[i]);
    }
  });

  /**
   * The meta-test the three above are worthless without.
   *
   * It performs the identical mutation through a view that deliberately SHARES the arm's memory,
   * and asserts the arm changes. If this ever goes green-by-not-happening — a frozen buffer, a
   * silently ignored write — then "the source is unchanged" above stops being evidence of a copy
   * and the whole block needs rewriting rather than trusting.
   */
  it("would see the mutation had the view shared the arm's buffer", () => {
    const run = runPair(CONFIG);
    const source = run.treated.positions[0] as Float64Array;
    const before = source[0] as number;

    const shared = new Float64Array(source.buffer, source.byteOffset, source.length);
    shared[0] = MUTATED_VALUE;

    expect(source[0]).toBe(MUTATED_VALUE);
    expect(source[0]).not.toBe(before);
  });
});

/**
 * Every key, every `kind` and every string anywhere inside the returned record.
 *
 * Typed arrays are not descended into: they are numbers, and the numbers are the point.
 */
interface Walked {
  readonly keys: string[];
  readonly kinds: string[];
  readonly strings: string[];
}

function walk(node: unknown, out: Walked): void {
  if (typeof node === "string") {
    out.strings.push(node);
    return;
  }
  if (node === null || typeof node !== "object") {
    return;
  }
  if (ArrayBuffer.isView(node)) {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, out);
    }
    return;
  }
  const record = node as Record<string, unknown>;
  const keys = Object.keys(record);
  for (const key of keys) {
    out.keys.push(key);
    const value = record[key];
    if (key === "kind" && typeof value === "string") {
      out.kinds.push(value);
    }
    walk(value, out);
  }
}

describe("nothing a corridor withholds is anywhere inside the view", () => {
  const ALLOWED_KEYS = ["kind", "people", "robot", "dt", "nSteps", "positions"];
  const ALLOWED_KINDS = ["suppliedRun", "suppliedPath"];

  function walkedOf(supplied: SuppliedRun): Walked {
    const out: Walked = { keys: [], kinds: [], strings: [] };
    walk(supplied, out);
    return out;
  }

  it("carries no key beyond the six the contract names", () => {
    const walked = walkedOf(suppliedRunFrom(RUN.treated, CONFIG.dt));

    expect(walked.keys.length).toBeGreaterThan(0);
    for (const key of walked.keys) {
      expect(ALLOWED_KEYS).toContain(key);
    }
  });

  it("names no person, no scene and no comparison arm", () => {
    const walked = walkedOf(suppliedRunFrom(RUN.treated, CONFIG.dt));
    const banned = [
      "agentId",
      "agentUid",
      "scene",
      "sceneId",
      "pedestrians",
      "robotPresent",
      "source",
      "seed",
      "control",
      "treated",
      "pair",
      "treatment",
      "arrivedTick",
      "trajectory",
    ];

    for (const key of walked.keys) {
      expect(banned).not.toContain(key);
    }
  });

  it("carries only the two kinds of thing it says it carries", () => {
    const walked = walkedOf(suppliedRunFrom(RUN.treated, CONFIG.dt));

    expect(walked.kinds.length).toBe(1 + RUN.treated.positions.length + 1);
    for (const kind of walked.kinds) {
      expect(ALLOWED_KINDS).toContain(kind);
    }
  });

  it("carries no string that could identify a person or a run", () => {
    const walked = walkedOf(suppliedRunFrom(RUN.treated, CONFIG.dt));

    for (const text of walked.strings) {
      expect(text).not.toMatch(/^(ped|inj)[0-9]+$/);
      expect(text).not.toMatch(/^robot$/);
      expect(text).not.toMatch(/treated|control/);
    }
  });

  /** The walk is only worth anything if it actually descends. Proved on a scene it must reject. */
  it("would have found a scene had one been reachable", () => {
    const out: Walked = { keys: [], kinds: [], strings: [] };
    walk({ kind: "wrapper", inner: { scene: RUN.treated.scene } }, out);

    expect(out.keys).toContain("scene");
    expect(out.keys).toContain("agentId");
    expect(out.kinds).toContain("scene");
    expect(out.kinds).toContain("trajectory");
  });
});

describe("suppliedRunFrom refuses a view it cannot honestly build", () => {
  it("refuses a time step that is not positive", () => {
    expect(() => suppliedRunFrom(RUN.treated, 0)).toThrow(ContractError);
    expect(() => suppliedRunFrom(RUN.treated, -0.05)).toThrow(/must be > 0/);
  });

  it("refuses a time step that is not finite", () => {
    expect(() => suppliedRunFrom(RUN.treated, Number.NaN)).toThrow(/must be finite/);
  });

  it("refuses an arm with nobody in it", () => {
    const empty: ArmResult = { ...RUN.treated, positions: [], robotPositions: null };
    expect(() => suppliedRunFrom(empty, CONFIG.dt)).toThrow(/at least one person/);
  });

  it("refuses a path whose length is not a whole number of samples", () => {
    const odd: ArmResult = {
      ...RUN.treated,
      positions: [new Float64Array(3)],
      robotPositions: null,
    };
    expect(() => suppliedRunFrom(odd, CONFIG.dt)).toThrow(/even length/);
  });

  it("refuses a robot path of a different length from the crowd's", () => {
    const mismatched: ArmResult = {
      ...RUN.treated,
      positions: [new Float64Array(8)],
      robotPositions: new Float64Array(6),
    };
    expect(() => suppliedRunFrom(mismatched, CONFIG.dt)).toThrow(/share the crowd's step count/);
  });

  it("refuses a path carrying a value that is not a number", () => {
    const broken = new Float64Array(4);
    broken[2] = Number.NaN;
    const arm: ArmResult = { ...RUN.treated, positions: [broken], robotPositions: null };
    expect(() => suppliedRunFrom(arm, CONFIG.dt)).toThrow(/only finite values/);
  });
});

describe("judgeSuppliedResult", () => {
  it("reads two identical finite numbers", () => {
    const outcome = judgeSuppliedResult(0.352, 0.352);
    expect(outcome.kind).toBe("read");
    if (outcome.kind === "read") {
      expect(outcome.valueM).toBe(0.352);
    }
  });

  it("reads a hard zero as a reading rather than an absence", () => {
    const outcome = judgeSuppliedResult(0, 0);
    expect(outcome).toEqual({ kind: "read", valueM: 0 });
  });

  it("reads a negative number, which is a legal answer", () => {
    const outcome = judgeSuppliedResult(-1.5, -1.5);
    expect(outcome).toEqual({ kind: "read", valueM: -1.5 });
  });

  it("calls two numbers differing in the last bit nondeterministic", () => {
    const first = 1;
    const second = 1 + Number.EPSILON;

    expect(second - first).toBeGreaterThan(0);
    expect(second).toBeCloseTo(first, 15);

    const outcome = judgeSuppliedResult(first, second);
    expect(outcome.kind).toBe("nondeterministic");
    if (outcome.kind === "nondeterministic") {
      expect(outcome.firstM).toBe(first);
      expect(outcome.secondM).toBe(second);
    }
  });

  it("separates positive and negative zero, which differ by no amount but are not the same bits", () => {
    // Bitwise comparison is what the spec asks for and `!==` does not distinguish these two, so
    // this pins the behaviour that IS shipped rather than one somebody might assume.
    const outcome = judgeSuppliedResult(0, -0);
    expect(outcome).toEqual({ kind: "read", valueM: 0 });
  });

  it("calls a large difference nondeterministic too", () => {
    const outcome = judgeSuppliedResult(1, 2);
    expect(outcome.kind).toBe("nondeterministic");
  });

  const FAILURES: readonly (readonly [string, unknown])[] = Object.freeze([
    ["a result that is not a number", Number.NaN],
    ["an endless distance", Number.POSITIVE_INFINITY],
    ["an endless negative distance", Number.NEGATIVE_INFINITY],
    ["a piece of text", "0.35"],
    ["nothing at all", undefined],
    ["an empty result", null],
    ["a bundle of results", { valueM: 0.35 }],
    ["a list of results", [0.35]],
    ["a yes-or-no answer", true],
    ["another method", () => 0.35],
    ["a whole number of a kind a distance cannot be read from", 10n],
    ["a name rather than a distance", Symbol("reading")],
  ]);

  it("fails on anything that is not a finite number, naming what came back", () => {
    for (const entry of FAILURES) {
      const expected = entry[0];
      const returned = entry[1];
      const outcome = judgeSuppliedResult(returned, returned);

      expect(outcome.kind).toBe("failed");
      if (outcome.kind === "failed") {
        expect(outcome.message).toContain(expected);
        expect(outcome.message).toContain("the first time it was run");
      }
    }
  });

  it("names the second run when the first one worked and the second did not", () => {
    const outcome = judgeSuppliedResult(0.35, Number.NaN);

    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.message).toContain("the second time it was run");
      expect(outcome.message).toContain("a result that is not a number");
    }
  });

  it("reports the first failure and does not look past it", () => {
    const outcome = judgeSuppliedResult(undefined, Number.NaN);

    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.message).toContain("nothing at all");
      expect(outcome.message).toContain("the first time it was run");
    }
  });

  it("writes every failure in plain English, with no code identifier in it", () => {
    for (const entry of FAILURES) {
      const returned = entry[1];
      const outcome = judgeSuppliedResult(returned, returned);

      expect(outcome.kind).toBe("failed");
      if (outcome.kind === "failed") {
        expect(outcome.message).not.toMatch(CODE_IDENTIFIER);
        expect(outcome.message).not.toMatch(/NaN|undefined|null|typeof|Infinity/);
      }
    }
  });

  it("freezes every outcome it returns", () => {
    const outcomes: readonly SuppliedOutcome[] = [
      judgeSuppliedResult(1, 1),
      judgeSuppliedResult(1, 2),
      judgeSuppliedResult("x", "x"),
    ];
    for (const outcome of outcomes) {
      expect(Object.isFrozen(outcome)).toBe(true);
    }
  });
});
