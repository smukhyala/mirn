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

  text = text.replace(/^:::term\{id=([a-z0-9-]+)\}\s*$/gm, (_all, id: string) => {
    const term = BY_ID.get(id);
    if (term === undefined) {
      fail(page.file, `:::term names unknown id '${id}'`);
      return stash("");
    }
    if (!(page.front.introduces ?? []).includes(id)) {
      fail(
        page.file,
        `:::term{id=${id}} appears but '${id}' is not in this page's front-matter 'introduces'`,
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

// ---------------------------------------------------------------- maths

function renderMaths(html: string, page: Page): string {
  let out = html.replace(/\$\$([\s\S]+?)\$\$/g, (_all, tex: string) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: true });
    } catch (error) {
      fail(page.file, `display maths failed to render: ${(error as Error).message}`);
      return "";
    }
  });
  out = out.replace(/(?<!\\)\$([^$\n]+?)\$/g, (_all, tex: string) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: true });
    } catch (error) {
      fail(page.file, `inline maths failed to render: ${(error as Error).message}`);
      return "";
    }
  });
  return out;
}

// ---------------------------------------------------------------- tokens

function renderTokens(html: string): string {
  let out = html.replace(/\{\{lit:([^}]*)\}\}/g, (_all, literal: string) => escapeHtml(literal));
  out = out.replace(
    /\{\{q:([^}]*)\}\}/g,
    (_all, ref: string) =>
      `<span class="quantity" data-quantity="${escapeHtml(ref)}" role="button" tabindex="0">…</span>`,
  );
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

for (let i = 0; i < ordered.length; i++) {
  const page = ordered[i] as Page;
  runLints(page);

  const { text, blocks } = extractBlocks(page, page.body);
  let html = md.render(text);
  html = renderMaths(html, page);
  html = renderTokens(html);
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
