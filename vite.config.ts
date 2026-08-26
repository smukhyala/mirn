import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Three pages, three entry points, all listed by hand.
 *
 * A helper used to sweep web/generated/*.html into the input map here, because every notes page
 * was compiled to real HTML before Vite ran. There are no notes and no pre-build step: every page
 * is hand-written HTML that Vite reads directly, and each is named below rather than discovered.
 *
 * `index` is the console. `how` is the page explaining what every readout on it computes. `drill`
 * is the referee drill's card, which shows a room with the run without the robot withheld. A name
 * here without a hand-written file behind it is a build emitting a page whose source is gone,
 * which is what `web/app/console/__tests__/disclosure.test.ts` checks this map for.
 */
export default defineConfig({
  root: "web",
  base: "./",
  // Vite's default worker output is `iife`, which cannot serve a `{ type: "module" }` worker.
  // `web/app/worker/client.ts` constructs one, so the format is stated rather than inherited.
  worker: {
    format: "es",
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "web/index.html"),
        how: resolve(__dirname, "web/how.html"),
        drill: resolve(__dirname, "web/drill.html"),
      },
    },
  },
});
