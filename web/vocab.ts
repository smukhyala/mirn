/**
 * The vocabulary ladder, machine-readable.
 *
 * Terms are ordered by NECESSITY, not by how a textbook would order them, and one place departs
 * from the obvious sequence on purpose: `nominal trajectory` and `deviation` come before `control
 * input` and `disturbance`. Deviation is a thing the reader SEES on page 2 — it is the visible
 * gap — whereas control input and disturbance are explanations for it. The site's contract is
 * that explanation follows witnessing, so introducing the explanation first would break it.
 *
 * Two build-time checks read this table:
 *
 *  1. Front-matter closure — every page declares `introduces` and `uses`; the build fails if a
 *     page uses a term whose page is later than its own, or if a term is introduced twice or
 *     never.
 *  2. The jargon gate — no prose on page n may contain a term first defined after page n, outside
 *     the sentence that introduces it.
 *
 * Both are the mechanical version of a rule the project previously enforced by hand.
 */
export interface Term {
  readonly id: string;
  readonly term: string;
  /** One sentence, plain English, no notation. This is the text the page renders. */
  readonly definition: string;
  /** The numbered page that first defines it. 10 is the colophon. */
  readonly page: number;
}

export const VOCABULARY: readonly Term[] = Object.freeze([
  {
    id: "run",
    term: "run",
    definition:
      "One run of the room is one complete pass, from the moment the clock starts to the moment everybody has left.",
    page: 1,
  },
  {
    id: "trajectory",
    term: "trajectory",
    definition:
      "The trail a person leaves behind them has a name: a trajectory. It is the list of places they were, in order, with a time attached to each one.",
    page: 1,
  },
  {
    id: "nominal-trajectory",
    term: "nominal trajectory",
    definition:
      "The nominal trajectory is the path a person would have walked if nothing had interfered — here, the path they took in the run with no robot in it.",
    page: 2,
  },
  {
    id: "deviation",
    term: "deviation",
    definition:
      "A person's deviation at some moment is how far they are from where they would have been at that same moment.",
    page: 2,
  },
  {
    id: "state",
    term: "state",
    definition:
      "A person's state is everything you would need to know about them right now in order to work out what they do next: where they are, and how fast they are going.",
    page: 2,
  },
  {
    id: "seed",
    term: "seed",
    definition:
      "The seed is one whole number that decides every random draw a run will ever make. Same seed, same room, every time.",
    page: 2,
  },
  {
    id: "control-input",
    term: "control input",
    definition:
      "A control input is the part of the motion the mover chooses — for a person, the direction they are steering; for the robot, the speed and heading its planner settled on.",
    page: 3,
  },
  {
    id: "disturbance",
    term: "disturbance",
    definition:
      "A disturbance is a push you did not choose and cannot prevent. The robot is a disturbance with wheels.",
    page: 3,
  },
  {
    id: "recovery",
    term: "recovery",
    definition:
      "Recovery is what happens once the push stops: the steering wins again and drags the person back toward the line they were on.",
    page: 3,
  },
  {
    id: "divergence",
    term: "divergence",
    definition:
      "A divergence is a rule for turning two paths into a single number saying how far apart they are.",
    page: 4,
  },
  {
    id: "perturbation",
    term: "perturbation",
    definition:
      "Perturbation is the whole of the robot's effect on how people moved, once you have added the deviations up across a crossing and across a room. Deviation is one person at one moment; perturbation is the total.",
    page: 4,
  },
  {
    id: "uncertainty",
    term: "uncertainty",
    definition:
      "Uncertainty is how much your answer would have moved if the world had rolled differently.",
    page: 5,
  },
  {
    id: "robustness",
    term: "robustness",
    definition:
      "A system is robust if its behaviour barely changes when its conditions get worse. Uncertainty is how well you know the answer; robustness is the answer. Keep them apart.",
    page: 5,
  },
  {
    id: "near-miss",
    term: "near miss",
    definition:
      "A near miss is any moment the robot came closer to somebody than some distance you have to choose — and you are about to find out how much depends on choosing it.",
    page: 6,
  },
  {
    id: "time-lost",
    term: "time lost",
    definition:
      "Time lost is how much later somebody arrived than they would have. Unlike deviation, it never comes back: the seconds are spent.",
    page: 6,
  },
  {
    // NOT `null`. YAML parses a bare `null` in a front-matter list as the null literal, so a page
    // declaring `uses: [null]` silently passed a JS null into the ladder check and the build
    // reported "unknown term 'null'" against a term that was plainly there.
    id: "the-null",
    term: "the null",
    definition:
      "The null is what the measurement reports when there is definitely nothing there: the ordinary variation between two halves of the same crowd, with no robot anywhere.",
    page: 7,
  },
  {
    id: "detection-floor",
    term: "detection floor",
    definition:
      "The detection floor is the smallest effect this measurement could ever tell apart from its own noise. An effect below it is not absent. It is invisible at this sample size.",
    page: 7,
  },
  {
    id: "counterfactual",
    term: "counterfactual",
    definition:
      "The counterfactual is the version of events that did not happen — the run you would need in order to say what caused what, and the one the real world never hands you.",
    page: 8,
  },
  {
    id: "estimator",
    term: "estimator",
    definition:
      "An estimator is a rule that takes the data you do have and produces a number standing in for the one you cannot measure.",
    page: 8,
  },
  {
    id: "confound",
    term: "confound",
    definition:
      "A confound is something that moves your number for a reason that has nothing to do with what the number claims to be measuring.",
    page: 8,
  },
  {
    id: "placebo-test",
    term: "placebo test",
    definition:
      "A placebo test hands the measurement a question whose answer you already know is nothing, and checks that it says nothing.",
    page: 9,
  },
]);

const BY_ID = new Map(VOCABULARY.map((t) => [t.id, t]));

export function term(id: string): Term {
  const found = BY_ID.get(id);
  if (found === undefined) {
    throw new Error(
      `unknown vocabulary term '${id}'. Every :::term{id=...} must name an entry in web/vocab.ts.`,
    );
  }
  return found;
}

export function termsIntroducedOn(page: number): readonly Term[] {
  return VOCABULARY.filter((t) => t.page === page);
}
