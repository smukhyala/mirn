"""The coverage gate: registering a divergence or estimator without explaining its mathematics is
a test failure, not a documentation debt. This is the mechanism that keeps the UI's "the
mathematics" panel from silently going blank when the library grows."""

from __future__ import annotations

import pytest

from mirn.divergence import DIVERGENCES
from mirn.estimator import ESTIMATORS
from mirn.method.catalog import CARDS, card_for, cards_of_kind


def test_every_registered_divergence_has_a_card() -> None:
    missing: list[str] = []
    for name in DIVERGENCES.names():
        if name not in CARDS:
            missing.append(name)
    assert missing == [], f"divergences without a MethodCard: {missing}"


def test_every_registered_estimator_has_a_card() -> None:
    missing: list[str] = []
    for name in ESTIMATORS.names():
        if name not in CARDS:
            missing.append(name)
    assert missing == [], f"estimators without a MethodCard: {missing}"


def test_divergence_cards_are_kind_divergence() -> None:
    for name in DIVERGENCES.names():
        assert CARDS[name].kind == "divergence"


def test_estimator_cards_are_kind_estimator() -> None:
    for name in ESTIMATORS.names():
        assert CARDS[name].kind == "estimator"


def test_every_card_key_matches_its_dict_key() -> None:
    for key in CARDS:
        assert CARDS[key].key == key


def test_calibration_steps_have_cards() -> None:
    for key in ("split_half_null", "minimum_detectable_perturbation", "bootstrap_ci"):
        assert key in CARDS
        assert CARDS[key].kind == "calibration"


def test_estimator_card_assumptions_open_with_the_live_identification_string() -> None:
    """The assumption text has exactly one home: the estimator's own identification(). The card
    reads it from the registry rather than restating it, so the two cannot drift."""
    for name in ESTIMATORS.names():
        estimator_cls = ESTIMATORS.get(name)
        instance = estimator_cls()
        card = CARDS[name]
        assert card.assumptions[0] == instance.identification()


def test_the_critiqued_estimator_names_confounding_in_breaks_when() -> None:
    card = CARDS["cvm_residual"]
    joined = " ".join(card.breaks_when).lower()
    assert "forecast error" in joined or "predictor error" in joined


def test_card_for_returns_the_card() -> None:
    assert card_for("ade").key == "ade"


def test_card_for_unknown_key_raises_listing_available() -> None:
    with pytest.raises(KeyError, match="ade"):
        card_for("no_such_component")


def test_cards_of_kind_filters() -> None:
    divergence_cards = cards_of_kind("divergence")
    assert len(divergence_cards) == len(DIVERGENCES.names())
    for card in divergence_cards:
        assert card.kind == "divergence"


def test_cards_of_kind_rejects_an_unknown_kind() -> None:
    with pytest.raises(ValueError, match="divergence, estimator, calibration"):
        cards_of_kind("metric")
