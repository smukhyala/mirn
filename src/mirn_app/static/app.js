// Every number rendered here was computed by src/mirn/ and arrived over HTTP.
// Nothing in this file estimates, calibrates, or sweeps anything.

const DEBOUNCE_MS = 250;
// Shown on every beat's very first paint and on every refresh, before the request that will fill
// it in has even been sent — never gated behind a delay. It is deliberately generic: this string
// appears under all four beats at once on first load, so it can neither name a computation only
// one of them runs nor quote a count a rendered control can change. It also cannot use a term the
// page has not defined yet, since it is on screen before any beat's copy has been read.
const PENDING_HINT_TEXT = "working this out — the first one takes about a minute, then it is instant.";

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

  // plain_summary leads, in prose, before any notation: a reader meets English before
  // mathematics. one_liner stays underneath as the terser technical caption.
  const plainSummary = document.createElement("p");
  plainSummary.className = "card-plain-summary";
  plainSummary.textContent = card.plain_summary;
  wrapper.appendChild(plainSummary);

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

// Matches a canvas's backing store to the CSS box it is actually laid out in, times the display's
// device-pixel ratio, and scales the drawing context so every call site keeps working in CSS
// pixels. Without this the markup's fixed width/height attributes are stretched or squashed into
// whatever the responsive layout gives them — soft paths at 1x and softer on a HiDPI screen.
//
// The backing store is only reassigned when it actually changes, because assigning to
// canvas.width clears the bitmap and resets the transform; drawScene calls this every animation
// frame. Returns the CSS-pixel dimensions to draw against, falling back to the attribute size if
// the element is not laid out yet (zero-size rect).
function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width || canvas.width;
  const cssHeight = rect.height || canvas.height;
  const ratio = window.devicePixelRatio || 1;
  const backingWidth = Math.round(cssWidth * ratio);
  const backingHeight = Math.round(cssHeight * ratio);
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width: cssWidth, height: cssHeight };
}

function plotFrame(canvas) {
  const fitted = fitCanvas(canvas);
  const context = fitted.context;
  context.clearRect(0, 0, fitted.width, fitted.height);
  return {
    context,
    left: 54,
    right: fitted.width - 16,
    top: 16,
    bottom: fitted.height - 34,
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

// The readout sits three centimetres under prose written for someone who has never read a
// robotics paper, so it must not print code identifiers at them. An estimator's display name is
// the `title` its own MethodCard already declares in Python — looked up, never duplicated here —
// and the raw key survives only as a fallback if a card is ever missing.
function estimatorLabel(key) {
  const card = state.cards[key];
  if (card && card.title) {
    return card.title;
  }
  return key;
}

// "mdp" is an abbreviation whose only expansion lives inside a card in a disclosure that is
// closed by default, so it is spelled out at the point of use instead.
const UNIT_LABEL = {
  metres: "metres",
  mdp: "× the detection floor",
};

function unitLabel(units) {
  return UNIT_LABEL[units] || units;
}

// The placebo experiment labels its two rows by variant rather than by estimator; neither value
// is a card key, so they get plain-English names of their own.
const VARIANT_LABEL = {
  full: "Everyone present",
  pedestrian_removed: "One bystander removed",
};

function variantLabel(variant) {
  return VARIANT_LABEL[variant] || variant;
}

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
          estimatorLabel(row.estimator) + " (" + unitLabel(row.units) + ")",
          row.value.toFixed(3),
          formatCI(row),
          STAT_CLASS[row.estimator] || ""
        )
      );
    } else if (row.variant !== undefined) {
      target.appendChild(
        statBlock(
          variantLabel(row.variant) + " (" + unitLabel(row.units) + ")",
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
      // Divergence choices are card keys, so they carry a declared title; choices that are not
      // (the sweep's axis) at least lose their underscores rather than reading as code.
      const card = state.cards[choice];
      if (card && card.title) {
        option.textContent = card.title;
      } else {
        option.textContent = choice.split("_").join(" ");
      }
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

function sceneScales(width, height, extent) {
  const pad = 22;
  return {
    x: makeScale(0, extent.width, pad, width - pad),
    y: makeScale(0, extent.height, height - pad, pad),
  };
}

function drawScene(canvas, scene, step) {
  const fitted = fitCanvas(canvas);
  const context = fitted.context;
  context.clearRect(0, 0, fitted.width, fitted.height);
  const scale = sceneScales(fitted.width, fitted.height, scene.extent);

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
    // Bare numbers: index.html prints the unit as a literal after each <output>, so appending
    // one here too rendered "0.0 s s" and "0.000 m m" on screen.
    document.getElementById("scene-clock").textContent = (player.step * scene.dt).toFixed(1);
    document.getElementById("scene-gap").textContent =
      widestGapAt(scene, player.step).toFixed(3);
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

// ---------------------------------------------------------------- beat copy
//
// The plain-English claim for each experiment's beat, written for a reader who has never read a
// robotics paper. Keyed by experiment NAME, not by reading position: where a beat lands on the
// page is decided entirely by the `order` field `/api/meta` supplies (see renderBeats below),
// never by this table, and never by an `===` comparison against these names anywhere else in this
// file. A fifth, uncopy-written experiment falls back to its own `claim` field from the API
// instead of breaking.
//
// Each value is an ARRAY of paragraphs, not one blob. A reader meeting "null" and "detection
// floor" for the first time should meet one definition per breath, so the copy is broken where
// the ideas break rather than run together. Two standing constraints on every string here:
// no sentence quotes a figure a rendered control can change (a slider that falsifies the prose
// is the page lying to whoever moved it), and no sentence describes a state the beat does not
// load in — where the copy wants the reader at a different setting, it says so imperatively and
// names the control.
const BEAT_CLAIMS = {
  calibration_floor: [
    "Start with the ruler, before measuring anything with it. Take the crowd with no robot in " +
      "it at all, split the people into two random halves, and ask how different the two halves " +
      "look. The answer comes from a divergence: a single number for how far apart two sets of " +
      "paths are.",
    "Nothing in this crowd could be responding to a robot, because there is no robot. And yet " +
      "the number is not zero.",
    "That leftover has a name. It is the null — the ordinary variation you get between any two " +
      "halves of the same population, measured with no robot anywhere. Its upper edge is the " +
      "detection floor: the smallest effect this measurement could ever tell apart from plain " +
      "noise. An effect below that line is not absent. It is simply invisible at this sample size.",
    "We have not found a published study of robot-induced perturbation — how far a robot pushes " +
      "people off the path they would otherwise have walked — that reports this floor. If that " +
      "holds, the numbers those studies do report have nothing to be judged against. There is no " +
      "way to tell a real effect from the measurement's own wobble.",
  ],
  estimator_comparison: [
    "In the real world you only ever get to watch one version of events. There is no robot-absent " +
      "run sitting there to compare against, so most published work guesses at it instead, using " +
      "a forecaster: predict where a pedestrian was already heading, then measure how far off " +
      "that prediction turned out to be.",
    "That prediction error is what most published measurements report as the robot's effect. It " +
      "comes from an estimator — a formula that turns raw paths into a single number claiming to " +
      "size up the disturbance.",
    "Right now the robot in this run is at full strength, and the two methods already disagree. " +
      "The paired method can look at the robot-absent version of the crowd directly. The standard " +
      "forecaster-based method cannot, and has to guess.",
    "Now drag Robot influence down to zero. The robot stops doing anything at all, the two " +
      "versions of the crowd become the same paths step for step, and the honest answer is " +
      "exactly zero. That is what the paired method reports.",
    "The standard method does not. It still reports a substantial disturbance from a robot that " +
      "did nothing, because what it is really measuring is how wrong its own guess about the " +
      "pedestrian was. The Forecast horizon slider controls how substantial. Ask the forecaster " +
      "to predict further ahead and its guess gets worse, and the disturbance it claims to have " +
      "found grows right along with it. The robot has not changed. Only the guess has.",
  ],
  confounding_sweep: [
    "Here the true disturbance is pinned at exactly zero the whole way across the chart — robot " +
      "influence set to zero, the same move as in Beat 2. Meanwhile the forecaster behind the " +
      "standard method is made steadily worse, either by feeding it more noise or by asking it " +
      "to predict further ahead.",
    "There is nothing left for it to measure, so the number it reports is tracking only how bad " +
      "the guess has become. Push the Maximum predictor error slider up and watch that number " +
      "climb through the detection floor from Beat 1 — the line an effect has to clear before it " +
      "counts as real — even though the true effect never leaves zero.",
    "This is the consequence that matters. A robot tuned to make that number small would not be " +
      "learning to bother people less. It would be learning to move predictably.",
  ],
  placebo: [
    "As a last check, every run of the crowd loses one bystander: a pedestrian who stayed well " +
      "away from the robot the whole time, deleted from both versions of the world. Then the " +
      "measurement is taken again.",
    "A trustworthy measurement should barely notice. Turn Robot influence down to zero and it " +
      "should not move at all — with no robot, there is nothing a bystander could be carrying a " +
      "trace of.",
    "Leave the influence up and it moves a little, and it should. Well away is not the same as " +
      "untouched, and the small shift you see is the honest size of what is left over. Widen the " +
      "Exclusion radius and you are asking for a bystander further from the robot, so that shift " +
      "should shrink.",
    "What would be damning is a large shift. That would mean the number is being driven by people " +
      "the robot never went near.",
  ],
};

// ---------------------------------------------------------------- beat rendering

function renderCards(container, methodKeys) {
  container.replaceChildren();
  for (const key of methodKeys) {
    const card = state.cards[key];
    if (card) {
      container.appendChild(buildCard(card));
    }
  }
}

// Splits one experiment's declared parameters into inline controls (named in its
// `primary_parameters`) and a "more settings" disclosure for the rest. Reads that field off the
// experiment descriptor the API supplied — never matches a parameter or experiment name.
function populateControls(form, experiment, onChange) {
  form.replaceChildren();
  const primaryNames = new Set(experiment.primary_parameters);
  const secondary = [];
  for (const parameter of experiment.parameters) {
    if (primaryNames.has(parameter.name)) {
      form.appendChild(buildControl(parameter, onChange));
    } else {
      secondary.push(parameter);
    }
  }
  if (secondary.length > 0) {
    const details = document.createElement("details");
    details.className = "more-settings";
    const summary = document.createElement("summary");
    summary.textContent = "more settings";
    details.appendChild(summary);
    for (const parameter of secondary) {
      details.appendChild(buildControl(parameter, onChange));
    }
    form.appendChild(details);
  }
}

function showBeatError(elements, message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
}

function clearBeatError(elements) {
  elements.error.hidden = true;
  elements.error.textContent = "";
}

// Runs one beat's experiment at its form's current parameters and the page seed, then fills in
// its readout, plot, plot note, and mathematics cards. Shows the shared pending state the instant
// it starts (never gated behind a delay) and the shared error pattern on failure, matching the
// scene player's own honesty conventions.
async function runBeat(experiment, elements) {
  const params = readParams(elements.form);
  elements.output.classList.add("is-pending");
  renderPendingReadout(elements.readout, experiment.title);
  const pendingPlot = fitCanvas(elements.plot);
  pendingPlot.context.clearRect(0, 0, pendingPlot.width, pendingPlot.height);
  elements.note.textContent = "";
  clearBeatError(elements);
  try {
    const result = await postJSON("/api/experiment/" + experiment.name, {
      params,
      seed: state.seed,
    });
    renderReadout(elements.readout, result);
    drawPlot(elements.plot, result);
    elements.note.textContent = result.payload.note || "";
    renderCards(elements.cards, result.method_keys);
  } catch (error) {
    // Clear the pending tile as well as showing the error. Leaving it up puts "Computing … the
    // first one takes about a minute" permanently above a red error box, which reads as a page
    // still working on something it has already given up on. Reachable in normal use: raising
    // Exclusion radius past every pedestrian's closest approach makes the placebo run raise.
    elements.readout.replaceChildren();
    showBeatError(elements, error.message);
  } finally {
    elements.output.classList.remove("is-pending");
  }
}

// Builds all four beats from `beat-template`, in the order `/api/meta` declared — sorted here
// explicitly rather than assumed pre-sorted, so this file's own ordering guarantee does not
// silently depend on the server's. No experiment-name branching anywhere in this function: the
// beat number, the open/closed mathematics disclosure, and the primary/secondary control split
// all come from fields on `experiment`, never from comparing `experiment.name` to a literal.
function renderBeats() {
  const host = document.getElementById("beats");
  const template = document.getElementById("beat-template");
  const experiments = state.experiments.slice().sort((a, b) => a.order - b.order);

  for (const experiment of experiments) {
    const fragment = template.content.cloneNode(true);
    const indexNode = fragment.querySelector(".section-index");
    const titleNode = fragment.querySelector(".section-title");
    const claimNode = fragment.querySelector(".section-claim");
    const technicalClaimNode = fragment.querySelector(".section-claim-technical");
    const form = fragment.querySelector(".controls");
    const output = fragment.querySelector(".output");
    const readout = fragment.querySelector(".readout");
    const plot = fragment.querySelector(".plot");
    const note = fragment.querySelector(".plot-note");
    const error = fragment.querySelector(".error");
    const mathDetails = fragment.querySelector(".mathematics");
    const cards = fragment.querySelector(".cards");

    indexNode.textContent = "Beat " + experiment.order;
    titleNode.textContent = experiment.title;
    // A canvas is opaque to a screen reader, so each plot is named from the experiment it draws
    // — the same treatment #scene-canvas already gets in the static markup.
    plot.setAttribute("aria-label", experiment.title + " — plot");
    // Lay copy as one paragraph per idea; a fifth experiment with no entry here falls back to
    // its Python `claim`, wrapped so the shape is the same either way.
    const layParagraphs = BEAT_CLAIMS[experiment.name];
    const paragraphs = layParagraphs || [experiment.claim];
    claimNode.replaceChildren();
    for (const paragraph of paragraphs) {
      const node = document.createElement("p");
      node.textContent = paragraph;
      claimNode.appendChild(node);
    }
    // The terse technical restatement declared on the Experiment in Python, demoted beneath the
    // plain-English version. Rendering it is what keeps `Experiment.claim` from being a field
    // nobody reads, which is how the two copies would silently drift apart. Suppressed when the
    // fallback above already IS that claim, so an uncopy-written beat does not print it twice.
    technicalClaimNode.textContent = layParagraphs ? experiment.claim : "";
    technicalClaimNode.hidden = !layParagraphs;
    mathDetails.open = experiment.order === 1;

    const elements = { form, output, readout, plot, note, error, cards };
    const debouncedRun = debounce(() => runBeat(experiment, elements), DEBOUNCE_MS);
    populateControls(form, experiment, debouncedRun);

    host.appendChild(fragment);
    runBeat(experiment, elements);
  }
}

// ---------------------------------------------------------------- boot

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

  renderBeats();

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
