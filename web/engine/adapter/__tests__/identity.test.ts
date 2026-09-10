import { describe, expect, it } from "vitest";
import { CODE_IDENTIFIER } from "../../../testing/identifiers.js";
import { identityFor } from "../identity.js";

describe("naming people a producer named differently", () => {
  it("gives the same person the same name whatever order they arrived in", () => {
    const a = identityFor(["ped-2", "ped-1", "ped-10"]);
    const b = identityFor(["ped-10", "ped-2", "ped-1"]);
    expect(a.agentIdOf("ped-2")).toBe(b.agentIdOf("ped-2"));
    expect(a.agentUidOf("ped-2")).toBe(b.agentUidOf("ped-2"));
  });

  it("mints names the trajectory contract accepts", () => {
    const map = identityFor(["Agent_7", "a-b-c", "5150", "élodie"]);
    for (const id of ["Agent_7", "a-b-c", "5150", "élodie"]) {
      expect(map.agentIdOf(id)).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("counts from nought so the uids are dense", () => {
    const map = identityFor(["c", "a", "b"]);
    const uids = [map.agentUidOf("a"), map.agentUidOf("b"), map.agentUidOf("c")];
    expect([...uids].sort((x, y) => x - y)).toEqual([0, 1, 2]);
  });

  it("refuses a name it was not given", () => {
    const map = identityFor(["a"]);
    expect(() => map.agentUidOf("b")).toThrow(/was not in/i);
  });

  it("refuses the same name twice", () => {
    expect(() => identityFor(["a", "a"])).toThrow(/twice/i);
  });

  describe("no error message names a bare code identifier", () => {
    // Guardrail 12: whoever reads this error is holding a file another team produced, and the
    // wire-level names this module mints (`ext0`, `ext1`, ...) or the arbitrary strings a producer
    // used as ids are exactly the kind of thing that must never appear dressed up as a code
    // identifier. Every deliberately-wrong value fed in below is plain lower-case English, so this
    // test checks identity.ts's OWN wording rather than tripping over a value it merely echoes back.

    function messageOf(run: () => unknown): string {
      try {
        run();
      } catch (error) {
        if (error instanceof Error) {
          return error.message;
        }
        throw error;
      }
      throw new Error("expected the call to throw, and it did not");
    }

    const cases: readonly { readonly name: string; readonly run: () => unknown }[] = [
      { name: "a name given twice", run: () => identityFor(["alice", "alice"]) },
      {
        name: "a name never given",
        run: () => identityFor(["alice"]).agentUidOf("bob"),
      },
      {
        name: "a minted id looked up for a name never given",
        run: () => identityFor(["alice"]).agentIdOf("bob"),
      },
    ];

    for (const testCase of cases) {
      it(`for: ${testCase.name}`, () => {
        const message = messageOf(testCase.run);
        expect(CODE_IDENTIFIER.test(message)).toBe(false);
      });
    }
  });
});
