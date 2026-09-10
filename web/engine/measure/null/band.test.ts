import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../contracts/config.js";
import { runPair } from "../../sim/run.js";
import { deviation } from "../metrics.js";
import { bandFrom, replicateBand } from "./band.js";

/**
 * A max-over-steps readout needs a max-over-steps null.
 *
 * `value` is the 95th percentile of the pairwise MEAN gap between two robot-free runs, and it is
 * the right floor for the typical-effect readout. The worst-moment readout is a maximum over
 * steps, and a maximum is >= a mean for any series by construction, so judging it against `value`
 * would flag every run as remarkable. `peakValue` is the same 28 replicate pairs measured with
 * the same statistic the readout uses.
 */
describe("replicateBand", () => {
  const band = replicateBand(makeRunConfig(), 8);

  it("leaves the mean statistic bit-for-bit where it was", () => {
    expect(band.value).toBe(0.31058715139377074);
    expect(band.nPairs).toBe(28);
    expect(band.samples.length).toBe(28);
  });

  it("reports the peak statistic over the same replicate pairs", () => {
    expect(band.peakValue).toBe(0.7649744339753771);
    expect(band.peakSamples.length).toBe(28);
  });

  it("never puts a pair's peak below its own mean", () => {
    for (let i = 0; i < band.nPairs; i++) {
      const meanOfPair = band.samples[i] as number;
      const peakOfPair = band.peakSamples[i] as number;
      expect(peakOfPair).toBeGreaterThanOrEqual(meanOfPair);
    }
  });

  it("puts the default run's worst moment below its own peak null, which the mean band hides", () => {
    // This is the finding that forced the second statistic. Judged against `value` the worst
    // moment looks like 2.5x the floor; judged against the floor for its own statistic it is
    // below it. Both numbers are correct and only one of them is the right comparison.
    const worstMoment = deviation(runPair(makeRunConfig()).pair).maxM;
    expect(worstMoment).toBeGreaterThan(band.value);
    expect(worstMoment).toBeLessThan(band.peakValue);
  });
});

/**
 * `bandFrom` mirrors the run-collecting loop `replicateBand` runs internally: same replicate
 * numbering, same `robot-presence` treatment (so the control arm is the robot-absent world), same
 * config overrides. That loop is reproducible from outside `band.ts` — nothing in it is private
 * state — so this test rebuilds it verbatim rather than reaching for a looser characterization,
 * and proves the split moved the arithmetic without changing it.
 */
describe("a band can be computed from runs somebody else produced", () => {
  it("gives the same answer as running them here, on the same runs", () => {
    const config = makeRunConfig({ seed: 4242, nTicks: 60, crowd: { nPedestrians: 6 } });
    const viaSimulator = replicateBand(config, 3);

    const runs: (readonly Float64Array[])[] = [];
    for (let replicate = 1; replicate <= 3; replicate++) {
      const replicateConfig = makeRunConfig({
        ...config,
        replicate,
        treatment: { kind: "robot-presence" },
      });
      runs.push(runPair(replicateConfig).control.positions);
    }
    const viaArrays = bandFrom(runs);

    expect(viaArrays.value).toBe(viaSimulator.value);
    expect(viaArrays.peakValue).toBe(viaSimulator.peakValue);
  });

  it("refuses fewer than two runs, because one run has nothing to differ from", () => {
    expect(() => bandFrom([[new Float64Array([0, 0, 1, 1])]])).toThrow(/at least 2/);
  });
});
