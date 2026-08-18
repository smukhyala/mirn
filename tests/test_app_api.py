"""API contract tests. No network: FastAPI's TestClient calls the app in-process."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from mirn.data.synthetic import BOX_HEIGHT_M, BOX_WIDTH_M
from mirn.experiments import EXPERIMENTS
from mirn.method.catalog import CARDS
from mirn_app.server import create_app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app())


def test_index_serves_html_with_the_theme_injected(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "--mirn-background" in response.text
    assert "MIRN_THEME" not in response.text, "the theme placeholder was not substituted"


def test_meta_lists_every_registered_experiment(client: TestClient) -> None:
    response = client.get("/api/meta")
    assert response.status_code == 200
    body = response.json()
    listed: list[str] = []
    for entry in body["experiments"]:
        listed.append(entry["name"])
    assert sorted(listed) == sorted(EXPERIMENTS.names())


def test_meta_carries_theme_tokens_and_a_default_seed(client: TestClient) -> None:
    body = client.get("/api/meta").json()
    assert body["theme"]["--mirn-paired"].startswith("#")
    assert type(body["default_seed"]) is int


def test_meta_parameters_are_rich_enough_to_build_a_control(client: TestClient) -> None:
    body = client.get("/api/meta").json()
    for entry in body["experiments"]:
        for parameter in entry["parameters"]:
            assert parameter["kind"] in ("float", "int", "choice")
            assert len(parameter["label"]) > 0
            if parameter["kind"] == "choice":
                assert len(parameter["choices"]) > 0
            else:
                assert parameter["minimum"] is not None
                assert parameter["maximum"] is not None


def test_running_an_experiment_returns_rows_and_payload(client: TestClient) -> None:
    response = client.post(
        "/api/experiment/calibration_floor",
        json={"params": {"n_scenes": 3, "n_splits": 20}, "seed": 0},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["experiment_name"] == "calibration_floor"
    assert len(body["rows"]) == 1
    assert body["payload"]["mdp_95"] > 0.0
    assert "split_half_null" in body["method_keys"]


def test_running_an_unknown_experiment_returns_404_listing_available(client: TestClient) -> None:
    response = client.post("/api/experiment/nope", json={"params": {}, "seed": 0})
    assert response.status_code == 404
    assert "calibration_floor" in response.json()["detail"]


def test_an_unknown_parameter_returns_400_with_the_library_message(client: TestClient) -> None:
    response = client.post(
        "/api/experiment/calibration_floor", json={"params": {"bogus": 1}, "seed": 0}
    )
    assert response.status_code == 400
    assert "unknown parameter" in response.json()["detail"]


def test_an_out_of_range_parameter_returns_400(client: TestClient) -> None:
    response = client.post(
        "/api/experiment/calibration_floor", json={"params": {"n_scenes": 9999}, "seed": 0}
    )
    assert response.status_code == 400
    assert "n_scenes" in response.json()["detail"]


def test_method_endpoint_returns_a_card(client: TestClient) -> None:
    body = client.get("/api/method/paired").json()
    assert body["key"] == "paired"
    assert body["kind"] == "estimator"
    assert len(body["formula_tex"]) > 0
    assert len(body["breaks_when"]) > 0


def test_unknown_method_returns_404_listing_available(client: TestClient) -> None:
    response = client.get("/api/method/nope")
    assert response.status_code == 404
    assert "paired" in response.json()["detail"]


def test_scene_endpoint_returns_both_arms(client: TestClient) -> None:
    response = client.get("/api/scene", params={"influence": 1.0, "seed": 0, "scene_index": 0})
    assert response.status_code == 200
    body = response.json()
    assert len(body["factual"]) == len(body["counterfactual"])
    assert len(body["factual"]) > 0
    first_path = body["factual"][0]["positions"]
    assert len(first_path[0]) == 2
    assert body["robot"] is not None
    assert body["extent"]["width"] > 0.0


def test_scene_extent_matches_the_synthetic_fixture_geometry(client: TestClient) -> None:
    """The canvas Task 14 draws into must track the fixture's actual box size, not a literal
    that could silently drift out of sync with `mirn.data.synthetic`."""
    body = client.get("/api/scene", params={"seed": 0}).json()
    assert body["extent"]["width"] == BOX_WIDTH_M
    assert body["extent"]["height"] == BOX_HEIGHT_M


def test_scene_arms_are_identical_at_zero_influence(client: TestClient) -> None:
    body = client.get("/api/scene", params={"influence": 0.0, "seed": 0}).json()
    assert body["factual"][0]["positions"] == body["counterfactual"][0]["positions"]


def test_scene_index_out_of_range_returns_400(client: TestClient) -> None:
    response = client.get("/api/scene", params={"scene_index": 999, "seed": 0})
    assert response.status_code == 400


def test_export_writes_every_experiment_csv(client: TestClient, tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("MIRN_RESULTS_DIR", str(tmp_path))
    response = client.post(
        "/api/export",
        json={"seed": 0, "params": {"calibration_floor": {"n_scenes": 3, "n_splits": 20}}},
    )
    assert response.status_code == 200
    written = response.json()["written"]
    assert len(written) == len(EXPERIMENTS.names())
    for path in written:
        assert path.endswith(".csv")


def test_export_bad_param_for_a_non_first_experiment_leaves_no_stale_csv(
    client: TestClient, tmp_path, monkeypatch
) -> None:
    """`calibration_floor` sorts before `confounding_sweep` in `EXPERIMENTS.names()`, so a bad
    parameter on `confounding_sweep` would previously leave `calibration_floor.csv` already
    written on disk with no way for the caller to tell the run had failed. The two-phase design
    must run every experiment (in memory) before writing anything, so this bad request must
    leave `results_dir()` completely empty."""
    monkeypatch.setenv("MIRN_RESULTS_DIR", str(tmp_path))
    response = client.post(
        "/api/export",
        json={"seed": 0, "params": {"confounding_sweep": {"bogus": 1}}},
    )
    assert response.status_code == 400
    assert "written" not in response.json()
    remaining = list(tmp_path.iterdir())
    assert remaining == []


def test_methods_endpoint_returns_every_card(client: TestClient) -> None:
    response = client.get("/api/methods")
    assert response.status_code == 200
    body = response.json()
    cards = body["cards"]
    assert sorted(cards.keys()) == sorted(CARDS.keys())
    spot_checked = cards["paired"]
    assert spot_checked["key"] == "paired"
    assert spot_checked["kind"] == "estimator"
    assert len(spot_checked["formula_tex"]) > 0
