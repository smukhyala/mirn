"""The visualisation layer: one theme, rendered by matplotlib for papers and by CSS for the page."""

from __future__ import annotations

from mirn.viz.theme import (
    PALETTE,
    Palette,
    apply_matplotlib,
    as_css_tokens,
    css_root_block,
    matplotlib_rc,
    series_colors,
)

__all__ = [
    "PALETTE",
    "Palette",
    "apply_matplotlib",
    "as_css_tokens",
    "css_root_block",
    "matplotlib_rc",
    "series_colors",
]
