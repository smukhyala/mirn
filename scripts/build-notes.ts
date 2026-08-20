/**
 * Compiles web/notes/**\/*.md into standalone HTML pages under web/generated/.
 *
 * Build-time rather than client-side, and multi-page rather than a single app, for one reason:
 * with JavaScript disabled the prose and the mathematics must still appear. A reader with a slow
 * connection, a locked-down browser or a screen reader gets the notes; only the widgets need JS.
 *
 * Two lints run here and fail the build, because they are the mechanical form of promises the
 * site makes in prose:
 *
 *   - the bare-number lint enforces "never display a number without explaining where it came from"
 *   - the comparative lint stops a sentence asserting a relation a slider could falsify
 *
 * A third check enforces the vocabulary ladder: no page may use a term before the page that
 * defines it.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import katex from "katex";
import { load as loadYaml } from "js-yaml";
import { VOCABULARY, type Term } from "../web/vocab.js";
import { lintBareNumbers, lintComparatives, proseOf } from "../web/build/lints.js";
import { cssTokens } from "../web/ui/theme.js";
import FACTS from "../web/data/experiment-facts.json";
import { makeRunConfig } from "../web/engine/contracts/config.js";
import { runPair } from "../web/engine/sim/run.js";
import { deviation } from "../web/engine/measure/metrics.js";
import { seededPermutations, splitHalfNull } from "../web/engine/measure/null/splitHalf.js";

const NOTES_DIRS = ["web/notes", "web/notes/experiments"];
const OUT_DIR = "web/generated";

interface FrontMatter {
  id: string;
  page: number;
  part?: number;
  title: string;
  subtitle?: string;
  introduces?: string[];
  uses?: string[];
  reader_can?: string;
}

interface Page {
  readonly file: string;
  readonly front: FrontMatter;
  readonly body: string;
  readonly isExperiment: boolean;
}

const errors: string[] = [];
function fail(file: string, message: string): void {
  errors.push(`${file}: ${message}`);
}

// ---------------------------------------------------------------- collect

function collect(): Page[] {
  const pages: Page[] = [];
  for (const dir of NOTES_DIRS) {
    if (!existsSync(dir)) {
      continue;
    }
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith(".md")) {
        continue;
      }
      const file = join(dir, name);
      const parsed = matter(readFileSync(file, "utf8"));
      const front = parsed.data as FrontMatter;
      if (typeof front.id !== "string" || front.id.length === 0) {
        fail(file, "front matter is missing `id`");
        continue;
      }
      if (typeof front.page !== "number") {
        fail(file, "front matter is missing a numeric `page`");
        continue;
      }
      if (typeof front.title !== "string") {
        fail(file, "front matter is missing `title`");
        continue;
      }
      pages.push({
        file,
        front,
        body: parsed.content,
        isExperiment: dir.endsWith("experiments"),
      });
    }
  }
  return pages;
}

// ---------------------------------------------------------------- vocabulary

const BY_ID = new Map<string, Term>(VOCABULARY.map((t) => [t.id, t]));

function checkVocabulary(pages: readonly Page[]): void {
  const introducedBy = new Map<string, string[]>();
  for (const page of pages) {
    for (const id of page.front.introduces ?? []) {
      if (typeof id !== "string") {
        fail(
          page.file,
          `'introduces' contains ${JSON.stringify(id)}, which is not a string. YAML turns bare ` +
            `words like null, yes, no and on into literals — quote the id if it looks like one`,
        );
        continue;
      }
      const term = BY_ID.get(id);
      if (term === undefined) {
        fail(page.file, `introduces unknown term '${id}'`);
        continue;
      }
      if (term.page !== page.front.page) {
        fail(
          page.file,
          `introduces '${id}', but vocab.ts says that term belongs on page ${term.page}`,
        );
      }
      const list = introducedBy.get(id) ?? [];
      list.push(page.file);
      introducedBy.set(id, list);
    }
    for (const id of page.front.uses ?? []) {
      if (typeof id !== "string") {
        fail(
          page.file,
          `'uses' contains ${JSON.stringify(id)}, which is not a string. YAML turns bare words ` +
            `like null, yes, no and on into literals — quote the id if it looks like one`,
        );
        continue;
      }
      const term = BY_ID.get(id);
      if (term === undefined) {
        fail(page.file, `uses unknown term '${id}'`);
        continue;
      }
      if (term.page > page.front.page) {
        fail(
          page.file,
          `uses '${id}' on page ${page.front.page}, but it is not defined until page ${term.page}`,
        );
      }
    }
  }
  for (const [id, files] of introducedBy) {
    if (files.length > 1) {
      fail(files.join(" and "), `both introduce '${id}'; a term may be introduced exactly once`);
    }
  }
  // Experiment pages live under page 6, so a term never introduced by a numbered page is a real gap.
  for (const term of VOCABULARY) {
    if (!introducedBy.has(term.id)) {
      errors.push(`vocab.ts: '${term.id}' is never introduced by any page`);
    }
  }
}

// ---------------------------------------------------------------- lints

// The rules themselves live in web/build/lints.ts, with tests: a lint nobody has watched fire is
// a lint nobody has.

function runLints(page: Page): void {
  const prose = proseOf(page.body);
  for (const problem of [...lintBareNumbers(prose), ...lintComparatives(prose)]) {
    fail(page.file, problem.message);
  }
}

// ---------------------------------------------------------------- directives

let widgetCounter = 0;

/**
 * Values for the live quantity widgets, computed at build time from the default configuration.
 *
 * A `{{q:widget-id}}` token names a `mirn:quantity` block on the same page, and the widget updates
 * it as the reader moves controls. But the number is also written into the static HTML here, so a
 * reader with JavaScript off sees "comes to 0.317 m" rather than "comes to —". Half the point of
 * compiling these pages ahead of time was that the argument survives without scripts, and a
 * sentence with a hole in it does not.
 */
const LIVE_VALUES: Readonly<Record<string, Readonly<Record<string, string>>>> = (() => {
  const result = runPair(makeRunConfig({ nTicks: 800 }));
  const dev = deviation(result.pair);
  const floor = splitHalfNull(result.control.positions, 40, seededPermutations(20260816));
  return {
    deviation: {
      default: `${dev.meanM.toFixed(3)} m`,
      mean: `${dev.meanM.toFixed(3)} m`,
      max: `${dev.maxM.toFixed(3)} m`,
    },
    perturbation: {
      default: `${dev.meanM.toFixed(3)} m`,
      mean: `${dev.meanM.toFixed(3)} m`,
    },
    "detection-floor": {
      default: `${floor.floor.toFixed(3)} m`,
      floor: `${floor.floor.toFixed(3)} m`,
      mean: `${floor.mean.toFixed(3)} m`,
    },
  };
})();

/** widget id -> the metric it renders, collected per page from its mirn:quantity blocks. */
let quantityWidgets: Map<string, string> = new Map();

function collectQuantityWidgets(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of body.matchAll(/```mirn:quantity\n([\s\S]*?)```/g)) {
    let config: unknown;
    try {
      config = loadYaml(match[1] as string);
    } catch {
      continue;
    }
    const typed = config as { id?: string; metric?: string };
    if (typeof typed.id === "string" && typeof typed.metric === "string") {
      map.set(typed.id, typed.metric);
    }
  }
  return map;
}

function renderWidget(page: Page, kind: string, yamlish: string): string {
  const id = `mirn-widget-${widgetCounter++}`;
  // The block body is parsed HERE, at build time, and embedded as JSON. Handing the client raw
  // YAML would mean shipping a parser and discovering a typo in the browser; this way a malformed
  // block fails the build, next to the page that contains it.
  let config: unknown;
  try {
    config = loadYaml(yamlish) ?? {};
  } catch (error) {
    fail(page.file, `mirn:${kind} block is not valid YAML: ${(error as Error).message}`);
    config = {};
  }
  const payload = JSON.stringify({ kind, config });
  return `<div class="widget" id="${id}" data-mirn-widget='${escapeAttribute(payload)}'><noscript><p class="widget-fallback">This is an interactive figure. It needs JavaScript; the argument around it does not.</p></noscript></div>`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Pull out the block constructs before markdown sees them, leaving opaque placeholders. */
function extractBlocks(page: Page, body: string): { text: string; blocks: string[] } {
  const blocks: string[] = [];
  const stash = (html: string): string => {
    blocks.push(html);
    return `\n\nMIRNBLOCK${blocks.length - 1}ENDBLOCK\n\n`;
  };

  let text = body.replace(/```mirn:([a-z]+)\n([\s\S]*?)```/g, (_all, kind: string, inner: string) =>
    stash(renderWidget(page, kind, inner)),
  );

  // Maths is stashed here, before markdown-it sees it, and restored already rendered. Rendering it
  // on the OUTPUT of markdown looks equivalent and is not: markdown treats a backslash as an
  // escape, so `\;` arrives at KaTeX as `;` and every spacing command in every equation renders
  // as a stray semicolon. That was visible on the page and invisible in the source.
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_all, tex: string) => {
    try {
      return stash(katex.renderToString(tex.trim(), { displayMode: true, throwOnError: true }));
    } catch (error) {
      fail(page.file, `display maths failed to render: ${(error as Error).message}`);
      return stash("");
    }
  });
  text = text.replace(/(?<!\\)\$([^$\n]+?)\$/g, (_all, tex: string) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: true });
    } catch (error) {
      fail(page.file, `inline maths failed to render: ${(error as Error).message}`);
      return "";
    }
  });

  text = text.replace(/^:::term\{id=([a-z0-9-]+)\}\s*$/gm, (_all, id: string) => {
    const term = BY_ID.get(id);
    if (term === undefined) {
      fail(page.file, `:::term names unknown id '${id}'`);
      return stash("");
    }
    // Rendering a definition and OWNING a term are different things. `introduces` declares
    // canonical ownership and must be unique across the site, because that is what fixes the
    // ladder. But a page may usefully restate a definition where the term is being used — the
    // seven experiment pages all sit on page 6 and each wants the definitions it leans on. So a
    // :::term is legal on any page at or after the term's own, and illegal before it.
    if (term.page > page.front.page) {
      fail(
        page.file,
        `:::term{id=${id}} appears on page ${page.front.page}, but that term belongs to page ` +
          `${term.page} and must not be defined earlier than the ladder says`,
      );
    }
    return stash(
      `<aside class="term"><p class="term-name">${escapeHtml(term.term)}</p>` +
        `<p class="term-definition">${escapeHtml(term.definition)}</p></aside>`,
    );
  });

  text = text.replace(/^:::caveat\s*$([\s\S]*?)^:::\s*$/gm, (_all, inner: string) =>
    stash(`<aside class="caveat">${md.render(inner.trim())}</aside>`),
  );

  return { text, blocks };
}

// ---------------------------------------------------------------- tokens

interface FactTable {
  readonly axis: string;
  readonly nSeeds: number;
  readonly rows: readonly Record<string, number>[];
}
const TABLES = FACTS as unknown as Record<string, FactTable>;

/** Short aliases so a page can write e2 rather than e2_density. */
const TABLE_ALIASES: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {};
  for (const key of Object.keys(TABLES)) {
    map[key] = key;
    const short = /^(e\d)_/.exec(key);
    if (short !== null) {
      map[short[1] as string] = key;
    }
  }
  return map;
})();

/**
 * Quantity references are resolved HERE, at build time, against the measured facts.
 *
 * Two reasons, and the second is the one that matters. First, the number then lives in the static
 * HTML, so it survives with JavaScript off like the rest of the prose. Second, an unresolvable
 * reference becomes a BUILD ERROR rather than a silent ellipsis: the first version resolved these
 * in the browser and a page whose references were all wrong rendered as "the average deviation is
 * …" and looked, from the build's point of view, perfectly fine.
 *
 * Syntax, and it is now pinned in docs/teaching/authoring.md because leaving it vague produced
 * three different invented spellings across sixteen pages:
 *
 *   {{q:table[axis=value].column}}   select the row whose axis column equals value
 *   {{q:table@index.column}}         select by row index
 *   {{q:table.column}}               only legal when the table has exactly one row
 *
 * A trailing `.sd` or `_sd` reads the standard deviation across seeds for that column.
 */
function resolveQuantity(page: Page, raw: string): string | null {
  // A token may name a live widget on this page rather than a row of the facts table. That is
  // checked first, because a widget id can look exactly like a table name.
  const liveMatch = /^([A-Za-z0-9-]+)(?:\.([A-Za-z0-9-]+))?$/.exec(raw.trim());
  if (liveMatch !== null) {
    const widgetId = liveMatch[1] as string;
    const metric = quantityWidgets.get(widgetId);
    if (metric !== undefined) {
      const values = LIVE_VALUES[metric];
      if (values === undefined) {
        fail(
          page.file,
          `{{q:${raw.trim()}}} names widget '${widgetId}', whose metric '${metric}' has no ` +
            `build-time value. Known metrics: ${Object.keys(LIVE_VALUES).join(", ")}`,
        );
        return null;
      }
      const field = liveMatch[2] ?? "default";
      const value = values[field];
      if (value === undefined) {
        fail(
          page.file,
          `{{q:${raw.trim()}}} asks widget '${widgetId}' for '${field}', which metric '${metric}' ` +
            `does not provide. Available: ${Object.keys(values).join(", ")}`,
        );
        return null;
      }
      return value;
    }
  }

  // Three spellings the page authors reached for independently, kept because each is the natural
  // way to say a different thing: pick a row by its axis value, pick one by position, or reduce
  // the whole column. The `column@value` ordering is normalised into the bracket form rather than
  // rejected — it reads better in prose and there is no ambiguity in it.
  let ref = raw.trim();
  ref = ref.replace(/^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)@(-?[\d.]+)$/, "$1[@axis=$3].$2");

  const match =
    /^([A-Za-z0-9_]+)(?:\[(@?[A-Za-z0-9_]+)=(-?[\d.]+)\]|@(\d+|first|last))?\.([A-Za-z0-9_]+)(?:\.(sd|min|max))?$/.exec(
      ref,
    );
  if (match === null) {
    fail(page.file, `{{q:${ref}}} is not a valid reference. See docs/teaching/authoring.md`);
    return null;
  }
  const [, tableRef, axisKey, axisValue, rowIndex, columnRaw, sdSuffix] = match;

  const tableName = TABLE_ALIASES[tableRef as string];
  if (tableName === undefined) {
    fail(
      page.file,
      `{{q:${ref}}} names table '${tableRef}', which is not in web/data/experiment-facts.json. ` +
        `Available: ${Object.keys(TABLES).join(", ")}`,
    );
    return null;
  }
  const table = TABLES[tableName] as FactTable;

  // `.min` / `.max` reduce the column instead of selecting a row: "between 0.90x and 1.23x" is a
  // claim about the whole sweep, and spelling it as two hand-picked rows would rot the moment the
  // sweep changed.
  if (sdSuffix === "min" || sdSuffix === "max") {
    const values = table.rows
      .map((r) => r[columnRaw as string])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) {
      fail(page.file, `{{q:${ref}}} has no finite values in column '${columnRaw}'`);
      return null;
    }
    const reduced = sdSuffix === "min" ? Math.min(...values) : Math.max(...values);
    return formatQuantity(columnRaw as string, reduced);
  }

  let row: Record<string, number> | undefined;
  if (axisKey !== undefined && axisValue !== undefined) {
    const key = axisKey === "@axis" ? table.axis : axisKey;
    row = table.rows.find((r) => Math.abs((r[key] as number) - Number(axisValue)) < 1e-9);
    if (row === undefined) {
      const available = table.rows.map((r) => r[key]).join(", ");
      fail(page.file, `{{q:${ref}}} found no row with ${key}=${axisValue}. Available: ${available}`);
      return null;
    }
  } else if (rowIndex !== undefined) {
    if (rowIndex === "first") {
      row = table.rows[0];
    } else if (rowIndex === "last") {
      row = table.rows[table.rows.length - 1];
    } else {
      row = table.rows[Number(rowIndex)];
    }
    if (row === undefined) {
      fail(page.file, `{{q:${ref}}} row index ${rowIndex} is out of range (${table.rows.length} rows)`);
      return null;
    }
  } else {
    if (table.rows.length !== 1) {
      fail(
        page.file,
        `{{q:${ref}}} has no row selector, but '${tableName}' has ${table.rows.length} rows. ` +
          `Use ${tableRef}[${table.axis}=…] or ${tableRef}@index`,
      );
      return null;
    }
    row = table.rows[0];
  }

  let column = columnRaw as string;
  if (sdSuffix !== undefined) {
    column = `${column}_sd`;
  }
  const value = (row as Record<string, number>)[column];
  if (value === undefined) {
    const available = Object.keys(row as Record<string, number>).filter((k) => !k.endsWith("_sd")).join(", ");
    fail(page.file, `{{q:${ref}}} has no column '${column}' in '${tableName}'. Available: ${available}`);
    return null;
  }
  if (!Number.isFinite(value)) {
    fail(
      page.file,
      `{{q:${ref}}} resolves to ${value}, which is not a number the page can show. That usually ` +
        `means the measurement was censored for this row — say so in words instead`,
    );
    return null;
  }
  return formatQuantity(column, value);
}

/** The unit is carried by the column-name suffix, which is why those suffixes exist. */
function formatQuantity(column: string, value: number): string {
  if (column.endsWith("M") || column.endsWith("M_sd")) {
    return `${value.toFixed(3)} m`;
  }
  if (column.endsWith("S") || column.endsWith("S_sd")) {
    return `${value.toFixed(2)} s`;
  }
  if (column.startsWith("n") || column.includes("Episodes")) {
    return value.toFixed(1);
  }
  return value.toFixed(3);
}

function renderTokens(page: Page, html: string): string {
  let out = html.replace(/\{\{lit:([^}]*)\}\}/g, (_all, literal: string) => escapeHtml(literal));
  out = out.replace(/\{\{q:([^}]*)\}\}/g, (_all, ref: string) => {
    const resolved = resolveQuantity(page, ref);
    if (resolved === null) {
      return `<span class="quantity quantity-broken">?</span>`;
    }
    return `<span class="quantity" data-quantity="${escapeHtml(ref.trim())}">${escapeHtml(resolved)}</span>`;
  });
  return out;
}

// ---------------------------------------------------------------- shell

const md: MarkdownIt = new MarkdownIt({ html: true, typographer: true });

function shell(page: Page, contentHtml: string, nav: string): string {
  const subtitle =
    page.front.subtitle === undefined
      ? ""
      : `<p class="page-subtitle">${escapeHtml(page.front.subtitle)}</p>`;
  const eyebrow = page.isExperiment
    ? "Experiment"
    : page.front.page >= 10
      ? "Colophon"
      : `Page ${page.front.page}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.front.title)} — MIRN</title>
<link rel="stylesheet" href="../theme.gen.css">
<link rel="stylesheet" href="../katex.css">
<link rel="stylesheet" href="../style.css">
</head>
<body class="notes-page">
<header class="masthead">
  <p class="eyebrow">${escapeHtml(eyebrow)}</p>
  <h1>${escapeHtml(page.front.title)}</h1>
  ${subtitle}
</header>
<main class="prose">
${contentHtml}
</main>
<nav class="page-nav">${nav}</nav>
<footer class="page-footer">
  <p>Everything here is simulated. The crowd is a model, not a recording of real people, and no
  number on this page is a measurement of anything that happened.</p>
</footer>
<script type="module" src="../notes.ts"></script>
</body>
</html>
`;
}

function contentsPage(pages: readonly Page[]): string {
  const PART_NAMES: Readonly<Record<number, string>> = {
    1: "Part I — What a robot does to a crowd",
    2: "Part II — Putting a number on it",
    3: "Part III — The laboratory",
    4: "Part IV — Why this is harder than it looks",
  };

  const sections: string[] = [];
  let currentPart: number | null = null;
  let open = false;

  const numbered = pages.filter((p) => !p.isExperiment);
  for (const page of numbered) {
    const part = page.front.part ?? 0;
    if (part !== currentPart) {
      if (open) {
        sections.push("</ol>");
      }
      const name = PART_NAMES[part];
      sections.push(`<p class="contents-part">${escapeHtml(name ?? "")}</p><ol>`);
      currentPart = part;
      open = true;
    }
    const subtitle =
      page.front.subtitle === undefined
        ? ""
        : `<span class="contents-subtitle">${escapeHtml(page.front.subtitle)}</span>`;
    sections.push(
      `<li><a href="./generated/${page.front.id}.html">${escapeHtml(page.front.title)}</a>${subtitle}</li>`,
    );
  }
  if (open) {
    sections.push("</ol>");
  }

  const experiments = pages.filter((p) => p.isExperiment);
  if (experiments.length > 0) {
    sections.push(`<p class="contents-part">The seven experiments</p><ol>`);
    for (const page of experiments) {
      const subtitle =
        page.front.subtitle === undefined
          ? ""
          : `<span class="contents-subtitle">${escapeHtml(page.front.subtitle)}</span>`;
      sections.push(
        `<li><a href="./generated/${page.front.id}.html">${escapeHtml(page.front.title)}</a>${subtitle}</li>`,
      );
    }
    sections.push("</ol>");
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MIRN — an interactive notebook about perturbation</title>
<link rel="stylesheet" href="./theme.gen.css">
<link rel="stylesheet" href="./style.css">
</head>
<body>
<header class="masthead">
  <p class="eyebrow">An interactive notebook</p>
  <h1>What a robot does to a crowd, and how you would know</h1>
  <p class="standfirst">
    A robot crosses a room full of people. Some of them move differently than they would have.
    This is about how much, how you would measure it, and why the obvious way of measuring it does
    not work. You need no robotics background; the mathematics goes no further than the distance
    between two points.
  </p>
</header>
<main class="contents">
${sections.join("\n")}
<p class="contents-part">Also</p>
<ol>
  <li><a href="./instrument.html">The instrument</a><span class="contents-subtitle">The bare readout: one crowd, run twice, with every control exposed.</span></li>
</ol>
</main>
<footer class="page-footer">
  <p>Everything here is simulated. The crowd is a model, not a recording of real people, and no
  number on this site is a measurement of anything that happened.</p>
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------- main

const pages = collect();
checkVocabulary(pages);

const ordered = [...pages].sort((a, b) => {
  if (a.isExperiment !== b.isExperiment) {
    return a.isExperiment ? 1 : -1;
  }
  if (a.front.page !== b.front.page) {
    return a.front.page - b.front.page;
  }
  return a.front.id < b.front.id ? -1 : 1;
});

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

// The palette is emitted as a real stylesheet rather than injected by script at runtime.
// Injecting it meant that with JavaScript disabled every custom property was undefined, so every
// `font-family: var(--mirn-font-sans)` declaration became invalid and the whole site fell back to
// Times. A no-JS guarantee that covers the words but not the typography is not much of a
// guarantee, and this was invisible until the pages were opened.
writeFileSync("web/theme.gen.css", `/* Generated from web/ui/theme.ts. Do not edit. */\n${cssTokens()}\n`);

for (let i = 0; i < ordered.length; i++) {
  const page = ordered[i] as Page;
  runLints(page);

  quantityWidgets = collectQuantityWidgets(page.body);
  const { text, blocks } = extractBlocks(page, page.body);
  let html = md.render(text);
  html = renderTokens(page, html);
  html = html.replace(/<p>MIRNBLOCK(\d+)ENDBLOCK<\/p>/g, (_all, index: string) => blocks[Number(index)] as string);
  html = html.replace(/MIRNBLOCK(\d+)ENDBLOCK/g, (_all, index: string) => blocks[Number(index)] as string);

  const previous = ordered[i - 1];
  const next = ordered[i + 1];
  const navParts: string[] = [];
  navParts.push(`<a class="nav-home" href="../index.html">Contents</a>`);
  if (previous !== undefined) {
    navParts.push(`<a class="nav-prev" href="./${previous.front.id}.html">← ${escapeHtml(previous.front.title)}</a>`);
  }
  if (next !== undefined) {
    navParts.push(`<a class="nav-next" href="./${next.front.id}.html">${escapeHtml(next.front.title)} →</a>`);
  }

  writeFileSync(join(OUT_DIR, `${page.front.id}.html`), shell(page, html, navParts.join("")));
}

// The contents page is written to web/index.html rather than into web/generated/, because Vite
// requires an index.html at its root and because "the first thing you see" should not be a
// redirect. It is generated, so it is gitignored and rebuilt by prebuild.
writeFileSync("web/index.html", contentsPage(ordered));

writeFileSync(
  join(OUT_DIR, "pages.json"),
  JSON.stringify(
    ordered.map((p) => ({
      id: p.front.id,
      page: p.front.page,
      part: p.front.part ?? null,
      title: p.front.title,
      subtitle: p.front.subtitle ?? null,
      isExperiment: p.isExperiment,
      readerCan: p.front.reader_can ?? null,
    })),
    null,
    2,
  ) + "\n",
);

if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s) building the notes:\n`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  console.error(
    "\nThese are build errors on purpose. The bare-number and comparative lints are the " +
      "mechanical form of promises the site makes in prose; the vocabulary check is the " +
      "mechanical form of 'no term is used before it is defined'.\n",
  );
  process.exit(1);
}

console.log(`built ${ordered.length} page(s) into ${OUT_DIR}/`);
for (const page of ordered) {
  console.log(`  ${String(page.front.page).padStart(2)}  ${page.front.id}`);
}
