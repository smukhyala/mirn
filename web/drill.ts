// Tokens are injected rather than duplicated in a generated stylesheet — see boot.ts — so the
// palette has exactly one definition and this page's CSS and canvas cannot drift apart. Imported
// for its side effect: the module mounts the tokens on import.
import "./app/console/boot.js";
import { makeRunConfig, SIM_CONSTANTS } from "./engine/contracts/config.js";
import { AXIS_ORDER, type AxisKey } from "./engine/job/axes.js";
import {
  CARD_ORDER,
  DRILL_CARDS,
  cardConfig,
  cardRulerParams,
  type CardKey,
  type DrillCard,
} from "./engine/job/cards.js";
import {
  COLUMNS,
  COLUMN_ORDER,
  HEADLINE_COLUMNS,
  type ColumnKey,
  type Reading,
  type UnitKey,
} from "./engine/job/columns.js";
import { buildContext, runReport, type ReportContext } from "./engine/job/report.js";
import { makeMeasurementParams } from "./engine/job/spec.js";
import { replicateBand } from "./engine/measure/null/band.js";
import { runPair, type RunResult } from "./engine/sim/run.js";
import {
  answer,
  isComplete,
  makeDrillState,
  reveal as advanceCard,
  tally,
  type DrillCall,
  type DrillState,
  type HonestCall,
} from "./app/console/drill.js";
import { decodeDrill, encodeDrill, encodeSettings } from "./app/console/permalink.js";
import {
  makeDrillCsvEntry,
  makeDrillCsvOptions,
  toDrillCsv,
  type DrillCsvEntry,
} from "./app/console/csv.js";
import { downloadCsv } from "./app/console/table.js";
import { isRenderable, resolveZero, stampsFor } from "./app/console/preview.js";
import { DEFAULT_SETTINGS, makeConsoleSettings } from "./app/console/state.js";
import {
  formatValue,
  makeTileProps,
  renderTile,
  renderWithheldTile,
  unitSuffix,
  withheldZeroRendering,
  zeroRenderingFor,
  type BandGauge,
  type ZeroRendering,
} from "./app/console/tile.js";
import { anchorFor } from "./ui/labels.js";
import { drawArena, fitCanvas, type ArenaView } from "./ui/arena.js";
import { frameIndexAt, type PlaybackBase } from "./app/clock.js";

/**
 * The drill's card, its reveal and its verdict.
 *
 * One room, run once, with the second run withheld — and the reader asked to say whether the robot
 * disturbed anyone. Everything on the card is what a real corridor would leave you holding: a
 * camera's view of one crossing, and the numbers you could compute from it. Then the reader calls
 * it, and the second run arrives.
 *
 * The safety property this file exists to hold is that no number needing the run WITHOUT the robot
 * reaches the card BEFORE the call. It is not held by a list of allowed columns — a list is a thing
 * somebody forgets to update when a column is added, and the cost of forgetting is handing the
 * reader the answer. It is held by `corridorReadable` on each column descriptor, which is proved by
 * experiment: `unpaired.test.ts` swaps the control arm for a decoy and fails any column claiming to
 * need no control run that notices. Everything below reads that flag.
 *
 * Two consequences of it are easy to miss, and both are handled here rather than by the tile:
 *
 *   - The run-to-run band is withheld too, so the ruler under each reading has nothing to draw a
 *     wedge against. That is `bandWithheld`, not `bandNotMeasured`: nothing on the card would
 *     measure it, so the console's "press Run" line would be false there.
 *   - The forecaster's reading is corridor-readable but its ZERO is not — the number it would read
 *     if the robot had changed nothing comes from a second run in which nobody responds to the
 *     robot. So that tile shows its value and, where the zero would sit, the sentence saying which
 *     run is missing. Guardrail 6 forbids a number with nothing to judge it against and no word
 *     about what is absent; it does not forbid saying, in the zero's own slot, that the zero is the
 *     thing being withheld. That rule is derived too — see `zeroIsWithheld` — so a column added
 *     later with a paired companion gets the same treatment without anyone remembering to ask.
 *
 * After the call, all three are bought and every tile fills in through the ordinary `renderTile`
 * path, carrying its own zero. Nothing becomes a different kind of tile on the way.
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
 * their numbers would have been — and so the reveal fills those same holes rather than reflowing
 * the strip under the reader.
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

/**
 * One clause per call, written so it reads after "You called it: " and after "You said ".
 *
 * A single phrase table used to sit here, holding only the tail of each sentence, and the third
 * entry did not fit the frame it was spliced into: "the robot moved this crowd impossible to call
 * from what this card shows". "Cannot tell" is not a size, so it cannot share a sentence shape with
 * the two that are; it gets its own clause instead.
 */
const CALL_CLAUSE: Readonly<Record<DrillCall, string>> = Object.freeze({
  bigger: "the robot moved this crowd by more than two runs of this room differ by on their own",
  smaller: "the robot moved this crowd by less than two runs of this room differ by on their own",
  "cannot tell": "this card does not show enough to say which way the robot moved this crowd",
});

/** The same two sizes, written to follow "the honest call was ". */
const HONEST_CLAUSE: Readonly<Record<HonestCall, string>> = Object.freeze({
  bigger: "by more than that ordinary difference",
  smaller: "by less than that ordinary difference",
});

/**
 * Counting words, so no sentence on this page carries a digit for something the catalogue decides.
 *
 * The verdict's closing line reads "on all eight", and eight is `CARD_ORDER.length` rather than a
 * number somebody typed — a ninth card would otherwise leave the one sentence the whole drill
 * exists to deliver quietly asserting a count that had stopped being true.
 */
const COUNT_WORDS: readonly string[] = Object.freeze([
  // "none", not "no": every frame this table is read into is "<word> of the eight", and "no of the
  // eight" is not English.
  "none",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
]);

function countWord(count: number): string {
  const word = COUNT_WORDS[count];
  if (word === undefined) {
    return String(count);
  }
  return word;
}

/**
 * The key to the canvas, as data.
 *
 * Every entry says which mark it stands for and when the arena actually draws it. The wording is
 * word for word the console's, so the two pages describe one picture; what differs is that here the
 * list is filtered by the view rather than written out in full. `web/ui/arena.ts` gates the control
 * dots and the dashed control trails on `showControl` and the accented distances on `showGaps`, and
 * these three predicates read those same two fields — there is no third place that decides. That is
 * also what makes the key grow back on its own when the reveal switches those two fields on.
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

function element(doc: Document, tag: string, className: string, content: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  node.textContent = content;
  return node;
}

/** A number with its unit, never a bare one, for the sentences the reveal writes. */
function quantity(value: number, unit: UnitKey): string {
  const text = formatValue(value, unit);
  const suffix = unitSuffix(unit);
  if (suffix.length === 0) {
    return text;
  }
  return `${text} ${suffix}`;
}

/** One card's run and one card's report, at the card's own ruler, with the second run withheld. */
interface CardRun {
  readonly kind: "cardRun";
  readonly card: DrillCard;
  readonly run: RunResult;
  readonly context: ReportContext;
}

/**
 * The zero-effect reference arm is deliberately never run before the call.
 *
 * `runPreview` runs it, because the console shows what the forecaster reports when the answer is
 * zero beside what it reports here. On a card that number is the answer, so it is not computed at
 * all rather than computed and then hidden: a value that never exists cannot be leaked by a later
 * edit. Same for the run-to-run band and the detection floor, which `buildContext` is handed as
 * absent. `revealCard` buys the first two once the call is locked in and cannot be changed.
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

/** The same room with everything the card was holding back: the second run's numbers, the ordinary
 *  difference between two runs of it, and the forecaster's own zero. */
interface CardReveal {
  readonly kind: "cardReveal";
  readonly context: ReportContext;
  readonly readings: Readonly<Partial<Record<ColumnKey, Reading>>>;
  readonly truthM: number;
  readonly bandM: number;
  readonly forecastM: number;
  readonly honest: HonestCall;
  /** Whether the one number a corridor could have given the reader pointed the other way. */
  readonly corridorMisleads: boolean;
}

function revealCard(cardRun: CardRun): CardReveal {
  const config = cardRun.run.config;
  // Both of these are the answer, which is why neither is bought until the call is locked. The
  // band is eight more paired runs (a third of a second at eighteen people, nearly a whole one at
  // forty-four); the zero-effect reference is one more, and without it the forecaster's tile would
  // still be printing the sentence about a withheld zero after the reveal, which would be false.
  const band = replicateBand(config);
  const zeroConfig = makeRunConfig({ ...config, pedestriansSeeRobot: false });
  const zeroRun = runPair(zeroConfig);
  const context = buildContext({
    config,
    params: cardRun.context.params,
    run: cardRun.run,
    zeroRun,
    band,
    floor: null,
    frechetMeanM: null,
  });
  const readings = runReport(context, reportColumns(true));

  const truth = readings["trueEffectM"];
  const bandReading = readings["runToRunBandM"];
  const forecast = readings["forecastReportM"];
  if (truth === undefined || bandReading === undefined || forecast === undefined) {
    throw new Error("the reveal was built without the three numbers its own sentences quote");
  }

  // The question the card asked, answered by the two numbers the card asked it about. Never read
  // off the catalogue's `shape` field, even now that `shape` is measured against this same band:
  // that field says what a card does to a reader who trusts the corridor number, which is not the
  // same question as what this room did. It used to be classified against the split-half detection
  // floor, a different null, and disagreed with the band on three of the eight cards — see the
  // header of web/engine/job/__tests__/cards.slow.test.ts.
  let honest: HonestCall = "smaller";
  if (truth.value > bandReading.value) {
    honest = "bigger";
  }
  let corridorSays: HonestCall = "smaller";
  if (forecast.value > bandReading.value) {
    corridorSays = "bigger";
  }

  return Object.freeze({
    kind: "cardReveal" as const,
    context,
    readings,
    truthM: truth.value,
    bandM: bandReading.value,
    forecastM: forecast.value,
    honest,
    corridorMisleads: corridorSays !== honest,
  });
}

/**
 * Which columns to compute, before and after the call.
 *
 * After it, the companions come too. `worstMomentM`'s zero-reference is `worstMomentNullM` and the
 * forecaster's is `forecastZeroM`; neither gets a tile of its own on this page, but `resolveZero`
 * reads both out of the report, and a tile whose zero does not resolve is one `zeroRenderingFor`
 * refuses to build. Derived from the catalogue rather than named, so a third such pairing added
 * later is covered without this function being edited.
 */
function reportColumns(revealed: boolean): readonly ColumnKey[] {
  const wanted: ColumnKey[] = [];
  for (const key of CARD_COLUMNS) {
    if (!revealed && !COLUMNS[key].corridorReadable) {
      continue;
    }
    wanted.push(key);
  }
  if (!revealed) {
    return wanted;
  }
  for (const key of CARD_COLUMNS) {
    const reference = COLUMNS[key].zero;
    if (reference.kind !== "companionColumn") {
      continue;
    }
    if (wanted.includes(reference.column)) {
      continue;
    }
    wanted.push(reference.column);
  }
  return wanted;
}

function paintReadouts(
  doc: Document,
  host: HTMLElement,
  context: ReportContext,
  readings: Readonly<Partial<Record<ColumnKey, Reading>>>,
  revealed: boolean,
): void {
  const stamps = stampsFor(context);
  // Before the call, nothing on this page measures the ordinary difference between two runs, and
  // nothing on it would: those runs have no robot in them, which is the answer. After it, the same
  // gauge the console draws, from the band this reveal actually bought.
  let gauge: BandGauge = { kind: "bandWithheld" };
  const band = context.band;
  if (revealed && band !== null) {
    gauge = { kind: "bandMeasured", bandM: band.value, nReplicates: band.nReplicates };
  }

  clear(host);
  for (const key of CARD_COLUMNS) {
    const descriptor = COLUMNS[key];
    if (!revealed && !descriptor.corridorReadable) {
      host.appendChild(renderWithheldTile(doc, descriptor.label));
      continue;
    }
    const reading = readings[key];
    if (reading === undefined) {
      continue;
    }
    let zero: ZeroRendering;
    if (!revealed && zeroIsWithheld(key)) {
      zero = withheldZeroRendering(WITHHELD_ZERO_HOW, descriptor.unit);
    } else if (isRenderable(key, context, readings)) {
      zero = zeroRenderingFor(descriptor.zero, resolveZero(key, context, readings), descriptor.unit);
    } else {
      // Cannot happen with today's catalogue: every corridor-readable column's zero is a constant
      // of the room's geometry or a literal zero, both of which always resolve, and every withheld
      // one's companion is computed by `reportColumns` above. Skipping rather than throwing keeps
      // the failure mode "one readout short" instead of "a blank page", and it is the same choice
      // web/console.ts makes for the same reason.
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
          assumption: descriptor.assumption(context),
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
 * The console, opened at this card's own settings.
 *
 * Built through `encodeSettings` rather than by writing query keys here, so there is one spelling
 * of every key on the site. The link carries the recipe and never a result, which is guardrail 10:
 * a link asserting what the card measured would quote an old answer with the console's authority.
 */
function consoleLinkFor(card: DrillCard, dt: number): string {
  const axisValues: Record<AxisKey, number> = { ...DEFAULT_SETTINGS.axisValues };
  for (const key of AXIS_ORDER) {
    const value = card.settings[key];
    if (value === undefined) {
      continue;
    }
    axisValues[key] = value;
  }
  axisValues["forecastHorizon"] = secondsOnGrid(card.horizonSteps, dt);
  axisValues["forecastWindowEnd"] = secondsOnGrid(card.windowEndStep, dt);
  const settings = makeConsoleSettings({
    axisValues,
    pedestriansSeeRobot: DEFAULT_SETTINGS.pedestriansSeeRobot,
    // A card's own room was measured on the crowd the console opens at, so the link that reopens
    // it must name that crowd rather than leave the console free to pick another.
    crowdModel: DEFAULT_SETTINGS.crowdModel,
    nearMissThresholdM: DEFAULT_SETTINGS.nearMissThresholdM,
    recoveryToleranceFraction: DEFAULT_SETTINGS.recoveryToleranceFraction,
    recoveryDwellSteps: DEFAULT_SETTINGS.recoveryDwellSteps,
    sweepAxis: DEFAULT_SETTINGS.sweepAxis,
    sweepValues: DEFAULT_SETTINGS.sweepValues,
    seedCount: DEFAULT_SETTINGS.seedCount,
    bandReplicates: DEFAULT_SETTINGS.bandReplicates,
    withFloor: DEFAULT_SETTINGS.withFloor,
    withFrechet: DEFAULT_SETTINGS.withFrechet,
    withZeroReference: DEFAULT_SETTINGS.withZeroReference,
  });
  return `./index.html?${encodeSettings(settings)}`;
}

/**
 * A step count back into the seconds a slider reads.
 *
 * `steps * dt` is a multiple of the tick, but not exactly: sixty ticks of 0.05 s is
 * 3.0000000000000004 in binary floating point, which is above the forecast horizon's own maximum
 * and would be rejected by `makeConsoleSettings` — or, worse, silently rounded down by the link.
 * Two decimals is exact for every multiple of the tick and kills the dust.
 */
function secondsOnGrid(steps: number, dt: number): number {
  const raw = steps * dt;
  const text = raw.toFixed(2);
  return Number(text);
}

/**
 * What the canvas was last drawn from.
 *
 * Exported because the key is built from it and the tests read it: "no control mark is drawn" is a
 * statement about the view the drawing function was handed, and asserting it against the view is
 * exact where asserting it against a canvas would mean re-implementing the renderer to inspect it.
 * The reveal's own property — that it redraws the SAME instant with the control arm switched on —
 * is a statement about two readings of this one value, taken either side of a click.
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
  const stage = el<HTMLElement>(doc, "stage");
  const keyHost = el<HTMLUListElement>(doc, "arena-key");
  const readoutsHost = el<HTMLDivElement>(doc, "readouts");
  const progress = el<HTMLParagraphElement>(doc, "card-progress");
  const name = el<HTMLParagraphElement>(doc, "card-name");
  const status = el<HTMLParagraphElement>(doc, "call-status");
  const revealHost = el<HTMLDivElement>(doc, "reveal");
  const noticeHost = el<HTMLDivElement>(doc, "link-notices");
  const tallyLine = el<HTMLParagraphElement>(doc, "tally");
  const verdictHost = el<HTMLElement>(doc, "verdict");
  const buttons: readonly { readonly node: HTMLButtonElement; readonly call: DrillCall }[] =
    Object.freeze([
      { node: el<HTMLButtonElement>(doc, "call-bigger"), call: "bigger" as const },
      { node: el<HTMLButtonElement>(doc, "call-smaller"), call: "smaller" as const },
      { node: el<HTMLButtonElement>(doc, "call-cannot-tell"), call: "cannot tell" as const },
    ]);

  /**
   * The reading half of this page's permalink, read before the first card is built.
   *
   * `encodeDrill` writes which cards a drill was and nothing else. This reads that back and runs
   * exactly those, in that order. Wiring only the writing half would be the write-only link
   * guardrail 10 names as worse than no link at all: it would look like it worked and lose its
   * payload in silence. No list, or a list of nothing this catalogue holds, is the ordinary case
   * and gets the catalogue's own order — and anything the catalogue does not have is said above
   * the card in plain English rather than dropped quietly, the way the console prints what its own
   * panel could not take.
   */
  const link = decodeDrill(window.location.search);
  const order: readonly CardKey[] = link.cards.length > 0 ? link.cards : CARD_ORDER;

  let state: DrillState = makeDrillState(order);
  let cardRun: CardRun = runCard(cardAt(state.index));
  let sample = 0;
  let base: PlaybackBase = { wallStartMs: 0, sampleAtStart: 0, dtMs: 50, rate: 1 };
  // The reveal redraws the instant the reader was looking at, not the next one. Playback stops on
  // the call and stays stopped until the next card: a crowd that moved while they were reading
  // would make the comparison a different one from the one they were asked about.
  let frozen = false;
  let revealed = false;
  // Whether the corridor-readable number pointed the other way from the truth, one entry per card
  // answered. The verdict counts them; nothing scores from them.
  const misleadingCards: boolean[] = [];
  /**
   * One row per card called, built at the reveal and exported from the verdict.
   *
   * Built here rather than at the export, because the four numbers in a row exist only while that
   * card's reveal is in hand: the drill buys a band and a zero-effect run per card and keeps
   * neither. Re-deriving them at the export would mean re-running eight rooms, and a second
   * measurement of the same card is a second chance for the file and the page to disagree.
   */
  const csvRows: DrillCsvEntry[] = [];

  function cardAt(index: number): DrillCard {
    const key = state.order[index];
    if (key === undefined) {
      throw new Error("this drill has no card at that position");
    }
    return DRILL_CARDS[key];
  }

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
      // The whole of withheld mode, and the whole of the reveal. `web/ui/arena.ts` already gates
      // every control dot, every dashed control trail and every accented distance on these two, so
      // there is no drill branch inside the renderer and there must not be one: a second way to
      // hide the control arm is a second thing to get wrong.
      showControl: revealed,
      showGaps: revealed,
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
    if (!frozen) {
      const nSamples = cardRun.run.config.nTicks + 1;
      const next = frameIndexAt(nowMs, base, nSamples);
      if (next >= nSamples - 1) {
        sample = 0;
        base = { ...base, wallStartMs: nowMs, sampleAtStart: 0 };
      } else {
        sample = next;
      }
      render();
    }
    requestAnimationFrame(frame);
  };

  const paintTally = (): void => {
    const counts = tally(state);
    if (counts.total === 0) {
      tallyLine.textContent = "No cards called yet.";
      return;
    }
    tallyLine.textContent =
      `Called so far: ${String(counts.total)} of ${countWord(state.order.length)}. ` +
      `${String(counts.right)} matched what the room did, ${String(counts.wrong)} did not, and ` +
      `on ${String(counts.cannotTell)} you said the card could not be called.`;
  };

  const loadCard = (next: CardRun): void => {
    cardRun = next;
    sample = 0;
    base = { wallStartMs: 0, sampleAtStart: 0, dtMs: 50, rate: 1 };
    frozen = false;
    revealed = false;
    progress.textContent = `Card ${String(state.index + 1)} of ${String(state.order.length)}`;
    name.textContent = cardRun.card.name;
    status.textContent = "";
    clear(revealHost);
    for (const button of buttons) {
      button.node.disabled = false;
    }
    paintKey(doc, keyHost, render());
    paintReadouts(doc, readoutsHost, cardRun.context, runReport(cardRun.context, reportColumns(false)), false);
    paintTally();
  };

  const showVerdict = (): void => {
    stage.hidden = true;
    verdictHost.hidden = false;
    paintVerdict(doc, verdictHost, state, misleadingCards, cardRun, csvRows);
  };

  const paintRevealBlock = (cardReveal: CardReveal, call: DrillCall): void => {
    const last = state.index + 1 >= state.order.length;
    const next = doc.createElement("button");
    next.type = "button";
    next.id = "next-card";
    next.className = "reveal-next";
    if (last) {
      next.textContent = "See the verdict";
    } else {
      next.textContent = "Next card";
    }
    next.addEventListener("click", () => {
      state = advanceCard(state);
      if (isComplete(state)) {
        showVerdict();
        return;
      }
      loadCard(runCard(cardAt(state.index)));
    });
    clear(revealHost);
    revealHost.appendChild(renderReveal(doc, cardReveal, call, next));
  };

  for (const button of buttons) {
    button.node.addEventListener("click", () => {
      // `answer` throws on a second call against the same card rather than quietly replacing the
      // first, so the buttons are switched off here to match: a reader who could change their mind
      // after the reveal would be keeping a tally of nothing. They go off BEFORE the second run is
      // bought, because buying it is the better part of a second at forty-four people and a live
      // button through that window is a second call waiting to happen.
      for (const other of buttons) {
        other.node.disabled = true;
      }
      status.textContent = `You called it: ${CALL_CLAUSE[button.call]}.`;

      const cardReveal = revealCard(cardRun);
      const calledKey = state.order[state.index];
      state = answer(state, button.call, cardReveal.honest);
      misleadingCards.push(cardReveal.corridorMisleads);
      // The forecaster's own zero, read out of the same report the tile above it is rendered from
      // rather than measured a second time here. A row is only written when all four numbers are
      // in hand: a column of blanks in a file that outlives the page is worse than a shorter file.
      const forecastZero = cardReveal.readings["forecastZeroM"];
      if (calledKey !== undefined && forecastZero !== undefined) {
        csvRows.push(
          makeDrillCsvEntry({
            cardKey: calledKey,
            call: button.call,
            honest: cardReveal.honest,
            truthM: cardReveal.truthM,
            bandM: cardReveal.bandM,
            corridorM: cardReveal.forecastM,
            corridorZeroM: forecastZero.value,
          }),
        );
      }

      frozen = true;
      revealed = true;
      paintKey(doc, keyHost, render());
      paintReadouts(doc, readoutsHost, cardReveal.context, cardReveal.readings, true);
      paintRevealBlock(cardReveal, button.call);
      paintTally();
    });
  }

  // Said once, at boot, above the card. There is nothing later that could make a link's own
  // mistake go away, and nothing on the page rewrites it.
  if (link.notices.length > 0) {
    noticeHost.hidden = false;
    for (const notice of link.notices) {
      noticeHost.appendChild(element(doc, "p", "region-note", notice));
    }
  }

  loadCard(cardRun);
  requestAnimationFrame(frame);
}

/**
 * The reveal, in sentences.
 *
 * Every number in it is printed beside something that gives it scale: the truth and the forecaster's
 * report are both quoted against the ordinary difference between two runs, and all three have a tile
 * of their own a few centimetres up the page carrying their own zero. No figure here is written into
 * the source — a hardcoded number is a claim that outlives the settings that produced it.
 */
function renderReveal(
  doc: Document,
  cardReveal: CardReveal,
  call: DrillCall,
  next: HTMLButtonElement,
): HTMLElement {
  const section = doc.createElement("section");
  section.className = "drill-reveal";

  section.appendChild(element(doc, "p", "reveal-call", `You said ${CALL_CLAUSE[call]}.`));
  section.appendChild(
    element(
      doc,
      "p",
      "reveal-line",
      "The second run is drawn on the arena now, at the same instant you were looking at, and the " +
        "readouts it was hiding are filled in above.",
    ),
  );
  section.appendChild(
    element(
      doc,
      "p",
      "reveal-line",
      `The robot moved this crowd by ${quantity(cardReveal.truthM, "metres")} on average. That is ` +
        "not an estimate: the two runs shared a seed, started from the same positions and carried " +
        "the same random wobble, and differed only in whether the robot was there, so the gap " +
        "between a person's two paths is what the robot did to them.",
    ),
  );

  let truthSide = "less";
  if (cardReveal.honest === "bigger") {
    truthSide = "more";
  }
  section.appendChild(
    element(
      doc,
      "p",
      "reveal-line",
      `Two runs of this room with nothing done to either of them differ by ` +
        `${quantity(cardReveal.bandM, "metres")} on their own. The robot moved it by ${truthSide} ` +
        `than that, so the honest call was ${HONEST_CLAUSE[cardReveal.honest]}.`,
    ),
  );

  let corridorSide = "less";
  if (cardReveal.forecastM > cardReveal.bandM) {
    corridorSide = "more";
  }
  let corridorVerdict = "It happened to point the same way as the truth on this card.";
  if (cardReveal.corridorMisleads) {
    corridorVerdict = "It pointed the other way from the truth.";
  }
  section.appendChild(
    element(
      doc,
      "p",
      "reveal-line",
      `A forecaster watching only the run with the robot in it — the one number a camera and a ` +
        `stopwatch could have given you here — reported ` +
        `${quantity(cardReveal.forecastM, "metres")}, which is ${corridorSide} than that same ` +
        `ordinary difference. ${corridorVerdict}`,
    ),
  );

  let mark = "Your call did not match what the room did.";
  if (call === "cannot tell") {
    mark =
      "You said the card could not be called. That is counted on its own, neither right nor " +
      "wrong: it is the honest answer to a card built to be unanswerable from what it shows.";
  } else if (call === cardReveal.honest) {
    mark = "Your call matched what the room did.";
  }
  section.appendChild(element(doc, "p", "reveal-mark", mark));

  section.appendChild(next);
  return section;
}

/** One paragraph of the verdict: the wording, and the class that decides how loudly it is set. */
export interface VerdictLine {
  readonly kind: "verdictLine";
  readonly className: string;
  readonly text: string;
}

function line(className: string, text: string): VerdictLine {
  return Object.freeze({ kind: "verdictLine" as const, className, text });
}

/**
 * The verdict's sentences, from the calls actually made.
 *
 * Pure, and exported, because the interesting thing about it is the branching — every one you got
 * wrong went the same way, they went both ways, none of them missed — and reaching those branches
 * through the page means simulating eight rooms per branch. Here they are reachable from a state
 * object, so every wording a reader can land on is checked rather than the one a walk happened to
 * produce.
 *
 * The last line is the transferable one, and the reason the drill exists: the paired reading is not
 * a cleverer estimator, it is a comparison with the confound removed by construction. Its count is
 * `CARD_ORDER.length` spelled as a word rather than a number typed into a sentence, so a ninth card
 * cannot leave it quietly asserting something that had stopped being true.
 */
export function verdictLines(
  state: DrillState,
  misleadingCards: readonly boolean[],
): readonly VerdictLine[] {
  const counts = tally(state);
  const total = countWord(state.order.length);
  const lines: VerdictLine[] = [];

  lines.push(
    line("verdict-line", `You called ${countWord(counts.wrong)} of the ${total} cards wrong.`),
  );

  let wrongBigger = 0;
  let wrongSmaller = 0;
  for (const record of state.calls) {
    if (record.correct || record.call === "cannot tell") {
      continue;
    }
    if (record.call === "bigger") {
      wrongBigger = wrongBigger + 1;
    } else {
      wrongSmaller = wrongSmaller + 1;
    }
  }
  let direction = "There is no direction to report, because none of your calls missed.";
  if (wrongBigger > 0 && wrongSmaller === 0) {
    direction =
      "Every one you got wrong went the same way: you said the robot had moved the crowd by more " +
      "than the ordinary difference between two runs when it had not.";
  } else if (wrongSmaller > 0 && wrongBigger === 0) {
    direction =
      "Every one you got wrong went the same way: you said the robot had moved the crowd by less " +
      "than the ordinary difference between two runs when it had moved it by more.";
  } else if (wrongBigger > 0 && wrongSmaller > 0) {
    direction =
      `The ones you got wrong went both ways: on ${String(wrongBigger)} you said by more than the ` +
      `ordinary difference when it was by less, and on ${String(wrongSmaller)} you said by less ` +
      `when it was by more.`;
  }
  lines.push(line("verdict-line", direction));

  let declined = "You called every card rather than declining any of them.";
  if (counts.cannotTell > 0) {
    declined =
      `On ${countWord(counts.cannotTell)} of them you said the card could not be called. Those are ` +
      "counted on their own, neither right nor wrong: a card built to be unanswerable from what it " +
      "shows has an honest answer, and that is it.";
  }
  lines.push(line("verdict-line", declined));

  let misleads = 0;
  for (const misled of misleadingCards) {
    if (misled) {
      misleads = misleads + 1;
    }
  }
  lines.push(
    line(
      "verdict-line",
      `The forecaster's number — the only one of these a real corridor could have handed you — ` +
        `pointed the other way from the truth on ${countWord(misleads)} of the ${total}. It is not ` +
        `that it is always wrong. It is that nothing in it tells you which kind of card you are ` +
        `holding.`,
    ),
  );

  lines.push(
    line(
      "verdict-claim",
      `On all ${total} the paired reading was right — not because it is a better estimator, but ` +
        `because both runs shared a seed and differed only in the robot.`,
    ),
  );

  return Object.freeze(lines);
}

/**
 * The two ways to take a finished drill away with you.
 *
 * The pattern is the console's ledger bar, deliberately: two buttons and one sentence underneath
 * saying what each carries, so a reader who has used one page recognises the other. What differs is
 * what there is to carry.
 *
 * **The link carries the cards and nothing else.** `encodeDrill` writes the card keys in the order
 * they were called and cannot write a call, an honest answer or a score — `DrillCallRecord` holds
 * all three and it reads none of them. That is guardrail 10's rule and not a preference: a link
 * saying you got five of eight would quote an old page's answer with the new page's authority, on
 * a page whose whole argument is that the score is not the interesting part. A key resolves through
 * the closed catalogue to a room, which reproduces exactly, and to nothing about how it was called.
 *
 * **The file carries the disclosure on line one**, because a file outlives the page it came from
 * and the crowd in it is still invented wherever it is opened. It also carries, in its own header,
 * that no detection floor was measured for any card — the drill never buys one — rather than a
 * column of blanks or, worse, a fabricated number.
 */
function paintVerdictBar(
  doc: Document,
  host: HTMLElement,
  state: DrillState,
  rows: readonly DrillCsvEntry[],
): void {
  const bar = doc.createElement("div");
  bar.className = "verdict-bar";

  const exportButton = doc.createElement("button");
  exportButton.type = "button";
  exportButton.id = "drill-export-csv";
  exportButton.textContent = "Export CSV";
  exportButton.addEventListener("click", () => {
    const text = toDrillCsv(
      rows,
      makeDrillCsvOptions({ generatedAtIso: new Date(Date.now()).toISOString() }),
    );
    downloadCsv(doc, "mirn-drill.csv", text);
  });
  bar.appendChild(exportButton);

  const copyButton = doc.createElement("button");
  copyButton.type = "button";
  copyButton.id = "drill-copy-link";
  copyButton.textContent = "Copy link";
  copyButton.addEventListener("click", () => {
    // The "?" is added here, once, at the only place a whole address is assembled — `encodeDrill`
    // returns the bare pairs, the same way `encodeSettings` does for the console.
    const query = `?${encodeDrill(state)}`;
    window.history.replaceState(null, "", query);
    const clipboard = window.navigator.clipboard;
    if (clipboard !== undefined) {
      void clipboard.writeText(`${window.location.origin}${window.location.pathname}${query}`);
    }
  });
  bar.appendChild(copyButton);

  host.appendChild(bar);
  host.appendChild(
    element(
      doc,
      "p",
      "region-note",
      `The link carries the ${countWord(state.order.length)} cards this drill was, and never what ` +
        `you called or how you did: open it and you get the same rooms in the same order, to call ` +
        `for yourself. The file carries one row per card, and opens with the sentence saying the ` +
        `crowd is invented before any number in it.`,
    ),
  );
}

/** The verdict, after the last card: the sentences above, the two ways to take it away, and the
 *  way back into the console. */
function paintVerdict(
  doc: Document,
  host: HTMLElement,
  state: DrillState,
  misleadingCards: readonly boolean[],
  lastCard: CardRun,
  rows: readonly DrillCsvEntry[],
): void {
  const heading = doc.createElement("h2");
  heading.className = "region-title";
  heading.id = "verdict-title";
  heading.textContent = "The verdict";
  host.appendChild(heading);

  for (const entry of verdictLines(state, misleadingCards)) {
    host.appendChild(element(doc, "p", entry.className, entry.text));
  }

  paintVerdictBar(doc, host, state, rows);

  const invitation = doc.createElement("p");
  invitation.className = "verdict-line";
  const link = doc.createElement("a");
  link.className = "verdict-link";
  link.href = consoleLinkFor(lastCard.card, lastCard.run.config.dt);
  link.textContent = "Now open the settings and try to build a card that fools it worse";
  invitation.appendChild(link);
  invitation.appendChild(
    doc.createTextNode(". The link opens the console with this last card's settings already set."),
  );
  host.appendChild(invitation);
}

bootDrill(document);
