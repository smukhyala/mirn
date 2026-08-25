import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Two pages, two entry points, both listed by hand.
 *
 * A helper used to sweep web/generated/*.html into the input map here, because every notes page
 * was compiled to real HTML before Vite ran. There are no notes and no pre-build step: both pages
 * are hand-written HTML that Vite reads directly, and both are named below rather than discovered.
 *
 * `index` is the console. `how` is the page explaining what every readout on it computes. A third
 * name here without a third hand-written file is a build emitting a page whose source is gone,
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
      },
    },
  },
});
