"""The command-line entry point: the non-interactive path to the same results the page shows.

This is the only module in `src/mirn/` allowed to print, and the only one allowed to reference
`mirn_app`. The `mirn_app` import lives inside `_serve` rather than at module scope so that the
library stays importable without the `app` extra installed, and so an absent extra produces an
instruction rather than a traceback.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

import matplotlib

from mirn.experiments import EXPERIMENTS
from mirn.experiments.base import ExperimentResult
from mirn.paths import default_seed, results_dir

matplotlib.use("Agg")

_FIGURE_BUILDERS: dict[str, str] = {
    "calibration_floor": "null_distribution",
    "confounding_sweep": "confounding_sweep",
}


def _parse_params(raw_params: Sequence[str]) -> dict[str, object]:
    parsed: dict[str, object] = {}
    for entry in raw_params:
        if "=" not in entry:
            raise ValueError(f"--param expects key=value, got '{entry}'")
        separator_index = entry.index("=")
        key = entry[:separator_index].strip()
        value = entry[separator_index + 1 :].strip()
        if len(key) == 0:
            raise ValueError(f"--param expects key=value with a non-empty key, got '{entry}'")
        parsed[key] = value
    return parsed


def _write_figure(experiment_name: str, result: ExperimentResult, figure_path: str) -> None:
    """Render the figure that belongs to this experiment, if it has one."""
    from mirn.viz.figures import confounding_sweep_figure, null_distribution_figure

    if experiment_name not in _FIGURE_BUILDERS:
        raise ValueError(
            f"experiment '{experiment_name}' has no figure; --figure is supported for: "
            f"{', '.join(sorted(_FIGURE_BUILDERS.keys()))}"
        )

    builder = _FIGURE_BUILDERS[experiment_name]
    if builder == "null_distribution":
        import numpy as np

        samples = np.asarray(result.payload["null_samples"], dtype=float)
        mdp_95 = float(result.payload["mdp_95"])
        divergence = str(result.payload["divergence"])
        figure = null_distribution_figure(samples, mdp_95, divergence)
    else:
        figure = confounding_sweep_figure(result.frame)
    figure.savefig(figure_path)


def _cmd_list() -> int:
    for name in EXPERIMENTS.names():
        experiment = EXPERIMENTS.create(name)
        print(f"{name}  -  {experiment.title}")
        print(f"    claim: {experiment.claim}")
        for parameter in experiment.parameters():
            if parameter.kind == "choice":
                domain = "one of " + ", ".join(parameter.choices)
            else:
                domain = f"{parameter.minimum} to {parameter.maximum}"
            print(f"    --param {parameter.name}=<{parameter.kind}>  default "
                  f"{parameter.default}, {domain}")
        print("")
    return 0


def _cmd_run(args: argparse.Namespace) -> int:
    try:
        experiment = EXPERIMENTS.create(args.experiment)
    except KeyError as error:
        print(str(error).strip('"'), file=sys.stderr)
        return 1

    try:
        params = _parse_params(args.param)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    if args.seed is None:
        seed = default_seed()
    else:
        seed = args.seed

    try:
        result = experiment.run(params, seed)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    if args.out is None:
        out_path = str(results_dir() / f"{args.experiment}.csv")
    else:
        out_path = args.out
    try:
        result.frame.to_csv(out_path, index=False)
    except OSError as error:
        print(f"could not write CSV to '{out_path}': {error}", file=sys.stderr)
        return 1
    print(f"wrote {len(result.frame)} rows to {out_path}")

    if args.figure is not None:
        try:
            _write_figure(args.experiment, result, args.figure)
        except ValueError as error:
            print(str(error), file=sys.stderr)
            return 1
        except OSError as error:
            print(
                f"wrote {len(result.frame)} rows to {out_path}, but could not write figure to "
                f"'{args.figure}': {error}",
                file=sys.stderr,
            )
            return 1
        print(f"wrote figure to {args.figure}")

    return 0


def _cmd_serve(args: argparse.Namespace) -> int:
    try:
        from mirn_app.server import run_server
    except ModuleNotFoundError:
        print(
            "the web interface needs the optional app dependencies; install them with:\n"
            '    pip install -e ".[app]"',
            file=sys.stderr,
        )
        return 1
    print(f"serving the MIRN instrument on http://{args.host}:{args.port}")
    run_server(args.host, args.port)
    return 0


def _cmd_fixtures(args: argparse.Namespace) -> int:
    """Regenerate the cross-language parity fixtures.

    This is the oracle's job now: the browser owns the simulation and the teaching product, and
    the only thing keeping the two implementations of the measurement honest is that Python writes
    the answers down and TypeScript has to reproduce them.
    """
    from mirn.fixtures import write_fixtures

    out_dir = Path(args.out)
    written = write_fixtures(out_dir)
    for path in written:
        print(f"wrote {path}")
    print(f"{len(written)} fixture(s) written to {out_dir}")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mirn", description="The MIRN measurement instrument.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="list every registered experiment and its parameters")

    run_parser = subparsers.add_parser("run", help="run one experiment and write its CSV")
    run_parser.add_argument("experiment", help="experiment name; see `mirn list`")
    run_parser.add_argument(
        "--param", action="append", default=[], metavar="KEY=VALUE",
        help="set one experiment parameter; repeatable",
    )
    run_parser.add_argument("--seed", type=int, default=None, help="explicit seed")
    run_parser.add_argument("--out", default=None, help="CSV output path")
    run_parser.add_argument("--figure", default=None, help="optional figure output path")

    serve_parser = subparsers.add_parser("serve", help="run the local web interface")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8000)

    fixtures_parser = subparsers.add_parser(
        "fixtures", help="regenerate the cross-language parity fixtures"
    )
    fixtures_parser.add_argument(
        "--out", default="tests/golden/parity", help="fixture output directory"
    )

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Entry point. Returns a process exit code; never raises for user error."""
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "list":
        return _cmd_list()
    if args.command == "run":
        return _cmd_run(args)
    if args.command == "fixtures":
        return _cmd_fixtures(args)
    return _cmd_serve(args)


if __name__ == "__main__":
    raise SystemExit(main())
