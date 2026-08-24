import { describe, expect, it } from "vitest";
import { ContractError } from "../core/errors.js";
import { makeRunConfig } from "./config.js";

/**
 * The five checks this file pins were all missing, and the one that mattered was the room.
 *
 * With `widthM` narrowed below 20 the default goal at x = 20 sits outside the wall. The robot is
 * clamped to the room, so it pins against the wall a metre short of a goal it can never reach,
 * never records an arrival, and the old path-freeze arrival heuristic then reported a completed
 * journey anyway. A config that cannot be simulated honestly must not be constructible.
 */
describe("makeRunConfig room and rate validation", () => {
  it("still builds the default config", () => {
    const config = makeRunConfig();
    expect(config.widthM).toBe(22);
    expect(config.heightM).toBe(13);
    expect(config.robot.goalXY[0]).toBe(20);
  });

  it("rejects a room with no width", () => {
    expect(() => makeRunConfig({ widthM: 0 })).toThrow(ContractError);
    expect(() => makeRunConfig({ widthM: 0 })).toThrow(/RunConfig\.widthM must be > 0, got 0/);
  });

  it("rejects a room with no height", () => {
    expect(() => makeRunConfig({ heightM: -1 })).toThrow(/RunConfig\.heightM must be > 0, got -1/);
  });

  it("rejects a crowd that wants to stand still", () => {
    expect(() => makeRunConfig({ crowd: { desiredSpeed: 0 } })).toThrow(
      /RunConfig\.crowd\.desiredSpeed must be > 0, got 0/,
    );
  });

  it("rejects a zero relaxation time and says why it is a time constant", () => {
    expect(() => makeRunConfig({ crowd: { relaxationTimeS: 0 } })).toThrow(
      /RunConfig\.crowd\.relaxationTimeS must be > 0, got 0; it is a time constant/,
    );
  });

  it("rejects a goal outside a narrowed room, naming the room", () => {
    expect(() => makeRunConfig({ widthM: 18 })).toThrow(
      /RunConfig\.robot\.goalXY must be inside the room, which is 18 m by 13 m, got \(20, 6\.5\)/,
    );
  });

  it("rejects a start on the wall", () => {
    expect(() => makeRunConfig({ robot: { startXY: [0, 6.5] } })).toThrow(
      /RunConfig\.robot\.startXY must be inside the room/,
    );
  });

  it("accepts a smaller room whose start and goal were moved with it", () => {
    const config = makeRunConfig({
      widthM: 12,
      heightM: 8,
      robot: { startXY: [1, 4], goalXY: [11, 4] },
    });
    expect(config.widthM).toBe(12);
    expect(config.robot.goalXY[0]).toBe(11);
  });
});
