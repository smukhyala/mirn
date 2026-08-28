import "./app/console/boot.js";
import { ContractError } from "./engine/core/errors.js";
import { makeRecording, type Recording } from "./engine/fit/recording.js";
import type { FitResult } from "./engine/fit/search.js";
import { makeFitVerdict, renderFitVerdict } from "./app/console/fitVerdict.js";
import { makeFitClient, fitPortFor, spawnFitWorker } from "./app/worker/fit.client.js";

/**
 * The fit page: read a recording, fit the crowd to it, and never say a word about a robot.
 *
 * ## The seed is fixed and the settings are not read from a panel
 *
 * There is no settings panel here, deliberately. Fitting is a comparison between a recording and
 * the crowd, and letting a reader also move the room's shape, the episode length or the number of
 * people would give them several ways to change the answer that have nothing to do with their
 * recording — and no way to tell which one moved it. The two things they control are the file and
 * the frame rate it was annotated at.
 *
 * The seed is a constant for the same reason it is everywhere else: guardrail 4. The same recording
 * at the same frame rate gives the same fit on every reload, so a reader can quote it.
 *
 * ## Nothing survives a change of input
 *
 * A verdict on screen belongs to the file and the frame rate that produced it. Change either and it
 * comes down before anything else happens, because a fit measured at one frame rate sitting under a
 * different one on the page is a number describing a comparison nobody ran — which is the same
 * fault the method card refuses when its room count changes.
 *
 * ## The file never leaves the browser
 *
 * `FileReader` reads it, `makeRecording` parses it, and the parsed form carries no identifiers. It
 * is not stored, not put in the link, and there is nowhere to send it: guardrail 10 leaves this
 * origin with no server at all, and `nostorage.test.ts` sweeps this file like every other.
 */

/** Fixed, so the same recording fits the same way on every reload. Guardrail 4. */
const FIT_SEED = 20260828;

function el<T extends HTMLElement>(doc: Document, id: string): T {
  const found = doc.getElementById(id);
  if (found === null) {
    throw new Error(`the fit page is missing #${id}`);
  }
  return found as T;
}

function clear(host: HTMLElement): void {
  while (host.firstChild !== null) {
    host.removeChild(host.firstChild);
  }
}

function bootFitPage(doc: Document): void {
  const fileInput = el<HTMLInputElement>(doc, "recording-file");
  const fpsInput = el<HTMLInputElement>(doc, "frames-per-second");
  const runButton = el<HTMLButtonElement>(doc, "fit-run");
  const status = el<HTMLParagraphElement>(doc, "fit-status");
  const result = el<HTMLElement>(doc, "fit-result");
  const host = el<HTMLDivElement>(doc, "fit-verdict");

  let text: string | null = null;
  let running = false;
  let client: ReturnType<typeof makeFitClient> | null = null;

  const takeDown = (): void => {
    result.hidden = true;
    clear(host);
  };

  const refreshButton = (): void => {
    runButton.disabled = running || text === null;
  };

  const finish = (keepStatus: boolean): void => {
    running = false;
    if (!keepStatus) {
      status.textContent = "";
    }
    refreshButton();
  };

  /** Both inputs invalidate a verdict on screen, and both do it before anything else happens. */
  const inputChanged = (): void => {
    takeDown();
    status.textContent = "";
    refreshButton();
  };

  fileInput.addEventListener("change", () => {
    text = null;
    inputChanged();
    const file = fileInput.files?.[0];
    if (file === undefined) {
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const read = reader.result;
      text = typeof read === "string" ? read : null;
      refreshButton();
    });
    reader.addEventListener("error", () => {
      // The browser's own failure, said out loud. A page about measurement honesty does not
      // swallow the one line explaining why nothing happened.
      status.textContent = "The browser could not read that file, and did not say why.";
      text = null;
      refreshButton();
    });
    reader.readAsText(file);
  });

  fpsInput.addEventListener("input", inputChanged);

  runButton.addEventListener("click", () => {
    if (running || text === null) {
      return;
    }

    const framesPerSecond = Number(fpsInput.value);
    let recording: Recording;
    try {
      recording = makeRecording(text, framesPerSecond);
    } catch (error) {
      // The contract's own sentence, unchanged. It names the line and says what was wrong with it,
      // which is the only useful thing a reader debugging their own file can be given.
      status.textContent =
        error instanceof ContractError || error instanceof Error
          ? `That file could not be read as a recording: ${error.message}`
          : "That file could not be read as a recording.";
      takeDown();
      return;
    }

    running = true;
    refreshButton();
    takeDown();

    if (client === null) {
      client = makeFitClient(fitPortFor(spawnFitWorker()), {
        onProgress: (_done: number, _total: number, phase: string): void => {
          status.textContent = phase;
        },
        onFitted: (fitted: FitResult): void => {
          clear(host);
          host.appendChild(renderFitVerdict(doc, makeFitVerdict(fitted)));
          result.hidden = false;
          finish(false);
        },
        onFailed: (message: string): void => {
          status.textContent = `The fit stopped: ${message}`;
          finish(true);
        },
      });
    }
    client.start(recording, {}, FIT_SEED);
  });

  refreshButton();
}

bootFitPage(document);
