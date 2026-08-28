import { fitCrowd } from "../../engine/fit/search.js";
import type { ToFitWorker, FromFitWorker } from "./fit.protocol.js";

/**
 * Runs the fit and posts a sentence before it.
 *
 * Unlike `probe.pump.ts` this does NOT report progress candidate by candidate, and the absence is
 * deliberate rather than unfinished. `fitCrowd` is one call that owns its own loop, and splitting it
 * open here so the page could count rungs would put the search's structure in two places — the page
 * would then be able to disagree with the engine about how many candidates there are, which is the
 * class of drift the whole repository writes tests against. One sentence before, one answer after.
 *
 * No arithmetic lives here. Every number posted came out of `fitCrowd`.
 */

export interface FitPort {
  postMessage(message: FromFitWorker): void;
}

export const FIT_PHASE =
  "walking the invented crowd at each pace and wobble in turn, and asking how far its speeds sit " +
  "from the recording's";

export function pumpFit(job: ToFitWorker, port: FitPort): void {
  try {
    port.postMessage({ kind: "progress", done: 0, total: 1, phase: FIT_PHASE });
    const result = fitCrowd({
      recording: job.recording,
      base: job.base,
      baseSeed: job.baseSeed,
    });
    port.postMessage({ kind: "fitted", result });
  } catch (error) {
    let message = "the fit stopped before it finished, and gave no reason";
    if (error instanceof Error && error.message.length > 0) {
      message = error.message;
    }
    port.postMessage({ kind: "failed", message });
  }
}
