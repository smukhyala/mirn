/**
 * Compiles web/notes/**\/*.md into standalone HTML pages under web/generated/.
 *
 * Build-time rather than client-side, and multi-page rather than a single app, for one reason:
 * with JavaScript disabled the prose and the mathematics must still appear. A reader with a slow
 * connection, a locked-down browser or a screen reader gets the notes; only the widgets need JS.
 *
 * What is left in this file is the part that touches the disk: find the pages, run the checks
 * over them, write the HTML out, and exit non-zero if anything complained. Everything that is a
 * function of its inputs lives under web/build/ instead, where it has tests:
 *
 *   lints.ts        the bare-number, comparative, jargon and synonym lints
 *   vocabulary.ts   front-matter closure against the ladder in web/vocab.ts
 *   quantities.ts   the {{q:…}} reference resolver, and the wording of its failures
 *   render.ts       body → HTML, including the maths-before-markdown ordering guarantee
 *
 * That split is not tidying. Those four are the parts that have actually broken — forty silently
 * unresolved references and a whole class of vocabulary bug — and a check nobody has watched fire
 * is a check nobody has.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { VOCABULARY } from "../web/vocab.js";
import {
  lintBareNumbers,
  lintComparatives,
  lintForwardTerms,
  lintUndefinedSynonyms,
  proseOf,
} from "../web/build/lints.js";
import { checkVocabulary, type PageVocabulary } from "../web/build/vocabulary.js";
import { escapeHtml, renderBody } from "../web/build/render.js";
import type { FactTable, LiveMetric, QuantityData } from "../web/build/quantities.js";
import { cssTokens } from "../web/ui/theme.js";
import {
  isKnownControl,
  isKnownMetric,
  isKnownWidgetKind,
  WIDGET_KINDS,
} from "../web/build/widgets.js";
import FACTS from "../web/data/experiment-facts.json";
import { makeRunConfig } from "../web/engine/contracts/config.js";
import { runPair } from "../web/engine/sim/run.js";
import { deviation } from "../web/engine/measure/metrics.js";
import { seededPermutations, splitHalfNull } from "../web/engine/measure/null/splitHalf.js";
import { clearance, robotCost } from "../web/engine/measure/metrics.js";
import { SIM_CONSTANTS } from "../web/engine/contracts/config.js";

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

// The check is in web/build/vocabulary.ts, with tests. This end only adapts parsed front matter
// into the records it reads, and turns its problems back into build errors.

function checkFrontMatterClosure(pages: readonly Page[]): void {
  const declarations: PageVocabulary[] = [];
  for (const page of pages) {
    declarations.push({
      file: page.file,
      page: page.front.page,
      introduces: page.front.introduces ?? [],
      uses: page.front.uses ?? [],
    });
  }
  const problems = checkVocabulary(declarations, VOCABULARY);
  for (const problem of problems) {
    fail(problem.file, problem.message);
  }
}

// ---------------------------------------------------------------- lints

// The rules themselves live in web/build/lints.ts, with tests: a lint nobody has watched fire is
// a lint nobody has.

function runLints(page: Page): void {
  const prose = proseOf(page.body);
  const problems = [
    ...lintBareNumbers(prose),
    ...lintComparatives(prose),
    ...lintForwardTerms(prose, page.front.page, page.front.introduces ?? [], VOCABULARY),
    ...lintUndefinedSynonyms(prose),
  ];
  for (const problem of problems) {
    fail(page.file, problem.message);
  }
}

// ---------------------------------------------------------------- live values

/**
 * Values for the live quantity widgets, computed at build time from the default configuration.
 *
 * A `{{q:widget-id}}` token names a `mirn:quantity` block on the same page, and the widget updates
 * it as the reader moves controls. But the number is also written into the static HTML here, so a
 * reader with JavaScript off sees "comes to 0.317 m" rather than "comes to —". Half the point of
 * compiling these pages ahead of time was that the argument survives without scripts, and a
 * sentence with a hole in it does not.
 *
 * These are metres, not formatted strings, because `{{q:id.anchor}}` has to be able to say which
 * body-scale band the number falls in. A pre-formatted "0.317 m" cannot be asked that, and the
 * anchor is the one phrase on the page whose whole promise is that it moves with the number.
 */
const LIVE_VALUES: Readonly<Record<string, LiveMetric>> = (() => {
  const result = runPair(makeRunConfig({ nTicks: 800 }));
  const dev = deviation(result.pair);
  const floor = splitHalfNull(result.control.positions, 40, seededPermutations(20260816));
  const cost = robotCost(result.treated, result.control, result.config.dt);
  const near = clearance(
    result.treated.robotPositions,
    result.treated.positions,
    SIM_CONSTANTS.robotRadiusM,
    SIM_CONSTANTS.pedRadiusM,
    0.5,
  );
  // Every metric the runtime can build needs a build-time value too, or a page citing it renders
  // a hole with JavaScript off. The set is asserted against web/build/widgets.ts by a test, so a
  // metric added to one and not the other fails rather than silently degrading.
  return {
    deviation: { headlineM: dev.meanM, fieldsM: { mean: dev.meanM, max: dev.maxM } },
    "deviation-summary": { headlineM: dev.meanM, fieldsM: { mean: dev.meanM, max: dev.maxM } },
    perturbation: { headlineM: dev.meanM, fieldsM: { mean: dev.meanM, max: dev.maxM } },
    "detection-floor": {
      headlineM: floor.floor,
      fieldsM: { floor: floor.floor, mean: floor.mean },
    },
    timeLost: {
      headlineM: cost.treatedArrivalS,
      fieldsM: { path: cost.treatedPathM },
      unit: "s",
    },
    nearMiss: {
      headlineM: near.nearMissEpisodes,
      fieldsM: { clearance: near.minM },
      unit: "count",
    },
  };
})();

const QUANTITIES: QuantityData = {
  tables: FACTS as unknown as Record<string, FactTable>,
  live: LIVE_VALUES,
};

// ---------------------------------------------------------------- shell

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
checkFrontMatterClosure(pages);

/**
 * Reading order: 1-6, then the seven experiments, then 7-9, then the colophon.
 *
 * Sorting experiments to the end put them AFTER the closing page, so the "previous" link on the
 * first experiment pointed at the colophon and the last thing before them was the site signing
 * off. The experiments belong where page 6 introduces them, which is what their `page: 6` already
 * says — they just have to sort after the page that shares the number rather than after
 * everything.
 */
const ordered = [...pages].sort((a, b) => {
  if (a.front.page !== b.front.page) {
    return a.front.page - b.front.page;
  }
  if (a.isExperiment !== b.isExperiment) {
    return a.isExperiment ? 1 : -1;
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

// The widget-id counter lives out here rather than inside the renderer so that renderBody holds
// no state between pages and can be called from a test with a known starting index. Ids only have
// to be unique within one document; running the counter across the whole build costs nothing and
// keeps them stable.
let widgetIndex = 0;

for (let i = 0; i < ordered.length; i++) {
  const page = ordered[i] as Page;
  runLints(page);

  const rendered = renderBody(page.body, {
    pageNumber: page.front.page,
    terms: VOCABULARY,
    quantities: QUANTITIES,
    startWidgetIndex: widgetIndex,
  });
  widgetIndex = rendered.nextWidgetIndex;
  for (const problem of rendered.problems) {
    fail(page.file, problem.message);
  }

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

  writeFileSync(
    join(OUT_DIR, `${page.front.id}.html`),
    shell(page, rendered.html, navParts.join("")),
  );
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
