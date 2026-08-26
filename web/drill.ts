// Tokens are injected rather than duplicated in a generated stylesheet — see boot.ts — so the
// palette has exactly one definition and this page's CSS and canvas cannot drift apart. Imported
// for its side effect: the module mounts the tokens on import.
import "./app/console/boot.js";
import { SIM_CONSTANTS } from "./engine/contracts/config.js";
import { CARD_ORDER, DRILL_CARDS, cardConfig, cardRulerParams, type DrillCard } from "./engine/job/cards.js";
import { COLUMNS, COLUMN_ORDER, HEADLINE_COLUMNS, type ColumnKey } from "./engine/job/columns.js";
import { buildContext, runReport, type ReportContext } from "./engine/job/report.js";
import { makeMeasurementParams } from "./engine/job/spec.js";
import { runPair, type RunResult } from "./engine/sim/run.js";
import { answer, makeDrillState, type DrillCall, type DrillState } from "./app/console/drill.js";
import { isRenderable, resolveZero, stampsFor } from "./app/console/preview.js";
import { DEFAULT_SETTINGS } from "./app/console/state.js";
import {
  makeTileProps,
  renderTile,
  renderWithheldTile,
  withheldZeroRendering,
  zeroRenderingFor,
  type BandGauge,
  type ZeroRendering,
} from "./app/console/tile.js";
import { anchorFor } from "./ui/labels.js";
import { drawArena, fitCanvas, type ArenaView } from "./ui/arena.js";
import { frameIndexAt, type PlaybackBase } from "./app/clock.js";

/**
 * The drill's card screen.
 *
 * One room, run once, with the second run withheld — and the reader asked to say whether the robot
 * disturbed anyone. Everything on this page is what a real corridor would leave you holding: a
 * camera's view of one crossing, and the numbers you could compute from it.
 *
 * The safety property this file exists to hold is that no number needing the run WITHOUT the robot
 * reaches the card. It is not held by a list of allowed columns — a list is a thing somebody forgets
 * to update when a column is added, and the cost of forgetting is handing the reader the answer.
 * It is held by `corridorReadable` on each column descriptor, which is proved by experiment:
 * `unpaired.test.ts` swaps the control arm for a decoy and fails any column claiming to need no
 * control run that notices. Everything below reads that flag.
 *
 * Two consequences of it are easy to miss, and both are handled here rather than by the tile:
 *
 *   - The run-to-run band is withheld too, so the ruler under each reading has nothing to draw a
 *     wedge against. That is `bandWithheld`, not `bandNotMeasured`: nothing on this page would
 *     measure it, so the console's "press Run" line would be false here.
 *   - The forecaster's reading is corridor-readable but its ZERO is not — the number it would read
 *     if the robot had changed nothing comes from a second run in which nobody responds to the
 *     robot. So that tile shows its value and, where the zero would sit, the sentence saying which
 *     run is missing. Guardrail 6 forbids a number with nothing to judge it against and no word
 *     about what is absent; it does not forbid saying, in the zero's own slot, that the zero is the
 *     thing being withheld. That rule is derived too — see `zeroIsWithheld` — so a column added
 *     later with a paired companion gets the same treatment without anyone remembering to ask.
 */

/**
 * The card's readouts: the console's own headline strip, plus the near-miss count.
 *
 * Deliberately the same set the console shows, so the drill's strip is the console's strip with
 * holes punched in it rather than a second, friendlier selection of numbers. The near-miss count is
 * added because it is corridor-readable and it is the one safety number a reader looking at a robot
 * in a crowd will reach for first; leaving it out would make the card easier than the corridor is.
 *
 * Ordered by `COLUMN_ORDER` rather than by which ones survive, so the withheld tiles sit where
 * their numbers would have been.
 *
 * Exported for the tests, which walk it and demand that every entry reached the page in exactly one
 * of the two forms. Without that, a card that silently dropped its paired readouts instead of
 * withholding them would satisfy every "no paired number is shown" check ever written, because
 * nothing shown is nothing leaked — and the reader would lose the shape of what is missing, which
 * is the only thing on the card teaching them what to ask for.
 */
export const CARD_COLUMNS: readonly ColumnKey[] = Object.freeze(cardColumns());

function cardColumns(): ColumnKey[] {
  const chosen: ColumnKey[] = [];
  for (const key of COLUMN_ORDER) {
    if (key === "nearMissEpisodes" || HEADLINE_COLUMNS.includes(key)) {
      chosen.push(key);
    }
  }
  return chosen;
}

/**
 * Whether a shown column's own zero-reference is a number this card is withholding.
 *
 * Derived from the same flag the tile split is, and for the same reason. A column can be perfectly
 * readable from one crossing while the thing it has to be judged against is not — the forecaster's
 * reading is exactly that — and hardcoding "the forecaster is the special one" would quietly break
 * the first time a second such column arrived.
 */
function zeroIsWithheld(key: ColumnKey): boolean {
  const reference = COLUMNS[key].zero;
  if (reference.kind !== "companionColumn") {
    return false;
  }
  return !COLUMNS[reference.column].corridorReadable;
}

const WITHHELD_ZERO_HOW =
  "nothing here says what this would read if the robot had changed nothing: that number comes " +
  "from a second run of this room in which nobody responds to it, and it is withheld — which is " +
  "the position a real corridor leaves you in";

/** The one line the three buttons write back, so the reader can see the call they made. */
const CALL_PHRASES: Readonly<Record<DrillCall, string>> = Object.freeze({
  bigger: "by more than two runs of this room differ by on their own",
  smaller: "by less than two runs of this room differ by on their own",
  "cannot tell": "impossible to call from what this card shows",
});

/**
 * The key to the canvas, as data.
 *
 * Every entry says which mark it stands for and when the arena actually draws it. The wording is
 * word for word the console's, so the two pages describe one picture; what differs is that here the
 * list is filtered by the view rather than written out in full. `web/ui/arena.ts` gates the control
 * dots and the dashed control trails on `showControl` and the accented distances on `showGaps`, and
 * these three predicates read those same two fields — there is no third place that decides.
 */
interface KeyMark {
  readonly className: string;
  readonly label: string;
  readonly drawn: (view: ArenaView) => boolean;
}

const KEY_MARKS: readonly KeyMark[] = Object.freeze([
  {
    className: "key-treated",
    label: "A person, in the run with the robot",
    drawn: (): boolean => true,
  },
  {
    className: "key-control",
    label: "The same person, in the run without it",
    drawn: (view: ArenaView): boolean => view.showControl,
  },
  {
    className: "key-gap",
    label: "The distance between those two, which is the robot's effect on that person",
    drawn: (view: ArenaView): boolean => view.showGaps,
  },
  {
    className: "key-robot",
    label: "The robot",
    drawn: (view: ArenaView): boolean => view.robot !== null,
  },
  {
    className: "key-path-treated",
    label: "A path walked with the robot in the room",
    drawn: (): boolean => true,
  },
  {
    className: "key-path-control",
    label: "The same path, walked without it",
    drawn: (view: ArenaView): boolean => view.showControl,
  },
]);

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

/** One card's run and one card's report, at the card's own ruler. */
interface CardRun {
  readonly kind: "cardRun";
  readonly card: DrillCard;
  readonly run: RunResult;
  readonly context: ReportContext;
}

/**
 * The zero-effect reference arm is deliberately never run.
 *
 * `runPreview` runs it, because the console shows what the forecaster reports when the answer is
 * zero beside what it reports here. On a card that number is the answer, so it is not computed at
 * all rather than computed and then hidden: a value that never exists cannot be leaked by a later
 * edit. Same for the run-to-run band and the detection floor, which `buildContext` is handed as
 * absent.
 */
function runCard(card: DrillCard): CardRun {
  const config = cardConfig(card);
  const ruler = cardRulerParams(card);
  const params = makeMeasurementParams({
    forecastHorizonSteps: ruler.horizonSteps,
    forecastEndStep: ruler.windowEndStep,
    nearMissThresholdM: DEFAULT_SETTINGS.nearMissThresholdM,
    recoveryToleranceFraction: DEFAULT_SETTINGS.recoveryToleranceFraction,
    recoveryDwellSteps: DEFAULT_SETTINGS.recoveryDwellSteps,
  });
  const run = runPair(config);
  const context = buildContext({
    config,
    params,
    run,
    zeroRun: null,
    band: null,
    floor: null,
    frechetMeanM: null,
  });
  return Object.freeze({ kind: "cardRun" as const, card, run, context });
}

function shownColumns(): readonly ColumnKey[] {
  const shown: ColumnKey[] = [];
  for (const key of CARD_COLUMNS) {
    if (COLUMNS[key].corridorReadable) {
      shown.push(key);
    }
  }
  return shown;
}

function paintReadouts(doc: Document, host: HTMLElement, cardRun: CardRun): void {
  const readings = runReport(cardRun.context, shownColumns());
  const stamps = stampsFor(cardRun.context);
  // Nothing on this page measures the ordinary difference between two runs, and nothing on it
  // would: those runs have no robot in them, which is the answer.
  const gauge: BandGauge = { kind: "bandWithheld" };

  clear(host);
  for (const key of CARD_COLUMNS) {
    const descriptor = COLUMNS[key];
    if (!descriptor.corridorReadable) {
      host.appendChild(renderWithheldTile(doc, descriptor.label));
      continue;
    }
    const reading = readings[key];
    if (reading === undefined) {
      continue;
    }
    let zero: ZeroRendering;
    if (zeroIsWithheld(key)) {
      zero = withheldZeroRendering(WITHHELD_ZERO_HOW, descriptor.unit);
    } else if (isRenderable(key, cardRun.context, readings)) {
      zero = zeroRenderingFor(
        descriptor.zero,
        resolveZero(key, cardRun.context, readings),
        descriptor.unit,
      );
    } else {
      // Cannot happen with today's catalogue: every other corridor-readable column's zero is a
      // constant of the room's geometry or a literal zero, both of which always resolve. Skipping
      // rather than throwing keeps the failure mode "one readout short" instead of "a blank page",
      // and it is the same choice web/console.ts makes for the same reason.
      continue;
    }
    let anchor: string | null = null;
    if (descriptor.needsAnchor && reading.availability.kind === "measured") {
      anchor = anchorFor(reading.value);
    }
    host.appendChild(
      renderTile(
        doc,
        makeTileProps({
          column: key,
          label: descriptor.label,
          unit: descriptor.unit,
          reading,
          zero,
          gauge,
          stamps,
          assumption: descriptor.assumption(cardRun.context),
          anchor,
        }),
      ),
    );
  }
}

function paintKey(doc: Document, host: HTMLElement, view: ArenaView): void {
  clear(host);
  for (const mark of KEY_MARKS) {
    if (!mark.drawn(view)) {
      continue;
    }
    const item = doc.createElement("li");
    const swatch = doc.createElement("span");
    swatch.className = `key-mark ${mark.className}`;
    item.appendChild(swatch);
    item.appendChild(doc.createTextNode(mark.label));
    host.appendChild(item);
  }
}

/**
 * What the canvas was last drawn from.
 *
 * Exported because the key is built from it and the tests read it: "no control mark is drawn" is a
 * statement about the view the drawing function was handed, and asserting it against the view is
 * exact where asserting it against a canvas would mean re-implementing the renderer to inspect it.
 */
let currentView: ArenaView | null = null;

export function arenaViewNow(): ArenaView | null {
  return currentView;
}

export function bootDrill(doc: Document): void {
  const canvas = el<HTMLCanvasElement>(doc, "arena");
  const canvasContext = canvas.getContext("2d");
  if (canvasContext === null) {
    throw new Error("2d canvas context unavailable");
  }
  const keyHost = el<HTMLUListElement>(doc, "arena-key");
  const readoutsHost = el<HTMLDivElement>(doc, "readouts");
  const progress = el<HTMLParagraphElement>(doc, "card-progress");
  const name = el<HTMLParagraphElement>(doc, "card-name");
  const status = el<HTMLParagraphElement>(doc, "call-status");
  const buttons: readonly { readonly node: HTMLButtonElement; readonly call: DrillCall }[] =
    Object.freeze([
      { node: el<HTMLButtonElement>(doc, "call-bigger"), call: "bigger" as const },
      { node: el<HTMLButtonElement>(doc, "call-smaller"), call: "smaller" as const },
      { node: el<HTMLButtonElement>(doc, "call-cannot-tell"), call: "cannot tell" as const },
    ]);

  let state: DrillState = makeDrillState();
  let sample = 0;
  let base: PlaybackBase = { wallStartMs: 0, sampleAtStart: 0, dtMs: 50, rate: 1 };

  const cardKey = CARD_ORDER[state.index];
  if (cardKey === undefined) {
    throw new Error("the card catalogue is empty");
  }
  const cardRun = runCard(DRILL_CARDS[cardKey]);

  progress.textContent = `Card ${String(state.index + 1)} of ${String(CARD_ORDER.length)}`;
  name.textContent = cardRun.card.name;

  const render = (): ArenaView => {
    const config = cardRun.run.config;
    const box = fitCanvas(canvas, window.devicePixelRatio);
    const view: ArenaView = {
      widthM: config.widthM,
      heightM: config.heightM,
      sample,
      nSamples: config.nTicks + 1,
      treated: cardRun.run.treated.positions,
      control: cardRun.run.control.positions,
      robot: cardRun.run.treated.robotPositions,
      // The whole of withheld mode. `web/ui/arena.ts` already gates every control dot, every
      // dashed control trail and every accented distance on these two, so there is no drill branch
      // inside the renderer and there must not be one: a second way to hide the control arm is a
      // second thing to get wrong.
      showControl: false,
      showGaps: false,
      trailSamples: 90,
      pedRadiusM: SIM_CONSTANTS.pedRadiusM,
      robotRadiusM: SIM_CONSTANTS.robotRadiusM,
      highlight: null,
    };
    currentView = view;
    drawArena(canvasContext, view, box.width, box.height);
    return view;
  };

  const frame = (nowMs: number): void => {
    const nSamples = cardRun.run.config.nTicks + 1;
    const next = frameIndexAt(nowMs, base, nSamples);
    if (next >= nSamples - 1) {
      sample = 0;
      base = { ...base, wallStartMs: nowMs, sampleAtStart: 0 };
    } else {
      sample = next;
    }
    render();
    requestAnimationFrame(frame);
  };

  for (const button of buttons) {
    button.node.addEventListener("click", () => {
      // `answer` throws on a second call against the same card rather than quietly replacing the
      // first, so the buttons are switched off here to match: a reader who could change their mind
      // after the reveal would be keeping a tally of nothing.
      state = answer(state, button.call);
      for (const other of buttons) {
        other.node.disabled = true;
      }
      status.textContent = `You called it: the robot moved this crowd ${CALL_PHRASES[button.call]}.`;
    });
  }

  paintKey(doc, keyHost, render());
  paintReadouts(doc, readoutsHost, cardRun);
  requestAnimationFrame(frame);
}

bootDrill(document);
