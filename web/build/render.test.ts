import { describe, expect, it } from "vitest";
import katex from "katex";
import MarkdownIt from "markdown-it";
import { renderBody, type RenderContext } from "./render.js";
import type { FactTable, LiveMetric } from "./quantities.js";
import type { Term } from "../vocab.js";

const TERMS: readonly Term[] = [
  { id: "run", term: "run", definition: "One complete pass of the room.", page: 1 },
  { id: "deviation", term: "deviation", definition: "How far from where they would have been.", page: 2 },
];

const TABLES: Readonly<Record<string, FactTable>> = {
  e2_density: {
    axis: "nPedestrians",
    nSeeds: 8,
    rows: [
      { nPedestrians: 4, meanDeviationM: 0.104 },
      { nPedestrians: 12, meanDeviationM: 0.276 },
    ],
  },
};

const LIVE: Readonly<Record<string, LiveMetric>> = {
  deviation: { headlineM: 0.317, fieldsM: { max: 1.42 } },
};

function context(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    pageNumber: overrides.pageNumber ?? 3,
    terms: overrides.terms ?? TERMS,
    quantities: overrides.quantities ?? { tables: TABLES, live: LIVE },
    startWidgetIndex: overrides.startWidgetIndex ?? 0,
  };
}

function html(source: string, overrides: Partial<RenderContext> = {}): string {
  return renderBody(source, context(overrides)).html;
}

describe("maths is extracted before markdown runs", () => {
  // This is the ordering guarantee, and it is the one regression in this file that is invisible
  // in the source and visible on the page: the Markdown reads correctly, the equation renders,
  // and every spacing command in it has quietly become punctuation.
  const SPACED = String.raw`d \;=\; \lVert p - q \rVert`;

  it("keeps \\; as a spacing element rather than turning it into a semicolon", () => {
    const rendered = html(`$$${SPACED}$$`);
    expect(rendered).toContain("mspace");
    // KaTeX marks a literal `;` as a punctuation atom. Its presence is the regression, exactly.
    expect(rendered).not.toContain("mpunct");
  });

  it("hands KaTeX the source the author wrote, backslashes intact", () => {
    // The annotation node carries the original TeX, so this asserts on what KaTeX received
    // rather than on what it chose to emit.
    expect(html(`$$${SPACED}$$`)).toContain("d \\;=\\; \\lVert p - q \\rVert");
  });

  it("renders differently from the wrong order, which is why the order is pinned", () => {
    // The negative control. Without it, a future refactor that renders maths on markdown's output
    // would still pass the two assertions above on some other input, and this test would be
    // asserting a property of KaTeX rather than a property of this pipeline.
    const markdown = new MarkdownIt({ html: true, typographer: true });
    const mangled = markdown.renderInline(SPACED);
    expect(mangled).not.toContain("\\;");
    const wrongOrder = katex.renderToString(mangled, { displayMode: true, throwOnError: true });
    expect(wrongOrder).toContain("mpunct");
    expect(html(`$$${SPACED}$$`)).not.toContain("mpunct");
  });

  it("keeps a subscript a subscript rather than an emphasis", () => {
    // The same failure with a different character: markdown reads the pair of underscores in
    // `p_x - q_x` as emphasis and eats both, so the equation loses its subscripts.
    const rendered = html("$$p_x - q_x$$");
    expect(rendered).toContain("msub");
    expect(rendered).not.toContain("<em>");
  });

  it("renders inline maths too, without the display wrapper", () => {
    const rendered = html("The gap $d$ is small.");
    expect(rendered).toContain("katex");
    expect(rendered).not.toContain("katex-display");
  });

  it("reports maths that will not parse instead of emitting a broken equation", () => {
    const result = renderBody("$$\\notacommand{x}$$", context());
    expect(result.problems.map((problem) => problem.rule)).toEqual(["display-maths"]);
    expect(result.problems[0]?.message).toContain("display maths failed to render");
  });
});

describe("quantity and literal tokens", () => {
  it("resolves a reference into the static HTML", () => {
    // The whole reason tokens are resolved at build time: with JavaScript off the sentence still
    // has its number in it.
    const rendered = html("The crowd moved {{q:e2_density[nPedestrians=12].meanDeviationM}} on average.");
    expect(rendered).toContain("0.276 m");
    expect(rendered).toContain('class="quantity"');
  });

  it("survives markdown, whose emphasis rules would otherwise eat an underscored table name", () => {
    // `e2_density` and `meanDeviationM_sd` both contain underscores, and tokens are resolved
    // after markdown has run. If markdown ever treated those as emphasis the reference would
    // arrive misspelled and fail as "unknown table".
    const result = renderBody("Moved {{q:e2_density@0.meanDeviationM}} in all.", context());
    expect(result.problems).toEqual([]);
    expect(result.html).toContain("0.104 m");
  });

  it("marks a broken reference in the page and reports it, rather than one or the other", () => {
    // A broken reference used to render as an ellipsis and look fine to the build. Now it is
    // visible in both places: an obvious hole for a reader, and a build error for the author.
    const result = renderBody("Moved {{q:e2_density[nPedestrians=99].meanDeviationM}}.", context());
    expect(result.html).toContain("quantity-broken");
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.message).toContain("4, 12");
  });

  it("passes a literal through escaped, with no live-value machinery attached", () => {
    // {{lit:}} is for settings, not results. It must not acquire a data-quantity attribute, or a
    // hand-written number would look to the next reader like a measured one.
    const rendered = html("a {{lit:22 m}} room");
    expect(rendered).toContain("22 m");
    expect(rendered).not.toContain("data-quantity");
  });
});

describe("blocks", () => {
  it("turns a widget block into a mount point and advances the id counter", () => {
    const result = renderBody("```mirn:scene\nid: ghost\npreset: corridor-11\n```\n", context({ startWidgetIndex: 4 }));
    expect(result.html).toContain('id="mirn-widget-4"');
    expect(result.html).toContain("data-mirn-widget");
    expect(result.nextWidgetIndex).toBe(5);
  });

  it("gives a reader with no JavaScript a sentence instead of an empty box", () => {
    expect(html("```mirn:scene\nid: ghost\n```\n")).toContain("<noscript>");
  });

  it("parses the block's YAML here, so a typo fails the build and not the browser", () => {
    const result = renderBody("```mirn:scene\nid: [unclosed\n```\n", context());
    expect(result.problems.map((problem) => problem.rule)).toEqual(["widget-yaml"]);
  });

  it("renders a definition callout from the ladder, so the wording lives in one place", () => {
    const rendered = html(":::term{id=deviation}\n");
    expect(rendered).toContain("How far from where they would have been.");
    expect(rendered).toContain('class="term"');
  });

  it("rejects a definition callout that appears before the term's own page", () => {
    // Restating a definition where a term is used is fine; restating it BEFORE the ladder defines
    // it is the jargon failure the ladder exists to prevent, dressed up as a definition.
    const result = renderBody(":::term{id=deviation}\n", context({ pageNumber: 1 }));
    expect(result.problems.map((problem) => problem.rule)).toEqual(["term-too-early"]);
  });

  it("rejects a definition callout naming an id the ladder does not have", () => {
    const result = renderBody(":::term{id=displacement}\n", context());
    expect(result.problems[0]?.rule).toBe("unknown-term");
    expect(result.problems[0]?.message).toContain("displacement");
  });

  it("renders a caveat as markdown inside its own aside", () => {
    const rendered = html(":::caveat\nThe crowd is *invented*.\n:::\n");
    expect(rendered).toContain('class="caveat"');
    expect(rendered).toContain("<em>invented</em>");
  });
});

describe("statelessness between pages", () => {
  it("returns the same HTML for the same input, so a rebuild is a no-op", () => {
    // Guardrail 4 in miniature. The renderer holds no counter of its own precisely so that this
    // is true; a module-level widget counter made the output depend on call order.
    const source = "# Title\n\n```mirn:scene\nid: ghost\n```\n\nMoved {{q:e2_density@0.meanDeviationM}}.";
    expect(html(source)).toBe(html(source));
  });
});
