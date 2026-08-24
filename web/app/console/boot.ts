import { cssTokens } from "../../ui/theme.js";

/**
 * The palette, injected.
 *
 * Every colour token has exactly one definition, in web/ui/theme.ts, and the stylesheets read
 * them as custom properties — so the tokens have to reach the document before the first paint.
 * The notes build wrote them to a generated theme.gen.css; that script is deleted with the
 * notebook, so this module injects them instead and depends on nothing generated.
 *
 * `web/console.ts`, not this file, is the page's entry point. It imports this module for the side
 * effect below — injecting the palette before first paint — then mounts the panel, the arena, the
 * tiles, the sweep curve and the ledger into the hosts named in web/index.html.
 *
 * Not exported. The one call is the line at the bottom of this file, and an export would say
 * there is a second document somewhere that needs its own palette. There is one page.
 */
function mountTokens(doc: Document): void {
  const style = doc.createElement("style");
  style.id = "mirn-tokens";
  style.textContent = cssTokens();
  doc.head.prepend(style);
}

mountTokens(document);
