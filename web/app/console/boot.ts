import { cssTokens } from "../../ui/theme.js";

/**
 * The palette, injected.
 *
 * Every colour token has exactly one definition, in web/ui/theme.ts, and the stylesheets read
 * them as custom properties — so the tokens have to reach the document before the first paint.
 * The notes build wrote them to a generated theme.gen.css; that script is deleted with the
 * notebook, so this module injects them instead and depends on nothing generated.
 *
 * `web/console.ts`, not this file, is the console's entry point. It imports this module for the
 * side effect below — injecting the palette before first paint — then mounts the panel, the arena,
 * the tiles, the sweep curve and the ledger into the hosts named in web/index.html.
 *
 * `web/how.ts` imports it too, and that is the whole of that page's script: the working page is
 * static prose sharing web/console.css, so the only thing it needs from JavaScript is the palette
 * those stylesheet rules read.
 *
 * Still not exported, and the reason has changed rather than lapsed. Two documents now want the
 * palette, and both get it the same way — by importing this module, which mounts it on whatever
 * document they were loaded into. An exported `mountTokens` would invite a caller to pass some
 * OTHER document, and a second palette on a second document is exactly the drift the single
 * definition in web/ui/theme.ts exists to prevent.
 */
function mountTokens(doc: Document): void {
  const style = doc.createElement("style");
  style.id = "mirn-tokens";
  style.textContent = cssTokens();
  doc.head.prepend(style);
}

mountTokens(document);
