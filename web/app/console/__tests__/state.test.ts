import { describe, expect, it } from "vitest";
import { AXES, AXIS_ORDER, type AxisKey } from "../../../engine/job/axes.js";
import { COLUMNS } from "../../../engine/job/columns.js";
import type { ColumnKey } from "../../../engine/job/columns.js";
import { configForCell, type SweepJob } from "../../../engine/job/spec.js";
import { ContractError } from "../../../engine/core/errors.js";
import {
  CROWD_MODEL_ORDER,
  type CrowdModelKey,
  type RunConfig,
} from "../../../engine/contracts/config.js";
import {
  DEFAULT_SETTINGS,
  jobForPreview,
  jobForRun,
  makeConsoleSettings,
  measurementParamsFor,
  type ConsoleSettings,
} from "../state.js";

/** Reads a dotted config path, so a test can use an axis's declared `writes` as data. */
function readNumberAt(config: RunConfig, path: string): number {
  const parts = path.split(".");
  let cursor: unknown = config;
  for (const part of parts) {
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor as number;
}

function withAxis(
  settings: ConsoleSettings,
  key: "crowdSize" | "robotSpeed",
  value: number,
): ConsoleSettings {
  const axisValues = { ...settings.axisValues };
  axisValues[key] = value;
  return makeConsoleSettings({ ...settings, axisValues });
}

function COLUMN_NEEDS_FOR(key: ColumnKey): string {
  return COLUMNS[key].needs;
}

/** Whether a job's own `columns` includes the one column that needs the zero-effect reference
 *  run (`forecastZeroM`), so a test can check that "bought the run" and "reports its column"
 *  cannot come apart. */
function hasZeroRunColumn(job: SweepJob): boolean {
  for (const key of job.columns) {
    if (COLUMN_NEEDS_FOR(key) === "zeroRun") {
      return true;
    }
  }
  return false;
}

describe("console settings", () => {
  it("starts every knob where the catalogue says", () => {
    for (const key of AXIS_ORDER) {
      expect(DEFAULT_SETTINGS.axisValues[key]).toBe(AXES[key].defaultValue);
    }
  });

  it("forecasts over three seconds and reads at step 200 by default", () => {
    // The console's central argument: at a 16-step horizon the forecaster reads 0.0262 m on a
    // robot-blind run against a band of 0.3106 m, twelve times below the noise floor, and the
    // page would ship refuted by its own default state.
    const params = measurementParamsFor(DEFAULT_SETTINGS);
    expect(params.forecastHorizonSteps).toBe(60);
    expect(params.forecastEndStep).toBe(200);
  });

  it("rejects an axis value outside the range the catalogue allows", () => {
    expect(() => withAxis(DEFAULT_SETTINGS, "crowdSize", AXES.crowdSize.max + 1)).toThrow(
      /at most/,
    );
    expect(() => withAxis(DEFAULT_SETTINGS, "crowdSize", AXES.crowdSize.min - 1)).toThrow(
      /at least/,
    );
  });

  it("rejects a sweep axis that is not a member of the catalogue", () => {
    // A permalink is decoded from a stranger's query string, so nothing stops it from naming an
    // axis key that does not exist. Without a guard, indexing AXES with it returns undefined and
    // the next line throws a raw TypeError instead of the ContractError this file promises.
    expect(() =>
      makeConsoleSettings({
        ...DEFAULT_SETTINGS,
        sweepAxis: "notAnAxis" as unknown as AxisKey,
        sweepValues: [1, 2],
      }),
    ).toThrow(ContractError);
    expect(() =>
      makeConsoleSettings({
        ...DEFAULT_SETTINGS,
        sweepAxis: "notAnAxis" as unknown as AxisKey,
        sweepValues: [1, 2],
      }),
    ).toThrow(/catalogue/);
  });

  it("opens on the crowd every recorded measurement was taken on", () => {
    expect(DEFAULT_SETTINGS.crowdModel).toBe(CROWD_MODEL_ORDER[0]);
  });

  it("carries the picked crowd into every config a run is built from", () => {
    // The choice is not an axis, so nothing in `AXES` writes it: `baseOverridesFor` is the only
    // path it can travel, and a crowd that stopped at the settings object would leave every cell of
    // a sweep running the other one.
    const second = CROWD_MODEL_ORDER[1] as CrowdModelKey;
    const swept = makeConsoleSettings({
      ...DEFAULT_SETTINGS,
      crowdModel: second,
      sweepAxis: "crowdSize",
      sweepValues: [4, 18, 44],
      seedCount: 2,
    });
    expect(configForCell(jobForPreview(swept), 0, 0).crowdModel).toBe(second);
    const run = jobForRun(swept);
    for (let cell = 0; cell < run.axisValues.length; cell++) {
      for (let seed = 0; seed < run.seedIndices.length; seed++) {
        expect(configForCell(run, cell, seed).crowdModel).toBe(second);
      }
    }
    // And the default settings still build the first crowd, so nothing already recorded moved.
    expect(configForCell(jobForRun(DEFAULT_SETTINGS), 0, 0).crowdModel).toBe(CROWD_MODEL_ORDER[0]);
  });

  it("rejects a crowd this bench cannot run", () => {
    // Same reason the sweep axis is checked: a permalink is decoded from a stranger's query string,
    // and a closed union is only closed if something refuses what is not in it.
    expect(() =>
      makeConsoleSettings({
        ...DEFAULT_SETTINGS,
        crowdModel: "aCrowdNobodyWrote" as unknown as CrowdModelKey,
      }),
    ).toThrow(ContractError);
    expect(() =>
      makeConsoleSettings({
        ...DEFAULT_SETTINGS,
        crowdModel: "aCrowdNobodyWrote" as unknown as CrowdModelKey,
      }),
    ).toThrow(/crowd/);
  });

  it("rejects a sweep whose shape is impossible", () => {
    expect(() =>
      makeConsoleSettings({ ...DEFAULT_SETTINGS, sweepAxis: null, sweepValues: [4, 8] }),
    ).toThrow(/Nothing is being varied/);
    expect(() =>
      makeConsoleSettings({ ...DEFAULT_SETTINGS, sweepAxis: "crowdSize", sweepValues: [] }),
    ).toThrow(/needs at least one value/);
    expect(() =>
      makeConsoleSettings({ ...DEFAULT_SETTINGS, sweepAxis: "crowdSize", sweepValues: [18, 4] }),
    ).toThrow(/must climb/);
    expect(() =>
      makeConsoleSettings({ ...DEFAULT_SETTINGS, sweepAxis: "crowdSize", sweepValues: [4, 4] }),
    ).toThrow(/must climb/);
  });

  it("rejects settings that cannot produce what they promise", () => {
    expect(() => makeConsoleSettings({ ...DEFAULT_SETTINGS, seedCount: 0 })).toThrow(
      /number of seeds/,
    );
    // A band is a quantile over pairwise comparisons; one replicate has no pair.
    expect(() => makeConsoleSettings({ ...DEFAULT_SETTINGS, bandReplicates: 1 })).toThrow(
      /nothing to compare against/,
    );
    expect(() => makeConsoleSettings({ ...DEFAULT_SETTINGS, nearMissThresholdM: 0 })).toThrow(
      /near-miss line/,
    );
    expect(() => makeConsoleSettings({ ...DEFAULT_SETTINGS, recoveryDwellSteps: 0 })).toThrow(
      /recovery dwell/,
    );
  });
});

describe("the live preview", () => {
  it("is one run at the settings now in the panel, never cell zero of the sweep", () => {
    const atEighteen = withAxis(DEFAULT_SETTINGS, "crowdSize", 18);
    const swept = makeConsoleSettings({
      ...atEighteen,
      sweepAxis: "crowdSize",
      sweepValues: [4, 8, 12, 18, 24, 32, 44],
    });
    const preview = jobForPreview(swept);
    expect(preview.axis).toBe(null);
    expect(preview.seedIndices.length).toBe(1);
    expect(preview.axisValues.length).toBe(1);

    const path = AXES.crowdSize.writes[0] as string;
    const previewConfig = configForCell(preview, 0, 0);
    expect(readNumberAt(previewConfig, path)).toBe(18);

    // The sweep's own cell zero is 4 people, which is the number the panel is NOT showing.
    const run = jobForRun(swept);
    expect(readNumberAt(configForCell(run, 0, 0), path)).toBe(4);
  });

  it("buys the zero-effect reference run and does not buy the band", () => {
    const preview = jobForPreview(DEFAULT_SETTINGS);
    // Without this, headline two reads "not applicable" on first load and the console's central
    // argument is dead before the operator touches anything. One extra paired run, 38 ms.
    expect(preview.zeroReferenceRun).toBe(true);
    // 267 ms cannot be live at every input event.
    expect(preview.bandReplicates).toBe(null);
    expect(preview.floor).toBe(null);
    expect(preview.frechet).toBe(false);
  });

  it("never buys the zero-effect reference run without reporting its column, or the reverse", () => {
    // The panel's own toggle is off here. The preview still overrides it, because a preview that
    // respected the toggle would go back to reading "not applicable" the moment an operator
    // switched the zero reference off, which is the same dead-on-load failure the previous test
    // guards against. What this test adds is the other half: the job must not pay for a run it
    // then fails to report, which is exactly what happened when `columnsFor` read
    // `settings.withZeroReference` directly instead of the caller's own decision.
    const off = makeConsoleSettings({ ...DEFAULT_SETTINGS, withZeroReference: false });

    const preview = jobForPreview(off);
    expect(preview.zeroReferenceRun).toBe(true);
    expect(hasZeroRunColumn(preview)).toBe(true);

    const run = jobForRun(off);
    expect(run.zeroReferenceRun).toBe(false);
    expect(hasZeroRunColumn(run)).toBe(false);
  });
});

describe("the run job", () => {
  it("honours the sliders that are not being swept", () => {
    const fast = withAxis(DEFAULT_SETTINGS, "robotSpeed", AXES.robotSpeed.max);
    const swept = makeConsoleSettings({
      ...fast,
      sweepAxis: "crowdSize",
      sweepValues: [4, 18, 44],
      seedCount: 2,
    });
    const job = jobForRun(swept);
    const speedPath = AXES.robotSpeed.writes[0] as string;
    const peoplePath = AXES.crowdSize.writes[0] as string;

    expect(readNumberAt(configForCell(job, 2, 1), speedPath)).toBe(AXES.robotSpeed.max);
    expect(readNumberAt(configForCell(job, 2, 1), peoplePath)).toBe(44);
  });

  it("counts its seeds by listing them, never by holding a number", () => {
    const job = jobForRun(makeConsoleSettings({ ...DEFAULT_SETTINGS, seedCount: 8 }));
    expect(job.seedIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("does not report a column it did not buy", () => {
    const plain = jobForRun(
      makeConsoleSettings({
        ...DEFAULT_SETTINGS,
        bandReplicates: 0,
        withFloor: false,
        withFrechet: false,
      }),
    );
    for (const key of plain.columns) {
      expect(["run", "zeroRun"]).toContain(COLUMN_NEEDS_FOR(key));
    }
  });
});

// A "the stale-ledger notice" suite used to live here, against this file's own `RunGroup`,
// `ConsoleState`, `sameSettings`, `STALE_LEDGER_NOTICE` and `ledgerIsStale` — a differently-shaped,
// unused scaffolding for the same concept Task 28 built for real in `web/app/console/table.ts`
// (`settingsMatchJob`, `STALE_MESSAGE`) against `group.ts`'s own `RunGroup`. See the removal note
// left in state.ts itself.
