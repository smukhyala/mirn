# Authoring a MIRN notes page

Pages are Markdown with YAML front matter, compiled at build time. Not MDX: these notes are half
the project and will be edited as prose, so they must stay readable as plain text and lintable by
any Markdown tool.

## Front matter

```yaml
---
id: two-worlds            # unique slug
page: 2                   # 1-9 numbered pages, 10 = colophon
part: 1                   # I..IV
title: The same room, twice
subtitle: Where deviation comes from
introduces: [nominal-trajectory, deviation, state, seed]   # ids from web/vocab.ts
uses: [run, trajectory]                                    # must all be introduced EARLIER
reader_can: >
  One sentence per capability. This is the page's own success criterion, kept in the source
  where it can be read while writing.
---
```

`introduces` and `uses` are checked against `web/vocab.ts` at build time. Using a term before its
page is a build error, and so is introducing one twice or never.

## Blocks

A widget is a fenced block with a `mirn:` info string and a YAML body.

````markdown
```mirn:scene
id: ghost-reveal
preset: corridor-11
controls: [play, scrub, seeRobot]
caption: >
  The solid paths are the run you watched on the last page. The faint ones are the same people,
  in the same room, with no robot in it.
```
````

````markdown
```mirn:sweep
experiment: e2_density        # a key in web/data/experiment-facts.json
x: nPedestrians
series:
  - key: meanDeviationM
    label: deviation per person
    accent: true              # at most ONE series per plot may be the accent colour
  - key: runToRunBandM
    label: how much two robot-free runs differ
caption: >
  Every point is the mean of eight runs with different crowds.
```
````

````markdown
```mirn:quantity
id: worked
metric: deviation
caption: The working behind one number.
```
````

A definition callout renders the term's sentence from `web/vocab.ts`, so the wording lives in
exactly one place:

```markdown
:::term{id=deviation}
```

A caveat is always the LAST thing in a section, never the first:

```markdown
:::caveat
In this crowd, [the model-dependent part]. [What is not model-dependent, and why].
:::
```

## Quantity references

Every number in the prose is a reference, resolved at build time against
`web/data/experiment-facts.json` or against a live widget on the same page. An unresolvable one is
a build error, and the error names what was available instead.

| Spelling | Means |
|---|---|
| `{{q:table[axis=value].column}}` | the row whose axis column equals that value |
| `{{q:table.column@value}}` | the same thing, in the order a sentence wants it |
| `{{q:table@3.column}}` | the row at that index; `@first` and `@last` also work |
| `{{q:table.column}}` | only legal when the table has exactly one row |
| `{{q:table[…].column.sd}}` | the spread of that column across seeds |
| `{{q:table.column.min}}` / `.max` | reduce the whole column, for a claim about a whole sweep |
| `{{q:widget-id}}` | the build-time value of a `mirn:quantity` block on this page |
| `{{q:widget-id.anchor}}` | the body-scale phrase for that value — "half a stride" |

`e2` is accepted as short for `e2_density`. A reference that resolves to a censored measurement is
rejected rather than printed, so `NaN` cannot reach a reader.

## Four lints you must write around

**The comparative lint.** Sentences may quote live figures, but may not assert *relations* a
control could falsify. `{{q:x}} from where they would have been` is fine; `which is more than a
metre` is a build error, because a slider can make it false. Comparative words within 80
characters of a `{{q:}}` token fail the build. The sanctioned escape is `{{q:x.anchor}}`, which
interpolates the live scale anchor and cannot go stale. Note what this does *not* do: it never
looks at the figure itself, so it cannot tell you whether a quoted number moves, and a comparative
written more than 80 characters from the number it depends on passes. Read your page at both ends
of every dial on it.

**The bare-number lint.** Any numeral immediately followed by a unit, in prose, outside a code
span, a `$…$`, a `mirn:` block or an explicit `{{lit:0.42 m}}`, is a build error. This is what
makes "never display a number without explaining where it came from" a compiler-enforced property
rather than a resolution. Use `{{lit:}}` only for numbers that are *settings* rather than
results — "a 22 m room", "a 0.05 s timestep".

**The forward-term lint.** Every term in `web/vocab.ts` carries the page that introduces it, and no
earlier page may use that term — in its prose, not just in its front matter. The page that
introduces a term is exempt from its own definition. If you need the idea earlier, either move the
term down the ladder or say it in plain words.

**The undefined-synonym lint.** A short list of words that mean a defined term but are not it:
"displacement" for deviation, "ground truth" or "baseline run" for the run with no robot in it. A
synonym the reader was never handed is jargon however ordinary it sounds. The list is in
`web/build/lints.ts` and only knows the synonyms somebody has already been caught using — when you
find a new one, add it there rather than only fixing the page.

## Voice

Short declaratives. Concrete nouns before abstract ones. A defined term introduced in one plain
sentence and then used. Self-limitation stated as flatly as the claims: "we have not found"
rather than "nobody has published"; "it is not evidence" rather than a hedge. The recurring
metaphor is the ruler and the room — the ruler is real, the room is invented.

Never use: *estimand*. Never number the pages "Beat n" in prose — that is a structure the author
can see and the reader cannot.
