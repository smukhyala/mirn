import { cssTokens } from "../../ui/theme.js";

/**
 * The palette, injected.
 *
 * Every colour token has exactly one definition, in web/ui/theme.ts, and the stylesheets read
 * them as custom properties — so the tokens have to reach the document before the first paint.
 * The notes build wrote them to a generated theme.gen.css; that script is deleted with the
 * notebook, so this module injects them instead and depends on nothing generated.
 *
 * `web/console.ts`, not this file, is the console's entry point — matching `web/hero.ts` for
 * index.html and `web/main.ts` for instrument.html, one top-level script per page. It imports
 * this module for the side effect below, then mounts the panel, the arena, the tiles, the sweep
 * curve and the ledger into the hosts named in console.html.
 */
export function mountTokens(doc: Document): void {
  const style = doc.createElement("style");
  style.id = "mirn-tokens";
  style.textContent = cssTokens();
  doc.head.prepend(style);
}

mountTokens(document);
