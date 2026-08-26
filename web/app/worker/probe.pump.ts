import { FAMILIES, type FamilyKey } from "../../engine/job/families.js";
import {
  aggregateProbe,
  probeSeed,
  type FamilyProbeSeed,
  type FamilyProbeSettings,
} from "../../engine/job/familyProbe.js";
import type { FromProbeWorker } from "./probe.protocol.js";

/**
 * Runs one family's probe, one seed at a time, posting a sentence between each.
 *
 * Seed by seed rather than in one call because a seed is the smallest piece of this job with a
 * boundary in it: within a seed there is a paired run, a band of replicate runs and one reading,
 * and no point in the middle of that where anything could be reported. Eight of them is eight
 * progress messages, which is what the reader watches.
 *
 * There is no yielding and no cancellation here, and both absences are deliberate. `postMessage`
 * from a worker queues on the MAIN thread's event loop, so the progress line repaints without this
 * loop ever handing control back — a worker that yielded between seeds would be slower for no
 * gain. And this job is a few seconds rather than the minutes a sweep can run to, so a cancel
 * button would be a control whose window closes before a reader finds it. If the settings ever
 * grow to where that stops being true, the sweep's `cancel` flag read between units is the pattern
 * to copy, not to reinvent.
 *
 * No arithmetic lives here. Every number this file posts came out of `probeSeed` or
 * `aggregateProbe`, and `familyProbe.slow.test.ts` proves those two agree with the single-call
 * route the pinned measurements were taken through.
 */

export interface ProbePort {
  postMessage(message: FromProbeWorker): void;
}

/**
 * What the reader is told while they wait.
 *
 * Reader-facing prose, so it names the family by its plain-English name from the catalogue and
 * never by its key, and it counts seeds rather than naming them: a seed's integer is an internal
 * fact about a random number generator and means nothing to anybody.
 */
export function probePhraseFor(family: FamilyKey, seedsDone: number, seedsTotal: number): string {
  if (seedsDone >= seedsTotal) {
    return "counting up what it read";
  }
  const name = FAMILIES[family].name;
  return (
    `running room ${String(seedsDone + 1)} of ${String(seedsTotal)}, where nobody reacts to the ` +
    `robot, and reading it the way "${name.toLowerCase()}" would`
  );
}

export function pumpProbe(
  family: FamilyKey,
  settings: FamilyProbeSettings,
  port: ProbePort,
): void {
  try {
    const seedsTotal = settings.seeds.length;
    const perSeed: FamilyProbeSeed[] = [];
    port.postMessage({
      kind: "progress",
      seedsDone: 0,
      seedsTotal,
      phase: probePhraseFor(family, 0, seedsTotal),
    });

    for (const seed of settings.seeds) {
      perSeed.push(probeSeed(FAMILIES[family], settings, seed));
      port.postMessage({
        kind: "progress",
        seedsDone: perSeed.length,
        seedsTotal,
        phase: probePhraseFor(family, perSeed.length, seedsTotal),
      });
    }

    port.postMessage({ kind: "probed", probe: aggregateProbe(FAMILIES[family], perSeed) });
  } catch (error) {
    let message = "the measurement stopped before it finished, and gave no reason";
    if (error instanceof Error && error.message.length > 0) {
      message = error.message;
    }
    port.postMessage({ kind: "failed", message });
  }
}
