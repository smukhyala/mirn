import { defineConfig } from "vite";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Every notes page is its own HTML entry point.
 *
 * A single-page app would have been less work and would have failed the one gate that matters
 * here: with JavaScript disabled the prose and the mathematics must still appear. So the notes are
 * compiled to real HTML by scripts/build-notes.ts before Vite runs, and Vite treats each one as an
 * entry rather than as data.
 */
function generatedPages(): Record<string, string> {
  const dir = resolve(__dirname, "web/generated");
  const entries: Record<string, string> = {};
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".html")) {
        entries[name.replace(/\.html$/, "")] = resolve(dir, name);
      }
    }
  }
  return entries;
}

export default defineConfig({
  root: "web",
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "web/index.html"),
        instrument: resolve(__dirname, "web/instrument.html"),
        ...generatedPages(),
      },
    },
  },
});
