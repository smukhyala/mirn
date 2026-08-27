import { FAMILIES, type FamilyKey } from "../../engine/job/families.js";
import {
  aggregateProbe,
  probeSeed,
  type FamilyProbeSeed,
  type FamilyProbeSettings,
} from "../../engine/job/familyProbe.js";
import {
  aggregatePowerLevel,
  probePowerSeed,
  PUSH_LEVELS,
  type PowerLevel,
  type PowerSeed,
} from "../../engine/job/powerCurve.js";
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

/**
 * What the reader is told while the sweep runs.
 *
 * It counts rooms across the WHOLE sweep rather than restarting the count at each dial position,
 * because a progress line that returns to "room 1 of 8" six times reads as a page that has got
 * stuck. Reader-facing prose: the family is named from the catalogue, and the dial position is
 * given as the plain "how much space the robot demands" figure a reader can find on the console.
 */
export function curvePhraseFor(
  family: FamilyKey,
  roomsDone: number,
  roomsTotal: number,
  pushStrength: number,
): string {
  if (roomsDone >= roomsTotal) {
    return "counting up what it noticed, and what there was to notice";
  }
  const name = FAMILIES[family].name;
  const push = pushStrength === 0 ? "no space at all" : `${String(pushStrength)} times the usual`;
  return (
    `running room ${String(roomsDone + 1)} of ${String(roomsTotal)}, with the robot demanding ` +
    `${push}, and reading it the way "${name.toLowerCase()}" would`
  );
}

/**
 * Runs one family across every dial position, one room at a time.
 *
 * Room by room for `pumpProbe`'s reason — a room is the smallest piece with a boundary in it — and
 * the aggregation is `aggregatePowerLevel`'s alone, so the page and the pinned measurements are one
 * implementation rather than two that agree today. `powerCurve.slow.test.ts` runs the single-call
 * route; this is the only other one.
 */
export function pumpCurve(
  family: FamilyKey,
  settings: FamilyProbeSettings,
  port: ProbePort,
): void {
  try {
    const roomsTotal = settings.seeds.length * PUSH_LEVELS.length;
    let roomsDone = 0;
    const levels: PowerLevel[] = [];

    port.postMessage({
      kind: "progress",
      seedsDone: 0,
      seedsTotal: roomsTotal,
      phase: curvePhraseFor(family, 0, roomsTotal, PUSH_LEVELS[0] ?? 0),
    });

    for (const pushStrength of PUSH_LEVELS) {
      const rooms: PowerSeed[] = [];
      for (const seed of settings.seeds) {
        rooms.push(probePowerSeed(FAMILIES[family], settings, seed, pushStrength));
        roomsDone = roomsDone + 1;
        port.postMessage({
          kind: "progress",
          seedsDone: roomsDone,
          seedsTotal: roomsTotal,
          phase: curvePhraseFor(family, roomsDone, roomsTotal, pushStrength),
        });
      }
      levels.push(aggregatePowerLevel(pushStrength, rooms));
    }

    port.postMessage({
      kind: "curved",
      curve: Object.freeze({
        kind: "powerCurve" as const,
        familyKey: family,
        unit: "metres" as const,
        levels: Object.freeze(levels),
      }),
    });
  } catch (error) {
    let message = "the sweep stopped before it finished, and gave no reason";
    if (error instanceof Error && error.message.length > 0) {
      message = error.message;
    }
    port.postMessage({ kind: "failed", message });
  }
}
