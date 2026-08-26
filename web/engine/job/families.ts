import { fail } from "../core/errors.js";
import { COLUMNS, type ColumnKey, type UnitKey } from "./columns.js";

/**
 * The four method families, closed.
 *
 * A stranger arrives describing a disturbance metric they have written. Nothing of theirs is read
 * in — no file, no function, no dataset — and this table is the reason that restriction costs
 * nothing worth having. A described method is mapped onto one of four families, and MIRN then runs
 * its OWN estimator on its OWN world and reports its OWN number. What leaves the site is a claim
 * about a shape of measurement, never about anybody's robot.
 *
 * A closed catalogue is not a registry. There is no `register` function, nothing is added at
 * runtime, and a family cannot be built from a description supplied by a caller. It is a table so
 * a test can iterate it and prove the set is total, which is the opposite of an extension point.
 *
 * The mapping is many-to-few and every surface that shows it has to say so. A learned trajectory
 * predictor and a hand-specified intended path both land on the forecast family, because a
 * straight-line guess is the forecaster this simulator can actually run. A reader who leaves
 * believing their learned predictor was simulated has been misled, and that would be worse than
 * the page not existing.
 *
 * Every sentence below was written after `familyProbe.slow.test.ts` was run, not before. The one
 * claim about a measurement that appears in this file — that an absolute quantity clears the
 * run-to-run band on every seed — is pinned by that test, so it cannot quietly stop being true.
 */

export type FamilyKey =
  | "pairedShared"
  | "unpairedSeparate"
  | "forecastCounterfactual"
  | "noCounterfactual";

/**
 * How the family's number is produced, as data.
 *
 * An explicit `kind` on every variant, never type sniffing: the probe switches on it once and a
 * new variant is then a compile error at that switch rather than a silent fall-through to
 * whichever branch happened to be last.
 */
export type FamilyRuler =
  /** Both arms of one paired run: same seed, same starting state, same exogenous noise. */
  | { readonly kind: "sharedNoiseTwin" }
  /**
   * The same estimator, handed a comparison run from a different seed.
   *
   * `controlSeedOffset` is added to the run's own seed. It must not be zero: a zero offset would
   * hand the estimator its own twin back and this family would silently become the paired one,
   * reading exactly nought and looking like the thing it exists to contrast with.
   */
  | { readonly kind: "separateRunTwin"; readonly controlSeedOffset: number }
  /**
   * A constant-velocity forecast: fit a velocity, roll it forward `horizonSteps`, and score the
   * error at `endStep` as if it were the robot's doing.
   *
   * Both numbers are the console's own default ruler, and `families.test.ts` asserts they still
   * are. They change the size of the answer without changing the room, so a family measured at
   * one ruler and rendered beside a console set to another would be comparing two things.
   */
  | {
      readonly kind: "straightLineForecast";
      readonly horizonSteps: number;
      readonly endStep: number;
    }
  /**
   * One absolute readout, taken straight from the column catalogue.
   *
   * Reading it through `COLUMNS` rather than recomputing it here is deliberate: the number this
   * family is scored on is then bit-for-bit the number the console's own tile prints, including
   * its availability and its reason for being unavailable. A reimplementation would be a second
   * definition of the same quantity with nothing checking that the two agree.
   *
   * The column must be one a real corridor could produce. `unpaired.test.ts` proves which those
   * are by swapping the control arm for a decoy and watching which readings move, and
   * `makeMethodFamily` refuses any other — an absolute family that secretly read the run without
   * the robot would be the paired family wearing a different label.
   */
  | { readonly kind: "absoluteReadout"; readonly column: ColumnKey };

export interface MethodFamily {
  readonly kind: "methodFamily";
  readonly key: FamilyKey;
  /** Plain English, shown as the verdict's heading. Never a setting name, never a formula. */
  readonly name: string;
  /** What a method of this shape does, in the reader's words rather than the code's. */
  readonly whatItIs: string;
  /** What it inherits by being that shape. One or two sentences a non-specialist reads. */
  readonly confound: string;
  /** The unit its reading carries. A test checks this against the column for absolute readouts. */
  readonly unit: UnitKey;
  readonly ruler: FamilyRuler;
}

export function makeMethodFamily(init: {
  readonly key: FamilyKey;
  readonly name: string;
  readonly whatItIs: string;
  readonly confound: string;
  readonly unit: UnitKey;
  readonly ruler: FamilyRuler;
}): MethodFamily {
  if (init.name.length < 10) {
    fail(`a family's name must be a readable phrase, got '${init.name}'`);
  }
  if (init.whatItIs.length < 40) {
    fail(`family '${init.key}' needs a description a beginner can read, got '${init.whatItIs}'`);
  }
  if (init.confound.length < 40) {
    fail(
      `family '${init.key}' must state what it inherits; a family with no confound stated is the ` +
        `error this whole card exists to teach against, got '${init.confound}'`,
    );
  }
  const ruler = init.ruler;
  if (ruler.kind === "separateRunTwin") {
    if (!Number.isInteger(ruler.controlSeedOffset) || ruler.controlSeedOffset === 0) {
      fail(
        `family '${init.key}' compares against a run from a different seed, so its seed offset ` +
          `must be a non-zero integer; an offset of zero hands the estimator its own twin back ` +
          `and this family silently becomes the paired one. Got ${ruler.controlSeedOffset}`,
      );
    }
  } else if (ruler.kind === "straightLineForecast") {
    if (!Number.isInteger(ruler.horizonSteps) || ruler.horizonSteps < 1) {
      fail(
        `family '${init.key}' forecasts over ${ruler.horizonSteps} steps; it must be a positive ` +
          `integer`,
      );
    }
    if (!Number.isInteger(ruler.endStep) || ruler.endStep <= ruler.horizonSteps) {
      fail(
        `family '${init.key}' checks its forecast at step ${ruler.endStep} having rolled it ` +
          `forward ${ruler.horizonSteps} steps; the checked instant must be an integer later ` +
          `than the horizon or there is no room to fit a velocity before it`,
      );
    }
  } else if (ruler.kind === "absoluteReadout") {
    const column = COLUMNS[ruler.column];
    if (!column.corridorReadable) {
      fail(
        `family '${init.key}' reads '${ruler.column}', which needs the run without the robot in ` +
          `it; an absolute quantity is by definition one a single crossing can produce`,
      );
    }
    if (column.unit !== init.unit) {
      fail(
        `family '${init.key}' declares its reading in ${init.unit} and reads a column measured ` +
          `in ${column.unit}`,
      );
    }
  }
  return Object.freeze({
    kind: "methodFamily" as const,
    key: init.key,
    name: init.name,
    whatItIs: init.whatItIs,
    confound: init.confound,
    unit: init.unit,
    ruler: Object.freeze({ ...ruler }) as FamilyRuler,
  });
}

/**
 * The console's own default ruler: a forecast rolled forward three seconds and checked at ten.
 * At a step of 0.05 s that is 60 steps and 200 steps. Stated here as the two integers the
 * estimator takes, and cross-checked against the console's defaults in `families.test.ts`.
 */
const DEFAULT_HORIZON_STEPS = 60;
const DEFAULT_END_STEP = 200;

/**
 * How far the comparison run's seed sits from the run's own.
 *
 * Any non-zero offset gives a different room; this one matches the decoy `unpaired.test.ts`
 * already uses, so the two places in the codebase that build an unpaired comparison build the
 * same one.
 */
const CONTROL_SEED_OFFSET = 9999;

export const FAMILIES: Readonly<Record<FamilyKey, MethodFamily>> = Object.freeze({
  pairedShared: makeMethodFamily({
    key: "pairedShared",
    name: "Both runs of the same room, sharing every random draw",
    whatItIs:
      "The room is run twice from the same seed and the same wobble, once with the robot and " +
      "once without. Only the robot differs, so the gap between one person's two paths is what " +
      "the robot did to them, and nothing has to be estimated.",
    confound:
      "None that this room can produce. Nothing else was allowed to differ between the two runs, " +
      "so there is no other cause the number could be picking up. The catch is availability " +
      "rather than bias: a real corridor has no second run of the same afternoon, so this is the " +
      "one family of the four that only a simulator can give you.",
    unit: "metres" as const,
    ruler: { kind: "sharedNoiseTwin" as const },
  }),

  unpairedSeparate: makeMethodFamily({
    key: "unpairedSeparate",
    name: "A robot run set against a robot-free run that is not its twin",
    whatItIs:
      "One crossing with the robot, held up against a crossing without one that came from a " +
      "different day. The two were never the same room, and nothing links a person in one of " +
      "them to a person in the other.",
    confound:
      "Everything that differed between the two rooms is inside the number, and where each " +
      "person happened to start is by far the largest part of it. What the robot did is one term " +
      "in a sum whose other terms are the size of the room itself, and the arithmetic has no way " +
      "to tell them apart.",
    unit: "metres" as const,
    ruler: { kind: "separateRunTwin" as const, controlSeedOffset: CONTROL_SEED_OFFSET },
  }),

  forecastCounterfactual: makeMethodFamily({
    key: "forecastCounterfactual",
    name: "A straight-line guess at where each person was about to walk",
    whatItIs:
      "Each person's own recent path is extended forward as though they would carry straight on, " +
      "and the distance between that guess and what they actually did is reported as the robot's " +
      "doing.",
    confound:
      "Every reason a person does not walk in a straight line is charged to the robot: turning, " +
      "slowing, stepping round somebody else, changing their mind. All of it would still be " +
      "there with no robot in the room at all. How far ahead the guess runs and when it is " +
      "checked both change the size of the answer, and neither of them changes the room.",
    unit: "metres" as const,
    ruler: {
      kind: "straightLineForecast" as const,
      horizonSteps: DEFAULT_HORIZON_STEPS,
      endStep: DEFAULT_END_STEP,
    },
  }),

  noCounterfactual: makeMethodFamily({
    key: "noCounterfactual",
    name: "An absolute quantity, with nothing subtracted from it",
    whatItIs:
      "One number read straight off the crossing that has the robot in it — how far the robot " +
      "travelled, how close it came to anybody, how many near misses it logged. Nothing is " +
      "subtracted, because there is no second crossing to subtract.",
    confound:
      "It is not a comparison, so it has no zero. The same number comes back whether the robot " +
      "moved everybody or nobody, and a room the robot left completely undisturbed still " +
      "produces one. Set beside how far apart two runs of the same room drift on their own, it " +
      "clears that line on every seed, and clearing it says nothing whatever about the robot.",
    unit: "metres" as const,
    ruler: { kind: "absoluteReadout" as const, column: "robotPathM" as ColumnKey },
  }),
});

export const FAMILY_ORDER: readonly FamilyKey[] = Object.freeze([
  "pairedShared",
  "unpairedSeparate",
  "forecastCounterfactual",
  "noCounterfactual",
] as const);
