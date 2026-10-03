"""
Inbound journey: one server-side read model for PO -> PI/LC -> Gate -> GRN -> QC -> Landed -> Putaway,
plus thin orchestration helpers that delegate every state change to the existing services
(LC gate policy, post_grn, QC services, post_landed_cost, post_putaway).
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound

from apps.core.exceptions import ERPError
from apps.core.phase3_policy import PO_RECEIVABLE_STATUSES
from apps.core.services.numbering import generate_document_number
from apps.inventory.landed_post import post_landed_cost
from apps.inventory.ledger import StockLedgerEntry
from apps.inventory.models import (
    InventoryLot,
    LandedCostCategory,
    LandedCostDocument,
    LandedCostDocumentStatus,
    LotStatus,
)
from apps.inventory.services import _as_decimal, create_landed_component
from apps.organization.company_scope import assert_company_allowed, user_allowed_company_ids
from apps.procurement.inbound import (
    GateEntry,
    GateEntryStatus,
    GoodsReceiptLine,
    GoodsReceiptNote,
)
from apps.procurement.inbound_services import post_grn, submit_gate_entry
from apps.procurement.lc_services import active_lc_for_po, lc_inbound_status_for_po
from apps.procurement.trade_finance import ProformaInvoice
from apps.quality.qc import QCInspection, QCInspectionStatus
from apps.warehouse.models import Bin, BinType
from apps.warehouse.operations import OpsDocStatus, PutawayOrder
from apps.warehouse.ops_services import post_putaway

HOLDING_BIN_TYPES = {BinType.RECEIVING, BinType.QC_HOLD}
NON_STORAGE_BIN_TYPES = {
    BinType.RECEIVING,
    BinType.QC_HOLD,
    BinType.QUARANTINE,
    BinType.REJECTED,
    BinType.DISPATCH,
}


# The LC matcher is deterministic rules (engine "rules_v1"); the legacy status names say "AI".
RULES_MATCH_LABELS = {
    "AI_MATCH_PASSED": "Rules match passed",
    "AI_MATCH_FAILED": "Rules match failed",
}


class InboundJourneyError(ERPError):
    default_code = "INBOUND_JOURNEY_ERROR"


def scoped_get(queryset, user, pk, *, company_field: str = "company", label: str = "Record"):
    """Fetch by pk within the user's allowed companies; other tenants' rows look like 404."""
    if not pk:
        raise InboundJourneyError(f"{label} is required.", code="REQUIRED", fields={label.lower(): "required"})
    allowed = user_allowed_company_ids(user)
    if allowed is not None:
        queryset = queryset.filter(**{f"{company_field}__in": allowed})
    try:
        return queryset.get(pk=pk)
    except (queryset.model.DoesNotExist, ValueError, DjangoValidationError):
        raise NotFound(f"{label} not found.")


def _amount(value, field: str) -> Decimal:
    """Parse client-supplied numbers; blank means zero, garbage is a 400 rather than a 500."""
    if value in (None, ""):
        return Decimal("0")
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise InboundJourneyError(f"{field} must be a number.", code="INVALID_NUMBER", fields={field: str(value)})


def _s(value) -> str:
    return "" if value is None else str(value)


def _money(value) -> str:
    return str(_as_decimal(value).quantize(Decimal("0.01")))


def _bin(bin_obj) -> dict | None:
    if bin_obj is None:
        return None
    return {"id": str(bin_obj.id), "code": bin_obj.code, "type": bin_obj.bin_type, "name": bin_obj.name}


def _po_lines(po) -> tuple[list[dict], Decimal, Decimal]:
    rows, subtotal, tax_total = [], Decimal("0"), Decimal("0")
    for line in po.lines.select_related("item", "uom").order_by("line_no"):
        qty = _as_decimal(line.ordered_quantity)
        net = qty * _as_decimal(line.unit_price) * (Decimal("1") - _as_decimal(line.discount_pct) / 100)
        tax = net * _as_decimal(line.tax_pct) / 100
        subtotal += net
        tax_total += tax
        rows.append(
            {
                "id": str(line.id),
                "line_no": line.line_no,
                "item_id": str(line.item_id),
                "item_sku": line.item.sku,
                "item_name": line.item.name,
                "qc_required": line.item.qc_required,
                "uom": line.uom.code,
                "ordered_quantity": _s(line.ordered_quantity),
                "received_quantity": _s(line.received_quantity),
                "remaining_receivable": _s(line.remaining_receivable),
                "unit_price": _s(line.unit_price),
                "discount_pct": _s(line.discount_pct),
                "tax_pct": _s(line.tax_pct),
                "line_total": _money(net + tax),
            }
        )
    return rows, subtotal, tax_total


def _lot_payload(lot: InventoryLot) -> dict:
    qty = _as_decimal(lot.initial_quantity)
    purchase_unit = _as_decimal(lot.purchase_unit_cost)
    landed_unit = _as_decimal(lot.landed_unit_cost) if lot.landed_unit_cost is not None else None
    inspections = [
        {
            "id": str(i.id),
            "number": i.inspection_number,
            "status": i.status,
            "fail_disposition": i.fail_disposition,
            "ncr_reference": i.ncr_reference,
            "coa_reference": i.coa_reference,
            "remarks": i.remarks,
            "inspected_at": i.inspected_at.isoformat() if i.inspected_at else None,
        }
        for i in QCInspection.objects.filter(lot=lot).order_by("created_at")
    ]
    landed = []
    for doc in LandedCostDocument.objects.filter(lot=lot).prefetch_related("components").order_by("created_at"):
        components = [
            {
                "category": c.category,
                "label": LandedCostCategory(c.category).label if c.category in LandedCostCategory.values else c.category,
                "description": c.description,
                "amount": _money(c.base_currency_amount),
            }
            for c in doc.components.filter(is_active=True).order_by("created_at", "id")
        ]
        additional = sum((_as_decimal(c["amount"]) for c in components), Decimal("0"))
        purchase_value = _as_decimal(doc.purchase_value)
        landed.append(
            {
                "id": str(doc.id),
                "number": doc.document_number,
                "status": doc.status,
                "purchase_quantity": _s(doc.purchase_quantity),
                "purchase_unit_cost": _s(doc.purchase_unit_cost),
                "purchase_value": _money(purchase_value),
                "additional_total": _money(additional),
                "landed_total": _money(purchase_value + additional),
                "components": components,
            }
        )
    putaways = [
        {
            "number": p.putaway_number,
            "status": p.status,
            "from_bin": p.from_bin.code if p.from_bin_id else None,
            "to_bin": p.to_bin.code,
            "quantity": _s(p.quantity),
        }
        for p in PutawayOrder.objects.filter(lot=lot).select_related("from_bin", "to_bin").order_by("created_at")
    ]
    ledger = [
        {
            "occurred_at": e.occurred_at.isoformat(),
            "txn_type": e.txn_type,
            "quantity_in": _s(e.quantity_in),
            "quantity_out": _s(e.quantity_out),
            "bin": e.bin.code if e.bin_id else None,
            "unit_cost": _s(e.unit_cost),
            "reason": e.reason,
            "is_state_event": e.is_state_event,
        }
        for e in StockLedgerEntry.objects.filter(lot=lot).select_related("bin").order_by("occurred_at", "created_at")
    ]
    draft_inspection = next((i for i in inspections if i["status"] == QCInspectionStatus.DRAFT), None)
    has_posted_landed = any(d["status"] == LandedCostDocumentStatus.POSTED for d in landed)
    bin_type = lot.bin.bin_type if lot.bin_id else None
    return {
        "id": str(lot.id),
        "lot_number": lot.lot_number,
        "status": lot.status,
        "qc_status": lot.qc_status,
        "item_sku": lot.item.sku,
        "item_name": lot.item.name,
        "warehouse": lot.warehouse.code if lot.warehouse_id else None,
        "bin": _bin(lot.bin),
        "uom": lot.uom.code if lot.uom_id else "",
        "initial_quantity": _s(lot.initial_quantity),
        "remaining_quantity": _s(lot.remaining_quantity),
        "purchase_unit_cost": _s(lot.purchase_unit_cost),
        "landed_unit_cost": _s(landed_unit) if landed_unit is not None else None,
        "purchase_value": _money(qty * purchase_unit),
        "landed_value": _money(qty * landed_unit) if landed_unit is not None else None,
        "inspections": inspections,
        "landed_costs": landed,
        "putaways": putaways,
        "ledger": ledger,
        "actions": {
            "qc_inspection_id": draft_inspection["id"] if draft_inspection and lot.status == LotStatus.QC_HOLD else None,
            "can_landed_cost": not has_posted_landed and lot.status in {LotStatus.QC_HOLD, LotStatus.AVAILABLE},
            "can_putaway": lot.status == LotStatus.AVAILABLE and bin_type in HOLDING_BIN_TYPES,
        },
    }


def build_inbound_journey(po) -> dict:
    lines, subtotal, tax_total = _po_lines(po)
    lc = active_lc_for_po(po)
    lc_gate = lc_inbound_status_for_po(po)
    pis = ProformaInvoice.objects.filter(purchase_order=po).order_by("created_at")
    gates = GateEntry.objects.filter(purchase_order=po).order_by("created_at")
    grns = (
        GoodsReceiptNote.objects.filter(gate_entry__purchase_order=po)
        .select_related("warehouse", "receiving_bin", "gate_entry")
        .prefetch_related("lines__item", "lines__lot")
        .order_by("created_at")
    )
    lots = (
        InventoryLot.objects.filter(source_grn__in=grns)
        .select_related("item", "warehouse", "bin", "uom")
        .order_by("created_at")
    )
    remaining = sum((_as_decimal(line["remaining_receivable"]) for line in lines), Decimal("0"))
    open_gate = gates.filter(status__in=[GateEntryStatus.DRAFT, GateEntryStatus.SUBMITTED]).exists()
    gate_ready = po.status in PO_RECEIVABLE_STATUSES and remaining > 0 and not open_gate
    warehouse = po.destination_warehouse
    putaway_bins = []
    if warehouse is not None:
        putaway_bins = [
            _bin(b)
            for b in Bin.objects.filter(warehouse=warehouse, is_active=True)
            .exclude(bin_type__in=NON_STORAGE_BIN_TYPES)
            .order_by("code")
        ]

    match = (lc.match_result or {}) if lc else {}
    return {
        "purchase_order": {
            "id": str(po.id),
            "document_number": po.document_number,
            "status": po.status,
            "supplier": {
                "id": str(po.supplier_id),
                "code": po.supplier.code,
                "name": po.supplier.legal_name,
                "country": po.supplier.country,
            },
            "currency": po.currency.code if po.currency_id else "",
            "payment_terms": po.payment_terms,
            "incoterm": po.incoterm.code if po.incoterm_id else "",
            "named_place": po.named_place,
            "destination_warehouse": warehouse.code if warehouse else None,
            "expected_delivery_date": _s(po.expected_delivery_date) or None,
            "lines": lines,
            "subtotal": _money(subtotal),
            "tax_total": _money(tax_total),
            "total": _money(subtotal + tax_total),
        },
        "proforma_invoices": [
            {
                "id": str(pi.id),
                "number": pi.document_number,
                "status": pi.status,
                "seller_pi_number": pi.seller_pi_number,
                "currency_code": pi.currency_code,
                "total_amount": _money(pi.total_amount),
                "payment_terms": pi.payment_terms,
                "lead_time_days": pi.lead_time_days,
            }
            for pi in pis
        ],
        "letter_of_credit": (
            {
                "id": str(lc.id),
                "number": lc.document_number,
                "status": lc.status,
                "status_label": RULES_MATCH_LABELS.get(lc.status, lc.get_status_display()),
                "bank_name": lc.bank_name,
                "final_lc_number": lc.final_lc_number,
                "currency_code": lc.currency_code,
                "amount": _money(lc.amount),
                "match": {
                    "engine": match.get("engine") or "rules_v1",
                    "engine_kind": "rules",
                    "passed": match.get("passed"),
                    "checked_at": match.get("checked_at"),
                    "po_total": match.get("po_total"),
                    "pi_amount": match.get("pi_amount"),
                    "issues": match.get("issues") or [],
                },
                "checklist": list((lc.document_checklist or {}).get("items") or []),
                "pre_dispatch_message": lc.pre_dispatch_message,
            }
            if lc
            else None
        ),
        "lc_gate": lc_gate,
        "gates": [
            {
                "id": str(g.id),
                "number": g.gate_entry_number,
                "status": g.status,
                "vehicle_number": g.vehicle_number,
                "driver_name": g.driver_name,
                "entry_at": g.entry_at.isoformat() if g.entry_at else None,
            }
            for g in gates
        ],
        "grns": [
            {
                "id": str(grn.id),
                "number": grn.grn_number,
                "status": grn.status,
                "gate_number": grn.gate_entry.gate_entry_number if grn.gate_entry_id else None,
                "warehouse": grn.warehouse.code if grn.warehouse_id else None,
                "receiving_bin": _bin(grn.receiving_bin),
                "posted_at": grn.posted_at.isoformat() if grn.posted_at else None,
                "lines": [
                    {
                        "item_sku": line.item.sku,
                        "received_quantity": _s(line.received_quantity),
                        "accepted_quantity": _s(line.accepted_quantity),
                        "rejected_quantity": _s(line.rejected_quantity),
                        "purchase_unit_cost": _s(line.purchase_unit_cost),
                        "lot_number": line.lot.lot_number if line.lot_id else line.lot_number,
                    }
                    for line in grn.lines.all()
                ],
            }
            for grn in grns
        ],
        "lots": [_lot_payload(lot) for lot in lots],
        "putaway_bins": putaway_bins,
        "landed_cost_categories": [
            {"value": value, "label": label}
            for value, label in LandedCostCategory.choices
            if value != LandedCostCategory.MATERIAL
        ],
        "actions": {
            "can_record_gate": gate_ready and bool(lc_gate["lc_gate_allowed"]),
            "gate_blocked_by_lc": gate_ready and not lc_gate["lc_gate_allowed"],
            "gate_blocked_reason": (
                "" if lc_gate["lc_gate_allowed"] else lc_gate["lc_gate_message"]
            ),
            "receivable_gate_ids": [
                str(g.id) for g in gates if g.status == GateEntryStatus.SUBMITTED
            ],
        },
    }


@transaction.atomic
def record_gate_entry(*, purchase_order, vehicle_number: str, driver_name: str = "", remarks: str = "", user=None) -> GateEntry:
    """Create a gate entry for the PO and submit it; the LC gate policy is enforced by submit_gate_entry."""
    assert_company_allowed(user, purchase_order.company_id)
    if not (vehicle_number or "").strip():
        raise InboundJourneyError("Vehicle number is required.", code="VEHICLE_REQUIRED")
    if purchase_order.status not in PO_RECEIVABLE_STATUSES:
        raise InboundJourneyError(
            f"PO status {purchase_order.status} is not receivable.", code="PO_NOT_RECEIVABLE"
        )
    if not any(line.remaining_receivable > 0 for line in purchase_order.lines.all()):
        raise InboundJourneyError("Nothing left to receive on this PO.", code="NOTHING_TO_RECEIVE")
    if GateEntry.objects.filter(
        purchase_order=purchase_order, status__in=[GateEntryStatus.DRAFT, GateEntryStatus.SUBMITTED]
    ).exists():
        raise InboundJourneyError(
            "This PO already has an open gate entry; receive or cancel it first.", code="GATE_ALREADY_OPEN"
        )
    gate = GateEntry.objects.create(
        company=purchase_order.company,
        gate_entry_number=generate_document_number("GE"),
        entry_at=timezone.now(),
        supplier=purchase_order.supplier,
        purchase_order=purchase_order,
        vehicle_number=vehicle_number.strip(),
        driver_name=(driver_name or "").strip(),
        remarks=remarks or "",
        created_by=user,
        updated_by=user,
    )
    return submit_gate_entry(gate=gate, user=user)


def _receiving_bin(warehouse):
    return (
        Bin.objects.filter(warehouse=warehouse, bin_type=BinType.RECEIVING, is_active=True).order_by("code").first()
    )


@transaction.atomic
def receive_against_gate(*, gate: GateEntry, lines: list[dict], user=None) -> GoodsReceiptNote:
    """
    Build a GRN for a submitted gate from PO lines and post it. Item, UOM, unit cost and warehouse
    come from the PO; post_grn applies QC hold, ledger, receipt layers and PO progress.
    """
    from apps.procurement.commercial import PurchaseOrderLine

    gate = GateEntry.objects.select_related("purchase_order", "purchase_order__currency").get(pk=gate.pk)
    assert_company_allowed(user, gate.company_id)
    po = gate.purchase_order
    if po is None:
        raise InboundJourneyError("Gate entry is not linked to a purchase order.", code="PO_REQUIRED")
    if gate.status != GateEntryStatus.SUBMITTED:
        raise InboundJourneyError(f"Gate entry must be SUBMITTED to receive (current={gate.status}).", code="GATE_NOT_SUBMITTED")
    if not isinstance(lines, list) or not lines or not all(isinstance(row, dict) for row in lines):
        raise InboundJourneyError("At least one GRN line is required.", code="LINES_REQUIRED")

    warehouse = po.destination_warehouse
    if warehouse is None:
        raise InboundJourneyError("Purchase order has no destination warehouse.", code="WAREHOUSE_REQUIRED")

    grn = GoodsReceiptNote.objects.create(
        company=gate.company,
        grn_number=generate_document_number("GRN"),
        gate_entry=gate,
        supplier=po.supplier,
        warehouse=warehouse,
        receiving_bin=_receiving_bin(warehouse),
        purchase_reference=po.document_number,
        received_at=timezone.now(),
        currency=po.currency,
        created_by=user,
        updated_by=user,
    )
    for row in lines:
        try:
            pol = PurchaseOrderLine.objects.select_related("item", "uom").filter(
                pk=row.get("purchase_order_line"), purchase_order=po
            ).first()
        except (ValueError, DjangoValidationError):
            pol = None
        if pol is None:
            raise InboundJourneyError("PO line does not belong to this purchase order.", code="PO_LINE_MISMATCH")
        accepted = _amount(row.get("accepted_quantity"), "accepted_quantity")
        rejected = _amount(row.get("rejected_quantity"), "rejected_quantity")
        if accepted <= 0 or rejected < 0:
            raise InboundJourneyError("Accepted quantity must be positive.", code="INVALID_QUANTITY")
        GoodsReceiptLine.objects.create(
            grn=grn,
            item=pol.item,
            uom=pol.uom,
            received_quantity=accepted + rejected,
            accepted_quantity=accepted,
            rejected_quantity=rejected,
            purchase_unit_cost=pol.unit_price,
            supplier_lot_number=(row.get("supplier_lot_number") or "").strip(),
            purchase_order_line=pol,
        )
    return post_grn(grn=grn, user=user)


@transaction.atomic
def post_lot_landed_cost(*, lot: InventoryLot, components: list[dict], user=None) -> dict:
    """Create a landed cost document for the lot from cost components and post it."""
    lot = InventoryLot.objects.select_related("currency", "company").get(pk=lot.pk)
    assert_company_allowed(user, lot.company_id)
    if lot.status not in {LotStatus.QC_HOLD, LotStatus.AVAILABLE}:
        raise InboundJourneyError(f"Landed cost cannot be posted for a {lot.status} lot.", code="LOT_NOT_COSTABLE")
    if LandedCostDocument.objects.filter(lot=lot, status=LandedCostDocumentStatus.POSTED).exists():
        raise InboundJourneyError("Landed cost already posted for this lot.", code="DUPLICATE_POST")
    if not isinstance(components, list) or not all(isinstance(c, dict) for c in components):
        raise InboundJourneyError("Components must be a list.", code="COMPONENTS_REQUIRED")
    rows = [c for c in components if _amount(c.get("amount"), "amount") > 0]
    if not rows:
        raise InboundJourneyError("Add at least one cost component.", code="COMPONENTS_REQUIRED")

    qty = _as_decimal(lot.initial_quantity)
    unit = _as_decimal(lot.purchase_unit_cost)
    document = LandedCostDocument.objects.create(
        company=lot.company,
        document_number=generate_document_number("LCD"),
        lot=lot,
        currency=lot.currency,
        purchase_quantity=qty,
        purchase_unit_cost=unit,
        purchase_value=qty * unit,
        created_by=user,
        updated_by=user,
    )
    for row in rows:
        category = row.get("category")
        if category not in LandedCostCategory.values or category == LandedCostCategory.MATERIAL:
            raise InboundJourneyError(f"Invalid landed cost category {category!r}.", code="INVALID_CATEGORY")
        create_landed_component(
            document,
            category=category,
            amount=_amount(row.get("amount"), "amount"),
            currency=lot.currency,
            exchange_rate=Decimal("1"),
            description=(row.get("description") or "").strip(),
            user=user,
        )
    return post_landed_cost(document=document, user=user)


@transaction.atomic
def putaway_lot(*, lot: InventoryLot, to_bin: Bin, user=None) -> PutawayOrder:
    """Move a QC-released lot from its holding bin to a storage bin via a ledger-backed putaway."""
    lot = InventoryLot.objects.select_related("bin", "warehouse").get(pk=lot.pk)
    assert_company_allowed(user, lot.company_id)
    if to_bin.warehouse_id != lot.warehouse_id:
        raise InboundJourneyError("Destination bin must be in the lot's warehouse.", code="BIN_WAREHOUSE_MISMATCH")
    putaway = PutawayOrder.objects.create(
        company=lot.company,
        putaway_number=generate_document_number("PUT"),
        lot=lot,
        from_bin=lot.bin,
        to_warehouse=lot.warehouse,
        to_bin=to_bin,
        quantity=lot.remaining_quantity,
        created_by=user,
        updated_by=user,
    )
    post_putaway(putaway=putaway, user=user)
    putaway.refresh_from_db()
    if putaway.status != OpsDocStatus.POSTED:
        raise InboundJourneyError("Putaway did not post.", code="PUTAWAY_NOT_POSTED")
    return putaway
