# The fourth document — design

**Status:** approved for implementation.

## What this is

The method card shipped. It is a fourth page, and every document that counts the pages still says
three. This closes that gap, and the two smaller ones the same commit opened: three missing links
between pages, and one reader-facing surface with no identifier scan over it.

Nothing here is a feature. No new estimator, no new page, no new column, no new question. Guardrail
11's refusal test — *which readout does this move, and what does that readout say when the answer is
zero?* — has no answer for any item below, and that is correct, because none of them adds a readout.
What they do is make three existing promises checkable and one existing document true.

## Why this is worth a spec rather than a tidy-up

Two of these are the exact shape this project has twice converted from prose into a test. The
`Math.hypot` ban was a comment until `hypot.test.ts`; guardrail 10 was "two prose comments enforced
by nobody" until `nostorage.test.ts`. The reachability promise in `CLAUDE.md` — that each document
"is reachable at any time from either of the others" — is currently in the first of those states,
and it is already false. A promise nobody checks is how it got that way, and fixing the links
without writing the check leaves the next page in the same position.

## What was measured first

Every figure below was run on this machine before any word of this document was written, because
copy asserting something that has not been measured is the worst failure this project has.

| | Measured now | What the documents say |
|---|---|---|
| `npm run test` | 761 tests, 63 files, 38.6 s | 652 tests, 56 files, 22 s |
| `npx vitest run --exclude '**/*.slow.test.ts'` | 730 tests, 58 files, 30.2 s | 633 of them in 13 s |
| `.venv/bin/python -m pytest -q -m "not slow"` | 275 passed, 23 deselected, 35.0 s | 275 of them in 22 s |
| `.venv/bin/python -m ruff check src tests` | passes | — |
| `*.slow.test.ts` files | five | "the three it drops" |
| Built HTML | four files: 8.96, 56.44, 6.98, 5.13 kB | "three HTML files (8.6 kB, 6.9 kB and 56 kB)" |
| Built stylesheet | 19.26 kB | 15 kB |
| Built script | 163.5 kB across six chunks | "about 134 kB across four chunks" |
| Built workers | two: 49.04 kB and 42.12 kB | "a 49 kB worker" |

Those are the figures **before** this change. It adds five tests of its own — two for the link
graph, three for the prose scan, each count including its meta-test — so the numbers written into
`CLAUDE.md` and `README.md` are the ones measured after: **766 tests across 63 files, 735 of them in
the `.slow.test.ts` cut**. A spec that pinned the before-figures into the documents would have
shipped them stale on the same commit that corrected them.

**The timings are from a different machine and must be labelled as such.** The counts are facts about
the tree and travel; the seconds are not. `CLAUDE.md` currently says "every figure above was measured
on this machine on the commit that wrote them", and a figure re-measured elsewhere cannot be written
in under that sentence without the sentence becoming the untrue part. The counts get corrected, the
timings get corrected *and* get a clause saying which machine, and the paragraph about a timing
nobody re-ran being a claim survives whole, because it is the reason this table exists.

**The fast-loop cut has lost most of its value and the document should say so.** It once dropped 19
tests to save 9 seconds of 22. It now drops 31 tests to save 8 seconds of 38, because two of the
five slow files are the method card's. That is a working loop that is barely a loop. It is not a
reason to delete the line — it is a reason not to keep advertising a 40% saving that is now 20%.

## The items

### 1. `CLAUDE.md` counts three documents and there are four

Four separate claims, all in one file:

- **Line 8** — "Three HTML documents ship" names index, how and drill. `web/method.html` is the
  fourth. Line 10's "reachable at any time from *either* of the others" is also a two-way word
  doing three-way work now.
- **Lines 330–333** — the test counts and timings in the Commands block, per the table above.
- **Lines 346–349** — "The three it drops are `axes.slow.test.ts`, `cards.slow.test.ts` and
  `drill-verdict.slow.test.ts`." There are five: `familyProbe.slow.test.ts` and
  `method-run.slow.test.ts` joined them in the method-card commit.
- **Lines 369–380** — "Three reader-facing surfaces, and what governs each", a three-row table, and
  a sentence reading "Everything below applies to all three."

### 2. The method card's hand-written strings have no row in the Content table

The drill has a row because its strings — `CALL_CLAUSE`, `HONEST_CLAUSE`, `WITHHELD_ZERO_HOW`,
`verdictLines` — describe a reader's call rather than a measurement, so no catalogue entry has
anywhere to put them. `web/app/console/method.ts` is in exactly that position and has exactly that
kind of string: `REFUSAL`, `READING_LABEL`, `READING_ZERO_HOW`, `BAND_LABEL`, `BAND_ZERO_HOW`,
`RATE_LABEL`, `RATE_NOTE`, `RATE_ZERO_HOW`, `NON_DETECTION_LABEL`, `NON_DETECTION_NOTE`.

It gets a fourth row, and the row's "what holds them honest" column says what is actually true —
which is a good deal, and is checked below before it is written down.

### 3. `CLAUDE.md` records the drill against the guardrails and says nothing about the method card

The closing note exists because the drill "is the first feature built after these guardrails and is
worth checking against them rather than assumed to comply". The method card is the *second*, and it
is the one that came nearest guardrail 11's line: it takes a description of somebody else's method
and scores a family. The argument that this is not a bring-your-own-method import path is real and
it is written down — in the method-card design spec, which is a design document, not the contract.

A companion note goes in `CLAUDE.md` beside the drill's. It says the same three things the drill's
note says, and each one is a fact about the tree rather than a restatement of intent:

- the question table is closed like `COLUMNS`, `AXES` and `cards.ts` — no `register`, nothing added
  at runtime, and `questions.test.ts` walks the whole 288-answer cross-product rather than an
  option at a time, because an option-by-option check passes this table having checked nothing;
- nothing is read in, and that is mechanical: `method-dom.test.ts` asserts the booted page carries
  no textarea, no file input and no text field;
- the family that compares nothing is not scored as a detector, and which shape it renders in is
  read off the family's own ruler rather than off its name.

### 4. Three of the twelve links between four pages do not exist

Measured by grep over the four files:

| from ↓ to → | index | how | drill | method |
|---|---|---|---|---|
| **index** | — | ✓ | ✓ | ✓ |
| **how** | ✓ | — | ✓ | **missing** |
| **drill** | ✓ | ✓ | — | **missing** |
| **method** | ✓ | ✓ | **missing** | — |

The console is the only page that knows the method card exists. A reader who lands on the drill —
which is the page most likely to leave someone wanting to score their own method — has no way to
reach it without going back through the front door.

Each new link is one sentence in the destination's own voice, of the kind already there. Not a nav
bar: there are four pages and adding a component to hold three anchors is the wrong size of change,
and CLAUDE.md's "prefer editing existing files" is not the only reason.

### 5. Nothing checks the link graph

`disclosure.test.ts` checks the Vite input map names all four pages and that each file behind a name
exists. `method-dom.test.ts` checks the console links the method card. Nobody checks the other
eleven edges, and three of them are missing, which is what an unchecked promise looks like after one
feature.

A test asserts the whole graph: for each of the four shipped pages, the static HTML links to each of
the other three. It reads the page list from the Vite input map rather than a hand-written list,
because a fifth page added to the build must fail this test rather than quietly not be in it — that
is the whole difference between this check and the sentence it replaces.

### 6. `web/method.html`'s own prose has no identifier scan over it

Guardrail 12's mechanical half is the identifier regex, and the guardrail names where it runs:
`columns.test.ts` and `axes.slow.test.ts` over the catalogues, then `panel.test.ts`,
`permalink.test.ts`, `how.test.ts` and `drill-dom.test.ts` over strings the catalogues do not own.

For the method card, two of the three surfaces are already covered and covered well:

- the question catalogue, by `questions.test.ts` — "writes every reader-facing string in English,
  not in code";
- every branch of the verdict, by `method.test.ts` — the regex over every leaf of every family's
  rendered verdict, with a count guard and a meta-test.

The third is `web/method.html`'s hand-written prose — the "What this does" section and the note
under the Run button — and it has nothing. `how.test.ts` does exactly this job for `how.html`. The
same scan runs over the method page's visible text.

This is the smallest item here and it is the one most likely to be argued out of the list. It stays
in: the drill's prose got this treatment, the working page got this treatment, and the reason the
method page did not is that it was written last, not that it needs it less.

### 7. `CODE_IDENTIFIER` exists in eight places

Verbatim in five catalogue suites — `columns.test.ts`, `axes.slow.test.ts`, `cards.test.ts`,
`families.test.ts`, `questions.test.ts` — plus `method.test.ts`, and a second, *differently written*
variant three times inside `drill-dom.test.ts`. Guardrail 12's enforcement is a regex that has to
stay in step across eight copies, and two of them are already not the same regex.

**This is recorded and deliberately not fixed in this change.** Hoisting it into a shared helper is
right, and it touches seven test files whose failures are the guardrail's only teeth. Doing it in the
same commit as the link graph means a red test has two candidate causes. It gets its own change,
after this one, and this paragraph is the record so it is not rediscovered a third time.

## What was checked and is clean

Recorded so the next audit does not re-derive it.

- **Guardrail 8 owes nothing.** `families.ts` and `familyProbe.ts` add no formula. `families.ts`
  imports `COLUMNS` and an error helper; `familyProbe.ts` imports `paired`, `cvmResidual`,
  `replicateBand`, `runPair` and the existing `stats.ts` helpers. Neither file contains a single
  `Math.` call. They are compositions of primitives the fixtures already pin, they live in
  `engine/job/` rather than `engine/measure/`, and Python has no family or probe concept to drift
  against. No fixture is owed and no row in the deliberately-unpinned table is owed.
- **Guardrail 9 is respected.** Nothing new was ported to Python; the simulator is still
  TypeScript-only.
- **Guardrail 10 is covered without any edit.** `nostorage.test.ts` walks every `.ts`, `.html` and
  `.css` under `web/` recursively, so `web/method.ts`, `web/app/console/method.ts` and the three new
  `web/app/worker/probe.*` files were inside the scan the moment they were written. The method
  card's permalink has both halves — `method-dom.test.ts` proves the read half opens at the answers
  a link names, and proves a link naming an answer the closed table has never held is said out loud
  rather than rounded off.
- **Guardrail 6 and 7 hold on the method card, mechanically.** `method.test.ts` asserts every
  reading prints a zero measured on the same rooms, that its phrase says "exactly", and that a rate
  carries a zero of its own; and it asserts three things stand beside the reading — a body-scale
  phrase, its zero, and the band.
- **Guardrail 3's analogue for the new closed table is real.** `questions.test.ts` proves totality
  over the whole cross-product a reader can give, proves all four families are reachable, and proves
  the three questions that decide nothing are said to decide nothing.
- **The suite is green**, before this change and after it. 761 browser tests across 63 files going
  in, 766 coming out. `ruff` clean. 275 Python tests in the fast loop, 23 deselected.

## What this must not do

- Not add a page, a readout, a column, a question or an estimator.
- Not touch `docs/archive/`.
- Not loosen, skip or delete a test. The link-graph test is new coverage over existing pages, and
  the identifier scan is an existing scan pointed at one more file.
- Not write a timing into `CLAUDE.md` without saying which machine produced it.
- Not build a navigation component. Three anchors, in three files, in the voice already there.
- Not fix the eight-copy regex here. Item 7 says why.

## Guardrails this touches

- **1** — untouched. Every new link is prose beneath a disclosure that already precedes every
  number on its page.
- **11** — untouched, and item 3 writes down why the method card did not touch it either.
- **12** — item 6 extends the existing scan by one file; item 7 records the duplication without
  acting on it.
- **13** — `docs/archive/` is not opened.

## The honest limitation

Every item here is bookkeeping. None of it changes what the bench measures or what a reader learns
from a number, and a reader who never reads `CLAUDE.md` will notice only the three links. That is
the correct size for this change and it should not be inflated into something that sounds larger.
The reason to do it now is that the documents describing this tree stopped describing it one commit
ago, and the distance grows with each feature that lands before they are corrected.
