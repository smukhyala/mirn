import type { FamilyProbeSettings } from "../../engine/job/familyProbe.js";
import {
  aggregateSuppliedProbe,
  probeSuppliedSeed,
  type SuppliedMethodRunner,
  type SuppliedProbeSeed,
} from "../../engine/job/suppliedProbe.js";
import { compileSupplied } from "./supplied.sandbox.js";
import type { FromSuppliedWorker } from "./supplied.protocol.js";

/**
 * Runs one reader's own method, one seed at a time, posting a sentence between each.
 *
 * The shape is `probe.pump.ts`'s, deliberately and line for line, because the reader watches the
 * same progress line whichever ruler is being measured. Seed by seed rather than in one call for
 * the same reason as there: a seed is the smallest piece of this job with a boundary in it — one
 * paired run, one band of replicate runs, one reading — and there is no point in the middle of that
 * where anything could be reported.
 *
 * There is no yielding and no cancellation here either, and this is where the two pumps stop being
 * the same. A family cannot run away; a supplied method can, and a `while (true)` inside one is not
 * interruptible from this thread at all — a flag checked between seeds is never reached, because
 * the loop that would read it is the loop that is stuck. So the limit lives OUTSIDE the worker, in
 * `supplied.client.ts`, which owns a wall clock and terminates the whole worker when it expires.
 * Nothing in this file can enforce it, and nothing in this file pretends to.
 *
 * No arithmetic lives here. Every outcome this file posts came out of `probeSuppliedSeed`, which is
 * the same function the pinned measurements are taken through.
 */

export interface SuppliedPort {
  postMessage(message: FromSuppliedWorker): void;
}

/**
 * What the reader is told while they wait.
 *
 * Reader-facing prose, so it carries no name out of a program. It cannot name the ruler the way the
 * family pump does — a supplied method has no name, and the catalogue it would be looked up in is
 * the thing it is not in — so it says whose method it is instead, which is the true and useful
 * half. Seeds are counted rather than named: a seed's integer is an internal fact about a random
 * number generator and means nothing to anybody.
 */
export function suppliedPhraseFor(seedsDone: number, seedsTotal: number): string {
  if (seedsDone >= seedsTotal) {
    return "counting up what your method read";
  }
  return (
    `running room ${String(seedsDone + 1)} of ${String(seedsTotal)}, where nobody reacts to the ` +
    `robot, and reading it the way your own method reads it`
  );
}

/**
 * What a failure says, in the failing thing's own words wherever it has any.
 *
 * Only the message crosses. An `Error` is not structured-cloneable in the shape anybody would want
 * back — the stack is a fact about our bundle rather than about the reader's method — and this
 * project's rule is that a failure surfaces with the real sentence rather than a substituted
 * apology.
 */
function sentenceFor(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "the measurement stopped before it finished, and gave no reason";
}

/**
 * Compile the reader's text, or say why it could not be read.
 *
 * A compile failure is reported as a FAILED MEASUREMENT and never as a per-seed outcome, and the
 * difference is not bookkeeping: a per-seed outcome is a record of what a method read on a
 * particular room, and a method that never compiled did not read anything on any room. Eight failed
 * outcomes here would say the method was run eight times and disagreed with itself nowhere, which
 * is a description of a method that ran.
 */
function compiledOrReported(source: string, port: SuppliedPort): SuppliedMethodRunner | null {
  try {
    return compileSupplied(source);
  } catch (error) {
    port.postMessage({ kind: "failed", message: sentenceFor(error) });
    return null;
  }
}

export function pumpSupplied(
  source: string,
  settings: FamilyProbeSettings,
  port: SuppliedPort,
): void {
  const runMethod = compiledOrReported(source, port);
  if (runMethod === null) {
    return;
  }

  try {
    const seedsTotal = settings.seeds.length;
    const perSeed: SuppliedProbeSeed[] = [];
    port.postMessage({
      kind: "progress",
      seedsDone: 0,
      seedsTotal,
      phase: suppliedPhraseFor(0, seedsTotal),
    });

    for (const seed of settings.seeds) {
      const probed: SuppliedProbeSeed = probeSuppliedSeed(runMethod, settings, seed);
      perSeed.push(probed);
      port.postMessage({
        kind: "progress",
        seedsDone: perSeed.length,
        seedsTotal,
        phase: suppliedPhraseFor(perSeed.length, seedsTotal),
      });
    }

    port.postMessage({ kind: "done", probe: aggregateSuppliedProbe(perSeed) });
  } catch (error) {
    port.postMessage({ kind: "failed", message: sentenceFor(error) });
  }
}
