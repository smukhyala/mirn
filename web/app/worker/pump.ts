import { AXES } from "../../engine/job/axes.js";
import { planSweep, type Unit } from "../../engine/job/plan.js";
import { sweepUnits } from "../../engine/job/runner.js";
import type { SweepJob } from "../../engine/job/spec.js";
import type { FromWorker } from "./protocol.js";

/**
 * Turns a job into a stream of messages, in slices.
 *
 * A unit is one paired run, plus whatever extras `web/engine/job/plan.ts` decided that run
 * needs — the run-to-run band, the detection floor, a zero-effect reference, a Frechet distance.
 * All of that happens inside a single call to `sweepUnits(job)`'s generator `.next()`,
 * synchronously, because there is no point in the middle of it to check anything. So
 * cancellation is a flag read BETWEEN units, and the pump has to hand the event loop back
 * periodically or the flag can never change: a worker that never yields never receives the
 * cancel message it is waiting for. `yieldToHost` is a macrotask in the worker and a resolved
 * promise in tests.
 *
 * Because a band lives inside the unit that asked for it rather than as a separate unit, the
 * worst-case cancellation latency is not a fixed "one phase" — it is whatever that one unit
 * costs. A plain run is about 38 ms at 18 people; a unit that also draws an 8-replicate band at
 * 44 people is about 740 ms. Either way, a cancel takes effect only after the unit in flight
 * finishes — never mid-unit.
 *
 * No arithmetic lives here. Every number this file posts came out of `sweepUnits`.
 */

export interface PumpPort {
  postMessage(message: FromWorker): void;
}

export interface PumpDeps {
  readonly nowMs: () => number;
  readonly yieldToHost: () => Promise<void>;
  readonly isCancelled: () => boolean;
  readonly sliceBudgetMs: number;
}

/**
 * What the operator is told while they wait.
 *
 * This is reader-facing prose, so it names the axis by its plain-English label from the
 * catalogue and never by its key. The unit is deliberately omitted: several axes carry units
 * ("count", "ratio", "none") that read as nonsense inside a sentence.
 */
export function phraseFor(job: SweepJob, unit: Unit): string {
  let where = "at the settings in the panel";
  if (job.axis !== null) {
    const entry = AXES[job.axis];
    where = `with ${entry.label.toLowerCase()} set to ${String(unit.key.axisValue)}`;
  }

  let seedOrdinal = 0;
  for (let index = 0; index < job.seedIndices.length; index++) {
    if (job.seedIndices[index] === unit.key.seedIndex) {
      seedOrdinal = index + 1;
    }
  }

  let phrase = `running the room ${where}, seed ${String(seedOrdinal)} of ${String(job.seedIndices.length)}`;

  const extras: string[] = [];
  if (unit.needsBand) {
    extras.push("the ordinary difference between two runs");
  }
  if (unit.needsFloor) {
    extras.push("the detection floor");
  }
  if (extras.length > 0) {
    phrase = `${phrase}, and measuring ${extras.join(" and ")}`;
  }
  return phrase;
}

export async function pumpSweep(job: SweepJob, port: PumpPort, deps: PumpDeps): Promise<void> {
  try {
    const plan = planSweep(job);
    const unitsTotal = plan.units.length;
    let unitsDone = 0;
    let sliceStartedMs = deps.nowMs();

    for (const output of sweepUnits(job)) {
      port.postMessage({ kind: "row", row: output.row });
      if (output.band !== null) {
        port.postMessage({
          kind: "band",
          axisIndex: output.band.axisIndex,
          meanM: output.band.meanM,
          peakM: output.band.peakM,
          nReplicates: output.band.nReplicates,
        });
      }

      unitsDone++;
      const unit = plan.units[unitsDone - 1];
      let phase = "finishing";
      if (unit !== undefined) {
        phase = phraseFor(job, unit);
      }
      port.postMessage({ kind: "progress", unitsDone, unitsTotal, phase });

      const elapsedMs = deps.nowMs() - sliceStartedMs;
      if (elapsedMs >= deps.sliceBudgetMs) {
        await deps.yieldToHost();
        sliceStartedMs = deps.nowMs();
        if (deps.isCancelled()) {
          port.postMessage({ kind: "cancelled" });
          return;
        }
      }
    }

    if (deps.isCancelled()) {
      port.postMessage({ kind: "cancelled" });
      return;
    }
    port.postMessage({ kind: "done" });
  } catch (error) {
    let message = "the sweep stopped before it finished, and gave no reason";
    if (error instanceof Error && error.message.length > 0) {
      message = error.message;
    }
    port.postMessage({ kind: "failed", message });
  }
}
