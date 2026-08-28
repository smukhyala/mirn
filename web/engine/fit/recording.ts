import { fail } from "../core/errors.js";

/**
 * A real pedestrian recording, read in, stripped of everybody's name, and reduced to speeds.
 *
 * ## What guardrail 11 permits and what it forbids, restated where the code is
 *
 * A recording may **fit the crowd** and **check the fit**. It may never produce a disturbance
 * number. That is arithmetic rather than caution: every number this bench reports is a paired
 * difference — one room, run twice, once with the robot and once without, from the same starting
 * positions and the same wobble — and **a corridor cannot be filmed twice**. There is no second
 * recording in which the same people, on the same day, in the same mood, walked past no robot. Real
 * trajectories have exactly one arm, so the quantity this site exists to measure is not in them.
 *
 * So nothing in this module or anything downstream of it computes a displacement, a residual, or a
 * difference between two arms. What comes out is a bag of speeds and nothing else, which is enough
 * to ask "does the invented crowd walk like this one" and structurally incapable of answering "how
 * much did the robot move this crowd".
 *
 * ## The data is somebody's movements
 *
 * Person identifiers are used to group samples into tracks and are then **dropped**. `Recording`
 * has no field they could survive in: tracks are an unlabelled array and the speeds are pooled
 * across everybody before anything sees them. That is the guardrail's "nothing on any surface may
 * make an individual identifiable" made structural rather than remembered — there is no path from a
 * `Recording` back to a row of the file, so no surface downstream can print one by accident.
 *
 * Nothing is committed to this repository and nothing ships with the site. The file a reader opens
 * is read in their own browser and reaches no server, which guardrail 10 already guarantees by
 * having no server to reach.
 *
 * ## The format, and why it is this one
 *
 * One sample per line, four fields, whitespace or comma separated:
 *
 *     frame   person   x   y
 *
 * That is the shape the public pedestrian datasets are distributed in. `frame` is an integer tick,
 * `person` is any token, `x` and `y` are metres. Lines starting with `#` are comments and blank
 * lines are skipped, so a file with a header block reads without editing.
 *
 * Frames are not seconds, and this module refuses to guess the conversion. The frame rate comes
 * from the caller, who got it from the reader, because a recording annotated at 2.5 frames per
 * second and read as 25 would report a crowd walking at a tenth of its speed and every fitted
 * parameter after it would be wrong by the same factor — quietly, and in a direction nobody would
 * question.
 */

/** One person's samples, in frame order. No identifier: see the note above. */
export interface Track {
  readonly kind: "track";
  /** Flat [f0,x0,y0, f1,x1,y1, ...]. Frames strictly increasing. */
  readonly samples: Float64Array;
  readonly nSamples: number;
}

export interface Recording {
  readonly kind: "recording";
  readonly tracks: readonly Track[];
  readonly framesPerSecond: number;
  /** How many samples were read in total, for the provenance line. Not a per-person figure. */
  readonly nSamples: number;
}

const FIELDS_PER_SAMPLE = 3;

/** A row of the file, before grouping. The identifier lives here and goes no further. */
interface Row {
  readonly frame: number;
  readonly person: string;
  readonly x: number;
  readonly y: number;
}

function parseRows(text: string): readonly Row[] {
  const rows: Row[] = [];
  const lines = text.split("\n");

  for (let index = 0; index < lines.length; index++) {
    const raw = (lines[index] ?? "").trim();
    if (raw.length === 0 || raw.startsWith("#")) {
      continue;
    }
    const parts = raw.split(/[\s,]+/).filter((piece) => piece.length > 0);
    if (parts.length < 4) {
      fail(
        `line ${String(index + 1)} of the recording has ${String(parts.length)} values, and a ` +
          `sample needs four: the frame, who it is, and where they were`,
      );
    }

    const frame = Number(parts[0]);
    const x = Number(parts[2]);
    const y = Number(parts[3]);
    if (!Number.isFinite(frame) || !Number.isInteger(frame)) {
      fail(`line ${String(index + 1)} of the recording has a frame that is not a whole number`);
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      fail(`line ${String(index + 1)} of the recording has a position that is not a number`);
    }
    rows.push({ frame, person: parts[1] ?? "", x, y });
  }

  return rows;
}

/**
 * Group by person, sort each track by frame, and drop the identifiers.
 *
 * Tracks come out in first-appearance order rather than sorted by identifier. Sorting by identifier
 * would leak the ordering of the source file into the array, and a reader who had the file could
 * then map a track back to a person — which is the thing this must not allow even though nothing
 * downstream prints a track.
 */
export function makeRecording(text: string, framesPerSecond: number): Recording {
  if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0) {
    fail(
      `a recording needs the frame rate it was annotated at, as a number above nought, and was ` +
        `given ${String(framesPerSecond)}`,
    );
  }

  const rows = parseRows(text);
  if (rows.length === 0) {
    fail("the recording holds no samples at all, so there is nothing in it to compare against");
  }

  const order: string[] = [];
  const byPerson = new Map<string, Row[]>();
  for (const row of rows) {
    const held = byPerson.get(row.person);
    if (held === undefined) {
      order.push(row.person);
      byPerson.set(row.person, [row]);
    } else {
      held.push(row);
    }
  }

  const tracks: Track[] = [];
  for (const person of order) {
    const own = byPerson.get(person) ?? [];
    if (own.length < 2) {
      // One sample is a position, not a movement. Kept out rather than counted as a track with no
      // speed in it, which would make the denominator of the fit wrong.
      continue;
    }
    const sorted = [...own].sort((a, b) => a.frame - b.frame);

    const samples = new Float64Array(sorted.length * FIELDS_PER_SAMPLE);
    let previousFrame = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < sorted.length; i++) {
      const row = sorted[i] as Row;
      if (row.frame === previousFrame) {
        fail(
          `the recording has one person in two places at frame ${String(row.frame)}, so its ` +
            `identifiers do not name one person each and no speed read from it would be one ` +
            `person's speed`,
        );
      }
      previousFrame = row.frame;
      samples[i * FIELDS_PER_SAMPLE] = row.frame;
      samples[i * FIELDS_PER_SAMPLE + 1] = row.x;
      samples[i * FIELDS_PER_SAMPLE + 2] = row.y;
    }

    tracks.push(
      Object.freeze({ kind: "track" as const, samples, nSamples: sorted.length }),
    );
  }

  if (tracks.length < 2) {
    fail(
      `the recording holds ${String(tracks.length)} people who moved, and a crowd is fitted to a ` +
        `crowd: one person's walking says nothing about how a crowd behaves`,
    );
  }

  let nSamples = 0;
  for (const track of tracks) {
    nSamples = nSamples + track.nSamples;
  }

  return Object.freeze({
    kind: "recording" as const,
    tracks: Object.freeze(tracks),
    framesPerSecond,
    nSamples,
  });
}

/**
 * Every step's speed, pooled across everybody, in metres per second.
 *
 * Pooled rather than kept per person, and that is the privacy property doing double duty as the
 * right statistic: what is being fitted is how a CROWD walks, which is a distribution over steps
 * and not a set of individual averages. A per-person mean would also be a small enough number of
 * values to be recognisable.
 *
 * The gap between two samples is whatever the frames say it is, rather than assumed to be one
 * frame. Public recordings drop samples when a tracker loses somebody, and treating a ten-frame gap
 * as one frame would report a person sprinting.
 */
export function speedsFrom(recording: Recording): Float64Array {
  let total = 0;
  for (const track of recording.tracks) {
    total = total + track.nSamples - 1;
  }

  const speeds = new Float64Array(total);
  let at = 0;
  for (const track of recording.tracks) {
    const s = track.samples;
    for (let i = 1; i < track.nSamples; i++) {
      const here = i * FIELDS_PER_SAMPLE;
      const before = here - FIELDS_PER_SAMPLE;
      const frameGap = (s[here] as number) - (s[before] as number);
      const dx = (s[here + 1] as number) - (s[before + 1] as number);
      const dy = (s[here + 2] as number) - (s[before + 2] as number);
      const seconds = frameGap / recording.framesPerSecond;
      // Not `Math.hypot`: banned in `measure/` for oracle reasons and avoided here for one of its
      // own, so every distance in this repository is computed the same way.
      speeds[at] = Math.sqrt(dx * dx + dy * dy) / seconds;
      at = at + 1;
    }
  }

  return speeds;
}
