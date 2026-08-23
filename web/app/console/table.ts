import { ContractError, fail } from "../../engine/core/errors.js";
import { makeRunConfig } from "../../engine/contracts/config.js";
import { COLUMNS, COLUMN_ORDER, type ColumnKey } from "../../engine/job/columns.js";
import { accumulate } from "../../engine/job/runner.js";
import type { Aggregate, AggregateReason } from "../../engine/job/stats.js";
import type { SweepJob } from "../../engine/job/spec.js";
import { baseOverridesFor, measurementParamsFor, type ConsoleSettings } from "./state.js";
import { labelForCell, type RunGroup } from "./group.js";
import { formatValue, unitSuffix } from "./tile.js";

/**
 * The kept-results ledger.
 *
 * A row is a CELL: one axis value, aggregated over that cell's seeds. The stored unit underneath
 * it is a RUN, keyed {axisIndex, axisValue, seedIndex}, because a cell has no seed and so cannot
 * be rebuilt, and playback needs something that can.
 *
 * The aggregation is not implemented here. `accumulate` in runner.ts is the only per-cell grouping
 * in the project, and csv.ts calls the same one — which is what stops the table and the export
 * ever disagreeing.
 *
 * `Aggregate` and `AggregateReason` are imported from `web/engine/job/stats.ts`, not
 * `web/engine/job/runner.ts`: `runner.ts` imports both for its own `accumulate` signature but
 * never re-exports either name, so `web/engine/job/runner.js` has no exported member `Aggregate`
 * for this file to import — the same fact `csv.ts`, `web/app/worker/protocol.ts` and
 * `web/app/worker/client.ts` already document about `RunRow`.
 */

export const STALE_MESSAGE =
  "these numbers were measured at the settings in the link, not the ones now in the panel.";

export interface CellRef {
  readonly kind: "cellRef";
  readonly groupId: string;
  readonly axisIndex: number;
}

export function makeCellRef(init: { readonly groupId: string; readonly axisIndex: number }): CellRef {
  if (init.groupId.length === 0) {
    throw new ContractError("a ledger selection must name a kept result");
  }
  if (!Number.isInteger(init.axisIndex) || init.axisIndex < 0) {
    throw new ContractError(`a ledger selection must name a cell, got ${init.axisIndex}`);
  }
  return Object.freeze({ kind: "cellRef" as const, groupId: init.groupId, axisIndex: init.axisIndex });
}

export type SortKey =
  | { readonly kind: "byAxis" }
  | { readonly kind: "byColumn"; readonly column: ColumnKey };

export interface LedgerViewInit {
  readonly groups: readonly RunGroup[];
  readonly columns: readonly ColumnKey[];
  readonly selected: CellRef | null;
  readonly pinned: readonly CellRef[];
  readonly sort: SortKey;
  readonly direction: "ascending" | "descending";
  readonly staleMessage: string | null;
}

export interface LedgerView extends LedgerViewInit {
  readonly kind: "ledgerView";
}

export function makeLedgerView(init: LedgerViewInit): LedgerView {
  if (init.columns.length === 0) {
    throw new ContractError("the ledger must show at least one column");
  }
  return Object.freeze({
    kind: "ledgerView" as const,
    groups: Object.freeze([...init.groups]),
    columns: Object.freeze([...init.columns]),
    selected: init.selected,
    pinned: Object.freeze([...init.pinned]),
    sort: init.sort,
    direction: init.direction,
    staleMessage: init.staleMessage,
  });
}

export interface LedgerRow {
  readonly kind: "ledgerRow";
  readonly ref: CellRef;
  readonly label: string;
  readonly axisValue: number;
  readonly nUsed: number;
  readonly nAttempted: number;
  readonly cells: Readonly<Partial<Record<ColumnKey, Aggregate>>>;
  readonly pinned: boolean;
  readonly selected: boolean;
}

function isSameRef(a: CellRef, b: CellRef): boolean {
  return a.groupId === b.groupId && a.axisIndex === b.axisIndex;
}

function sortValue(row: LedgerRow, sort: SortKey): number {
  if (sort.kind === "byAxis") {
    return row.axisValue;
  }
  const cell = row.cells[sort.column];
  if (cell === undefined) {
    return Number.NaN;
  }
  return cell.value;
}

export function ledgerRows(view: LedgerView): readonly LedgerRow[] {
  const built: LedgerRow[] = [];

  for (const group of view.groups) {
    const byCell = accumulate(group.rows, view.columns);
    for (const [axisIndex, cells] of byCell) {
      const ref = makeCellRef({ groupId: group.id, axisIndex });
      let nUsed = 0;
      let nAttempted = group.job.seedIndices.length;
      for (const key of view.columns) {
        const cell = cells[key];
        if (cell !== undefined && cell.nUsed > nUsed) {
          nUsed = cell.nUsed;
          nAttempted = cell.nAttempted;
        }
      }
      let pinned = false;
      for (const pin of view.pinned) {
        if (isSameRef(pin, ref)) {
          pinned = true;
        }
      }
      const selected = view.selected !== null && isSameRef(view.selected, ref);
      built.push({
        kind: "ledgerRow",
        ref,
        label: labelForCell(group.job, axisIndex),
        axisValue: group.job.axisValues[axisIndex] ?? 0,
        nUsed,
        nAttempted,
        cells,
        pinned,
        selected,
      });
    }
  }

  // Pinned first, whatever the sort — a pin means "keep this one where I can see it". Then the
  // sort key, with unmeasured cells always last so a column of reasons never floats to the top.
  const sorted = [...built];
  sorted.sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    const av = sortValue(a, view.sort);
    const bv = sortValue(b, view.sort);
    const aFinite = Number.isFinite(av);
    const bFinite = Number.isFinite(bv);
    if (aFinite !== bFinite) {
      return aFinite ? -1 : 1;
    }
    if (!aFinite && !bFinite) {
      return 0;
    }
    return view.direction === "ascending" ? av - bv : bv - av;
  });
  return Object.freeze(sorted);
}

export interface ColumnDelta {
  readonly kind: "columnDelta";
  readonly column: ColumnKey;
  readonly aValue: number;
  readonly bValue: number;
  readonly deltaM: number;
}

export function compareRows(view: LedgerView): readonly ColumnDelta[] {
  if (view.pinned.length !== 2) {
    return Object.freeze([]);
  }
  const rows = ledgerRows(view);
  const pinnedRows: LedgerRow[] = [];
  for (const row of rows) {
    if (row.pinned) {
      pinnedRows.push(row);
    }
  }
  const first = pinnedRows[0];
  const second = pinnedRows[1];
  if (first === undefined || second === undefined) {
    return Object.freeze([]);
  }
  const deltas: ColumnDelta[] = [];
  for (const key of view.columns) {
    const a = first.cells[key];
    const b = second.cells[key];
    if (a === undefined || b === undefined) {
      continue;
    }
    deltas.push({
      kind: "columnDelta",
      column: key,
      aValue: a.value,
      bValue: b.value,
      deltaM: b.value - a.value,
    });
  }
  return Object.freeze(deltas);
}

/**
 * Whether the panel still describes what a kept result was measured at.
 *
 * `ConsoleSettings` carries no `base`/`measurement` field of its own — those belong to `SweepJob`.
 * `baseOverridesFor` and `measurementParamsFor` (state.ts) are the same translators `jobForRun`
 * itself calls to build a job FROM the panel, so comparing through them is comparing the panel and
 * the job by the one path that already has to agree with what a press of Run would produce, rather
 * than inventing a second one here that could drift from it.
 *
 * Both sides go through `makeRunConfig`, so the world-config comparison is between two fully
 * defaulted configs with the same key order rather than between two override bags that happen to
 * differ in shape.
 */
export function settingsMatchJob(settings: ConsoleSettings, job: SweepJob): boolean {
  const fromPanel = makeRunConfig({ ...baseOverridesFor(settings), seed: job.baseSeed, replicate: 0 });
  const fromJob = makeRunConfig({ ...job.base, seed: job.baseSeed, replicate: 0 });
  if (JSON.stringify(fromPanel) !== JSON.stringify(fromJob)) {
    return false;
  }
  return JSON.stringify(measurementParamsFor(settings)) === JSON.stringify(job.measurement);
}

/**
 * `AggregateReason`'s real shape (stats.ts) is `"measured" | "partiallyCensored" | "allCensored" |
 * "notApplicable"`, not a three-or-four-way `"aggregated"/"censored"/"empty"` split — only the
 * last two ever carry a `why`, and both only ever reach here once `cellText` has already ruled out
 * a finite `cell.value` (which "measured" and "partiallyCensored" always have). The canned
 * "none of N runs..."/"this quantity does not exist for any of these N..." prefix is stripped for
 * the same reason csv.ts strips it from its own reason column: the ledger's own "seeds" column
 * already carries nUsed/nAttempted, so repeating the count inside the sentence would say it twice.
 * csv.ts does not export its version of this, so it is five lines duplicated locally rather than
 * imported — the same call group.ts's own `lowerFirst` already made.
 */
const ALL_CENSORED_PREFIX = /^none of \d+ runs produced a number: /;
const NOT_APPLICABLE_PREFIX = /^this quantity does not exist for any of these \d+ runs: /;

function strippedDetail(why: string): string {
  return why.replace(ALL_CENSORED_PREFIX, "").replace(NOT_APPLICABLE_PREFIX, "");
}

function cellReasonText(reason: AggregateReason): string {
  if (reason.kind === "allCensored" || reason.kind === "notApplicable") {
    return strippedDetail(reason.why);
  }
  fail(
    `cellReasonText was called with reason.kind '${reason.kind}', but only 'allCensored' and ` +
      `'notApplicable' should ever reach it: a 'measured' or 'partiallyCensored' aggregate has a ` +
      `finite value and never gets here`,
  );
}

function reasonSpan(doc: Document, why: string): HTMLElement {
  const node = doc.createElement("span");
  node.className = "cell-reason";
  node.textContent = why;
  return node;
}

function cellText(doc: Document, column: ColumnKey, cell: Aggregate | undefined): HTMLElement {
  const node = doc.createElement("td");
  node.className = "ledger-cell";
  if (cell === undefined) {
    node.appendChild(reasonSpan(doc, "not measured in this run"));
    return node;
  }
  if (!Number.isFinite(cell.value)) {
    node.appendChild(reasonSpan(doc, cellReasonText(cell.reason)));
    return node;
  }
  const unit = COLUMNS[column].unit;
  const value = doc.createElement("span");
  value.className = "cell-number";
  value.textContent = formatValue(cell.value, unit);
  node.appendChild(value);
  const suffix = unitSuffix(unit);
  if (suffix.length > 0) {
    const unitNode = doc.createElement("span");
    unitNode.className = "cell-unit";
    unitNode.textContent = suffix;
    node.appendChild(unitNode);
  }
  // A mean never appears without its count, and a spread never appears as a zero it does not have:
  // sd is NaN below two survivors, and a 0 printed there would read as "no spread".
  if (Number.isFinite(cell.sd)) {
    const spread = doc.createElement("span");
    spread.className = "cell-spread";
    spread.textContent = `± ${formatValue(cell.sd, unit)}`;
    node.appendChild(spread);
  }
  return node;
}

export function renderLedger(doc: Document, view: LedgerView): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.className = "ledger-wrap";

  if (view.staleMessage !== null) {
    const note = doc.createElement("p");
    note.className = "ledger-stale";
    note.textContent = view.staleMessage;
    wrap.appendChild(note);
  }

  const table = doc.createElement("table");
  table.className = view.staleMessage === null ? "ledger" : "ledger is-stale";

  const head = doc.createElement("thead");
  const headRow = doc.createElement("tr");
  for (const label of ["", "result", "seeds"]) {
    const th = doc.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  }
  for (const key of view.columns) {
    const descriptor = COLUMNS[key];
    const th = doc.createElement("th");
    th.setAttribute("data-column", String(key));
    th.className = "ledger-heading";
    const name = doc.createElement("span");
    name.className = "col-label";
    name.textContent = descriptor.label;
    th.appendChild(name);
    const unit = doc.createElement("span");
    unit.className = "col-unit";
    unit.textContent = descriptor.unit;
    th.appendChild(unit);
    headRow.appendChild(th);
  }
  head.appendChild(headRow);
  table.appendChild(head);

  const body = doc.createElement("tbody");
  for (const row of ledgerRows(view)) {
    const tr = doc.createElement("tr");
    tr.className = row.selected ? "ledger-row is-selected" : "ledger-row";
    tr.setAttribute("data-group-id", row.ref.groupId);
    tr.setAttribute("data-axis-index", String(row.ref.axisIndex));
    tr.setAttribute("aria-selected", row.selected ? "true" : "false");

    const pinCell = doc.createElement("td");
    const pin = doc.createElement("button");
    pin.type = "button";
    pin.className = "pin";
    pin.setAttribute("aria-pressed", row.pinned ? "true" : "false");
    pin.setAttribute("aria-label", row.pinned ? "unpin this result" : "pin this result");
    // Filled disc against hollow — the same glyph vocabulary the arena uses for treated and
    // control (web/ui/arena.ts: filled for the treated run, hollow for the control), so the ledger
    // and the picture read as one system even though the arena draws its pair on a canvas and this
    // one is text.
    pin.textContent = row.pinned ? "●" : "○";
    pinCell.appendChild(pin);
    tr.appendChild(pinCell);

    const label = doc.createElement("td");
    label.className = "ledger-label";
    label.textContent = row.label;
    tr.appendChild(label);

    const seeds = doc.createElement("td");
    seeds.className = "ledger-seeds";
    seeds.textContent = `${row.nUsed}/${row.nAttempted}`;
    tr.appendChild(seeds);

    for (const key of view.columns) {
      tr.appendChild(cellText(doc, key, row.cells[key]));
    }
    body.appendChild(tr);
  }
  table.appendChild(body);
  wrap.appendChild(table);

  const deltas = compareRows(view);
  if (deltas.length > 0) {
    const strip = doc.createElement("p");
    strip.className = "ledger-compare";
    for (const delta of deltas) {
      const unit = COLUMNS[delta.column].unit;
      const item = doc.createElement("span");
      item.className = "compare-item";
      const name = doc.createElement("span");
      name.className = "compare-label";
      name.textContent = COLUMNS[delta.column].label;
      const value = doc.createElement("span");
      value.className = "compare-number";
      value.textContent = formatValue(delta.deltaM, unit);
      item.appendChild(name);
      item.appendChild(value);
      strip.appendChild(item);
    }
    wrap.appendChild(strip);
  }

  return wrap;
}

/**
 * The picker hides; it does not gate.
 *
 * Every column whose `needs` is "run" is computed on every unit — all six cheap composers together
 * are ~3.4 ms against a 38 ms paired run — so ticking one after a Run fills it in with no
 * re-simulation. Band, floor and Frechet are the three that had to be bought before the press, and
 * a column nobody bought says so rather than pretending to be empty.
 */
export function renderColumnPicker(doc: Document, view: LedgerView): HTMLElement {
  const list = doc.createElement("div");
  list.className = "column-picker";

  for (const key of COLUMN_ORDER) {
    const descriptor = COLUMNS[key];
    let bought = descriptor.needs === "run";
    for (const group of view.groups) {
      if (descriptor.needs === "band" && group.job.bandReplicates !== null) {
        bought = true;
      }
      if (descriptor.needs === "floor" && group.job.floor !== null) {
        bought = true;
      }
      if (descriptor.needs === "frechet" && group.job.frechet) {
        bought = true;
      }
      if (descriptor.needs === "zeroRun" && group.job.zeroReferenceRun) {
        bought = true;
      }
    }

    const label = doc.createElement("label");
    label.className = "column-option";
    const box = doc.createElement("input");
    box.type = "checkbox";
    box.value = String(key);
    box.checked = view.columns.includes(key);
    box.disabled = !bought;
    label.appendChild(box);

    const name = doc.createElement("span");
    name.className = "column-name";
    name.textContent = descriptor.label;
    label.appendChild(name);

    if (!bought) {
      const note = doc.createElement("span");
      note.className = "column-note";
      note.textContent = "not measured in any kept result — tick it before pressing Run";
      label.appendChild(note);
    }
    list.appendChild(label);
  }
  return list;
}

/**
 * Hand the operator the file.
 *
 * A blob URL where the browser offers one, a data URL otherwise. There is no server to post to and
 * there is not going to be one.
 */
export function downloadCsv(doc: Document, filename: string, text: string): void {
  const anchor = doc.createElement("a");
  anchor.download = filename;
  const maker = (globalThis as unknown as { URL?: { createObjectURL?: (blob: Blob) => string } }).URL;
  if (maker !== undefined && typeof maker.createObjectURL === "function") {
    anchor.href = maker.createObjectURL(new Blob([text], { type: "text/csv" }));
  } else {
    anchor.href = `data:text/csv;charset=utf-8,${encodeURIComponent(text)}`;
  }
  doc.body.appendChild(anchor);
  anchor.click();
  doc.body.removeChild(anchor);
}
