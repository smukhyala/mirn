/**
 * The vocabulary ladder's front-matter closure check, as a pure function over data.
 *
 * Guardrail 12 says a term is defined in plain English at first use and the ladder in
 * `web/vocab.ts` fixes the order. Three separate things have to hold for that to be true, and
 * this file owns the first two:
 *
 *   1. every term is introduced by exactly one page, and by the page `web/vocab.ts` says owns it;
 *   2. no page declares that it *uses* a term whose page comes later than its own;
 *   3. no page's prose contains a term whose page comes later than its own.
 *
 * The third is the jargon gate in `lints.ts`, and it exists because for a long time only this
 * file's checks ran — and a check that compares two DECLARED lists against each other is not a
 * guarantee about the prose at all. The two halves are complementary: the ladder check catches a
 * page that lies about what it uses, the jargon gate catches a page that says nothing.
 *
 * Pure by construction: pages arrive as records, problems come back as data, and nothing here
 * reads a file or exits a process.
 */
import type { Term } from "../vocab.js";

export interface VocabularyProblem {
  readonly rule:
    | "non-string-id"
    | "unknown-term"
    | "wrong-page"
    | "forward-use"
    | "introduced-twice"
    | "never-introduced";
  /**
   * What to blame. Usually the page's path; two paths joined for a duplicate introduction, since
   * neither page is at fault on its own, and `web/vocab.ts` for a term no page ever introduces.
   */
  readonly file: string;
  readonly message: string;
}

export interface PageVocabulary {
  readonly file: string;
  readonly page: number;
  /**
   * Straight from YAML, so the element type is genuinely unknown rather than merely unchecked:
   * `uses: [no]` parses as `false`, not as the string "no".
   */
  readonly introduces: readonly unknown[];
  readonly uses: readonly unknown[];
}

export function checkVocabulary(
  pages: readonly PageVocabulary[],
  vocabulary: readonly Term[],
): VocabularyProblem[] {
  const byId = new Map<string, Term>();
  for (const term of vocabulary) {
    byId.set(term.id, term);
  }

  const problems: VocabularyProblem[] = [];
  const introducedBy = new Map<string, string[]>();

  for (const page of pages) {
    for (const declared of page.introduces) {
      if (typeof declared !== "string") {
        problems.push({
          rule: "non-string-id",
          file: page.file,
          message:
            `'introduces' contains ${JSON.stringify(declared)}, which is not a string. YAML turns ` +
            `bare words like null, yes, no and on into literals — quote the id if it looks like one`,
        });
        continue;
      }
      const term = byId.get(declared);
      if (term === undefined) {
        problems.push({
          rule: "unknown-term",
          file: page.file,
          message: `introduces unknown term '${declared}'`,
        });
        continue;
      }
      if (term.page !== page.page) {
        problems.push({
          rule: "wrong-page",
          file: page.file,
          message: `introduces '${declared}', but vocab.ts says that term belongs on page ${term.page}`,
        });
      }
      // Recorded even when the page number disagrees, so that a term claimed by two pages is
      // still reported as claimed twice rather than only as claimed from the wrong place.
      const claimants = introducedBy.get(declared) ?? [];
      claimants.push(page.file);
      introducedBy.set(declared, claimants);
    }

    for (const declared of page.uses) {
      if (typeof declared !== "string") {
        problems.push({
          rule: "non-string-id",
          file: page.file,
          message:
            `'uses' contains ${JSON.stringify(declared)}, which is not a string. YAML turns bare ` +
            `words like null, yes, no and on into literals — quote the id if it looks like one`,
        });
        continue;
      }
      const term = byId.get(declared);
      if (term === undefined) {
        problems.push({
          rule: "unknown-term",
          file: page.file,
          message: `uses unknown term '${declared}'`,
        });
        continue;
      }
      // Strictly later, not different: a page may use a term it introduces itself, and the seven
      // experiment pages all share page 6 and lean on each other's definitions.
      if (term.page > page.page) {
        problems.push({
          rule: "forward-use",
          file: page.file,
          message:
            `uses '${declared}' on page ${page.page}, but it is not defined until page ${term.page}`,
        });
      }
    }
  }

  for (const [id, files] of introducedBy) {
    if (files.length > 1) {
      problems.push({
        rule: "introduced-twice",
        file: files.join(" and "),
        message: `both introduce '${id}'; a term may be introduced exactly once`,
      });
    }
  }

  // Experiment pages live under page 6, so a term never introduced by a numbered page is a real
  // gap: the reader meets a defined word that nothing on the site ever defines.
  for (const term of vocabulary) {
    if (!introducedBy.has(term.id)) {
      problems.push({
        rule: "never-introduced",
        file: "web/vocab.ts",
        message: `'${term.id}' is never introduced by any page`,
      });
    }
  }

  return problems;
}
