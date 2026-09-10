import { fail } from "../core/errors.js";

/**
 * Turning a producer's own names for people into the two this engine needs.
 *
 * A `Trajectory` carries an `agentId` constrained to `/^[a-z][a-z0-9_]*$/` — so that sorting agrees
 * between Python and JavaScript — and an integer `agentUid`, which is the pairing key. A producer's
 * names meet neither rule: `ped-1`, `Agent_7` and a bare number are all perfectly reasonable and all
 * refused at construction.
 *
 * The mapping is by SORTED POSITION rather than by arrival order. Two arms of one run set list their
 * people in whatever order each happened to write them, and the two must agree about who is who or
 * the pair compares strangers; sorting makes them agree without either arm's file order mattering.
 * `makePairedRun` asserts the two arms' name sets are identical, so a producer whose names differ
 * between arms fails there with both sets in the message rather than silently here.
 *
 * The minted prefix is `ext` rather than `ped`, which the simulator uses. An adapted person is not
 * one of this bench's own, and the prefix is the cheapest place to keep that visible in every buffer
 * dump, every error message and every sorted listing.
 *
 * This is a pure function of the id list handed in — no hidden state, no dependence on call order —
 * because a later stage calls it once for the treated run's ids and then reuses the same map for the
 * control run and for any extra runs in the file. If the mapping depended on anything but the sorted
 * contents of `ids`, that reuse would be silently wrong.
 */
export interface IdentityMap {
  readonly kind: "identityMap";
  readonly orderedIds: readonly string[];
  readonly agentIdOf: (externalId: string) => string;
  readonly agentUidOf: (externalId: string) => number;
}

export function identityFor(ids: readonly string[]): IdentityMap {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      fail(`the run set names the person '${id}' twice, and a name must name one person`);
    }
    seen.add(id);
  }

  const orderedIds = [...ids].sort();
  const uidById = new Map<string, number>();
  for (let i = 0; i < orderedIds.length; i++) {
    uidById.set(orderedIds[i] as string, i);
  }

  const uidOf = (externalId: string): number => {
    const uid = uidById.get(externalId);
    if (uid === undefined) {
      fail(`'${externalId}' was not in the run set this naming was built from`);
    }
    return uid;
  };

  return Object.freeze({
    kind: "identityMap" as const,
    orderedIds: Object.freeze(orderedIds),
    agentUidOf: uidOf,
    agentIdOf: (externalId: string): string => `ext${uidOf(externalId)}`,
  });
}
