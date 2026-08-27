import { fail } from "../../engine/core/errors.js";
import type { SuppliedRun } from "../../engine/job/supplied.js";

/**
 * The only module in this repository that turns a reader's text back into a function.
 *
 * ## What this is
 *
 * The reader types the BODY of a function: one argument, a run, and a number in metres back. That
 * text crosses into the worker as a string, because a function throws `DataCloneError` at
 * `postMessage` and there is no catalogue key to send instead. Here it is compiled, once, and
 * handed back as something the pump can call per room.
 *
 * ## What this is not, said plainly
 *
 * **It is not a jail, and it must never be described as one.** Before each call it sets the
 * network globals a worker can reach to nothing, and puts them back afterwards. That raises the
 * cost of an ACCIDENT — a stray line that phones home is a thrown error rather than a request — and
 * a determined function walks around it without much trouble:
 *
 *   - anything scheduled for later runs after the globals are back, so a timer, a promise or a
 *     microtask reaches every one of them;
 *   - the list below is a list, and a worker's network stack is not on it. Removing five names
 *     does not remove the ability to reach the network, only these five doors to it;
 *   - the code doing the removing is ordinary code in the same scope, so code running inside can
 *     undo it.
 *
 * Overclaiming here is the specific failure this project exists to refuse. A sentence saying the
 * supplied method "runs sandboxed" would be a claim of the exact kind the console spends four pages
 * teaching a reader to distrust, and it would be false.
 *
 * ## Why that is acceptable, which is the load-bearing part
 *
 * **The permalink never carries code.** Guardrail 10: there is no server, no storage and no link
 * that can carry a method body, so the only function that can ever run here is one the reader typed
 * into the page in front of them. What this module protects a reader from is their own mistake.
 * What protects them from an attacker is that an attacker has no way to deliver anything.
 *
 * **If a link, a file or a stored session is ever given the ability to carry a method body, that
 * reasoning collapses and this module becomes the only thing standing.** It is not strong enough to
 * be that, and nothing here is permission to try. Guardrail 10 and the design note both say so.
 *
 * ## What it does not do
 *
 * It does not judge. A body returning a string, nothing at all, or an infinity is passed straight
 * back to the caller exactly as it came, because deciding what a returned value means belongs to
 * `judgeSuppliedResult` in `web/engine/job/supplied.ts`, which sees BOTH of the two runs and is the
 * only thing that can tell a nondeterministic method from a failed one. A sandbox that quietly
 * turned a bad value into a zero would be reporting a reading nobody took.
 */

/**
 * The doors this module shuts before a call, and opens again after it.
 *
 * Written out as a closed list rather than swept up by pattern, so that adding one is a visible
 * edit. `web/app/console/__tests__/nostorage.test.ts` greps every source file under `web/` for
 * these names and this file is where they are legitimately spelled — it shuts them rather than
 * calling them, which is the opposite of the thing that scan exists to catch.
 */
export const NETWORK_GLOBALS: readonly string[] = Object.freeze([
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "importScripts",
]);

/** What a reader is told when the text could not be compiled at all. Plain English, then theirs. */
export const UNREADABLE_METHOD =
  "That method could not be read as the body of a function, so nothing was run. " +
  "What the browser said, in its own words:";

/** What a reader is told when the method itself stopped. Their method's words, never ours. */
export const METHOD_STOPPED =
  "That method stopped part way through and gave no reading. " +
  "What it said, in its own words:";

/** A record of one global as it was found, so that it can be put back exactly as it was. */
interface SavedGlobal {
  readonly kind: "savedGlobal";
  readonly name: string;
  /** Undefined where the name was not there at all — then putting it back means removing it. */
  readonly descriptor: PropertyDescriptor | undefined;
  /** False where the property refused to be redefined, and so was never ours to restore. */
  readonly replaced: boolean;
}

function wordsOf(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return "nothing at all";
}

function shutNetworkGlobals(): readonly SavedGlobal[] {
  const saved: SavedGlobal[] = [];
  for (const name of NETWORK_GLOBALS) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    let replaced = false;
    try {
      Object.defineProperty(globalThis, name, {
        value: null,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      replaced = true;
    } catch {
      // A property that refuses to be redefined stays as it was. Saying so here rather than
      // throwing: a host that pins one of these is not a reason to refuse to run the method, and
      // pretending the door was shut would be the overclaim this file is written against.
      replaced = false;
    }
    saved.push(Object.freeze({ kind: "savedGlobal" as const, name, descriptor, replaced }));
  }
  return saved;
}

function openNetworkGlobals(saved: readonly SavedGlobal[]): void {
  const scope = globalThis as unknown as Record<string, unknown>;
  for (const entry of saved) {
    if (!entry.replaced) {
      continue;
    }
    if (entry.descriptor === undefined) {
      delete scope[entry.name];
      continue;
    }
    Object.defineProperty(globalThis, entry.name, entry.descriptor);
  }
}

/**
 * Compile one reader's method body into something callable, or fail in words they can read.
 *
 * The body is wrapped so that the reader writes statements and nothing else: one argument named
 * `run` arrives, and whatever they return comes back untouched. It is compiled in strict mode, so a
 * mistyped assignment is an error at the point of the mistake rather than a new global that
 * outlives the call.
 *
 * A syntax error never escapes as itself. It is caught here and re-thrown as this project's one
 * contract failure with a sentence in front of it, the same shape `pumpProbe` already turns into a
 * message the reader sees, so the page can say what happened instead of a progress line stopping
 * with no explanation.
 */
export function compileSupplied(source: string): (run: SuppliedRun) => unknown {
  let compiled: (run: SuppliedRun) => unknown;
  try {
    // The one `new Function` in `web/`. It is load-bearing and it is deliberate: see the header,
    // and see the boundary test that asserts this construction appears here and nowhere else.
    const wrapper = new Function("run", `"use strict";\n${source}`);
    compiled = wrapper as (run: SuppliedRun) => unknown;
  } catch (error) {
    fail(`${UNREADABLE_METHOD} ${wordsOf(error)}`);
  }

  return (run: SuppliedRun): unknown => {
    const saved = shutNetworkGlobals();
    try {
      return compiled(run);
    } catch (error) {
      fail(`${METHOD_STOPPED} ${wordsOf(error)}`);
    } finally {
      openNetworkGlobals(saved);
    }
  };
}
