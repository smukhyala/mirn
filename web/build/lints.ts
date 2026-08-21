/**
 * The four prose lints, as pure functions so they can be tested: bare number, comparative near a
 * live figure, term used before the page that defines it, and synonym for a term the site never
 * defines. `scripts/build-notes.ts` runs all four over every page.
 *
 * They live here rather than inside scripts/build-notes.ts because a lint nobody has watched fire
 * is a lint nobody has. Each encodes a promise the site makes in prose, and each should be readable
 * as that promise rather than as a regex.
 *
 * There were two when this file was written, and the header still said two after the third and
 * fourth arrived. A fifth means editing this sentence in the same commit.
 */

/**
 * Strip everything that is not prose before linting: fenced blocks, inline code, maths, the
 * literal escape hatch, and the front matter.
 *
 * Getting this wrong in either direction is bad. Too little stripping and every YAML block trips
 * the number lint; too much and a real violation hides inside something that merely looks like
 * code.
 */
export function proseOf(body: string): string {
  return body
    .replace(/^---[\s\S]*?^---/m, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/\{\{lit:[^}]*\}\}/g, " ");
}

/**
 * A numeral immediately followed by a unit.
 *
 * The negative lookbehind keeps it off version numbers, times of day and paths. The trailing
 * guard is `(?!\w)` rather than `\b`, which matters more than it looks: `\b` after `%` never
 * matches, because `%` and end-of-string are both non-word characters, so the first version of
 * this rule silently ignored every percentage on the site. `(?!\w)` also stops `m` matching
 * inside `mm` while still letting the alternation reach `metres`.
 */
export const BARE_NUMBER =
  /(?<![\w.:/-])(\d+(?:\.\d+)?)\s*(m|s|cm|km|metres|meters|seconds|m\/s|%)(?!\w)/gi;

export const COMPARATIVES =
  /\b(more than|less than|greater than|fewer than|larger than|smaller than|bigger than|higher than|lower than|about (?:half|twice|three times)|twice|half of|roughly \w+ times|times (?:the|as))\b/i;

export interface LintProblem {
  readonly rule: "bare-number" | "comparative" | "forward-term" | "undefined-synonym";
  readonly found: string;
  readonly message: string;
}

/** "Never display a number without explaining where it came from", as a build error. */
export function lintBareNumbers(prose: string): LintProblem[] {
  const problems: LintProblem[] = [];
  for (const match of prose.matchAll(BARE_NUMBER)) {
    const found = match[0].trim();
    problems.push({
      rule: "bare-number",
      found,
      message:
        `bare number "${found}" in prose. Wrap a setting as {{lit:${found}}} or use a {{q:}} ` +
        `token for a live result — see docs/teaching/authoring.md`,
    });
  }
  return problems;
}

/**
 * "No sentence may assert a relation a rendered control could falsify."
 *
 * Only fires near a live quantity, because a comparative between two fixed measured values is
 * fine — it is a comparative next to a number the reader can change that is the problem.
 */
export function lintComparatives(prose: string): LintProblem[] {
  const problems: LintProblem[] = [];
  // `.anchor` is exempt, and has to be: it resolves to a body-scale phrase like "about one
  // stride" that moves with the number, which is precisely why the rule's own error message
  // recommends it. Without this the lint rejected the construct it told you to use, and the
  // documented escape hatch was itself a build error.
  for (const match of prose.matchAll(/\{\{q:[^}]*\}\}/g)) {
    if (match[0].endsWith(".anchor}}")) {
      continue;
    }
    const index = match.index ?? 0;
    const window = prose.slice(Math.max(0, index - 80), index + match[0].length + 80);
    const found = window.match(COMPARATIVES);
    if (found !== null) {
      problems.push({
        rule: "comparative",
        found: found[0],
        message:
          `comparative "${found[0]}" sits within 80 characters of ${match[0]} — a slider could ` +
          `falsify it. Use {{q:...anchor}} instead, or move the claim away from the live number`,
      });
    }
  }
  return problems;
}

/**
 * The jargon gate: no prose may use a term before the page that defines it.
 *
 * This existed as a comment in web/vocab.ts describing a check the build did not perform. The
 * front-matter closure check only ever compared two DECLARED lists against each other, so a page
 * could use any term it liked as long as it did not mention it in its own front matter — which is
 * the opposite of a guarantee. A cross-page audit found the gap; the ladder happened to hold
 * anyway, by luck rather than by build.
 *
 * The introducing sentence is exempt: a term's own definition necessarily contains it, and the
 * `:::term` callout is rendered from vocab.ts rather than written into the page.
 */
export interface LadderTerm {
  readonly id: string;
  readonly term: string;
  readonly page: number;
}

export function lintForwardTerms(
  prose: string,
  pageNumber: number,
  introduces: readonly string[],
  terms: readonly LadderTerm[],
): LintProblem[] {
  const problems: LintProblem[] = [];
  for (const entry of terms) {
    if (entry.page <= pageNumber) {
      continue;
    }
    if (introduces.includes(entry.id)) {
      continue;
    }
    // Word-boundary, case-insensitive, and the multi-word terms are matched whole so that "the
    // null" does not fire on "null" inside a longer word.
    const escaped = entry.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    const found = prose.match(pattern);
    if (found !== null) {
      problems.push({
        rule: "forward-term",
        found: found[0],
        message:
          `page ${pageNumber} uses "${found[0]}", but the vocabulary ladder does not define ` +
          `'${entry.id}' until page ${entry.page}. Either move the term later, define it earlier ` +
          `in web/vocab.ts, or say it in plain words here`,
      });
    }
  }
  return problems;
}

/**
 * Words that mean a defined term but are not it.
 *
 * A cross-page audit found "displacement" used nineteen times across five pages for the quantity
 * the ladder calls `deviation` — and one page used the synonym exclusively while declaring the
 * real term in its front matter, so its entire argument rode on a word defined nowhere on the
 * site. Nothing would have caught that: the ladder check only knows about terms it has heard of.
 *
 * This is the cheap half of the fix. It cannot find a synonym nobody has thought of yet, but each
 * one found by hand gets added here so it is found by build next time.
 */
export const UNDEFINED_SYNONYMS: readonly (readonly [string, string])[] = Object.freeze([
  ["displacement", "deviation"],
  ["displaced", "deviation (or recast the sentence)"],
  ["perturbed", "perturbation (or recast the sentence)"],
  ["nominal path", "nominal trajectory"],
  ["ground truth", "the run with no robot in it"],
  ["baseline run", "the run with no robot in it"],
]);

export function lintUndefinedSynonyms(prose: string): LintProblem[] {
  const problems: LintProblem[] = [];
  for (const [synonym, instead] of UNDEFINED_SYNONYMS) {
    const pattern = new RegExp(`\\b${synonym}\\b`, "i");
    const found = prose.match(pattern);
    if (found !== null) {
      problems.push({
        rule: "undefined-synonym",
        found: found[0],
        message:
          `"${found[0]}" is not a defined term on this site. Use ${instead}. A synonym the reader ` +
          `has never been given is jargon however ordinary it sounds`,
      });
    }
  }
  return problems;
}
