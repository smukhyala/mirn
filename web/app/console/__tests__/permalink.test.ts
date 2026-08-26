import { describe, expect, it } from "vitest";
import { AXES, AXIS_ORDER, type AxisKey } from "../../../engine/job/axes.js";
import { CARD_ORDER } from "../../../engine/job/cards.js";
import { answer, makeDrillState, reveal, type DrillState } from "../drill.js";
import { DEFAULT_SETTINGS, makeConsoleSettings, type ConsoleSettings } from "../state.js";
import {
  AXIS_QUERY_KEY,
  SETTING_QUERY_KEYS,
  decodeDrill,
  decodeSettings,
  encodeDrill,
  encodeSettings,
  settingsNotHonoured,
} from "../permalink.js";

/**
 * Every field here is set away from `DEFAULT_SETTINGS`, on purpose — all thirteen axes included,
 * both forecast axes among them.
 *
 * A round trip compared against the original passes trivially wherever the two happen to agree —
 * if `encode` silently dropped a field, `decode` would fall back to the default, and the
 * assertion for that field would pass whether or not the field was ever written, for any field
 * whose "awkward" value happened to already equal the default. This was checked by deliberately
 * deleting the line in `encodeSettings` that writes `recovery_tol` and watching every test in
 * this file still pass, back when `recoveryToleranceFraction` (and several other fields) sat at
 * exactly their default here. An earlier version of this fixture only moved five of the thirteen
 * axes off default, which a review caught: a swapped `AXIS_QUERY_KEY` mapping between two
 * default-valued axes, or a regression specific to either forecast axis, would have sailed
 * through both the round-trip test and the wire-format test below undetected. Every value below
 * now differs from `DEFAULT_SETTINGS`'s own, so a per-key bug anywhere in the table fails one of
 * the two tests below by name rather than by coincidence.
 */
function awkward(): ConsoleSettings {
  const axisValues = { ...DEFAULT_SETTINGS.axisValues };
  axisValues.pushStrength = 2;
  axisValues.crowdSize = 44;
  axisValues.holdingLine = 1.2;
  axisValues.crowdFidget = 2.2;
  axisValues.walkingPace = 0.9;
  axisValues.robotSpeed = 1.5;
  axisValues.reactionTime = 0.35;
  axisValues.politeness = 3;
  axisValues.perceptionError = 0.4;
  axisValues.passingOffset = 1.5;
  axisValues.episodeSeconds = 60;
  axisValues.forecastHorizon = 1.5;
  axisValues.forecastWindowEnd = 25;
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

  it("gives no axis the same name as a non-axis setting", () => {
    // The two describe blocks above only ever check axis keys against each other. The full
    // namespace a hand-edited link actually shares is all 13 axis keys plus all 11 setting keys —
    // 24 strings that must be pairwise distinct, or an axis and a setting would silently steal
    // each other's value.
    const seen: string[] = [];
    for (const key of AXIS_ORDER) {
      const queryKey = AXIS_QUERY_KEY[key];
      expect(seen).not.toContain(queryKey);
      seen.push(queryKey);
    }
    for (const settingKey of SETTING_QUERY_KEYS) {
      expect(seen).not.toContain(settingKey);
      seen.push(settingKey);
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
    expect(parts).toContain("space=2");
    expect(parts).toContain("people=44");
    expect(parts).toContain("hold_line=1.2");
    expect(parts).toContain("fidget=2.2");
    expect(parts).toContain("pace=0.9");
    expect(parts).toContain("robot_speed=1.5");
    expect(parts).toContain("reaction=0.35");
    expect(parts).toContain("berth=3");
    expect(parts).toContain("mis_sees=0.4");
    expect(parts).toContain("offset=1.5");
    expect(parts).toContain("episode=60");
    expect(parts).toContain("horizon=1.5");
    expect(parts).toContain("window_end=25");
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

describe("what the panel could not carry is said out loud", () => {
  /**
   * The decoder's own notices cover what the LINK got wrong. This covers what the BENCH cannot
   * do with a link that is entirely legal — three settings that are decoded and validated but have
   * no control yet, a crowd count off the picker's fixed list, and a slider snapping to its own
   * notches. Each of those silently changes a number the operator is about to read.
   *
   * It is written as a comparison of two settings objects rather than a list of fields believed to
   * be uncontrolled, so a control added later stops producing its sentence with nothing to
   * remember.
   */
  it("says nothing when the panel took everything", () => {
    expect(settingsNotHonoured(awkward(), awkward())).toEqual([]);
  });

  it("names a setting there is no control for", () => {
    const asked = makeConsoleSettings({ ...DEFAULT_SETTINGS, nearMissThresholdM: 0.3 });
    const lines = settingsNotHonoured(asked, DEFAULT_SETTINGS);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("near-miss");
    expect(lines[0]).toContain("0.3");
    expect(lines[0]).toContain(String(DEFAULT_SETTINGS.nearMissThresholdM));
  });

  it("gives the near-miss line its unit, never a bare number", () => {
    // The near-miss line is a distance. Printing "0.3" with nothing beside it is exactly the
    // failure this project exists to teach against — a raw number never appears alone.
    const asked = makeConsoleSettings({ ...DEFAULT_SETTINGS, nearMissThresholdM: 0.3 });
    const lines = settingsNotHonoured(asked, DEFAULT_SETTINGS);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("0.3 metres");
    expect(lines[0]).toContain(`${String(DEFAULT_SETTINGS.nearMissThresholdM)} metres`);
  });

  it("does not capitalise a standalone label when it lands mid-sentence", () => {
    // `SETTING`'s labels are written for standalone display and open with a capital. Splicing
    // one into "The link asked for ... to be" verbatim capitalises a word mid-sentence.
    const asked = makeConsoleSettings({ ...DEFAULT_SETTINGS, nearMissThresholdM: 0.3 });
    const lines = settingsNotHonoured(asked, DEFAULT_SETTINGS);
    expect(lines[0]).toContain("asked for the near-miss line to be");
    expect(lines[0]).not.toMatch(/asked for The\b/);
  });

  it("reproduces the reviewed regression fixed: unit present, no mid-sentence capital", () => {
    // Verbatim from the finding: `?near_miss=0.3&recovery_tol=0.9&recovery_dwell=999`.
    const decoded = decodeSettings("near_miss=0.3&recovery_tol=0.9&recovery_dwell=999");
    const lines = settingsNotHonoured(decoded.settings, DEFAULT_SETTINGS);
    const nearMissLine = lines.find((line) => line.includes("near-miss"));
    expect(nearMissLine).toBeDefined();
    expect(nearMissLine).toContain("asked for the near-miss line to be 0.3 metres");
    expect(nearMissLine).not.toMatch(/asked for The\b/);
  });

  it("names an axis the slider snapped, by its plain-English name", () => {
    const axisValues = { ...DEFAULT_SETTINGS.axisValues };
    axisValues.crowdSize = 18.5;
    const asked = makeConsoleSettings({ ...DEFAULT_SETTINGS, axisValues });
    const lines = settingsNotHonoured(asked, DEFAULT_SETTINGS);
    expect(lines.length).toBe(1);
    // The label is written for standalone display and is lower-cased at its first letter only
    // when spliced mid-sentence here, same as every other label in this file.
    const midSentenceLabel = AXES.crowdSize.label.charAt(0).toLowerCase() + AXES.crowdSize.label.slice(1);
    expect(lines[0]).toContain(midSentenceLabel);
    expect(lines[0]).toContain("people");
  });

  it("tolerates the last bits of a double, which a slider's own rounding can move", () => {
    const axisValues = { ...DEFAULT_SETTINGS.axisValues };
    const drifted = AXES.holdingLine.defaultValue + Number.EPSILON * 4;
    axisValues.holdingLine = drifted;
    expect(drifted).not.toBe(AXES.holdingLine.defaultValue);
    const asked = makeConsoleSettings({ ...DEFAULT_SETTINGS, axisValues });
    expect(settingsNotHonoured(asked, DEFAULT_SETTINGS)).toEqual([]);
  });

  it("names a crowd count the picker had to snap", () => {
    const asked = makeConsoleSettings({ ...DEFAULT_SETTINGS, seedCount: 3 });
    const applied = makeConsoleSettings({ ...DEFAULT_SETTINGS, seedCount: 4 });
    const lines = settingsNotHonoured(asked, applied);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("3");
    expect(lines[0]).toContain("4");
  });

  it("names a sweep the panel could not reproduce", () => {
    const asked = makeConsoleSettings({
      ...DEFAULT_SETTINGS,
      sweepAxis: "crowdSize",
      sweepValues: [4, 18, 44],
    });
    const applied = makeConsoleSettings({
      ...DEFAULT_SETTINGS,
      sweepAxis: "crowdSize",
      sweepValues: [4, 18],
    });
    const lines = settingsNotHonoured(asked, applied);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain(String(44));
  });

  it("names every toggle that ended up the other way", () => {
    const asked = makeConsoleSettings({
      ...DEFAULT_SETTINGS,
      withFloor: true,
      withFrechet: true,
      withZeroReference: false,
      pedestriansSeeRobot: false,
    });
    const lines = settingsNotHonoured(asked, DEFAULT_SETTINGS);
    expect(lines.length).toBe(4);
    for (const line of lines) {
      expect(line).toMatch(/\bon\b|\boff\b/);
    }
  });

  it("writes every one of them in plain English", () => {
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    const lines = settingsNotHonoured(awkward(), DEFAULT_SETTINGS);
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) {
      expect(identifier.test(line), `"${line}" carries a code identifier`).toBe(false);
    }
  });
});

/**
 * The drill has no axes and no settings, so its own permalink has exactly one thing to carry: which
 * cards were called, in order. Everything else `DrillCallRecord` holds — the call, the honest
 * answer, whether the two agreed — is a result, and guardrail 10 says a link carries the recipe and
 * never the results, for the same reason the console's own link does: a link asserting a score
 * would quote an old answer with the new page's authority.
 */
describe("the drill's own link", () => {
  function stateAfterAnswers(n: number): DrillState {
    let state = makeDrillState();
    for (let i = 0; i < n; i++) {
      state = answer(state, "bigger", "smaller");
      state = reveal(state);
    }
    return state;
  }

  it("carries the cards and never the calls or the answers", () => {
    const link = encodeDrill(stateAfterAnswers(CARD_ORDER.length));
    expect(link).toContain("cards=");
    expect(link).not.toMatch(/wrong|right|score|calls?=/);
    for (const n of ["0.", "1.", "2."]) {
      expect(link, "a permalink may not carry a measured value").not.toContain(n);
    }
  });

  it("refuses a card key that is not in the catalogue", () => {
    const decoded = decodeDrill("?cards=not-a-real-card");
    expect(decoded.notices.length).toBeGreaterThan(0);
    expect(decoded.cards).toHaveLength(0);
  });

  it("round-trips the cards actually called, in order", () => {
    const state = stateAfterAnswers(3);
    const decoded = decodeDrill(encodeDrill(state));
    expect(decoded.notices).toEqual([]);
    expect(decoded.cards).toEqual(CARD_ORDER.slice(0, 3));
  });

  it("carries every one of the eight once the drill is complete", () => {
    const decoded = decodeDrill(encodeDrill(stateAfterAnswers(CARD_ORDER.length)));
    expect(decoded.notices).toEqual([]);
    expect(decoded.cards).toEqual(CARD_ORDER);
  });

  it("carries nothing before any card has been called", () => {
    const link = encodeDrill(makeDrillState());
    expect(decodeDrill(link).cards).toEqual([]);
  });

  it("drops an unknown card but keeps the ones it does recognise", () => {
    const decoded = decodeDrill(`cards=${CARD_ORDER[0]},not-a-real-card,${CARD_ORDER[1]}`);
    expect(decoded.cards).toEqual([CARD_ORDER[0], CARD_ORDER[1]]);
    expect(decoded.notices.length).toBe(1);
  });

  it("reports a repeated unknown key only once", () => {
    const decoded = decodeDrill("cards=unicorn,unicorn,unicorn");
    expect(decoded.notices.length).toBe(1);
  });

  it("tolerates a leading question mark", () => {
    const decoded = decodeDrill(`?cards=${CARD_ORDER[0]}`);
    expect(decoded.cards).toEqual([CARD_ORDER[0]]);
  });

  it("never throws, whatever is in it", () => {
    const hostile: readonly string[] = ["", "?", "cards", "cards=", "cards=,,,", "cards=%00", "unrelated=1"];
    for (const query of hostile) {
      const result = decodeDrill(query);
      expect(result.kind).toBe("drillLinkResult");
    }
  });

  it("writes its notices in plain English", () => {
    const identifier = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;
    const decoded = decodeDrill("cards=not-a-real-card");
    for (const notice of decoded.notices) {
      expect(identifier.test(notice), `"${notice}" carries a code identifier`).toBe(false);
    }
  });
});
