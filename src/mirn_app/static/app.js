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
};

function token(name) {
  return state.theme[name] || "#888888";
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
        statBlock(row.variant, row.value.toFixed(4), formatCI(row), "stat-paired")
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

// ---------------------------------------------------------------- scene canvas

async function drawScene(influence) {
  const canvas = document.getElementById("scene-canvas");
  const context = canvas.getContext("2d");
  const scene = await getJSON(
    "/api/scene?influence=" + influence + "&seed=" + state.seed + "&scene_index=0"
  );

  context.clearRect(0, 0, canvas.width, canvas.height);
  const padding = 18;
  const xScale = makeScale(0, scene.extent.width, padding, canvas.width - padding);
  const yScale = makeScale(0, scene.extent.height, canvas.height - padding, padding);

  // The arena itself, drawn from the API's extent (never a hardcoded box size) and behind
  // everything else, so trajectories read as people crossing part of a room rather than paths
  // floating in a void.
  const arenaLeft = xScale(0);
  const arenaRight = xScale(scene.extent.width);
  const arenaTop = yScale(scene.extent.height);
  const arenaBottom = yScale(0);
  context.strokeStyle = token("--mirn-grid");
  context.lineWidth = 1;
  context.strokeRect(arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop);

  const arms = [
    { paths: scene.counterfactual, color: token("--mirn-counterfactual"), width: 1.2 },
    { paths: scene.factual, color: token("--mirn-factual"), width: 1.6 },
  ];
  for (const arm of arms) {
    context.strokeStyle = arm.color;
    context.lineWidth = arm.width;
    for (const agent of arm.paths) {
      context.beginPath();
      agent.positions.forEach((point, index) => {
        const x = xScale(point[0]);
        const y = yScale(point[1]);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
  }

  context.strokeStyle = token("--mirn-ink-muted");
  context.globalAlpha = 0.35;
  context.lineWidth = 0.8;
  for (let index = 0; index < scene.factual.length; index += 1) {
    const factualPath = scene.factual[index].positions;
    const counterfactualPath = scene.counterfactual[index].positions;
    for (let step = 0; step < factualPath.length; step += 8) {
      context.beginPath();
      context.moveTo(xScale(counterfactualPath[step][0]), yScale(counterfactualPath[step][1]));
      context.lineTo(xScale(factualPath[step][0]), yScale(factualPath[step][1]));
      context.stroke();
    }
  }
  context.globalAlpha = 1;

  if (scene.robot) {
    const robotX = xScale(scene.robot[0][0]);
    const robotY = yScale(scene.robot[0][1]);
    context.fillStyle = token("--mirn-accent");
    context.beginPath();
    context.arc(robotX, robotY, 6, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = token("--mirn-ink-muted");
    context.font = "11px " + (state.theme["--mirn-font-mono"] || "monospace");
    context.textAlign = "left";
    context.fillText("robot", robotX + 9, robotY + 4);
  }
}

// ---------------------------------------------------------------- sections

function buildSection(experiment, index) {
  const template = document.getElementById("section-template");
  const node = template.content.cloneNode(true);
  const section = node.querySelector(".experiment");

  section.querySelector(".section-index").textContent = String(index + 1).padStart(2, "0");
  section.querySelector(".section-title").textContent = experiment.title;
  section.querySelector(".section-claim").textContent = experiment.claim;

  // Only the first rendered section starts expanded, keyed off its position rather than its
  // name (no per-experiment branching), so the mathematics is visible immediately without
  // pushing every plot on the page below the fold.
  if (index === 0) {
    section.querySelector(".mathematics").setAttribute("open", "");
  }

  const form = section.querySelector(".controls");
  const output = section.querySelector(".output");
  const readout = section.querySelector(".readout");
  const canvas = section.querySelector("canvas.plot");
  const note = section.querySelector(".plot-note");
  const cardsHost = section.querySelector(".cards");

  async function refresh() {
    output.classList.add("is-pending");
    const existingError = section.querySelector(".error");
    if (existingError) existingError.remove();
    // The pending stat tile and its explanatory line render synchronously, before the fetch
    // below is even issued — there is no delay to "shorten" because there is no timer here at
    // all. A viewer never watches a bare "—" waiting for an explanation to catch up.
    renderPendingReadout(readout, experiment.title);

    try {
      const result = await postJSON("/api/experiment/" + experiment.name, {
        params: readParams(form),
        seed: state.seed,
      });
      renderReadout(readout, result);
      drawPlot(canvas, result);
      note.textContent = result.payload.note || "";
      cardsHost.replaceChildren();
      for (const key of result.method_keys) {
        if (state.cards[key]) {
          cardsHost.appendChild(buildCard(state.cards[key]));
        }
      }
    } catch (error) {
      // The pending placeholder ("Computing …" / the split-half-null explanation) would be
      // actively wrong to leave on screen next to an error, so it is cleared here rather than
      // left to linger — the error message is the whole story for this refresh.
      readout.replaceChildren();
      const message = document.createElement("p");
      message.className = "error";
      message.textContent = error.message;
      output.appendChild(message);
    } finally {
      output.classList.remove("is-pending");
    }
  }

  const debounced = debounce(refresh, DEBOUNCE_MS);
  for (const parameter of experiment.parameters) {
    form.appendChild(buildControl(parameter, debounced));
  }
  form.addEventListener("submit", (event) => event.preventDefault());

  refresh();
  return section;
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

  const host = document.getElementById("sections");
  state.experiments.forEach((experiment, index) => {
    host.appendChild(buildSection(experiment, index));
  });

  const influenceInput = document.getElementById("scene-influence");
  const influenceReadout = document.getElementById("influence-readout");
  const redrawScene = debounce(() => {
    influenceReadout.textContent = Number(influenceInput.value).toFixed(2);
    drawScene(influenceInput.value);
  }, DEBOUNCE_MS);
  influenceInput.addEventListener("input", redrawScene);
  await drawScene(influenceInput.value);

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
