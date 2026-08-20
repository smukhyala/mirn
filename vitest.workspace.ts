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
      include: ["web/ui/**/*.test.ts", "web/app/**/*.test.ts", "web/build/**/*.test.ts"],
    },
  },
]);
