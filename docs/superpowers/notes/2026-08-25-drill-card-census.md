# Drill card census — Task 1 of the referee drill

Measures whether the referee drill's raw material exists at all, before any of it is built. The
drill shows a reader a card with the control arm hidden and asks them to call whether the robot
disturbed anyone. That only teaches something if there are rooms, reachable by the panel's own
sliders, where a reader who trusts the forecaster is **wrong** — in both directions:

- **False positive**: the true effect (the paired estimator, which can see both arms) is below the
  split-half floor — the smallest gap this room's measurement could tell apart from its own
  sampling noise — while the forecaster (the constant-velocity residual, which cannot see the
  control arm) reports more than two runs of the same room differ by (the run-to-run band). A
  reader trusting the forecaster calls "bigger" and is wrong.
- **False negative**: the true effect clears the floor, and the forecaster reports less than the
  band. A reader trusting the forecaster calls "smaller" and is wrong.

Kill criterion (from the plan and the design spec): **at least 4 distinct worlds of each shape,
each holding on a majority of the seeds tested.** A "world" here means a setting of the panel's
own sliders — crowd size, walking pace, wobble, robot pushiness, forecast horizon, forecast
window-end — with no seed control, because the panel has no seed slider; the reader cannot pick
one. Fewer than 4 of either shape, or a shape that fools on only a minority of seeds, and the
drill has no card in that direction.

## Script

`scripts/drill-cards.ts`. Not shipped UI, not imported by anything downstream — a one-off
measurement, run with:

```
npx vite-node scripts/drill-cards.ts
```

## The brief's grid was restructured before the first run, not after

The brief's literal script is an 8-seed x 5-people x 4-pace x 3-fidget x 4-space x 4-horizon x
4-window nested loop — 30,720 cells, each running a full simulation plus an 8-replicate band plus
a 200-split floor. Step 3 of the brief admits this only after telling the implementer to run it
first. Per the correction given before this task started, and per the plan's own pre-flight
ruling on this exact task ("an implementer could run it as written and hang"), the sweep was
restructured **before running anything**:

- The true effect, the run-to-run band and the split-half floor depend only on
  `(seed, people, pace, fidget, space)` — never on the two ruler settings (forecast horizon,
  forecast window-end), because a ruler setting only changes how `cvmResidual` reads a run that
  already happened (the `measurementAxis` / `worldAxis` split in `web/engine/job/axes.ts` says
  this explicitly). So each **world** — one seed x one crowd/robot setting — is simulated once,
  and its band and floor computed once.
- Only `cvmResidual` is recomputed for each of the 16 ruler combinations, and it costs nothing
  measurable next to a simulation.

That alone turns 30,720 simulations into 1,920 (at 8 seeds) or 960 (at 4).

### Seed count: cut from 8 to 4, decided from a measurement, not a guess

Before running the full sweep, a timing probe measured one full world (`runPair` +
`replicateBand(config, 8)` + `splitHalfNull(positions, 200, ..., 0.05, 20)`) at each of the 5
`PEOPLE` values, on this machine, on this commit:

| people | one world, ms |
|---|---|
| 4 | 161 |
| 14 | 308 |
| 24 | 656 |
| 34 | 1070 |
| 44 | 1643 |

Mean ~768 ms/world. At 8 seeds (1,920 worlds) that projects to ~24.5 minutes — past the brief's
10-minute ceiling even after the restructuring above. The brief's own fallback ("if it still
takes more than ten minutes, cut `SEEDS` to four") was applied **before** running the full sweep,
using this measurement, rather than after burning 25 minutes to discover the same thing. `SEEDS`
was cut to the first four of the brief's list, in the brief's order — not re-picked to manufacture
a result:

```
SEEDS = [20260816, 1, 7, 424242]
```

**Measured wall time for the actual run: 727.8 s (12.1 minutes)** — still over ten, by about
20%, and reported here rather than rounded down. 960 worlds, 15,360 cells, 0 unusable (no
`cvmResidual` call threw — the grid's `HORIZON_S`/`WINDOW_END_S` combinations always leave
`anchor = windowEndStep - horizonSteps >= 40` samples of headroom, well clear of the "needs
`horizonSteps + 2`" floor in `cvmResidual`'s own guard).

## Grid swept

All values sit on the axis's own step grid in `web/engine/job/axes.ts` — nothing here is outside
what a reader could reach by moving a slider:

| Axis | Query key (Task 8) | min / max / step | Values swept |
|---|---|---|---|
| `crowdSize` | `people` | 4 / 44 / 1 | 4, 14, 24, 34, 44 |
| `walkingPace` | `pace` | 0.4 / 2 / 0.01 | 0.4, 0.9, 1.34, 1.8 |
| `crowdFidget` | `fidget` | 0 / 3 / 0.1 | 0, 1.1, 3 |
| `pushStrength` | `space` | 0 / 3 / 0.25 | 0, 1, 2, 3 |
| `forecastHorizon` | `horizon` | 0.2 / 3 / 0.1 | 0.2, 1, 2, 3 |
| `forecastWindowEnd` | `window_end` | 5 / 40 / 0.5 | 5, 10, 15, 20 |

Every other axis (`holdingLine`, `robotSpeed`, `reactionTime`, `politeness`, `perceptionError`,
`passingOffset`, `episodeSeconds`) is left at `DEFAULT_CONFIG`, matching the brief.

`splitHalfNull` is called exactly as `web/engine/job/runner.ts` calls it: pooling
`run.control.positions` only, 200 splits, `alpha=0.05`, `strideSteps=20`. `replicateBand` uses the
console's own default of 8 replicates.

## Counts by shape (15,360 cells)

| Shape | Cells |
|---|---|
| false positive | 4,287 |
| false negative | 1,865 |
| agrees | 9,208 |
| unusable | 0 |

## Kill criterion: **PASS**, by a wide margin, in both directions

Counting **distinct worlds** (label = people/pace/fidget/space/horizon/window-end, seed excluded)
that hold the shape on a **majority of the 4 seeds tested (≥3/4)**:

| Shape | Distinct worlds holding on a majority of seeds | Required |
|---|---|---|
| false positive | **1,006** | ≥ 4 |
| false negative | **393** | ≥ 4 |

Both clear the bar by two orders of magnitude. The full breakdown by crowd/robot setting (ruler
settings collapsed) is 120 distinct `(people, pace, fidget, space)` combinations producing a
majority false positive somewhere in the ruler grid, and 25 producing a majority false negative.

### A caveat that matters more than the raw count

A large share of the false-positive worlds are not interesting, and saying so plainly is more
useful than letting the headline number stand unqualified:

- **62 of the 120** false-positive crowd/robot combinations have `fidget = 0`. At zero wobble the
  crowd is fully deterministic, so `replicateBand`'s 8 replicates (which differ only in exogenous
  noise) produce **identical** control-arm positions and `band = 0.0000` exactly. Any nonzero
  forecast then "clears" a zero-width band — a true statement, but a mechanical one, not a
  demonstration of confounding.
- **34 of the 120** have `space = 0` (`pushStrength`, robot repulsion). At zero the robot is
  socially invisible by construction (`axes.ts`'s own note: "the effect on them is exactly
  nothing"), so `trueEffect = 0.0000` exactly, and any positive floor clears it trivially.
- **44 of the 120** have **both `fidget != 0` and `space != 0`** — a real, nonzero true effect, in
  a room with a real, nonzero band — and still land as a majority false positive. These are the
  genuine cards; the other 76 are degenerate but not wrong, and Task 3 (card selection) should
  prefer this list.

No equivalent caveat applies to the false-negative side: **0 of the 25** false-negative
crowd/robot combinations have `space = 0`, because a zero true effect can never exceed a positive
floor. Every false-negative world found is non-degenerate on its face.

## Candidate cards, with numbers

Four per direction, chosen for being unanimous or near-unanimous across all four seeds, spanning
different crowd sizes, and — for the false positives — drawn from the 44 non-degenerate
combinations above rather than the `fidget=0`/`space=0` corners.

### False positive candidates (true effect < floor, forecast > band)

**1. `n24 pace1.8 fidget1.1 space2 h3 w10`** — 24 people, 1.8 m/s pace, wobble 1.1, robot
pushiness 2, forecast horizon 3 s, checked at 10 s. Unanimous, 4/4 seeds:

| seed | trueEffect | floor | forecast | band |
|---|---|---|---|---|
| 20260816 | 0.3869 | 0.6961 | 0.4132 | 0.3505 |
| 1 | 0.2825 | 0.6865 | 0.4688 | 0.2381 |
| 7 | 0.2496 | 0.6563 | 0.5999 | 0.2467 |
| 424242 | 0.3253 | 0.6376 | 0.6146 | 0.2569 |

**2. `n44 pace1.8 fidget3 space3 h3 w10`** — the busiest, wobbliest, most pushy room in the grid.
3/4 seeds (majority; seed 7 lands as "agrees", true effect just above its floor):

| seed | trueEffect | floor | forecast | band | shape |
|---|---|---|---|---|---|
| 20260816 | 0.3238 | 0.4701 | 0.5530 | 0.4678 | false positive |
| 1 | 0.3623 | 0.4530 | 0.7255 | 0.5125 | false positive |
| 7 | 0.4862 | 0.4561 | 0.7429 | 0.4738 | agrees |
| 424242 | 0.4300 | 0.4846 | 0.6659 | 0.4408 | false positive |

**3. `n44 pace1.8 fidget3 space1 h3 w10`** — same crowd, gentler robot (pushiness 1). 3/4 seeds:

| seed | trueEffect | floor | forecast | band | shape |
|---|---|---|---|---|---|
| 20260816 | 0.2763 | 0.4701 | 0.4287 | 0.4678 | agrees |
| 1 | 0.2752 | 0.4530 | 0.5194 | 0.5125 | false positive |
| 7 | 0.3941 | 0.4561 | 0.5323 | 0.4738 | false positive |
| 424242 | 0.3458 | 0.4846 | 0.5523 | 0.4408 | false positive |

**4. `n34 pace1.8 fidget1.1 space2 h3 w10`** — mid-size crowd, moderate wobble. Unanimous, 4/4
seeds:

| seed | trueEffect | floor | forecast | band |
|---|---|---|---|---|
| 20260816 | 0.3130 | 0.5837 | 0.4059 | 0.3555 |
| 1 | 0.3575 | 0.5787 | 0.6599 | 0.3372 |
| 7 | 0.3024 | 0.5325 | 0.5797 | 0.3101 |
| 424242 | 0.2115 | 0.5197 | 0.5507 | 0.2496 |

### False negative candidates (true effect > floor, forecast < band)

**5. `n34 pace0.4 fidget1.1 space3 h0.2 w10`** — slow crowd, wobble 1.1, max robot pushiness,
shortest forecast horizon (0.2 s = 4 steps). Unanimous, 4/4 seeds, and the cleanest false negative
in the grid — a 4-step constant-velocity forecast is almost exactly right regardless of the robot,
so the forecast is near zero no matter how large the true effect:

| seed | trueEffect | floor | forecast | band |
|---|---|---|---|---|
| 20260816 | 0.6234 | 0.5306 | 0.0030 | 0.4387 |
| 1 | 0.5625 | 0.4877 | 0.0030 | 0.4858 |
| 7 | 0.6566 | 0.5778 | 0.0032 | 0.5424 |
| 424242 | 0.8850 | 0.4811 | 0.0034 | 0.5408 |

**6. `n44 pace0.4 fidget3 space3 h3 w20`** — busiest, wobbliest room, but the *longest* horizon
(3 s) and a late window (20 s). Unanimous, 4/4 seeds, and shows the failure is not just a
short-horizon artifact: even at maximum horizon the forecast still under-reports, because the
crowd's own wobble inflates the band faster than a longer horizon inflates the forecast:

| seed | trueEffect | floor | forecast | band |
|---|---|---|---|---|
| 20260816 | 0.6351 | 0.4579 | 0.1830 | 0.9238 |
| 1 | 0.6432 | 0.4359 | 0.1745 | 0.8488 |
| 7 | 0.6762 | 0.4563 | 0.1601 | 0.8834 |
| 424242 | 0.7223 | 0.4360 | 0.1802 | 0.8859 |

**7. `n44 pace0.4 fidget3 space3`** at every one of the 16 ruler settings in the grid — every
single `(horizon, window)` combination for this crowd/robot setting lands as a majority false
negative (4/4 or 3/4 seeds throughout, per the script's detail dump). This is the single most
robust false-negative world found: the reader cannot dial it away by moving either ruler.

**8. `n34 pace0.9 fidget3 space3 h3 w10`** — mid-size crowd, high wobble, max pushiness. Unanimous,
4/4 seeds, included to show the false-negative shape is not confined to the 44-person corner:

| seed | trueEffect | floor | forecast | band |
|---|---|---|---|---|
| 20260816 | 0.6494 | 0.5105 | 0.2238 | 0.6725 |
| 1 | 0.6346 | 0.4639 | 0.2386 | 0.7421 |
| 7 | 0.7776 | 0.4776 | 0.2766 | 0.7317 |
| 424242 | 0.9006 | 0.4616 | 0.2446 | 0.7759 |

## Conclusion

**Kill criterion met, with substantial headroom, in both directions.** 1,006 distinct
false-positive worlds and 393 distinct false-negative worlds hold on a majority of the four seeds
tested, against a requirement of 4 each. Even after discounting the 76 degenerate
`fidget=0`/`space=0` false positives, 44 non-degenerate false-positive crowd/robot combinations
remain, and all 25 false-negative combinations are non-degenerate. Task 3 has more than enough
material to pick 4 cards of each shape, and should draw from the non-degenerate false-positive
list (the 44 combinations with both `fidget != 0` and `space != 0`) rather than the zero-band or
zero-effect corners, which are true but uninteresting.

The plan is not cancelled. Task 2 was not started by this task, per instruction.

---

## Addendum, Task 7: this census classified against the floor, and the card asks about the band

Nothing above is retracted. Every number in it was correctly measured against what it says it
measured. What follows is a note about which of those measurements the drill's card actually
asks a reader for, discovered when Task 7 built the reveal.

This census classifies a cell by **the true effect against the split-half detection floor**, with
the forecaster against the run-to-run band — each estimator judged against its own null. That is a
defensible design and it is what the two `shape` values above mean.

The card screen asks one question, and it is a different one:

> Did the robot move this crowd by more than that ordinary difference, or by less?

That is the true effect against the **run-to-run band**. On three of the eight cards Task 3 picked,
the two nulls put the true effect on opposite sides:

| card | paired | floor | band | census shape (vs floor) | what the card asks (vs band) |
|---|---|---|---|---|---|
| fastModestRoom      | 0.3869 | 0.6961 | 0.3505 | false positive | the effect **clears** the band |
| amblingPackedRoom   | 0.6351 | 0.4579 | 0.9238 | false negative | the effect sits **under** the band |
| unhurriedFullerRoom | 0.6494 | 0.5105 | 0.6725 | false negative | the effect sits **under** the band |

So on those three, a card labelled as fooling does not fool: the corridor-readable number and the
truth land on the same side of the band the reader was asked about. Task 7's reveal is where that
became visible — it would have printed "your call did not match what the room did" directly under
0.387 m and 0.351 m, the two numbers saying it did.

**What changed.** `web/engine/job/cards.ts` no longer carries `"false positive" | "false negative"`.
`CardShape` is now `"reads high" | "reads low" | "agrees"`, re-derived against the band and measured
by `web/engine/job/__tests__/cards.slow.test.ts`, which fails on a card whose declared shape is not
what its room does. The eight cards themselves are unchanged — the settings this census found are
still the settings — and the census's own floor classification is still asserted there, so this
document's numbers stay checked rather than merely recorded.

**The mix is now five fooling and three agreeing, and that is the intended shape, not a shortfall.**
If all eight fooled, a reader could score eight out of eight by inverting whatever the corridor
number says, and would leave believing that number is systematically wrong. It is not: over sixty
seeds it correlates 0.167 with the true effect and 0.605 with its own zero-effect reading. It is
uninformative, not inverted, and a set where it is sometimes right is the only honest way to show
that. The kill criterion this census was written against ("4 distinct worlds of each shape") was a
criterion for finding raw material, and it was met; it was never a claim about how many of the
eight chosen cards must fool a reader on the band.
