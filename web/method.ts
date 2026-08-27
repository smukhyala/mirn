// Tokens are injected rather than duplicated in a generated stylesheet — see boot.ts — so the
// palette has exactly one definition and this page's CSS and canvas cannot drift apart. Imported
// for its side effect: the module mounts the tokens on import.
import "./app/console/boot.js";
import { ContractError } from "./engine/core/errors.js";
import { FAMILIES, FAMILY_ORDER, type FamilyKey } from "./engine/job/families.js";
import {
  ROOM_COUNTS,
  makeFamilyProbeSettings,
  probeSeedsFor,
  type FamilyProbe,
  type FamilyProbeSettings,
} from "./engine/job/familyProbe.js";
import {
  EMPTY_DRAFT,
  QUESTIONS,
  QUESTION_ORDER,
  makeMethodAnswers,
  resolveFamily,
  unanswered,
  type MethodDraft,
  type OptionKey,
  type QuestionKey,
} from "./engine/job/questions.js";
import { makeComparison, renderComparison, type Comparison } from "./app/console/comparison.js";
import {
  comparisonCsv,
  familyProbeCsv,
  suppliedProbeCsv,
} from "./app/console/methodCsv.js";
import { downloadCsv } from "./app/console/table.js";
import { makeMethodVerdict, renderMethodVerdict } from "./app/console/method.js";
import { decodeMethod, encodeMethod } from "./app/console/permalink.js";
import { makeProbeClient, probePortFor, spawnProbeWorker } from "./app/worker/probe.client.js";

/**
 * The method card: five closed questions, one button, and what a method of that shape reads on a
 * world whose true effect is exactly nothing.
 *
 * ## Why nothing of the reader's is read in, and why that costs nothing
 *
 * Guardrail 11 forbids a bring-your-own-method import path, and this page does not have one. What
 * the reader supplies is a DESCRIPTION, in five multiple-choice answers, and the closed table in
 * `web/engine/job/questions.ts` maps that description onto one of four families this bench already
 * implements. MIRN then runs its own estimator on its own worlds and reports its own numbers. No
 * file is uploaded, no function is evaluated, no dataset is loaded, and there is no leaderboard.
 * The thing that leaves this page is a claim about a shape of measurement — "a forecast-based
 * counterfactual reads a third of a metre where the answer is exactly nothing" — which survives
 * leaving the site in the one way this simulator's answers can.
 *
 * ## The verdict measures one family; the comparison measures every one, and they are separate
 *
 * A run of the questionnaire probes the family the answers land in and never another, because a
 * verdict about one described method has no use for three other rulers' numbers. What used to
 * follow from that — that the whole catalogue must never be probed at all — was guardrail 11's
 * refusal of a comparison, and that refusal was lifted by owner's decision on 2026-08-27.
 *
 * So there is a third region, and it is a REGION and not a branch of this one. It measures every
 * ruler this bench can run, one after another, and renders into a host of its own. A verdict and a
 * comparison on screen at once under one heading would invite a reading neither supports: the
 * verdict says what a method of the reader's shape reads, and the table says which shape of ruler
 * this invented crowd confounded. Guardrail 2 is unamended and is what refuses in the table, which
 * is why the refusal is rendered above it rather than under it.
 *
 * ## Why it runs in a worker
 *
 * The probe is eight rooms, each with a paired run and a line of replicate runs behind it: about
 * three seconds at the shipped settings on the machine this was written on, and longer on a phone.
 * Three seconds of a frozen tab is three seconds in which a reader concludes the button did
 * nothing. So it runs off the main thread and reports which room it is on, at the shipped
 * settings rather than at cheaper ones — a run-to-run line drawn from fewer than eight replicate
 * runs visibly jitters (see the note in `web/engine/measure/null/band.ts`), and a jittering line is
 * the thing every count on this page is measured against.
 */

/** The room every family is probed on: the console's own defaults, with the crowd told to ignore
 *  the robot. The switch that makes the truth exactly zero is not this page's to choose — it lives
 *  inside the probe and is applied whatever base is handed in. */
/**
 * How many rooms every route on this page runs, and the one place it is decided.
 *
 * It was a module constant of eight until a reader could choose. It is a mutable module value now
 * rather than a parameter threaded through three routes, because all three MUST run the same count:
 * a comparison whose rows were measured on different numbers of rooms is a comparison of numbers
 * that are not comparable, and `makeComparison` refuses one — loudly, which is the right failure,
 * but the page should never build one to be refused.
 *
 * Read through `settingsNow()` at the moment a button is pressed, never captured at boot, so a run
 * uses the count that was on screen when the reader asked for it.
 */
let roomCount = ROOM_COUNTS[0] as number;

function settingsNow(): FamilyProbeSettings {
  return makeFamilyProbeSettings({ seeds: probeSeedsFor(roomCount) });
}

function el<T extends HTMLElement>(doc: Document, id: string): T {
  const node = doc.getElementById(id);
  if (node === null) {
    throw new Error(`missing element #${id}`);
  }
  return node as T;
}

function clear(host: HTMLElement): void {
  while (host.firstChild !== null) {
    host.removeChild(host.firstChild);
  }
}

function element(doc: Document, tag: string, className: string, content: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  if (content.length > 0) {
    node.textContent = content;
  }
  return node;
}

/**
 * Counting words, so no sentence on this page carries a digit for something the catalogue decides.
 *
 * The status line reads "three questions still to answer", and three is the length of what
 * `unanswered` returned rather than a number typed into a sentence — a sixth question would
 * otherwise leave the one line the reader is following quietly asserting a count that had stopped
 * being true.
 */
const COUNT_WORDS: readonly string[] = Object.freeze([
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
]);

function countWord(count: number): string {
  const word = COUNT_WORDS[count];
  if (word === undefined) {
    return String(count);
  }
  return word;
}

/** "question" or "questions", so the status line is English at every count. */
function questionWord(count: number): string {
  if (count === 1) {
    return "question";
  }
  return "questions";
}

/**
 * What the reader is told about their own progress through the questionnaire.
 *
 * Exported because it is the one sentence on the page that is neither a catalogue string nor a
 * measurement, and every count in it comes from the table rather than from a literal.
 */
export function progressSentence(draft: MethodDraft): string {
  const missing = unanswered(draft);
  if (missing.length === 0) {
    return "All answered. Press the button and this bench will measure a method of that shape.";
  }
  return (
    `${countWord(missing.length)} ${questionWord(missing.length)} still to answer. ` +
    `All of them are carried in the link; two of them decide which family is measured, and the ` +
    `verdict says which.`
  );
}

/** The questionnaire, painted from the closed table and never from a copy of it in the markup. */
function paintQuestions(
  doc: Document,
  host: HTMLElement,
  draft: MethodDraft,
  onChoose: (question: QuestionKey, option: OptionKey) => void,
): void {
  clear(host);
  let ordinal = 0;
  for (const key of QUESTION_ORDER) {
    const question = QUESTIONS[key];
    ordinal = ordinal + 1;
    const block = doc.createElement("fieldset");
    block.className = "method-question";
    block.setAttribute("data-question", key);

    const legend = doc.createElement("legend");
    legend.className = "method-prompt";
    // The ordinal is a position in the closed table, not a measurement, and it is written into its
    // own element so the page's digit scan can tell the two apart.
    legend.appendChild(element(doc, "span", "method-ordinal", String(ordinal)));
    legend.appendChild(element(doc, "span", "method-prompt-text", question.prompt));
    block.appendChild(legend);

    for (const option of question.options) {
      const label = doc.createElement("label");
      label.className = "method-answer";
      const input = doc.createElement("input");
      input.type = "radio";
      input.name = question.queryKey;
      input.value = option.key;
      input.checked = draft[key] === option.key;
      input.addEventListener("change", () => {
        onChoose(key, option.key);
      });
      label.appendChild(input);
      label.appendChild(element(doc, "span", "method-answer-text", option.label));
      block.appendChild(label);
    }
    host.appendChild(block);
  }
}

import {
  makeSuppliedClient,
  makeSuppliedLimit,
  spawnSuppliedWorker,
  suppliedPortFor,
  suppliedTimeoutPhrase,
  wallClockAlarm,
} from "./app/worker/supplied.client.js";
import { makeSuppliedVerdict, renderSuppliedVerdict } from "./app/console/suppliedVerdict.js";
import type { SuppliedProbe } from "./engine/job/suppliedProbe.js";

/**
 * How long a supplied method gets before this page stops waiting for it.
 *
 * Eight rooms, each simulated and then measured twice, is seconds of honest work; a minute is
 * generous for that and short enough that a reader whose loop never terminates finds out rather
 * than watching a page that looks busy forever. The limit covers the WHOLE measurement rather than
 * one room, because a method that is slow on every room is as unusable as one that hangs on the
 * first, and a per-room clock would never notice the difference.
 */
const SUPPLIED_LIMIT_PER_ROOM_MS = 12000;

/**
 * The limit scales with the rooms asked for, and this was a bug before it did.
 *
 * It was a flat sixty seconds, chosen when eight rooms was the only count there was. The room-count
 * control then made thirty-two rooms reachable — four times the simulation, each room run twice —
 * and a flat limit would have terminated an entirely honest method partway through and reported it
 * as one that never returned. A reader would have been told their metric hung when what actually
 * happened is that this page stopped waiting.
 *
 * The limit exists to catch a method that will never finish, not to cap work a reader deliberately
 * asked for, so it is priced per room. Generous per room on purpose: a slow-but-terminating method
 * should be reported with its numbers, and only a genuinely non-terminating one should hit this.
 */
function suppliedLimitMs(settings: FamilyProbeSettings): number {
  return SUPPLIED_LIMIT_PER_ROOM_MS * settings.seeds.length;
}

export function bootMethodCard(doc: Document): void {
  const questionHost = el<HTMLDivElement>(doc, "question-list");
  const noticeHost = el<HTMLDivElement>(doc, "link-notices");
  const runButton = el<HTMLButtonElement>(doc, "run");
  const copyButton = el<HTMLButtonElement>(doc, "copy-link");
  const status = el<HTMLParagraphElement>(doc, "status");
  const result = el<HTMLElement>(doc, "result");
  const verdictHost = el<HTMLDivElement>(doc, "verdict");
  const comparisonResult = el<HTMLElement>(doc, "comparison-result");
  const comparisonHost = el<HTMLDivElement>(doc, "comparison-verdict");

  /**
   * The reader's own row, if they have run their own metric on this visit.
   *
   * Held here rather than measured by the comparison: the supplied form has already run it, at the
   * same settings, and running it a second time would cost a minute to reproduce a number that is
   * already in hand. It is never required — the described rulers are the table on their own — and
   * it is dropped the moment the text it came from is edited, because a row labelled as the
   * reader's own must be the method the reader can currently see.
   */
  let supplied: SuppliedProbe | null = null;

  /**
   * The reading half of this page's permalink, read before the questionnaire is painted.
   *
   * Wiring only the writing half would be the write-only link guardrail 10 calls worse than no
   * link at all: it would look like it worked and lose its payload in silence. An answer this
   * bench does not offer is said above the questions in plain English rather than dropped quietly.
   */
  const link = decodeMethod(window.location.search);
  let draft: MethodDraft = { ...EMPTY_DRAFT, ...link.draft };
  let running = false;

  const paintStatus = (): void => {
    status.textContent = progressSentence(draft);
  };

  const refreshButton = (): void => {
    runButton.disabled = running || unanswered(draft).length > 0;
  };

  const refresh = (): void => {
    refreshButton();
    paintStatus();
  };

  const choose = (question: QuestionKey, option: OptionKey): void => {
    draft = { ...draft, [question]: option };
    // The verdict on screen belongs to the answers that produced it. Leaving it up while the
    // reader changes an answer would put a family's numbers under a description that no longer
    // selects that family, which is the one way this page could lie without printing a wrong
    // number anywhere.
    result.hidden = true;
    clear(verdictHost);
    refresh();
  };

  /**
   * Spawned lazily, on the first press, not at boot: a reader who is still reading the questions
   * should not be paying for a worker thread, and a page that spawned one before it needed it
   * would fail on a browser with workers disabled before showing them anything at all.
   */
  let client: ReturnType<typeof makeProbeClient> | null = null;

  /**
   * What is on screen, and what produced it, so the file the reader downloads is the thing they are
   * looking at rather than whatever a fresh call would compute now.
   *
   * Held as a pair. A probe alone would not be enough: the settings carry the room count, the
   * replicate count and the seeds, and a file that records its own inputs can be reproduced while
   * one that does not is a number with a story attached.
   */
  let onScreen:
    | { readonly kind: "described"; readonly probe: FamilyProbe; readonly ranAt: FamilyProbeSettings }
    | { readonly kind: "supplied"; readonly probe: SuppliedProbe; readonly ranAt: FamilyProbeSettings }
    | null = null;

  const show = (
    probe: FamilyProbe,
    resolutionSource: MethodDraft,
    ranAt: FamilyProbeSettings,
  ): void => {
    onScreen = { kind: "described", probe, ranAt };
    const resolution = resolveFamily(makeMethodAnswers(resolutionSource));
    const verdict = makeMethodVerdict({ resolution, probe, settings: ranAt });
    clear(verdictHost);
    verdictHost.appendChild(renderMethodVerdict(doc, verdict));
    result.hidden = false;
  };

  runButton.addEventListener("click", () => {
    if (running) {
      return;
    }
    const answers = makeMethodAnswers(draft);
    const resolution = resolveFamily(answers);
    // The answers that started this run, held so the verdict is built from them and not from
    // whatever is on screen when it comes back. Nothing on this page can change them mid-run —
    // the questionnaire is switched off below — and holding them is what makes that true rather
    // than merely likely.
    const asked: MethodDraft = { ...draft };
    // The settings this run is about to use, held for the same reason the answers are: the room
    // count is a live control, and a verdict built from whatever is on screen when the numbers come
    // back would print one denominator over a measurement taken at another.
    const askedSettings: FamilyProbeSettings = settingsNow();

    running = true;
    runButton.disabled = true;
    for (const input of doc.querySelectorAll<HTMLInputElement>(".method-question input")) {
      input.disabled = true;
    }
    result.hidden = true;
    clear(verdictHost);
    status.textContent =
      `Measuring “${FAMILIES[resolution.family].name.toLowerCase()}” on rooms where the robot ` +
      `changes nothing.`;

    /**
     * Gives the questionnaire back, and leaves the status line alone if it is carrying a reason.
     *
     * `keepStatus` exists because the first version of this repainted the progress sentence
     * unconditionally, which wiped the worker's own failure message a few microseconds after
     * writing it — the reader would have seen the run stop and be told nothing at all. A page
     * whose subject is measurement honesty must not swallow the one line saying what went wrong.
     */
    const finish = (keepStatus: boolean): void => {
      running = false;
      for (const input of doc.querySelectorAll<HTMLInputElement>(".method-question input")) {
        input.disabled = false;
      }
      if (keepStatus) {
        refreshButton();
        return;
      }
      refresh();
    };

    if (client === null) {
      client = makeProbeClient(probePortFor(spawnProbeWorker()), {
        onProgress: (seedsDone: number, seedsTotal: number, phase: string): void => {
          clear(status);
          status.appendChild(element(doc, "span", "status-count", String(seedsDone)));
          status.appendChild(element(doc, "span", "status-of", " of "));
          status.appendChild(element(doc, "span", "status-count", String(seedsTotal)));
          status.appendChild(element(doc, "span", "status-phase", ` rooms done — ${phase}`));
        },
        onProbed: (probe: FamilyProbe): void => {
          show(probe, asked, askedSettings);
          finish(false);
        },
        onFailed: (message: string): void => {
          clear(status);
          status.textContent = `The measurement stopped: ${message}`;
          finish(true);
        },
      });
    }
    client.start(resolution.family, askedSettings);
  });

  copyButton.addEventListener("click", () => {
    // The "?" is added here, once, at the only place a whole address is assembled — `encodeMethod`
    // returns the bare pairs, the same way `encodeSettings` and `encodeDrill` do.
    const query = `?${encodeMethod(draft)}`;
    window.history.replaceState(null, "", query);
    const clipboard = window.navigator.clipboard;
    if (clipboard !== undefined) {
      void clipboard.writeText(`${window.location.origin}${window.location.pathname}${query}`);
    }
  });

  // Said once, at boot, above the questions. There is nothing later that could make a link's own
  // mistake go away, and nothing on the page rewrites it.
  if (link.notices.length > 0) {
    noticeHost.hidden = false;
    for (const notice of link.notices) {
      noticeHost.appendChild(element(doc, "p", "region-note", notice));
    }
  }

  const comparison = bootComparison(
    doc,
    { result: comparisonResult, host: comparisonHost },
    (): SuppliedProbe | null => supplied,
  );

  /**
   * The file is built from what produced the numbers on screen, never from a fresh call.
   *
   * A download that recomputed would hand the reader a file that disagreed with the page whenever
   * anything had changed since the run — which is the same defect as a permalink carrying a result,
   * and guardrail 10 refuses that one for the same reason.
   */
  el<HTMLButtonElement>(doc, "verdict-download").addEventListener("click", () => {
    const current = onScreen;
    if (current === null) {
      return;
    }
    const text =
      current.kind === "described"
        ? familyProbeCsv(current.probe, current.ranAt)
        : suppliedProbeCsv(current.probe, current.ranAt);
    downloadCsv(doc, "mirn-method.csv", text);
  });

  el<HTMLButtonElement>(doc, "comparison-download").addEventListener("click", () => {
    const built = comparison.onScreen();
    if (built === null) {
      return;
    }
    downloadCsv(doc, "mirn-comparison.csv", comparisonCsv(built.comparison, built.ranAt));
  });

  bootRoomCount(doc, () => {
    // Every number on the page was measured at the old count, so all three routes come down
    // together. Leaving a verdict up beside a changed denominator would put one measurement's
    // numbers under another measurement's description, which is the one way this page could
    // mislead without printing a wrong figure anywhere.
    result.hidden = true;
    clear(verdictHost);
    onScreen = null;
    comparison.takeDown();
    // The reader's own row is dropped too, and this is the subtle one. It was measured at the old
    // count, so offering it to a comparison run at the new one would put a row of a different
    // denominator beside the rest — `makeComparison` refuses exactly that, and the page should not
    // hand it one to refuse.
    supplied = null;
  });

  bootSuppliedForm(doc, {
    result,
    verdictHost,
    onProbed: (probe: SuppliedProbe, ranAt: FamilyProbeSettings): void => {
      supplied = probe;
      onScreen = { kind: "supplied", probe, ranAt };
      // A table built before this row existed, or around an older version of it, is a table whose
      // rows were not all measured on this visit's method. It comes down rather than staying up.
      comparison.takeDown();
    },
    onEdited: (): void => {
      supplied = null;
      comparison.takeDown();
    },
  });

  paintQuestions(doc, questionHost, draft, choose);
  refresh();
}

/**
 * The room count, and the one control that decides it for all three routes.
 *
 * Painted from `ROOM_COUNTS` rather than from options written into the markup, for the reason the
 * questionnaire is painted from its own table: a hand-written copy of a closed table is a second
 * catalogue that nothing checks against the first.
 *
 * No option is marked recommended, adequate or sufficient. The page offers counts and says what a
 * larger one buys — a narrower range on its OWN number — and refuses to say anything about how many
 * observations a reader's own experiment would need.
 */
function bootRoomCount(doc: Document, onChanged: () => void): void {
  const picker = el<HTMLSelectElement>(doc, "room-count");
  clear(picker);
  for (const count of ROOM_COUNTS) {
    const option = doc.createElement("option");
    option.value = String(count);
    option.textContent = `${String(count)} rooms`;
    picker.appendChild(option);
  }
  picker.value = String(roomCount);

  picker.addEventListener("change", () => {
    const chosen = Number(picker.value);
    let offered = false;
    for (const count of ROOM_COUNTS) {
      if (count === chosen) {
        offered = true;
      }
    }
    if (!offered) {
      // The picker is painted from the table, so this cannot happen from the page. It can happen
      // from a console, and a count nobody offered would give every denominator on the page a
      // provenance no reader could account for.
      picker.value = String(roomCount);
      return;
    }
    roomCount = chosen;
    onChanged();
  });
}

/**
 * The second route: a metric handed over rather than described.
 *
 * It shares the verdict region with the questionnaire and nothing else. Two routes writing into
 * one host means whichever ran last is what is on screen, which is the honest arrangement — a page
 * showing two verdicts at once would invite a comparison between a described method and a supplied
 * one that neither number supports.
 *
 * Nothing typed here reaches the address bar. There is no copy-link control in this form and no
 * call to `replaceState` in this function, because guardrail 10 now says a link may name a
 * built-in method and may never carry a function body.
 */
function bootSuppliedForm(
  doc: Document,
  hosts: {
    readonly result: HTMLElement;
    readonly verdictHost: HTMLDivElement;
    /** A measurement of the reader's own metric, offered to the comparison as their row. */
    readonly onProbed: (probe: SuppliedProbe, ranAt: FamilyProbeSettings) => void;
    /** The text changed, so any row built from the old text has stopped describing it. */
    readonly onEdited: () => void;
  },
): void {
  const source = el<HTMLTextAreaElement>(doc, "supplied-source");
  const runButton = el<HTMLButtonElement>(doc, "supplied-run");
  const status = el<HTMLParagraphElement>(doc, "supplied-status");

  let running = false;

  const refreshButton = (): void => {
    runButton.disabled = running || source.value.trim().length === 0;
  };

  source.addEventListener("input", () => {
    // A verdict belongs to the text that produced it, exactly as the questionnaire's belongs to
    // the answers that produced it. Leaving it up while the method is edited would put one
    // metric's numbers under another metric's definition.
    hosts.result.hidden = true;
    clear(hosts.verdictHost);
    hosts.onEdited();
    refreshButton();
  });

  /** Spawned on the first press, for the reason the questionnaire's worker is. */
  let client: ReturnType<typeof makeSuppliedClient> | null = null;
  /** The allowance the live client was built with, so a changed one forces a rebuild. */
  let builtForMs = 0;
  /** Stops the worker behind the live client and forgets it. */
  let stopClient = (): void => {
    client = null;
  };

  const finish = (keepStatus: boolean): void => {
    running = false;
    source.disabled = false;
    if (!keepStatus) {
      clear(status);
    }
    refreshButton();
  };

  runButton.addEventListener("click", () => {
    if (running) {
      return;
    }
    running = true;
    // Held at the press, for the reason the questionnaire holds its answers: the room
    // count can change while a measurement is in flight, and a verdict must print the
    // denominator its own numbers were taken at.
    const ranAt: FamilyProbeSettings = settingsNow();
    runButton.disabled = true;
    source.disabled = true;
    hosts.result.hidden = true;
    clear(hosts.verdictHost);
    status.textContent = "Measuring your metric on rooms where the robot changes nothing.";

    /**
     * A fresh worker per press.
     *
     * The client latches shut after a timeout because it terminated the thread it would post
     * into, so a second press has to build a new one. Reusing a latched client would leave the
     * page pressing a button that could never answer.
     */
    // A client carries its limit from the moment it is built, so one built for eight rooms is
    // still enforcing an eight-room limit when the reader asks for thirty-two. Reusing it would
    // terminate four times the work under a quarter of the allowance and report an honest metric
    // as one that never returned — which is the bug the per-room limit above was meant to fix and
    // only half fixed. Rebuilt whenever the allowance changes, and the old worker is stopped
    // rather than left running.
    const wanted = suppliedLimitMs(ranAt);
    if (client !== null && builtForMs !== wanted) {
      stopClient();
    }
    if (client === null || client.isStopped()) {
      const worker = spawnSuppliedWorker();
      client = makeSuppliedClient(
        suppliedPortFor(worker),
        {
          onProgress: (seedsDone: number, seedsTotal: number, phase: string): void => {
            clear(status);
            status.appendChild(element(doc, "span", "status-count", String(seedsDone)));
            status.appendChild(element(doc, "span", "status-of", " of "));
            status.appendChild(element(doc, "span", "status-count", String(seedsTotal)));
            status.appendChild(element(doc, "span", "status-phase", ` rooms done — ${phase}`));
          },
          onDone: (probe: SuppliedProbe): void => {
            const verdict = makeSuppliedVerdict({ probe, settings: ranAt });
            clear(hosts.verdictHost);
            hosts.verdictHost.appendChild(renderSuppliedVerdict(doc, verdict));
            hosts.result.hidden = false;
            // Offered to the comparison as the reader's own row. It was measured at the settings
            // the described rulers are measured at, which is what makes it admissible there.
            hosts.onProbed(probe, ranAt);
            finish(false);
          },
          onFailed: (message: string): void => {
            // The method's own words, kept. A substituted apology would throw away the one
            // sentence a reader debugging their own metric can act on.
            clear(status);
            status.textContent = `The measurement stopped: ${message}`;
            finish(true);
          },
        },
        makeSuppliedLimit({
          limitMs: wanted,
          terminate: (): void => {
            worker.terminate();
          },
          setAlarm: wallClockAlarm,
        }),
      );
      builtForMs = wanted;
      stopClient = (): void => {
        worker.terminate();
        client = null;
      };
    }
    client.start(source.value, ranAt);
  });

  refreshButton();
}

/** What the comparison hands back to the page that booted it. */
interface ComparisonRegion {
  /** Take the table down, because something it was built from has stopped being true. */
  readonly takeDown: () => void;
  /**
   * The table currently on screen and the settings that produced it, or nothing.
   *
   * Returned rather than recomputed so a download is the thing the reader is looking at. A file
   * that disagreed with the page whenever something had changed since the run would be the same
   * defect guardrail 10 refuses in a permalink carrying a result.
   */
  readonly onScreen: () => { readonly comparison: Comparison; readonly ranAt: FamilyProbeSettings } | null;
}

/**
 * The third region: every ruler this bench can run, on the same rooms, in one table.
 *
 * ## One family at a time, on purpose
 *
 * `makeProbeClient` measures ONE family per press and refuses a second while the first is running,
 * for the reason written in its own file: two answers landing in one verdict is two sets of numbers
 * with no way to tell which is on screen. So the described rulers are measured in sequence — the
 * next is asked for from inside the answer to the last — rather than by four workers at once. A
 * family is about a third of a second in a browser, so the whole table is a few seconds, and four
 * threads racing for the same table would buy those seconds at the price of the one guarantee that
 * makes the counts comparable.
 *
 * The reader is told which ruler is being measured and how far along the four it is, because a
 * button that goes quiet for several seconds is a button a reader decides did nothing. Every digit
 * in that line renders into its own element, so no count is ever written into a sentence.
 *
 * ## Every row at the same settings, and it is refused rather than reconciled
 *
 * The settings are read once per press and passed to every family, so all rows share a room count.
 * That is not a convention this file gets to bend: `makeComparison` compares each measurement's
 * rooms against the settings' own seeds and each row's drift line against its neighbours', and
 * refuses the table if either disagrees. A row measured elsewhere therefore stops the comparison
 * with a sentence rather than joining it and quietly making the last column a count of two things.
 * That refusal is caught here and shown in the status line, in its own words.
 *
 * ## What makes the table stale, and what does not
 *
 * The table comes down when one of the things it was built from stops being true: a fresh press of
 * this button, a new measurement of the reader's own metric, or an edit to the text that metric was
 * written in — a row labelled as the reader's own must be the method the reader can currently see.
 * A questionnaire answer changing is NOT one of those, and taking the table down for it would be a
 * page implying a link that is not there: the rows are the whole closed catalogue and the reader's
 * own, and no answer to those five questions can add a row, remove one or move one.
 */
function bootComparison(
  doc: Document,
  hosts: { readonly result: HTMLElement; readonly host: HTMLDivElement },
  suppliedNow: () => SuppliedProbe | null,
): ComparisonRegion {
  const runButton = el<HTMLButtonElement>(doc, "comparison-run");
  const status = el<HTMLParagraphElement>(doc, "comparison-status");

  let running = false;
  let atFamily = 0;
  const measured = new Map<FamilyKey, FamilyProbe>();

  const takeDown = (): void => {
    hosts.result.hidden = true;
    clear(hosts.host);
    onScreen = null;
  };

  /**
   * Which ruler is being measured, how many of how many, and how far into its rooms it is.
   *
   * `roomsTotal` is nought until the worker has said how many rooms it is running, and the room
   * half of the sentence is left off until then rather than printed as a count of nothing.
   */
  const paintStatus = (roomsDone: number, roomsTotal: number, phase: string): void => {
    const key = FAMILY_ORDER[atFamily];
    if (key === undefined) {
      return;
    }
    clear(status);
    status.appendChild(element(doc, "span", "status-count", String(atFamily + 1)));
    status.appendChild(element(doc, "span", "status-of", " of "));
    status.appendChild(element(doc, "span", "status-count", String(FAMILY_ORDER.length)));
    status.appendChild(
      element(doc, "span", "status-phase", ` rulers — measuring “${FAMILIES[key].name.toLowerCase()}”`),
    );
    if (roomsTotal > 0) {
      status.appendChild(element(doc, "span", "status-of", " — "));
      status.appendChild(element(doc, "span", "status-count", String(roomsDone)));
      status.appendChild(element(doc, "span", "status-of", " of "));
      status.appendChild(element(doc, "span", "status-count", String(roomsTotal)));
      status.appendChild(element(doc, "span", "status-phase", ` rooms done — ${phase}`));
    }
  };

  const finish = (keepStatus: boolean): void => {
    running = false;
    runButton.disabled = false;
    if (!keepStatus) {
      clear(status);
    }
  };

  /** Spawned on the first press, for the reason the other two routes' workers are. */
  let client: ReturnType<typeof makeProbeClient> | null = null;

  /**
   * The settings every ruler in one comparison is measured at, fixed for the whole run.
   *
   * This matters more here than on the other two routes. A comparison walks four rulers one after
   * another, so a reader who changed the room count halfway would otherwise get a table whose rows
   * were measured on different numbers of rooms — which is a table of numbers that cannot be set
   * beside each other. `makeComparison` refuses one, loudly and correctly, but the page should not
   * be building a thing to be refused. Fixed at the press, and every ruler gets this one.
   */
  let ranAt: FamilyProbeSettings = settingsNow();

  const startNext = (): void => {
    const key = FAMILY_ORDER[atFamily];
    const active = client;
    if (key === undefined || active === null) {
      return;
    }
    paintStatus(0, 0, "");
    active.start(key, ranAt);
  };

  /** The table on screen and what produced it, for the download. Cleared by `takeDown`. */
  let onScreen: { readonly comparison: Comparison; readonly ranAt: FamilyProbeSettings } | null =
    null;

  const show = (): void => {
    let built: Comparison;
    try {
      built = makeComparison({
        families: measured,
        // The reader's own row when there is one, and nothing when there is not. A comparison of
        // the described rulers alone is a whole table; a missing row of theirs is not a gap in it.
        supplied: suppliedNow(),
        settings: ranAt,
      });
    } catch (error) {
      // The refusals are the point of `makeComparison`, so they are shown rather than swallowed —
      // in its own sentence, the way the worker's failures are kept in the worker's own words.
      clear(status);
      const said = error instanceof ContractError ? error.message : String(error);
      status.textContent = `The comparison was not built: ${said}`;
      finish(true);
      return;
    }
    clear(hosts.host);
    hosts.host.appendChild(renderComparison(doc, built));
    onScreen = { comparison: built, ranAt };
    hosts.result.hidden = false;
    finish(false);
  };

  runButton.addEventListener("click", () => {
    if (running) {
      return;
    }
    running = true;
    runButton.disabled = true;
    // Read once, here, and used for all four rulers. Initialising it at boot alone would have
    // measured every comparison at whatever count the page opened with, however many times the
    // reader changed it — a control that looked live and was not.
    ranAt = settingsNow();
    // The table on screen belongs to the measurements that produced it. It comes down before the
    // first ruler is asked for, so nothing older is left up beside a run in progress.
    takeDown();
    measured.clear();
    atFamily = 0;

    if (client === null) {
      client = makeProbeClient(probePortFor(spawnProbeWorker()), {
        onProgress: (seedsDone: number, seedsTotal: number, phase: string): void => {
          paintStatus(seedsDone, seedsTotal, phase);
        },
        onProbed: (probe: FamilyProbe): void => {
          const key = FAMILY_ORDER[atFamily];
          if (key === undefined) {
            return;
          }
          measured.set(key, probe);
          atFamily = atFamily + 1;
          if (atFamily < FAMILY_ORDER.length) {
            // The client has already put itself down before calling this, so the next family can
            // be asked for from here without tripping its one-at-a-time refusal.
            startNext();
            return;
          }
          show();
        },
        onFailed: (message: string): void => {
          clear(status);
          status.textContent = `The measurement stopped: ${message}`;
          finish(true);
        },
      });
    }
    startNext();
  });

  return Object.freeze({
    takeDown,
    onScreen: (): { readonly comparison: Comparison; readonly ranAt: FamilyProbeSettings } | null =>
      onScreen,
  });
}

bootMethodCard(document);
