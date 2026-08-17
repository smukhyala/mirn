"""The theme is the single source of colour for both matplotlib and the browser, so it gets a
golden-file test: a silent palette drift would change every figure and every page at once."""

from __future__ import annotations

import dataclasses
import json
import re
import warnings
from pathlib import Path

import pytest

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


def _palette_kwargs_with_override(field_name: str, value: str) -> dict[str, str]:
    kwargs: dict[str, str] = {}
    fields = dataclasses.fields(theme.PALETTE)
    for field in fields:
        kwargs[field.name] = getattr(theme.PALETTE, field.name)
    kwargs[field_name] = value
    return kwargs


def test_palette_rejects_uppercase_hex_colour() -> None:
    kwargs = _palette_kwargs_with_override("background", "#ABCDEF")
    with pytest.raises(ValueError):
        theme.Palette(**kwargs)


def test_palette_rejects_non_hex_colour_name() -> None:
    kwargs = _palette_kwargs_with_override("background", "red")
    with pytest.raises(ValueError):
        theme.Palette(**kwargs)


def test_matplotlib_rc_sans_families_are_derived_from_the_stack_with_dejavu_fallback() -> None:
    rc = theme.matplotlib_rc()
    sans_families = rc["font.sans-serif"]
    assert sans_families[0] == "Inter"
    assert sans_families[-1] == "DejaVu Sans"


def test_matplotlib_rc_mono_families_end_with_dejavu_mono_fallback() -> None:
    rc = theme.matplotlib_rc()
    mono_families = rc["font.monospace"]
    assert mono_families[-1] == "DejaVu Sans Mono"


def test_matplotlib_rc_font_families_drop_css_generic_keywords() -> None:
    rc = theme.matplotlib_rc()
    sans_families = rc["font.sans-serif"]
    mono_families = rc["font.monospace"]
    generic_keywords = ("sans-serif", "monospace", "serif")
    for family in sans_families:
        for keyword in generic_keywords:
            assert family != keyword
    for family in mono_families:
        for keyword in generic_keywords:
            assert family != keyword


def test_apply_matplotlib_emits_no_findfont_warning() -> None:
    import matplotlib
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    from matplotlib.figure import Figure

    matplotlib.use("Agg")

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        theme.apply_matplotlib()
        figure = Figure()
        canvas = FigureCanvasAgg(figure)
        axes = figure.add_subplot(1, 1, 1)
        axes.set_title("test title")
        axes.set_xlabel("x label")
        axes.plot([0, 1, 2], [0, 1, 4])
        canvas.draw()

    for warning in caught:
        message = str(warning.message)
        assert "findfont" not in message


def test_css_root_block_starts_and_ends_with_root_braces() -> None:
    block = theme.css_root_block()
    assert block.startswith(":root {")
    assert block.endswith("}")


def test_css_root_block_contains_the_background_token_line() -> None:
    block = theme.css_root_block()
    assert "  --mirn-background: #0b0d10;" in block
