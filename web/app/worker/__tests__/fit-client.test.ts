import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RunConfigOverrides } from "../../../engine/contracts/config.js";
import { ContractError } from "../../../engine/core/errors.js";
import type { Recording } from "../../../engine/fit/recording.js";
import type { FitResult } from "../../../engine/fit/search.js";
import { makeFitClient, type FitPort } from "../fit.client.js";
import type { FromFitWorker, ToFitWorker } from "../fit.protocol.js";

/**
 * The fit page's client, and the construction line `nocompile.test.ts` lets it get away with.
 *
 * That file bans `new Worker` everywhere except a short list of client modules, on the grounds that
 * a Worker built from a string is a compilation site under another name. An entry on that list is
 * only a pin if something asserts what the entry actually builds — otherwise it is an exemption.
 * This is that assertion for `fit.client.ts`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "..", "fit.client.ts"), "utf8");

function fakeRecording(): Recording {
  return Object.freeze({
    kind: "recording" as const,
    tracks: Object.freeze([]),
    framesPerSecond: 2.5,
    nSamples: 0,
  }) as Recording;
}

describe("the fit worker is constructed the one way Vite can analyse", () => {
  it("builds it from a URL relative to this module, never from a string path", () => {
    // A string path builds green and 404s in production. Pinned verbatim, because the failure is
    // invisible until the page is deployed — which is the one thing local testing cannot see.
    expect(SOURCE).toContain(
      'new Worker(new URL("./fit.worker.ts", import.meta.url), { type: "module" })',
    );
  });

  it("builds exactly one, and nowhere but in the spawn function", () => {
    const constructions = SOURCE.match(/new\s+Worker\s*\(/g) ?? [];
    expect(constructions).toHaveLength(1);
  });

  it("never builds one from an object URL", () => {
    // The shape `nocompile.test.ts` is actually afraid of.
    expect(SOURCE).not.toContain("createObjectURL");
    expect(SOURCE).not.toContain("new Blob");
  });
});

describe("the fit client", () => {
  function harness() {
    const sent: ToFitWorker[] = [];
    const seen: string[] = [];
    const results: FitResult[] = [];
    let handler: ((event: { readonly data: FromFitWorker }) => void) | null = null;
    const port: FitPort = {
      postMessage: (message: ToFitWorker): void => {
        sent.push(message);
      },
      addEventListener: (_type, h): void => {
        handler = h;
      },
    };
    const client = makeFitClient(port, {
      onProgress: (done: number, total: number): void => {
        seen.push(`progress ${String(done)}/${String(total)}`);
      },
      onFitted: (result: FitResult): void => {
        seen.push("fitted");
        results.push(result);
      },
      onFailed: (message: string): void => {
        seen.push(`failed ${message}`);
      },
    });
    const push = (message: FromFitWorker): void => {
      if (handler === null) {
        throw new Error("the client never listened");
      }
      handler({ data: message });
    };
    return { client, sent, seen, results, push };
  }

  const BASE: RunConfigOverrides = {};

  it("sends the recording, the settings and the seed, and nothing else", () => {
    const { client, sent } = harness();
    client.start(fakeRecording(), BASE, 77);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.kind).toBe("fit");
    expect(sent[0]?.baseSeed).toBe(77);
    expect(Object.keys(sent[0] ?? {}).sort()).toEqual(["base", "baseSeed", "kind", "recording"]);
  });

  it("refuses a second fit while one is running", () => {
    // Two would land in the same verdict with no way to tell which recording's numbers were shown.
    const { client } = harness();
    client.start(fakeRecording(), BASE, 77);
    expect(() => client.start(fakeRecording(), BASE, 78)).toThrow(ContractError);
  });

  it("lets another start once the first has answered", () => {
    const { client, push } = harness();
    client.start(fakeRecording(), BASE, 77);
    push({ kind: "fitted", result: { kind: "fitResult" } as unknown as FitResult });
    expect(client.isRunning()).toBe(false);
    expect(() => client.start(fakeRecording(), BASE, 78)).not.toThrow();
  });

  it("hands a failure back in the worker's own words", () => {
    // A page about measurement honesty does not replace the one line saying what went wrong.
    const { client, seen, push } = harness();
    client.start(fakeRecording(), BASE, 77);
    push({ kind: "failed", message: "the frame rate made every speed absurd" });
    expect(seen).toContain("failed the frame rate made every speed absurd");
  });

  it("ignores anything arriving when no fit is running", () => {
    const { client, seen, push } = harness();
    push({ kind: "fitted", result: { kind: "fitResult" } as unknown as FitResult });
    expect(seen).toEqual([]);
    expect(client.isRunning()).toBe(false);
  });
});
