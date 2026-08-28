import { describe, expect, it } from "vitest";
import { ContractError } from "../../core/errors.js";
import { makeRecording, speedsFrom } from "../recording.js";

/**
 * Reading a recording in, and the two properties that are not about parsing.
 *
 * The first is privacy: identifiers group the samples and then cease to exist. It is asserted
 * structurally — there is no field on a `Recording` they could survive in — rather than by checking
 * that no surface prints one, because the surfaces are where that would be forgotten.
 *
 * The second is that a frame is not a second. The conversion comes from the caller and is refused
 * rather than guessed, because a file annotated at 2.5 frames per second and read as 25 reports a
 * crowd walking at a tenth of its speed, quietly, and every fitted parameter after it is wrong by
 * the same factor.
 */

/** Two people walking in straight lines at known speeds, at one sample per second. */
const SIMPLE = [
  "# a header line, which is skipped",
  "",
  "0 alice 0 0",
  "1 alice 1 0",
  "2 alice 2 0",
  "0 bob 0 5",
  "1 bob 0 7",
  "2 bob 0 9",
].join("\n");

describe("reading a recording", () => {
  it("skips comments and blank lines, and groups by person", () => {
    const recording = makeRecording(SIMPLE, 1);
    expect(recording.tracks.length).toBe(2);
    expect(recording.nSamples).toBe(6);
    expect(recording.framesPerSecond).toBe(1);
  });

  it("keeps no identifier anywhere a surface could reach", () => {
    // The privacy property, made structural. If a `person` field ever appears on a track, this
    // fails here rather than on the day somebody renders one.
    const recording = makeRecording(SIMPLE, 1);
    const track = recording.tracks[0];
    expect(Object.keys(track ?? {}).sort()).toEqual(["kind", "nSamples", "samples"]);
    expect(JSON.stringify(recording)).not.toContain("alice");
    expect(JSON.stringify(recording)).not.toContain("bob");
  });

  it("takes the frame rate from the caller and refuses to guess it", () => {
    expect(() => makeRecording(SIMPLE, 0)).toThrow(ContractError);
    expect(() => makeRecording(SIMPLE, -1)).toThrow(ContractError);
    expect(() => makeRecording(SIMPLE, Number.NaN)).toThrow(ContractError);
  });

  it("reads speeds in metres per second, at the rate it was told", () => {
    // Alice covers 1 m per frame, Bob 2 m. At one frame per second that is 1 and 2 m/s; at two
    // frames per second the same file is a crowd walking twice as fast.
    const atOne = [...speedsFrom(makeRecording(SIMPLE, 1))];
    expect(atOne.sort()).toEqual([1, 1, 2, 2]);
    const atTwo = [...speedsFrom(makeRecording(SIMPLE, 2))];
    expect(atTwo.sort()).toEqual([2, 2, 4, 4]);
  });

  it("divides by the frames that actually passed, not by one", () => {
    // Public recordings drop samples when a tracker loses somebody. Treating a ten-frame gap as one
    // frame reports a person sprinting.
    const gapped = ["0 a 0 0", "10 a 10 0", "0 b 0 0", "1 b 1 0"].join("\n");
    const speeds = [...speedsFrom(makeRecording(gapped, 1))];
    expect(speeds.sort()).toEqual([1, 1]);
  });

  it("drops somebody seen once, because a position is not a movement", () => {
    const passing = [...SIMPLE.split("\n"), "1 carol 4 4"].join("\n");
    const recording = makeRecording(passing, 1);
    expect(recording.tracks.length).toBe(2);
    // And the dropped sample is not counted in the total either, or the provenance line would
    // describe a file with more in it than was used.
    expect(recording.nSamples).toBe(6);
  });

  it("refuses a crowd of one, because a crowd is fitted to a crowd", () => {
    expect(() => makeRecording("0 a 0 0\n1 a 1 0", 1)).toThrow(ContractError);
  });

  it("refuses a file with nothing in it", () => {
    expect(() => makeRecording("# only a comment\n\n", 1)).toThrow(ContractError);
  });

  it("refuses one person in two places at once", () => {
    // Then the identifiers do not name one person each, and no speed read from the file is one
    // person's speed.
    const doubled = ["0 a 0 0", "0 a 5 5", "1 a 1 0", "0 b 0 1", "1 b 1 1"].join("\n");
    expect(() => makeRecording(doubled, 1)).toThrow(ContractError);
  });

  it("refuses a line that is not a sample", () => {
    expect(() => makeRecording("0 a 0\n1 a 1 0\n0 b 0 1\n1 b 1 1", 1)).toThrow(ContractError);
    expect(() => makeRecording("x a 0 0\n1 a 1 0\n0 b 0 1\n1 b 1 1", 1)).toThrow(ContractError);
    expect(() => makeRecording("0 a here 0\n1 a 1 0\n0 b 0 1\n1 b 1 1", 1)).toThrow(ContractError);
  });

  it("reads commas as happily as spaces", () => {
    const commas = SIMPLE.replaceAll(" ", ",").replaceAll("#,", "# ");
    expect(speedsFrom(makeRecording(commas, 1)).length).toBe(4);
  });

  it("sorts each person's samples by frame rather than trusting the file's order", () => {
    const shuffled = ["2 a 2 0", "0 a 0 0", "1 a 1 0", "0 b 0 1", "1 b 1 1"].join("\n");
    const speeds = [...speedsFrom(makeRecording(shuffled, 1))];
    // Out of order, alice's steps would read as +2 then -1 and the speeds would be 2 and 1.
    expect(speeds.sort()).toEqual([1, 1, 1]);
  });
});
