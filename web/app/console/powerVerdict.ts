import { fail } from "../../engine/core/errors.js";
import { FAMILIES } from "../../engine/job/families.js";
import type { PowerCurve, PowerLevel } from "../../engine/job/powerCurve.js";
import type { UnitKey } from "../../engine/job/columns.js";
import { anchorFor } from "../../ui/labels.js";
import { formatValue, unitSuffix } from "./tile.js";

/**
 * The sweep, rendered: what the robot really did at each setting, and whether the ruler noticed.
 *
 * ## Which readout this moves, and what it reads when the answer is nothing
 *
 * Guardrail 11's admission test, answered before the feature was written. It moves one readout —
 * how often a ruler called a room — and at the bottom of the sweep that readout is the
 * false-positive count the method card already prints. Not a similar number about a similar world:
 * `powerCurve.slow.test.ts` asserts the two are bitwise identical, seed by seed, family by family.
 * So the zero this table is read against is not a phrase, it is the table's own first row, and the
 * page says so rather than leaving a reader to notice.
 *
 * ## Why three counts and not one rate
 *
 * A rate would be the wrong number here and it would be the flattering one. Whether there was
 * anything to notice varies room by room at the SAME setting, so "rooms it called" pools rooms
 * where the ruler found a real effect with rooms where it invented one. Pooled, a ruler that calls
 * every room looks like a perfect detector at the settings where most rooms happen to contain
 * something. Kept apart, it looks like what it is.
 *
 * ## What this never says
 *
 * Guardrail 2, unmoved and doing more work than usual, because a curve is the shape of a
 * performance claim and reads like one. The effect sizes down the first column are what an invented
 * dial did to an invented crowd. They are not effect sizes anybody has observed, this is not a
 * power calculation for anybody's study, and a ruler whose curve rises here has been shown to rise
 * here. The refusal is printed under the table rather than kept in this comment.
 */

const CURVE_LEAD =
  "The same rooms, run again at each setting of the dial that decides how much space the robot " +
  "demands. Down the table the robot pushes harder, so there is more for a ruler to find; across " +
  "it, what the ruler said about that.";

const TRUTH_HEADING = "What the robot really did";

const READING_HEADING = "What this ruler read";

const AVAILABLE_HEADING = "Rooms with something to find";

const FOUND_HEADING = "Found it";

const MISSED_HEADING = "Missed it";

const ALARM_HEADING = "Called an empty room";

const ZERO_ROW_NOTE =
  "The first row is the world this card's other count is taken on: the robot demands no space, " +
  "nobody is moved, and the true effect in every room is exactly nothing. So the rooms called on " +
  "that row are the false positives already reported above, measured again here rather than " +
  "quoted, and they are the figure every row beneath is read against.";

const AVAILABLE_NOTE =
  "A room only offers something to find when the robot moved the crowd by more than two runs of " +
  "that room differ on their own. That is decided room by room, not by the setting, so the same " +
  "row can hold rooms with something in them and rooms without. Calling a room in the second kind " +
  "is not a detection however hard the robot was pushing, which is why these are three counts and " +
  "not one rate.";

const FLAT_NOTE =
  "A ruler whose middle three columns barely change down the table is not reporting on what the " +
  "robot did. It is answering the same way whatever happened, so neither the rooms it called nor " +
  "the rooms it passed over carry anything about this robot.";

export const CURVE_REFUSAL: readonly string[] = Object.freeze([
  "This is not a power calculation, and no row of it says what effect size a study should be " +
    "built to detect.",
  "The distances in the first column are what an invented dial did to an invented crowd. Nobody " +
    "has observed them, and they are not metres of real disturbance.",
  "A ruler that found more as the robot pushed harder has been shown to do that here, on this " +
    "crowd, at these settings, and has been shown nothing about a corridor.",
]);

export interface PowerVerdict {
  readonly kind: "powerVerdict";
  /** The family's plain-English name. Never its key: guardrail 12. */
  readonly familyName: string;
  readonly lead: string;
  readonly levels: readonly PowerLevel[];
  /** True when the ruler called about as many rooms at the bottom of the sweep as at the top. */
  readonly readsFlat: boolean;
  readonly refusal: readonly string[];
}

/**
 * Whether the ruler's answer moved at all across the sweep.
 *
 * The comparison is between the two ENDS rather than a fit through every point: a curve that dips
 * in the middle and comes back is still a ruler that cannot tell the emptiest world from the
 * fullest, and a slope through the middle would score it as though it could. The threshold is one
 * room out of the denominator — a ruler whose called-count moved by a single room across the whole
 * dial has not moved.
 */
export function readsFlatAcross(levels: readonly PowerLevel[]): boolean {
  const first = levels[0];
  const last = levels[levels.length - 1];
  if (first === undefined || last === undefined) {
    return false;
  }
  return Math.abs(last.nCleared - first.nCleared) <= 1;
}

export function makePowerVerdict(curve: PowerCurve): PowerVerdict {
  if (curve.levels.length < 2) {
    fail("a sweep needs at least two dial positions to be read as a curve");
  }
  const first = curve.levels[0];
  if (first === undefined || first.pushStrength !== 0) {
    fail(
      "the sweep does not start at a robot that demands no space, so its first row is not the " +
        "world the false-positive count was taken on and there is nothing to read the rest against",
    );
  }
  if (first.meanTruthM !== 0) {
    fail(
      "the first row of the sweep has a true effect that is not exactly nothing, so it is not the " +
        "zero-effect world this table claims to be read against",
    );
  }

  return Object.freeze({
    kind: "powerVerdict" as const,
    familyName: FAMILIES[curve.familyKey].name,
    lead: CURVE_LEAD,
    levels: Object.freeze([...curve.levels]),
    readsFlat: readsFlatAcross(curve.levels),
    refusal: Object.freeze([...CURVE_REFUSAL]),
  });
}

/* ---------------------------------------------------------------------------------------------
 * Rendering. The helpers below are the shape of `method.ts`'s own, which are module-private there;
 * see the note in `suppliedVerdict.ts`. If they are ever hoisted, all three call sites move.
 * ------------------------------------------------------------------------------------------- */

function element(doc: Document, tag: string, className: string, content: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  node.textContent = content;
  return node;
}

/** A value and its unit in their own spans, so a scan for numbers in copy can tell them apart. */
function cellValue(doc: Document, host: HTMLElement, value: number, unit: UnitKey): void {
  host.appendChild(element(doc, "span", "figure-inline", formatValue(value, unit)));
  const suffix = unitSuffix(unit);
  if (suffix.length > 0) {
    host.appendChild(element(doc, "span", "figure-unit", suffix));
  }
}

function headCell(doc: Document, text: string): HTMLElement {
  const cell = doc.createElement("th");
  cell.scope = "col";
  cell.textContent = text;
  return cell;
}

function levelRow(doc: Document, level: PowerLevel, isZero: boolean): HTMLElement {
  const row = doc.createElement("tr");
  row.className = isZero ? "power-row power-row-zero" : "power-row";
  row.setAttribute("data-push", String(level.pushStrength));

  const dial = doc.createElement("th");
  dial.scope = "row";
  dial.className = "power-dial";
  if (level.pushStrength === 0) {
    dial.appendChild(doc.createTextNode("No space at all"));
  } else {
    // `ratio`, not `count`. A count rounds to whole numbers, which printed the two settings below
    // one as "0 times the usual" and "1 times the usual" — two rows mislabelled and one of them
    // sharing a label with the row beneath it. Caught by driving the built page, not by a test.
    cellValue(doc, dial, level.pushStrength, "ratio");
    dial.appendChild(doc.createTextNode(" the usual push"));
  }
  row.appendChild(dial);

  const truth = doc.createElement("td");
  cellValue(doc, truth, level.meanTruthM, "metres");
  truth.appendChild(element(doc, "span", "figure-anchor", anchorFor(level.meanTruthM)));
  row.appendChild(truth);

  const reading = doc.createElement("td");
  cellValue(doc, reading, level.meanReading, "metres");
  row.appendChild(reading);

  for (const count of [level.nTruthOverBand, level.nHit, level.nMissed, level.nFalseAlarm]) {
    const cell = doc.createElement("td");
    cellValue(doc, cell, count, "count");
    cell.appendChild(doc.createTextNode(" of "));
    cellValue(doc, cell, level.nAttempted, "count");
    row.appendChild(cell);
  }

  return row;
}

export function renderPowerVerdict(doc: Document, verdict: PowerVerdict): HTMLElement {
  const section = doc.createElement("section");
  section.className = "method-verdict power-verdict";
  section.setAttribute("data-verdict", "power");

  section.appendChild(element(doc, "p", "verdict-line", verdict.lead));
  section.appendChild(element(doc, "p", "region-note", ZERO_ROW_NOTE));
  section.appendChild(element(doc, "p", "region-note", AVAILABLE_NOTE));

  const table = doc.createElement("table");
  table.className = "power-table";

  const head = doc.createElement("thead");
  const headRow = doc.createElement("tr");
  headRow.appendChild(headCell(doc, "How much space the robot demands"));
  headRow.appendChild(headCell(doc, TRUTH_HEADING));
  headRow.appendChild(headCell(doc, READING_HEADING));
  headRow.appendChild(headCell(doc, AVAILABLE_HEADING));
  headRow.appendChild(headCell(doc, FOUND_HEADING));
  headRow.appendChild(headCell(doc, MISSED_HEADING));
  headRow.appendChild(headCell(doc, ALARM_HEADING));
  head.appendChild(headRow);
  table.appendChild(head);

  const body = doc.createElement("tbody");
  let isZero = true;
  for (const level of verdict.levels) {
    body.appendChild(levelRow(doc, level, isZero));
    isZero = false;
  }
  table.appendChild(body);

  // Wide table, narrow column. It scrolls inside its own box rather than pushing the page sideways.
  const scroll = doc.createElement("div");
  scroll.className = "power-scroll";
  scroll.appendChild(table);
  section.appendChild(scroll);

  if (verdict.readsFlat) {
    section.appendChild(element(doc, "p", "verdict-claim power-flat", FLAT_NOTE));
  }

  const refusal = doc.createElement("ul");
  refusal.className = "method-refusal";
  for (const line of verdict.refusal) {
    refusal.appendChild(element(doc, "li", "refusal-line", line));
  }
  section.appendChild(refusal);

  return section;
}
