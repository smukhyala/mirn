import { fail } from "../core/errors.js";
import {
  FORMAT_VERSION, ROLE_DESCRIPTIONS, RUN_ROLES,
  type Completion, type Provenance, type RunRecord, type RunRole, type RunSet,
  type Scenario, type SuppliedAgent, type SuppliedBodies, type SuppliedPathRecord,
} from "./schema.js";

/**
 * Text to a validated run set.
 *
 * A string, never a `File` and never a URL. Guardrail 10 leaves this site with no server to fetch
 * from and no storage to read from, so the only way a document arrives is a reader opening it; the
 * page does that with `FileReader` and hands the text here, exactly as `web/fit.ts` already does.
 *
 * Every failure names what was wrong in a sentence, because the reader of this error is somebody
 * holding a file another team produced and needing to know which end to fix.
 */

function asRecord(value: unknown, whose: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${whose} must be a block of named values, and it is not`);
  }
  return value as Record<string, unknown>;
}

function asFinite(value: unknown, whose: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${whose} must be a number, and it is ${JSON.stringify(value)}`);
  }
  return value;
}

function asText(value: unknown, whose: string): string {
  if (typeof value !== "string") {
    fail(`${whose} must be text, and it is ${JSON.stringify(value)}`);
  }
  return value;
}

function asFlag(value: unknown, whose: string): boolean {
  if (typeof value !== "boolean") {
    fail(`${whose} must be true or false, and it is ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * The roles, named in prose, deduplicated and joined into one clause an error can quote.
 *
 * Built from `ROLE_DESCRIPTIONS` rather than `RUN_ROLES` itself so the reader is never shown a
 * wire value — see the comment on that table in `schema.ts`. Two roles share a phrase there, and
 * this collapses the resulting duplicate rather than saying the same clause twice.
 */
function describeRoles(): string {
  const phrases: string[] = [];
  for (const role of RUN_ROLES) {
    const phrase = ROLE_DESCRIPTIONS[role];
    if (!phrases.includes(phrase)) {
      phrases.push(phrase);
    }
  }
  if (phrases.length === 1) {
    return phrases[0]!;
  }
  const last = phrases[phrases.length - 1]!;
  const allButLast = phrases.slice(0, phrases.length - 1);
  return `${allButLast.join(", ")}, or ${last}`;
}

/**
 * A run's own path lengths must agree with each other and with the scenario, or downstream code
 * finds out the hard way. Left unchecked, a 3-sample scenario carrying a 500-sample agent path
 * parses cleanly here and fails later as a `ContractError` from deep inside `makePairedRun`, with
 * a message about arrays it never occurred to the reader to connect back to this file. Checking
 * every path against `scenario.nSteps` catches both shapes of the mistake at once: two paths in
 * one run disagreeing with each other must also disagree with the scenario, since they cannot
 * both equal the same number and differ from one another.
 */
function checkPathLength(path: SuppliedPathRecord, whose: string, expectedNSteps: number): void {
  if (path.nSteps !== expectedNSteps) {
    fail(
      `${whose} runs for ${path.nSteps} samples, and the scenario says this room runs for ` +
        `${expectedNSteps} samples`,
    );
  }
}

function readPath(value: unknown, whose: string): SuppliedPathRecord {
  const holder = asRecord(value, whose);
  const raw = holder["positions"];
  if (!Array.isArray(raw)) {
    fail(`${whose} must carry a list of positions, and it does not`);
  }
  const list = raw as unknown[];
  if (list.length % 2 !== 0) {
    fail(
      `${whose} has ${list.length} position values, which do not divide into pairs of an ` +
        `across-the-room and an up-the-room figure`,
    );
  }
  const nSteps = list.length / 2;
  if (nSteps < 1) {
    fail(`${whose} has no positions in it, so there is no path there to measure`);
  }
  const positions = new Float64Array(list.length);
  for (let i = 0; i < list.length; i++) {
    positions[i] = asFinite(list[i], `position ${i} of ${whose}`);
  }
  return Object.freeze({ kind: "suppliedPathRecord" as const, positions, nSteps });
}

/**
 * `atSample` is a sample INDEX, not a tick — see the long comment on `Completion` in `schema.ts`
 * for why that distinction is load-bearing. This function only validates it is a whole, non-negative
 * number; converting it to a tick belongs to whichever later task assembles a paired run from this.
 */
function readCompletion(value: unknown, whose: string): Completion | null {
  if (value === null || value === undefined) {
    return null;
  }
  const holder = asRecord(value, `the finish of ${whose}`);
  const atSample = asFinite(holder["atSample"], `the finishing sample of ${whose}`);
  if (!Number.isInteger(atSample) || atSample < 0) {
    fail(`the finishing sample of ${whose} must be a whole sample number, and it is ${atSample}`);
  }
  return Object.freeze({
    kind: "completion" as const,
    outcome: asText(holder["outcome"], `the finishing state of ${whose}`),
    atSample,
  });
}

function readRun(value: unknown, index: number, expectedNSteps: number): RunRecord {
  const whose = `the run at position ${index}`;
  const holder = asRecord(value, whose);
  const runId = asText(holder["runId"], `the name of ${whose}`);

  const roleText = asText(holder["role"], `the part played by ${whose}`);
  let role: RunRole | null = null;
  for (const candidate of RUN_ROLES) {
    if (candidate === roleText) {
      role = candidate;
    }
  }
  if (role === null) {
    fail(
      `${whose} says it plays the part '${roleText}', which is not a part this bench knows; a ` +
        `run can be ${describeRoles()}`,
    );
  }

  const seed = asFinite(holder["seed"], `the seed of ${whose}`);
  if (!Number.isInteger(seed)) {
    fail(`the seed of ${whose} must be a whole number, and it is ${seed}`);
  }

  const robotPresent = asFlag(holder["robotPresent"], `whether a robot is in ${whose}`);
  const robotValue = holder["robot"];
  let robot: SuppliedPathRecord | null = null;
  if (robotValue !== null && robotValue !== undefined) {
    robot = readPath(robotValue, `the robot's path in ${whose}`);
  }
  if (robotPresent && robot === null) {
    fail(`${whose} says a robot is in it and carries no path for one`);
  }
  if (!robotPresent && robot !== null) {
    fail(`${whose} says no robot is in it and carries a path for one`);
  }
  if (robot !== null) {
    checkPathLength(robot, `the robot's path in ${whose}`, expectedNSteps);
  }

  const agentsValue = holder["agents"];
  if (!Array.isArray(agentsValue)) {
    fail(`${whose} must carry a list of the people in it, and it does not`);
  }
  const agentsList = agentsValue as unknown[];
  if (agentsList.length < 1) {
    fail(`${whose} holds nobody, and a run of nobody measures nothing`);
  }
  const agents: SuppliedAgent[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < agentsList.length; i++) {
    const agentHolder = asRecord(agentsList[i], `the person at position ${i} of ${whose}`);
    const id = asText(agentHolder["id"], `the name of the person at position ${i} of ${whose}`);
    if (seen.has(id)) {
      fail(`${whose} names the person '${id}' twice, so its names do not name one person each`);
    }
    seen.add(id);
    const path = readPath(agentHolder, `the path of the person '${id}' in ${whose}`);
    checkPathLength(path, `the path of the person '${id}' in ${whose}`, expectedNSteps);
    agents.push(
      Object.freeze({
        kind: "suppliedAgent" as const,
        id,
        path,
      }),
    );
  }

  return Object.freeze({
    kind: "runRecord" as const,
    runId,
    role,
    seed,
    robotPresent,
    completion: readCompletion(holder["completion"], whose),
    robot,
    agents: Object.freeze(agents),
  });
}

export function parseRunSet(text: string): RunSet {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("the run set could not be read: it is not a well-formed document");
  }

  const holder = asRecord(parsed, "a run set");
  const version = holder["mirnTrajectoryFormat"];
  if (version !== FORMAT_VERSION) {
    fail(
      `this bench reads run sets written to version ${FORMAT_VERSION} of the format, and this one ` +
        `says ${JSON.stringify(version)}`,
    );
  }

  const scenarioHolder = asRecord(holder["scenario"], "the scenario");
  const nSteps = asFinite(scenarioHolder["nSteps"], "the number of samples in the scenario");
  if (!Number.isInteger(nSteps) || nSteps < 2) {
    fail(`the scenario must run for at least two samples, and it says ${nSteps}`);
  }
  const dt = asFinite(scenarioHolder["dt"], "the time between samples");
  if (dt <= 0) {
    fail(`the time between samples must be above nought, and it is ${dt}`);
  }
  const scenario: Scenario = Object.freeze({
    kind: "scenario" as const,
    scenarioId: asText(scenarioHolder["scenarioId"], "the name of the scenario"),
    widthM: asFinite(scenarioHolder["widthM"], "the width of the room"),
    heightM: asFinite(scenarioHolder["heightM"], "the height of the room"),
    dt,
    nSteps,
  });

  const provenanceHolder = asRecord(holder["provenance"], "the record of who produced this");
  const provenance: Provenance = Object.freeze({
    kind: "provenance" as const,
    producer: asText(provenanceHolder["producer"], "the producer"),
    producerVersion: asText(provenanceHolder["producerVersion"], "the producer's version"),
    simulator: asText(provenanceHolder["simulator"], "the simulator"),
    crowdModel: asText(provenanceHolder["crowdModel"], "the crowd model"),
    build: asText(provenanceHolder["build"], "the build"),
  });

  const bodiesHolder = asRecord(holder["bodies"], "the body sizes");
  const bodies: SuppliedBodies = Object.freeze({
    kind: "suppliedBodies" as const,
    pedRadiusM: asFinite(bodiesHolder["pedestrianRadiusM"], "how wide a person is"),
    robotRadiusM: asFinite(bodiesHolder["robotRadiusM"], "how wide the robot is"),
  });

  const treatmentHolder = asRecord(holder["treatment"], "what the two runs differ by");
  const treatmentKind = asText(treatmentHolder["kind"], "what the two runs differ by");
  if (treatmentKind !== "robot-presence" && treatmentKind !== "none") {
    fail(
      `the two runs are said to differ by '${treatmentKind}', and a run set read in from ` +
        `elsewhere may differ by whether the robot is there, or by nothing at all`,
    );
  }

  const runsValue = holder["runs"];
  if (!Array.isArray(runsValue)) {
    fail("a run set must carry a list of runs, and it does not");
  }
  const runsList = runsValue as unknown[];
  if (runsList.length < 1) {
    fail("this run set holds no runs at all, so there is nothing in it to measure");
  }
  const runs: RunRecord[] = [];
  for (let i = 0; i < runsList.length; i++) {
    runs.push(readRun(runsList[i], i, nSteps));
  }

  return Object.freeze({
    kind: "runSet" as const,
    scenario,
    provenance,
    bodies,
    treatment: Object.freeze({ kind: treatmentKind }) as RunSet["treatment"],
    runs: Object.freeze(runs),
  });
}
