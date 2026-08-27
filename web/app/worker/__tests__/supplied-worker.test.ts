import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ContractError } from "../../../engine/core/errors.js";
import {
  makeFamilyProbeSettings,
  PROBE_SEEDS,
  type FamilyProbeSettings,
} from "../../../engine/job/familyProbe.js";
import type { SuppliedOutcome } from "../../../engine/job/supplied.js";
import {
  aggregateSuppliedProbe,
  probeSuppliedSeed,
  type SuppliedProbe,
  type SuppliedProbeSeed,
} from "../../../engine/job/suppliedProbe.js";
import {
  makeSuppliedClient,
  makeSuppliedLimit,
  suppliedTimeoutPhrase,
  type SuppliedAlarm,
  type SuppliedPort,
} from "../supplied.client.js";
import { pumpSupplied, suppliedPhraseFor } from "../supplied.pump.js";
import type { FromSuppliedWorker, ToSuppliedWorker } from "../supplied.protocol.js";
import { compileSupplied, UNREADABLE_METHOD } from "../supplied.sandbox.js";
import { CODE_IDENTIFIER_OR_SYNTAX } from "../../../testing/identifiers.js";

/**
 * The supplied-method worker: what crosses the boundary, what comes back, and what happens when
 * nothing comes back at all.
 *
 * The pump is exercised against the REAL engine on one room and a two-run drift line rather than
 * against a stub, for `probe.test.ts`'s reason: what matters about it is that the probe it posts is
 * the one `probeSuppliedSeed` and `aggregateSuppliedProbe` produce, over the rooms in the order the
 * seeds were asked for, and a stub of the engine could not tell you that.
 *
 * There is no worker-capable environment here — both vitest projects run in Node — so the port is a
 * plain object that records what was posted, exactly as `probe.test.ts` fakes it. That is not a
 * weaker test: the port is the whole of what the pump can see, and the boundary itself is checked
 * separately by cloning the envelopes.
 *
 * The client's half is driven by a clock this file advances by hand. A limit proved by waiting is a
 * limit that costs its own length in seconds and proves nothing about a method that never finishes,
 * because a method that never finishes is exactly what a test cannot wait for.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** One room and a two-run drift line. The console's first seed, so this is a real room. */
const CHEAP = makeFamilyProbeSettings({
  seeds: [PROBE_SEEDS[0] as number],
  bandReplicates: 2,
});

/** Two rooms, for the one question a single room cannot answer: are the outcomes in seed order? */
const TWO_ROOMS = makeFamilyProbeSettings({
  seeds: [PROBE_SEEDS[0] as number, PROBE_SEEDS[1] as number],
  bandReplicates: 2,
});

/** A method that reads one number off the room, so a room's outcome identifies which room it was. */
const READS_THE_ROOM = "return Math.abs(run.people[0].positions[0]);";

const LIMIT_MS = 4000;

/** One room's record, hand-built, for the cases that need a shape rather than a simulation. */
function roomOf(
  seed: number,
  outcome: SuppliedOutcome,
  clearedBand: boolean,
): SuppliedProbeSeed {
  return Object.freeze({
    kind: "suppliedProbeSeed" as const,
    seed,
    outcome,
    bandM: 0.11,
    peakBandM: 0.23,
    truthM: 0,
    truthUnderBand: true,
    clearedBand,
  });
}

/**
 * Four rooms, one of each thing that can happen to a method, aggregated the way the worker does.
 *
 * Hand-built rather than simulated because what is being checked here is the shape that crosses the
 * boundary and the arithmetic over it, and no crowd has to walk for either. The one outcome no
 * simulation could produce is the fourth: a room stopped by the wall clock is produced by the
 * client, outside the worker, and it still has to fit in the record the worker's own rooms fit in.
 */
const FOUR_KINDS: SuppliedProbe = aggregateSuppliedProbe([
  roomOf(20260816, { kind: "read", valueM: 0.42 }, true),
  roomOf(20268735, { kind: "failed", message: "your method returned nothing at all" }, false),
  roomOf(20276654, { kind: "nondeterministic", firstM: 0.4, secondM: 0.5 }, false),
  roomOf(20284573, { kind: "timedOut", limitMs: LIMIT_MS }, false),
]);

function collect(): {
  readonly sent: FromSuppliedWorker[];
  readonly port: { postMessage: (message: FromSuppliedWorker) => void };
} {
  const sent: FromSuppliedWorker[] = [];
  return {
    sent,
    port: {
      postMessage: (message: FromSuppliedWorker): void => {
        sent.push(message);
      },
    },
  };
}

/** The aggregated probe a finished run posts, or null where the run never finished. */
function probeOf(sent: readonly FromSuppliedWorker[]): SuppliedProbe | null {
  let found: SuppliedProbe | null = null;
  for (const message of sent) {
    if (message.kind === "done") {
      found = message.probe;
    }
  }
  return found;
}

/** What each room's method did, read back off the probe in the order the rooms were run. */
function outcomesOf(sent: readonly FromSuppliedWorker[]): readonly SuppliedOutcome[] {
  const probe = probeOf(sent);
  if (probe === null) {
    return [];
  }
  const found: SuppliedOutcome[] = [];
  for (const room of probe.perSeed) {
    found.push(room.outcome);
  }
  return found;
}

describe("the pump reports progress and then what the method read", () => {
  it("posts one progress message per room, plus the one before the first, then the answer", () => {
    const { sent, port } = collect();
    pumpSupplied(READS_THE_ROOM, CHEAP, port);

    const progress = sent.filter((message) => message.kind === "progress");
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

    const last = sent[sent.length - 1];
    expect(last?.kind).toBe("done");
  });

  it("hands back one room per seed, in the order the rooms were asked for", () => {
    // The property the whole seed-by-seed arrangement rests on. An order that drifted would be
    // undetectable on the page: room two's reading would sit under room one's name and look
    // entirely plausible.
    const { sent, port } = collect();
    pumpSupplied(READS_THE_ROOM, TWO_ROOMS, port);

    const probe = probeOf(sent);
    expect(probe, "the measurement never finished").not.toBeNull();
    if (probe === null) {
      return;
    }
    expect(probe.perSeed.length).toBe(TWO_ROOMS.seeds.length);

    // Each room says which seed it was, so the order is checked against the request rather than
    // against itself.
    for (let i = 0; i < TWO_ROOMS.seeds.length; i++) {
      expect(probe.perSeed[i]?.seed).toBe(TWO_ROOMS.seeds[i]);
    }

    const expected: SuppliedProbeSeed[] = [];
    for (const seed of TWO_ROOMS.seeds) {
      expected.push(probeSuppliedSeed(compileSupplied(READS_THE_ROOM), TWO_ROOMS, seed));
    }
    expect(probe.perSeed).toEqual(expected);
    expect(probe).toEqual(aggregateSuppliedProbe(expected));

    // And the two rooms really are different rooms, or the order assertion above would hold just
    // as well against a list that had been reversed.
    const outcomes = outcomesOf(sent);
    const first = outcomes[0];
    const second = outcomes[1];
    expect(first?.kind).toBe("read");
    expect(second?.kind).toBe("read");
    if (first?.kind === "read" && second?.kind === "read") {
      expect(first.valueM).not.toBe(second.valueM);
    }
  });

  it("carries each room's drift line, and whether the reading cleared it", () => {
    // What the outcomes alone could not carry, and the reason the whole probe crosses now. A
    // verdict needs each room's run-to-run band and whether the reading cleared it; neither is
    // recoverable from a reading, so a page holding outcomes alone would have to re-run the
    // simulator over rooms the worker had already run and thrown away.
    const { sent, port } = collect();
    pumpSupplied(READS_THE_ROOM, TWO_ROOMS, port);
    const probe = probeOf(sent);
    expect(probe, "the measurement never finished").not.toBeNull();
    if (probe === null) {
      return;
    }

    expect(probe.perSeed.length).toBe(TWO_ROOMS.seeds.length);
    for (const room of probe.perSeed) {
      expect(Number.isFinite(room.bandM), "a room crossed with no drift line").toBe(true);
      expect(room.bandM).toBeGreaterThan(0);
      expect(typeof room.clearedBand).toBe("boolean");
      // The flag is this room's reading against this room's own line, never another room's.
      if (room.outcome.kind === "read") {
        expect(room.clearedBand).toBe(room.outcome.valueM > room.bandM);
      }
      // And the world really is the zero-effect one: the truth is exactly nothing, not nearly
      // nothing, and it sits beneath the line. Exact, because both arms share one tape.
      expect(room.truthM).toBe(0);
      expect(room.truthUnderBand).toBe(true);
    }

    // Every room lands in exactly one tally. A probe whose tallies do not add up to the rooms it
    // ran would print a false-positive rate against a denominator that is not what happened.
    expect(probe.nAttempted).toBe(TWO_ROOMS.seeds.length);
    expect(probe.nUsed + probe.nNondeterministic + probe.nFailed).toBe(probe.nAttempted);
    expect(probe.nClearedBand).toBeLessThanOrEqual(probe.nAttempted);
    expect(probe.nTruthsExactlyZero).toBe(probe.nAttempted);
    expect(probe.nTruthsUnderBand).toBe(probe.nAttempted);
    expect(probe.unit).toBe("metres");
  });

  it("accounts for every room when the rooms disagree about what happened", () => {
    // The same identity where it is worth having: four rooms, one of each thing that can happen.
    // A room stopped by the wall clock gave no reading either, and is tallied with the failures
    // rather than falling out of the arithmetic into a fifth column nothing prints.
    expect(FOUR_KINDS.nAttempted).toBe(4);
    expect(FOUR_KINDS.nUsed).toBe(1);
    expect(FOUR_KINDS.nNondeterministic).toBe(1);
    expect(FOUR_KINDS.nFailed).toBe(2);
    expect(FOUR_KINDS.nUsed + FOUR_KINDS.nNondeterministic + FOUR_KINDS.nFailed).toBe(
      FOUR_KINDS.nAttempted,
    );
    // The mean is over the rooms that produced a reading, and the count of those travels beside it.
    expect(FOUR_KINDS.meanReading).toBe(0.42);
    expect(FOUR_KINDS.nClearedBand).toBe(1);
  });

  it("writes its progress in plain English, never in code", () => {
    let phrases = 0;
    for (let done = 0; done <= TWO_ROOMS.seeds.length; done++) {
      const phrase = suppliedPhraseFor(done, TWO_ROOMS.seeds.length);
      expect(CODE_IDENTIFIER_OR_SYNTAX.test(phrase), `"${phrase}" reads as code`).toBe(false);
      expect(phrase.length).toBeGreaterThan(10);
      phrases = phrases + 1;
    }
    expect(phrases).toBeGreaterThan(2);
  });
});

describe("a method that never compiled read nothing on any room", () => {
  it("posts a failure, and no answer and no per-room outcome behind it", () => {
    // The distinction this test exists for: a per-room outcome is a record of what a method read on
    // a particular room. A method that could not be read as a function did not read anything on any
    // room, and a list of failed outcomes would say it was run once per room and failed each time —
    // which is a description of a method that ran.
    const { sent, port } = collect();
    pumpSupplied("return (", CHEAP, port);

    expect(sent.length).toBe(1);
    const only = sent[0];
    expect(only?.kind).toBe("failed");
    if (only?.kind === "failed") {
      expect(only.message.startsWith(UNREADABLE_METHOD)).toBe(true);
    }
    expect(sent.some((message) => message.kind === "done")).toBe(false);
    expect(probeOf(sent), "a probe crossed for a method that never ran").toBeNull();
    expect(outcomesOf(sent)).toEqual([]);
  });

  it("does not even say which room it was on, because it was on none of them", () => {
    const { sent, port } = collect();
    pumpSupplied("this is not a function body at all )))", TWO_ROOMS, port);
    expect(sent.filter((message) => message.kind === "progress")).toEqual([]);
  });
});

describe("a method that stops part way through", () => {
  it("fails that room and lets the measurement finish", () => {
    // A method that throws is a finding about the method, not a failure of the harness. The run
    // completes, the room says what the method said, and the reader gets their own words back.
    const { sent, port } = collect();
    pumpSupplied("throw new Error('this ruler needs the room without the robot');", CHEAP, port);

    const last = sent[sent.length - 1];
    expect(last?.kind, "the measurement never finished").toBe("done");

    const outcomes = outcomesOf(sent);
    expect(outcomes.length).toBe(CHEAP.seeds.length);
    const only = outcomes[0];
    expect(only?.kind).toBe("failed");
    if (only?.kind === "failed") {
      expect(only.message).toContain("this ruler needs the room without the robot");
    }
  });

  it("fails that room when the method answers with something that is not a distance", () => {
    const { sent, port } = collect();
    pumpSupplied("return 'about a metre';", CHEAP, port);
    const outcomes = outcomesOf(sent);
    expect(outcomes[0]?.kind).toBe("failed");
    expect(sent[sent.length - 1]?.kind).toBe("done");
  });
});

/** A clock this file drives by hand: nothing fires until `tick` is called past an alarm's time. */
function fakeClock(): {
  readonly setAlarm: SuppliedAlarm;
  readonly tick: (ms: number) => void;
  readonly alarmsSet: () => number;
  readonly nowMs: () => number;
} {
  interface Alarm {
    readonly atMs: number;
    readonly fire: () => void;
    live: boolean;
  }
  let now = 0;
  const alarms: Alarm[] = [];
  const setAlarm: SuppliedAlarm = (afterMs: number, fire: () => void): (() => void) => {
    const alarm: Alarm = { atMs: now + afterMs, fire, live: true };
    alarms.push(alarm);
    return (): void => {
      alarm.live = false;
    };
  };
  const tick = (ms: number): void => {
    now = now + ms;
    for (const alarm of alarms) {
      if (alarm.live && alarm.atMs <= now) {
        alarm.live = false;
        alarm.fire();
      }
    }
  };
  return {
    setAlarm,
    tick,
    alarmsSet: (): number => alarms.length,
    nowMs: (): number => now,
  };
}

function wire(limitMs: number): {
  readonly sent: ToSuppliedWorker[];
  readonly push: (message: FromSuppliedWorker) => void;
  readonly seen: string[];
  readonly answers: SuppliedProbe[];
  readonly outcomes: SuppliedOutcome[];
  readonly terminations: number[];
  readonly clock: ReturnType<typeof fakeClock>;
  readonly client: ReturnType<typeof makeSuppliedClient>;
} {
  const sent: ToSuppliedWorker[] = [];
  const seen: string[] = [];
  const answers: SuppliedProbe[] = [];
  const outcomes: SuppliedOutcome[] = [];
  const terminations: number[] = [];
  const clock = fakeClock();
  let handler: ((event: { readonly data: FromSuppliedWorker }) => void) | null = null;
  const port: SuppliedPort = {
    postMessage: (message: ToSuppliedWorker): void => {
      sent.push(message);
    },
    addEventListener: (_type, incoming): void => {
      handler = incoming;
    },
  };
  const client = makeSuppliedClient(
    port,
    {
      onProgress: (done: number, total: number): void => {
        seen.push(`progress ${String(done)}/${String(total)}`);
      },
      onDone: (probe: SuppliedProbe): void => {
        seen.push(`done ${String(probe.nAttempted)}`);
        answers.push(probe);
      },
      onFailed: (message: string, outcome: SuppliedOutcome): void => {
        seen.push(`failed ${message}`);
        outcomes.push(outcome);
      },
    },
    makeSuppliedLimit({
      limitMs,
      terminate: (): void => {
        terminations.push(clock.nowMs());
      },
      setAlarm: clock.setAlarm,
    }),
  );
  const push = (message: FromSuppliedWorker): void => {
    if (handler === null) {
      throw new Error("the client never listened");
    }
    handler({ data: message });
  };
  return { sent, push, seen, answers, outcomes, terminations, clock, client };
}

describe("the client is the main thread's whole view of the worker", () => {
  it("carries the method's text and the settings across, and nothing else", () => {
    const w = wire(LIMIT_MS);
    w.client.start(READS_THE_ROOM, CHEAP);
    expect(w.sent.length).toBe(1);
    expect(w.sent[0]).toEqual({ kind: "supplied", source: READS_THE_ROOM, settings: CHEAP });
  });

  it("refuses a second measurement while one is running", () => {
    const w = wire(LIMIT_MS);
    w.client.start(READS_THE_ROOM, CHEAP);
    expect(() => {
      w.client.start("return 1;", CHEAP);
    }).toThrow(ContractError);
    expect(w.sent.length).toBe(1);
  });

  it("ignores anything arriving while nothing was asked for", () => {
    const w = wire(LIMIT_MS);
    w.push({ kind: "progress", seedsDone: 1, seedsTotal: 8, phase: "running a room" });
    expect(w.seen).toEqual([]);
  });

  it("surfaces a failure with the worker's own message, and never as a stopped method", () => {
    const w = wire(LIMIT_MS);
    w.client.start(READS_THE_ROOM, CHEAP);
    w.push({ kind: "failed", message: "the room ran out of room" });
    expect(w.seen).toEqual(["failed the room ran out of room"]);
    expect(w.outcomes[0]?.kind).toBe("failed");
    expect(w.client.isRunning()).toBe(false);
    expect(w.terminations).toEqual([]);
  });

  it("hands the whole probe on, rooms and drift lines and all", () => {
    const w = wire(LIMIT_MS);
    w.client.start(READS_THE_ROOM, CHEAP);
    w.push({ kind: "done", probe: FOUR_KINDS });
    expect(w.answers.length).toBe(1);
    expect(w.answers[0]).toBe(FOUR_KINDS);
    expect(w.answers[0]?.perSeed.length).toBe(FOUR_KINDS.nAttempted);
    expect(w.outcomes).toEqual([]);
  });

  it("calls the alarm off once the answer is in, so a later tick stops nothing", () => {
    const w = wire(LIMIT_MS);
    w.client.start(READS_THE_ROOM, CHEAP);
    w.push({ kind: "done", probe: FOUR_KINDS });
    expect(w.seen).toEqual(["done 4"]);
    w.clock.tick(LIMIT_MS * 10);
    expect(w.terminations).toEqual([]);
    expect(w.seen).toEqual(["done 4"]);
  });
});

describe("the wall clock, which is the only thing that can stop a runaway method", () => {
  it("terminates the worker and reports it, with the method never having finished", () => {
    // The method does not answer. Not slowly — at all. That is the case the limit exists for, and
    // it is why this test drives a clock rather than waiting: waiting for a method that never
    // finishes is what the reader would otherwise be doing.
    const w = wire(LIMIT_MS);
    w.client.start("while (true) {}", CHEAP);
    expect(w.client.isRunning()).toBe(true);

    w.clock.tick(LIMIT_MS - 1);
    expect(w.terminations, "stopped before the limit was reached").toEqual([]);
    expect(w.seen).toEqual([]);

    w.clock.tick(1);
    expect(w.terminations).toEqual([LIMIT_MS]);
    expect(w.client.isRunning()).toBe(false);
    expect(w.client.isStopped()).toBe(true);

    expect(w.seen.length).toBe(1);
    expect(w.seen[0]?.startsWith("failed ")).toBe(true);
    const outcome = w.outcomes[0];
    expect(outcome?.kind).toBe("timedOut");
    if (outcome?.kind === "timedOut") {
      expect(outcome.limitMs).toBe(LIMIT_MS);
    }
  });

  it("says what happened in plain English, naming the limit in seconds", () => {
    const phrase = suppliedTimeoutPhrase(LIMIT_MS);
    expect(CODE_IDENTIFIER_OR_SYNTAX.test(phrase), `"${phrase}" reads as code`).toBe(false);
    // Seconds, not milliseconds: a unit for a person rather than for a program.
    expect(phrase).toContain("4 seconds");
    expect(phrase).not.toContain(String(LIMIT_MS));
    expect(suppliedTimeoutPhrase(1000)).toContain("1 second");
    expect(suppliedTimeoutPhrase(2500)).toContain("2.5 seconds");
  });

  it("is not reset by progress: the limit is for the whole measurement, not for each room", () => {
    // Eight rooms that each come in just under the line are a run that still has to be stopped. A
    // per-room limit would let the total grow without bound while every room looked fine.
    const w = wire(LIMIT_MS);
    w.client.start(READS_THE_ROOM, CHEAP);

    const step = LIMIT_MS / 4;
    for (let done = 0; done < 4; done++) {
      w.clock.tick(step - 1);
      w.push({ kind: "progress", seedsDone: done, seedsTotal: 8, phase: "running a room" });
      w.clock.tick(1);
    }

    // Four rooms reported, every one of them inside a quarter of the limit, and the whole run over
    // it. A client that re-armed on each progress message would still be waiting here.
    expect(w.seen.filter((line) => line.startsWith("progress ")).length).toBe(4);
    expect(w.terminations).toEqual([LIMIT_MS]);
    expect(w.outcomes[0]?.kind).toBe("timedOut");
    // And it armed once, at the start, rather than once per message.
    expect(w.clock.alarmsSet()).toBe(1);
  });

  it("refuses to start again on a worker it has already stopped", () => {
    // The worker's thread is gone. A second measurement posted into it would never answer, and the
    // reader would watch a progress line that never moves with nothing saying why.
    const w = wire(LIMIT_MS);
    w.client.start("while (true) {}", CHEAP);
    w.clock.tick(LIMIT_MS);
    expect(() => {
      w.client.start(READS_THE_ROOM, CHEAP);
    }).toThrow(ContractError);
    expect(w.sent.length).toBe(1);
  });

  it("refuses a limit that is not a positive length of time", () => {
    const nothing = (): void => {};
    const clock = fakeClock();
    for (const limitMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => {
        makeSuppliedLimit({ limitMs, terminate: nothing, setAlarm: clock.setAlarm });
      }).toThrow(ContractError);
    }
  });
});

describe("the supplied boundary is a structural clone, not a function call", () => {
  it("carries the request across unchanged, method text and all", () => {
    const envelope: ToSuppliedWorker = {
      kind: "supplied",
      source: READS_THE_ROOM,
      settings: CHEAP,
    };
    const clone = structuredClone(envelope);
    expect(clone).not.toBe(envelope);
    expect(clone).toEqual(envelope);
    // Bytes, not approximations. structuredClone preserves own-property insertion order, so a
    // field silently reordered or dropped shows up here as a string difference.
    expect(JSON.stringify(clone)).toBe(JSON.stringify(envelope));
    expect(clone.source).toBe(READS_THE_ROOM);
  });

  it("carries a whole probe back, per-room records, drift lines and counts and all", () => {
    // The return half is the one carrying nested objects: a record per room, each with its own
    // outcome, its own drift line and its own verdict against it. tsc cannot see that those are
    // plain frozen records rather than things with a prototype, so it is checked at runtime.
    //
    // All four outcome kinds are represented, including the one the client produces rather than the
    // worker. A union member that could not cross would be a finding the page could never show.
    const envelope: FromSuppliedWorker = { kind: "done", probe: FOUR_KINDS };
    const clone = structuredClone(envelope);
    expect(clone).not.toBe(envelope);
    expect(clone).toEqual(envelope);
    expect(JSON.stringify(clone)).toBe(JSON.stringify(envelope));

    expect(clone.kind).toBe("done");
    if (clone.kind !== "done") {
      return;
    }
    const kinds: string[] = [];
    for (const room of clone.probe.perSeed) {
      kinds.push(room.outcome.kind);
      expect(room.bandM).toBe(0.11);
    }
    expect(kinds).toEqual(["read", "failed", "nondeterministic", "timedOut"]);
    expect(clone.probe.nAttempted).toBe(FOUR_KINDS.nAttempted);
  });

  it("carries a progress message and a failure back", () => {
    const progress: FromSuppliedWorker = {
      kind: "progress",
      seedsDone: 1,
      seedsTotal: 8,
      phase: suppliedPhraseFor(1, 8),
    };
    const failed: FromSuppliedWorker = { kind: "failed", message: UNREADABLE_METHOD };
    expect(structuredClone(progress)).toEqual(progress);
    expect(structuredClone(failed)).toEqual(failed);
  });

  it("refuses a message that grew a function member, loudly", () => {
    // The reason the method travels as text at all. A function on a message is a DataCloneError at
    // the boundary, so there is no version of this protocol where the reader's method crosses as a
    // method — it crosses as a string and is compiled at the far end.
    const illegal = {
      ...structuredClone({ kind: "supplied" as const, source: READS_THE_ROOM, settings: CHEAP }),
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

describe("the shape the bundler has to be able to see", () => {
  it("constructs the worker in the form Vite can bundle", () => {
    const source = readFileSync(join(HERE, "..", "supplied.client.ts"), "utf8");
    expect(
      source.includes(
        'new Worker(new URL("./supplied.worker.ts", import.meta.url), { type: "module" })',
      ),
      "a string path here builds green and 404s in production",
    ).toBe(true);
  });

  it("keeps the worker shell a shell", () => {
    const source = readFileSync(join(HERE, "..", "supplied.worker.ts"), "utf8");
    const imports = source.match(/from\s+"([^"]+)"/g) ?? [];
    expect(imports).toEqual(['from "./supplied.pump.js"', 'from "./supplied.protocol.js"']);
  });

  it("leaves the settings the family probe's own, so the two can be set side by side", () => {
    // A supplied ruler measured on a different world could not be compared with the four built-in
    // ones. The type is the guarantee: there is no second settings record to drift from this one.
    const settings: FamilyProbeSettings = CHEAP;
    expect(settings.kind).toBe("familyProbeSettings");
    expect(settings.seeds.length).toBe(1);
  });
});
