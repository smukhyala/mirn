// Tokens are injected rather than duplicated in a generated stylesheet — see boot.ts — so the
// palette has exactly one definition and this page's CSS and canvas cannot drift apart. Imported
// for its side effect: the module mounts the tokens on import.
import "./app/console/boot.js";
import { SIM_CONSTANTS } from "./engine/contracts/config.js";
import { COLUMNS, COLUMN_ORDER, HEADLINE_COLUMNS, type ColumnKey } from "./engine/job/columns.js";
import type { SweepJob } from "./engine/job/spec.js";
import type { RunRow } from "./engine/job/stats.js";
import { mountPanel, type PanelValues } from "./app/console/panel.js";
import {
  DEBOUNCE_MS,
  isRenderable,
  resolveZero,
  runPreview,
  settingsFromPanel,
  shouldDebounce,
  stampsFor,
  type Preview,
} from "./app/console/preview.js";
import { jobForRun, type ConsoleSettings } from "./app/console/state.js";
import { makeTileProps, renderTile, zeroRenderingFor, type BandGauge } from "./app/console/tile.js";
import { describeCost } from "./app/console/cost.js";
import { labelForCell, makeGroupBuilder, type GroupBuilder, type RunGroup } from "./app/console/group.js";
import { describeSeed, recomputeForPlayback, stepSeed } from "./app/console/playback.js";
import { sweepPlotView } from "./app/console/curve.js";
import { makeSweepClient, spawnSweepWorker, sweepPortFor, type SweepClient } from "./app/worker/client.js";
import type { RunResult } from "./engine/sim/run.js";
import { anchorFor } from "./ui/labels.js";
import { drawArena, fitCanvas, type ArenaView } from "./ui/arena.js";
import { drawSweep, type PlotView } from "./ui/plot.js";
import { frameIndexAt, type PlaybackBase } from "./app/clock.js";
import {
  downloadCsv,
  makeCellRef,
  makeLedgerView,
  renderColumnPicker,
  renderLedger,
  settingsMatchJob,
  STALE_MESSAGE,
  type CellRef,
  type SortKey,
} from "./app/console/table.js";
import { toCsv, makeCsvOptions } from "./app/console/csv.js";
import { encodeSettings } from "./app/console/permalink.js";

/**
 * The console's wiring.
 *
 * Every number this page shows is computed elsewhere — `web/app/console/preview.ts` for the live
 * 1x1 run, `web/app/console/tile.ts` for a headline reading's markup. This file moves those values
 * into the DOM and nothing else: no formula, no wording, no zero-reference arithmetic lives here.
 *
 * Editing a setting re-simulates the preview and repaints the arena and every tile. Nothing here
 * ever buys the run-to-run band — 267 ms is not a keystroke budget — so every tile's gauge is
 * handed `{ kind: "bandNotMeasured" }`, always, regardless of what has actually been measured.
 * The preview's tiles do not repaint when a press of Run finishes, either: `#readouts-note` in
 * console.html says why two of the seven are never shown here, and that stays true after Run as
 * much as before it — a finished press lands in the kept list at the bottom of the page, not back
 * into this preview.
 */

function el<T extends HTMLElement>(doc: Document, id: string): T {
  const node = doc.getElementById(id);
  if (node === null) {
    throw new Error(`missing element #${id}`);
  }
  return node as T;
}

/**
 * The transport strip. Built here rather than written into console.html, matching how `#settings`
 * is populated by `mountPanel` rather than hand-authored: every host named in console.html is an
 * empty mount point, and a later task's markup never has to be reconciled against this file's.
 * The ids and classes match `web/instrument.html`'s static transport exactly, so the `.transport`
 * and `.scrub` rules already in `web/style.css` style this one for free — console.css's own header
 * comment documents that reliance and this file is the reason it is true.
 *
 * The seed stepper is built here too, for the same reason: a cell (a ledger row) has no seed, so
 * this is what picks which run inside it plays. `playing-note` is a sibling of `#transport`
 * rather than a child of it — it is a full block-level line under the transport's own flex row,
 * not another item inside that row — so it is inserted immediately after `host` once `host` is
 * already attached to the document, rather than appended into it.
 */
function buildTransport(
  doc: Document,
  host: HTMLElement,
): {
  readonly playpause: HTMLButtonElement;
  readonly scrub: HTMLInputElement;
  readonly clock: HTMLOutputElement;
  readonly seedPrev: HTMLButtonElement;
  readonly seedNext: HTMLButtonElement;
  readonly seedReadout: HTMLOutputElement;
  readonly playingNote: HTMLParagraphElement;
} {
  const playpause = doc.createElement("button");
  playpause.id = "playpause";
  playpause.type = "button";
  playpause.textContent = "Pause";

  const scrubLabel = doc.createElement("label");
  scrubLabel.className = "scrub";
  const hiddenSpan = doc.createElement("span");
  hiddenSpan.className = "visually-hidden";
  hiddenSpan.textContent = "Timeline";
  const scrub = doc.createElement("input");
  scrub.id = "scrub";
  scrub.type = "range";
  scrub.min = "0";
  scrub.max = "800";
  scrub.step = "1";
  scrub.value = "0";
  scrubLabel.append(hiddenSpan, scrub);

  const clockWrap = doc.createElement("span");
  clockWrap.className = "readout";
  const clock = doc.createElement("output");
  clock.id = "clock";
  clock.value = "0.0";
  clockWrap.append("t ", clock, " s");

  const seedPicker = doc.createElement("span");
  seedPicker.className = "seed-picker";
  const seedPrev = doc.createElement("button");
  seedPrev.id = "seed-prev";
  seedPrev.type = "button";
  seedPrev.setAttribute("aria-label", "previous run in this cell");
  seedPrev.textContent = "<";
  const seedReadout = doc.createElement("output");
  seedReadout.id = "seed-readout";
  seedReadout.value = "seed 1 of 1";
  const seedNext = doc.createElement("button");
  seedNext.id = "seed-next";
  seedNext.type = "button";
  seedNext.setAttribute("aria-label", "next run in this cell");
  seedNext.textContent = ">";
  seedPicker.append(seedPrev, seedReadout, seedNext);

  host.append(playpause, scrubLabel, clockWrap, seedPicker);

  const playingNote = doc.createElement("p");
  playingNote.className = "region-note";
  playingNote.id = "playing-note";
  playingNote.textContent = "Live preview of the settings in the panel.";
  host.insertAdjacentElement("afterend", playingNote);

  return { playpause, scrub, clock, seedPrev, seedNext, seedReadout, playingNote };
}

/**
 * The button, and the cost and status text beside it — built here, not written into
 * `console.html`, for the same reason `buildTransport` above is.
 *
 * `mountPanel` appends its own root into `#settings` (`host.append(root)`), so anything already
 * sitting in that host when the panel mounts ends up ABOVE it in the DOM, not below — the
 * opposite of "the button commits the settings above it". An earlier attempt at this exact button
 * put it directly into `console.html`'s static markup and was reverted for exactly that reason
 * (`git log -- web/console.html`): a button already in the aside pushed the panel below it.
 *
 * The fix is to build this detached — nothing here is attached to the document yet — and let
 * `bootConsole` decide when to attach it: after `mountPanel` has already appended its own root,
 * so this lands after the panel and the button really does sit below the settings it commits.
 */
function buildRunBlock(doc: Document): {
  readonly block: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly cost: HTMLParagraphElement;
  readonly status: HTMLParagraphElement;
} {
  const block = doc.createElement("div");
  block.className = "run-block";

  const button = doc.createElement("button");
  button.id = "run";
  button.type = "button";
  button.className = "run";
  button.textContent = "Run";

  const cost = doc.createElement("p");
  cost.className = "run-cost";
  cost.id = "run-cost";

  const status = doc.createElement("p");
  status.className = "run-status";
  status.id = "run-status";

  block.append(button, cost, status);
  return { block, button, cost, status };
}

function paintTiles(doc: Document, host: HTMLElement, preview: Preview): void {
  const stamps = stampsFor(preview);
  // The gauge is empty during a preview, always: a floor measured at other settings beside this
  // cell's number is the same error the band was already caught making.
  const gauge: BandGauge = { kind: "bandNotMeasured" };

  while (host.firstChild !== null) {
    host.removeChild(host.firstChild);
  }
  for (const key of HEADLINE_COLUMNS) {
    const reading = preview.readings[key];
    if (reading === undefined || !isRenderable(key, preview.context, preview.readings)) {
      // Either the reading itself was never bought (runToRunBandM needs the run-to-run band,
      // which only Run buys), or the reading is measured but its zero-reference is not:
      // worstMomentM needs only "run", but its zero is the companion column worstMomentNullM,
      // which needs the band too. Either way, nothing to show is more honest than a number with
      // no zero beside it.
      continue;
    }
    const descriptor = COLUMNS[key];
    const resolved = resolveZero(key, preview.context, preview.readings);
    let anchor: string | null = null;
    if (descriptor.needsAnchor && reading.availability.kind === "measured") {
      anchor = anchorFor(reading.value);
    }
    const props = makeTileProps({
      column: key,
      label: descriptor.label,
      unit: descriptor.unit,
      reading,
      zero: zeroRenderingFor(descriptor.zero, resolved, descriptor.unit),
      gauge,
      stamps,
      assumption: descriptor.assumption(preview.context),
      anchor,
    });
    host.appendChild(renderTile(doc, props));
  }
}

/** Every finished press of Run, in the order they finished. Task 28's ledger reads this. */
export const keptGroups: RunGroup[] = [];
let running: GroupBuilder | null = null;
let groupCounter = 0;

/** The ledger's own view state. Never persisted (guardrail 10 — no storage beyond the URL, and a
 *  URL carries the recipe, not which row was selected or pinned). */
let selectedCell: CellRef | null = null;
let pinnedCells: CellRef[] = [];
let ledgerColumns: ColumnKey[] = [...HEADLINE_COLUMNS];
let ledgerSort: SortKey = { kind: "byAxis" };
let ledgerDirection: "ascending" | "descending" = "ascending";

/** Which run inside the selected cell is playing, and its rebuilt result. Never persisted, for
 *  the same reason `selectedCell` above is not — a cell has no seed until the operator picks one,
 *  and the URL carries the recipe, not which row or run was being watched. */
let playbackSeedIndex = 0;
let playbackRun: RunResult | null = null;

/**
 * `ConsoleSettings` -> `SweepJob`, the same translation `web/app/console/state.ts`'s own
 * `jobForRun` already performs and `state.test.ts` already covers. This is a thin, deliberately
 * boring wrapper rather than a second implementation: `PanelValues` and `ConsoleSettings` already
 * disagree with each other on names and sentinels for the same concepts (`bandReplicates: number
 * | null` on the panel, `bandReplicates: number` with 0 meaning off on `ConsoleSettings`), and
 * `web/app/console/preview.ts`'s `settingsFromPanel` is the one place that translation happens.
 * Giving the SAME `ConsoleSettings` -> `SweepJob` step a second name and a second body here would
 * be exactly that kind of drift for a third pair of types.
 */
export function jobFromSettings(settings: ConsoleSettings): SweepJob {
  return jobForRun(settings);
}

export function bootConsole(doc: Document): void {
  const settingsHost = el<HTMLElement>(doc, "settings");
  const tilesHost = el<HTMLDivElement>(doc, "readouts");
  const transportHost = el<HTMLDivElement>(doc, "transport");
  const canvas = el<HTMLCanvasElement>(doc, "arena");
  const canvasContext = canvas.getContext("2d");
  if (canvasContext === null) {
    throw new Error("2d canvas context unavailable");
  }
  const { playpause, scrub, clock, seedPrev, seedNext, seedReadout, playingNote } = buildTransport(
    doc,
    transportHost,
  );
  const { block: runBlock, button: runButton, cost: runCost, status: runStatus } = buildRunBlock(doc);
  const progressRule = el<HTMLDivElement>(doc, "progress-rule");
  const ledgerHost = el<HTMLDivElement>(doc, "ledger");
  const columnsPanel = el<HTMLDivElement>(doc, "columns-panel");
  const columnsToggle = el<HTMLButtonElement>(doc, "columns-toggle");
  const exportButton = el<HTMLButtonElement>(doc, "export-csv");
  const copyButton = el<HTMLButtonElement>(doc, "copy-link");
  const clearButton = el<HTMLButtonElement>(doc, "clear-kept");
  const curveBlock = el<HTMLElement>(doc, "sweep-block");
  const curveCanvas = el<HTMLCanvasElement>(doc, "sweep");
  const curveLegend = el<HTMLUListElement>(doc, "sweep-legend");
  const curveContext = curveCanvas.getContext("2d");

  let preview: Preview | null = null;
  let playing = true;
  let sample = 0;
  let base: PlaybackBase = { wallStartMs: 0, sampleAtStart: 0, dtMs: 50, rate: 1 };
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const recompute = (settings: ConsoleSettings): void => {
    const next = runPreview(settings);
    preview = next;
    const nSamples = next.config.nTicks + 1;
    scrub.max = String(nSamples - 1);
    if (sample > nSamples - 1) {
      sample = nSamples - 1;
    }
    base = {
      wallStartMs: performance.now(),
      sampleAtStart: sample,
      dtMs: next.config.dt * 1000,
      rate: 1,
    };
    paintTiles(doc, tilesHost, next);
  };

  const setProgress = (fraction: number): void => {
    let clamped = fraction;
    if (clamped < 0) {
      clamped = 0;
    }
    if (clamped > 1) {
      clamped = 1;
    }
    progressRule.style.setProperty("--mirn-progress", String(clamped));
    progressRule.setAttribute("aria-valuenow", String(Math.round(clamped * 100)));
  };

  const setIdle = (): void => {
    running = null;
    runButton.textContent = "Run";
    setProgress(0);
  };

  const priceThePress = (settings: ConsoleSettings): void => {
    // A run in progress has its own status text ("simulating · 14 of 56", "Cancelling — ..."),
    // which this must not overwrite: the operator can still nudge a slider while a sweep runs,
    // and the price of a press they have not made yet is not news worth interrupting one they have.
    if (running !== null) {
      return;
    }
    // Recomputed from the panel every time it moves, so the figure beside the button is never a
    // price for a sweep the operator has already changed.
    try {
      runCost.textContent = describeCost(jobFromSettings(settings));
      runStatus.textContent = "";
    } catch (error) {
      runCost.textContent = "";
      runStatus.textContent = `These settings cannot be run: ${(error as Error).message}`;
    }
  };

  // A run finishing is itself a moment the price can go stale at: the operator could have nudged
  // a slider while it ran, and priceThePress's own early return (above) skips every update made
  // while `running !== null`. Called once the completion handlers below have reset `running` to
  // null, so it prices whatever the panel reads right now rather than what it read when Run was
  // last pressed. Each caller overwrites `runStatus` immediately afterward with its own message
  // ("Finished. Kept below.", "Cancelled. Nothing was kept.", ...), so this never has the last
  // word on the status line — only on the cost line.
  const refreshPrice = (): void => {
    priceThePress(settingsFromPanel(panel.read()));
    renderKept();
  };

  const currentView = (): ReturnType<typeof makeLedgerView> => {
    // Stale is derived from the panel against the MOST RECENTLY KEPT group's own job, never
    // stored. A status nobody can persist is a status nobody can persist wrongly.
    // `selectedCell` is not what this checks against: the brief that shipped it named it "the
    // selected result's own job", but `CellRef`/`selectedCell` are the row a click chose for
    // playback (Task 29's transport picks which run inside a cell plays), and a fresh ledger with
    // one kept result and nothing yet clicked has `selectedCell === null` — which would make the
    // whole ledger permanently unable to grey until a row was clicked, even though the panel
    // plainly no longer matches what is on screen. The last-completed press of Run is what a
    // reader compares the panel to without clicking anything.
    // `settingsFromPanel` (not a `readPanel` helper — nothing in this codebase exports one) is the
    // one existing translator from what `mountPanel` hands back to a `ConsoleSettings`, the same
    // one every other read of the panel in this file already goes through (`priceThePress`, the
    // Run handler, `refreshPrice`).
    let stale: string | null = null;
    const lastGroup = keptGroups[keptGroups.length - 1];
    if (lastGroup !== undefined && !settingsMatchJob(settingsFromPanel(panel.read()), lastGroup.job)) {
      stale = STALE_MESSAGE;
    }
    return makeLedgerView({
      groups: keptGroups,
      columns: ledgerColumns,
      selected: selectedCell,
      pinned: pinnedCells,
      sort: ledgerSort,
      direction: ledgerDirection,
      staleMessage: stale,
    });
  };

  const renderKept = (): void => {
    while (ledgerHost.firstChild !== null) {
      ledgerHost.removeChild(ledgerHost.firstChild);
    }
    if (keptGroups.length === 0) {
      const empty = doc.createElement("p");
      empty.className = "kept-empty";
      empty.id = "kept-empty";
      empty.textContent = "No results kept yet.";
      ledgerHost.appendChild(empty);
      return;
    }
    const view = currentView();
    ledgerHost.appendChild(renderLedger(doc, view));
    while (columnsPanel.firstChild !== null) {
      columnsPanel.removeChild(columnsPanel.firstChild);
    }
    columnsPanel.appendChild(renderColumnPicker(doc, view));
  };

  const selectedGroup = (): RunGroup | null => {
    if (selectedCell === null) {
      return null;
    }
    for (const group of keptGroups) {
      if (group.id === selectedCell.groupId) {
        return group;
      }
    }
    return null;
  };

  /**
   * Rebuilds the legend from what `sweepPlotView` actually drew, rather than a hand-written list
   * of three items — the same reason a censored point breaks the line instead of a caption
   * asserting a floor that was never drawn: the legend must never claim a series the figure above
   * it does not have. Mirrors web/notes.ts's own dynamic-legend construction for the identical
   * plot, reusing its swatch classes (`legend-accent`, `legend-grey-N`) for the two lines; the
   * band gets `legend-region`, the one swatch kind that widget never needed.
   */
  const renderLegend = (view: PlotView): void => {
    while (curveLegend.firstChild !== null) {
      curveLegend.removeChild(curveLegend.firstChild);
    }
    let greyIndex = 0;
    for (const s of view.series) {
      const item = doc.createElement("li");
      if (s.accent === true) {
        item.className = "legend-accent";
      } else {
        item.className = `legend-grey-${greyIndex % 3}`;
        greyIndex++;
      }
      item.textContent = s.label;
      curveLegend.appendChild(item);
    }
    for (const region of view.regions ?? []) {
      const item = doc.createElement("li");
      item.className = "legend-region";
      item.textContent = region.label;
      curveLegend.appendChild(item);
    }
  };

  const drawCurve = (): void => {
    const group = selectedGroup();
    if (group === null || curveContext === null) {
      curveBlock.hidden = true;
      return;
    }
    const view = sweepPlotView(group);
    if (view === null) {
      curveBlock.hidden = true;
      return;
    }
    curveBlock.hidden = false;
    renderLegend(view);
    const box = fitCanvas(curveCanvas, window.devicePixelRatio);
    drawSweep(curveContext, view, box.width, box.height);
  };

  const playSelected = (): void => {
    const group = selectedGroup();
    if (group === null || selectedCell === null) {
      playbackRun = null;
      playingNote.textContent = "Live preview of the settings in the panel.";
      seedReadout.value = "seed 1 of 1";
      return;
    }
    // Rebuilt, not stored. Determinism is what makes this the same run the worker measured.
    playbackRun = recomputeForPlayback(group.job, selectedCell.axisIndex, playbackSeedIndex);
    seedReadout.value = describeSeed(group.job.seedIndices, playbackSeedIndex);
    playingNote.textContent = `Playing ${labelForCell(group.job, selectedCell.axisIndex)}.`;
    sample = 0;
    base = {
      wallStartMs: performance.now(),
      sampleAtStart: 0,
      dtMs: playbackRun.config.dt * 1000,
      rate: 1,
    };
    scrub.max = String(playbackRun.config.nTicks);
  };

  seedPrev.addEventListener("click", () => {
    const group = selectedGroup();
    if (group === null) {
      return;
    }
    playbackSeedIndex = stepSeed(playbackSeedIndex, -1, group.job.seedIndices);
    playSelected();
  });

  seedNext.addEventListener("click", () => {
    const group = selectedGroup();
    if (group === null) {
      return;
    }
    playbackSeedIndex = stepSeed(playbackSeedIndex, 1, group.job.seedIndices);
    playSelected();
  });

  ledgerHost.addEventListener("click", (event: Event) => {
    const target = event.target as HTMLElement;
    const heading = target.closest(".ledger-heading");
    if (heading !== null) {
      const column = heading.getAttribute("data-column");
      if (column !== null) {
        ledgerSort = { kind: "byColumn", column: column as ColumnKey };
        ledgerDirection = ledgerDirection === "ascending" ? "descending" : "ascending";
        renderKept();
      }
      return;
    }
    const rowNode = target.closest(".ledger-row");
    if (rowNode === null) {
      return;
    }
    const groupId = rowNode.getAttribute("data-group-id") ?? "";
    const axisIndex = Number(rowNode.getAttribute("data-axis-index") ?? "0");
    const ref = makeCellRef({ groupId, axisIndex });
    if (target.classList.contains("pin")) {
      const remaining: CellRef[] = [];
      let removed = false;
      for (const pin of pinnedCells) {
        if (pin.groupId === ref.groupId && pin.axisIndex === ref.axisIndex) {
          removed = true;
        } else {
          remaining.push(pin);
        }
      }
      pinnedCells = removed ? remaining : [...pinnedCells, ref];
      renderKept();
      return;
    }
    selectedCell = ref;
    playbackSeedIndex = 0;
    playSelected();
    drawCurve();
    renderKept();
  });

  columnsToggle.addEventListener("click", () => {
    columnsPanel.hidden = !columnsPanel.hidden;
  });
  columnsPanel.addEventListener("change", (event: Event) => {
    const box = event.target as HTMLInputElement;
    const key = box.value as ColumnKey;
    const next: ColumnKey[] = [];
    for (const candidate of COLUMN_ORDER) {
      const isThis = candidate === key;
      const wasOn = ledgerColumns.includes(candidate);
      const nowOn = isThis ? box.checked : wasOn;
      if (nowOn) {
        next.push(candidate);
      }
    }
    if (next.length === 0) {
      return;
    }
    ledgerColumns = next;
    renderKept();
  });

  exportButton.addEventListener("click", () => {
    // Every kept group, one file each: the CSV's own provenance header (csv.ts) names the axis
    // swept and its values, and merging two different sweeps under one header would misdescribe
    // one of them. `toCsv` always reports every column the job actually bought (`job.columns`),
    // not just the ones ticked in the ledger's column picker — the export is the complete record,
    // the ledger a filtered view onto it, and there is no second grouping implementation here to
    // filter it with.
    for (const group of keptGroups) {
      const text = toCsv(
        group.job,
        group.rows,
        makeCsvOptions({ generatedAtIso: new Date(group.completedAtMs).toISOString() }),
      );
      downloadCsv(doc, `mirn-${group.id}.csv`, text);
    }
  });

  copyButton.addEventListener("click", () => {
    // Settings, never results. A link carrying a measured value asserts a number the current code
    // did not produce; change a formula and the old link quotes the old answer with this page's
    // authority. `encodeSettings` returns the bare key=value pairs with no leading "?"
    // (permalink.test.ts's own "tolerates a leading question mark" case is the tell: decodeSettings
    // has to strip one, which only makes sense if encodeSettings never wrote one), so the "?" is
    // added here, once, at the only place a full URL gets assembled.
    const query = `?${encodeSettings(settingsFromPanel(panel.read()))}`;
    window.history.replaceState(null, "", query);
    const clipboard = window.navigator.clipboard;
    if (clipboard !== undefined) {
      void clipboard.writeText(`${window.location.origin}${window.location.pathname}${query}`);
    }
  });

  clearButton.addEventListener("click", () => {
    keptGroups.length = 0;
    pinnedCells = [];
    selectedCell = null;
    playSelected();
    drawCurve();
    renderKept();
  });

  // Spawned lazily, on the first press of Run, not here: booting the page must not require a
  // `Worker` to exist. Nothing before the first press needs the worker thread running, and
  // `web/app/console/__tests__/boot.test.ts` boots the real, unmocked module to check the preview
  // tiles alone — spawning one eagerly made that throw in an environment with no `Worker` global.
  let client: SweepClient | null = null;

  const ensureClient = (): SweepClient => {
    if (client === null) {
      client = makeSweepClient(sweepPortFor(spawnSweepWorker()), {
        onProgress: (unitsDone: number, unitsTotal: number, phase: string): void => {
          setProgress(unitsTotal === 0 ? 0 : unitsDone / unitsTotal);
          runStatus.textContent = `${phase} · ${unitsDone} of ${unitsTotal}`;
        },
        onRow: (row: RunRow): void => {
          running?.addRow(row);
        },
        onBand: (axisIndex: number, meanM: number, peakM: number, nReplicates: number): void => {
          running?.addBand({ kind: "bandReading", axisIndex, meanM, peakM, nReplicates });
        },
        onDone: (): void => {
          // `running` is read into a local before `setIdle()` clears the module-level variable to
          // null, and `job`/`rows`/`bands` were captured inside the builder back when the button
          // was pressed — never re-read from the panel here. A ledger row describes the run that
          // produced it, not whatever the panel says now; the panel may already read differently
          // if the operator nudged a slider while this sweep was running.
          const builder = running;
          if (builder !== null) {
            groupCounter++;
            keptGroups.push(builder.finish({ id: `group-${groupCounter}`, completedAtMs: Date.now() }));
            renderKept();
          }
          setIdle();
          refreshPrice();
          runStatus.textContent = "Finished. Kept below.";
        },
        onCancelled: (): void => {
          setIdle();
          refreshPrice();
          runStatus.textContent = "Cancelled. Nothing was kept.";
        },
        onFailed: (message: string): void => {
          setIdle();
          refreshPrice();
          runStatus.textContent = `The sweep stopped: ${message}`;
        },
      });
    }
    return client;
  };

  runButton.addEventListener("click", () => {
    if (running !== null) {
      // Cancel is a flag the worker checks BETWEEN units, never mid-unit, so this is never
      // instant: worst case is one unit that also draws an 8-replicate band at 44 people, about
      // 740 ms. "Cancelling" is said here because it is already true the moment the flag is set —
      // never "Cancelled", which onCancelled alone is allowed to say, once the worker confirms it.
      ensureClient().cancel();
      runStatus.textContent = "Cancelling — this finishes the run already in progress first.";
      return;
    }
    let job: SweepJob;
    try {
      job = jobFromSettings(settingsFromPanel(panel.read()));
    } catch (error) {
      runStatus.textContent = `These settings cannot be run: ${(error as Error).message}`;
      return;
    }
    running = makeGroupBuilder(job);
    runButton.textContent = "Cancel";
    setProgress(0);
    runStatus.textContent = "starting";
    ensureClient().start(job);
  });

  const scheduleRecompute = (values: PanelValues): void => {
    const settings = settingsFromPanel(values);
    priceThePress(settings);
    renderKept();
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (shouldDebounce(settings)) {
      // A big crowd costs 92 ms and up per run, so the drag would stutter under a per-event
      // recompute. The trailing edge only, and the panel's own note says so beside the slider.
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        recompute(settings);
      }, DEBOUNCE_MS);
      return;
    }
    recompute(settings);
  };

  /**
   * Playback wins over the live preview: once a kept row is selected, the arena shows the
   * rebuilt run for that cell's chosen seed, not whatever the settings panel currently reads.
   * `frame()` and `render()` both have to agree on this, not just `render()` — `frame()` uses
   * `config.nTicks` to decide when a loop wraps, and the panel's current nTicks can easily differ
   * from the kept run's own, which would otherwise wrap or truncate the playback at the wrong
   * length while `render()` drew from the right one.
   */
  const activeRun = (): { readonly run: RunResult; readonly config: RunResult["config"] } | null => {
    if (playbackRun !== null) {
      return { run: playbackRun, config: playbackRun.config };
    }
    if (preview !== null) {
      return { run: preview.run, config: preview.config };
    }
    return null;
  };

  const render = (): void => {
    const active = activeRun();
    if (active === null) {
      return;
    }
    const current = active.run;
    const config = active.config;
    const box = fitCanvas(canvas, window.devicePixelRatio);
    const view: ArenaView = {
      widthM: config.widthM,
      heightM: config.heightM,
      sample,
      nSamples: config.nTicks + 1,
      treated: current.treated.positions,
      control: current.control.positions,
      robot: current.treated.robotPositions,
      showControl: true,
      showGaps: true,
      trailSamples: 90,
      pedRadiusM: SIM_CONSTANTS.pedRadiusM,
      robotRadiusM: SIM_CONSTANTS.robotRadiusM,
      highlight: null,
    };
    drawArena(canvasContext, view, box.width, box.height);
    clock.value = (sample * config.dt).toFixed(1);
    scrub.value = String(sample);
  };

  const frame = (nowMs: number): void => {
    const active = activeRun();
    if (active !== null && playing) {
      const nSamples = active.config.nTicks + 1;
      const next = frameIndexAt(nowMs, base, nSamples);
      if (next >= nSamples - 1) {
        sample = 0;
        base = { ...base, wallStartMs: nowMs, sampleAtStart: 0 };
      } else {
        sample = next;
      }
    }
    render();
    requestAnimationFrame(frame);
  };

  const panel = mountPanel(settingsHost, { onInput: scheduleRecompute });
  // mountPanel appends its own root last, so the run block — built detached above specifically so
  // it could be attached only now — lands after it: the button sits below the settings it commits.
  settingsHost.append(runBlock);

  scrub.addEventListener("input", () => {
    sample = Number(scrub.value);
    base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
  });

  playpause.addEventListener("click", () => {
    playing = !playing;
    playpause.textContent = playing ? "Pause" : "Play";
    base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
  });

  // mountPanel does not call onInput for the settings it starts at, so the very first preview and
  // the very first price both have to be pulled from the handle's own read() rather than waiting
  // on a push that never comes.
  const initialSettings = settingsFromPanel(panel.read());
  priceThePress(initialSettings);
  recompute(initialSettings);
  render();
  renderKept();
  requestAnimationFrame(frame);
}

bootConsole(document);
