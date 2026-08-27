import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import { ContractError } from "../../core/errors.js";
import { runPair, type RunResult } from "../../sim/run.js";
import { makeFamilyProbeSettings } from "../familyProbe.js";
import type { SuppliedRun } from "../supplied.js";
import {
  aggregateSuppliedProbe,
  probeSuppliedSeed,
  readSupplied,
  type SuppliedProbeSeed,
} from "../suppliedProbe.js";

/**
 * The property this file exists for: a supplied method never sees the run without the robot.
 *
 * It is proved the way `unpaired.test.ts` proves `corridorReadable` — swap the comparison arm for a
 * decoy from an unrelated room and fail anything that notices. A method that could see the
 * comparison arm could subtract it and return the exact truth, and every number this bench then
 * reported about that method would describe our harness rather than their ruler.
 */

const SETTINGS = makeFamilyProbeSettings({ bandReplicates: 2, seeds: [20260816] });

/** A small, honest metric: how far the robot travelled. Corridor-readable, deterministic. */
function robotPathLength(run: SuppliedRun): number {
  const robot = run.robot;
  if (robot === null) {
    return 0;
  }
  let total = 0;
  for (let step = 1; step < robot.nSteps; step++) {
    const dx = (robot.positions[step * 2] as number) - (robot.positions[step * 2 - 2] as number);
    const dy = (robot.positions[step * 2 + 1] as number) - (robot.positions[step * 2 - 1] as number);
    total = total + Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

/**
 * A pair whose comparison arm belongs to a different room entirely.
 *
 * Both views of the arm are swapped, not one. `RunResult.control` is what the cost and safety
 * readouts read directly and `RunResult.pair.control` is the validated scene everything built on
 * paired agents reads, so swapping one would leave half the pipeline looking at the real comparison
 * run — which is not an honest unpairing. `familyProbe.ts` builds the same thing for the same
 * reason, and it is assembled as a literal because `makePairedRun` would correctly reject it.
 */
function withStrangerControl(real: RunResult, decoy: RunResult): RunResult {
  return {
    ...real,
    control: decoy.control,
    pair: { ...real.pair, control: decoy.pair.control },
  };
}

describe("a supplied method cannot see the run without the robot", () => {
  it("reads the same on a pair whose comparison arm is a stranger's", () => {
    const real = runPair(makeRunConfig({ seed: 20260816 }));
    const decoy = runPair(makeRunConfig({ seed: 20260816 + 7919 }));

    const honest = readSupplied(robotPathLength, real);
    const swapped = readSupplied(robotPathLength, withStrangerControl(real, decoy));

    expect(honest.kind).toBe("read");
    expect(swapped).toEqual(honest);
  });

  it("would notice a method that did see it, so the check above is capable of failing", () => {
    // The test that tests the test. A harness that leaked the comparison arm would let a method
    // read it, and this proves the assertion above would catch exactly that — by handing the
    // pipeline a "method" that reaches for the arm through the RunResult it is closed over.
    const real = runPair(makeRunConfig({ seed: 20260816 }));
    const decoy = runPair(makeRunConfig({ seed: 20260816 + 7919 }));

    const leaky = (pair: RunResult): number => {
      const arm = pair.control.positions[0];
      return arm === undefined ? 0 : (arm[0] as number);
    };

    expect(leaky(real)).not.toBe(leaky(withStrangerControl(real, decoy)));
  });

  it("hands the method no comparison arm anywhere in what it receives", () => {
    const real = runPair(makeRunConfig({ seed: 20260816 }));
    let seen: SuppliedRun | null = null;
    readSupplied((run: SuppliedRun): number => {
      seen = run;
      return 0;
    }, real);

    const flat = JSON.stringify(seen, (_key: string, value: unknown): unknown =>
      value instanceof Float64Array ? "…" : value,
    );
    expect(flat).not.toContain("control");
    expect(flat).not.toContain("scene");
    expect(flat).not.toContain("agentId");
  });
});

describe("the method is asked the same question twice", () => {
  it("is handed a fresh copy each time, so mutating the input is not read as inconsistency", () => {
    // A method that writes into what it was handed would otherwise be asked a DIFFERENT question
    // the second time and be reported nondeterministic, when what it actually did was mutate.
    const real = runPair(makeRunConfig({ seed: 20260816 }));
    const mutating = (run: SuppliedRun): number => {
      const first = run.people[0];
      if (first !== undefined) {
        first.positions[0] = 999;
      }
      return first === undefined ? 0 : (first.positions[1] as number);
    };
    expect(readSupplied(mutating, real).kind).toBe("read");
  });

  it("reports a method that answers differently as inconsistent, not as a reading", () => {
    const real = runPair(makeRunConfig({ seed: 20260816 }));
    let call = 0;
    const drifting = (): number => {
      call = call + 1;
      return call;
    };
    const outcome = readSupplied(drifting, real);
    expect(outcome.kind).toBe("nondeterministic");
  });

  it("reports a method that throws in the method's own words", () => {
    const real = runPair(makeRunConfig({ seed: 20260816 }));
    const angry = (): number => {
      throw new Error("the horizon was longer than the episode");
    };
    const outcome = readSupplied(angry, real);
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.message).toBe("the horizon was longer than the episode");
    }
  });
});

describe("a room, and the counting over rooms", () => {
  it("runs a zero-effect room whose truth is exactly nothing", () => {
    const seed = probeSuppliedSeed(robotPathLength, SETTINGS, 20260816);
    expect(seed.truthM).toBe(0);
    expect(seed.truthUnderBand).toBe(true);
    expect(seed.bandM).toBeGreaterThan(0);
    expect(seed.outcome.kind).toBe("read");
  }, 60000);

  it("counts a failed room and an inconsistent one apart from a read one", () => {
    const base: SuppliedProbeSeed = probeSuppliedSeed(robotPathLength, SETTINGS, 20260816);
    const failed: SuppliedProbeSeed = Object.freeze({
      ...base,
      outcome: { kind: "failed" as const, message: "it stopped" },
      clearedBand: false,
    });
    const drifting: SuppliedProbeSeed = Object.freeze({
      ...base,
      outcome: { kind: "nondeterministic" as const, firstM: 1, secondM: 2 },
      clearedBand: false,
    });

    const probe = aggregateSuppliedProbe([base, failed, drifting]);
    expect(probe.nAttempted).toBe(3);
    expect(probe.nUsed).toBe(1);
    expect(probe.nFailed).toBe(1);
    expect(probe.nNondeterministic).toBe(1);
    expect(probe.nTruthsExactlyZero).toBe(3);
  }, 60000);

  it("refuses to aggregate no rooms at all, rather than reporting an average of nothing", () => {
    expect(() => aggregateSuppliedProbe([])).toThrow(ContractError);
  });
});
