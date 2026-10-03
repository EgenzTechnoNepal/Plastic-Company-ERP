"""Resolve QC / quarantine / rejected bins for a warehouse (Phase 3 plant gate)."""

from __future__ import annotations

from apps.warehouse.models import Bin, BinType


_BIN_DEFAULTS = {
    BinType.QC_HOLD: ("QC-HOLD", "QC Hold"),
    BinType.QUARANTINE: ("QUARANTINE", "Quarantine"),
    BinType.REJECTED: ("REJECTED", "Rejected"),
}


def get_or_create_typed_bin(*, warehouse, bin_type: str, user=None) -> Bin:
    """
    Return an active bin of the given type for the warehouse, creating one if missing.
    """
    existing = (
        Bin.objects.filter(warehouse=warehouse, bin_type=bin_type, is_active=True)
        .order_by("code")
        .first()
    )
    if existing:
        return existing
    code, name = _BIN_DEFAULTS.get(bin_type, (bin_type[:40], bin_type.replace("_", " ").title()))
    # Avoid unique constraint collisions if code exists with different type
    if Bin.objects.filter(warehouse=warehouse, code=code).exists():
        code = f"{code}-{str(warehouse.id)[:4]}"
    return Bin.objects.create(
        warehouse=warehouse,
        code=code,
        name=name,
        bin_type=bin_type,
        created_by=user,
        updated_by=user,
    )


def resolve_qc_hold_bin(*, warehouse, user=None) -> Bin:
    return get_or_create_typed_bin(warehouse=warehouse, bin_type=BinType.QC_HOLD, user=user)


def resolve_quarantine_bin(*, warehouse, user=None) -> Bin:
    return get_or_create_typed_bin(warehouse=warehouse, bin_type=BinType.QUARANTINE, user=user)


def resolve_rejected_bin(*, warehouse, user=None) -> Bin:
    return get_or_create_typed_bin(warehouse=warehouse, bin_type=BinType.REJECTED, user=user)
