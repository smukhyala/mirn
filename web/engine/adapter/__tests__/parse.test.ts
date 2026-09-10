import { describe, expect, it } from "vitest";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";
import { parseRunSet } from "../parse.js";

function minimalText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    mirnTrajectoryFormat: 1,
    scenario: { scenarioId: "s", widthM: 10, heightM: 8, dt: 0.1, nSteps: 3 },
    provenance: { producer: "omnisim", producerVersion: "0", simulator: "x", crowdModel: "y", build: "b" },
    bodies: { pedestrianRadiusM: 0.24, robotRadiusM: 0.32 },
    treatment: { kind: "robot-presence" },
    runs: [
      { runId: "t", role: "treated", seed: 7, robotPresent: true, completion: null,
        robot: { positions: [0, 0, 1, 0, 2, 0] },
        agents: [{ id: "a", positions: [0, 1, 0, 2, 0, 3] }, { id: "b", positions: [1, 1, 1, 2, 1, 3] }] },
      { runId: "c", role: "control", seed: 7, robotPresent: false, completion: null,
        robot: null,
        agents: [{ id: "a", positions: [0, 1, 0, 2, 0, 3] }, { id: "b", positions: [1, 1, 1, 2, 1, 3] }] },
    ],
    ...overrides,
  });
}

describe("reading a run set", () => {
  it("reads a well-formed run set", () => {
    const set = parseRunSet(minimalText());
    expect(set.kind).toBe("runSet");
    expect(set.runs.length).toBe(2);
    expect(set.runs[0]?.role).toBe("treated");
    expect(set.scenario.dt).toBe(0.1);
    expect(set.bodies.pedRadiusM).toBe(0.24);
  });

  it("refuses a format version it does not know", () => {
    expect(() => parseRunSet(minimalText({ mirnTrajectoryFormat: 2 }))).toThrow(/version/i);
  });

  it("refuses text that is not a run set at all", () => {
    expect(() => parseRunSet("not json")).toThrow(/could not be read/i);
  });

  it("refuses a run whose positions do not divide into pairs", () => {
    const broken = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = broken["runs"] as { agents: { positions: number[] }[] }[];
    (runs[0] as { agents: { positions: number[] }[] }).agents[0]!.positions = [0, 1, 2];
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(/pairs/i);
  });

  it("refuses a position that is not a number", () => {
    const broken = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = broken["runs"] as { agents: { positions: unknown[] }[] }[];
    (runs[0] as { agents: { positions: unknown[] }[] }).agents[0]!.positions[0] = "over there";
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(/number/i);
  });

  it("refuses a run set with no runs in it", () => {
    expect(() => parseRunSet(minimalText({ runs: [] }))).toThrow(/holds no runs/i);
  });

  it("reads a completion, naming the field a sample index rather than a tick", () => {
    const withCompletion = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = withCompletion["runs"] as Record<string, unknown>[];
    runs[0]!["completion"] = { outcome: "arrived", atSample: 12 };
    const set = parseRunSet(JSON.stringify(withCompletion));
    expect(set.runs[0]?.completion?.atSample).toBe(12);
    expect(set.runs[0]?.completion?.outcome).toBe("arrived");
  });

  it("refuses a completion whose sample index is negative", () => {
    const broken = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = broken["runs"] as Record<string, unknown>[];
    runs[0]!["completion"] = { outcome: "arrived", atSample: -1 };
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(/whole/i);
  });

  it("refuses a completion whose sample index is not a whole number", () => {
    const broken = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = broken["runs"] as Record<string, unknown>[];
    runs[0]!["completion"] = { outcome: "arrived", atSample: 1.5 };
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(/whole/i);
  });

  it("refuses a run that claims a robot but carries no robot path", () => {
    const broken = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = broken["runs"] as Record<string, unknown>[];
    runs[0]!["robot"] = null;
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(/says a robot is in it/i);
  });

  it("refuses a run that says no robot but carries a robot path anyway", () => {
    const broken = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = broken["runs"] as Record<string, unknown>[];
    runs[1]!["robot"] = { positions: [0, 0] };
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(/says no robot is in it/i);
  });

  it("refuses a run whose role is not one this bench knows", () => {
    const broken = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = broken["runs"] as Record<string, unknown>[];
    runs[0]!["role"] = "bystander";
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(/not a part this bench knows/i);
  });

  it("refuses two agents in the same run sharing an identifier", () => {
    const broken = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = broken["runs"] as { agents: { id: string }[] }[];
    runs[0]!.agents[1]!.id = "a";
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(/twice/i);
  });

  it("freezes the run set and its nested records", () => {
    const set = parseRunSet(minimalText());
    expect(Object.isFrozen(set)).toBe(true);
    expect(Object.isFrozen(set.runs)).toBe(true);
    expect(Object.isFrozen(set.runs[0])).toBe(true);
    expect(Object.isFrozen(set.scenario)).toBe(true);
    expect(Object.isFrozen(set.bodies)).toBe(true);
  });

  it("names the roles in plain English rather than in code", () => {
    const broken = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = broken["runs"] as Record<string, unknown>[];
    runs[0]!["role"] = "bystander";
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(
      /the treated run, the control run, the pair in which nobody responds to the robot, or a repeat run/i,
    );
  });

  it("refuses a run whose own paths do not agree with each other on how many samples there are", () => {
    const broken = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = broken["runs"] as { agents: { positions: number[] }[] }[];
    // The scenario says 3 samples. Agent 'a' stays at 3; agent 'b' is stretched to 4, so the two
    // paths in this one run disagree with each other (and, necessarily, with the scenario too).
    runs[0]!.agents[1]!.positions = [1, 1, 1, 2, 1, 3, 1, 4];
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(/runs for 4 samples/i);
  });

  it("refuses a run whose paths agree with each other but not with the scenario", () => {
    const broken = JSON.parse(minimalText()) as Record<string, unknown>;
    const runs = broken["runs"] as {
      robot: { positions: number[] } | null;
      agents: { positions: number[] }[];
    }[];
    // Robot and both people in the run agree with each other at 4 samples; the scenario says 3.
    runs[0]!.robot = { positions: [0, 0, 1, 0, 2, 0, 3, 0] };
    runs[0]!.agents[0]!.positions = [0, 1, 0, 2, 0, 3, 0, 4];
    runs[0]!.agents[1]!.positions = [1, 1, 1, 2, 1, 3, 1, 4];
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(
      /the scenario says this room runs for 3 samples/i,
    );
  });

  describe("no error message names a bare code identifier", () => {
    // Guardrail 12: a parser error is read by somebody holding a file another team produced, and
    // it must never hand them a wire value like `zeroTreated` to puzzle out. This is the test
    // whose absence let that leak ship in the first place — every fail() call site in parse.ts
    // gets a malformed input here, so the next one fails the build instead of a review.
    //
    // Every deliberately-wrong value fed in below is plain lower-case English with no camelCase
    // or snake_case in it, specifically so this test is checking parse.ts's OWN wording rather
    // than accidentally tripping over a value it merely echoes back.

    function messageOf(run: () => unknown): string {
      try {
        run();
      } catch (error) {
        if (error instanceof Error) {
          return error.message;
        }
        throw error;
      }
      throw new Error("expected the call to throw, and it did not");
    }

    function brokenRuns(edit: (runs: Record<string, unknown>[]) => void): string {
      const broken = JSON.parse(minimalText()) as Record<string, unknown>;
      edit(broken["runs"] as Record<string, unknown>[]);
      return JSON.stringify(broken);
    }

    const cases: readonly { readonly name: string; readonly run: () => unknown }[] = [
      { name: "malformed JSON", run: () => parseRunSet("not json") },
      { name: "the whole document is not a block of values",
        run: () => parseRunSet(JSON.stringify([1, 2, 3])) },
      { name: "unknown format version",
        run: () => parseRunSet(minimalText({ mirnTrajectoryFormat: 2 })) },
      { name: "scenario is not a block of values",
        run: () => parseRunSet(minimalText({ scenario: 5 })) },
      { name: "scenario runs for too few samples",
        run: () => parseRunSet(minimalText({
          scenario: { scenarioId: "s", widthM: 10, heightM: 8, dt: 0.1, nSteps: 1 },
        })) },
      { name: "scenario's time step is not above nought",
        run: () => parseRunSet(minimalText({
          scenario: { scenarioId: "s", widthM: 10, heightM: 8, dt: 0, nSteps: 3 },
        })) },
      { name: "provenance field is not text",
        run: () => parseRunSet(minimalText({
          provenance: { producer: 5, producerVersion: "0", simulator: "x", crowdModel: "y", build: "b" },
        })) },
      { name: "body size is not a number",
        run: () => parseRunSet(minimalText({ bodies: { pedestrianRadiusM: "wide", robotRadiusM: 0.32 } })) },
      { name: "treatment kind not known",
        run: () => parseRunSet(minimalText({ treatment: { kind: "unknown" } })) },
      { name: "runs is not a list",
        run: () => parseRunSet(minimalText({ runs: "nope" })) },
      { name: "runs is empty",
        run: () => parseRunSet(minimalText({ runs: [] })) },
      { name: "a run is not a block of values",
        run: () => parseRunSet(brokenRuns((runs) => {
          runs[0] = "nope" as unknown as Record<string, unknown>;
        })) },
      { name: "unknown role",
        run: () => parseRunSet(brokenRuns((runs) => { runs[0]!["role"] = "bystander"; })) },
      { name: "seed is not a whole number",
        run: () => parseRunSet(brokenRuns((runs) => { runs[0]!["seed"] = 1.5; })) },
      { name: "robotPresent is not a flag",
        run: () => parseRunSet(brokenRuns((runs) => { runs[0]!["robotPresent"] = "yes"; })) },
      { name: "robot claimed but no path given",
        run: () => parseRunSet(brokenRuns((runs) => { runs[0]!["robot"] = null; })) },
      { name: "robot not claimed but a path given anyway",
        run: () => parseRunSet(brokenRuns((runs) => {
          runs[1]!["robot"] = { positions: [0, 0] };
        })) },
      { name: "robot path is not a block of values",
        run: () => parseRunSet(brokenRuns((runs) => { runs[0]!["robot"] = "nope"; })) },
      { name: "agents is not a list",
        run: () => parseRunSet(brokenRuns((runs) => { runs[0]!["agents"] = "nope"; })) },
      { name: "agents is empty",
        run: () => parseRunSet(brokenRuns((runs) => { runs[0]!["agents"] = []; })) },
      { name: "an agent is not a block of values",
        run: () => parseRunSet(brokenRuns((runs) => {
          (runs[0]!["agents"] as unknown[])[0] = "nope";
        })) },
      { name: "an agent's name is not text",
        run: () => parseRunSet(brokenRuns((runs) => {
          ((runs[0]!["agents"] as Record<string, unknown>[])[0]!)["id"] = 5;
        })) },
      { name: "two agents share a name",
        run: () => parseRunSet(brokenRuns((runs) => {
          (runs[0]!["agents"] as Record<string, unknown>[])[1]!["id"] = "a";
        })) },
      { name: "positions do not divide into pairs",
        run: () => parseRunSet(brokenRuns((runs) => {
          (runs[0]!["agents"] as Record<string, unknown>[])[0]!["positions"] = [0, 1, 2];
        })) },
      { name: "positions list is empty",
        run: () => parseRunSet(brokenRuns((runs) => {
          (runs[0]!["agents"] as Record<string, unknown>[])[0]!["positions"] = [];
        })) },
      { name: "a position is not a number",
        run: () => parseRunSet(brokenRuns((runs) => {
          (runs[0]!["agents"] as Record<string, unknown>[])[0]!["positions"] = [0, "over there", 0, 2, 0, 3];
        })) },
      { name: "a run's paths disagree with each other",
        run: () => parseRunSet(brokenRuns((runs) => {
          (runs[0]!["agents"] as Record<string, unknown>[])[1]!["positions"] = [1, 1, 1, 2, 1, 3, 1, 4];
        })) },
      { name: "a run's paths disagree with the scenario",
        run: () => parseRunSet(brokenRuns((runs) => {
          runs[0]!["robot"] = { positions: [0, 0, 1, 0, 2, 0, 3, 0] };
          (runs[0]!["agents"] as Record<string, unknown>[])[0]!["positions"] = [0, 1, 0, 2, 0, 3, 0, 4];
          (runs[0]!["agents"] as Record<string, unknown>[])[1]!["positions"] = [1, 1, 1, 2, 1, 3, 1, 4];
        })) },
      { name: "completion is not a block of values",
        run: () => parseRunSet(brokenRuns((runs) => { runs[0]!["completion"] = "nope"; })) },
      { name: "completion's outcome is not text",
        run: () => parseRunSet(brokenRuns((runs) => {
          runs[0]!["completion"] = { outcome: 5, atSample: 1 };
        })) },
      { name: "completion's sample index is negative",
        run: () => parseRunSet(brokenRuns((runs) => {
          runs[0]!["completion"] = { outcome: "arrived", atSample: -1 };
        })) },
      { name: "completion's sample index is not a whole number",
        run: () => parseRunSet(brokenRuns((runs) => {
          runs[0]!["completion"] = { outcome: "arrived", atSample: 1.5 };
        })) },
    ];

    for (const testCase of cases) {
      it(`for: ${testCase.name}`, () => {
        const message = messageOf(testCase.run);
        expect(CODE_IDENTIFIER.test(message)).toBe(false);
      });
    }
  });
});
