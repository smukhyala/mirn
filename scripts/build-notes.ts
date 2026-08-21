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
  // The orientation strip. `reader_can` is written for the author; these two are written for the
  // reader, and are the only front-matter fields that reach the page. Both optional: a page with
  // nothing specific to say here prints nothing.
  shows?: string;
  try?: string;
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
      // `shows` and `try` are optional, but a half-written one is a mistake rather than an
      // omission: `try:` with nothing after it parses as null, which would silently render an
      // empty strip. Absent means absent; present means a sentence.
      let malformed = false;
      for (const field of ["shows", "try"] as const) {
        const value = front[field];
        if (value !== undefined && typeof value !== "string") {
          fail(
            file,
            `front matter \`${field}\` must be a sentence of text. Omit the field entirely if ` +
              `this page has nothing to say there`,
          );
          malformed = true;
        }
      }
      if (malformed) {
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
  // The orientation strip is linted with the body rather than beside it. `proseOf` strips front
  // matter, so these two lines would otherwise be the only prose on the site the four rules never
  // see — and they are the first prose a reader meets. Joined in, they get all four: a numeral
  // with a unit in `try` needs {{lit:}} exactly as it would in a paragraph.
  const orientationText = [page.front.shows ?? "", page.front.try ?? ""].join("\n\n");
  const prose = proseOf(`${page.body}\n\n${orientationText}`);
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
    // The site's own ladder defines perturbation as the TOTAL — "once you have added the
    // deviations up ... perturbation is the total" — and this was rendering the per-person mean
    // under a sentence reading "the robot's whole effect on the crowd". Person-metres, which is
    // what e2-density already calls the same quantity.
    perturbation: {
      headlineM: dev.meanM * dev.perAgentM.length,
      fieldsM: { perPerson: dev.meanM, max: dev.maxM },
      unit: "person-metres",
    },
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

function shell(page: Page, contentHtml: string, orientationHtml: string, nav: string): string {
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
  ${orientationHtml}
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

  /**
   * The one line under a title, and the only two links that get one.
   *
   * Eighteen links each carrying a subtitle read as a table of contents, which is what somebody
   * arriving has no use for. The titles carry themselves; these two do not. "Experiments" has to
   * say that the seven questions are behind it, because this page no longer lists them, and "the
   * instrument" is a name for a thing a reader has not met yet.
   */
  const SUBTITLES: Readonly<Record<string, string>> = {
    experiments: "Seven questions, one changed setting each",
    instrument: "Every control, no prose",
  };

  function row(id: string, title: string, href: string): string {
    const subtitle =
      SUBTITLES[id] === undefined
        ? ""
        : `<span class="contents-subtitle">${escapeHtml(SUBTITLES[id] as string)}</span>`;
    return `<li><a href="${href}">${escapeHtml(title)}</a>${subtitle}</li>`;
  }

  const sections: string[] = [];
  let currentPart: number | null = null;
  let open = false;

  /**
   * The closing page has no part, and used to print an empty heading above itself. It joins the
   * instrument under "Also" instead, which is what both of them are.
   */
  const closing: Page[] = [];

  const numbered = pages.filter((p) => !p.isExperiment);
  for (const page of numbered) {
    const part = page.front.part;
    if (part === undefined || PART_NAMES[part] === undefined) {
      closing.push(page);
      continue;
    }
    if (part !== currentPart) {
      if (open) {
        sections.push("</ol>");
      }
      sections.push(`<p class="contents-part">${escapeHtml(PART_NAMES[part] as string)}</p><ol>`);
      currentPart = part;
      open = true;
    }
    sections.push(row(page.front.id, page.front.title, `./generated/${page.front.id}.html`));
  }
  if (open) {
    sections.push("</ol>");
  }

  sections.push(`<p class="contents-part">Also</p><ol>`);
  for (const page of closing) {
    sections.push(row(page.front.id, page.front.title, `./generated/${page.front.id}.html`));
  }
  sections.push(row("instrument", "The instrument", "./instrument.html"));
  sections.push("</ol>");

  // The seven experiments are deliberately absent. Every one of them is linked from page 6,
  // which is the page that says what an experiment on this site is and what corridor-11 is — the
  // two things that make an experiment page mean anything. Listing them here as well made a first
  // screen of eighteen links, and offered seven of them to a reader told none of that yet.
  // web/app/__tests__/landing.test.ts checks page 6 still carries all seven, so this stays a
  // delegation rather than becoming seven orphans.

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MIRN — an interactive notebook about perturbation</title>
<link rel="stylesheet" href="./theme.gen.css">
<link rel="stylesheet" href="./style.css">
</head>
<body class="landing">
<header class="masthead">
  <p class="eyebrow">An interactive notebook</p>
  <h1>What a robot does to a crowd, and how you would know</h1>
  <!-- Guardrail 1, in the one place on the site with no front matter to carry it. The animation
       below is the first crowd anybody sees, so the word "invented" has to be above it and not in
       the figcaption underneath — and the figure is hidden without JavaScript, which would leave
       a scriptless reader nothing but the footer. One sentence, and it opens with the disclosure. -->
  <p class="standfirst">Every crowd on this site is invented: a robot crosses one, some of the
  people move differently than they would have, and this is how you would measure how much — you
  need no robotics background.</p>
</header>
<!-- Hidden until web/hero.ts fills it, so a reader with no JavaScript gets the title, the
     sentence and the index rather than an empty box captioned as an animation. -->
<figure class="hero" id="hero" hidden>
  <canvas class="hero-arena" id="hero-arena" role="img"
    aria-label="A robot crossing a room of invented pedestrians, drawn as it is computed."></canvas>
  <figcaption class="hero-caption">An invented crowd, computed in your browser as you watch.
  Nobody in it is a recording of a real person.</figcaption>
</figure>
<p class="start"><a class="start-link" href="./generated/the-room.html">Start reading</a></p>
<main class="contents">
${sections.join("\n")}
</main>
<footer class="page-footer">
  <p>Everything here is simulated. The crowd is a model, not a recording of real people, and no
  number on this site is a measurement of anything that happened.</p>
</footer>
<script type="module" src="./hero.ts"></script>
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
    orientation: { shows: page.front.shows, try: page.front.try },
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
    shell(page, rendered.html, rendered.orientationHtml, navParts.join("")),
  );
}

// The contents page is written to web/index.html rather than into web/generated/, because Vite
// requires an index.html at its root and because "the first thing you see" should not be a
// redirect. It is generated, so it is gitignored, and every path that serves the site rebuilds it
// first: `npm run dev` and `npm run build` both run `npm run notes` before vite. There is no
// prebuild hook — an earlier version of this comment claimed one, and npm would have run it
// silently for years without anybody noticing it did not exist.
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
      shows: p.front.shows ?? null,
      try: p.front.try ?? null,
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
    "\nThese are build errors on purpose. Four prose lints run over every page — bare number, " +
      "comparative near a live figure, term used before the page that defines it, and synonym " +
      "for a term the site never defines — plus the front-matter closure check against the " +
      "vocabulary ladder and the renderer's own checks on widgets, controls and references.\n",
  );
  process.exit(1);
}

console.log(`built ${ordered.length} page(s) into ${OUT_DIR}/`);
for (const page of ordered) {
  console.log(`  ${String(page.front.page).padStart(2)}  ${page.front.id}`);
}
