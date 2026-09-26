"""QC inspection services — hard gate before AVAILABLE stock."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.core.events import QC_FAILED, QC_PASSED, emit
from apps.core.exceptions import ERPError
from apps.inventory.ledger import StockTxnType
from apps.inventory.models import LotStatus
from apps.inventory.services import transition_lot_status
from apps.inventory.stock_services import append_ledger_entry
from apps.organization.company_scope import assert_company_allowed
from apps.quality.qc import QCFailDisposition, QCInspection, QCInspectionStatus
from apps.warehouse.models import BinType


class QCError(ERPError):
    default_code = "QC_ERROR"


@transaction.atomic
def pass_inspection(*, inspection: QCInspection, user=None) -> QCInspection:
    inspection = QCInspection.objects.select_for_update().select_related("lot", "item").get(pk=inspection.pk)
    assert_company_allowed(user, inspection.company_id)
    if inspection.status != QCInspectionStatus.DRAFT:
        raise QCError("Inspection already completed.", code="ALREADY_COMPLETED")
    lot = inspection.lot
    if lot.status != LotStatus.QC_HOLD:
        raise QCError(f"Lot must be QC_HOLD to pass (current={lot.status}).")

    transition_lot_status(lot, LotStatus.AVAILABLE, user=user)
    lot.qc_status = "PASSED"
    lot.save(update_fields=["qc_status", "updated_at"])

    append_ledger_entry(
        company=inspection.company,
        item=inspection.item,
        lot=lot,
        warehouse=lot.warehouse,
        bin=lot.bin,
        txn_type=StockTxnType.QC_RELEASE,
        quantity_in=0,
        quantity_out=0,
        uom=lot.uom,
        unit_cost=lot.landed_unit_cost or lot.purchase_unit_cost,
        reference_type="QC_INSPECTION",
        reference_id=inspection.id,
        user=user,
        reason="QC PASS",
    )

    inspection.status = QCInspectionStatus.PASSED
    inspection.inspected_at = timezone.now()
    inspection.inspected_by = user
    inspection.updated_by = user
    inspection.save(
        update_fields=["status", "inspected_at", "inspected_by", "updated_by", "updated_at"]
    )
    emit(QC_PASSED, {"inspection_id": str(inspection.id), "lot_id": str(lot.id)})
    return inspection


@transaction.atomic
def fail_inspection(
    *,
    inspection: QCInspection,
    disposition: str = QCFailDisposition.QUARANTINED,
    user=None,
) -> QCInspection:
    inspection = QCInspection.objects.select_for_update().select_related("lot", "item").get(pk=inspection.pk)
    assert_company_allowed(user, inspection.company_id)
    if inspection.status != QCInspectionStatus.DRAFT:
        raise QCError("Inspection already completed.", code="ALREADY_COMPLETED")
    if disposition not in {QCFailDisposition.QUARANTINED, QCFailDisposition.REJECTED}:
        raise QCError("Invalid fail disposition.")
    lot = inspection.lot
    if lot.status != LotStatus.QC_HOLD:
        raise QCError(f"Lot must be QC_HOLD to fail (current={lot.status}).")

    target = LotStatus.QUARANTINED if disposition == QCFailDisposition.QUARANTINED else LotStatus.REJECTED
    transition_lot_status(lot, target, user=user)
    lot.qc_status = "FAILED"
    lot.save(update_fields=["qc_status", "updated_at"])

    append_ledger_entry(
        company=inspection.company,
        item=inspection.item,
        lot=lot,
        warehouse=lot.warehouse,
        bin=lot.bin,
        txn_type=StockTxnType.QC_REJECT,
        uom=lot.uom,
        unit_cost=lot.purchase_unit_cost,
        reference_type="QC_INSPECTION",
        reference_id=inspection.id,
        user=user,
        reason=f"QC FAIL → {target}",
    )

    inspection.status = QCInspectionStatus.FAILED
    inspection.fail_disposition = disposition
    inspection.inspected_at = timezone.now()
    inspection.inspected_by = user
    inspection.updated_by = user
    inspection.save(
        update_fields=[
            "status",
            "fail_disposition",
            "inspected_at",
            "inspected_by",
            "updated_by",
            "updated_at",
        ]
    )
    emit(QC_FAILED, {"inspection_id": str(inspection.id), "lot_id": str(lot.id), "disposition": disposition})
    return inspection
