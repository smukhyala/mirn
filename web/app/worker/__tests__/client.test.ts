// web/app/worker/__tests__/client.test.ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BASE_SEED,
  SEED_STRIDE,
  makeSweepJob,
  type SweepJob,
} from "../../../engine/job/spec.js";
import { HEADLINE_COLUMNS, type ColumnKey } from "../../../engine/job/columns.js";
import { ContractError } from "../../../engine/core/errors.js";
import type { FromWorker, ToWorker } from "../protocol.js";
import { makeSweepClient, type SweepHandlers, type SweepPort } from "../client.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const headline: ColumnKey[] = [];
for (const key of HEADLINE_COLUMNS) {
  headline.push(key);
}

const job: SweepJob = makeSweepJob({
  base: {},
  axis: null,
  axisValues: [0],
  seedIndices: [0],
  baseSeed: BASE_SEED,
  seedStride: SEED_STRIDE,
  measurement: {
    kind: "measurementParams",
    forecastHorizonSteps: 60,
    forecastEndStep: 200,
    nearMissThresholdM: 0.5,
    recoveryToleranceFraction: 0.1,
    recoveryDwellSteps: 20,
  },
  columns: headline,
  bandReplicates: null,
  floor: null,
  zeroReferenceRun: true,
  frechet: false,
});

interface Harness {
  readonly port: SweepPort;
  readonly sent: ToWorker[];
  readonly deliver: (message: FromWorker) => void;
  readonly seen: string[];
}

function harness(): Harness {
  const sent: ToWorker[] = [];
  const seen: string[] = [];
  const listeners: ((event: { readonly data: FromWorker }) => void)[] = [];

  const port: SweepPort = {
    postMessage: (message: ToWorker): void => {
      sent.push(message);
    },
    addEventListener: (
      _type: "message",
      handler: (event: { readonly data: FromWorker }) => void,
    ): void => {
      listeners.push(handler);
    },
  };

  const deliver = (message: FromWorker): void => {
    for (const handler of listeners) {
      handler({ data: message });
    }
  };

  return { port, sent, deliver, seen };
}

function handlersInto(seen: string[]): SweepHandlers {
  return {
    onProgress: (unitsDone, unitsTotal, phase) => {
      seen.push(`progress ${String(unitsDone)}/${String(unitsTotal)} ${phase}`);
    },
    onRow: (row) => {
      seen.push(`row ${String(row.key.seedIndex)}`);
    },
    onBand: (axisIndex, meanM, peakM, nReplicates) => {
      seen.push(`band ${String(axisIndex)} ${String(meanM)} ${String(peakM)} ${String(nReplicates)}`);
    },
    onDone: () => {
      seen.push("done");
    },
    onCancelled: () => {
      seen.push("cancelled");
    },
    onFailed: (message) => {
      seen.push(`failed ${message}`);
    },
  };
}

describe("the main-thread client", () => {
  it("starts a job by posting it once", () => {
    const h = harness();
    const client = makeSweepClient(h.port, handlersInto(h.seen));
    client.start(job);
    expect(h.sent.length).toBe(1);
    expect(h.sent[0]?.kind).toBe("start");
    expect(client.isRunning()).toBe(true);
  });

  it("refuses a second job while one is in flight", () => {
    const h = harness();
    const client = makeSweepClient(h.port, handlersInto(h.seen));
    client.start(job);
    expect(() => client.start(job)).toThrow(ContractError);
  });

  it("routes every message kind to its handler", () => {
    const h = harness();
    const client = makeSweepClient(h.port, handlersInto(h.seen));
    client.start(job);
    h.deliver({ kind: "progress", unitsDone: 1, unitsTotal: 2, phase: "running the room" });
    h.deliver({
      kind: "row",
      row: { kind: "runRow", key: { axisIndex: 0, axisValue: 18, seedIndex: 3 }, readings: {} },
    });
    h.deliver({ kind: "band", axisIndex: 0, meanM: 0.31059, peakM: 0.512, nReplicates: 8 });
    h.deliver({ kind: "done" });
    expect(h.seen).toEqual([
      "progress 1/2 running the room",
      "row 3",
      "band 0 0.31059 0.512 8",
      "done",
    ]);
    expect(client.isRunning()).toBe(false);
  });

  it("drops rows that arrive after the operator cancelled", () => {
    const h = harness();
    const client = makeSweepClient(h.port, handlersInto(h.seen));
    client.start(job);
    client.cancel();
    expect(h.sent[1]?.kind).toBe("cancel");
    h.deliver({
      kind: "row",
      row: { kind: "runRow", key: { axisIndex: 0, axisValue: 18, seedIndex: 0 }, readings: {} },
    });
    h.deliver({ kind: "cancelled" });
    expect(h.seen).toEqual(["cancelled"]);
    expect(client.isRunning()).toBe(false);
  });

  it("surfaces a real failure with its message, even mid-cancel, rather than reporting it as a cancellation", () => {
    const h = harness();
    const client = makeSweepClient(h.port, handlersInto(h.seen));
    client.start(job);
    client.cancel();
    expect(h.sent[1]?.kind).toBe("cancel");
    // The unit in flight when cancel was requested failed for its own reason — not because it
    // was cancelled. The operator must be told THAT, not "cancelled": there is no log to check
    // afterwards, and this console's whole subject is measurement honesty.
    h.deliver({ kind: "failed", message: "the robot's goal is outside the room" });
    expect(h.seen).toEqual(["failed the robot's goal is outside the room"]);
    expect(client.isRunning()).toBe(false);
  });

  it("ignores a message that arrives when nothing is running", () => {
    const h = harness();
    makeSweepClient(h.port, handlersInto(h.seen));
    h.deliver({ kind: "done" });
    expect(h.seen).toEqual([]);
  });

  it("constructs the worker in the form Vite can bundle", () => {
    const source = readFileSync(join(HERE, "..", "client.ts"), "utf8");
    expect(
      source.includes('new Worker(new URL("./sweep.worker.ts", import.meta.url), { type: "module" })'),
      "a string path here builds green and 404s in production",
    ).toBe(true);
  });

  it("keeps the worker shell a shell", () => {
    const source = readFileSync(join(HERE, "..", "sweep.worker.ts"), "utf8");
    const imports = source.match(/from\s+"([^"]+)"/g) ?? [];
    expect(imports).toEqual(['from "./pump.js"', 'from "./protocol.js"']);
  });
});
