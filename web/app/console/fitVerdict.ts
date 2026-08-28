import { fail } from "../../engine/core/errors.js";
import type { FitParameter, FitResult } from "../../engine/fit/search.js";
import { formatValue } from "./tile.js";
import { element, part } from "./verdictParts.js";

/**
 * What a fit says, and the three sentences guardrail 1 requires it to say first.
 *
 * ## The second kind of number
 *
 * Every other figure this site prints is a reading off an invented crowd, and carries the sentence
 * saying so. This one is not. It has real people on one side of it, and reusing the invented-crowd
 * disclosure over it would understate what it touches — which is the one direction guardrail 1 says
 * a disclosure must never be wrong in.
 *
 * So a fit surface says three things instead, and all three are in `FIT_DISCLOSURE` below:
 *
 *   1. the recording is real,
 *   2. the crowd being compared against it is still invented,
 *   3. a close fit is not permission to read this bench's disturbance numbers as measurements of
 *      anybody.
 *
 * The third is the load-bearing one and it is why this page exists apart from the others. The whole
 * hazard of calibration is that it makes a toy feel like an instrument, and the reader who has just
 * been shown that the invented crowd walks like a real one is precisely the reader most likely to
 * believe the next number they see.
 *
 * ## Why this is a page of its own, mechanically rather than by intention
 *
 * `fit.html` renders no disturbance number, because nothing on this path can compute one:
 * `speedsFrom` returns a bag of speeds, `speedDistance` compares two bags, and neither has a second
 * arm to difference against. The two kinds of number are kept apart by living on different pages,
 * behind different workers, over protocols that cannot carry each other's payloads —
 * `fit-dom.test.ts` asserts the page shows no metre-denominated disturbance figure at all.
 *
 * ## What a reader is told about each parameter
 *
 * Whether the recording actually pins it. That is measured, not assumed: a parameter counts as
 * identified only if moving it across its whole range changes the fit by more than the invented
 * crowd differs from itself. On the recordings this was built against, the walking pace clears that
 * comfortably and the wobble does not — so the wobble is reported with the grid's best value and a
 * sentence saying the recording does not decide it. Printing it without that sentence would be a
 * number that looks measured and is not, which is the failure this whole site argues against.
 */

export const FIT_DISCLOSURE: readonly string[] = Object.freeze([
  "The recording is real. These are somebody's actual movements, read in your own browser — " +
    "nothing about it is uploaded, saved, or shown here person by person.",
  "The crowd it is compared against is invented, and fitting it does not stop it being invented. " +
    "It becomes a made-up crowd that resembles one recording, in the one respect that was fitted, " +
    "on the day it was filmed.",
  "A close fit here is not permission to read this bench's disturbance numbers as measurements of " +
    "anybody. Those come from a simulation either way, and nothing on this page changes what they " +
    "are. This is the sentence to keep if you keep only one.",
]);

const LEAD =
  "How far the invented crowd's walking speeds sit from the recording's, once the crowd has been " +
  "set to whichever pace and wobble bring the two closest.";

const FIT_LABEL = "How far apart the two are";

const FIT_ZERO_HOW =
  "how far the invented crowd sits from ITSELF: the same comparison between two runs of it that " +
  "differ only by which random draws they got. That is the resolution of this measure. A fit at " +
  "or below it is as close as this can tell, and is not a closer fit than one exactly at it.";

const IDENTIFIED_NOTE =
  "Moving this across its whole range changes the comparison by more than the crowd differs from " +
  "itself, so the recording does decide it.";

const UNIDENTIFIED_NOTE =
  "Moving this across its whole range barely changes the comparison — by less than the crowd " +
  "differs from itself. So the recording does NOT decide it: the value beside it is where the " +
  "search happened to stop, and any other value would have fitted about as well. Read it as a " +
  "setting that had to be given something, not as something measured.";

const PROVENANCE_LEAD = "What was read in, and what it was compared against";

const BEATS_NOISE =
  "The two are further apart than the crowd is from itself, so the gap is something this can " +
  "actually see.";

const UNDER_NOISE =
  "The two are closer together than the crowd is from itself. That is not a better fit than one " +
  "at the line; it is a fit past the point where this measure can tell the difference.";

export const FIT_REFUSAL: readonly string[] = Object.freeze([
  "This does not say the crowd is realistic. It says its walking speeds are this far from one " +
    "recording's, which is a much smaller claim.",
  "It says nothing about how anybody responds to a robot. A recording has one arm — the people in " +
    "it were filmed once — and every disturbance number on this site is a difference between two " +
    "runs of the same room. A corridor cannot be filmed twice.",
  "No fitted value here is anybody's true walking speed. It is the setting that brought an " +
    "invented crowd's speeds closest to a recording's, on a coarse grid.",
]);

export interface FitVerdict {
  readonly kind: "fitVerdict";
  readonly disclosure: readonly string[];
  readonly lead: string;
  readonly distance: number;
  readonly selfDistance: number;
  readonly beatsNoise: boolean;
  readonly parameters: readonly FitParameter[];
  readonly nTracks: number;
  readonly nSpeeds: number;
  readonly framesPerSecond: number;
  readonly refusal: readonly string[];
}

export function makeFitVerdict(result: FitResult): FitVerdict {
  if (!Number.isFinite(result.best.distance)) {
    fail("the fit came back with no distance, so there is nothing to report");
  }
  if (!Number.isFinite(result.selfDistance) || result.selfDistance <= 0) {
    fail(
      "the crowd's distance from itself was not measured, so the fit has nothing to be read " +
        "against and a figure on its own is the error this whole site refuses",
    );
  }

  return Object.freeze({
    kind: "fitVerdict" as const,
    disclosure: Object.freeze([...FIT_DISCLOSURE]),
    lead: LEAD,
    distance: result.best.distance,
    selfDistance: result.selfDistance,
    beatsNoise: result.best.distance > result.selfDistance,
    parameters: Object.freeze([result.pace, result.wobble]),
    nTracks: result.nRecordedTracks,
    nSpeeds: result.nRecordedSpeeds,
    framesPerSecond: result.framesPerSecond,
    refusal: Object.freeze([...FIT_REFUSAL]),
  });
}

/* ------------------------------------------------------------------------------------------- */

/**
 * A speed and its unit, in their own spans.
 *
 * `UnitKey` has no metres-per-second, and adding one would reach into the catalogues that every
 * column and axis is declared in for the sake of one page. So the number renders through the shared
 * formatter at `none`'s three places and the unit is a slot of its own beside it — which is what
 * every other value on the site does anyway, and keeps the digit inside a value slot where the
 * numeric-literal scans expect to find it.
 */
function speed(doc: Document, host: HTMLElement, value: number, headline: boolean): void {
  const numberClass = headline ? "figure-number" : "figure-inline";
  host.appendChild(element(doc, "span", numberClass, formatValue(value, "none")));
  host.appendChild(element(doc, "span", "figure-unit", "m/s"));
}

function renderParameter(doc: Document, parameter: FitParameter): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.className = parameter.identified ? "fit-parameter" : "fit-parameter fit-unpinned";
  wrap.setAttribute("data-identified", parameter.identified ? "yes" : "no");

  wrap.appendChild(element(doc, "p", "figure-label", parameter.label));

  const value = doc.createElement("p");
  value.className = "figure-value";
  value.appendChild(element(doc, "span", "figure-number", formatValue(parameter.value, "none")));
  wrap.appendChild(value);

  const moved = doc.createElement("p");
  moved.className = "figure-plain";
  moved.appendChild(doc.createTextNode("Moving it across its range moves the comparison by "));
  speed(doc, moved, parameter.spread, false);
  moved.appendChild(doc.createTextNode("."));
  wrap.appendChild(moved);

  wrap.appendChild(
    element(
      doc,
      "p",
      "figure-note",
      parameter.identified ? IDENTIFIED_NOTE : UNIDENTIFIED_NOTE,
    ),
  );
  return wrap;
}

export function renderFitVerdict(doc: Document, verdict: FitVerdict): HTMLElement {
  const section = doc.createElement("section");
  section.className = "method-verdict fit-verdict";
  section.setAttribute("data-verdict", "fit");

  // First, and not collapsible. All three clauses, in order, before any number on the page.
  const said = part(doc, "disclosure", "Before the number");
  for (const clause of verdict.disclosure) {
    said.appendChild(element(doc, "p", "verdict-claim fit-disclosure", clause));
  }
  section.appendChild(said);

  const figure = part(doc, "fit", "What it came to");
  figure.appendChild(element(doc, "p", "verdict-line", verdict.lead));

  const wrap = doc.createElement("div");
  wrap.className = "method-figure";
  wrap.setAttribute("data-number", "fit");
  wrap.appendChild(element(doc, "p", "figure-label", FIT_LABEL));

  const value = doc.createElement("p");
  value.className = "figure-value";
  speed(doc, value, verdict.distance, true);
  wrap.appendChild(value);

  // Guardrail 6's shape: the figure never appears without what it would read if there were nothing
  // to see, and here that reference is measured rather than asserted.
  const zero = doc.createElement("p");
  zero.className = "figure-zero";
  const zeroValue = doc.createElement("span");
  zeroValue.className = "figure-zero-value";
  zeroValue.appendChild(element(doc, "span", "figure-inline", formatValue(verdict.selfDistance, "none")));
  zeroValue.appendChild(element(doc, "span", "figure-unit", "m/s"));
  zero.appendChild(zeroValue);
  zero.appendChild(element(doc, "span", "figure-zero-how", FIT_ZERO_HOW));
  wrap.appendChild(zero);

  wrap.appendChild(
    element(doc, "p", "figure-note", verdict.beatsNoise ? BEATS_NOISE : UNDER_NOISE),
  );
  figure.appendChild(wrap);
  section.appendChild(figure);

  const knobs = part(doc, "parameters", "What the recording did and did not decide");
  for (const parameter of verdict.parameters) {
    knobs.appendChild(renderParameter(doc, parameter));
  }
  section.appendChild(knobs);

  const from = part(doc, "provenance", PROVENANCE_LEAD);
  const counts = doc.createElement("p");
  counts.className = "verdict-line";
  counts.appendChild(doc.createTextNode("The recording holds "));
  counts.appendChild(element(doc, "span", "figure-inline", formatValue(verdict.nTracks, "count")));
  counts.appendChild(doc.createTextNode(" people who moved, and "));
  counts.appendChild(element(doc, "span", "figure-inline", formatValue(verdict.nSpeeds, "count")));
  counts.appendChild(doc.createTextNode(" steps between their samples, read at "));
  counts.appendChild(
    element(doc, "span", "figure-inline", formatValue(verdict.framesPerSecond, "none")),
  );
  counts.appendChild(doc.createTextNode(" frames per second — the rate you gave, which nothing "));
  counts.appendChild(doc.createTextNode("here can check for you."));
  from.appendChild(counts);
  section.appendChild(from);

  const refusal = doc.createElement("ul");
  refusal.className = "method-refusal";
  for (const line of verdict.refusal) {
    refusal.appendChild(element(doc, "li", "refusal-line", line));
  }
  const closing = part(doc, "refusal", "What this does not say");
  closing.appendChild(refusal);
  section.appendChild(closing);

  return section;
}
