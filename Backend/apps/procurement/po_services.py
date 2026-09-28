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
    PO_AMENDABLE_STATUSES,
    PO_CLOSEABLE_STATUSES,
    PO_TRANSITIONS,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseOrderStatus,
)


class PurchaseOrderError(ERPError):
    default_code = "PURCHASE_ORDER_ERROR"


def _line_remaining_receivable(line: PurchaseOrderLine) -> Decimal:
    return (
        _as_decimal(line.ordered_quantity)
        - _as_decimal(line.received_quantity)
        - _as_decimal(line.cancelled_quantity)
    )


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


def _refresh_po_receipt_status(po: PurchaseOrder) -> None:
    """Recompute PARTIALLY_RECEIVED / RECEIVED from lines after cancel/receipt."""
    if po.status in {PurchaseOrderStatus.CLOSED, PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.DRAFT}:
        return
    lines = list(PurchaseOrderLine.objects.filter(purchase_order=po))
    if not lines:
        return
    any_received = any(_as_decimal(l.received_quantity) > 0 for l in lines)
    all_complete = all(_line_remaining_receivable(l) <= 0 for l in lines)
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


def _line_remaining_receivable(line: PurchaseOrderLine) -> Decimal:
    return (
        _as_decimal(line.ordered_quantity)
        - _as_decimal(line.received_quantity)
        - _as_decimal(line.cancelled_quantity)
    )


@transaction.atomic
def mark_po_sent(*, purchase_order: PurchaseOrder, user=None) -> PurchaseOrder:
    po = PurchaseOrder.objects.select_for_update().get(pk=purchase_order.pk)
    assert_company_allowed(user, po.company_id)
    _transition_po(po, PurchaseOrderStatus.SENT)
    po.updated_by = user
    po.save(update_fields=["updated_by", "updated_at"])
    emit("PurchaseOrderSent", {"po_id": str(po.id), "document_number": po.document_number})
    return po


@transaction.atomic
def close_purchase_order(*, purchase_order: PurchaseOrder, user=None) -> PurchaseOrder:
    from apps.procurement.commercial import PO_CLOSEABLE_STATUSES

    po = (
        PurchaseOrder.objects.select_for_update()
        .prefetch_related("lines")
        .get(pk=purchase_order.pk)
    )
    assert_company_allowed(user, po.company_id)
    if po.status not in PO_CLOSEABLE_STATUSES:
        raise PurchaseOrderError(
            f"Cannot close PO in status {po.status}.",
            code="INVALID_STATUS",
            fields={"status": po.status},
        )
    lines = list(po.lines.select_for_update())
    if not lines:
        raise PurchaseOrderError("PO has no lines.")
    remaining = []
    for line in lines:
        rem = _line_remaining_receivable(line)
        if rem > 0:
            remaining.append(
                {
                    "line_no": line.line_no,
                    "remaining_receivable": str(rem),
                }
            )
    if remaining:
        raise PurchaseOrderError(
            "Cannot close PO while lines still have receivable quantity. "
            "Cancel remaining quantity explicitly first.",
            code="REMAINING_RECEIVABLE",
            fields={"lines": remaining},
        )
    _transition_po(po, PurchaseOrderStatus.CLOSED)
    po.closed_at = timezone.now()
    po.closed_by = user
    po.updated_by = user
    po.save(update_fields=["closed_at", "closed_by", "updated_by", "updated_at"])
    emit("PurchaseOrderClosed", {"po_id": str(po.id), "document_number": po.document_number})
    return po


@transaction.atomic
def cancel_po_line(*, purchase_order_line: PurchaseOrderLine, quantity=None, user=None) -> PurchaseOrderLine:
    line = (
        PurchaseOrderLine.objects.select_for_update()
        .select_related("purchase_order")
        .get(pk=purchase_order_line.pk)
    )
    po = PurchaseOrder.objects.select_for_update().get(pk=line.purchase_order_id)
    assert_company_allowed(user, po.company_id)
    if po.status in {PurchaseOrderStatus.CLOSED, PurchaseOrderStatus.CANCELLED}:
        raise PurchaseOrderError(
            f"Cannot cancel line on PO in status {po.status}.",
            code="INVALID_STATUS",
        )
    remaining = _line_remaining_receivable(line)
    if remaining <= 0:
        raise PurchaseOrderError(
            "No remaining receivable quantity to cancel.",
            code="NOTHING_TO_CANCEL",
        )
    cancel_qty = remaining if quantity is None else _as_decimal(quantity)
    if cancel_qty <= 0:
        raise PurchaseOrderError("Cancel quantity must be positive.", code="INVALID_QUANTITY")
    if cancel_qty > remaining:
        raise PurchaseOrderError(
            "Cannot cancel more than remaining receivable quantity.",
            code="CANCEL_EXCEEDS_REMAINING",
            fields={"remaining": str(remaining), "requested": str(cancel_qty)},
        )
    line.cancelled_quantity = _as_decimal(line.cancelled_quantity) + cancel_qty
    line.updated_by = user
    line.save(update_fields=["cancelled_quantity", "updated_by", "updated_at"])

    # Refresh PO receipt status if all remaining cancelled
    lines = list(PurchaseOrderLine.objects.filter(purchase_order=po))
    any_received = any(_as_decimal(l.received_quantity) > 0 for l in lines)
    all_complete = all(_line_remaining_receivable(l) <= 0 for l in lines)
    if all_complete and any_received and po.status not in {
        PurchaseOrderStatus.RECEIVED,
        PurchaseOrderStatus.CLOSED,
    }:
        po.status = PurchaseOrderStatus.RECEIVED
        po.save(update_fields=["status", "updated_at"])

    emit(
        "PurchaseOrderLineCancelled",
        {
            "po_id": str(po.id),
            "line_id": str(line.id),
            "cancelled_quantity": str(line.cancelled_quantity),
            "cancel_qty": str(cancel_qty),
        },
    )
    return line


@transaction.atomic
def amend_purchase_order(
    *,
    purchase_order: PurchaseOrder,
    user=None,
    expected_delivery_date=None,
    notes=None,
    line_updates: list | None = None,
) -> PurchaseOrder:
    """
    Controlled amend. Supplier/currency cannot change.
    Price/ordered qty: only when ordered never drops below received+cancelled;
    revision_no bumps when price or open qty changes.
    """
    from apps.procurement.commercial import PO_AMENDABLE_STATUSES

    po = (
        PurchaseOrder.objects.select_for_update()
        .prefetch_related("lines")
        .get(pk=purchase_order.pk)
    )
    assert_company_allowed(user, po.company_id)
    if po.status not in PO_AMENDABLE_STATUSES:
        raise PurchaseOrderError(
            f"Cannot amend PO in status {po.status}.",
            code="INVALID_STATUS",
        )

    header_changed = False
    revision_bump = False
    update_fields = ["updated_by", "updated_at"]

    if expected_delivery_date is not None:
        po.expected_delivery_date = expected_delivery_date
        update_fields.append("expected_delivery_date")
        header_changed = True
    if notes is not None:
        po.notes = notes
        update_fields.append("notes")
        header_changed = True

    for upd in line_updates or []:
        line_id = upd.get("line_id") or upd.get("id")
        line = PurchaseOrderLine.objects.select_for_update().get(
            pk=line_id, purchase_order=po
        )
        line_fields = ["updated_by", "updated_at"]
        if "unit_price" in upd and upd["unit_price"] is not None:
            if _as_decimal(line.received_quantity) > 0:
                raise PurchaseOrderError(
                    f"Cannot change price on line {line.line_no} after receipt.",
                    code="PRICE_LOCKED_AFTER_RECEIPT",
                )
            new_price = _as_decimal(upd["unit_price"])
            if new_price != _as_decimal(line.unit_price):
                line.unit_price = new_price
                line_fields.append("unit_price")
                revision_bump = True
        if "ordered_quantity" in upd and upd["ordered_quantity"] is not None:
            new_ord = _as_decimal(upd["ordered_quantity"])
            floor = _as_decimal(line.received_quantity) + _as_decimal(line.cancelled_quantity)
            if new_ord < floor:
                raise PurchaseOrderError(
                    f"Ordered quantity on line {line.line_no} cannot be less than "
                    f"received + cancelled ({floor}).",
                    code="ORDERED_BELOW_RECEIVED",
                    fields={"floor": str(floor), "requested": str(new_ord)},
                )
            if new_ord <= 0:
                raise PurchaseOrderError("Ordered quantity must be positive.")
            if new_ord != _as_decimal(line.ordered_quantity):
                line.ordered_quantity = new_ord
                line_fields.append("ordered_quantity")
                revision_bump = True
        if "notes" in upd and upd["notes"] is not None:
            line.notes = upd["notes"]
            line_fields.append("notes")
        line.updated_by = user
        line.save(update_fields=line_fields)

    if revision_bump:
        po.revision_no = int(po.revision_no or 1) + 1
        update_fields.append("revision_no")

    if header_changed or revision_bump or line_updates:
        po.updated_by = user
        po.save(update_fields=list(dict.fromkeys(update_fields)))
        emit(
            "PurchaseOrderAmended",
            {
                "po_id": str(po.id),
                "revision_no": po.revision_no,
                "revision_bump": revision_bump,
            },
        )
    return po
