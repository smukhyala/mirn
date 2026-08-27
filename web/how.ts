/**
 * The working page's entry point, and it does exactly one thing.
 *
 * `web/console.css` carries no colour literal — every colour on both pages is a custom property
 * whose single definition lives in `web/ui/theme.ts`. Something has to put those properties on the
 * document before first paint, and `web/app/console/boot.js` is the module that does it. Imported
 * for that side effect alone.
 *
 * There is nothing else here on purpose. The page is prose and formulas: no simulation runs, no
 * readings are computed, nothing is mounted. If this file ever grows a second statement, ask
 * first whether the page has stopped being a static explanation.
 */
import "./app/console/boot.js";
