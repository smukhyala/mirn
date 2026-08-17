"""The theme is the single source of colour for both matplotlib and the browser, so it gets a
golden-file test: a silent palette drift would change every figure and every page at once."""

from __future__ import annotations

import dataclasses
import json
import re
from pathlib import Path

from mirn.viz import theme

_HEX_PATTERN = re.compile(r"^#[0-9a-f]{6}$")
_GOLDEN_PATH = Path(__file__).parent / "golden" / "theme_tokens.json"


def test_every_palette_field_is_lowercase_hex() -> None:
    fields = dataclasses.fields(theme.PALETTE)
    for field in fields:
        value = getattr(theme.PALETTE, field.name)
        assert _HEX_PATTERN.match(value) is not None, f"{field.name}={value!r} is not #rrggbb"


def test_css_tokens_cover_every_palette_field() -> None:
    tokens = theme.as_css_tokens()
    fields = dataclasses.fields(theme.PALETTE)
    for field in fields:
        expected_key = "--mirn-" + field.name.replace("_", "-")
        assert expected_key in tokens
        assert tokens[expected_key] == getattr(theme.PALETTE, field.name)


def test_css_tokens_match_golden_file() -> None:
    tokens = theme.as_css_tokens()
    golden = json.loads(_GOLDEN_PATH.read_text())
    assert tokens == golden


def test_matplotlib_rc_sources_colours_from_the_palette() -> None:
    rc = theme.matplotlib_rc()
    assert rc["figure.facecolor"] == theme.PALETTE.background
    assert rc["axes.facecolor"] == theme.PALETTE.background
    assert rc["text.color"] == theme.PALETTE.ink
    assert rc["grid.color"] == theme.PALETTE.grid


def test_apply_matplotlib_mutates_rcparams() -> None:
    import matplotlib

    theme.apply_matplotlib()
    assert matplotlib.rcParams["figure.facecolor"] == theme.PALETTE.background


def test_series_colors_are_distinct_palette_members() -> None:
    colors = theme.series_colors()
    assert len(colors) >= 4
    assert len(set(colors)) == len(colors)
    palette_values = set()
    fields = dataclasses.fields(theme.PALETTE)
    for field in fields:
        palette_values.add(getattr(theme.PALETTE, field.name))
    for color in colors:
        assert color in palette_values
