"""Dataset adapters: the `DatasetAdapter` ABC, the `DATASETS` registry, and concrete adapters.

Importing this package registers every built-in adapter (`peroi`, `synthetic`) into `DATASETS`
as a side effect of importing their modules.
"""

from __future__ import annotations

from mirn.data import peroi, synthetic
from mirn.data.base import DATASETS, DatasetAdapter

__all__ = ["DATASETS", "DatasetAdapter", "peroi", "synthetic"]
