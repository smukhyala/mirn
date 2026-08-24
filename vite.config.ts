import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * One page, one entry point.
 *
 * A helper used to sweep web/generated/*.html into the input map here, because every notes page
 * was compiled to real HTML before Vite ran. There are no notes and no pre-build step: the console
 * is hand-written HTML that Vite reads directly.
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
      },
    },
  },
});
