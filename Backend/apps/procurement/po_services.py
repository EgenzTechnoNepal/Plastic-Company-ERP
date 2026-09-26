"""Phase 3 PO domain services — commercial only; never creates stock."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.events import emit
from apps.core.exceptions import ERPError, InvalidStatusTransitionError
from apps.core.phase3_policy import over_receipt_allowed
from apps.core.services.numbering import generate_document_number
from apps.inventory.services import _as_decimal
from apps.organization.company_scope import assert_company_allowed, assert_related_same_company
from apps.procurement.commercial import (
    PO_TRANSITIONS,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseOrderStatus,
)


class PurchaseOrderError(ERPError):
    default_code = "PURCHASE_ORDER_ERROR"


def _transition_po(po: PurchaseOrder, new_status: str) -> PurchaseOrder:
    allowed = PO_TRANSITIONS.get(po.status, set())
    if new_status not in allowed:
        raise InvalidStatusTransitionError(
            f"Cannot transition PO from {po.status} to {new_status}.",
            fields={"from": po.status, "to": new_status},
        )
    po.status = new_status
    po.save(update_fields=["status", "updated_at"])
    return po


@transaction.atomic
def create_purchase_order(*, company, supplier, user=None, **fields) -> PurchaseOrder:
    assert_company_allowed(user, company.id)
    assert_related_same_company(company.id, "supplier", supplier)
    wh = fields.get("destination_warehouse")
    if wh is not None:
        assert_related_same_company(company.id, "destination_warehouse", wh)
    number = generate_document_number("PO")
    po = PurchaseOrder.objects.create(
        company=company,
        document_number=number,
        supplier=supplier,
        created_by=user,
        updated_by=user,
        **{k: v for k, v in fields.items() if k != "lines"},
    )
    return po


@transaction.atomic
def add_po_line(*, purchase_order: PurchaseOrder, item, uom, ordered_quantity, user=None, **fields) -> PurchaseOrderLine:
    po = PurchaseOrder.objects.select_for_update().get(pk=purchase_order.pk)
    assert_company_allowed(user, po.company_id)
    if po.status != PurchaseOrderStatus.DRAFT:
        raise PurchaseOrderError("Lines can only be added to DRAFT POs.")
    assert_related_same_company(po.company_id, "item", item)
    qty = _as_decimal(ordered_quantity)
    if qty <= 0:
        raise PurchaseOrderError("Ordered quantity must be positive.")
    last = po.lines.order_by("-line_no").values_list("line_no", flat=True).first() or 0
    return PurchaseOrderLine.objects.create(
        purchase_order=po,
        line_no=int(last) + 1,
        item=item,
        uom=uom,
        ordered_quantity=qty,
        created_by=user,
        updated_by=user,
        **fields,
    )


@transaction.atomic
def submit_purchase_order(*, purchase_order: PurchaseOrder, user=None) -> PurchaseOrder:
    po = PurchaseOrder.objects.select_for_update().prefetch_related("lines").get(pk=purchase_order.pk)
    assert_company_allowed(user, po.company_id)
    if not po.lines.exists():
        raise PurchaseOrderError("PO must have at least one line.")
    _transition_po(po, PurchaseOrderStatus.SUBMITTED)
    emit("PurchaseOrderSubmitted", {"po_id": str(po.id), "document_number": po.document_number})
    return po


@transaction.atomic
def approve_purchase_order(*, purchase_order: PurchaseOrder, user=None) -> PurchaseOrder:
    po = PurchaseOrder.objects.select_for_update().get(pk=purchase_order.pk)
    assert_company_allowed(user, po.company_id)
    _transition_po(po, PurchaseOrderStatus.APPROVED)
    po.approved_at = timezone.now()
    po.approved_by = user
    po.updated_by = user
    po.save(update_fields=["approved_at", "approved_by", "updated_by", "updated_at"])
    emit("PurchaseOrderApproved", {"po_id": str(po.id), "document_number": po.document_number})
    return po


@transaction.atomic
def cancel_purchase_order(*, purchase_order: PurchaseOrder, user=None) -> PurchaseOrder:
    po = PurchaseOrder.objects.select_for_update().prefetch_related("lines").get(pk=purchase_order.pk)
    assert_company_allowed(user, po.company_id)
    if any(_as_decimal(l.received_quantity) > 0 for l in po.lines.all()):
        raise PurchaseOrderError(
            "Cannot cancel PO with posted receipts.",
            code="HAS_RECEIPTS",
        )
    _transition_po(po, PurchaseOrderStatus.CANCELLED)
    emit("PurchaseOrderCancelled", {"po_id": str(po.id)})
    return po


@transaction.atomic
def apply_po_receipt_progress(*, purchase_order_line: PurchaseOrderLine, accepted_qty, user=None) -> PurchaseOrderLine:
    """Called from GRN post when a line is linked to a PO line."""
    line = PurchaseOrderLine.objects.select_for_update().select_related("purchase_order").get(
        pk=purchase_order_line.pk
    )
    po = PurchaseOrder.objects.select_for_update().get(pk=line.purchase_order_id)
    assert_company_allowed(user, po.company_id)
    if po.status in {PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.CLOSED, PurchaseOrderStatus.DRAFT}:
        raise PurchaseOrderError(f"Cannot receive against PO in status {po.status}.")
    if po.status == PurchaseOrderStatus.SUBMITTED:
        raise PurchaseOrderError("PO must be APPROVED before receipt.")

    incoming = _as_decimal(accepted_qty)
    if incoming <= 0:
        return line
    if not over_receipt_allowed(line.ordered_quantity, line.received_quantity, incoming):
        raise PurchaseOrderError(
            "Over-receipt exceeds configured tolerance.",
            code="OVER_RECEIPT",
            fields={
                "ordered": str(line.ordered_quantity),
                "received": str(line.received_quantity),
                "incoming": str(incoming),
            },
        )
    line.received_quantity = _as_decimal(line.received_quantity) + incoming
    line.updated_by = user
    line.save(update_fields=["received_quantity", "updated_by", "updated_at"])

    # Refresh PO status from all lines
    lines = list(PurchaseOrderLine.objects.filter(purchase_order=po))
    any_received = any(_as_decimal(l.received_quantity) > 0 for l in lines)
    all_complete = all(
        _as_decimal(l.received_quantity) >= (_as_decimal(l.ordered_quantity) - _as_decimal(l.cancelled_quantity))
        for l in lines
    )
    if all_complete and any_received:
        if po.status not in {PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.CLOSED}:
            po.status = PurchaseOrderStatus.RECEIVED
            po.save(update_fields=["status", "updated_at"])
    elif any_received and po.status not in {
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
        PurchaseOrderStatus.RECEIVED,
        PurchaseOrderStatus.CLOSED,
    }:
        po.status = PurchaseOrderStatus.PARTIALLY_RECEIVED
        po.save(update_fields=["status", "updated_at"])

    emit(
        "PurchaseOrderReceiptProgress",
        {
            "po_id": str(po.id),
            "line_id": str(line.id),
            "received_quantity": str(line.received_quantity),
            "status": po.status,
        },
    )
    return line
