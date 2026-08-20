/**
 * The `{{q:…}}` reference resolver, as a pure function over data.
 *
 * Every number in the prose is a reference into `web/data/experiment-facts.json` or into a live
 * widget on the same page, and it is resolved HERE, at build time. Two reasons, and the second is
 * the one that matters. First, the number then lives in the static HTML, so it survives with
 * JavaScript off like the rest of the prose. Second, an unresolvable reference becomes a BUILD
 * ERROR rather than a silent ellipsis: the first version resolved these in the browser, and a
 * page whose references were all wrong rendered as "the average deviation is …" and looked, from
 * the build's point of view, perfectly fine.
 *
 * It lives here rather than inside scripts/build-notes.ts for the same reason the lints do, and
 * with more force: this resolver is the thing that turned forty silent holes into forty fixable
 * ones, and it did that entirely through the wording of its failures. **The message quality is
 * the feature.** Every rejection below names what was available instead, and the tests assert on
 * that naming rather than on the rejection — a resolver that says "unknown column" and stops has
 * lost the property that made it worth having.
 *
 * Nothing here touches the filesystem, the clock or `process`. Inputs arrive as arguments and
 * problems come back as data, so the failures can be watched firing in a test.
 *
 * Syntax, pinned in docs/teaching/authoring.md because leaving it vague produced three different
 * invented spellings across sixteen pages:
 *
 *   {{q:table[axis=value].column}}   select the row whose axis column equals value
 *   {{q:table@index.column}}         select by row index, or @first / @last
 *   {{q:table.column}}               only legal when the table has exactly one row
 *   {{q:table.column@value}}         the same as the bracket form, in the order prose wants it
 *   {{q:widget-id}}                  the build-time value of a live widget on this page
 *
 * A trailing `.sd` reads the standard deviation across seeds; `.min` / `.max` reduce the whole
 * column; `.anchor` on a live widget gives the body-scale phrase for its headline value.
 */
import { load as loadYaml } from "js-yaml";
import { anchorFor } from "../ui/labels.js";

export interface FactTable {
  readonly axis: string;
  readonly nSeeds: number;
  readonly rows: readonly Readonly<Record<string, number>>[];
}

/**
 * The build-time value of one live widget's metric, in metres.
 *
 * `headlineM` is a separate field rather than a `default` key in `fieldsM` so that "there is
 * always something for `{{q:id}}` and `{{q:id.anchor}}` to show" is a guarantee of the type
 * rather than a convention someone has to remember when adding a metric.
 */
export interface LiveMetric {
  readonly headlineM: number;
  readonly fieldsM: Readonly<Record<string, number>>;
  /**
   * Not every live quantity is a length. Time-to-goal is seconds and a near-miss tally is a bare
   * count, and rendering either as "16.744 m" would be a units error printed in the reader's
   * sentence — the exact class of mistake this whole pipeline exists to make impossible.
   */
  readonly unit?: "m" | "s" | "count";
}

/** Everything the resolver reads that is fixed for the whole build. */
export interface QuantityData {
  readonly tables: Readonly<Record<string, FactTable>>;
  readonly live: Readonly<Record<string, LiveMetric>>;
}

/** The above plus the widgets found on the page currently being rendered. */
export interface QuantitySources extends QuantityData {
  /** widget id -> the metric it renders. */
  readonly widgetMetrics: ReadonlyMap<string, string>;
}

export interface QuantityProblem {
  readonly rule:
    | "bad-syntax"
    | "unknown-table"
    | "unknown-column"
    | "unknown-axis"
    | "no-such-row"
    | "row-out-of-range"
    | "no-row-selector"
    | "empty-column"
    | "unknown-widget-metric"
    | "unknown-widget-field"
    | "non-finite";
  readonly message: string;
}

export type QuantityResolution =
  | { readonly kind: "value"; readonly text: string }
  | { readonly kind: "problem"; readonly problem: QuantityProblem };

function value(text: string): QuantityResolution {
  return { kind: "value", text };
}

function problem(rule: QuantityProblem["rule"], message: string): QuantityResolution {
  return { kind: "problem", problem: { rule, message } };
}

/**
 * Read the `mirn:quantity` blocks out of a page body, so a `{{q:…}}` token can name one.
 *
 * A block that is not valid YAML is skipped rather than reported: the renderer parses the same
 * block a moment later and fails the build there, next to the page that contains it, with the
 * parser's own message. Reporting it twice would double every such error.
 */
export function collectQuantityWidgets(body: string): Map<string, string> {
  const widgets = new Map<string, string>();
  for (const match of body.matchAll(/```mirn:quantity\n([\s\S]*?)```/g)) {
    let config: unknown;
    try {
      config = loadYaml(match[1] as string);
    } catch {
      continue;
    }
    const typed = config as { id?: string; metric?: string };
    if (typeof typed.id === "string" && typeof typed.metric === "string") {
      widgets.set(typed.id, typed.metric);
    }
  }
  return widgets;
}

/** The unit is carried by the column-name suffix, which is why those suffixes exist. */
export function formatQuantity(column: string, quantity: number): string {
  if (column.endsWith("M") || column.endsWith("M_sd")) {
    return `${quantity.toFixed(3)} m`;
  }
  if (column.endsWith("S") || column.endsWith("S_sd")) {
    return `${quantity.toFixed(2)} s`;
  }
  if (column.startsWith("n") || column.includes("Episodes")) {
    // A count of people is a whole number and reads wrong with a decimal point on it ("224.0
    // people"). A count averaged over seeds is not, and rounding it to 224 would overstate the
    // precision. Let the value decide.
    return Number.isInteger(quantity) ? quantity.toFixed(0) : quantity.toFixed(1);
  }
  return quantity.toFixed(3);
}

/** Short aliases so a page can write e2 rather than e2_density. */
function tableAliases(tables: Readonly<Record<string, FactTable>>): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const key of Object.keys(tables)) {
    aliases.set(key, key);
    const short = /^(e\d)_/.exec(key);
    if (short !== null) {
      aliases.set(short[1] as string, key);
    }
  }
  return aliases;
}

function columnsOf(table: FactTable): string[] {
  const first = table.rows[0];
  if (first === undefined) {
    return [];
  }
  const names: string[] = [];
  for (const key of Object.keys(first)) {
    if (!key.endsWith("_sd")) {
      names.push(key);
    }
  }
  return names;
}

/**
 * A number that came out NaN or Infinity is a censored measurement, not a result.
 *
 * Printing it would put the literal text "NaN" in the middle of a sentence, which is both wrong
 * and — worse — looks like a rendering glitch rather than a missing measurement, so it gets
 * ignored rather than fixed.
 */
function rejectNonFinite(ref: string, quantity: number): QuantityResolution {
  return problem(
    "non-finite",
    `{{q:${ref}}} resolves to ${quantity}, which is not a number the page can show. That usually ` +
      `means the measurement was censored for this row — say so in words instead`,
  );
}

/**
 * The canonical spelling of a reference.
 *
 * Pages may write `table.column@value`, which reads better in prose, but the runtime matcher only
 * understands the bracket form. Emitting the raw string into `data-quantity` meant every
 * prose-order reference was invisible to the browser, so those numbers never became clickable and
 * the promise that every number opens quietly held for some of them and not others.
 */
export function canonicalRef(raw: string): string {
  return raw.trim().replace(/^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)@(-?[\d.]+)$/, "$1[@axis=$3].$2");
}

export function resolveQuantity(raw: string, sources: QuantitySources): QuantityResolution {
  const trimmed = raw.trim();

  // A token may name a live widget on this page rather than a row of the facts table. That is
  // checked first, because a widget id can look exactly like a table name.
  const liveMatch = /^([A-Za-z0-9-]+)(?:\.([A-Za-z0-9-]+))?$/.exec(trimmed);
  if (liveMatch !== null) {
    const widgetId = liveMatch[1] as string;
    const metricName = sources.widgetMetrics.get(widgetId);
    if (metricName !== undefined) {
      const field = liveMatch[2] ?? "default";
      return resolveLive(trimmed, widgetId, metricName, field, sources);
    }
  }

  return resolveTable(trimmed, sources);
}

function resolveLive(
  ref: string,
  widgetId: string,
  metricName: string,
  field: string,
  sources: QuantitySources,
): QuantityResolution {
  const metric = sources.live[metricName];
  if (metric === undefined) {
    return problem(
      "unknown-widget-metric",
      `{{q:${ref}}} names widget '${widgetId}', whose metric '${metricName}' has no build-time ` +
        `value. Known metrics: ${Object.keys(sources.live).join(", ")}`,
    );
  }

  // `.anchor` is the sanctioned escape from the comparative lint, documented in
  // docs/teaching/authoring.md: a page may not write "which is more than a stride" next to a live
  // number, because a control can falsify it, but it may interpolate the phrase the number itself
  // implies. It is derived from the same value the reader is looking at, so it cannot go stale.
  if (field === "anchor") {
    if (!Number.isFinite(metric.headlineM)) {
      return rejectNonFinite(ref, metric.headlineM);
    }
    return value(anchorFor(metric.headlineM));
  }

  let metres: number | undefined;
  if (field === "default") {
    metres = metric.headlineM;
  } else {
    metres = metric.fieldsM[field];
  }
  if (metres === undefined) {
    const available: string[] = ["default"];
    for (const key of Object.keys(metric.fieldsM)) {
      available.push(key);
    }
    available.push("anchor");
    return problem(
      "unknown-widget-field",
      `{{q:${ref}}} asks widget '${widgetId}' for '${field}', which metric '${metricName}' does ` +
        `not provide. Available: ${available.join(", ")}`,
    );
  }
  if (!Number.isFinite(metres)) {
    return rejectNonFinite(ref, metres);
  }
  const unit = metric.unit ?? "m";
  if (unit === "s") {
    return value(`${metres.toFixed(2)} s`);
  }
  if (unit === "count") {
    return value(Number.isInteger(metres) ? metres.toFixed(0) : metres.toFixed(1));
  }
  return value(`${metres.toFixed(3)} m`);
}

function resolveTable(trimmed: string, sources: QuantitySources): QuantityResolution {
  // Three spellings the page authors reached for independently, kept because each is the natural
  // way to say a different thing: pick a row by its axis value, pick one by position, or reduce
  // the whole column. The `column@value` ordering is normalised into the bracket form rather than
  // rejected — it reads better in prose and there is no ambiguity in it.
  const ref = trimmed.replace(/^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)@(-?[\d.]+)$/, "$1[@axis=$3].$2");

  const match =
    /^([A-Za-z0-9_]+)(?:\[(@?[A-Za-z0-9_]+)=(-?[\d.]+)\]|@(\d+|first|last))?\.([A-Za-z0-9_]+)(?:\.(sd|min|max))?$/.exec(
      ref,
    );
  if (match === null) {
    return problem(
      "bad-syntax",
      `{{q:${ref}}} is not a valid reference. See docs/teaching/authoring.md`,
    );
  }
  // Groups 1 and 5 are not optional in the pattern above, so they are present whenever it matched.
  const tableRef = match[1] as string;
  const axisKey = match[2];
  const axisValue = match[3];
  const rowIndex = match[4];
  const columnRaw = match[5] as string;
  const suffix = match[6];

  const tableName = tableAliases(sources.tables).get(tableRef);
  if (tableName === undefined) {
    return problem(
      "unknown-table",
      `{{q:${ref}}} names table '${tableRef}', which is not in web/data/experiment-facts.json. ` +
        `Available: ${Object.keys(sources.tables).join(", ")}`,
    );
  }
  const table = sources.tables[tableName] as FactTable;

  // `.min` / `.max` reduce the column instead of selecting a row: "between 0.90x and 1.23x" is a
  // claim about the whole sweep, and spelling it as two hand-picked rows would rot the moment the
  // sweep changed.
  if (suffix === "min" || suffix === "max") {
    const finite: number[] = [];
    for (const row of table.rows) {
      const cell = row[columnRaw];
      if (cell !== undefined && Number.isFinite(cell)) {
        finite.push(cell);
      }
    }
    if (finite.length === 0) {
      return problem(
        "empty-column",
        `{{q:${ref}}} has no finite values in column '${columnRaw}'. Available columns: ` +
          `${columnsOf(table).join(", ")}`,
      );
    }
    const reduced = suffix === "min" ? Math.min(...finite) : Math.max(...finite);
    return value(formatQuantity(columnRaw, reduced));
  }

  const selected = selectRow(ref, table, tableName, tableRef, axisKey, axisValue, rowIndex);
  if (selected.kind === "problem") {
    return selected;
  }
  const row = selected.row;

  let column = columnRaw;
  if (suffix !== undefined) {
    column = `${column}_sd`;
  }
  const cell = row[column];
  if (cell === undefined) {
    return problem(
      "unknown-column",
      `{{q:${ref}}} has no column '${column}' in '${tableName}'. Available: ` +
        `${columnsOf(table).join(", ")}`,
    );
  }
  if (!Number.isFinite(cell)) {
    return rejectNonFinite(ref, cell);
  }
  return value(formatQuantity(column, cell));
}

type RowSelection =
  | { readonly kind: "row"; readonly row: Readonly<Record<string, number>> }
  | { readonly kind: "problem"; readonly problem: QuantityProblem };

function selectRow(
  ref: string,
  table: FactTable,
  tableName: string,
  tableRef: string,
  axisKey: string | undefined,
  axisValue: string | undefined,
  rowIndex: string | undefined,
): RowSelection {
  if (axisKey !== undefined && axisValue !== undefined) {
    const key = axisKey === "@axis" ? table.axis : axisKey;
    const wanted = Number(axisValue);
    const present: string[] = [];
    let found: Readonly<Record<string, number>> | undefined;
    for (const row of table.rows) {
      const cell = row[key];
      if (cell === undefined) {
        continue;
      }
      present.push(String(cell));
      // Tolerant compare, because the axis values are floats written by the measurement script
      // and the reference is written by hand: 0.8 in YAML and 0.8 in prose are not obliged to be
      // the same double.
      if (found === undefined && Math.abs(cell - wanted) < 1e-9) {
        found = row;
      }
    }
    if (found !== undefined) {
      return { kind: "row", row: found };
    }
    // No row has the key at all, which is a misspelled axis rather than a missing value. Saying
    // "Available: , , , " here — which is what listing the absent cells produced — is how a
    // misspelling survives review.
    if (present.length === 0) {
      return {
        kind: "problem",
        problem: {
          rule: "unknown-axis",
          message:
            `{{q:${ref}}} selects on '${key}', which is not a column of '${tableName}'. ` +
            `Available: ${columnsOf(table).join(", ")}`,
        },
      };
    }
    return {
      kind: "problem",
      problem: {
        rule: "no-such-row",
        message: `{{q:${ref}}} found no row with ${key}=${axisValue}. Available: ${present.join(", ")}`,
      },
    };
  }

  if (rowIndex !== undefined) {
    let row: Readonly<Record<string, number>> | undefined;
    if (rowIndex === "first") {
      row = table.rows[0];
    } else if (rowIndex === "last") {
      row = table.rows[table.rows.length - 1];
    } else {
      row = table.rows[Number(rowIndex)];
    }
    if (row === undefined) {
      return {
        kind: "problem",
        problem: {
          rule: "row-out-of-range",
          message: `{{q:${ref}}} row index ${rowIndex} is out of range (${table.rows.length} rows)`,
        },
      };
    }
    return { kind: "row", row };
  }

  const only = table.rows[0];
  if (table.rows.length !== 1 || only === undefined) {
    return {
      kind: "problem",
      problem: {
        rule: "no-row-selector",
        message:
          `{{q:${ref}}} has no row selector, but '${tableName}' has ${table.rows.length} rows. ` +
          `Use ${tableRef}[${table.axis}=…] or ${tableRef}@index`,
      },
    };
  }
  return { kind: "row", row: only };
}
