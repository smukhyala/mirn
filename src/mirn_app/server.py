"""The local web interface: routing and serialisation only.

Every number this server returns was computed by `src/mirn/`. Nothing here estimates, calibrates,
or sweeps anything; if a computation appears in this file it belongs in an `Experiment` instead.

Error mapping is defined once. `ValueError` from the experiment layer means the caller supplied a
bad parameter, so it becomes HTTP 400 with the library's own message. `KeyError` from a registry
means an unknown name, so it becomes HTTP 404 with the registry's message, which already lists the
available names.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from mirn.contracts import RolloutPair, Scene
from mirn.data.synthetic import (
    BOX_HEIGHT_M,
    BOX_WIDTH_M,
    DISPLACEMENT_AMPLITUDE_M,
    DISPLACEMENT_DECAY_LENGTH_M,
    SyntheticAdapter,
)
from mirn.experiments import EXPERIMENTS, ExperimentResult
from mirn.experiments.calibration_floor import (
    DEFAULT_N_PEDESTRIANS,
    DEFAULT_N_STEPS,
    n_scenes_parameter,
)
from mirn.method.catalog import CARDS, card_for
from mirn.paths import default_seed, results_dir
from mirn.viz.theme import as_css_tokens, css_root_block

_STATIC_DIR = Path(__file__).parent / "static"
_THEME_PLACEHOLDER = "/* MIRN_THEME */"


class RunRequest(BaseModel):
    """Body of `POST /api/experiment/{name}`."""

    params: dict[str, object] = Field(default_factory=dict)
    seed: int = 0


class ExportRequest(BaseModel):
    """Body of `POST /api/export`. `params` is keyed by experiment name."""

    params: dict[str, dict[str, object]] = Field(default_factory=dict)
    seed: int = 0


def _registry_detail(error: KeyError) -> str:
    """A registry KeyError's message, with the repr quoting KeyError adds stripped off."""
    return str(error).strip('"').strip("'")


def _narrative_order(described: dict[str, object]) -> int:
    """Sort key for `/api/meta`'s experiment list: each experiment's declared `order` field."""
    return int(described["order"])  # type: ignore[arg-type]


def _trajectories_as_json(scene: Scene) -> list[dict[str, object]]:
    agents: list[dict[str, object]] = []
    for pedestrian in scene.pedestrians:
        positions: list[list[float]] = []
        for step_index in range(pedestrian.positions.shape[0]):
            point = pedestrian.positions[step_index]
            positions.append([float(point[0]), float(point[1])])
        agents.append({"agent_id": pedestrian.agent_id, "positions": positions})
    return agents


def _gap_series(pair: RolloutPair) -> list[dict[str, object]]:
    """Per-agent distance between the two arms at each timestep.

    Computed here rather than in the browser: the page displays these numbers, and the standing
    rule is that JavaScript renders numbers the API supplies and never derives them.

    Iterates `pair.factual.pedestrians` directly rather than `pair.paired_agents()`: the latter
    sorts agent ids as strings ("ped10" before "ped2"), which diverges from the scene-construction
    order `_trajectories_as_json` uses for `factual`/`counterfactual` as soon as ids reach two
    digits. Looking each counterfactual trajectory up by id keeps this array positionally aligned
    with the other two by construction, not by convention.
    """
    series: list[dict[str, object]] = []
    for factual_traj in pair.factual.pedestrians:
        counterfactual_traj = pair.counterfactual.pedestrian_by_id(factual_traj.agent_id)
        offsets = factual_traj.positions - counterfactual_traj.positions
        distances = np.sqrt(np.sum(offsets * offsets, axis=1))
        gaps: list[float] = []
        for step_index in range(distances.shape[0]):
            gaps.append(float(distances[step_index]))
        series.append({"agent_id": factual_traj.agent_id, "gaps": gaps})
    return series


def create_app() -> FastAPI:
    """Build the application. Constructed per-call so tests get a clean instance."""
    app = FastAPI(title="MIRN instrument", docs_url=None, redoc_url=None)

    app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

    @app.get("/", response_class=HTMLResponse)
    def index() -> HTMLResponse:
        template = (_STATIC_DIR / "index.html").read_text()
        page = template.replace(_THEME_PLACEHOLDER, css_root_block())
        return HTMLResponse(page)

    @app.get("/api/meta")
    def meta() -> dict[str, object]:
        # EXPERIMENTS.names() is alphabetical — a registry lookup convenience, not a reading
        # order. The page walks an argument that has to land in a specific sequence (establish
        # the floor, then show the estimators disagree, then show the naive number climb through
        # that floor, then the placebo), so the described list is re-sorted on each experiment's
        # own declared `order` before it goes out. app.js never sees the unsorted list and never
        # branches on an experiment's name to reorder it itself.
        described: list[dict[str, object]] = []
        for name in EXPERIMENTS.names():
            experiment = EXPERIMENTS.create(name)
            described.append(experiment.describe())
        described.sort(key=_narrative_order)
        body: dict[str, object] = {}
        body["theme"] = as_css_tokens()
        body["default_seed"] = default_seed()
        body["experiments"] = described
        body["data_note"] = (
            "All figures on this page are computed from synthetic paired rollouts. They "
            "demonstrate the instrument; they are not measurements of real pedestrians."
        )
        return body

    @app.post("/api/experiment/{name}")
    def run_experiment(name: str, request: RunRequest) -> dict[str, object]:
        try:
            experiment = EXPERIMENTS.create(name)
        except KeyError as error:
            raise HTTPException(status_code=404, detail=_registry_detail(error)) from error
        try:
            result = experiment.run(request.params, request.seed)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return result.as_json()

    @app.get("/api/method/{key}")
    def method(key: str) -> dict[str, object]:
        try:
            card = card_for(key)
        except KeyError as error:
            raise HTTPException(status_code=404, detail=_registry_detail(error)) from error
        return card.as_dict()

    @app.get("/api/methods")
    def methods() -> dict[str, object]:
        cards: dict[str, object] = {}
        for key in sorted(CARDS.keys()):
            cards[key] = CARDS[key].as_dict()
        return {"cards": cards}

    @app.get("/api/scene")
    def scene(
        influence: float = 1.0,
        seed: int = 0,
        scene_index: int = 0,
        robot_x: float | None = None,
        robot_y: float | None = None,
        amplitude: float | None = None,
        decay: float | None = None,
        n_pedestrians: int | None = None,
    ) -> dict[str, object]:
        if influence < 0.0 or influence > 2.0:
            raise HTTPException(
                status_code=400, detail=f"influence must be between 0.0 and 2.0, got {influence}"
            )
        resolved_robot_x = BOX_WIDTH_M / 2.0 if robot_x is None else robot_x
        resolved_robot_y = BOX_HEIGHT_M / 2.0 if robot_y is None else robot_y
        resolved_amplitude = DISPLACEMENT_AMPLITUDE_M if amplitude is None else amplitude
        resolved_decay = DISPLACEMENT_DECAY_LENGTH_M if decay is None else decay
        resolved_n_pedestrians = DEFAULT_N_PEDESTRIANS if n_pedestrians is None else n_pedestrians
        try:
            adapter = SyntheticAdapter(
                n_scenes=int(n_scenes_parameter().default),  # type: ignore[arg-type]
                n_pedestrians=resolved_n_pedestrians,
                n_steps=DEFAULT_N_STEPS,
                seed=seed,
                robot_position=(resolved_robot_x, resolved_robot_y),
                displacement_amplitude_m=resolved_amplitude,
                displacement_decay_length_m=resolved_decay,
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        pairs = adapter.rollout_pairs_with_influence(influence)
        if scene_index < 0 or scene_index >= len(pairs):
            raise HTTPException(
                status_code=400,
                detail=f"scene_index must be between 0 and {len(pairs) - 1}, got {scene_index}",
            )
        pair = pairs[scene_index]

        robot_positions: list[list[float]] | None = None
        if pair.factual.robot is not None:
            robot_positions = []
            for step_index in range(pair.factual.robot.positions.shape[0]):
                point = pair.factual.robot.positions[step_index]
                robot_positions.append([float(point[0]), float(point[1])])

        reference_trajectory = pair.factual.pedestrians[0]

        body: dict[str, object] = {}
        body["factual"] = _trajectories_as_json(pair.factual)
        body["counterfactual"] = _trajectories_as_json(pair.counterfactual)
        body["robot"] = robot_positions
        body["influence"] = influence
        body["seed"] = seed
        body["extent"] = {"width": BOX_WIDTH_M, "height": BOX_HEIGHT_M}
        body["dt"] = reference_trajectory.dt
        body["n_steps"] = reference_trajectory.positions.shape[0]
        body["gap_series"] = _gap_series(pair)
        return body

    @app.post("/api/export")
    def export(request: ExportRequest) -> dict[str, object]:
        # Phase one: run every experiment and hold the results in memory. A ValueError here
        # becomes HTTP 400 before anything has touched disk, so a bad parameter for the Nth
        # experiment never leaves a stale CSV from the first N-1 behind.
        computed: list[tuple[str, ExperimentResult]] = []
        for name in EXPERIMENTS.names():
            experiment = EXPERIMENTS.create(name)
            if name in request.params:
                params = request.params[name]
            else:
                params = {}
            try:
                result = experiment.run(params, request.seed)
            except ValueError as error:
                raise HTTPException(status_code=400, detail=f"{name}: {error}") from error
            computed.append((name, result))

        # Phase two: every experiment succeeded, so now write every CSV.
        destination = results_dir()
        written: list[str] = []
        for name, result in computed:
            path = destination / f"{name}.csv"
            try:
                result.frame.to_csv(path, index=False)
            except OSError as error:
                already_written = ", ".join(written)
                raise HTTPException(
                    status_code=500,
                    detail=(
                        f"failed writing '{path}': {error}; "
                        f"already written before this failure: {already_written}"
                    ),
                ) from error
            written.append(str(path))
        return {"written": written, "seed": request.seed}

    return app


def run_server(host: str, port: int) -> None:
    """Serve the application. Called only from `mirn.cli._cmd_serve`."""
    import uvicorn

    uvicorn.run(create_app(), host=host, port=port, log_level="warning")
