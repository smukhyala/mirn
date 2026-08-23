import { describe, expect, it } from "vitest";
import { AXES, AXIS_ORDER, type AxisKey } from "../../../engine/job/axes.js";
import { DEFAULT_SETTINGS, makeConsoleSettings, type ConsoleSettings } from "../state.js";
import { AXIS_QUERY_KEY, decodeSettings, encodeSettings } from "../permalink.js";

/**
 * Every field here is set away from `DEFAULT_SETTINGS`, on purpose.
 *
 * A round trip compared against the original passes trivially wherever the two happen to agree —
 * if `encode` silently dropped a field, `decode` would fall back to the default, and the
 * assertion for that field would pass whether or not the field was ever written, for any field
 * whose "awkward" value happened to already equal the default. `recoveryToleranceFraction`,
 * `recoveryDwellSteps`, `bandReplicates`, `withFrechet`, `withZeroReference`, and four of the
 * axis values used to sit at exactly their default here, which was checked by deliberately
 * deleting the line in `encodeSettings` that writes `recovery_tol` and watching every test in
 * this file still pass. Every value below now differs from `DEFAULT_SETTINGS`'s own, so the same
 * deletion fails the round-trip test instead.
 */
function awkward(): ConsoleSettings {
  const axisValues = { ...DEFAULT_SETTINGS.axisValues };
  axisValues.crowdSize = 44;
  axisValues.robotSpeed = 1.5;
  axisValues.reactionTime = 0.35;
  axisValues.crowdFidget = 2.2;
  axisValues.walkingPace = 0.9;
  return makeConsoleSettings({
    ...DEFAULT_SETTINGS,
    axisValues,
    pedestriansSeeRobot: false,
    nearMissThresholdM: 0.3,
    recoveryToleranceFraction: 0.25,
    recoveryDwellSteps: 45,
    sweepAxis: "crowdSize",
    sweepValues: [4, 8, 12, 18, 24, 32, 44],
    seedCount: 8,
    bandReplicates: 12,
    withFloor: true,
    withFrechet: true,
    withZeroReference: false,
  });
}

describe("the permalink key table", () => {
  it("names every axis", () => {
    for (const key of AXIS_ORDER) {
      const queryKey = AXIS_QUERY_KEY[key];
      expect(queryKey.length).toBeGreaterThan(0);
    }
  });

  it("gives no two axes the same name", () => {
    const seen: string[] = [];
    for (const key of AXIS_ORDER) {
      const queryKey = AXIS_QUERY_KEY[key];
      expect(seen).not.toContain(queryKey);
      seen.push(queryKey);
    }
  });
});

describe("encoding and decoding", () => {
  it("round-trips every setting, byte for byte", () => {
    const original = awkward();
    const decoded = decodeSettings(encodeSettings(original));

    expect(decoded.notices).toEqual([]);
    for (const key of AXIS_ORDER) {
      expect(decoded.settings.axisValues[key]).toBe(original.axisValues[key]);
    }
    expect(decoded.settings.pedestriansSeeRobot).toBe(original.pedestriansSeeRobot);
    expect(decoded.settings.nearMissThresholdM).toBe(original.nearMissThresholdM);
    expect(decoded.settings.recoveryToleranceFraction).toBe(original.recoveryToleranceFraction);
    expect(decoded.settings.recoveryDwellSteps).toBe(original.recoveryDwellSteps);
    expect(decoded.settings.sweepAxis).toBe(original.sweepAxis);
    expect(decoded.settings.sweepValues).toEqual(original.sweepValues);
    expect(decoded.settings.seedCount).toBe(original.seedCount);
    expect(decoded.settings.bandReplicates).toBe(original.bandReplicates);
    expect(decoded.settings.withFloor).toBe(original.withFloor);
    expect(decoded.settings.withFrechet).toBe(original.withFrechet);
    expect(decoded.settings.withZeroReference).toBe(original.withZeroReference);
  });

  it("writes the exact key=value pairs the wire format promises", () => {
    // The round-trip test above can only notice a field that was dropped if the original's
    // value differs from the default it would silently fall back to. This test does not rely on
    // that: it reads the encoded string itself, so a dropped field, a renamed key, or a
    // differently-formatted number fails here even when a coincidence would hide it above.
    const query = encodeSettings(awkward());
    const parts = query.split("&");
    expect(parts).toContain("people=44");
    expect(parts).toContain("robot_speed=1.5");
    expect(parts).toContain("reaction=0.35");
    expect(parts).toContain("fidget=2.2");
    expect(parts).toContain("pace=0.9");
    expect(parts).toContain("notice=0");
    expect(parts).toContain("near_miss=0.3");
    expect(parts).toContain("recovery_tol=0.25");
    expect(parts).toContain("recovery_dwell=45");
    expect(parts).toContain("vary=people");
    expect(parts).toContain("values=4,8,12,18,24,32,44");
    expect(parts).toContain("seeds=8");
    expect(parts).toContain("band=12");
    expect(parts).toContain("floor=1");
    expect(parts).toContain("frechet=1");
    expect(parts).toContain("zero=0");
  });

  it("encodes the same settings to the same string every time", () => {
    const original = awkward();
    expect(encodeSettings(original)).toBe(encodeSettings(original));
  });

  it("tolerates a leading question mark", () => {
    const query = encodeSettings(awkward());
    expect(decodeSettings(`?${query}`).settings.seedCount).toBe(8);
  });

  it("carries no result, only the recipe", () => {
    const query = encodeSettings(awkward());
    expect(query).not.toMatch(/effect|forecast_value|band_value|true_/);
  });
});

describe("a hand-edited link", () => {
  it("ignores a key this bench does not have, and says so", () => {
    const result = decodeSettings("people=18&unicorns=7");
    expect(result.settings.axisValues.crowdSize).toBe(18);
    expect(result.notices.length).toBe(1);
    expect(result.notices[0]).toContain("unicorns");
  });

  it("brings an out-of-range value back into range, and says so", () => {
    const high = String(AXES.crowdSize.max + 1000);
    const result = decodeSettings(`people=${high}`);
    expect(result.settings.axisValues.crowdSize).toBe(AXES.crowdSize.max);
    expect(result.notices.length).toBe(1);
    expect(result.notices[0]).toContain(AXES.crowdSize.label);
  });

  it("brings a low value up, and says so", () => {
    const low = String(AXES.crowdSize.min - 1000);
    const result = decodeSettings(`people=${low}`);
    expect(result.settings.axisValues.crowdSize).toBe(AXES.crowdSize.min);
    expect(result.notices.length).toBe(1);
  });

  it("never throws, whatever is in it", () => {
    const hostile: readonly string[] = [
      "",
      "?",
      "people",
      "people=",
      "people=abc",
      "people=NaN",
      "people=Infinity",
      "vary=unicorns&values=1,2,3",
      "vary=people&values=",
      "vary=people&values=abc,def",
      "vary=people&values=999999,999999",
      "seeds=0",
      "seeds=-4",
      "seeds=99999",
      "band=1",
      "band=-3",
      "near_miss=0",
      "near_miss=-1",
      "recovery_dwell=0",
      "notice=maybe",
      "floor=yes",
      "zero=2",
      "people=18&people=44",
    ];
    for (const query of hostile) {
      const result = decodeSettings(query);
      expect(result.kind).toBe("decodeResult");
      expect(result.settings.kind).toBe("consoleSettings");
    }
  });

  it("drops a sweep whose values all fell outside the range", () => {
    const beyond = String(AXES.crowdSize.max + 5000);
    const result = decodeSettings(`vary=people&values=${beyond},${beyond}`);
    // Clamping collapsed both to the same number, which is not a curve.
    expect(result.settings.sweepValues.length).toBeLessThanOrEqual(1);
    expect(result.notices.length).toBeGreaterThan(0);
  });

  it("writes its notices in plain English", () => {
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    const result = decodeSettings(
      `people=${String(AXES.crowdSize.max + 10)}&seeds=99999&band=1&notice=maybe`,
    );
    expect(result.notices.length).toBeGreaterThan(0);
    for (const notice of result.notices) {
      expect(identifier.test(notice), `"${notice}" carries a code identifier`).toBe(false);
    }
  });
});
