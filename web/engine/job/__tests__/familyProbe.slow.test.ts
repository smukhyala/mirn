import { describe, expect, it } from "vitest";
import { FAMILIES, FAMILY_ORDER, makeMethodFamily, type FamilyKey } from "../families.js";
import {
  aggregateProbe,
  makeFamilyProbeSettings,
  probeAllFamilies,
  probeFamily,
  probeSeed,
  PROBE_SEEDS,
  type FamilyProbe,
  type FamilyProbeSeed,
} from "../familyProbe.js";

/**
 * What each of the four families reads on a world where the answer is exactly nothing.
 *
 * The catalogue in `families.ts` is data with no arithmetic in it, so nothing else in the build
 * can tell whether a family still fails the way it says it does. `families.test.ts` checks that
 * the four entries are well formed; this checks that they are still the four measurements they
 * were chosen for. A physics change that quietly turned a false positive into a pass would
 * otherwise be invisible until somebody read the card.
 *
 * ## The premise, verified rather than assumed
 *
 * The crowd is told not to notice the robot. Both arms are then driven by the same forces from
 * the same tape, every person's two paths are bit-identical, and the paired estimator returns a
 * hard 0. That is asserted with `toBe`, on every seed, in the first test below. If it ever
 * stopped being exactly zero, every false-positive count in this file would be a count against
 * an unstated real effect and the whole card would be measuring something else.
 *
 * ## One null, named
 *
 * Every comparison here is against the RUN-TO-RUN BAND — how far apart two robot-free runs of the
 * same room drift on their own. Never against the split-half detection floor. The two are
 * different quantities, they cross as the room fills, and this project has twice paid for
 * treating them as interchangeable; see the header of `web/engine/measure/null/splitHalf.ts`.
 * Nothing in this file computes a floor.
 *
 * ## Measured on this machine, on the commit that wrote this table
 *
 * Eight seeds, eight band replicates, the console's default room, the crowd told to ignore the
 * robot. Truth is exactly 0 on all eight for every row.
 *
 * | family                          | mean reading | spread | mean band | cleared the band |
 * |---|---|---|---|---|
 * | both runs of the same room      |     0.0000 m | 0.0000 |  0.2913 m | 0 of 8 |
 * | a run set against a stranger    |     9.3009 m | 1.6326 |  0.2913 m | 8 of 8 |
 * | a straight-line forecast        |     0.3690 m | 0.1063 |  0.2913 m | 6 of 8 |
 * | an absolute quantity            |    18.5295 m | 0.4981 |  0.2913 m | 8 of 8 |
 *
 * Read the last two rows together, because they fail for opposite reasons. The forecaster is
 * wrong by an amount that looks like an effect: a third of a metre, on the same scale as the real
 * effects this console produces, clearing the band on six seeds out of eight and missing it on
 * two. An absolute quantity is not wrong by an amount at all — it is eighteen metres because that
 * is how far the robot walked, it would be eighteen metres if the robot had moved the entire room
 * or nobody in it, and it clears any line you put beside it. One of them can fool a careful
 * reader; the other only fools somebody who thought a quantity with no zero was a comparison.
 *
 * ## Margins, closest first
 *
 * Recorded so that a physics change which halves one is a visible number rather than a red test
 * with no baseline. Distance from the band, as a share of it, for the forecaster, which is the
 * only family whose seeds fall on both sides:
 *
 *   1.8% under, 7.6% over, 17.4% under, 17.4% over, 23.9% over, 54.4% over, 71.8% over, 89.4% over
 *
 * The closest of all is a seed that does NOT clear, by 1.8%. The other two families are never
 * close: the unpaired reading's smallest margin is twenty-six times the band, and the absolute
 * quantity's is forty-two times it. So the only count in this file that a small physics change
 * could plausibly move is the forecaster's six, which is why its per-seed pattern is pinned below
 * and not just its total.
 */

/** The false-positive count each family actually produces, measured. The heart of the file. */
const EXPECTED_CLEARED: Readonly<Record<FamilyKey, number>> = Object.freeze({
  pairedShared: 0,
  unpairedSeparate: 8,
  forecastCounterfactual: 6,
  noCounterfactual: 8,
});

/**
 * Which seeds the forecaster clears on, in `PROBE_SEEDS` order.
 *
 * Finer than the total: two different sixes are two different worlds, and a physics change that
 * moved one seed across the band in each direction would leave the total alone. The two `false`
 * entries are the fourth and sixth seeds, at margins of 1.8% and 17.4% under the band.
 */
/**
 * Every test in this file gets the same budget, because the first one to run pays for all three
 * hundred simulations and which one that is depends on the filter. Measured at about 10 s on this
 * machine for the whole file.
 */
const PROBE_TIMEOUT_MS = 120000;

const FORECAST_PATTERN: readonly boolean[] = Object.freeze([
  true,
  true,
  true,
  false,
  true,
  false,
  true,
  true,
]);

describe("what the four families read where the answer is nothing", () => {
  /**
   * Three hundred-odd simulations, run once and on demand.
   *
   * Deliberately not computed in the describe body: vitest evaluates that during COLLECTION, for
   * every file, before it knows which tests are being run -- so a `-t` filter naming one cheap
   * test elsewhere would still pay for this. Memoised rather than repeated, because every test
   * below reads the same rooms and re-running them would multiply the cost by nine for no
   * additional evidence.
   */
  let cached: ReadonlyMap<FamilyKey, FamilyProbe> | null = null;
  function probes(): ReadonlyMap<FamilyKey, FamilyProbe> {
    if (cached === null) {
      cached = probeAllFamilies(makeFamilyProbeSettings({}));
    }
    return cached;
  }

  /**
   * Every family's probe, and a guard that there is one.
   *
   * A `for` loop over an empty map runs zero times and passes in three milliseconds, which is not
   * one simulation let alone the three hundred behind this file. Two tests in this repository have
   * already done exactly that. So the count is asserted here, and every test below reads its rows
   * through this function rather than off the map.
   */
  function measured(): readonly (readonly [FamilyKey, FamilyProbe])[] {
    const rows: (readonly [FamilyKey, FamilyProbe])[] = [];
    for (const key of FAMILY_ORDER) {
      const probe = probes().get(key);
      expect(probe, `${key} was never probed`).toBeDefined();
      if (probe === undefined) {
        continue;
      }
      rows.push([key, probe]);
    }
    expect(rows.length, "no family was probed, so everything below examined nothing").toBe(
      FAMILY_ORDER.length,
    );
    return rows;
  }

  it("runs on a world whose true effect is exactly zero, on every seed", () => {
    // `toBe`, never `toBeCloseTo`. The shared-tape construction makes exactness available, and
    // inexactness would mean the two arms had drifted -- at which point every count in this file
    // is a count against an unstated real effect rather than against nothing.
    let seedsChecked = 0;
    for (const [key, probe] of measured()) {
      expect(probe.perSeed.length, `${key} probed no seeds`).toBe(PROBE_SEEDS.length);
      expect(probe.nAttempted, `${key} did not attempt every seed`).toBe(PROBE_SEEDS.length);
      expect(probe.nTruthsExactlyZero, `${key}: some seed's truth was not exactly zero`).toBe(
        PROBE_SEEDS.length,
      );
      for (const seed of probe.perSeed) {
        expect(seed.truthM, `${key} at seed ${seed.seed}: the truth was not exactly zero`).toBe(0);
        expect(seed.bandM, `${key} at seed ${seed.seed}: the band is not a positive length`,
        ).toBeGreaterThan(0);
        expect(
          seed.truthUnderBand,
          `${key} at seed ${seed.seed}: the truth did not sit beneath the band, so a reading ` +
            `clearing it would not be a false positive`,
        ).toBe(true);
        seedsChecked = seedsChecked + 1;
      }
    }
    expect(seedsChecked, "no seed was examined").toBe(FAMILY_ORDER.length * PROBE_SEEDS.length);
  }, PROBE_TIMEOUT_MS);

  it("clears the band on the number of seeds this file records, family by family", () => {
    // The substance. Flip any one of these four and the test names the family, what it read and
    // what it was judged against.
    for (const [key, probe] of measured()) {
      expect(
        probe.nClearedBand,
        `${key} cleared the band on ${probe.nClearedBand} of ${probe.nAttempted} seeds, and this ` +
          `file records ${EXPECTED_CLEARED[key]}`,
      ).toBe(EXPECTED_CLEARED[key]);
      expect(probe.nUsed, `${key} produced no number on some seed`).toBe(probe.nAttempted);
      expect(probe.nClearedBand).toBeLessThanOrEqual(probe.nUsed);
    }
  }, PROBE_TIMEOUT_MS);

  it("counts, rather than returning the same answer for every family", () => {
    // A count that is a constant is not a count. Three distinct values across four families means
    // no single hardcoded number, and no `0`, and no `nAttempted`, satisfies the test above.
    const counts = new Set<number>();
    for (const [, probe] of measured()) {
      counts.add(probe.nClearedBand);
    }
    expect(counts.size, "every family cleared the band on the same number of seeds").toBeGreaterThan(
      2,
    );
  }, PROBE_TIMEOUT_MS);

  it("reads exactly nothing when both runs are the same room, so it never false-positives", () => {
    const probe = probes().get("pairedShared");
    expect(probe).toBeDefined();
    if (probe === undefined) {
      return;
    }
    expect(probe.perSeed.length).toBe(PROBE_SEEDS.length);
    for (const seed of probe.perSeed) {
      expect(seed.reading.availability.kind).toBe("measured");
      expect(seed.reading.value, `seed ${seed.seed} did not read exactly zero`).toBe(0);
      expect(seed.clearedBand).toBe(false);
    }
    expect(probe.meanReading).toBe(0);
    expect(probe.sdReading).toBe(0);
  }, PROBE_TIMEOUT_MS);

  it("reads a room-sized number when the comparison run is a stranger", () => {
    const paired = probes().get("pairedShared");
    const unpaired = probes().get("unpairedSeparate");
    expect(paired).toBeDefined();
    expect(unpaired).toBeDefined();
    if (paired === undefined || unpaired === undefined) {
      return;
    }
    let compared = 0;
    for (let i = 0; i < PROBE_SEEDS.length; i++) {
      const a = paired.perSeed[i];
      const b = unpaired.perSeed[i];
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      if (a === undefined || b === undefined) {
        continue;
      }
      expect(a.seed, "the two probes walked different seeds").toBe(b.seed);
      // The construction is what is being checked, not the size: if the comparison arm had not
      // actually been swapped, this would read exactly zero like the row above it.
      expect(
        b.reading.value,
        `seed ${b.seed}: the unpaired reading matched the paired one, so the comparison arm was ` +
          `never swapped`,
      ).not.toBe(a.reading.value);
      expect(b.reading.value, `seed ${b.seed}: the unpaired reading is not room-sized`,
      ).toBeGreaterThan(1);
      expect(b.reading.value).toBeGreaterThan(b.bandM * 10);
      compared = compared + 1;
    }
    expect(compared, "no seed was compared between the two families").toBe(PROBE_SEEDS.length);
    expect(unpaired.meanReading).toBeGreaterThan(5);
  }, PROBE_TIMEOUT_MS);

  it("moves when the stranger is a different stranger, so the offset is really used", () => {
    // Without this, a probe that ignored `controlSeedOffset` and always drew the same decoy would
    // pass every other test in the file. Two seeds and two replicates: this is about whether the
    // offset reaches the simulator, not about the size of the answer.
    const cheap = makeFamilyProbeSettings({
      seeds: [PROBE_SEEDS[0] as number, PROBE_SEEDS[1] as number],
      bandReplicates: 2,
    });
    const near = probeFamily(FAMILIES.unpairedSeparate, cheap);
    const far = probeFamily(
      makeMethodFamily({
        ...FAMILIES.unpairedSeparate,
        ruler: { kind: "separateRunTwin", controlSeedOffset: 123457 },
      }),
      cheap,
    );
    expect(near.perSeed.length).toBe(2);
    expect(far.perSeed.length).toBe(2);
    for (let i = 0; i < 2; i++) {
      const a = near.perSeed[i];
      const b = far.perSeed[i];
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      if (a === undefined || b === undefined) {
        continue;
      }
      expect(
        b.reading.value,
        `seed ${a.seed}: two different comparison runs gave the same reading, so the offset is ` +
          `not reaching the simulator`,
      ).not.toBe(a.reading.value);
      // The band belongs to the room, not to the comparison run, so it must NOT move.
      expect(b.bandM, `seed ${a.seed}: the band moved with the comparison run's seed`).toBe(a.bandM);
    }
  }, PROBE_TIMEOUT_MS);

  it("misses the band on exactly the seeds the forecaster misses it on", () => {
    // The only family in the set whose seeds fall on both sides, and therefore the only place a
    // per-seed pattern says more than a total. Two different sixes are two different worlds.
    const probe = probes().get("forecastCounterfactual");
    expect(probe).toBeDefined();
    if (probe === undefined) {
      return;
    }
    const actual: boolean[] = [];
    for (const seed of probe.perSeed) {
      actual.push(seed.clearedBand);
    }
    expect(actual).toEqual([...FORECAST_PATTERN]);
    // Neither extreme: a family that cleared on every seed or on none would make the pattern above
    // carry no information, and would also mean the room had stopped being the interesting one.
    expect(probe.nClearedBand).toBeGreaterThan(0);
    expect(probe.nClearedBand).toBeLessThan(probe.nAttempted);
    // The size the forecaster is wrong by is the thing worth quoting, so it is bounded rather than
    // pinned to the last digit: a third of a metre, on the scale of the effects this console
    // reports. Measured at 0.3690 m.
    expect(probe.meanReading).toBeGreaterThan(0.2);
    expect(probe.meanReading).toBeLessThan(0.6);
  }, PROBE_TIMEOUT_MS);

  it("clears the band on every seed with an absolute quantity, which is what the wording claims", () => {
    // `families.ts` says in as many words that an absolute quantity "clears that line on every
    // seed". That is a claim about a measurement sitting in reader-facing copy, so it is pinned
    // here. Copy asserting a phenomenon the operator is watching not happen is the worst failure
    // this project has.
    const probe = probes().get("noCounterfactual");
    expect(probe).toBeDefined();
    if (probe === undefined) {
      return;
    }
    for (const seed of probe.perSeed) {
      expect(
        seed.clearedBand,
        `seed ${seed.seed}: the absolute quantity did not clear the band, and the family's own ` +
          `wording says it does on every seed`,
      ).toBe(true);
      expect(seed.reading.availability.kind).toBe("measured");
    }
    expect(probe.nClearedBand).toBe(probe.nAttempted);
    // Not "wrong by a plausible amount" but "not an effect at all": the robot's crossing is two
    // orders of magnitude above the line it is being held to. Measured at 18.5295 m.
    expect(probe.meanReading).toBeGreaterThan(probe.meanBandM * 20);
  }, PROBE_TIMEOUT_MS);

  it("honours the seed list it was given rather than a count of its own", () => {
    const three = makeFamilyProbeSettings({
      seeds: [PROBE_SEEDS[0] as number, PROBE_SEEDS[3] as number, PROBE_SEEDS[5] as number],
      bandReplicates: 2,
    });
    const probe = probeFamily(FAMILIES.pairedShared, three);
    expect(probe.nAttempted).toBe(3);
    expect(probe.perSeed.length).toBe(3);
    expect(probe.perSeed.map((s) => s.seed)).toEqual([
      PROBE_SEEDS[0],
      PROBE_SEEDS[3],
      PROBE_SEEDS[5],
    ]);
  }, PROBE_TIMEOUT_MS);

  it("gives the same probe seed by seed as it does in one call", () => {
    // The method card's worker runs the seeds ONE AT A TIME so it can post progress between them,
    // then hands the list to `aggregateProbe`. Everything pinned in this file is measured through
    // `probeFamily` instead. If those two routes could drift, the page and the baseline above
    // would be two measurements of the same room with nothing comparing them — so they are
    // compared here, field for field, on the family whose seeds actually fall on both sides of
    // the band.
    //
    // `toEqual`, not `toBeCloseTo`: the aggregation is a sum and a divide over identical inputs
    // in identical order, so the two routes agree bitwise or the refactor has changed something.
    const cheap = makeFamilyProbeSettings({
      seeds: [PROBE_SEEDS[0] as number, PROBE_SEEDS[3] as number, PROBE_SEEDS[4] as number],
      bandReplicates: 3,
    });
    const family = FAMILIES.forecastCounterfactual;
    const oneCall = probeFamily(family, cheap);
    const bySeed: FamilyProbeSeed[] = [];
    for (const seed of cheap.seeds) {
      bySeed.push(probeSeed(family, cheap, seed));
    }
    expect(bySeed.length, "the seed-by-seed route ran no seeds").toBe(cheap.seeds.length);
    const assembled = aggregateProbe(family, bySeed);
    expect(assembled).toEqual(oneCall);
    // And the aggregate is not vacuous: a probe of three seeds that counted nothing would satisfy
    // the line above by agreeing on a row of zeroes.
    expect(assembled.nAttempted).toBe(cheap.seeds.length);
    expect(assembled.nUsed).toBe(cheap.seeds.length);
    expect(Number.isFinite(assembled.meanReading)).toBe(true);
    expect(assembled.meanBandM).toBeGreaterThan(0);
  }, PROBE_TIMEOUT_MS);
});
