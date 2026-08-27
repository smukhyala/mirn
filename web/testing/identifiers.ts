/**
 * Guardrail 12's teeth, in one place.
 *
 * The rule is that no bare code identifier appears on any surface a reader sees, and its
 * mechanical half has always been a regular expression. That expression was written out by hand in
 * twenty places across thirteen files, and by the time anybody counted it had drifted into three
 * different expressions — which means the guardrail was enforced three different strengths
 * depending on which file you landed in. A rule whose enforcement disagrees with itself is a rule
 * with a hole in it, and nothing would have failed to tell you where the hole was.
 *
 * The three were:
 *
 *   - the catalogue form, over `COLUMNS`, `AXES`, `cards.ts`, `families.ts` and `questions.ts`,
 *     which also banned brackets and a fat arrow;
 *   - the prose form, over `how.html` and `method.html`, which did not ban brackets;
 *   - the rendered form, over the booted panel, the drill, the permalink notices and the CSV,
 *     which allowed digits inside an identifier and matched a wider underscore shape.
 *
 * They are reconciled here into two, and the difference that survives is a real one rather than an
 * accident of who typed which file. Both forms agree on what an identifier looks like. They differ
 * only on brackets, because that difference is load-bearing: prose legitimately parenthesises, and
 * a catalogue entry has no business containing a bracket at all.
 *
 * Reconciling them made the weaker two stronger and none of them weaker. The prose form gained
 * digits and the wider underscore shape from the rendered form; every page was checked against the
 * stronger pattern before the change, and none of them had anything to fix.
 */

/**
 * A word spelled the way a program spells it: `camelCase`, or `snake_case`.
 *
 * Digits count after the first capital, so `readingArm2` is caught and `showControl` is caught.
 *
 * **A digit BEFORE the first capital is not.** `arm2Reading` slips through, because the leading run
 * is `[a-z]+` and a digit ends it before any capital arrives. That is a real hole and it is left
 * open on purpose: this module reconciles three patterns that already existed and widening the
 * match is a change of behaviour across twenty call sites, not a move. It belongs in its own
 * change, measured against the whole suite, where a new failure means a real leak somebody has to
 * read rather than noise from a refactor. Written down here so the next person finds a known gap
 * instead of rediscovering it.
 */
export const CODE_IDENTIFIER = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/;

/**
 * The same, plus the punctuation that only appears when code has been pasted at a reader: a
 * bracket of any kind, or a fat arrow.
 *
 * For the closed catalogues, whose entries are labels, units, assumptions and zero phrases. A
 * catalogue entry containing `(` is a signature that escaped, not a parenthetical aside. Do not
 * point this at rendered prose — `how.html` explains arithmetic in sentences and parenthesises
 * like any other English, and this pattern would fail it for writing English.
 */
export const CODE_IDENTIFIER_OR_SYNTAX = new RegExp(
  `${CODE_IDENTIFIER.source}|[()[\\]{}]|=>`,
);
