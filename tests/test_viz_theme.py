"""The theme is the single source of colour for both matplotlib and the browser. Since Task 1 it
carries two palettes — dark for paper figures, light for the page — and both get a golden file, so
a silent drift in either one is a test failure."""

from __future__ import annotations

import dataclasses
import json
import re
import warnings
from pathlib import Path

from mirn.viz import theme

_HEX_PATTERN = re.compile(r"^#[0-9a-f]{6}$")
_GOLDEN_DIR = Path(__file__).parent / "golden"


def _palettes() -> list[tuple[str, theme.Palette]]:
    pairs: list[tuple[str, theme.Palette]] = []
    pairs.append(("dark", theme.DARK_PALETTE))
    pairs.append(("light", theme.LIGHT_PALETTE))
    return pairs


def test_both_palettes_are_lowercase_hex() -> None:
    for name, palette in _palettes():
        fields = dataclasses.fields(palette)
        for field in fields:
            value = getattr(palette, field.name)
            assert _HEX_PATTERN.match(value) is not None, f"{name}.{field.name}={value!r}"


def test_the_two_palettes_are_actually_different() -> None:
    """Guards against a copy-paste that leaves the page dark."""
    assert theme.LIGHT_PALETTE.background != theme.DARK_PALETTE.background
    assert theme.LIGHT_PALETTE.ink != theme.DARK_PALETTE.ink


def test_light_is_light_and_dark_is_dark() -> None:
    """Background luminance must actually differ in the direction the names claim."""
    light_background = _luminance(theme.LIGHT_PALETTE.background)
    dark_background = _luminance(theme.DARK_PALETTE.background)
    assert light_background > 0.8, f"light background is not light: {light_background}"
    assert dark_background < 0.2, f"dark background is not dark: {dark_background}"
    assert _luminance(theme.LIGHT_PALETTE.ink) < 0.2
    assert _luminance(theme.DARK_PALETTE.ink) > 0.8


def _luminance(hex_colour: str) -> float:
    red = int(hex_colour[1:3], 16) / 255.0
    green = int(hex_colour[3:5], 16) / 255.0
    blue = int(hex_colour[5:7], 16) / 255.0
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def test_css_tokens_come_from_the_light_palette() -> None:
    tokens = theme.as_css_tokens()
    fields = dataclasses.fields(theme.LIGHT_PALETTE)
    for field in fields:
        expected_key = "--mirn-" + field.name.replace("_", "-")
        assert tokens[expected_key] == getattr(theme.LIGHT_PALETTE, field.name)


def test_css_tokens_match_their_golden_file() -> None:
    golden = json.loads((_GOLDEN_DIR / "theme_tokens.json").read_text())
    assert theme.as_css_tokens() == golden


def test_matplotlib_rc_comes_from_the_dark_palette() -> None:
    rc = theme.matplotlib_rc()
    assert rc["figure.facecolor"] == theme.DARK_PALETTE.background
    assert rc["axes.facecolor"] == theme.DARK_PALETTE.background
    assert rc["text.color"] == theme.DARK_PALETTE.ink
    assert rc["grid.color"] == theme.DARK_PALETTE.grid


def test_matplotlib_rc_matches_its_golden_file() -> None:
    """rcParams carries non-JSON types (a cycler); compare only the colour keys."""
    golden = json.loads((_GOLDEN_DIR / "matplotlib_rc.json").read_text())
    rc = theme.matplotlib_rc()
    for key in golden:
        assert str(rc[key]) == golden[key], f"{key} drifted"


def test_apply_matplotlib_mutates_rcparams_to_dark() -> None:
    import matplotlib

    theme.apply_matplotlib()
    assert matplotlib.rcParams["figure.facecolor"] == theme.DARK_PALETTE.background


def test_apply_matplotlib_emits_no_findfont_warning() -> None:
    """A broken font-fallback chain fails silently unless something actually draws.

    `font.sans-serif` / `font.monospace` are lists of family names; naming one that is not
    installed makes matplotlib fall back with a `findfont` UserWarning. Inspecting the rc dict
    can't catch that — only building a real figure on a real canvas and drawing it can.
    """
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


def test_font_stacks_reach_matplotlib_with_a_dejavu_fallback() -> None:
    rc = theme.matplotlib_rc()
    assert rc["font.sans-serif"][0] == "Inter"
    assert rc["font.sans-serif"][-1] == "DejaVu Sans"
    assert rc["font.monospace"][-1] == "DejaVu Sans Mono"


def test_matplotlib_rc_font_families_drop_css_generic_keywords() -> None:
    """`sans-serif` / `monospace` / `serif` are CSS generics, not matplotlib family names."""
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


def test_series_colors_requires_a_palette_and_returns_its_members() -> None:
    for _name, palette in _palettes():
        colors = theme.series_colors(palette)
        assert len(colors) >= 4
        assert len(set(colors)) == len(colors)
        palette_values: set[str] = set()
        fields = dataclasses.fields(palette)
        for field in fields:
            palette_values.add(getattr(palette, field.name))
        for color in colors:
            assert color in palette_values


def test_css_root_block_wraps_the_light_tokens() -> None:
    block = theme.css_root_block()
    assert block.startswith(":root {")
    assert block.endswith("}")
    assert f"  --mirn-background: {theme.LIGHT_PALETTE.background};" in block


def test_palette_rejects_uppercase_hex() -> None:
    import pytest

    kwargs: dict[str, str] = {}
    fields = dataclasses.fields(theme.DARK_PALETTE)
    for field in fields:
        kwargs[field.name] = getattr(theme.DARK_PALETTE, field.name)
    kwargs["ink"] = "#ABCDEF"
    with pytest.raises(ValueError, match="ink"):
        theme.Palette(**kwargs)


def test_palette_rejects_non_hex_colour_name() -> None:
    import pytest

    kwargs: dict[str, str] = {}
    fields = dataclasses.fields(theme.DARK_PALETTE)
    for field in fields:
        kwargs[field.name] = getattr(theme.DARK_PALETTE, field.name)
    kwargs["background"] = "red"
    with pytest.raises(ValueError, match="background"):
        theme.Palette(**kwargs)
