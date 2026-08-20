/**
 * One page body → one block of HTML, with the ordering guarantee that makes the mathematics
 * survive.
 *
 * The pipeline is fixed and the order of its first two steps is load-bearing:
 *
 *   1. every block construct (widget, display maths, definition callout, caveat) is pulled out
 *      and replaced by an opaque placeholder;
 *   2. markdown renders what is left;
 *   3. `{{lit:}}` and `{{q:}}` tokens are resolved in the rendered prose;
 *   4. the placeholders are swapped back for the HTML from step 1.
 *
 * **Maths is extracted before markdown runs, and this is the whole reason step 1 exists.**
 * Rendering maths on the OUTPUT of markdown looks equivalent and is not: markdown treats a
 * backslash as an escape, so `\;` arrives at KaTeX as a bare `;` and every spacing command in
 * every equation renders as a stray semicolon. The same goes for `_`, which markdown reads as
 * emphasis and KaTeX reads as a subscript. Both were visible on the page and invisible in the
 * source, which is the worst combination a build can produce, and both are pinned by
 * `render.test.ts` — the test renders the same source the wrong way round and asserts the
 * difference, so the guarantee cannot be quietly lost to a tidy-up.
 *
 * Pure apart from the imports it renders with: no filesystem, no `process`, problems returned as
 * data. The widget counter is passed in and handed back rather than kept in a module variable, so
 * that ids stay stable across a whole build without this module holding state between pages.
 */
import { canonicalRef } from "./quantities.js";
import katex from "katex";
import MarkdownIt from "markdown-it";
import { load as loadYaml } from "js-yaml";
import type { Term } from "../vocab.js";
import {
  collectQuantityWidgets,
  resolveQuantity,
  type QuantityData,
  type QuantitySources,
} from "./quantities.js";

const md = new MarkdownIt({ html: true, typographer: true });

export interface RenderProblem {
  readonly rule: string;
  readonly message: string;
}

export interface RenderContext {
  /** The page's own number on the ladder, so a definition callout cannot appear before its page. */
  readonly pageNumber: number;
  readonly terms: readonly Term[];
  readonly quantities: QuantityData;
  /** Where this page's widget ids start. The caller owns the counter; see the file comment. */
  readonly startWidgetIndex: number;
}

export interface RenderResult {
  readonly html: string;
  readonly problems: readonly RenderProblem[];
  readonly nextWidgetIndex: number;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
}

export function renderBody(source: string, context: RenderContext): RenderResult {
  const problems: RenderProblem[] = [];
  const blocks: string[] = [];
  let widgetIndex = context.startWidgetIndex;

  const byId = new Map<string, Term>();
  for (const term of context.terms) {
    byId.set(term.id, term);
  }

  const sources: QuantitySources = {
    tables: context.quantities.tables,
    live: context.quantities.live,
    widgetMetrics: collectQuantityWidgets(source),
  };

  function stash(html: string): string {
    blocks.push(html);
    return `\n\nMIRNBLOCK${blocks.length - 1}ENDBLOCK\n\n`;
  }

  function renderWidget(kind: string, yamlish: string): string {
    const id = `mirn-widget-${widgetIndex}`;
    widgetIndex++;
    // The block body is parsed HERE, at build time, and embedded as JSON. Handing the client raw
    // YAML would mean shipping a parser and discovering a typo in the browser; this way a
    // malformed block fails the build, next to the page that contains it.
    let config: unknown;
    try {
      config = loadYaml(yamlish) ?? {};
    } catch (error) {
      problems.push({
        rule: "widget-yaml",
        message: `mirn:${kind} block is not valid YAML: ${(error as Error).message}`,
      });
      config = {};
    }
    const payload = JSON.stringify({ kind, config });
    return `<div class="widget" id="${id}" data-mirn-widget='${escapeAttribute(payload)}'><noscript><p class="widget-fallback">This is an interactive figure. It needs JavaScript; the argument around it does not.</p></noscript></div>`;
  }

  // ---------------------------------------------------------------- 1. extract

  let text = source.replace(
    /```mirn:([a-z]+)\n([\s\S]*?)```/g,
    (_all, kind: string, inner: string) => stash(renderWidget(kind, inner)),
  );

  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_all, tex: string) => {
    try {
      return stash(katex.renderToString(tex.trim(), { displayMode: true, throwOnError: true }));
    } catch (error) {
      problems.push({
        rule: "display-maths",
        message: `display maths failed to render: ${(error as Error).message}`,
      });
      return stash("");
    }
  });

  text = text.replace(/(?<!\\)\$([^$\n]+?)\$/g, (_all, tex: string) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: true });
    } catch (error) {
      problems.push({
        rule: "inline-maths",
        message: `inline maths failed to render: ${(error as Error).message}`,
      });
      return "";
    }
  });

  text = text.replace(/^:::term\{id=([a-z0-9-]+)\}\s*$/gm, (_all, id: string) => {
    const term = byId.get(id);
    if (term === undefined) {
      problems.push({ rule: "unknown-term", message: `:::term names unknown id '${id}'` });
      return stash("");
    }
    // Rendering a definition and OWNING a term are different things. `introduces` declares
    // canonical ownership and must be unique across the site, because that is what fixes the
    // ladder. But a page may usefully restate a definition where the term is being used — the
    // seven experiment pages all sit on page 6 and each wants the definitions it leans on. So a
    // :::term is legal on any page at or after the term's own, and illegal before it.
    if (term.page > context.pageNumber) {
      problems.push({
        rule: "term-too-early",
        message:
          `:::term{id=${id}} appears on page ${context.pageNumber}, but that term belongs to page ` +
          `${term.page} and must not be defined earlier than the ladder says`,
      });
    }
    return stash(
      `<aside class="term"><p class="term-name">${escapeHtml(term.term)}</p>` +
        `<p class="term-definition">${escapeHtml(term.definition)}</p></aside>`,
    );
  });

  text = text.replace(/^:::caveat\s*$([\s\S]*?)^:::\s*$/gm, (_all, inner: string) =>
    stash(`<aside class="caveat">${md.render(inner.trim())}</aside>`),
  );

  // ---------------------------------------------------------------- 2. markdown

  let html = md.render(text);

  // ---------------------------------------------------------------- 3. tokens

  html = html.replace(/\{\{lit:([^}]*)\}\}/g, (_all, literal: string) => escapeHtml(literal));
  html = html.replace(/\{\{q:([^}]*)\}\}/g, (_all, ref: string) => {
    const resolved = resolveQuantity(ref, sources);
    if (resolved.kind === "problem") {
      problems.push({ rule: resolved.problem.rule, message: resolved.problem.message });
      return `<span class="quantity quantity-broken">?</span>`;
    }
    return `<span class="quantity" data-quantity="${escapeHtml(canonicalRef(ref))}">${escapeHtml(resolved.text)}</span>`;
  });

  // ---------------------------------------------------------------- 4. restore

  // Two passes: a placeholder alone in a paragraph loses the paragraph, one inside a sentence
  // keeps it.
  html = html.replace(
    /<p>MIRNBLOCK(\d+)ENDBLOCK<\/p>/g,
    (_all, index: string) => blocks[Number(index)] as string,
  );
  html = html.replace(
    /MIRNBLOCK(\d+)ENDBLOCK/g,
    (_all, index: string) => blocks[Number(index)] as string,
  );

  return { html, problems, nextWidgetIndex: widgetIndex };
}
