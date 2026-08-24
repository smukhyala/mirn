import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import { pairedAgents } from "../../contracts/pairedRun.js";
import { deviation } from "../../measure/metrics.js";
import { runPair } from "../../sim/run.js";
import { perAgentDeviationByUid, pedestrianTimeLost } from "../report.js";

/**
 * Fourteen pedestrians, not eight, and both directions pinned.
 *
 * `deviation().perAgentM` is ordered by string-sorted agent id: ped0, ped1, ped10, ped11, ped12,
 * ped13, ped2, ... `ArmResult.positions` is ordered by uid: 0, 1, 2, ... The two agree up to ten
 * pedestrians and diverge from eleven, so a crowd of eight cannot tell a correct join from a
 * scrambled one, and a test that only asserted the correct value would stay green after someone
 * reverted the fix.
 *
 * So this asserts the right answer AND the wrong one: `byUid.get(2)` is ped2's displacement, and
 * `perAgentM[2]` is ped10's. If those two ever become the same number this crowd is too small
 * and the test has stopped testing anything.
 */
describe("per-agent values are keyed by uid", () => {
  const config = makeRunConfig({ crowd: { nPedestrians: 14 } });
  const result = runPair(config);
  const dev = deviation(result.pair);
  const agents = pairedAgents(result.pair);

  it("orders pairedAgents by string-sorted id, which is not uid order", () => {
    const ids: string[] = [];
    for (const entry of agents) {
      ids.push(entry[0].agentId);
    }
    expect(ids.slice(0, 7)).toEqual(["ped0", "ped1", "ped10", "ped11", "ped12", "ped13", "ped2"]);
  });

  it("maps uid 2 to ped2's displacement", () => {
    const byUid = perAgentDeviationByUid(result.pair, dev);
    expect(byUid.get(2)).toBe(0.010656577085919248);
  });

  it("still has ped10's displacement sitting at index 2 of the raw array", () => {
    expect(dev.perAgentM[2]).toBe(0.12794199862109434);
    expect(agents[2]?.[0].agentId).toBe("ped10");
  });

  it("covers every uid exactly once", () => {
    const byUid = perAgentDeviationByUid(result.pair, dev);
    expect(byUid.size).toBe(14);
    for (let uid = 0; uid < 14; uid++) {
      expect(byUid.has(uid)).toBe(true);
    }
  });

  it("refuses a deviation whose length does not match the pair", () => {
    const shortened = { ...dev, perAgentM: new Float64Array(3) };
    expect(() => perAgentDeviationByUid(result.pair, shortened)).toThrow(
      /perAgentDeviationByUid was given 3 per-agent values for 14 paired agents/,
    );
  });
});

describe("pedestrianTimeLost", () => {
  it("differences each person against themselves and reports how many settled", () => {
    const config = makeRunConfig();
    const lost = pedestrianTimeLost(runPair(config), config.dt);
    expect(lost.nAgents).toBe(18);
    expect(lost.nUsed).toBe(18);
    expect(lost.meanS).toBe(-0.08333333333333333);
  });

  /**
   * The survivor-drop branch, closed.
   *
   * At the default 800 ticks (40 s) every one of the 18 pedestrians reaches their goal in both
   * arms, so the test above never exercises the `treatedSettled < 0 || controlSettled < 0` half
   * of the join -- the one that drops a person instead of averaging them in as a zero. A shorter
   * episode is a legal `RunConfig` (nTicks has no floor beyond >= 1) and does not contort the
   * scenario: it is the same crowd, cut off before everyone arrives. At 300 ticks (15 s) only 6
   * of the 18 have settled in both arms; the other 12 are dropped rather than counted as 0 s lost,
   * which is the whole point of carrying nUsed separately from nAgents.
   */
  it("drops a person who has not settled in both arms instead of averaging them in as zero", () => {
    const config = makeRunConfig({ nTicks: 300 });
    const lost = pedestrianTimeLost(runPair(config), config.dt);
    expect(lost.nAgents).toBe(18);
    expect(lost.nUsed).toBe(6);
    expect(lost.nUsed).toBeLessThan(lost.nAgents);
    expect(lost.meanS).toBe(0.19166666666666668);
  });
});
