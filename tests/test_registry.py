from __future__ import annotations

import pytest

from mirn.registry import Registry


def test_register_get_create_round_trip() -> None:
    registry = Registry("widget")

    @registry.register("gadget")
    class Gadget:
        def __init__(self, size: int = 1) -> None:
            self.size = size

    looked_up = registry.get("gadget")
    assert looked_up is Gadget

    created = registry.create("gadget", size=3)
    assert type(created) is Gadget
    assert created.size == 3


def test_register_duplicate_name_raises_value_error() -> None:
    registry = Registry("widget")

    @registry.register("gadget")
    class GadgetA:
        pass

    with pytest.raises(ValueError):

        @registry.register("gadget")
        class GadgetB:
            pass


def test_register_same_class_object_twice_is_idempotent() -> None:
    registry = Registry("widget")

    @registry.register("gadget")
    class Gadget:
        pass

    # Re-registering the exact same class object under the same name must be a no-op, not raise.
    result = registry.register("gadget")(Gadget)
    assert result is Gadget
    assert registry.get("gadget") is Gadget
    assert registry.names() == ("gadget",)


def test_register_different_class_same_name_still_raises_after_idempotent_reregistration() -> None:
    registry = Registry("widget")

    @registry.register("gadget")
    class GadgetA:
        pass

    # An idempotent re-registration of GadgetA must not weaken the guard against a genuinely
    # different class later claiming the same name.
    registry.register("gadget")(GadgetA)

    with pytest.raises(ValueError):

        @registry.register("gadget")
        class GadgetB:
            pass


def test_get_unknown_name_raises_key_error_listing_available_names() -> None:
    registry = Registry("widget")

    @registry.register("beta")
    class Beta:
        pass

    @registry.register("alpha")
    class Alpha:
        pass

    with pytest.raises(KeyError) as excinfo:
        registry.get("missing")

    message = str(excinfo.value)
    assert "alpha" in message
    assert "beta" in message
    assert "missing" in message


def test_names_is_sorted() -> None:
    registry = Registry("widget")

    @registry.register("zeta")
    class Zeta:
        pass

    @registry.register("alpha")
    class Alpha:
        pass

    @registry.register("mu")
    class Mu:
        pass

    assert registry.names() == ("alpha", "mu", "zeta")


def test_kind_appears_in_error_messages() -> None:
    registry = Registry("divergence")

    with pytest.raises(KeyError) as excinfo:
        registry.get("nope")

    assert "divergence" in str(excinfo.value)
