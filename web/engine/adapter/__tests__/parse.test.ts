import { describe, expect, it } from "vitest";
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
    expect(() => parseRunSet(JSON.stringify(broken))).toThrow(/not one this bench knows/i);
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
});
