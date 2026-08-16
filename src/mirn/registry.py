"""A tiny name -> type registry used for every pluggable extension point in mirn.

Concrete implementations of an ABC (divergences, dataset adapters, estimators, ...) register
themselves into a module-level `Registry` instance via the `@registry.register("name")` decorator.
Callers then look implementations up by name rather than writing `if name == ...` dispatch chains.
"""

from __future__ import annotations

from collections.abc import Callable


class Registry:
    """A named collection of registered types, keyed by string name.

    `kind` is a human-readable label (e.g. "divergence", "estimator") used only to make error
    messages legible; it has no effect on lookup behaviour.
    """

    def __init__(self, kind: str) -> None:
        self._kind = kind
        self._entries: dict[str, type] = {}

    def register(self, name: str) -> Callable[[type], type]:
        """Return a class decorator that registers the decorated type under `name`.

        Raises ValueError if `name` is already registered.
        """

        def decorator(cls: type) -> type:
            if name in self._entries:
                message = (
                    f"{self._kind} '{name}' is already registered "
                    f"(existing entry: {self._entries[name]!r})"
                )
                raise ValueError(message)
            self._entries[name] = cls
            return cls

        return decorator

    def get(self, name: str) -> type:
        """Look up a registered type by name.

        Raises KeyError with a message listing the sorted available names if `name` is absent.
        """
        if name not in self._entries:
            available = self.names()
            message = (
                f"unknown {self._kind} '{name}'; available: {', '.join(available)}"
            )
            raise KeyError(message)
        return self._entries[name]

    def names(self) -> tuple[str, ...]:
        """Return all registered names, sorted."""
        return tuple(sorted(self._entries.keys()))

    def create(self, name: str, **kwargs: object) -> object:
        """Construct a registered type by name: `get(name)(**kwargs)`."""
        cls = self.get(name)
        return cls(**kwargs)
