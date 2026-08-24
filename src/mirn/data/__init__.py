"""Dataset adapters: the `DatasetAdapter` ABC, the `DATASETS` registry, and concrete adapters.

Importing this package registers every built-in adapter (`synthetic`) into `DATASETS`
as a side effect of importing their modules.
"""

from __future__ import annotations

from mirn.data import synthetic
from mirn.data.base import DATASETS, DatasetAdapter

__all__ = ["DATASETS", "DatasetAdapter", "synthetic"]
