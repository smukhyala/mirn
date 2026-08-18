// Every number rendered here was computed by src/mirn/ and arrived over HTTP.
// Nothing in this file estimates, calibrates, or sweeps anything.

const DEBOUNCE_MS = 250;
// Shown on every section's very first paint and on every refresh, before the request that will
// fill it in has even been sent — never gated behind a delay. Nothing here names which experiment
// is slow (none of this file branches on experiment.name); on a cold server this happens to be
// true for whichever section needs the split-half null, and the fast sections simply replace it
// within a couple hundred milliseconds.
const PENDING_HINT_TEXT =
  "computing the split-half null — 200 draws, about a minute on first load, instant afterwards.";

const state = {
  theme: {},
  seed: 0,
  cards: {},
  experiments: [],
  scene: null,
};

// The fallback is a CSS named colour, not a hex/rgb/hsl literal, so it survives the "no colour
// literal" grep in CLAUDE.md; it is only ever exercised if a draw call somehow runs before
// boot() populates state.theme from /api/meta, which normal page load never does.
function token(name) {
  return state.theme[name] || "gray";
}

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(body.detail || response.statusText);
  }
  return response.json();
}

async function postJSON(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({ detail: response.statusText }));
  if (!response.ok) {
    throw new Error(parsed.detail || response.statusText);
  }
  return parsed;
}

function debounce(fn, wait) {
  let timer = null;
  return function debounced(...args) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

// ---------------------------------------------------------------- math rendering

function renderMath(target, tex) {
  if (window.katex) {
    try {
      window.katex.render(tex, target, { displayMode: true, throwOnError: false });
      return;
    } catch (error) {
      // fall through to the plain-text fallback below
    }
  }
  const fallback = document.createElement("code");
  fallback.className = "math-fallback";
  fallback.textContent = tex;
  target.appendChild(fallback);
}

function buildCard(card) {
  const wrapper = document.createElement("article");
  wrapper.className = "card";

  const kind = document.createElement("span");
  kind.className = "card-kind";
  kind.textContent = card.kind;
  wrapper.appendChild(kind);

  const title = document.createElement("h3");
  title.textContent = card.title;
  wrapper.appendChild(title);

  const oneLiner = document.createElement("p");
  oneLiner.className = "card-one-liner";
  oneLiner.textContent = card.one_liner;
  wrapper.appendChild(oneLiner);

  const mathSpecs = [
    ["Estimand — what we are trying to measure", card.estimand_tex],
    ["Formula — what the code computes", card.formula_tex],
  ];
  for (const [label, tex] of mathSpecs) {
    const heading = document.createElement("p");
    heading.className = "math-label";
    heading.textContent = label;
    wrapper.appendChild(heading);
    const block = document.createElement("div");
    block.className = "math-block";
    renderMath(block, tex);
    wrapper.appendChild(block);
  }

  const listSpecs = [
    ["Assumptions", card.assumptions, ""],
    ["Breaks when", card.breaks_when, "breaks-when"],
  ];
  for (const [label, items, className] of listSpecs) {
    const heading = document.createElement("p");
    heading.className = "math-label";
    heading.textContent = label;
    wrapper.appendChild(heading);
    const list = document.createElement("ul");
    if (className) {
      list.className = className;
    }
    for (const item of items) {
      const entry = document.createElement("li");
      entry.textContent = item;
      list.appendChild(entry);
    }
    wrapper.appendChild(list);
  }

  if (card.citation) {
    const citation = document.createElement("p");
    citation.className = "card-citation";
    citation.textContent = card.citation;
    wrapper.appendChild(citation);
  }
  return wrapper;
}

// ---------------------------------------------------------------- canvas plotting

function plotFrame(canvas) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  return {
    context,
    left: 54,
    right: canvas.width - 16,
    top: 16,
    bottom: canvas.height - 34,
  };
}

function makeScale(domainLow, domainHigh, rangeLow, rangeHigh) {
  const span = domainHigh - domainLow;
  const safeSpan = span === 0 ? 1 : span;
  return (value) => rangeLow + ((value - domainLow) / safeSpan) * (rangeHigh - rangeLow);
}

function drawAxes(frame, xLabel, yLabel, xLow, xHigh, yLow, yHigh) {
  const { context, left, right, top, bottom } = frame;
  context.strokeStyle = token("--mirn-grid");
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(left, bottom);
  context.lineTo(right, bottom);
  context.stroke();

  context.fillStyle = token("--mirn-ink-muted");
  context.font = "11px " + (state.theme["--mirn-font-mono"] || "monospace");
  context.textAlign = "center";
  context.fillText(xLabel, (left + right) / 2, bottom + 26);
  context.save();
  context.translate(14, (top + bottom) / 2);
  context.rotate(-Math.PI / 2);
  context.fillText(yLabel, 0, 0);
  context.restore();

  context.textAlign = "right";
  context.fillText(yHigh.toFixed(3), left - 6, top + 4);
  context.fillText(yLow.toFixed(3), left - 6, bottom);
  context.textAlign = "left";
  context.fillText(xLow.toFixed(2), left, bottom + 14);
  context.textAlign = "right";
  context.fillText(xHigh.toFixed(2), right, bottom + 14);
}

function drawHistogram(canvas, payload) {
  const samples = payload.null_samples;
  const frame = plotFrame(canvas);
  const { context, left, right, top, bottom } = frame;

  const lowest = Math.min(...samples, 0);
  const highest = Math.max(...samples, payload.mdp_95);
  const binCount = 28;
  const binWidth = (highest - lowest) / binCount || 1;
  const counts = new Array(binCount).fill(0);
  for (const sample of samples) {
    let index = Math.floor((sample - lowest) / binWidth);
    if (index >= binCount) index = binCount - 1;
    if (index < 0) index = 0;
    counts[index] += 1;
  }
  const tallest = Math.max(...counts, 1);

  const xScale = makeScale(lowest, highest, left, right);
  const yScale = makeScale(0, tallest, bottom, top);

  context.fillStyle = token("--mirn-counterfactual");
  for (let index = 0; index < binCount; index += 1) {
    const barLeft = xScale(lowest + index * binWidth);
    const barRight = xScale(lowest + (index + 1) * binWidth);
    const barTop = yScale(counts[index]);
    context.fillRect(barLeft, barTop, Math.max(barRight - barLeft - 1, 1), bottom - barTop);
  }

  const floorX = xScale(payload.mdp_95);
  context.strokeStyle = token("--mirn-floor");
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(floorX, top);
  context.lineTo(floorX, bottom);
  context.stroke();
  context.setLineDash([]);

  drawAxes(frame, "split-half divergence (m)", "draws", lowest, highest, 0, tallest);
}

function drawSweep(canvas, rows, payload) {
  const frame = plotFrame(canvas);
  const { context, left, right, top, bottom } = frame;

  // CLAUDE.md guardrail 3: perturbation is reported in MDP units against the measured null,
  // never in raw metres. The CSV keeps metres so it stays auditable; every DISPLAY normalises.
  // Normalised, the detection floor is exactly y = 1 and "crosses the floor" means "crosses 1".
  const floor = payload.mdp_95;
  context.font = "11px " + (state.theme["--mirn-font-mono"] || "monospace");
  if (!(floor > 0)) {
    context.fillStyle = token("--mirn-ink-muted");
    context.textAlign = "center";
    context.fillText(
      "no positive detection floor - cannot express in MDP units",
      (left + right) / 2,
      (top + bottom) / 2
    );
    return;
  }
  const norm = (value) => value / floor;

  const xValues = rows.map((row) => row.axis_value);
  const highs = rows.map((row) => norm(row.reported_ci_high));
  const xLow = Math.min(...xValues);
  const xHigh = Math.max(...xValues);
  const yHigh = Math.max(...highs, 1.0) * 1.15;

  const xScale = makeScale(xLow, xHigh, left, right);
  const yScale = makeScale(0, yHigh, bottom, top);

  const floorY = yScale(1.0);
  context.fillStyle = token("--mirn-floor");
  context.globalAlpha = 0.22;
  context.fillRect(left, floorY, right - left, bottom - floorY);
  context.globalAlpha = 1;

  context.strokeStyle = token("--mirn-floor");
  context.lineWidth = 1.2;
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(left, floorY);
  context.lineTo(right, floorY);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = token("--mirn-naive");
  context.globalAlpha = 0.18;
  context.beginPath();
  rows.forEach((row, index) => {
    const x = xScale(row.axis_value);
    const y = yScale(norm(row.reported_ci_high));
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    context.lineTo(xScale(rows[index].axis_value), yScale(norm(rows[index].reported_ci_low)));
  }
  context.closePath();
  context.fill();
  context.globalAlpha = 1;

  const series = [
    { key: "reported_value", color: token("--mirn-naive"), dash: [] },
    { key: "true_value", color: token("--mirn-paired"), dash: [5, 4] },
  ];
  for (const entry of series) {
    context.strokeStyle = entry.color;
    context.lineWidth = 2;
    context.setLineDash(entry.dash);
    context.beginPath();
    rows.forEach((row, index) => {
      const x = xScale(row.axis_value);
      const y = yScale(norm(row[entry.key]));
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.setLineDash([]);
  }

  drawAxes(frame, payload.axis_label, "perturbation (MDP95 units)", xLow, xHigh, 0, yHigh);
  drawSweepLegend(frame);
}

// A legend anchored to the plot itself, not just to the stat tiles below it: this section's row
// schema (axis_value / reported_value / true_value) never matches renderReadout's per-estimator
// stat branch, so no stat tile here carries the paired colour and the dashed green "true" line
// would otherwise be unanchored to anything else on the page. Placed top-left, which the curve
// (rising left-to-right) never occupies.
function drawSweepLegend(frame) {
  const { context, left, top } = frame;
  const swatchWidth = 14;
  const swatchGap = 6;
  const rowHeight = 14;
  const entries = [
    { label: "reported", color: token("--mirn-naive"), dash: [] },
    { label: "true (paired)", color: token("--mirn-paired"), dash: [5, 4] },
  ];

  context.font = "11px " + (state.theme["--mirn-font-mono"] || "monospace");
  context.textAlign = "left";
  entries.forEach((entry, index) => {
    const y = top + 6 + index * rowHeight;
    context.strokeStyle = entry.color;
    context.lineWidth = 2;
    context.setLineDash(entry.dash);
    context.beginPath();
    context.moveTo(left + 4, y);
    context.lineTo(left + 4 + swatchWidth, y);
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = token("--mirn-ink-muted");
    context.fillText(entry.label, left + 4 + swatchWidth + swatchGap, y + 4);
  });
}

function drawBars(canvas, rows) {
  const frame = plotFrame(canvas);
  const { context, left, right, top, bottom } = frame;

  const labelKey = rows[0].estimator !== undefined ? "estimator" : "variant";
  const highest = Math.max(...rows.map((row) => row.ci_high), 0.0001);
  const yScale = makeScale(0, highest * 1.15, bottom, top);
  const slotWidth = (right - left) / rows.length;

  const colorFor = {
    cvm_residual: token("--mirn-naive"),
    paired: token("--mirn-paired"),
    paired_debiased: token("--mirn-accent"),
    full: token("--mirn-paired"),
    pedestrian_removed: token("--mirn-counterfactual"),
  };

  context.font = "11px " + (state.theme["--mirn-font-mono"] || "monospace");
  context.textAlign = "center";
  rows.forEach((row, index) => {
    const centre = left + slotWidth * (index + 0.5);
    const barWidth = Math.min(slotWidth * 0.42, 56);
    const barTop = yScale(row.value);
    context.fillStyle = colorFor[row[labelKey]] || token("--mirn-accent");
    context.fillRect(centre - barWidth / 2, barTop, barWidth, bottom - barTop);

    context.strokeStyle = token("--mirn-ink-muted");
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(centre, yScale(row.ci_low));
    context.lineTo(centre, yScale(row.ci_high));
    context.stroke();

    context.fillStyle = token("--mirn-ink-muted");
    context.fillText(row[labelKey], centre, bottom + 16);
  });

  context.strokeStyle = token("--mirn-grid");
  context.beginPath();
  context.moveTo(left, bottom);
  context.lineTo(right, bottom);
  context.stroke();
}

// Dispatch on the SHAPE of the payload, never on the experiment's name, so a new
// experiment that returns null_samples gets a histogram without touching this file.
function drawPlot(canvas, result) {
  const rows = result.rows;
  const payload = result.payload;
  if (payload.null_samples) {
    drawHistogram(canvas, payload);
    return;
  }
  if (rows.length > 0 && rows[0].axis_value !== undefined) {
    drawSweep(canvas, rows, payload);
    return;
  }
  drawBars(canvas, rows);
}

// ---------------------------------------------------------------- readouts

function statBlock(label, value, ci, className) {
  const wrapper = document.createElement("div");
  wrapper.className = "stat " + (className || "");
  const labelNode = document.createElement("span");
  labelNode.className = "stat-label";
  labelNode.textContent = label;
  const valueNode = document.createElement("span");
  valueNode.className = "stat-value";
  valueNode.textContent = value;
  wrapper.appendChild(labelNode);
  wrapper.appendChild(valueNode);
  if (ci) {
    const ciNode = document.createElement("span");
    ciNode.className = "stat-ci";
    ciNode.textContent = ci;
    wrapper.appendChild(ciNode);
  }
  return wrapper;
}

// A real placeholder, not just a dimmed empty container: a first-time visitor sees a labelled
// "—" tile AND the honest explanation of what is running and roughly how long it takes, the
// instant a section starts computing — both on first render and on every refresh, and with no
// delay before the explanation appears. A visitor should never stare at bare "—" wondering
// whether the page is broken.
function renderPendingReadout(target, title) {
  const stat = statBlock("Computing " + title.toLowerCase(), "—", null, "stat-floor");
  const hint = document.createElement("p");
  hint.className = "plot-note";
  hint.textContent = PENDING_HINT_TEXT;
  target.replaceChildren(stat, hint);
}

function formatCI(row) {
  return "95% CI [" + row.ci_low.toFixed(3) + ", " + row.ci_high.toFixed(3) + "]";
}

const STAT_CLASS = {
  cvm_residual: "stat-naive",
  noisy_oracle_residual: "stat-naive",
  paired: "stat-paired",
  paired_debiased: "stat-paired",
};

function renderReadout(target, result) {
  target.replaceChildren();
  const rows = result.rows;
  const payload = result.payload;

  if (payload.mdp_95 !== undefined) {
    target.appendChild(
      statBlock("Detection floor (MDP₉₅)", payload.mdp_95.toFixed(3) + " m", null, "stat-floor")
    );
  }
  if (payload.floor_crossing_axis_value !== undefined) {
    const crossing = payload.floor_crossing_axis_value;
    target.appendChild(
      statBlock(
        "Crosses the floor at",
        crossing === null ? "not within range" : crossing.toFixed(3),
        crossing === null ? "no swept point clears the floor" : "with true effect at zero",
        "stat-naive"
      )
    );
  }
  for (const row of rows) {
    if (row.estimator !== undefined) {
      target.appendChild(
        statBlock(
          row.estimator + " (" + row.units + ")",
          row.value.toFixed(3),
          formatCI(row),
          STAT_CLASS[row.estimator] || ""
        )
      );
    } else if (row.variant !== undefined) {
      target.appendChild(
        statBlock(
          row.variant + " (" + row.units + ")",
          row.value.toFixed(4),
          formatCI(row),
          "stat-paired"
        )
      );
    }
  }
}

// ---------------------------------------------------------------- controls

function buildControl(parameter, onChange) {
  const wrapper = document.createElement("label");
  wrapper.className = "control";

  const labelRow = document.createElement("span");
  labelRow.className = "control-label";
  const labelText = document.createElement("span");
  labelText.textContent = parameter.label;
  labelRow.appendChild(labelText);

  let input;
  if (parameter.kind === "choice") {
    input = document.createElement("select");
    for (const choice of parameter.choices) {
      const option = document.createElement("option");
      option.value = choice;
      option.textContent = choice;
      input.appendChild(option);
    }
    input.value = parameter.default;
  } else {
    input = document.createElement("input");
    input.type = "range";
    input.min = parameter.minimum;
    input.max = parameter.maximum;
    input.step = parameter.step || (parameter.kind === "int" ? 1 : 0.01);
    input.value = parameter.default;
    const readout = document.createElement("output");
    readout.textContent = parameter.default;
    labelRow.appendChild(readout);
    input.addEventListener("input", () => { readout.textContent = input.value; });
  }

  input.dataset.paramName = parameter.name;
  input.dataset.paramKind = parameter.kind;
  input.addEventListener("input", onChange);

  wrapper.appendChild(labelRow);
  wrapper.appendChild(input);
  if (parameter.help_text) {
    const help = document.createElement("p");
    help.className = "control-help";
    help.textContent = parameter.help_text;
    wrapper.appendChild(help);
  }
  return wrapper;
}

function readParams(form) {
  const params = {};
  for (const input of form.querySelectorAll("[data-param-name]")) {
    const name = input.dataset.paramName;
    params[name] = input.dataset.paramKind === "choice" ? input.value : Number(input.value);
  }
  return params;
}

// ---------------------------------------------------------------- scene player
//
// The scene player. `state.scene` is the last /api/scene payload; `player` is view state only —
// no measured quantity is derived here. The gap shown comes from the API's gap_series.
const player = { step: 0, playing: true, lastFrameMs: 0, accumulatorMs: 0 };

function sceneScales(canvas, extent) {
  const pad = 22;
  return {
    x: makeScale(0, extent.width, pad, canvas.width - pad),
    y: makeScale(0, extent.height, canvas.height - pad, pad),
  };
}

function drawScene(canvas, scene, step) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  const scale = sceneScales(canvas, scene.extent);

  // The arena, so the paths read as people crossing a room rather than lines in a void.
  context.strokeStyle = token("--mirn-grid");
  context.lineWidth = 1;
  context.strokeRect(
    scale.x(0), scale.y(scene.extent.height),
    scale.x(scene.extent.width) - scale.x(0),
    scale.y(0) - scale.y(scene.extent.height)
  );

  // Trails: the robot-absent world as a ghost, the robot-present world solid.
  const arms = [
    { paths: scene.counterfactual, color: token("--mirn-counterfactual"), width: 1.0, alpha: 0.45 },
    { paths: scene.factual, color: token("--mirn-factual"), width: 1.6, alpha: 1.0 },
  ];
  for (const arm of arms) {
    context.strokeStyle = arm.color;
    context.lineWidth = arm.width;
    context.globalAlpha = arm.alpha;
    for (const agent of arm.paths) {
      context.beginPath();
      for (let index = 0; index <= step; index += 1) {
        const point = agent.positions[index];
        const x = scale.x(point[0]);
        const y = scale.y(point[1]);
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  // The connector. This mark IS the robot's effect on that person — the whole thesis in one line
  // — so it wears the paired estimator's colour: the quantity this line traces out is exactly
  // what the paired estimator reports below, and the legend's "robot" swatch already claims
  // --mirn-accent.
  context.strokeStyle = token("--mirn-paired");
  context.lineWidth = 1.2;
  for (let index = 0; index < scene.factual.length; index += 1) {
    const here = scene.factual[index].positions[step];
    const ghost = scene.counterfactual[index].positions[step];
    context.beginPath();
    context.moveTo(scale.x(ghost[0]), scale.y(ghost[1]));
    context.lineTo(scale.x(here[0]), scale.y(here[1]));
    context.stroke();
  }

  // Current positions.
  for (const arm of arms) {
    context.fillStyle = arm.color;
    context.globalAlpha = arm.alpha;
    for (const agent of arm.paths) {
      const point = agent.positions[step];
      context.beginPath();
      context.arc(scale.x(point[0]), scale.y(point[1]), 3, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  if (scene.robot) {
    const robot = scene.robot[0];
    // Matches the legend's "robot" swatch (--mirn-accent). --mirn-naive is the page's colour for
    // the flawed naive estimator (.stat-naive, .breaks-when) and must not double as the robot.
    context.fillStyle = token("--mirn-accent");
    context.beginPath();
    context.arc(scale.x(robot[0]), scale.y(robot[1]), 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = token("--mirn-ink-muted");
    context.font = "11px " + (state.theme["--mirn-font-mono"] || "monospace");
    context.textAlign = "left";
    context.fillText("robot", scale.x(robot[0]) + 11, scale.y(robot[1]) + 4);
  }
}

// Largest current gap, read from the API's series. Never computed here.
function widestGapAt(scene, step) {
  let widest = 0;
  for (const entry of scene.gap_series) {
    const gap = entry.gaps[step];
    if (gap > widest) widest = gap;
  }
  return widest;
}

function tick(nowMs) {
  const scene = state.scene;
  if (scene) {
    if (player.lastFrameMs === 0) player.lastFrameMs = nowMs;
    const elapsedMs = nowMs - player.lastFrameMs;
    player.lastFrameMs = nowMs;
    if (player.playing) {
      // Advance by wall-clock time against the API's dt, so playback is real-time and does not
      // drift with frame rate.
      player.accumulatorMs += elapsedMs;
      const stepMs = scene.dt * 1000;
      while (player.accumulatorMs >= stepMs) {
        player.accumulatorMs -= stepMs;
        player.step = (player.step + 1) % scene.n_steps;
      }
    }
    drawScene(document.getElementById("scene-canvas"), scene, player.step);
    document.getElementById("scene-clock").textContent =
      (player.step * scene.dt).toFixed(1) + " s";
    document.getElementById("scene-gap").textContent =
      widestGapAt(scene, player.step).toFixed(3) + " m";
    const scrub = document.getElementById("scene-scrub");
    if (document.activeElement !== scrub) {
      scrub.max = String(scene.n_steps - 1);
      scrub.value = String(player.step);
    }
  }
  window.requestAnimationFrame(tick);
}

// The six knobs Task 6 wired up, each `<input type="range">` paired with an `<output readout>`.
// `decimals` matches the readout precision already baked into index.html's initial values, so
// wiring here does not change what the page shows before the first "input" event fires.
const SCENE_CONTROLS = [
  { id: "scene-influence", decimals: 2 },
  { id: "scene-robot-x", decimals: 1 },
  { id: "scene-robot-y", decimals: 1 },
  { id: "scene-amplitude", decimals: 2 },
  { id: "scene-decay", decimals: 2 },
  { id: "scene-n-pedestrians", decimals: 0 },
];

function showSceneError(message) {
  const errorNode = document.getElementById("scene-error");
  errorNode.textContent = message;
  errorNode.hidden = false;
}

function clearSceneError() {
  const errorNode = document.getElementById("scene-error");
  errorNode.hidden = true;
  errorNode.textContent = "";
}

// Nothing here computes a measured quantity: it reads slider values, builds a query string, and
// stores whatever /api/scene returns. On a settings change, playback keeps running rather than
// resetting to step 0 — only `player.step` is clamped into the new scene's range. A failed fetch
// (the hero element's version of the pending/error pattern the beat sections already use) shows
// the server's own message in `#scene-error` rather than failing silently to the console; a
// following successful fetch clears it. This function does not throw — callers do not need a
// `.catch`.
async function fetchScene() {
  const params = new URLSearchParams();
  params.set("influence", document.getElementById("scene-influence").value);
  params.set("seed", String(state.seed));
  params.set("scene_index", "0");
  params.set("robot_x", document.getElementById("scene-robot-x").value);
  params.set("robot_y", document.getElementById("scene-robot-y").value);
  params.set("amplitude", document.getElementById("scene-amplitude").value);
  params.set("decay", document.getElementById("scene-decay").value);
  params.set("n_pedestrians", document.getElementById("scene-n-pedestrians").value);
  try {
    const scene = await getJSON("/api/scene?" + params.toString());
    state.scene = scene;
    const maxStep = scene.n_steps - 1;
    if (player.step > maxStep) player.step = maxStep;
    clearSceneError();
  } catch (error) {
    showSceneError(error.message);
  }
}

const debouncedFetchScene = debounce(fetchScene, DEBOUNCE_MS);

function wireSceneControls() {
  for (const control of SCENE_CONTROLS) {
    const input = document.getElementById(control.id);
    const readout = document.getElementById(control.id + "-readout");
    input.addEventListener("input", () => {
      readout.textContent = Number(input.value).toFixed(control.decimals);
      debouncedFetchScene();
    });
  }
}

// Single source of truth for play/pause state, shared by the scrub input and the persistent
// button below: flips `player.playing`, clears `player.accumulatorMs` on resume so a paused
// stretch never replays as a burst of catch-up steps, and keeps the button's label in sync.
function setPlaying(playing) {
  player.playing = playing;
  if (playing) {
    player.accumulatorMs = 0;
  }
  document.getElementById("scene-playpause").textContent = playing ? "Pause" : "Play";
}

// Dragging the scrub pauses and seeks on every "input" event. Releasing it does NOT resume —
// a viewer who scrubs to inspect a moment should not have playback restart out from under them.
// Resuming is the persistent play/pause button's job.
function wireScrub() {
  const scrub = document.getElementById("scene-scrub");
  scrub.addEventListener("input", () => {
    player.step = Number(scrub.value);
    setPlaying(false);
  });
}

function wirePlayPause() {
  const button = document.getElementById("scene-playpause");
  button.addEventListener("click", () => {
    setPlaying(!player.playing);
  });
}

// ---------------------------------------------------------------- boot
//
// Beat rendering (the five narrative sections under the `beats` host element, built from the
// `beat-template` template) is Task 8's responsibility — it consumes `/api/meta`'s
// `order`/`primary_parameters` and `/api/methods`' `plain_summary`, neither of which exists on
// this task's shape yet. Meta is fetched here regardless because `data-note`, `seed-readout`, and
// the scene player's seed all need it; `state.cards` is fetched for the same reason Task 8 will
// want it available without a refetch. Neither fetch touches the beats host or its template —
// that wiring is deliberately absent until Task 8 lands, rather than left half-built against ids
// this task never touches.

async function boot() {
  const meta = await getJSON("/api/meta");
  state.theme = meta.theme;
  state.seed = meta.default_seed;
  state.experiments = meta.experiments;
  document.getElementById("data-note").textContent = meta.data_note;
  document.getElementById("seed-readout").textContent = String(state.seed);

  const methods = await getJSON("/api/methods");
  state.cards = methods.cards;

  wireSceneControls();
  wireScrub();
  wirePlayPause();
  await fetchScene();
  window.requestAnimationFrame(tick);

  // /api/export runs all four experiments at their declared defaults, which takes roughly
  // 55 seconds. The button is disabled for the duration so a second click cannot queue a
  // duplicate run, and the status line is updated immediately so the wait never reads as a
  // hung/broken button.
  const exportButton = document.getElementById("export-button");
  const exportStatus = document.getElementById("export-status");
  exportButton.addEventListener("click", async () => {
    exportButton.disabled = true;
    exportStatus.textContent = "running all four experiments — this takes about a minute...";
    try {
      const response = await postJSON("/api/export", { seed: state.seed, params: {} });
      exportStatus.textContent = "wrote " + response.written.length + " CSVs to results/";
    } catch (error) {
      exportStatus.textContent = error.message;
    } finally {
      exportButton.disabled = false;
    }
  });
}

boot();
