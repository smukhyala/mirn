import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ContractError } from "../../../engine/core/errors.js";
import { FAMILIES, FAMILY_ORDER } from "../../../engine/job/families.js";
import {
  makeFamilyProbeSettings,
  probeFamily,
  PROBE_SEEDS,
  type FamilyProbe,
} from "../../../engine/job/familyProbe.js";
import { makeProbeClient, type ProbePort } from "../probe.client.js";
import { probePhraseFor, pumpProbe } from "../probe.pump.js";
import type { FromProbeWorker, ToProbeWorker } from "../probe.protocol.js";
import { CODE_IDENTIFIER_OR_SYNTAX } from "../../../testing/identifiers.js";

/**
 * The method card's worker: what crosses the boundary, and what comes back.
 *
 * The pump is exercised against the REAL engine on two rooms and a two-run drift line — about a
 * quarter of a second — rather than against a stub. What matters about it is that driving the
 * seeds one at a time and aggregating at the end produces the same probe as a single call, and a
 * stub of the engine could not tell you that. The eight-room measurement it agrees with is pinned
 * in `familyProbe.slow.test.ts`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

const CHEAP = makeFamilyProbeSettings({
  seeds: [PROBE_SEEDS[0] as number, PROBE_SEEDS[1] as number],
  bandReplicates: 2,
});

function collect(): { readonly sent: FromProbeWorker[]; readonly port: { postMessage: (m: FromProbeWorker) => void } } {
  const sent: FromProbeWorker[] = [];
  return { sent, port: { postMessage: (m: FromProbeWorker): void => { sent.push(m); } } };
}

describe("the pump reports progress and then the answer", () => {
  it("posts one progress message per room, plus the one before the first", () => {
    const { sent, port } = collect();
    pumpProbe("pairedShared", CHEAP, port);
    const progress = sent.filter((m) => m.kind === "progress");
    // One before the first room, one after each. A pump that posted only at the end would leave a
    // reader watching a button that did nothing for as long as the measurement takes.
    expect(progress.length).toBe(CHEAP.seeds.length + 1);
    let previous = -1;
    for (const message of progress) {
      if (message.kind !== "progress") {
        continue;
      }
      expect(message.seedsDone).toBeGreaterThan(previous);
      expect(message.seedsTotal).toBe(CHEAP.seeds.length);
      expect(message.phase.length).toBeGreaterThan(10);
      previous = message.seedsDone;
    }
    expect(previous).toBe(CHEAP.seeds.length);
  });

  it("finishes with the same probe a single call produces", () => {
    // The property the whole seed-by-seed arrangement rests on. If it did not hold, the page and
    // every pinned measurement in this repository would be two measurements of the same rooms with
    // nothing comparing them.
    let checked = 0;
    for (const key of FAMILY_ORDER) {
      const { sent, port } = collect();
      pumpProbe(key, CHEAP, port);
      const last = sent[sent.length - 1];
      expect(last?.kind, `${key} never finished`).toBe("probed");
      if (last === undefined || last.kind !== "probed") {
        continue;
      }
      expect(last.probe).toEqual(probeFamily(FAMILIES[key], CHEAP));
      expect(last.probe.family).toBe(key);
      checked = checked + 1;
    }
    expect(checked, "no family was pumped").toBe(FAMILY_ORDER.length);
  });

  it("reports a failure rather than throwing out of the worker", () => {
    // A throw inside a worker's message handler is an unhandled rejection nobody sees. The reader
    // would watch a progress line stop and never be told why.
    const { sent, port } = collect();
    const illegal = { ...CHEAP, seeds: [Number.NaN] } as unknown as typeof CHEAP;
    pumpProbe("pairedShared", illegal, port);
    const last = sent[sent.length - 1];
    expect(last?.kind).toBe("failed");
    if (last?.kind === "failed") {
      expect(last.message.length).toBeGreaterThan(0);
    }
  });

  it("writes its progress in plain English, never in code", () => {
    let phrases = 0;
    for (const key of FAMILY_ORDER) {
      for (let done = 0; done <= CHEAP.seeds.length; done++) {
        const phrase = probePhraseFor(key, done, CHEAP.seeds.length);
        expect(CODE_IDENTIFIER_OR_SYNTAX.test(phrase), `"${phrase}" reads as code`).toBe(false);
        expect(phrase.length).toBeGreaterThan(10);
        phrases = phrases + 1;
      }
    }
    expect(phrases).toBeGreaterThan(10);
  });
});

describe("the client is the main thread's whole view of the worker", () => {
  function wire(): {
    readonly sent: ToProbeWorker[];
    readonly push: (message: FromProbeWorker) => void;
    readonly seen: string[];
    readonly probes: FamilyProbe[];
    readonly client: ReturnType<typeof makeProbeClient>;
  } {
    const sent: ToProbeWorker[] = [];
    const seen: string[] = [];
    const probes: FamilyProbe[] = [];
    let handler: ((event: { readonly data: FromProbeWorker }) => void) | null = null;
    const port: ProbePort = {
      postMessage: (message: ToProbeWorker): void => { sent.push(message); },
      addEventListener: (_type, h): void => { handler = h; },
    };
    const client = makeProbeClient(port, {
      onProgress: (done: number, total: number): void => { seen.push(`progress ${done}/${total}`); },
      onProbed: (probe: FamilyProbe): void => { seen.push("probed"); probes.push(probe); },
      onFailed: (message: string): void => { seen.push(`failed ${message}`); },
    });
    const push = (message: FromProbeWorker): void => {
      if (handler === null) {
        throw new Error("the client never listened");
      }
      handler({ data: message });
    };
    return { sent, push, seen, probes, client };
  }

  it("carries the family and the settings across, and nothing else", () => {
    const w = wire();
    w.client.start("forecastCounterfactual", CHEAP);
    expect(w.sent.length).toBe(1);
    expect(w.sent[0]).toEqual({ kind: "probe", family: "forecastCounterfactual", settings: CHEAP });
  });

  it("refuses a second measurement while one is running", () => {
    // Two probes would land in the same verdict with no way to tell which family's numbers were on
    // screen — which is the one way this page could show a complete, plausible, wrong answer.
    const w = wire();
    w.client.start("pairedShared", CHEAP);
    expect(() => { w.client.start("noCounterfactual", CHEAP); }).toThrow(ContractError);
    expect(w.sent.length).toBe(1);
  });

  it("takes another after the first has answered", () => {
    const w = wire();
    w.client.start("pairedShared", CHEAP);
    expect(w.client.isRunning()).toBe(true);
    w.push({ kind: "probed", probe: probeFamily(FAMILIES.pairedShared, CHEAP) });
    expect(w.client.isRunning()).toBe(false);
    w.client.start("noCounterfactual", CHEAP);
    expect(w.sent.length).toBe(2);
  });

  it("ignores anything arriving while nothing was asked for", () => {
    const w = wire();
    w.push({ kind: "progress", seedsDone: 1, seedsTotal: 8, phase: "running" });
    expect(w.seen).toEqual([]);
  });

  it("surfaces a failure with the worker's own message", () => {
    const w = wire();
    w.client.start("pairedShared", CHEAP);
    w.push({ kind: "failed", message: "the room ran out of room" });
    expect(w.seen).toEqual(["failed the room ran out of room"]);
    expect(w.client.isRunning()).toBe(false);
  });

  it("constructs the worker in the form Vite can bundle", () => {
    const source = readFileSync(join(HERE, "..", "probe.client.ts"), "utf8");
    expect(
      source.includes('new Worker(new URL("./probe.worker.ts", import.meta.url), { type: "module" })'),
      "a string path here builds green and 404s in production",
    ).toBe(true);
  });

  it("keeps the worker shell a shell", () => {
    const source = readFileSync(join(HERE, "..", "probe.worker.ts"), "utf8");
    const imports = source.match(/from\s+"([^"]+)"/g) ?? [];
    expect(imports).toEqual(['from "./probe.pump.js"', 'from "./probe.protocol.js"']);
  });
});

describe("the probe boundary is a structural clone, not a function call", () => {
  it("carries the request across unchanged", () => {
    for (const key of FAMILY_ORDER) {
      const envelope: ToProbeWorker = { kind: "probe", family: key, settings: CHEAP };
      const clone = structuredClone(envelope);
      expect(clone).not.toBe(envelope);
      expect(clone).toEqual(envelope);
      // Bytes, not approximations. structuredClone preserves own-property insertion order, so a
      // field silently reordered or dropped shows up here as a string difference.
      expect(JSON.stringify(clone)).toBe(JSON.stringify(envelope));
    }
  });

  it("carries a whole probe back, per-room records and all", () => {
    // The return half is the one carrying nested objects: a `Reading` per room, each with its own
    // availability record. tsc cannot see that those are plain frozen records rather than things
    // with a prototype, so it is checked at runtime.
    const probe = probeFamily(FAMILIES.forecastCounterfactual, CHEAP);
    const envelope: FromProbeWorker = { kind: "probed", probe };
    const clone = structuredClone(envelope);
    expect(clone).toEqual(envelope);
    expect(JSON.stringify(clone)).toBe(JSON.stringify(envelope));
    expect(probe.perSeed.length).toBe(CHEAP.seeds.length);
  });

  it("refuses a message that grew a function member, loudly", () => {
    const illegal = {
      ...structuredClone({ kind: "probe" as const, family: "pairedShared" as const, settings: CHEAP }),
      apply: (value: number): number => value,
    };
    let name = "nothing was thrown";
    try {
      structuredClone(illegal);
    } catch (error) {
      name = (error as { name?: string }).name ?? "an error with no name";
    }
    expect(name).toBe("DataCloneError");
  });
});
