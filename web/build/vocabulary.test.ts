import { describe, expect, it } from "vitest";
import { checkVocabulary, type PageVocabulary } from "./vocabulary.js";
import type { Term } from "../vocab.js";

/**
 * A three-rung ladder is enough: the checks are all about the ORDER of two page numbers, and a
 * longer fixture would only make the failures harder to read.
 */
const LADDER: readonly Term[] = [
  { id: "run", term: "run", definition: "One complete pass of the room.", page: 1 },
  { id: "deviation", term: "deviation", definition: "How far from where they would have been.", page: 2 },
  { id: "the-null", term: "the null", definition: "What the number reads when nothing happened.", page: 7 },
];

function page(file: string, number: number, declared: Partial<PageVocabulary>): PageVocabulary {
  return {
    file,
    page: number,
    introduces: declared.introduces ?? [],
    uses: declared.uses ?? [],
  };
}

/** Every rung has a home, so a test about one rule is not drowned in never-introduced problems. */
const COMPLETE: readonly PageVocabulary[] = [
  page("01.md", 1, { introduces: ["run"] }),
  page("02.md", 2, { introduces: ["deviation"] }),
  page("07.md", 7, { introduces: ["the-null"] }),
];

function withPages(...extra: PageVocabulary[]) {
  return checkVocabulary([...COMPLETE, ...extra], LADDER);
}

describe("front-matter closure: when a page may say it uses a term", () => {
  it("fails a page that uses a term the ladder defines later", () => {
    // The failure this guards: page 3 leans on "the null" to make its argument, the reader meets
    // the word four pages before anything defines it, and the build says nothing because the two
    // declared lists in the front matter agree with each other perfectly well.
    const problems = withPages(page("03.md", 3, { uses: ["the-null"] }));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.rule).toBe("forward-use");
    expect(problems[0]?.file).toBe("03.md");
    expect(problems[0]?.message).toContain("page 7");
  });

  it("permits a term on its own page, because a page uses what it introduces", () => {
    // Guards over-correction: a rule of "different page" rather than "later page" would make
    // every page that defines a term and then uses it a build error, and the natural fix for that
    // is to delete the check.
    expect(withPages(page("02b.md", 2, { uses: ["deviation"] }))).toEqual([]);
  });

  it("permits a term on any later page", () => {
    expect(withPages(page("05.md", 5, { uses: ["deviation", "run"] }))).toEqual([]);
  });

  it("permits sibling pages that share a page number to lean on each other", () => {
    // The seven experiment pages all sit on page 6. If sharing a number counted as forward use,
    // none of them could name a term another one introduces.
    const problems = withPages(page("e1.md", 6, { uses: ["deviation"] }), page("e2.md", 6, { uses: ["deviation"] }));
    expect(problems).toEqual([]);
  });
});

describe("front-matter closure: who owns a term", () => {
  it("fails when two pages both introduce the same term", () => {
    // The failure this guards: two pages each define "deviation" in their own words, the reader
    // meets a second first-definition three pages after the first, and the ladder no longer fixes
    // an order because there is no single place the term comes from.
    const problems = withPages(page("04.md", 2, { introduces: ["deviation"] }));
    const duplicates = problems.filter((problem) => problem.rule === "introduced-twice");
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.file).toBe("02.md and 04.md");
    expect(duplicates[0]?.message).toContain("exactly once");
  });

  it("fails when no page introduces a term at all", () => {
    // The failure this guards: a term is added to web/vocab.ts, the jargon gate starts policing
    // it, and no page ever defines it — so the site enforces an order for a word the reader is
    // never given. The blame lands on vocab.ts because no single page is at fault.
    const problems = checkVocabulary([page("01.md", 1, { introduces: ["run"] })], LADDER);
    const missing = problems.filter((problem) => problem.rule === "never-introduced");
    expect(missing).toHaveLength(2);
    expect(missing.map((problem) => problem.message).join(" ")).toContain("'deviation'");
    expect(missing[0]?.file).toBe("web/vocab.ts");
  });

  it("fails when a page introduces a term the ladder puts elsewhere", () => {
    // Guards the ladder being edited on one side only: moving a term in vocab.ts without moving
    // its definition leaves the reader meeting it on a page that no longer claims it.
    const problems = withPages(page("09.md", 9, { introduces: ["the-null"] }));
    const wrong = problems.filter((problem) => problem.rule === "wrong-page");
    expect(wrong).toHaveLength(1);
    expect(wrong[0]?.message).toContain("page 7");
  });

  it("still reports a duplicate that was also claimed from the wrong page", () => {
    // Two problems, not one: fixing the page number would otherwise reveal a duplicate the build
    // had never mentioned, which is the kind of second-round failure that erodes trust in a gate.
    const problems = withPages(page("09.md", 9, { introduces: ["the-null"] }));
    expect(problems.map((problem) => problem.rule).sort()).toEqual(["introduced-twice", "wrong-page"]);
  });
});

describe("front-matter closure: hostile YAML", () => {
  it("names an id that is not a string, rather than silently ignoring it", () => {
    // The failure this guards, and it has bitten: `uses: [no]` is not the term "no", it is the
    // boolean false, because YAML 1.1 says so. Left unchecked the entry matches nothing, the page
    // appears to declare a dependency it does not have, and the build is happy.
    const problems = withPages(page("03.md", 3, { uses: [false] }));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.rule).toBe("non-string-id");
    expect(problems[0]?.message).toContain("quote the id");
  });

  it("names an unknown id in introduces and in uses", () => {
    const problems = withPages(
      page("03.md", 3, { uses: ["nonesuch"] }),
      page("04.md", 4, { introduces: ["alsonot"] }),
    );
    expect(problems.map((problem) => problem.rule)).toEqual(["unknown-term", "unknown-term"]);
    expect(problems[0]?.message).toContain("'nonesuch'");
    expect(problems[1]?.message).toContain("'alsonot'");
  });

  it("keeps checking the rest of a page after one bad entry", () => {
    // A check that stops at the first problem turns one authoring pass into four build cycles.
    const problems = withPages(page("03.md", 3, { uses: [false, "the-null"] }));
    expect(problems.map((problem) => problem.rule)).toEqual(["non-string-id", "forward-use"]);
  });
});
