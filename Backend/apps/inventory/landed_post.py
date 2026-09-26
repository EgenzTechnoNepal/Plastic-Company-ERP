"""Landed cost posting and late adjustments — never overwrite purchase_unit_cost."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

from apps.core.events import LANDED_COST_POSTED, emit
from apps.inventory.ledger import StockTxnType
from apps.inventory.models import (
    AllocationBasis,
    InventoryReceiptLayer,
    LandedCostAllocation,
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
from apps.inventory.stock_services import append_ledger_entry
from apps.organization.company_scope import assert_company_allowed


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

    preview = preview_landed_cost(document)
    landed_unit = preview["landed_unit_cost"]
    if landed_unit is None:
        raise LandedCostError("Cannot post without positive purchase quantity.")

    landed_unit_dec = _as_decimal(landed_unit)
    purchase_unit = _as_decimal(document.purchase_unit_cost)
    # Never overwrite purchase
    if document.lot_id:
        lot = document.lot
        lot.purchase_unit_cost = purchase_unit  # preserve / reaffirm
        lot.landed_unit_cost = landed_unit_dec
        lot.save(update_fields=["purchase_unit_cost", "landed_unit_cost", "updated_at"])
        layers = InventoryReceiptLayer.objects.select_for_update().filter(lot=lot)
        for layer in layers:
            layer.purchase_unit_cost = purchase_unit
            layer.landed_unit_cost = landed_unit_dec
            layer.save(update_fields=["purchase_unit_cost", "landed_unit_cost", "updated_at"])

        # Allocate components if no allocations yet
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
            reason=f"Landed cost posted {document.document_number}",
        )

    document.status = LandedCostDocumentStatus.POSTED
    document.posted_at = timezone.now()
    document.posted_by = user
    document.updated_by = user
    document.save(update_fields=["status", "posted_at", "posted_by", "updated_by", "updated_at"])
    emit(LANDED_COST_POSTED, {"document_id": str(document.id), "landed_unit_cost": landed_unit})
    result = dict(preview)
    result["status"] = LandedCostDocumentStatus.POSTED
    result["purchase_unit_cost"] = str(purchase_unit)
    return result


@transaction.atomic
def adjust_landed_cost(*, document: LandedCostDocument, user=None) -> dict:
    """
    Late landed-cost posting after receipt.
    Same as post for DRAFT/PREVIEWED documents linked to an existing lot;
    creates auditable revalue without rewriting GRN.
    """
    return post_landed_cost(document=document, user=user)
