"""The MIRN instrument's local web interface.

A sibling package of `mirn`, never a subpackage, so the boundary between the research library and
the web application is a namespace boundary rather than a convention. This package imports `mirn`;
`mirn` imports this package from exactly one guarded function body in `mirn.cli`.

Importing this package requires the optional app dependencies: `pip install -e ".[app]"`.
"""

from __future__ import annotations

__all__: list[str] = []
