"""The library must stay paper-grade: the estimator that gets cited must not acquire a web
dependency. This is checked by parsing source rather than by importing, so the rule holds even in
an environment where the app extra happens to be installed."""

from __future__ import annotations

import ast
from pathlib import Path

_LIBRARY_ROOT = Path(__file__).parent.parent / "src" / "mirn"
_FORBIDDEN_ROOTS: tuple[str, ...] = (
    "fastapi",
    "uvicorn",
    "starlette",
    "httpx",
    "flask",
    "django",
    "aiohttp",
)

# mirn.cli is the single module allowed to reference the app package, and only inside a function
# body, so that `mirn serve` can offer an actionable message when the extra is absent.
_MIRN_APP_ALLOWED_IN: tuple[str, ...] = ("cli.py",)


def _module_paths() -> list[Path]:
    paths: list[Path] = []
    for path in sorted(_LIBRARY_ROOT.rglob("*.py")):
        paths.append(path)
    return paths


def _imported_roots(tree: ast.AST) -> list[str]:
    roots: list[str] = []
    for node in ast.walk(tree):
        if type(node) is ast.Import:
            for alias in node.names:
                roots.append(alias.name.split(".")[0])
        elif type(node) is ast.ImportFrom:
            if node.module is not None and node.level == 0:
                roots.append(node.module.split(".")[0])
    return roots


def test_the_library_has_modules_to_check() -> None:
    """Guards against the walk silently finding nothing and the suite passing vacuously."""
    assert len(_module_paths()) >= 20


def test_no_library_module_imports_a_web_package() -> None:
    offenders: list[str] = []
    for path in _module_paths():
        tree = ast.parse(path.read_text())
        for root in _imported_roots(tree):
            if root in _FORBIDDEN_ROOTS:
                offenders.append(f"{path.name} imports {root}")
    assert offenders == [], f"web dependencies leaked into src/mirn/: {offenders}"


def test_only_the_cli_references_the_app_package() -> None:
    offenders: list[str] = []
    for path in _module_paths():
        if path.name in _MIRN_APP_ALLOWED_IN:
            continue
        tree = ast.parse(path.read_text())
        for root in _imported_roots(tree):
            if root == "mirn_app":
                offenders.append(f"{path.name} imports mirn_app")
    assert offenders == [], f"mirn_app referenced outside the CLI: {offenders}"


def test_importing_mirn_pulls_in_no_web_package() -> None:
    """Runs the import in a fresh interpreter subprocess rather than in-process.

    An in-process check inspects `sys.modules` for the whole pytest session, not just for this
    test. Task 13 adds `tests/test_app_api.py`, which imports `fastapi.testclient` at module
    level; that file sorts before this one alphabetically and pytest's default collection order
    is name-sorted, so an in-process check would find `fastapi` already loaded by an unrelated
    test and fail for a reason that has nothing to do with `mirn` leaking a dependency. A false
    failure in this test is worse than no test: it trains people to ignore the one gate that
    protects the library. A subprocess is immune to whatever else pytest has already collected,
    so do not "simplify" this back to an in-process `sys.modules` check.
    """
    import subprocess
    import sys

    root_list: list[str] = []
    for root in _FORBIDDEN_ROOTS:
        root_list.append(root)

    import_lines: list[str] = [
        "import sys",
        "import mirn",
        "import mirn.experiments",
        "import mirn.method",
        "import mirn.viz",
    ]
    check_lines: list[str] = []
    for root in root_list:
        check_lines.append(f"assert {root!r} not in sys.modules, {root!r}")

    script = "\n".join(import_lines) + "\n" + "\n".join(check_lines) + "\n"

    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"importing mirn pulled in a forbidden web package in a fresh interpreter; "
        f"stdout={result.stdout!r} stderr={result.stderr!r}"
    )
