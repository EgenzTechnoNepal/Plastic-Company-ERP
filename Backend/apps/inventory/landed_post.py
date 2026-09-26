"""Landed cost posting and late adjustments — never overwrite purchase_unit_cost."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.events import LANDED_COST_POSTED, emit
from apps.inventory.ledger import StockTxnType
from apps.inventory.models import (
    AllocationBasis,
    InventoryReceiptLayer,
    LandedCostAllocation,
    LandedCostComponent,
    LandedCostDocument,
    LandedCostDocumentStatus,
)
from apps.inventory.services import (
    MONEY_QUANT,
    UNIT_COST_QUANT,
    LandedCostError,
    _as_decimal,
    preview_landed_cost,
    validate_allocation_basis,
)
from apps.inventory.stock_services import append_ledger_entry, assert_objects_same_company
from apps.organization.company_scope import assert_company_allowed


def _lot_purchase_value(lot, document: LandedCostDocument) -> Decimal:
    qty = _as_decimal(document.purchase_quantity) or _as_decimal(lot.initial_quantity)
    unit = _as_decimal(lot.purchase_unit_cost)
    return (qty * unit).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _sum_posted_additional_for_lot(lot, *, include_document: LandedCostDocument | None = None) -> Decimal:
    """Sum base_currency_amount of components on all POSTED docs for lot, plus include_document if posting."""
    posted_ids = list(
        LandedCostDocument.objects.filter(
            lot=lot, status=LandedCostDocumentStatus.POSTED, is_active=True
        ).values_list("id", flat=True)
    )
    if include_document is not None and include_document.id not in posted_ids:
        posted_ids.append(include_document.id)
    if not posted_ids:
        return Decimal("0")
    total = (
        LandedCostComponent.objects.filter(document_id__in=posted_ids, is_active=True).aggregate(
            t=Sum("base_currency_amount")
        )["t"]
        or Decimal("0")
    )
    return _as_decimal(total)


@transaction.atomic
def post_landed_cost(*, document: LandedCostDocument, user=None) -> dict:
    document = (
        LandedCostDocument.objects.select_for_update()
        .prefetch_related("components")
        .select_related("lot", "company")
        .get(pk=document.pk)
    )
    assert_company_allowed(user, document.company_id)
    if document.status == LandedCostDocumentStatus.POSTED:
        raise LandedCostError("Landed cost document already posted.", code="DUPLICATE_POST")
    if document.status == LandedCostDocumentStatus.CANCELLED:
        raise LandedCostError("Cancelled document cannot be posted.")

    # Ensure purchase snapshot on document
    preview = preview_landed_cost(document)
    purchase_unit = _as_decimal(document.purchase_unit_cost)
    purchase_qty = _as_decimal(document.purchase_quantity)
    if purchase_qty <= 0:
        raise LandedCostError("Cannot post without positive purchase quantity.")

    if document.lot_id:
        lot = document.lot
        assert_objects_same_company(document.company, lot=lot)
        # Never overwrite purchase on lot — reaffirm from lot or document
        purchase_unit = _as_decimal(lot.purchase_unit_cost) or purchase_unit
        document.purchase_unit_cost = purchase_unit
        document.purchase_value = (purchase_qty * purchase_unit).quantize(MONEY_QUANT)
        document.save(update_fields=["purchase_unit_cost", "purchase_value", "updated_at"])

        additional = _sum_posted_additional_for_lot(lot, include_document=document)
        purchase_value = (purchase_qty * purchase_unit).quantize(MONEY_QUANT)
        landed_total = (purchase_value + additional).quantize(MONEY_QUANT)
        landed_unit_dec = (landed_total / purchase_qty).quantize(UNIT_COST_QUANT, rounding=ROUND_HALF_UP)

        lot.purchase_unit_cost = purchase_unit
        lot.landed_unit_cost = landed_unit_dec
        lot.save(update_fields=["purchase_unit_cost", "landed_unit_cost", "updated_at"])
        layers = InventoryReceiptLayer.objects.select_for_update().filter(lot=lot)
        for layer in layers:
            layer.purchase_unit_cost = purchase_unit
            layer.landed_unit_cost = landed_unit_dec
            layer.save(update_fields=["purchase_unit_cost", "landed_unit_cost", "updated_at"])

        if not document.allocations.exists():
            for component in document.components.filter(is_active=True):
                validate_allocation_basis(component.allocation_basis)
                LandedCostAllocation.objects.create(
                    document=document,
                    component=component,
                    lot=lot,
                    item=lot.item,
                    allocation_basis=component.allocation_basis or AllocationBasis.VALUE,
                    basis_value=document.purchase_quantity,
                    allocated_amount=component.base_currency_amount,
                    created_by=user,
                    updated_by=user,
                )

        append_ledger_entry(
            company=document.company,
            item=lot.item,
            lot=lot,
            warehouse=lot.warehouse,
            bin=lot.bin,
            txn_type=StockTxnType.LANDED_COST_REVALUE,
            uom=lot.uom,
            unit_cost=landed_unit_dec,
            reference_type="LANDED_COST",
            reference_id=document.id,
            user=user,
            reason=f"Landed cost revalue {document.document_number}",
            is_state_event=True,
        )
    else:
        landed_unit_dec = _as_decimal(preview["landed_unit_cost"] or 0)
        purchase_value = _as_decimal(preview["purchase_value"])
        landed_total = _as_decimal(preview["landed_total"])
        additional = landed_total - purchase_value

    document.status = LandedCostDocumentStatus.POSTED
    document.posted_at = timezone.now()
    document.posted_by = user
    document.updated_by = user
    document.save(update_fields=["status", "posted_at", "posted_by", "updated_by", "updated_at"])
    emit(
        LANDED_COST_POSTED,
        {
            "document_id": str(document.id),
            "landed_unit_cost": str(landed_unit_dec),
            "purchase_unit_cost": str(purchase_unit),
        },
    )
    return {
        "document_id": str(document.id),
        "document_number": document.document_number,
        "purchase_quantity": str(purchase_qty),
        "purchase_unit_cost": str(purchase_unit),
        "purchase_value": str(purchase_value),
        "additional_costs_total": str(additional),
        "landed_total": str(landed_total),
        "landed_unit_cost": str(landed_unit_dec),
        "status": LandedCostDocumentStatus.POSTED,
    }


@transaction.atomic
def adjust_landed_cost(*, document: LandedCostDocument, user=None) -> dict:
    """Late landed-cost document post — cumulative revalue; never rewrites GRN."""
    return post_landed_cost(document=document, user=user)
