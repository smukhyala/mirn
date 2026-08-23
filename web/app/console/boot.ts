import { cssTokens } from "../../ui/theme.js";

/**
 * The console's entry point.
 *
 * Its only job right now is the palette. Every colour token has exactly one definition, in
 * web/ui/theme.ts, and the stylesheets read them as custom properties — so the tokens have to
 * reach the document before the first paint. The notes build wrote them to a generated
 * theme.gen.css; that script is deleted with the notebook, so the console injects them instead
 * and depends on nothing generated.
 *
 * Later tasks mount the panel, the arena, the tiles, the sweep curve and the ledger into the
 * hosts named in console.html. They extend this file; they do not replace it.
 */
export function mountTokens(doc: Document): void {
  const style = doc.createElement("style");
  style.id = "mirn-tokens";
  style.textContent = cssTokens();
  doc.head.prepend(style);
}

mountTokens(document);
