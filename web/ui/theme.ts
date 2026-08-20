/**
 * Paper, ink, a grey ramp, and exactly one accent.
 *
 * The accent token is called `perturbation`, not `accent`, on purpose. A token called `accent`
 * invites reuse — for a button, a link, a focus ring — and the one-colour rule dies quietly the
 * first time someone reaches for it. A token called `perturbation` cannot be used for a button
 * without the code visibly lying.
 *
 * Contrast against the `paper` ground, computed and checked (WCAG AA is 4.5:1 for normal text):
 *
 *   ink        #111111   18.42:1
 *   inkMuted   #585858    6.94:1
 *   inkFaint   #767676    4.43:1
 *   rule       #c9c9c9    1.62:1   (non-text)
 *   grid       #e6e6e6    1.22:1   (non-text)
 *   perturbation #c2410c  5.05:1
 *
 * The previous palette's last fix round replaced a 3.51:1 token with 6.24:1, so this ramp is set
 * deliberately above that bar.
 */
export interface Palette {
  readonly paper: string;
  readonly surface: string;
  readonly ink: string;
  readonly inkMuted: string;
  readonly inkFaint: string;
  readonly rule: string;
  readonly grid: string;
  readonly perturbation: string;
}

export const PALETTE: Palette = Object.freeze({
  paper: "#fdfcfa",
  surface: "#f4f2ef",
  ink: "#111111",
  inkMuted: "#585858",
  inkFaint: "#767676",
  rule: "#c9c9c9",
  grid: "#e6e6e6",
  perturbation: "#c2410c",
});

/**
 * With hue gone, stroke carries the distinction. Every series declares its own weight and dash
 * so that a reader can tell four things apart in greyscale, in print, and with any form of colour
 * blindness — and so that the one coloured thing on the page is always the perturbation itself.
 */
export interface SeriesStyle {
  readonly stroke: string;
  readonly width: number;
  readonly dash: readonly number[];
}

export const SERIES: Readonly<Record<string, SeriesStyle>> = Object.freeze({
  treated: Object.freeze({ stroke: PALETTE.ink, width: 2, dash: Object.freeze([]) }),
  control: Object.freeze({ stroke: PALETTE.inkMuted, width: 1.5, dash: Object.freeze([4, 3]) }),
  robot: Object.freeze({ stroke: PALETTE.ink, width: 2.5, dash: Object.freeze([]) }),
  gap: Object.freeze({ stroke: PALETTE.perturbation, width: 1.5, dash: Object.freeze([]) }),
  grid: Object.freeze({ stroke: PALETTE.grid, width: 1, dash: Object.freeze([]) }),
});

export const FONT_SANS =
  '"Inter", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
export const FONT_MONO =
  '"SF Mono", ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace';

/** Emitted into the page as CSS custom properties, so no stylesheet carries a colour literal. */
export function cssTokens(): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(PALETTE)) {
    const kebab = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    lines.push(`  --mirn-${kebab}: ${value};`);
  }
  lines.push(`  --mirn-font-sans: ${FONT_SANS};`);
  lines.push(`  --mirn-font-mono: ${FONT_MONO};`);
  return `:root {\n${lines.join("\n")}\n}`;
}
