import fc from "fast-check";

/**
 * Property tests get a fixed seed before anything else runs.
 *
 * fast-check seeds itself from `Math.random()` by default, which means a failing property prints
 * a seed you can replay but a *passing* run explores a different input space every time — so a
 * flaky property looks green until CI happens to draw the bad case. Pinning it makes the suite
 * reproducible in both directions. Raise `numRuns` or change the seed deliberately when hunting.
 */
fc.configureGlobal({ seed: 20260816, numRuns: 200 });

/**
 * Determinism is a guardrail, so it is enforced rather than reviewed: `Math.random` throws for
 * the whole engine suite. Any accidental use fails loudly in CI instead of producing a run that
 * is subtly irreproducible and only noticed when a golden file drifts.
 *
 * This must come *after* fast-check is configured, because configuring it is the thing that stops
 * fast-check needing `Math.random` in the first place.
 */
Math.random = function bannedRandom(): number {
  throw new Error(
    "Math.random() is banned in the engine. Every stochastic path takes an explicit seed and " +
      "draws from a NoiseTape; see web/engine/rng/tape.ts.",
  );
};
