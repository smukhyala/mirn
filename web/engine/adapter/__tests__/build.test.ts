import { describe, expect, it } from "vitest";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";
import { pedestrianById } from "../../contracts/scene.js";
import { paired } from "../../measure/estimator/index.js";
import { COLUMNS } from "../../job/columns.js";
import { buildContext, type MeasurementParams, type ReportContext } from "../../job/report.js";
import { buildAdapted } from "../build.js";
import { EXTERNAL_CROWD_DISCLOSURE } from "../disclosure.js";
import { identityFor } from "../identity.js";
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

  describe("uid ordering survives the two arms listing their people in different orders", () => {
    // `pathsInUidOrder` joins each arm's agents by external id, never by list position — that is
    // the entire point of `IdentityMap`. A fixture where both arms write "p-1, p-2" in the same
    // order (as `text()` above does) cannot catch a regression to positional joining, because
    // insertion order, sorted-string order and uid order all coincide there: it would pass against
    // a correct implementation and a badly broken one alike. This is the bug `perAgentDeviationByUid`
    // in `web/engine/job/report.ts` warns about by name, and it has shipped once already.
    //
    // These three ids are chosen so sorted-string order (alpha, bravo, charlie) differs from the
    // order every list below writes them in, and the treated and control arms list them in
    // different orders from each other.

    const steps = 3;
    const dt = 0.1;
    const people = [
      { id: "charlie", nudgeM: 0.1, baseY: 1 },
      { id: "alpha", nudgeM: 0.3, baseY: 3 },
      { id: "bravo", nudgeM: 0.5, baseY: 5 },
    ] as const;

    function pathFor(person: (typeof people)[number], isTreated: boolean): number[] {
      const values: number[] = [];
      for (let s = 0; s < steps; s++) {
        const y = isTreated && s > 0 ? person.baseY + person.nudgeM : person.baseY;
        values.push(s * 0.5, y);
      }
      return values;
    }

    function runSetText(treatedOrder: readonly string[], controlOrder: readonly string[]): string {
      const byId = new Map<string, (typeof people)[number]>(
        people.map((person) => [person.id, person]),
      );
      const treatedAgents = treatedOrder.map((id) => ({
        id,
        positions: pathFor(byId.get(id)!, true),
      }));
      const controlAgents = controlOrder.map((id) => ({
        id,
        positions: pathFor(byId.get(id)!, false),
      }));
      return JSON.stringify({
        mirnTrajectoryFormat: 1,
        scenario: { scenarioId: "s", widthM: 10, heightM: 8, dt, nSteps: steps },
        provenance: {
          producer: "omnisim", producerVersion: "0", simulator: "x", crowdModel: "y", build: "b",
        },
        bodies: { pedestrianRadiusM: 0.2, robotRadiusM: 0.3 },
        treatment: { kind: "none" },
        runs: [
          { runId: "t", role: "treated", seed: 7, robotPresent: false, completion: null,
            robot: null, agents: treatedAgents },
          { runId: "c", role: "control", seed: 7, robotPresent: false, completion: null,
            robot: null, agents: controlAgents },
        ],
      });
    }

    it("gives the same reading whichever order each arm lists its people in", () => {
      const inOrder = buildAdapted(
        parseRunSet(runSetText(["charlie", "alpha", "bravo"], ["charlie", "alpha", "bravo"])),
      );
      const reordered = buildAdapted(
        parseRunSet(runSetText(["charlie", "alpha", "bravo"], ["bravo", "alpha", "charlie"])),
      );
      // Every value that goes into this reading is identical between the two files; only the
      // ORDER each arm's agent list is written in differs. A positional join would pair the
      // wrong nudges to the wrong people in the reordered file and read a different number.
      expect(paired(reordered.run.pair).value).toBe(paired(inOrder.run.pair).value);
    });

    it("keeps each person's own path with them, not the slot they were listed in", () => {
      const reordered = buildAdapted(
        parseRunSet(runSetText(["charlie", "alpha", "bravo"], ["bravo", "alpha", "charlie"])),
      );
      const identity = identityFor(["charlie", "alpha", "bravo"]);
      for (const person of people) {
        const trajectory = pedestrianById(reordered.run.pair.treated, identity.agentIdOf(person.id));
        const lastY = trajectory.positions[trajectory.positions.length - 1];
        // `toBe`, never `toBeCloseTo`: every value here is written into the document by
        // `JSON.stringify` and read back by `JSON.parse`, both of which round-trip a double
        // exactly, and nothing between them does arithmetic on it. So the exactness is
        // available, and this project's rule is that where it is available, inexactness means
        // something drifted and the assertion should say so rather than tolerate it.
        expect(lastY).toBe(person.baseY + person.nudgeM);
      }
    });
  });

  describe("the optional zero-response reference pair and replicate runs", () => {
    it("builds a usable zeroRun that reads exactly nothing when both halves are supplied", () => {
      const holder = JSON.parse(text(0.25)) as Record<string, unknown>;
      const runs = holder["runs"] as Record<string, unknown>[];
      // The zero pair has to actually be a pair in which nobody responds — reusing the main
      // (nudged) treated/control arms here would build a "zero" pair that is not zero. `text(0)`
      // is the fixture already used above for exactly that: identical arms, sharing the same
      // agent ids ("p-1", "p-2") as the main pair, so the one identity map built from the main
      // treated run's ids still applies to it.
      const zeroRuns = (JSON.parse(text(0)) as { runs: Record<string, unknown>[] }).runs;
      const zeroTreated = zeroRuns[0]!;
      zeroTreated["runId"] = "zt";
      zeroTreated["role"] = "zeroTreated";
      const zeroControl = zeroRuns[1]!;
      zeroControl["runId"] = "zc";
      zeroControl["role"] = "zeroControl";
      runs.push(zeroTreated, zeroControl);

      const built = buildAdapted(parseRunSet(JSON.stringify(holder)));
      expect(built.zeroRun).not.toBeNull();
      const zeroRun = built.zeroRun!;
      expect(zeroRun.pair.kind).toBe("pairedRun");
      expect(zeroRun.pair.treated.pedestrians.length).toBe(2);
      expect(paired(zeroRun.pair).value).toBe(0);
      // And the main run is untouched by the zero pair being present: it still reads the real
      // 0.25 m nudge, not the zero one.
      expect(paired(built.run.pair).value).toBeGreaterThan(0);
    });

    it("populates replicates with one entry per replicate run, each holding every person's path", () => {
      const holder = JSON.parse(text(0.25)) as Record<string, unknown>;
      const runs = holder["runs"] as Record<string, unknown>[];
      const replicateA = JSON.parse(JSON.stringify(runs[1])) as Record<string, unknown>;
      replicateA["runId"] = "r-a";
      replicateA["role"] = "replicate";
      const replicateB = JSON.parse(JSON.stringify(runs[1])) as Record<string, unknown>;
      replicateB["runId"] = "r-b";
      replicateB["role"] = "replicate";
      runs.push(replicateA, replicateB);

      const built = buildAdapted(parseRunSet(JSON.stringify(holder)));
      expect(built.replicates.length).toBe(2);
      for (const replicate of built.replicates) {
        expect(replicate.length).toBe(2);
      }
    });

    it("carries no replicates when the run set names none", () => {
      const built = buildAdapted(parseRunSet(text(0.25)));
      expect(built.replicates.length).toBe(0);
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
        // This is the exact leak the review caught: `only()` used to interpolate the raw wire
        // role ("zeroTreated") straight into its duplicate-run message, and the earlier version
        // of this describe block only ever duplicated "treated" — lower-case, so it slipped past
        // CODE_IDENTIFIER trivially and hid the bug. `zeroTreated` is camelCase and would have
        // caught it immediately.
        name: "two runs both claiming to be the zero-response treated arm",
        run: () => buildAdapted(
          parseRunSet(withRunSet((holder) => {
            const runs = holder["runs"] as Record<string, unknown>[];
            const zeroTreatedA = JSON.parse(JSON.stringify(runs[0])) as Record<string, unknown>;
            zeroTreatedA["runId"] = "zt-a";
            zeroTreatedA["role"] = "zeroTreated";
            const zeroTreatedB = JSON.parse(JSON.stringify(runs[0])) as Record<string, unknown>;
            zeroTreatedB["runId"] = "zt-b";
            zeroTreatedB["role"] = "zeroTreated";
            runs.push(zeroTreatedA, zeroTreatedB);
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

/**
 * The finding this whole field was added for, tested where it would actually have bitten.
 *
 * `endToEnd.slow.test.ts` already asserts that "how far the robot pushed the crowd" and "worst
 * moment" come back MEASURED on an adapted run set, which means the tile beneath them renders, which
 * means `pairedAssumption` runs on adapted data. Before this change it rendered the sentence that
 * says the two runs "share a seed, a starting state and the same random wobble" and that "nothing
 * else can differ" — a claim `EXTERNAL_CROWD_DISCLOSURE` refuses in as many words, and one this
 * bench has no way to check for a pair it did not build.
 *
 * These go through the real adapter rather than a hand-set flag, because the failure being guarded
 * against is a wiring one: a correct sentence that an adapted run never reaches is no fix at all.
 * The branch itself, on all three treatment kinds, is covered in `web/engine/job/__tests__/
 * columns.test.ts`; what this file proves is that a file read off disc arrives at it.
 */
describe("a pairing this bench was handed rather than built", () => {
  const PARAMS: MeasurementParams = Object.freeze({
    kind: "measurementParams" as const,
    forecastHorizonSteps: 1,
    forecastEndStep: 2,
    nearMissThresholdM: 0.5,
    recoveryToleranceFraction: 0.25,
    recoveryDwellSteps: 1,
  });

  function adaptedContext(): ReportContext {
    const built = buildAdapted(parseRunSet(text(0.25)));
    return buildContext({
      dt: built.dt,
      pairingOrigin: built.pairingOrigin,
      bodies: built.bodies,
      straightLineM: built.straightLineM,
      straightLineArrivalS: built.straightLineArrivalS,
      params: PARAMS,
      run: built.run,
      band: null,
      floor: null,
      zeroRun: built.zeroRun,
      frechetMeanM: null,
    });
  }

  it("says so on the record it hands back, so a caller cannot forget to", () => {
    // Carried on `AdaptedRunSet` rather than typed as a literal at each call site. A run this bench
    // produced gets its origin from `contextInitFromConfig`, which every simulator caller already
    // spreads; an adapted run builds its init field by field, and a literal typed field by field is
    // a literal somebody eventually types wrongly.
    expect(buildAdapted(parseRunSet(text(0.25))).pairingOrigin).toBe("asserted");
  });

  it("never tells a reader the two runs shared their randomness", () => {
    const context = adaptedContext();
    for (const key of ["trueEffectM", "worstMomentM"] as const) {
      const assumption = COLUMNS[key].assumption(context);
      expect(assumption).not.toContain("share a seed");
      expect(assumption).not.toContain("the same random wobble");
      expect(assumption).not.toContain("nothing else can differ");
    }
  });

  it("tells them whose claim it is instead, in the disclosure's own words", () => {
    // Checked clause by clause against `EXTERNAL_CROWD_DISCLOSURE` rather than as one string: a
    // reader can meet both on the same screen, and the failure worth catching is the two of them
    // drifting into saying different things about what was checked.
    const assumption = COLUMNS.trueEffectM.assumption(adaptedContext());
    expect(assumption).toContain("name the same people, share a clock and a length");
    expect(EXTERNAL_CROWD_DISCLOSURE).toContain("name the same people, share a clock and a length");
    expect(assumption).toContain("the file's claim, not a finding of this bench's");
    expect(EXTERNAL_CROWD_DISCLOSURE).toContain("is the file's claim, not a finding of this bench's");
    expect(assumption).toContain("share the same underlying randomness");
    expect(EXTERNAL_CROWD_DISCLOSURE).toContain("shared the same underlying randomness");
  });

  it("writes it in English, not in code, and puts no figure in it", () => {
    const context = adaptedContext();
    for (const key of ["trueEffectM", "worstMomentM"] as const) {
      const assumption = COLUMNS[key].assumption(context);
      expect(assumption).not.toMatch(CODE_IDENTIFIER);
      expect(assumption).not.toMatch(/[0-9]/);
    }
  });
});
