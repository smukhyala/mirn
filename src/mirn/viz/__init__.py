"""The visualisation layer: one theme, rendered by matplotlib for papers and by CSS for the page."""

from __future__ import annotations

from mirn.viz.theme import (
    DARK_PALETTE,
    LIGHT_PALETTE,
    Palette,
    apply_matplotlib,
    as_css_tokens,
    css_root_block,
    matplotlib_rc,
    series_colors,
)

__all__ = [
    "DARK_PALETTE",
    "LIGHT_PALETTE",
    "Palette",
    "apply_matplotlib",
    "as_css_tokens",
    "css_root_block",
    "matplotlib_rc",
    "series_colors",
]
