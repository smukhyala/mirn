import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ContractError } from "../../../engine/core/errors.js";
import {
  judgeSuppliedResult,
  type SuppliedPath,
  type SuppliedRun,
} from "../../../engine/job/supplied.js";
import {
  compileSupplied,
  METHOD_STOPPED,
  NETWORK_GLOBALS,
  UNREADABLE_METHOD,
} from "../supplied.sandbox.js";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";

/**
 * The one module allowed to compile a reader's text, checked at its two edges.
 *
 * What is worth testing here is not that a function body runs — it is what happens at the four
 * places where a supplied method can be wrong: text that is not a function, a method that stops, a
 * method that answers with something that is not a number, and a method that reaches for the
 * network. The first three must come back as sentences rather than as an exception nobody catches,
 * the fourth must find nothing on the other side of the door, and the door must be open again
 * afterwards or every later run of the console would be measured in a browser this file broke.
 *
 * Nothing here judges a reading. That is `judgeSuppliedResult`'s job, and one of the tests below
 * exists precisely to show that this module hands a nonsense value over untouched instead of
 * rounding it into one.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SANDBOX_FILE = join(HERE, "..", "supplied.sandbox.ts");

const N_STEPS = 3;

function pathOf(xs: readonly number[]): SuppliedPath {
  const positions = new Float64Array(2 * N_STEPS);
  for (let i = 0; i < N_STEPS; i++) {
    positions[2 * i] = xs[i] as number;
    positions[2 * i + 1] = 0;
  }
  return Object.freeze({ kind: "suppliedPath" as const, positions, nSteps: N_STEPS });
}

/** One run in the shape a corridor gives you: the people, the robot, and no comparison arm. */
const RUN: SuppliedRun = Object.freeze({
  kind: "suppliedRun" as const,
  people: Object.freeze([pathOf([0, 1, 2]), pathOf([0, 2, 4])]),
  robot: pathOf([0, 0.5, 1]),
  dt: 0.1,
  nSteps: N_STEPS,
});

function descriptorsNow(): (PropertyDescriptor | undefined)[] {
  const found: (PropertyDescriptor | undefined)[] = [];
  for (const name of NETWORK_GLOBALS) {
    found.push(Object.getOwnPropertyDescriptor(globalThis, name));
  }
  return found;
}

describe("a method that works", () => {
  it("compiles a body and returns the number it returned", () => {
    const method = compileSupplied("return 0.25 * run.nSteps;");
    expect(method(RUN)).toBe(0.75);
  });

  it("gives the body the run, and only the run", () => {
    // One argument, named for what it is. The body reads the people and the robot off it, which is
    // everything a corridor would have given it and nothing else.
    const method = compileSupplied(
      "let total = 0;\n" +
        "for (const person of run.people) {\n" +
        "  total = total + person.positions[2 * (person.nSteps - 1)];\n" +
        "}\n" +
        "return total - run.robot.positions[0];",
    );
    expect(method(RUN)).toBe(6);
  });

  it("compiles once and runs as often as it is asked", () => {
    const method = compileSupplied("return run.people.length;");
    expect(method(RUN)).toBe(2);
    expect(method(RUN)).toBe(2);
  });
});

describe("a method that cannot be read at all", () => {
  it("reports the failure in a sentence instead of letting the error escape", () => {
    // The raw error out of a failed compile is not something a reader can act on, and an
    // uncaught one inside a worker is a progress line that stops with no explanation. What escapes
    // here is this project's one contract failure, carrying a sentence and then the browser's own
    // words after it.
    let thrown: unknown = null;
    try {
      compileSupplied("return (");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ContractError);
    expect(thrown).not.toBeInstanceOf(SyntaxError);
    const message = (thrown as ContractError).message;
    expect(message.startsWith(UNREADABLE_METHOD)).toBe(true);
    expect(message.length).toBeGreaterThan(UNREADABLE_METHOD.length + 1);
  });

  it("says so in plain English, the way every other surface has to", () => {
    expect(CODE_IDENTIFIER.test(UNREADABLE_METHOD)).toBe(false);
    expect(CODE_IDENTIFIER.test(METHOD_STOPPED)).toBe(false);
  });
});

describe("a method that stops part way through", () => {
  it("is caught at the call and reported in the method's own words", () => {
    // Guardrail: a failure surfaces with the failing thing's own message. A substituted apology
    // would be this page failing at the one subject it teaches.
    const method = compileSupplied("throw new Error('this ruler needs the room without the robot');");
    let thrown: unknown = null;
    try {
      method(RUN);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ContractError);
    const message = (thrown as ContractError).message;
    expect(message.startsWith(METHOD_STOPPED)).toBe(true);
    expect(message).toContain("this ruler needs the room without the robot");
  });

  it("catches a method that throws nothing anybody can read", () => {
    const method = compileSupplied("throw 0;");
    expect(() => method(RUN)).toThrow(ContractError);
  });
});

describe("what comes back is passed on, not judged", () => {
  it("hands a value that is not a number over exactly as it came", () => {
    const method = compileSupplied("return 'about a metre';");
    const first = method(RUN);
    const second = method(RUN);
    expect(first).toBe("about a metre");
    expect(second).toBe("about a metre");
    // And the thing that decides what that means is the judge, which sees both runs. If the
    // sandbox had coerced, rounded or refused it, these two verdicts could not differ.
    const onWords = judgeSuppliedResult(first, second);
    const onNumbers = judgeSuppliedResult(1.5, 1.5);
    expect(onWords).not.toEqual(onNumbers);
  });

  it("hands back nothing at all when the body returned nothing at all", () => {
    const method = compileSupplied("run.nSteps;");
    expect(method(RUN)).toBeUndefined();
  });

  it("does not turn a value that is not finite into a reading", () => {
    const method = compileSupplied("return 0 / 0;");
    const value = method(RUN);
    expect(Number.isNaN(value as number)).toBe(true);
  });
});

describe("the network globals, while a supplied method runs", () => {
  it("shuts every door on the list, and every one of them is shut at once", () => {
    const body =
      `const shut = [];\n` +
      `for (const name of ${JSON.stringify(NETWORK_GLOBALS)}) {\n` +
      `  shut.push(globalThis[name]);\n` +
      `}\n` +
      `return shut;`;
    const method = compileSupplied(body);
    const seen = method(RUN) as unknown[];
    expect(seen.length).toBe(NETWORK_GLOBALS.length);
    expect(seen.length).toBeGreaterThan(4);
    for (const value of seen) {
      expect(value).toBeNull();
    }
  });

  it("turns an accidental call into a reported failure rather than a request", () => {
    // This is the whole of what the shutting buys: a stray line that phones home stops the method
    // and says so, instead of quietly reaching the network from a page that has no server.
    const name = NETWORK_GLOBALS[0] as string;
    const method = compileSupplied(`const door = globalThis[${JSON.stringify(name)}];\nreturn door();`);
    expect(() => method(RUN)).toThrow(ContractError);
  });

  it("puts every one of them back exactly as it found it", () => {
    // Restoring matters more than shutting. The worker outlives the call, so a door left shut
    // would be a browser this module quietly broke for everything that runs after it.
    const before = descriptorsNow();
    const method = compileSupplied("return 1;");
    method(RUN);
    expect(descriptorsNow()).toEqual(before);
  });

  it("puts them back even when the method stopped", () => {
    const before = descriptorsNow();
    const method = compileSupplied("throw new Error('no');");
    expect(() => method(RUN)).toThrow(ContractError);
    expect(descriptorsNow()).toEqual(before);
  });

  it("names the doors it shuts as a closed list rather than a pattern", () => {
    // A canary for a list quietly emptied: an empty list would pass every test above without
    // shutting anything.
    expect(NETWORK_GLOBALS.length).toBeGreaterThan(4);
    expect(NETWORK_GLOBALS).toContain("fetch");
    expect(NETWORK_GLOBALS).toContain("importScripts");
    expect(Object.isFrozen(NETWORK_GLOBALS)).toBe(true);
  });
});

describe("the sandbox boundary", () => {
  it("keeps the one compile route in this file, where a scan can find it", () => {
    // The canary. Somebody tidying this into an imported helper would move the boundary without
    // moving the test that guards it, and the scan that asserts no other module under web/ compiles
    // text would then be guarding an empty file. Written as the call form rather than the bare
    // words, so this test is not itself an offender for describing the thing it checks.
    const source = readFileSync(SANDBOX_FILE, "utf8");
    expect(/\bnew\s+Function\s*\(/.test(source)).toBe(true);
  });

  it("says out loud that it is not a jail", () => {
    // Overclaiming is the failure this whole path was allowed on condition of avoiding. The header
    // has to keep saying what the shutting does not do, so the next reader of this module is not
    // left with the impression that a supplied method is contained.
    const source = readFileSync(SANDBOX_FILE, "utf8");
    expect(source).toContain("not a jail");
    expect(source.toLowerCase()).toContain("permalink never carries code");
  });
});
