import { describe, expect, it } from "vitest";
import { ContractError } from "../core/errors.js";
import { makeTrajectory, positionAt, resampleTo, times } from "./trajectory.js";
import { makeScene, pedestrianById } from "./scene.js";
import { makePairedRun, pairedAgents } from "./pairedRun.js";
import type { Trajectory } from "./trajectory.js";

function straightLine(agentId: string, uid: number, x0: number, y0: number, n: number): Trajectory {
  const positions = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    positions[2 * i] = x0 + i * 0.1;
    positions[2 * i + 1] = y0;
  }
  return makeTrajectory({ agentId, agentUid: uid, positions, t0: 0, dt: 0.05 });
}

describe("Trajectory", () => {
  it("derives nSteps from the flat buffer", () => {
    const t = straightLine("ped0", 0, 1, 2, 10);
    expect(t.nSteps).toBe(10);
    expect(t.positions.length).toBe(20);
  });

  it("rejects an odd-length buffer", () => {
    expect(() =>
      makeTrajectory({ agentId: "ped0", agentUid: 0, positions: new Float64Array(5), t0: 0, dt: 0.05 }),
    ).toThrow(ContractError);
  });

  it("rejects an empty buffer", () => {
    expect(() =>
      makeTrajectory({ agentId: "ped0", agentUid: 0, positions: new Float64Array(0), t0: 0, dt: 0.05 }),
    ).toThrow(/at least one timestep/);
  });

  it.each([
    ["dt = 0", 0],
    ["negative dt", -0.05],
    ["infinite dt", Number.POSITIVE_INFINITY],
    ["NaN dt", Number.NaN],
  ])("rejects %s", (_label, dt) => {
    expect(() =>
      makeTrajectory({ agentId: "ped0", agentUid: 0, positions: new Float64Array(4), t0: 0, dt }),
    ).toThrow(ContractError);
  });

  it("rejects a non-finite position and names the index and agent", () => {
    const positions = new Float64Array([0, 0, 1, Number.NaN]);
    expect(() => makeTrajectory({ agentId: "ped7", agentUid: 7, positions, t0: 0, dt: 0.05 })).toThrow(
      /index 3 of agent 'ped7'/,
    );
  });

  it("constrains the agentId charset so sort order agrees with Python", () => {
    // Python sorts by code point, JS by UTF-16 code unit. They agree over this charset, and
    // asserting it is what turns that agreement from an assumption into a guarantee.
    expect(() =>
      makeTrajectory({ agentId: "Ped0", agentUid: 0, positions: new Float64Array(4), t0: 0, dt: 0.05 }),
    ).toThrow(/sort order agrees/);
    expect(() =>
      makeTrajectory({ agentId: "ped-0", agentUid: 0, positions: new Float64Array(4), t0: 0, dt: 0.05 }),
    ).toThrow(/sort order agrees/);
  });

  it("reads a position back by step, and refuses an out-of-range step", () => {
    const t = straightLine("ped0", 0, 1, 2, 4);
    expect(positionAt(t, 0)).toEqual([1, 2]);
    expect(positionAt(t, 3)).toEqual([1.3, 2]);
    expect(() => positionAt(t, 4)).toThrow(/in \[0, 4\)/);
    expect(() => positionAt(t, -1)).toThrow(ContractError);
  });

  it("builds the time grid from t0 and dt", () => {
    const t = makeTrajectory({
      agentId: "ped0",
      agentUid: 0,
      positions: new Float64Array([0, 0, 1, 1, 2, 2]),
      t0: 1.5,
      dt: 0.5,
    });
    expect([...times(t)]).toEqual([1.5, 2, 2.5]);
  });

  it("resamples onto a coarser grid without extending past the original span", () => {
    const t = makeTrajectory({
      agentId: "ped0",
      agentUid: 0,
      positions: new Float64Array([0, 0, 1, 0, 2, 0, 3, 0, 4, 0]),
      t0: 0,
      dt: 0.25,
    });
    const coarse = resampleTo(t, 0.5);
    // span is 1.0 s, so floor(1.0 / 0.5 + 1e-9) + 1 = 3 samples.
    expect(coarse.nSteps).toBe(3);
    expect([...coarse.positions]).toEqual([0, 0, 2, 0, 4, 0]);
  });

  it("collapses a single-sample trajectory rather than dividing by a zero span", () => {
    const t = makeTrajectory({
      agentId: "ped0",
      agentUid: 0,
      positions: new Float64Array([3, 4]),
      t0: 0,
      dt: 0.25,
    });
    expect(resampleTo(t, 0.1).nSteps).toBe(1);
  });
});

describe("Scene", () => {
  it("rejects robotPresent disagreeing with robot", () => {
    const ped = straightLine("ped0", 0, 0, 0, 4);
    expect(() =>
      makeScene({ sceneId: "s", pedestrians: [ped], robot: null, robotPresent: true, source: "t", seed: 0 }),
    ).toThrow(/robotPresent is true but Scene.robot is null/);
    expect(() =>
      makeScene({
        sceneId: "s",
        pedestrians: [ped],
        robot: straightLine("robot", -1, 0, 0, 4),
        robotPresent: false,
        source: "t",
        seed: 0,
      }),
    ).toThrow(/robotPresent is false but Scene.robot is not null/);
  });

  it("rejects duplicate ids and duplicate uids", () => {
    const a = straightLine("ped0", 0, 0, 0, 4);
    const b = straightLine("ped0", 1, 0, 0, 4);
    expect(() =>
      makeScene({ sceneId: "s", pedestrians: [a, b], robot: null, robotPresent: false, source: "t", seed: 0 }),
    ).toThrow(/duplicate agentId/);

    const c = straightLine("ped1", 0, 0, 0, 4);
    expect(() =>
      makeScene({ sceneId: "s", pedestrians: [a, c], robot: null, robotPresent: false, source: "t", seed: 0 }),
    ).toThrow(/duplicate agentUid/);
  });

  it("requires one shared dt", () => {
    const a = straightLine("ped0", 0, 0, 0, 4);
    const b = makeTrajectory({
      agentId: "ped1",
      agentUid: 1,
      positions: new Float64Array(8),
      t0: 0,
      dt: 0.1,
    });
    expect(() =>
      makeScene({ sceneId: "s", pedestrians: [a, b], robot: null, robotPresent: false, source: "t", seed: 0 }),
    ).toThrow(/must share a single dt/);
  });

  it("looks a pedestrian up by id and throws for a missing one", () => {
    const scene = makeScene({
      sceneId: "s",
      pedestrians: [straightLine("ped0", 0, 0, 0, 4)],
      robot: null,
      robotPresent: false,
      source: "t",
      seed: 0,
    });
    expect(pedestrianById(scene, "ped0").agentUid).toBe(0);
    expect(() => pedestrianById(scene, "ped9")).toThrow(/no pedestrian with agentId 'ped9'/);
  });
});

describe("PairedRun", () => {
  function armPair(overrides: { treatedShift?: number; controlSteps?: number } = {}) {
    const treatedPed = straightLine("ped0", 0, overrides.treatedShift ?? 0, 0, 6);
    const controlPed = straightLine("ped0", 0, 0, 0, overrides.controlSteps ?? 6);
    const treated = makeScene({
      sceneId: "t",
      pedestrians: [treatedPed],
      robot: straightLine("robot", -1, 0, 5, 6),
      robotPresent: true,
      source: "sfm",
      seed: 7,
    });
    const control = makeScene({
      sceneId: "c",
      pedestrians: [controlPed],
      robot: null,
      robotPresent: false,
      source: "sfm",
      seed: 7,
    });
    return { treated, control };
  }

  it("accepts a well-formed robot-presence pair", () => {
    const { treated, control } = armPair();
    const pair = makePairedRun({ treated, control, treatment: { kind: "robot-presence" } });
    expect(pair.seed).toBe(7);
    expect(pair.nSteps).toBe(6);
  });

  it("rejects mismatched seeds", () => {
    const { treated } = armPair();
    const control = makeScene({
      sceneId: "c",
      pedestrians: [straightLine("ped0", 0, 0, 0, 6)],
      robot: null,
      robotPresent: false,
      source: "sfm",
      seed: 8,
    });
    expect(() => makePairedRun({ treated, control, treatment: { kind: "robot-presence" } })).toThrow(
      /treated.seed === control.seed/,
    );
  });

  it("rejects a first position that differs at all — stricter than Python's 1e-9", () => {
    // Python tolerates 1e-9 because third-party adapters have to be accommodated. Here both arms
    // come from one function against one tape, so any difference means the tape leaked arm state.
    const { control } = armPair();
    const drifted = makeTrajectory({
      agentId: "ped0",
      agentUid: 0,
      positions: Float64Array.from(straightLine("ped0", 0, 0, 0, 6).positions),
      t0: 0,
      dt: 0.05,
    });
    drifted.positions[0] = 1e-16;
    const treated = makeScene({
      sceneId: "t",
      pedestrians: [drifted],
      robot: straightLine("robot", -1, 0, 5, 6),
      robotPresent: true,
      source: "sfm",
      seed: 7,
    });
    expect(() => makePairedRun({ treated, control, treatment: { kind: "robot-presence" } })).toThrow(
      /identical first position exactly/,
    );
  });

  it("rejects unequal nSteps — a check Python does not make", () => {
    const { treated, control } = armPair({ controlSteps: 5 });
    expect(() => makePairedRun({ treated, control, treatment: { kind: "robot-presence" } })).toThrow(
      /identical nSteps/,
    );
  });

  it("rejects a robot-presence pair whose control still has a robot", () => {
    const { treated } = armPair();
    expect(() => makePairedRun({ treated, control: treated, treatment: { kind: "robot-presence" } })).toThrow(
      /control.robotPresent is false/,
    );
  });

  it("requires the robot in the same state in both arms for a disturbance treatment", () => {
    const { treated, control } = armPair();
    expect(() =>
      makePairedRun({ treated, control, treatment: { kind: "disturbance", disturbanceId: "shove" } }),
    ).toThrow(/only a robot-presence treatment may differ on it/);
  });

  it("orders paired agents by agentId", () => {
    const ids = ["ped2", "ped0", "ped1"];
    const treatedPeds = ids.map((id, i) => straightLine(id, i, 0, i, 6));
    const controlPeds = ids.map((id, i) => straightLine(id, i, 0, i, 6));
    const treated = makeScene({
      sceneId: "t",
      pedestrians: treatedPeds,
      robot: straightLine("robot", -1, 0, 5, 6),
      robotPresent: true,
      source: "sfm",
      seed: 1,
    });
    const control = makeScene({
      sceneId: "c",
      pedestrians: controlPeds,
      robot: null,
      robotPresent: false,
      source: "sfm",
      seed: 1,
    });
    const pair = makePairedRun({ treated, control, treatment: { kind: "robot-presence" } });
    expect(pairedAgents(pair).map(([t]) => t.agentId)).toEqual(["ped0", "ped1", "ped2"]);
  });
});
