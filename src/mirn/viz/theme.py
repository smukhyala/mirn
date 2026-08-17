"""The single source of truth for every colour and typeface in the project.

`CLAUDE.md` requires that all plot styling live here and that no plotting function set a colour
inline. The interface obeys the same rule by construction: `matplotlib_rc` renders this palette
for the paper figures and `as_css_tokens` renders the identical palette as CSS custom properties
for the browser, so a one-line edit here moves both. Register is dark, minimal, high contrast on
data ink and muted on chrome — no gradients, no shadows, no chart junk.
"""

from __future__ import annotations

import dataclasses
import re
from dataclasses import dataclass

import matplotlib
from matplotlib import cycler

_HEX_COLOR_PATTERN = re.compile(r"^#[0-9a-f]{6}$")

_CSS_GENERIC_FONT_KEYWORDS = ("sans-serif", "monospace", "serif")


@dataclass(frozen=True, slots=True)
class Palette:
    """Every colour the project is allowed to use, as lowercase `#rrggbb` strings."""

    background: str
    surface: str
    ink: str
    ink_muted: str
    grid: str
    factual: str
    counterfactual: str
    naive: str
    paired: str
    floor: str
    accent: str

    def __post_init__(self) -> None:
        fields = dataclasses.fields(self)
        for field in fields:
            value = getattr(self, field.name)
            if _HEX_COLOR_PATTERN.match(value) is None:
                raise ValueError(
                    f"Palette.{field.name}={value!r} is not a lowercase #rrggbb colour"
                )


PALETTE = Palette(
    background="#0b0d10",
    surface="#14181d",
    ink="#e8eaed",
    ink_muted="#8b949e",
    grid="#242a31",
    factual="#f0a35e",
    counterfactual="#5eb1f0",
    naive="#e5606d",
    paired="#4fd1a5",
    floor="#6b7684",
    accent="#b58cf0",
)

SANS_STACK = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif"
MONO_STACK = "'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace"


def _stack_to_families(stack: str) -> list[str]:
    """Parse a CSS font-stack string into an ordered list of matplotlib family names.

    Strips whitespace and surrounding quotes from each entry and drops CSS generic keywords
    (`sans-serif`, `monospace`, `serif`), which are not matplotlib family names.
    """
    families: list[str] = []
    raw_names = stack.split(",")
    for raw_name in raw_names:
        stripped_name = raw_name.strip()
        unquoted_name = stripped_name.strip("'\"")
        if unquoted_name not in _CSS_GENERIC_FONT_KEYWORDS:
            families.append(unquoted_name)
    return families


def series_colors() -> tuple[str, ...]:
    """The ordered categorical sequence for multi-series plots."""
    return (
        PALETTE.paired,
        PALETTE.naive,
        PALETTE.counterfactual,
        PALETTE.factual,
        PALETTE.accent,
    )


def matplotlib_rc() -> dict[str, object]:
    """rcParams implementing the palette, for the figure/CSV path."""
    rc: dict[str, object] = {}
    rc["figure.facecolor"] = PALETTE.background
    rc["figure.edgecolor"] = PALETTE.background
    rc["savefig.facecolor"] = PALETTE.background
    rc["axes.facecolor"] = PALETTE.background
    rc["axes.edgecolor"] = PALETTE.grid
    rc["axes.labelcolor"] = PALETTE.ink_muted
    rc["axes.titlecolor"] = PALETTE.ink
    rc["axes.grid"] = True
    rc["axes.axisbelow"] = True
    rc["axes.spines.top"] = False
    rc["axes.spines.right"] = False
    rc["axes.prop_cycle"] = cycler(color=list(series_colors()))
    rc["grid.color"] = PALETTE.grid
    rc["grid.linewidth"] = 0.6
    rc["text.color"] = PALETTE.ink
    rc["xtick.color"] = PALETTE.ink_muted
    rc["ytick.color"] = PALETTE.ink_muted
    rc["legend.frameon"] = False
    rc["legend.labelcolor"] = PALETTE.ink
    rc["font.size"] = 9.0
    rc["figure.dpi"] = 160
    sans_families = _stack_to_families(SANS_STACK)
    sans_families.append("DejaVu Sans")
    mono_families = _stack_to_families(MONO_STACK)
    mono_families.append("DejaVu Sans Mono")
    rc["font.family"] = "sans-serif"
    rc["font.sans-serif"] = sans_families
    rc["font.monospace"] = mono_families
    return rc


def apply_matplotlib() -> None:
    """Apply `matplotlib_rc()` to the global rcParams. Called by every figure function."""
    rc = matplotlib_rc()
    for key in rc:
        matplotlib.rcParams[key] = rc[key]


def as_css_tokens() -> dict[str, str]:
    """The same palette as CSS custom properties: `{"--mirn-ink-muted": "#8b949e", ...}`.

    Also emits `--mirn-font-sans` and `--mirn-font-mono` so the page's typography is sourced from
    here too, not from the stylesheet.
    """
    tokens: dict[str, str] = {}
    fields = dataclasses.fields(PALETTE)
    for field in fields:
        token_name = "--mirn-" + field.name.replace("_", "-")
        tokens[token_name] = getattr(PALETTE, field.name)
    tokens["--mirn-font-sans"] = SANS_STACK
    tokens["--mirn-font-mono"] = MONO_STACK
    return tokens


def css_root_block() -> str:
    """`as_css_tokens()` rendered as a `:root { ... }` rule for injection into the served page."""
    tokens = as_css_tokens()
    lines: list[str] = []
    for token_name in tokens:
        lines.append(f"  {token_name}: {tokens[token_name]};")
    body = "\n".join(lines)
    return ":root {\n" + body + "\n}"
