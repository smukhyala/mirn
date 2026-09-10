import { describe, expect, it } from "vitest";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";
import { paired } from "../../measure/estimator/index.js";
import { buildAdapted } from "../build.js";
import { parseRunSet } from "../parse.js";

/** Two people walking straight; the treated arm nudges one of them sideways after the first step. */
function text(nudgeM: number): string {
  const steps = 4;
  const control: number[][] = [[], []];
  const treated: number[][] = [[], []];
  for (let s = 0; s < steps; s++) {
    control[0]!.push(s * 0.5, 1);
    control[1]!.push(s * 0.5, 3);
    treated[0]!.push(s * 0.5, 1 + (s === 0 ? 0 : nudgeM));
    treated[1]!.push(s * 0.5, 3);
  }
  const robot: number[] = [];
  for (let s = 0; s < steps; s++) {
    robot.push(1 + s * 0.4, 2);
  }
  return JSON.stringify({
    mirnTrajectoryFormat: 1,
    scenario: { scenarioId: "s", widthM: 10, heightM: 8, dt: 0.1, nSteps: steps },
    provenance: { producer: "omnisim", producerVersion: "0", simulator: "x", crowdModel: "y", build: "b" },
    bodies: { pedestrianRadiusM: 0.2, robotRadiusM: 0.3 },
    treatment: { kind: "robot-presence" },
    runs: [
      { runId: "t", role: "treated", seed: 7, robotPresent: true,
        // atSample is the sample INDEX at which the robot is first recorded at its goal (Task 3's
        // schema.ts). Sample 2, converted to the tick this bench's own ArmResult carries, is
        // arrivedTick = atSample - 1 = 1 — see ruling A on run.ts's ArmResult.arrivedTick comment,
        // which says the recorded sample for an arrival at tick T is T + 1.
        completion: { outcome: "reachedGoal", atSample: 2 },
        robot: { positions: robot }, agents: [
          { id: "p-1", positions: treated[0] }, { id: "p-2", positions: treated[1] }] },
      { runId: "c", role: "control", seed: 7, robotPresent: false, completion: null,
        robot: null, agents: [
          { id: "p-1", positions: control[0] }, { id: "p-2", positions: control[1] }] },
    ],
  });
}

describe("building a paired run from a run set", () => {
  it("produces a pair the contract accepts", () => {
    const built = buildAdapted(parseRunSet(text(0.25)));
    expect(built.run.pair.kind).toBe("pairedRun");
    expect(built.run.pair.nSteps).toBe(4);
    expect(built.run.pair.treated.pedestrians.length).toBe(2);
  });

  it("reads exactly nothing when the two arms are identical", () => {
    const built = buildAdapted(parseRunSet(text(0)));
    expect(paired(built.run.pair).value).toBe(0);
  });

  it("reads something when they are not", () => {
    const built = buildAdapted(parseRunSet(text(0.25)));
    expect(paired(built.run.pair).value).toBeGreaterThan(0);
  });

  it("carries the producer's body sizes, not this bench's", () => {
    const built = buildAdapted(parseRunSet(text(0.25)));
    expect(built.bodies.robotRadiusM).toBe(0.3);
    expect(built.bodies.pedRadiusM).toBe(0.2);
  });

  it("carries the finishing sample as the moment the robot arrived, minus one", () => {
    // Ruling A: atSample is a sample index, not a tick. atSample: 2 above converts to
    // arrivedTick: 1, not 2 — getting this wrong shifts every adapted arrival time by one sample
    // against the simulator's own arrivedTick convention.
    const built = buildAdapted(parseRunSet(text(0.25)));
    expect(built.run.treated.arrivedTick).toBe(1);
  });

  it("says the robot never arrived when the run set does not say it did", () => {
    const built = buildAdapted(parseRunSet(text(0.25)));
    expect(built.run.control.arrivedTick).toBe(-1);
  });

  it("names the producer on the scene, so a results file can say who made it", () => {
    const built = buildAdapted(parseRunSet(text(0.25)));
    expect(built.run.pair.treated.source).toContain("omnisim");
  });

  it("refuses a run set with no treated arm", () => {
    const holder = JSON.parse(text(0.25)) as { runs: { role: string }[] };
    holder.runs[0]!.role = "replicate";
    expect(() => buildAdapted(parseRunSet(JSON.stringify(holder)))).toThrow(/treated/i);
  });

  describe("the fastest-observed-speed bound (ruling B)", () => {
    // Task 1 added `straightLineArrivalS` alongside `straightLineM` in `ReportContext` /
    // `BuildContextInit`. MIRN's own runs divide `straightLineM` by `config.robot.maxSpeed`, a
    // speed limit read off the simulator's own configuration. An adapted run set carries no such
    // configuration, so this derives the bound from the robot's own recorded behaviour instead:
    // the fastest single-step speed the robot was ever seen to move at.

    it("divides straightLineM by the fastest single-step speed the robot was seen to move at", () => {
      const built = buildAdapted(parseRunSet(text(0.25)));
      // The robot walks (1,2) -> (1.4,2) -> (1.8,2) -> (2.2,2) at dt=0.1, i.e. 0.4m per 0.1s
      // every step: a constant 4 m/s. straightLineM is the start-to-end distance, 1.2 m.
      const expectedFastestSpeed = 4;
      const expectedStraightLineM = 1.2;
      expect(built.straightLineM).toBeCloseTo(expectedStraightLineM, 9);
      expect(built.straightLineArrivalS).toBeCloseTo(
        expectedStraightLineM / expectedFastestSpeed,
        9,
      );
    });

    it("reports 0, not NaN or Infinity, when there is no robot at all", () => {
      // `treatment.kind: "robot-presence"` requires the treated arm's `robotPresent` to be true
      // (`makePairedRun` enforces it), so a run set with no robot anywhere has to say its
      // treatment is "none" instead — a run set differing by something other than the robot,
      // where both arms carry no robot at all.
      const holder = JSON.parse(text(0.25)) as {
        treatment: { kind: string };
        runs: { role: string; robot: unknown; robotPresent: boolean }[];
      };
      holder.treatment = { kind: "none" };
      holder.runs[0]!.robot = null;
      holder.runs[0]!.robotPresent = false;
      const built = buildAdapted(parseRunSet(JSON.stringify(holder)));
      expect(built.straightLineM).toBe(0);
      expect(built.straightLineArrivalS).toBe(0);
      expect(Number.isNaN(built.straightLineArrivalS)).toBe(false);
    });

    it("reports 0, not NaN or Infinity, when the robot never moved", () => {
      const holder = JSON.parse(text(0.25)) as {
        runs: { role: string; robot: { positions: number[] } | null }[];
      };
      const stillRobot: number[] = [];
      for (let s = 0; s < 4; s++) {
        stillRobot.push(1, 2);
      }
      holder.runs[0]!.robot = { positions: stillRobot };
      const built = buildAdapted(parseRunSet(JSON.stringify(holder)));
      expect(built.straightLineM).toBe(0);
      expect(built.straightLineArrivalS).toBe(0);
    });
  });

  describe("no error message names a bare code identifier", () => {
    // Guardrail 12, same reasoning as the other adapter tests: this is read by somebody holding a
    // file another team produced, and it must never be handed a wire-level name like
    // `arrivedTick` or `zeroTreated`.

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

    function withRunSet(edit: (holder: Record<string, unknown>) => void): string {
      const holder = JSON.parse(text(0.25)) as Record<string, unknown>;
      edit(holder);
      return JSON.stringify(holder);
    }

    const cases: readonly { readonly name: string; readonly run: () => unknown }[] = [
      {
        name: "no treated arm in the run set",
        run: () => buildAdapted(
          parseRunSet(withRunSet((holder) => {
            (holder["runs"] as { role: string }[])[0]!.role = "replicate";
          })),
        ),
      },
      {
        name: "no control arm in the run set",
        run: () => buildAdapted(
          parseRunSet(withRunSet((holder) => {
            (holder["runs"] as { role: string }[])[1]!.role = "replicate";
          })),
        ),
      },
      {
        name: "two runs both claiming to be the treated arm",
        run: () => buildAdapted(
          parseRunSet(withRunSet((holder) => {
            (holder["runs"] as { role: string }[])[1]!.role = "treated";
          })),
        ),
      },
      {
        name: "only one half of the zero-response reference pair supplied",
        run: () => buildAdapted(
          parseRunSet(withRunSet((holder) => {
            const runs = holder["runs"] as Record<string, unknown>[];
            const zeroTreated = JSON.parse(JSON.stringify(runs[0])) as Record<string, unknown>;
            zeroTreated["runId"] = "zt";
            zeroTreated["role"] = "zeroTreated";
            runs.push(zeroTreated);
          })),
        ),
      },
      {
        name: "the treated arm names somebody the control arm does not",
        run: () => buildAdapted(
          parseRunSet(withRunSet((holder) => {
            const runs = holder["runs"] as { agents: { id: string }[] }[];
            runs[0]!.agents[0]!.id = "somebody-else";
          })),
        ),
      },
    ];

    for (const testCase of cases) {
      it(`for: ${testCase.name}`, () => {
        const message = messageOf(testCase.run);
        expect(CODE_IDENTIFIER.test(message)).toBe(false);
      });
    }
  });
});
