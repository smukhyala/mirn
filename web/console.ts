// Tokens are injected rather than duplicated in a generated stylesheet — see boot.ts — so the
// palette has exactly one definition and this page's CSS and canvas cannot drift apart. Imported
// for its side effect: the module mounts the tokens on import.
import "./app/console/boot.js";
import { SIM_CONSTANTS } from "./engine/contracts/config.js";
import { COLUMNS, HEADLINE_COLUMNS } from "./engine/job/columns.js";
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
import type { ConsoleSettings } from "./app/console/state.js";
import { makeTileProps, renderTile, zeroRenderingFor, type BandGauge } from "./app/console/tile.js";
import { anchorFor } from "./ui/labels.js";
import { drawArena, fitCanvas, type ArenaView } from "./ui/arena.js";
import { frameIndexAt, type PlaybackBase } from "./app/clock.js";

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
 * Buying the band, and committing a result to the ledger, is Run's job, wired by a later task.
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
 */
function buildTransport(
  doc: Document,
  host: HTMLElement,
): {
  readonly playpause: HTMLButtonElement;
  readonly scrub: HTMLInputElement;
  readonly clock: HTMLOutputElement;
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

  host.append(playpause, scrubLabel, clockWrap);
  return { playpause, scrub, clock };
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

export function bootConsole(doc: Document): void {
  const settingsHost = el<HTMLElement>(doc, "settings");
  const tilesHost = el<HTMLDivElement>(doc, "readouts");
  const transportHost = el<HTMLDivElement>(doc, "transport");
  const canvas = el<HTMLCanvasElement>(doc, "arena");
  const canvasContext = canvas.getContext("2d");
  if (canvasContext === null) {
    throw new Error("2d canvas context unavailable");
  }
  const { playpause, scrub, clock } = buildTransport(doc, transportHost);

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

  const scheduleRecompute = (values: PanelValues): void => {
    const settings = settingsFromPanel(values);
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

  const render = (): void => {
    const current = preview;
    if (current === null) {
      return;
    }
    const box = fitCanvas(canvas, window.devicePixelRatio);
    const view: ArenaView = {
      widthM: current.config.widthM,
      heightM: current.config.heightM,
      sample,
      nSamples: current.config.nTicks + 1,
      treated: current.run.treated.positions,
      control: current.run.control.positions,
      robot: current.run.treated.robotPositions,
      showControl: true,
      showGaps: true,
      trailSamples: 90,
      pedRadiusM: SIM_CONSTANTS.pedRadiusM,
      robotRadiusM: SIM_CONSTANTS.robotRadiusM,
      highlight: null,
    };
    drawArena(canvasContext, view, box.width, box.height);
    clock.value = (sample * current.config.dt).toFixed(1);
    scrub.value = String(sample);
  };

  const frame = (nowMs: number): void => {
    const current = preview;
    if (current !== null && playing) {
      const nSamples = current.config.nTicks + 1;
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

  scrub.addEventListener("input", () => {
    sample = Number(scrub.value);
    base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
  });

  playpause.addEventListener("click", () => {
    playing = !playing;
    playpause.textContent = playing ? "Pause" : "Play";
    base = { ...base, wallStartMs: performance.now(), sampleAtStart: sample };
  });

  // mountPanel does not call onInput for the settings it starts at, so the very first preview has
  // to be pulled from the handle's own read() rather than waiting on a push that never comes.
  recompute(settingsFromPanel(panel.read()));
  render();
  requestAnimationFrame(frame);
}

bootConsole(document);
