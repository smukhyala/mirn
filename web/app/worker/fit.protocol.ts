import type { RunConfigOverrides } from "../../engine/contracts/config.js";
import type { FitResult } from "../../engine/fit/search.js";
import type { Recording } from "../../engine/fit/recording.js";

/**
 * The two message unions the fit page's worker sends and receives, and nothing else.
 *
 * Types only, for `protocol.ts`'s reason: a function on a message throws `DataCloneError` at
 * `postMessage`. A `Recording` is frozen plain data holding `Float64Array`s and carries no method,
 * which `fit-clone.test.ts` checks rather than this comment claiming it.
 *
 * A worker of its own rather than a third job on the method card's, and the reason is the page
 * rather than the plumbing. Guardrail 1 says a fit statistic and a disturbance number are two kinds
 * of number that must be kept apart; they are kept apart here by living on different pages with
 * different workers behind them, so no message on this channel can carry a disturbance figure and
 * none on that one can carry a fit.
 */

export type ToFitWorker = {
  readonly kind: "fit";
  readonly recording: Recording;
  readonly base: RunConfigOverrides;
  readonly baseSeed: number;
};

export type FromFitWorker =
  | {
      readonly kind: "progress";
      readonly done: number;
      readonly total: number;
      readonly phase: string;
    }
  | { readonly kind: "fitted"; readonly result: FitResult }
  | { readonly kind: "failed"; readonly message: string };
