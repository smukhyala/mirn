import { describe, expect, it } from "vitest";
import { AXES, AXIS_ORDER } from "../../../engine/job/axes.js";
import { COLUMNS } from "../../../engine/job/columns.js";
import type { ColumnKey } from "../../../engine/job/columns.js";
import { configForCell } from "../../../engine/job/spec.js";
import { ContractError } from "../../../engine/core/errors.js";
import type { RunConfig } from "../../../engine/contracts/config.js";
import {
  DEFAULT_SETTINGS,
  STALE_LEDGER_NOTICE,
  jobForPreview,
  jobForRun,
  ledgerIsStale,
  makeConsoleSettings,
  measurementParamsFor,
  sameSettings,
  type ConsoleSettings,
  type ConsoleState,
  type RunGroup,
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
      ContractError,
    );
    expect(() => withAxis(DEFAULT_SETTINGS, "crowdSize", AXES.crowdSize.min - 1)).toThrow(
      ContractError,
    );
  });

  it("rejects a sweep whose shape is impossible", () => {
    expect(() =>
      makeConsoleSettings({ ...DEFAULT_SETTINGS, sweepAxis: null, sweepValues: [4, 8] }),
    ).toThrow(ContractError);
    expect(() =>
      makeConsoleSettings({ ...DEFAULT_SETTINGS, sweepAxis: "crowdSize", sweepValues: [] }),
    ).toThrow(ContractError);
    expect(() =>
      makeConsoleSettings({ ...DEFAULT_SETTINGS, sweepAxis: "crowdSize", sweepValues: [18, 4] }),
    ).toThrow(ContractError);
    expect(() =>
      makeConsoleSettings({ ...DEFAULT_SETTINGS, sweepAxis: "crowdSize", sweepValues: [4, 4] }),
    ).toThrow(ContractError);
  });

  it("rejects counts that cannot produce what they promise", () => {
    expect(() => makeConsoleSettings({ ...DEFAULT_SETTINGS, seedCount: 0 })).toThrow(ContractError);
    // A band is a quantile over pairwise comparisons; one replicate has no pair.
    expect(() => makeConsoleSettings({ ...DEFAULT_SETTINGS, bandReplicates: 1 })).toThrow(
      ContractError,
    );
    expect(() => makeConsoleSettings({ ...DEFAULT_SETTINGS, nearMissThresholdM: 0 })).toThrow(
      ContractError,
    );
    expect(() => makeConsoleSettings({ ...DEFAULT_SETTINGS, recoveryDwellSteps: 0 })).toThrow(
      ContractError,
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

describe("the stale-ledger notice", () => {
  const group: RunGroup = {
    kind: "runGroup",
    groupId: "g1",
    label: "people sweep",
    settings: DEFAULT_SETTINGS,
    job: jobForRun(DEFAULT_SETTINGS),
    rows: [],
    bands: [],
  };

  it("is quiet while the panel still matches the selected row", () => {
    const state: ConsoleState = {
      kind: "consoleState",
      settings: DEFAULT_SETTINGS,
      groups: [group],
      ui: {
        kind: "consoleUi",
        selected: { kind: "cellRef", groupId: "g1", axisIndex: 0, seedIndex: 0 },
        pinned: [],
        visibleColumns: [],
        playing: true,
        sample: 0,
        running: false,
        progress: null,
      },
    };
    expect(ledgerIsStale(state)).toBe(false);
  });

  it("speaks the moment one knob moves", () => {
    const moved = withAxis(DEFAULT_SETTINGS, "crowdSize", AXES.crowdSize.max);
    const state: ConsoleState = {
      kind: "consoleState",
      settings: moved,
      groups: [group],
      ui: {
        kind: "consoleUi",
        selected: { kind: "cellRef", groupId: "g1", axisIndex: 0, seedIndex: 0 },
        pinned: [],
        visibleColumns: [],
        playing: true,
        sample: 0,
        running: false,
        progress: null,
      },
    };
    expect(sameSettings(DEFAULT_SETTINGS, moved)).toBe(false);
    expect(ledgerIsStale(state)).toBe(true);
    expect(STALE_LEDGER_NOTICE).toBe(
      "these numbers were measured at the settings in the link, not the ones now in the panel.",
    );
  });
});
