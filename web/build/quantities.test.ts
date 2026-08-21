import { describe, expect, it } from "vitest";
import MEASURED from "../data/experiment-facts.json";
import {
  collectQuantityWidgets,
  formatQuantity,
  resolveQuantity,
  type FactTable,
  type LiveMetric,
  type QuantitySources,
} from "./quantities.js";

/**
 * A stand-in for web/data/experiment-facts.json, small enough to read and shaped exactly like it:
 * an axis column, a measured column, its `_sd` companion, a seconds column and a count column, so
 * every formatting branch has something to select.
 */
const TABLES: Readonly<Record<string, FactTable>> = {
  e2_density: {
    axis: "nPedestrians",
    nSeeds: 8,
    rows: [
      { nPedestrians: 4, meanDeviationM: 0.104, meanDeviationM_sd: 0.011, robotArrivalS: 12.5, nPeople: 4 },
      { nPedestrians: 12, meanDeviationM: 0.276, meanDeviationM_sd: 0.032, robotArrivalS: 13.254, nPeople: 11.5 },
      { nPedestrians: 44, meanDeviationM: 0.981, meanDeviationM_sd: 0.09, robotArrivalS: 15.5, nPeople: 44 },
    ],
  },
  one_split: {
    axis: "horizonS",
    nSeeds: 4,
    rows: [{ horizonS: 1, reportsM: 0.5, reportsOverFloor: 2.25 }],
  },
  censored: {
    axis: "x",
    nSeeds: 1,
    rows: [{ x: 1, valueM: Number.NaN }],
  },
};

const LIVE: Readonly<Record<string, LiveMetric>> = {
  deviation: { headlineM: 0.317, fieldsM: { mean: 0.317, max: 1.42 } },
  "detection-floor": { headlineM: 1.2, fieldsM: { floor: 1.2 } },
  unmeasurable: { headlineM: Number.NaN, fieldsM: {} },
};

const WIDGETS = new Map<string, string>([
  ["worked", "deviation"],
  ["the-floor", "detection-floor"],
  ["cracked", "unmeasurable"],
  ["ghost", "a-metric-nobody-computes"],
]);

const SOURCES: QuantitySources = { tables: TABLES, live: LIVE, widgetMetrics: WIDGETS };

function textOf(reference: string): string {
  const resolved = resolveQuantity(reference, SOURCES);
  if (resolved.kind === "problem") {
    throw new Error(`expected ${reference} to resolve, got: ${resolved.problem.message}`);
  }
  return resolved.text;
}

function problemOf(reference: string) {
  const resolved = resolveQuantity(reference, SOURCES);
  if (resolved.kind === "value") {
    throw new Error(`expected ${reference} to fail, got: ${resolved.text}`);
  }
  return resolved.problem;
}

describe("every reference syntax the pages actually use", () => {
  // Each of these spellings appears in web/notes today. A refactor that quietly dropped one would
  // not fail the build — it would resolve to a "?" span on a page nobody re-read.
  it("selects a row by its axis value", () => {
    expect(textOf("e2_density[nPedestrians=12].meanDeviationM")).toBe("0.276 m");
  });

  it("accepts the short table alias", () => {
    expect(textOf("e2[nPedestrians=12].meanDeviationM")).toBe("0.276 m");
  });

  it("selects a row by index", () => {
    expect(textOf("e2_density@1.meanDeviationM")).toBe("0.276 m");
  });

  it("selects the first and last rows by name", () => {
    // @first and @last exist so a sweep can grow a row without rotting the sentence that quotes
    // its ends. An index would have had to be edited.
    expect(textOf("e2_density@first.meanDeviationM")).toBe("0.104 m");
    expect(textOf("e2_density@last.meanDeviationM")).toBe("0.981 m");
  });

  it("reads the spread across seeds with .sd", () => {
    expect(textOf("e2_density[nPedestrians=12].meanDeviationM.sd")).toBe("0.032 m");
  });

  it("reduces a whole column with .min and .max", () => {
    // A claim about the whole sweep, spelled as a claim about the whole sweep. Written as two
    // hand-picked rows it would go stale the first time the sweep changed shape.
    expect(textOf("e2_density.meanDeviationM.min")).toBe("0.104 m");
    expect(textOf("e2_density.meanDeviationM.max")).toBe("0.981 m");
  });

  it("accepts the column@value ordering prose prefers", () => {
    // Normalised into the bracket form rather than rejected: three spellings were invented
    // independently across sixteen pages, and this one reads better inside a sentence.
    expect(textOf("e2_density.meanDeviationM@12")).toBe("0.276 m");
  });

  it("needs no selector when the table has exactly one row", () => {
    expect(textOf("one_split.reportsM")).toBe("0.500 m");
  });

  it("carries the unit in the column-name suffix", () => {
    expect(textOf("e2_density[nPedestrians=44].robotArrivalS")).toBe("15.50 s");
    expect(textOf("one_split.reportsOverFloor")).toBe("2.250");
  });

  it("prints a whole count without a decimal point and an averaged one with", () => {
    // "224.0 people" reads wrong; rounding a per-seed mean to "224" overstates the precision.
    expect(textOf("e2_density@0.nPeople")).toBe("4");
    expect(textOf("e2_density@1.nPeople")).toBe("11.5");
  });
});

describe("what a broken reference says, which is the whole point of resolving at build time", () => {
  // Forty references were silently unresolvable before these failures existed. What turned them
  // into forty fixable ones was not that the build stopped — it was that each message named what
  // was there instead. Every test below asserts on that naming, not on the rejection.
  it("names the tables that do exist when the table does not", () => {
    const problem = problemOf("e9_nonexistent.meanDeviationM");
    expect(problem.rule).toBe("unknown-table");
    expect(problem.message).toContain("e2_density");
    expect(problem.message).toContain("one_split");
  });

  it("names the columns that do exist when the column does not", () => {
    const problem = problemOf("e2_density@0.meanDisplacementM");
    expect(problem.rule).toBe("unknown-column");
    expect(problem.message).toContain("meanDeviationM");
    expect(problem.message).toContain("robotArrivalS");
  });

  it("names how many rows there are when the index is out of range", () => {
    const problem = problemOf("e2_density@9.meanDeviationM");
    expect(problem.rule).toBe("row-out-of-range");
    expect(problem.message).toContain("3 rows");
  });

  it("names the axis values that do exist when the one asked for does not", () => {
    // The commonest of the forty: a sweep is re-measured on a coarser grid and every sentence
    // quoting a value that is no longer on it needs to move to a neighbouring one.
    const problem = problemOf("e2_density[nPedestrians=7].meanDeviationM");
    expect(problem.rule).toBe("no-such-row");
    expect(problem.message).toContain("4, 12, 44");
  });

  it("names the columns when the axis itself is misspelled", () => {
    // Listing the absent cells produced "Available: , , ," here, which is how a misspelled axis
    // survives review: the message looked like a missing value rather than a missing column.
    const problem = problemOf("e2_density[nPedestrian=4].meanDeviationM");
    expect(problem.rule).toBe("unknown-axis");
    expect(problem.message).toContain("nPedestrians");
    expect(problem.message).not.toContain("Available: ,");
  });

  it("names both selector spellings when a multi-row table is given none", () => {
    const problem = problemOf("e2_density.meanDeviationM");
    expect(problem.rule).toBe("no-row-selector");
    expect(problem.message).toContain("e2_density[nPedestrians=");
    expect(problem.message).toContain("e2_density@index");
  });

  it("points at the syntax reference when the reference is not a reference", () => {
    const problem = problemOf("e2_density{nPedestrians:4}");
    expect(problem.rule).toBe("bad-syntax");
    expect(problem.message).toContain("docs/teaching/authoring.md");
  });

  it("treats a bare word that names no widget as a syntax error, not a blank", () => {
    // A mistyped widget id must not fall through to nothing. Before the build resolved these, an
    // unknown id rendered as an empty span in the middle of a sentence.
    expect(problemOf("worked-out").rule).toBe("bad-syntax");
  });
});

describe("a value that is not a number", () => {
  it("rejects a censored cell rather than printing NaN into the prose", () => {
    // The failure this guards is specific and it is ugly: "the crowd moved NaN m" reads as a
    // rendering glitch rather than as a missing measurement, so it gets ignored rather than fixed.
    const problem = problemOf("censored.valueM");
    expect(problem.rule).toBe("non-finite");
    expect(problem.message).toContain("censored for this row");
  });

  it("rejects a column reduction with nothing finite in it, and says what is there", () => {
    const problem = problemOf("censored.valueM.max");
    expect(problem.rule).toBe("empty-column");
    expect(problem.message).toContain("valueM");
  });

  it("rejects a live metric that came out non-finite", () => {
    expect(problemOf("cracked").rule).toBe("non-finite");
    expect(problemOf("cracked.anchor").rule).toBe("non-finite");
  });
});

describe("live widget references", () => {
  it("resolves a widget's headline value", () => {
    expect(textOf("worked")).toBe("0.317 m");
  });

  it("resolves a named field", () => {
    expect(textOf("worked.max")).toBe("1.420 m");
  });

  it("names the fields the metric does provide when asked for one it does not", () => {
    const problem = problemOf("worked.median");
    expect(problem.rule).toBe("unknown-widget-field");
    expect(problem.message).toContain("default, mean, max, anchor");
  });

  it("names the metrics that have build-time values when the widget's does not", () => {
    // A widget can render a metric the build cannot precompute. Then the no-JavaScript reader
    // gets a hole in a sentence, so it fails, and the message says which metrics are safe.
    const problem = problemOf("ghost");
    expect(problem.rule).toBe("unknown-widget-metric");
    expect(problem.message).toContain("deviation");
    expect(problem.message).toContain("detection-floor");
  });
});

describe("{{q:…anchor}}, the sanctioned escape from the comparative lint", () => {
  // docs/teaching/authoring.md has documented this field since the lint was written, and until
  // now it did not exist: every page that followed the documentation got a build error, and the
  // only way past the comparative lint was to delete the comparison. That is the failure here.
  it("gives the body-scale phrase for the widget's live value", () => {
    expect(textOf("worked.anchor")).toBe("half a stride");
  });

  it("moves with the number, which is the property that makes it safe", () => {
    // The lint bans "which is more than a stride" next to a live number because a control can
    // falsify it. The anchor is allowed precisely because it is derived from that same number, so
    // a different metric gets a different phrase without anyone editing prose.
    expect(textOf("the-floor.anchor")).toBe("the width of a doorway");
    expect(textOf("the-floor")).toBe("1.200 m");
  });

  it("is offered in the error message, so an author who guesses wrong is told it exists", () => {
    expect(problemOf("worked.scale").message).toContain("anchor");
  });
});

describe("collecting the widgets a page declares", () => {
  it("maps a quantity block's id to its metric", () => {
    const body = "Prose.\n\n```mirn:quantity\nid: worked\nmetric: deviation\n```\n\nMore prose.\n";
    expect(collectQuantityWidgets(body).get("worked")).toBe("deviation");
  });

  it("ignores blocks that are not quantity blocks", () => {
    const body = "```mirn:scene\nid: ghost-reveal\npreset: corridor-11\n```\n";
    expect(collectQuantityWidgets(body).size).toBe(0);
  });

  it("skips a malformed block instead of throwing", () => {
    // The renderer parses the same block a moment later and fails the build there, with the
    // parser's own message. Throwing here would report it twice, or worse, first.
    const body = "```mirn:quantity\nid: [unclosed\n```\n";
    expect(() => collectQuantityWidgets(body)).not.toThrow();
    expect(collectQuantityWidgets(body).size).toBe(0);
  });
});

/**
 * The one place the REAL measured file is read, on purpose. Everything above runs on the fixture,
 * because the resolver's behaviour should not depend on what the last measurement happened to
 * produce. This block asserts the opposite kind of thing: that the generated file cannot make the
 * provenance panel say something untrue.
 */
describe("the measured file's own counts", () => {
  const tables = MEASURED as unknown as Record<
    string,
    { axis: string; nSeeds: number; rows: Record<string, number | null>[] }
  >;

  it("never reports a column averaged over more runs than the table says it did", () => {
    // The panel a reader opens under a cited number says "averaged over n of N runs because the
    // rest were censored" when n is below the table's declared run count, and "averaged over N
    // runs" otherwise. So a column count ABOVE the declared count does not read as a
    // contradiction — it silently prints the declared one, which is then the wrong number in a
    // sentence whose only job is to say where the figure came from. That is the shape of the
    // fault this file already had once: the propagation table pooled sixteen runs and declared
    // eight.
    const offenders: string[] = [];
    for (const [tableName, table] of Object.entries(tables)) {
      for (const row of table.rows) {
        for (const columnName of Object.keys(row)) {
          if (!columnName.endsWith("_n")) {
            continue;
          }
          const count = row[columnName];
          const declared = table.nSeeds;
          if (typeof count !== "number" || !Number.isInteger(count)) {
            offenders.push(`${tableName}.${columnName} is ${String(count)}, not a whole count`);
          } else if (count < 0 || count > declared) {
            offenders.push(`${tableName}.${columnName} = ${count}, outside 0..${declared}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("declares a run count on every table, so no panel can quote an absent one", () => {
    const offenders: string[] = [];
    for (const [tableName, table] of Object.entries(tables)) {
      if (!Number.isInteger(table.nSeeds) || table.nSeeds < 1) {
        offenders.push(`${tableName} declares nSeeds ${String(table.nSeeds)}`);
      }
      if (table.rows.length === 0) {
        offenders.push(`${tableName} has no rows`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("formatQuantity", () => {
  it("gives metres three decimals and seconds two", () => {
    // Not decoration: three decimals on a metre is a millimetre, which is the resolution the
    // simulator actually has, and two on a second is one twentieth of a step.
    expect(formatQuantity("meanDeviationM", 0.1)).toBe("0.100 m");
    expect(formatQuantity("meanDeviationM_sd", 0.1)).toBe("0.100 m");
    expect(formatQuantity("robotArrivalS", 12)).toBe("12.00 s");
    expect(formatQuantity("ratioToFloor", 2)).toBe("2.000");
  });
});
