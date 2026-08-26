# The Method Card — design

**Status:** approved for implementation.

## What this is

A stranger arrives with a disturbance metric they have written or are about to. They answer five
questions about how it is computed. They press one button. They leave with two things they did not
have:

- **what a method of that shape reads on a world where the true effect is exactly zero**, and
- **on how many of eight seeds it clears the run-to-run band while the truth sits under it** — a
  false-positive rate for the family their method belongs to.

No code is pasted. Nothing is imported. MIRN runs its own estimators from a closed set, on its own
worlds, and reports what happened.

## Why this is the instrument and the drill was not

The drill scores a *reader*. It changes what someone believes. That is worth something and it is not
work getting done.

This scores a *method*. Someone arrives with a question about their own work — is my metric
trustworthy — and leaves with an answer they can act on. The answer is transferable in the one way
this simulator's answers can be: it is a claim about a **method**, not about pedestrians. "A
forecast-based counterfactual reads a third of a metre on a world where the answer is exactly
nothing" survives leaving the site. "The robot moved this crowd 0.35 m" does not.

## Why this does not breach guardrail 11

Guardrail 11 forbids "no bring-your-own-method import path — the moment something else can be read
in and scored, this is a benchmark and the numbers start being about someone else's robot."

**Nothing is read in.** The reader supplies a *description*, in five closed multiple-choice
questions. A closed table maps that description to one of four families MIRN already implements.
MIRN then runs **its own estimator** on **its own worlds** and reports **its own numbers**.

The distinction that matters: this scores a *class of method*, never a robot and never a user's
code. No file is uploaded, no function is evaluated, no dataset is loaded, and there is no
leaderboard. The question set is closed in the style of `AXES` and `COLUMNS`, and a test iterates it.

If a future change lets a user's own code or data reach the engine, that is the line, and this
document is not permission to cross it.

## The four families, and why there are four rather than five questions' worth

The questionnaire has five questions, but the space of things MIRN can honestly *run* is four
families. The mapping is many-to-few and the page says so rather than implying a bespoke answer.

| Family | What it is | What MIRN runs |
|---|---|---|
| **Paired, shared noise** | Both runs of the same room, same seed, same wobble, differing only in the robot | `paired` on a real pair |
| **Unpaired, separate runs** | A robot run compared against a robot-free run that is not its twin | `paired` on a pair whose control arm comes from a different seed |
| **Forecast counterfactual** | Guess where each person was about to walk; call the error the robot's doing | `cvmResidual`, at the horizon and window the answers imply |
| **No counterfactual** | An absolute quantity — closest approach, near-miss count, distance travelled | the corridor-readable columns |

**Every one of these is measurable, and three of them fail in a way worth knowing.**

## The five questions

Closed, in the style of `AXES`. Every option maps to a family and, where relevant, to parameters.

1. **Does your number compare against a run without the robot?**
   same room, same seed and same random draws / a separate run or a different day / no
2. **If there is no control run, where does the counterfactual come from?**
   a constant-velocity guess from the person's own recent path / a learned trajectory predictor /
   a hand-specified intended path / there is none — it is an absolute quantity
3. **Over what stretch of the episode?**
   the whole episode / a fixed window around the encounter / only while both are moving
4. **How is it aggregated?**
   average over people / the worst person / the worst instant / a count of threshold crossings
5. **Is a zero-effect reference reported beside it?**
   yes / no

Question 2's *learned predictor* and *hand-specified path* both map to the forecast family, because
that is the family MIRN can run — and **the verdict says so**, rather than pretending a learned
predictor was simulated.

## What the reader leaves with

Three parts, in this order.

**1. The family, and its confound in plain words.** What kind of measurement this is and what it
inherits. For the forecast family: it is a prediction error presented as an effect, and everything a
person does for their own reasons is scored as the robot's doing.

**2. Two measured numbers, each with its zero.**

- What this family reads on a world where the true effect is **exactly zero** — not nearly zero,
  exactly, because the crowd was told not to react to the robot and the paired construction makes
  the answer identically nought.
- **On how many of eight seeds it clears the run-to-run band while the truth sits beneath it.** That
  is a false-positive rate, and MIRN does not currently report one anywhere.

**3. The refusal, stated as flatly as the numbers.**

> This can show that a method is untrustworthy. It cannot show that one is sound. The crowd here is
> invented, so passing this battery is necessary and not sufficient — and a counterexample refutes a
> universal, which is the only shape of claim available from a simulator.

## What the page must not claim

- Not that a method is good. Only that it failed, or that it did not fail *here*.
- Not a number about real pedestrians, real robots, or the reader's own deployment.
- Not that a learned predictor was evaluated when a constant-velocity stand-in was run.
- Not a sample size, a power calculation, or a recommendation for the reader's study.

## Guardrails this touches

- **1** — the invented-crowd disclosure precedes every number on this page.
- **2** — never teach a conclusion the toy cannot support. The refusal above is this guardrail
  rendered as copy.
- **6** — every number carries what it would read if the answer were zero. Here the zero-effect
  world *is* the subject, so this is satisfied by construction rather than by a companion column.
- **10** — no storage. The answers live in the URL as a recipe, never as a result.
- **11** — not breached; see above. The question set is closed and a test iterates it.
- **12** — no bare code identifier on any surface. "Constant-velocity forecast", never a function
  name.

## The honest limitation, recorded before building

The questionnaire maps a described method onto the nearest thing MIRN can run. That is an
approximation, and two of question 2's options collapse into one family. **The page states the
approximation where the reader meets the verdict**, not in a footnote. A reader who believes their
learned predictor was simulated has been misled, and that would be worse than the page not existing.
