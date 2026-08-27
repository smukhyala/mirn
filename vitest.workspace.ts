import { defineWorkspace } from "vitest/config";

// Two projects, because the environment IS the architecture test. `engine` runs in Node with no
// DOM at all, so any engine module that reaches for `document`, `window` or `navigator` fails at
// import rather than at review time. That is the structural fix for the demo's entangled
// physics/rendering, and it needs no assertion of its own.
export default defineWorkspace([
  {
    test: {
      name: "engine",
      globals: true,
      environment: "node",
      include: ["web/engine/**/*.test.ts"],
      setupFiles: ["web/engine/__tests__/setup.ts"],
    },
  },
  {
    test: {
      name: "ui",
      globals: true,
      environment: "node",
      // web/testing holds no product code — it is the shared assertions the suites lean on, and
      // guardrail 12's identifier patterns are the ones that matter. They were written out by hand
      // in twenty places until they had drifted into three, so they live in one module now, and a
      // module nothing tests is how they drifted in the first place.
      include: ["web/ui/**/*.test.ts", "web/app/**/*.test.ts", "web/testing/**/*.test.ts"],
      testTimeout: 20000,
    },
  },
]);
