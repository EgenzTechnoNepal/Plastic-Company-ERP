"""
DRF-friendly pagination + envelope live in pagination.py. This module keeps a
thin alias so views can `from apps.core.responses import envelope` without
caring whether the payload is paginated.
"""

from apps.core.pagination import envelope

__all__ = ["envelope"]
