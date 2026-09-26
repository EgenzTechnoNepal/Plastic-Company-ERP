"""Inventory domain services — UOM conversion, lot status, landed-cost preview."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

from apps.core.exceptions import ERPError, InvalidStatusTransitionError
from apps.inventory.models import (
    AllocationBasis,
    InventoryLot,
    LOT_STATUS_TRANSITIONS,
    LandedCostComponent,
    LandedCostDocument,
    LandedCostDocumentStatus,
    UnitOfMeasure,
    UomConversion,
)


class UomConversionError(ERPError):
    default_code = "INVALID_UOM_CONVERSION"


class LandedCostError(ERPError):
    default_code = "INVALID_LANDED_COST"


MONEY_QUANT = Decimal("0.0001")
UNIT_COST_QUANT = Decimal("0.000001")


def _as_decimal(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def convert_quantity(quantity, from_uom: UnitOfMeasure, to_uom: UnitOfMeasure) -> Decimal:
    """
    Convert quantity between UOMs using stored conversion factors.
    Supports direct factor, inverse factor, and identity.
    Critical conversions must not be done only in React.
    """
    qty = _as_decimal(quantity)
    if qty < 0:
        raise UomConversionError("Quantity cannot be negative.", code="NEGATIVE_QUANTITY")
    if from_uom.pk == to_uom.pk:
        return qty

    direct = UomConversion.objects.filter(from_uom=from_uom, to_uom=to_uom, is_active=True).first()
    if direct:
        return (qty * direct.factor).quantize(UNIT_COST_QUANT)

    inverse = UomConversion.objects.filter(from_uom=to_uom, to_uom=from_uom, is_active=True).first()
    if inverse:
        return (qty / inverse.factor).quantize(UNIT_COST_QUANT)

    # One-hop via a shared hub (e.g. G→TON via KG)
    from_edges = list(
        UomConversion.objects.filter(from_uom=from_uom, is_active=True).select_related("to_uom")
    )
    for edge in from_edges:
        mid = edge.to_uom
        second = UomConversion.objects.filter(from_uom=mid, to_uom=to_uom, is_active=True).first()
        if second:
            return (qty * edge.factor * second.factor).quantize(UNIT_COST_QUANT)
        second_inv = UomConversion.objects.filter(from_uom=to_uom, to_uom=mid, is_active=True).first()
        if second_inv:
            return (qty * edge.factor / second_inv.factor).quantize(UNIT_COST_QUANT)

    to_edges = list(
        UomConversion.objects.filter(to_uom=from_uom, is_active=True).select_related("from_uom")
    )
    for edge in to_edges:
        mid = edge.from_uom
        # qty in from = qty / edge.factor in mid, then mid → to
        second = UomConversion.objects.filter(from_uom=mid, to_uom=to_uom, is_active=True).first()
        if second:
            return (qty / edge.factor * second.factor).quantize(UNIT_COST_QUANT)

    raise UomConversionError(
        f"No conversion path from {from_uom.code} to {to_uom.code}.",
        code="INVALID_UOM_CONVERSION",
    )


def transition_lot_status(lot: InventoryLot, new_status: str, *, user=None) -> InventoryLot:
    allowed = LOT_STATUS_TRANSITIONS.get(lot.status, set())
    if new_status not in allowed:
        raise InvalidStatusTransitionError(
            f"Cannot transition lot from {lot.status} to {new_status}.",
            fields={"from": lot.status, "to": new_status},
        )
    lot.status = new_status
    if user is not None:
        lot.updated_by = user
    lot.save(update_fields=["status", "updated_by", "updated_at"])
    return lot


def preview_landed_cost(document: LandedCostDocument) -> dict:
    """
    Domain-service preview: preserves purchase value and component breakdown.
    Does NOT post to stock ledger (Phase 2).
    """
    purchase_qty = _as_decimal(document.purchase_quantity)
    purchase_unit = _as_decimal(document.purchase_unit_cost)
    purchase_value = (purchase_qty * purchase_unit).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    if document.purchase_value != purchase_value:
        document.purchase_value = purchase_value
        document.save(update_fields=["purchase_value", "updated_at"])

    components = list(document.components.filter(is_active=True))
    additional = sum((_as_decimal(c.base_currency_amount) for c in components), Decimal("0"))
    additional = additional.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    landed_total = (purchase_value + additional).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

    landed_unit = None
    if purchase_qty > 0:
        landed_unit = (landed_total / purchase_qty).quantize(UNIT_COST_QUANT, rounding=ROUND_HALF_UP)

    if document.status == LandedCostDocumentStatus.DRAFT:
        document.status = LandedCostDocumentStatus.PREVIEWED
        document.save(update_fields=["status", "updated_at"])

    return {
        "document_id": str(document.id),
        "document_number": document.document_number,
        "purchase_quantity": str(purchase_qty),
        "purchase_unit_cost": str(purchase_unit),
        "purchase_value": str(purchase_value),
        "additional_costs_total": str(additional),
        "landed_total": str(landed_total),
        "landed_unit_cost": str(landed_unit) if landed_unit is not None else None,
        "components": [
            {
                "id": str(c.id),
                "category": c.category,
                "amount": str(c.amount),
                "currency": c.currency.code if c.currency_id else None,
                "exchange_rate": str(c.exchange_rate),
                "base_currency_amount": str(c.base_currency_amount),
                "allocation_basis": c.allocation_basis,
            }
            for c in components
        ],
    }


VALID_ALLOCATION_BASES = {c.value for c in AllocationBasis}


def validate_allocation_basis(basis: str) -> str:
    if basis not in VALID_ALLOCATION_BASES:
        raise LandedCostError(
            f"Invalid allocation basis: {basis}",
            code="INVALID_ALLOCATION_BASIS",
            fields={"allocation_basis": basis},
        )
    return basis


@transaction.atomic
def create_landed_component(
    document: LandedCostDocument,
    *,
    category: str,
    amount,
    currency,
    exchange_rate=Decimal("1"),
    allocation_basis: str = AllocationBasis.VALUE,
    tax_amount=Decimal("0"),
    supplier=None,
    source_document: str = "",
    source_document_number: str = "",
    cost_date=None,
    description: str = "",
    notes: str = "",
    user=None,
) -> LandedCostComponent:
    validate_allocation_basis(allocation_basis)
    amt = _as_decimal(amount)
    fx = _as_decimal(exchange_rate)
    tax = _as_decimal(tax_amount)
    if amt < 0 or tax < 0:
        raise LandedCostError("Amounts cannot be negative.", code="NEGATIVE_AMOUNT")
    if fx <= 0:
        raise LandedCostError("Exchange rate must be positive.", code="INVALID_EXCHANGE_RATE")

    base = (amt * fx).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    component = LandedCostComponent(
        document=document,
        category=category,
        description=description,
        amount=amt,
        currency=currency,
        exchange_rate=fx,
        base_currency_amount=base,
        supplier=supplier,
        source_document=source_document,
        source_document_number=source_document_number,
        tax_amount=tax,
        cost_date=cost_date,
        allocation_basis=allocation_basis,
        notes=notes,
        created_by=user,
        updated_by=user,
    )
    component.full_clean()
    component.save()
    return component
