from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.db import models, transaction
from django.db.models import Sum
from django.utils import timezone

from apps.audit.models import AuditAction
from apps.audit.services import AuditService
from apps.core.events import (
    MATERIAL_ISSUED,
    PRODUCTION_OUTPUT_POSTED,
    emit,
)
from apps.core.exceptions import ERPError
from apps.core.services.numbering import generate_document_number
from apps.inventory.ledger import StockTxnType
from apps.inventory.models import (
    InventoryLot,
    InventoryReceiptLayer,
    LotStatus,
)
from apps.inventory.services import convert_quantity
from apps.inventory.stock_services import (
    append_ledger_entry,
    assert_objects_same_company,
    layer_unit_cost,
    next_receipt_sequence,
    reserve_stock,
    sync_lot_remaining_from_layers,
)
from apps.organization.company_scope import assert_company_allowed
from apps.production.models import (
    BOM,
    BOMLine,
    BOMVersion,
    BOMVersionStatus,
    BOMStatus,
    MaterialIssue,
    MaterialIssueLine,
    ProductionOrder,
    ProductionOrderStatus,
    ProductionDocumentStatus,
    ProductionOutput,
    ProductionOutputLine,
    ProductionLotTraceability,
)
from apps.quality.qc import QCInspection, QCInspectionStatus
from apps.warehouse.models import BinType
class ProductionError(ERPError):
    default_code = "PRODUCTION_ERROR"


class BOMError(ProductionError):
    default_code = "BOM_ERROR"


class ProductionOrderError(ProductionError):
    default_code = "PRODUCTION_ORDER_ERROR"


class MaterialIssueError(ProductionError):
    default_code = "MATERIAL_ISSUE_ERROR"


class ProductionOutputError(ProductionError):
    default_code = "PRODUCTION_OUTPUT_ERROR"


MONEY_QUANT = Decimal("0.0001")
ZERO = Decimal("0")


def _as_decimal(value) -> Decimal:
    if value is None:
        return ZERO
    return Decimal(str(value))


def _audit(
    *,
    user,
    action: str,
    obj,
    document_number: str = "",
    before_data=None,
    after_data=None,
    reason: str = "",
) -> None:
    AuditService.log(
        user=user,
        action=action,
        module="production",
        model_name=obj.__class__.__name__,
        object_id=str(obj.pk),
        document_number=document_number,
        before_data=before_data or {},
        after_data=after_data or {},
        reason=reason,
    )


def _validate_item_company(*, item, company) -> None:
    if item.company_id != company.pk:
        raise BOMError(
            "Item does not belong to the production company.",
            code="COMPANY_MISMATCH",
        )


def _validate_uom_for_item(*, item, uom) -> None:
    allowed = {
        getattr(item, "base_uom_id", None),
        getattr(item, "purchase_uom_id", None),
        getattr(item, "stock_uom_id", None),
        getattr(item, "production_uom_id", None),
        getattr(item, "alternate_uom_id", None),
    }
    allowed.discard(None)

    if uom.pk not in allowed:
        raise BOMError(
            f"UOM {uom.pk} is not configured for item {item.sku}.",
            code="UOM_NOT_CONFIGURED",
        )


def create_bom(*, company, code: str, name: str, output_item, user=None, description: str = "") -> BOM:
    assert_company_allowed(user, company.pk)
    _validate_item_company(item=output_item, company=company)

    code = (code or "").strip()
    name = (name or "").strip()

    if not code:
        raise BOMError("BOM code is required.",
                       code="CODE_REQUIRED",
                    )
    if not name:
        raise BOMError("BOM name is required.",
                       code="NAME_REQUIRED",
                    )

    if BOM.objects.filter(company=company, code=code).exists():
        raise BOMError(
            f"BOM code '{code}' already exists.",
            code="DUPLICATE_CODE",
        )

    bom = BOM.objects.create(
        company=company,
        code=code,
        name=name,
        output_item=output_item,
        description=description or "",
        status=BOMStatus.DRAFT,
        created_by=user,
        updated_by=user,
    )

    _audit(
        user=user,
        action="create",
        obj=bom,
        after_data={
            "code": bom.code,
            "name": bom.name,
            "output_item_id": str(output_item.pk),
            "status": bom.status,
        },
    )
    return bom


def create_bom_version(
    *,
    bom: BOM,
    version: int,
    user=None,
    effective_from: date | None = None,
    effective_to: date | None = None,
    notes: str = "",
) -> BOMVersion:
    assert_company_allowed(user, bom.company_id)

    if version < 1:
        raise BOMError("BOM version must be at least 1.",
                       code="INVALID_VERSION",
                    )

    if effective_from is None:
        effective_from = date.today()

    if effective_to is not None and effective_to < effective_from:
        raise BOMError("BOM version effective_to cannot be before effective_from.",
                       code="INVALID_EFFECTIVE_DATE",
                    )

    if BOMVersion.objects.filter(bom=bom, version=version).exists():
        raise BOMError(
            f"BOM version {version} already exists.",
            code="DUPLICATE_VERSION",
        )

    bom_version = BOMVersion.objects.create(
        bom=bom,
        version=version,
        status=BOMVersionStatus.DRAFT,
        effective_from=effective_from,
        effective_to=effective_to,
        notes=notes or "",
        created_by=user,
        updated_by=user,
    )

    _audit(
        user=user,
        action="create",
        obj=bom_version,
        after_data={
            "bom_id": str(bom.pk),
            "version": version,
            "status": bom_version.status,
            "effective_from": str(effective_from),
            "effective_to": str(effective_to) if effective_to else None,
        },
    )
    return bom_version


def add_bom_line(
    *,
    bom_version: BOMVersion,
    component_item,
    quantity,
    uom,
    sequence: int,
    user=None,
    scrap_percent=0,
) -> BOMLine:
    assert_company_allowed(user, bom_version.bom.company_id)
    _validate_item_company(item=component_item, company=bom_version.bom.company)

    quantity = _as_decimal(quantity)
    scrap_percent = _as_decimal(scrap_percent)

    if quantity <= 0:
        raise BOMError("BOM component quantity must be greater than zero.",
                       code="INVALID_QUANTITY",
                    )

    if scrap_percent < 0:
        raise BOMError("BOM scrap percentage cannot be negative.",
                       code="INVALID_SCRAP",
                    )

    if sequence < 1:
        raise BOMError("BOM line sequence must be at least 1.",
                       code="INVALID_SEQUENCE",
                    )

    if component_item.pk == bom_version.bom.output_item_id:
        raise BOMError(
            "A BOM cannot consume its own output item.",
            code="SELF_COMPONENT",
        )

    _validate_uom_for_item(item=component_item, uom=uom)

    if BOMLine.objects.filter(
        bom_version=bom_version,
        sequence=sequence,
    ).exists():
        raise BOMError(
            f"BOM sequence {sequence} already exists.",
            code="DUPLICATE_SEQUENCE",
        )

    line = BOMLine.objects.create(
        bom_version=bom_version,
        component_item=component_item,
        quantity=quantity,
        uom=uom,
        scrap_percent=scrap_percent,
        sequence=sequence,
        created_by=user,
        updated_by=user,
    )

    _audit(
        user=user,
        action="create",
        obj=line,
        after_data={
            "bom_version_id": str(bom_version.pk),
            "component_item_id": str(component_item.pk),
            "quantity": str(quantity),
            "uom_id": str(uom.pk),
            "scrap_percent": str(scrap_percent),
            "sequence": sequence,
        },
    )
    return line


def _validate_active_bom_version(*, bom_version: BOMVersion, company) -> None:
    if bom_version.bom.company_id != company.pk:
        raise ProductionOrderError(
            "BOM version does not belong to the production company.",
            code="BOM_COMPANY_MISMATCH",
        )

    if bom_version.status != BOMVersionStatus.ACTIVE:
        raise ProductionOrderError(
            "Production requires an ACTIVE BOM version.",
            code="BOM_VERSION_NOT_ACTIVE",
        )

    if bom_version.bom.status != BOMStatus.ACTIVE:
        raise ProductionOrderError(
            "Production requires an ACTIVE BOM.",
            code="BOM_NOT_ACTIVE",
        )

    today = date.today()

    if bom_version.effective_from and today < bom_version.effective_from:
        raise ProductionOrderError(
            "BOM version is not yet effective.",
            code="BOM_VERSION_NOT_EFFECTIVE",
        )

    if bom_version.effective_to and today > bom_version.effective_to:
        raise ProductionOrderError(
            "BOM version has expired.",
            code="BOM_VERSION_EXPIRED",
        )


def _output_quantity_in_bom_uom(*, production_order: ProductionOrder) -> Decimal:
    """
    Normalize planned production quantity to the BOM output item's
    production UOM where possible.
    """
    bom_output_item = production_order.bom_version.bom.output_item
    quantity = _as_decimal(production_order.planned_quantity)

    source_uom = production_order.uom
    target_uom = (
        getattr(bom_output_item, "production_uom", None)
        or getattr(bom_output_item, "stock_uom", None)
        or getattr(bom_output_item, "base_uom", None)
    )

    if target_uom is None:
        raise ProductionOrderError(
            f"Output item {bom_output_item.sku} has no production/stock/base UOM.",
            code="OUTPUT_UOM_NOT_CONFIGURED",
        )

    if source_uom.pk == target_uom.pk:
        return quantity

    try:
        return _as_decimal(
            convert_quantity(
                quantity,
                source_uom,
                target_uom,
            )
        )
    except Exception as exc:
        raise ProductionOrderError(
            f"Unable to convert production quantity from {source_uom} to {target_uom}.",
            code="OUTPUT_UOM_CONVERSION_FAILED",
        ) from exc


def calculate_material_requirements(
    *,
    production_order: ProductionOrder,
    user=None,
) -> list[dict]:
    """
    Calculate BOM component requirements for the planned production quantity.

    Returned quantities are normalized to each component's stock UOM so that
    they can be passed safely into the inventory reservation engine.
    """
    assert_company_allowed(user, production_order.company_id)

    production_order = (
        ProductionOrder.objects.select_related(
            "company",
            "bom_version",
            "bom_version__bom",
            "bom_version__bom__output_item",
            "output_item",
            "uom",
        )
        .prefetch_related(
            "bom_version__lines",
            "bom_version__lines__component_item",
            "bom_version__lines__uom",
        )
        .get(pk=production_order.pk)
    )

    _validate_active_bom_version(
        bom_version=production_order.bom_version,
        company=production_order.company,
    )

    if production_order.output_item_id != production_order.bom_version.bom.output_item_id:
        raise ProductionOrderError(
            "Production order output item does not match BOM output item.",
            code="OUTPUT_ITEM_MISMATCH",
        )

    output_quantity = _output_quantity_in_bom_uom(
        production_order=production_order,
    )

    requirements = []

    for line in production_order.bom_version.lines.all().order_by("sequence", "id"):
        component = line.component_item
        stock_uom = (
            getattr(component, "stock_uom", None)
            or getattr(component, "base_uom", None)
        )

        if stock_uom is None:
            raise ProductionOrderError(
                f"Component {component.sku} has no stock/base UOM.",
                code="COMPONENT_STOCK_UOM_NOT_CONFIGURED",
            )

        gross_quantity = (
            output_quantity
            * _as_decimal(line.quantity)
            * (
                Decimal("1")
                + (_as_decimal(line.scrap_percent) / Decimal("100"))
            )
        )

        try:
            stock_quantity = _as_decimal(
                convert_quantity(
                    gross_quantity,
                    line.uom,
                    stock_uom,
                )
            )
        except Exception as exc:
            raise ProductionOrderError(
                f"Unable to convert BOM quantity for component {component.sku}.",
                code="COMPONENT_UOM_CONVERSION_FAILED",
            ) from exc

        if stock_quantity <= 0:
            raise ProductionOrderError(
                f"Calculated requirement for {component.sku} is not positive.",
                code="INVALID_MATERIAL_REQUIREMENT",
            )

        requirements.append(
            {
                "bom_line": line,
                "component_item": component,
                "quantity": stock_quantity,
                "uom": stock_uom,
                "bom_quantity": gross_quantity,
                "bom_uom": line.uom,
            }
        )

    return requirements


@transaction.atomic
def create_production_order(
    *,
    company,
    bom_version: BOMVersion,
    planned_quantity,
    uom,
    warehouse,
    production_bin,
    user=None,
    planned_start=None,
    planned_end=None,
    notes: str = "",
) -> ProductionOrder:
    assert_company_allowed(user, company.pk)

    bom_version = (
        BOMVersion.objects.select_for_update(of=("self",))
        .select_related("bom", "bom__output_item")
        .get(pk=bom_version.pk)
    )

    _validate_active_bom_version(
        bom_version=bom_version,
        company=company,
    )

    planned_quantity = _as_decimal(planned_quantity)

    if planned_quantity <= 0:
        raise ProductionOrderError(
            "Planned production quantity must be greater than zero.",
            code="INVALID_PLANNED_QUANTITY",
        )

    output_item = bom_version.bom.output_item
    _validate_item_company(item=output_item, company=company)
    _validate_uom_for_item(item=output_item, uom=uom)

    if warehouse.company_id != company.pk:
        raise ProductionOrderError(
            "Production warehouse does not belong to the company.",
            code="WAREHOUSE_COMPANY_MISMATCH",
        )

    if production_bin.warehouse_id != warehouse.pk:
        raise ProductionOrderError(
            "Production bin does not belong to the production warehouse.",
            code="BIN_WAREHOUSE_MISMATCH",
        )

    if planned_end and planned_start and planned_end < planned_start:
        raise ProductionOrderError(
            "Planned end cannot be before planned start.",
            code="INVALID_PRODUCTION_DATES",
        )

    order = ProductionOrder.objects.create(
        company=company,
        document_number=generate_document_number("MO"),
        bom_version=bom_version,
        output_item=output_item,
        planned_quantity=planned_quantity,
        produced_quantity=ZERO,
        uom=uom,
        warehouse=warehouse,
        production_bin=production_bin,
        status=ProductionOrderStatus.DRAFT,
        planned_start=planned_start,
        planned_end=planned_end,
        notes=notes or "",
        created_by=user,
        updated_by=user,
    )

    _audit(
        user=user,
        action="create",
        obj=order,
        document_number=order.document_number,
        after_data={
            "bom_version_id": str(bom_version.pk),
            "output_item_id": str(output_item.pk),
            "planned_quantity": str(planned_quantity),
            "uom_id": str(uom.pk),
            "warehouse_id": str(warehouse.pk),
            "production_bin_id": str(production_bin.pk),
            "status": order.status,
        },
    )

    return order


@transaction.atomic
def release_production_order(
    *,
    production_order: ProductionOrder,
    user=None,
) -> tuple[ProductionOrder, MaterialIssue, list[MaterialIssueLine]]:
    """
    Release a production order and reserve all required BOM materials FIFO.

    A draft MaterialIssue and its lines are created at release time because
    the production reservation must have a stable MaterialIssueLine reference.
    Actual physical consumption happens only when the MaterialIssue is posted.
    """
    order = (
        ProductionOrder.objects.select_for_update(of=("self",))
        .select_related(
            "company",
            "bom_version",
            "bom_version__bom",
            "bom_version__bom__output_item",
            "output_item",
            "uom",
            "warehouse",
            "production_bin",
        )
        .get(pk=production_order.pk)
    )

    assert_company_allowed(user, order.company_id)

    if order.status != ProductionOrderStatus.DRAFT:
        raise ProductionOrderError(
            f"Only DRAFT production orders can be released (current={order.status}).",
            code="INVALID_PRODUCTION_STATUS",
        )

    _validate_active_bom_version(
        bom_version=order.bom_version,
        company=order.company,
    )

    requirements = calculate_material_requirements(
        production_order=order,
        user=user,
    )

    if not requirements:
        raise ProductionOrderError(
            "Production order cannot be released without BOM components.",
            code="EMPTY_BOM",
        )

    material_issue = MaterialIssue.objects.create(
        company=order.company,
        document_number=generate_document_number("MI"),
        production_order=order,
        warehouse=order.warehouse,
        production_bin=order.production_bin,
        issued_at=timezone.now(),
        status="DRAFT",
        notes="Material issue generated during production order release.",
        created_by=user,
        updated_by=user,
    )

    issue_lines = []

    for requirement in requirements:
        line = MaterialIssueLine.objects.create(
            material_issue=material_issue,
            bom_line=requirement["bom_line"],
            item=requirement["component_item"],
            quantity=requirement["quantity"],
            uom=requirement["uom"],
            created_by=user,
            updated_by=user,
        )

        try:
            reserve_stock(
                company=order.company,
                item=requirement["component_item"],
                quantity=requirement["quantity"],
                uom=requirement["uom"],
                user=user,
                warehouse=order.warehouse,
                reference_type="PRODUCTION_MATERIAL",
                reference_id=line.pk,
                notes=f"Production reservation for {order.document_number}",
            )
        except Exception as exc:
            raise ProductionOrderError(
                f"Unable to reserve material {requirement['component_item'].sku}: {exc}",
                code="MATERIAL_RESERVATION_FAILED",
            ) from exc

        issue_lines.append(line)

    before = {
        "status": order.status,
        "planned_quantity": str(order.planned_quantity),
    }

    order.status = ProductionOrderStatus.RELEASED
    order.updated_by = user
    order.save(update_fields=["status", "updated_by", "updated_at"])

    _audit(
        user=user,
        action="submit",
        obj=order,
        document_number=order.document_number,
        before_data=before,
        after_data={
            "status": order.status,
            "material_issue_id": str(material_issue.pk),
            "material_issue_number": material_issue.document_number,
        },
    )

    return order, material_issue, issue_lines


def _lock_production_reservations(*, company, material_issue_line):
    """
    Lock the reservations belonging to one MaterialIssueLine.

    Production reservations are identified by reference_type/reference_id
    because StockReservation deliberately does not depend on production models.
    """
    from apps.inventory.ledger import ReservationStatus, StockReservation

    reservations = list(
        StockReservation.objects.select_for_update(of=("self",))
        .filter(
            company=company,
            reference_type="PRODUCTION_MATERIAL",
            reference_id=material_issue_line.pk,
            status=ReservationStatus.OPEN,
        )
        .order_by("created_at", "id")
    )

    if not reservations:
        raise MaterialIssueError(
            f"No OPEN reservation exists for material issue line {material_issue_line.pk}.",
            code="RESERVATION_NOT_FOUND",
        )

    return reservations


def _consume_production_reservation(
    *,
    company,
    material_issue_line: MaterialIssueLine,
    quantity: Decimal,
    user=None,
):
    """
    Consume an existing production reservation.

    This is intentionally separate from Sales' issue_reserved_stock().
    """
    from apps.inventory.ledger import (
        ReservationStatus,
        StockReservationAllocation,
    )

    remaining_to_issue = quantity
    consumed = []

    reservations = _lock_production_reservations(
        company=company,
        material_issue_line=material_issue_line,
    )

    for reservation in reservations:
        allocations = list(
            StockReservationAllocation.objects.select_for_update(of=("self",))
            .select_related(
                "receipt_layer",
                "receipt_layer__lot",
                "receipt_layer__warehouse",
                "receipt_layer__bin",
            )
            .filter(
                reservation=reservation,
            )
            .order_by(
                "receipt_layer__fifo_rank",
                "receipt_layer__receipt_sequence",
                "receipt_layer__received_at",
                "receipt_layer__id",
            )
        )

        for allocation in allocations:
            if remaining_to_issue <= 0:
                break

            layer = (
                InventoryReceiptLayer.objects.select_for_update(of=("self",))
                .select_related("lot", "warehouse", "bin")
                .get(pk=allocation.receipt_layer_id)
            )

            lot = (
                InventoryLot.objects.select_for_update(of=("self",))
                .get(pk=layer.lot_id)
            )

            if layer.company_id != company.pk or lot.company_id != company.pk:
                raise MaterialIssueError(
                    "Production reservation crosses company ownership.",
                    code="RESERVATION_COMPANY_MISMATCH",
                )

            if layer.item_id != material_issue_line.item_id:
                raise MaterialIssueError(
                    "Reserved inventory item does not match material issue line.",
                    code="RESERVATION_ITEM_MISMATCH",
                )

            if lot.status != LotStatus.AVAILABLE:
                raise MaterialIssueError(
                    f"Reserved lot {lot.lot_number} is no longer AVAILABLE.",
                    code="RESERVED_LOT_NOT_AVAILABLE",
                )

            if layer.remaining_quantity <= 0:
                raise MaterialIssueError(
                    "Reserved inventory layer has no remaining quantity.",
                    code="RESERVED_LAYER_EMPTY",
                )

            available_reserved = min(
                _as_decimal(allocation.quantity),
                _as_decimal(layer.reserved_quantity),
                _as_decimal(layer.remaining_quantity),
            )

            take = min(remaining_to_issue, available_reserved)

            if take <= 0:
                continue

            unit_cost = layer_unit_cost(layer)

            layer.remaining_quantity -= take
            layer.reserved_quantity -= take

            if layer.remaining_quantity < 0 or layer.reserved_quantity < 0:
                raise MaterialIssueError(
                    "Production issue would create negative inventory.",
                    code="NEGATIVE_STOCK_BLOCKED",
                )

            layer.save(
                update_fields=[
                    "remaining_quantity",
                    "reserved_quantity",
                    "updated_at",
                ]
            )

            sync_lot_remaining_from_layers(lot)

            append_ledger_entry(
                company=company,
                item=material_issue_line.item,
                lot=lot,
                receipt_layer=layer,
                warehouse=layer.warehouse,
                bin=layer.bin,
                txn_type=StockTxnType.ISSUE,
                quantity_in=ZERO,
                quantity_out=take,
                uom=layer.uom,
                unit_cost=unit_cost,
                reference_type="MATERIAL_ISSUE",
                reference_id=material_issue_line.material_issue_id,
                user=user,
                reason=f"Production material issue {material_issue_line.material_issue.document_number}",
            )

            allocation.quantity -= take

            if allocation.quantity <= 0:
                allocation.delete()
            else:
                allocation.save(
                    update_fields=["quantity", "updated_at"]
                )

            reservation.quantity -= take

            if reservation.quantity <= 0:
                reservation.status = ReservationStatus.RELEASED
                reservation.save(
                    update_fields=["status", "updated_at"]
                )
            else:
                reservation.save(
                    update_fields=["quantity", "updated_at"]
                )

            consumed.append(
                {
                    "lot": lot,
                    "layer": layer,
                    "quantity": take,
                    "uom": layer.uom,
                    "unit_cost": unit_cost,
                }
            )

            remaining_to_issue -= take

        if remaining_to_issue <= 0:
            break

    if remaining_to_issue > 0:
        raise MaterialIssueError(
            f"Unable to consume the complete reserved quantity. Remaining: {remaining_to_issue}.",
            code="RESERVED_QUANTITY_SHORTAGE",
        )

    return consumed


@transaction.atomic
def post_material_issue(
    *,
    material_issue: MaterialIssue,
    user=None,
) -> MaterialIssue:
    """
    Consume the reservations attached to every MaterialIssueLine.

    No direct FIFO issue is performed here. Only the previously created
    production reservations can be consumed.
    """
    issue = (
        MaterialIssue.objects.select_for_update(of=("self",))
        .select_related(
            "company",
            "production_order",
            "warehouse",
            "production_bin",
        )
        .prefetch_related(
            "lines",
            "lines__bom_line",
            "lines__item",
            "lines__uom",
        )
        .get(pk=material_issue.pk)
    )

    assert_company_allowed(user, issue.company_id)

    if issue.status != "DRAFT":
        raise MaterialIssueError(
            f"Only DRAFT material issues can be posted (current={issue.status}).",
            code="INVALID_MATERIAL_ISSUE_STATUS",
        )

    order = (
        ProductionOrder.objects.select_for_update(of=("self",))
        .get(pk=issue.production_order_id)
    )

    if order.status not in {
        ProductionOrderStatus.RELEASED,
        ProductionOrderStatus.IN_PROGRESS,
    }:
        raise MaterialIssueError(
            f"Production order cannot receive material issue in status {order.status}.",
            code="INVALID_PRODUCTION_STATUS",
        )

    lines = list(issue.lines.all().order_by("id"))

    if not lines:
        raise MaterialIssueError(
            "Material issue must contain at least one line.",
            code="EMPTY_MATERIAL_ISSUE",
        )

    # First validate every line and reservation before changing stock.
    for line in lines:
        consumed_allocations = _consume_production_reservation(
            company=issue.company,
            material_issue_line=line,
            quantity=_as_decimal(line.quantity),
            user=user,
        )

        if not consumed_allocations:
            raise MaterialIssueError(
                f"No inventory was consumed for material issue line {line.pk}.",
                code="NO_STOCK_CONSUMED",
            )

        # One MaterialIssueLine can point to only one lot/layer.
        # Therefore split the line when FIFO consumption spans multiple layers.
        first_consumed = consumed_allocations[0]

        line.quantity = first_consumed["quantity"]
        line.uom = first_consumed["uom"]
        line.lot = first_consumed["lot"]
        line.receipt_layer = first_consumed["layer"]
        line.updated_by = user
        line.save(
            update_fields=[
                "quantity",
                "uom",
                "lot",
                "receipt_layer",
                "updated_by",
                "updated_at",
            ]
        )

        for consumed in consumed_allocations[1:]:
            MaterialIssueLine.objects.create(
                material_issue=issue,
                bom_line=line.bom_line,
                item=line.item,
                lot=consumed["lot"],
                receipt_layer=consumed["layer"],
                quantity=consumed["quantity"],
                uom=consumed["uom"],
                created_by=user,
                updated_by=user,
            )

    issue.status = "POSTED"
    issue.posted_at = timezone.now()
    issue.updated_by = user
    issue.save(
        update_fields=["status", "posted_at", "updated_by", "updated_at"]
    )

    if order.status == ProductionOrderStatus.RELEASED:
        order.status = ProductionOrderStatus.IN_PROGRESS
        order.updated_by = user
        order.save(update_fields=["status", "updated_by", "updated_at"])

    _audit(
        user=user,
        action="submit",
        obj=issue,
        document_number=issue.document_number,
        after_data={
            "production_order_id": str(order.pk),
            "production_order_number": order.document_number,
            "line_count": len(lines),
            "status": issue.status,
        },
    )

    emit(
        MATERIAL_ISSUED,
        {
            "material_issue_id": str(issue.id),
            "material_issue_number": issue.document_number,
            "production_order_id": str(order.id),
            "production_order_number": order.document_number,
        },
    )

    return issue


def _validate_production_output_location(*, company, warehouse, output_bin):
    if warehouse.company_id != company.id:
        raise ProductionOutputError(
            "Output warehouse does not belong to the production company.",
            code="WAREHOUSE_COMPANY_MISMATCH",
        )

    if output_bin.warehouse_id != warehouse.id:
        raise ProductionOutputError(
            "Output bin does not belong to the selected warehouse.",
            code="BIN_WAREHOUSE_MISMATCH",
        )

    if output_bin.bin_type != BinType.FINISHED_GOODS:
        raise ProductionOutputError(
            "Production output must be received into a finished-goods bin.",
            code="INVALID_OUTPUT_BIN_TYPE",
        )


def _validate_output_quantity(*, order, quantity, uom):
    qty = _as_decimal(quantity)

    if qty <= 0:
        raise ProductionOutputError(
            "Production output quantity must be greater than zero.",
            code="INVALID_QUANTITY",
        )

    _validate_uom_for_item(
        item=order.output_item,
        uom=uom,
    )

    if uom.id != order.uom_id:
        try:
            qty_in_order_uom = convert_quantity(
                item=order.output_item,
                quantity=qty,
                from_uom=uom,
                to_uom=order.uom,
            )
        except Exception as exc:
            raise ProductionOutputError(
                "Production output UOM cannot be converted to the production order UOM.",
                code="UOM_CONVERSION_ERROR",
            ) from exc
    else:
        qty_in_order_uom = qty

    remaining = (
        _as_decimal(order.planned_quantity)
        - _as_decimal(order.produced_quantity)
    )

    if qty_in_order_uom > remaining:
        raise ProductionOutputError(
            "Production output exceeds the remaining planned quantity.",
            code="OUTPUT_QTY_EXCEEDS_PLAN",
        )

    return qty, qty_in_order_uom

@transaction.atomic
def create_production_output(
    *,
    company,
    production_order,
    quantity,
    uom,
    warehouse,
    output_bin,
    output_date=None,
    user=None,
    notes="",
):
    assert_company_allowed(user, company.pk)

    order = (
        ProductionOrder.objects
        .select_for_update(of=("self",))
        .select_related(
            "bom_version",
            "bom_version__bom",
            "output_item",
            "uom",
            "warehouse",
            "production_bin",
        )
        .get(pk=production_order.pk)
    )

    if order.company_id != company.id:
        raise ProductionOutputError(
            "Production order does not belong to the selected company.",
            code="COMPANY_MISMATCH",
        )

    if order.status not in {
        ProductionOrderStatus.RELEASED,
        ProductionOrderStatus.IN_PROGRESS,
    }:
        raise ProductionOutputError(
            "Production output can only be created for a released or in-progress production order.",
            code="INVALID_ORDER_STATUS",
        )

    if order.bom_version.company_id != company.id:
        raise ProductionOutputError(
            "Production BOM version does not belong to the selected company.",
            code="BOM_COMPANY_MISMATCH",
        )

    _validate_production_output_location(
        company=company,
        warehouse=warehouse,
        output_bin=output_bin,
    )

    quantity, quantity_in_order_uom = _validate_output_quantity(
        order=order,
        quantity=quantity,
        uom=uom,
    )

    if output_date is None:
        output_date = timezone.now().date()

    output = ProductionOutput.objects.create(
        company=company,
        production_order=order,
        warehouse=warehouse,
        output_bin=output_bin,
        output_date=output_date,
        status=ProductionDocumentStatus.DRAFT,
        notes=notes,
        created_by=user,
        updated_by=user,
    )

    ProductionOutputLine.objects.create(
        production_output=output,
        item=order.output_item,
        quantity=quantity,
        uom=uom,
        created_by=user,
        updated_by=user,
    )

    _audit(
        user=user,
        action=AuditAction.CREATE,
        obj=output,
        document_number=output.document_number,
        after_data={
            "production_order_id": str(order.id),
            "quantity": str(quantity),
            "uom_id": str(uom.id),
            "warehouse_id": str(warehouse.id),
            "output_bin_id": str(output_bin.id),
        },
    )

    return output


def _calculate_production_output_unit_cost(*, order, output_quantity):
    lines = list(
        MaterialIssueLine.objects
        .filter(
            material_issue__production_order=order,
            material_issue__status=ProductionDocumentStatus.POSTED,
        )
        .select_related(
            "item",
            "uom",
            "receipt_layer",
            "receipt_layer__lot",
        )
    )

    if not lines:
        raise ProductionOutputError(
            "Production output requires a posted material issue.",
            code="MATERIAL_ISSUE_REQUIRED",
        )

    total_material_cost = Decimal("0")

    for line in lines:
        if line.receipt_layer_id is None:
            raise ProductionOutputError(
                "Material issue line is missing its consumed receipt layer.",
                code="MATERIAL_LAYER_REQUIRED",
            )

        unit_cost = layer_unit_cost(line.receipt_layer)

        total_material_cost += (
            _as_decimal(line.quantity) * unit_cost
        )

    qty = _as_decimal(output_quantity)

    if qty <= 0:
        raise ProductionOutputError(
            "Production output quantity must be positive.",
            code="INVALID_QUANTITY",
        )

    return total_material_cost / qty


@transaction.atomic
def post_production_output(
    *,
    company,
    production_output,
    user=None,
):
    assert_company_allowed(user, company.pk)

    output = (
        ProductionOutput.objects
        .select_for_update(of=("self",))
        .select_related(
            "production_order",
            "production_order__output_item",
            "production_order__uom",
            "warehouse",
            "output_bin",
        )
        .prefetch_related("lines")
        .get(pk=production_output.pk)
    )

    if output.company_id != company.id:
        raise ProductionOutputError(
            "Production output does not belong to the selected company.",
            code="COMPANY_MISMATCH",
        )

    if output.status != ProductionDocumentStatus.DRAFT:
        raise ProductionOutputError(
            "Only a draft production output can be posted.",
            code="OUTPUT_ALREADY_POSTED",
        )

    order = (
        ProductionOrder.objects
        .select_for_update(of=("self",))
        .select_related(
            "output_item",
            "uom",
        )
        .get(pk=output.production_order_id)
    )

    if order.company_id != company.id:
        raise ProductionOutputError(
            "Production order does not belong to the selected company.",
            code="COMPANY_MISMATCH",
        )

    if order.status not in {
        ProductionOrderStatus.RELEASED,
        ProductionOrderStatus.IN_PROGRESS,
    }:
        raise ProductionOutputError(
            "Production order is not eligible for output posting.",
            code="INVALID_ORDER_STATUS",
        )

    lines = list(output.lines.all())

    if not lines:
        raise ProductionOutputError(
            "Production output must contain at least one line.",
            code="OUTPUT_LINES_REQUIRED",
        )

    _validate_production_output_location(
        company=company,
        warehouse=output.warehouse,
        output_bin=output.output_bin,
    )

    total_output_qty = Decimal("0")

    for line in lines:
        if line.item_id != order.output_item_id:
            raise ProductionOutputError(
                "Production output line item does not match the production order output item.",
                code="OUTPUT_ITEM_MISMATCH",
            )

        _validate_uom_for_item(item=line.item, uom=line.uom)

        qty = _as_decimal(line.quantity)

        if qty <= 0:
            raise ProductionOutputError(
                "Production output quantity must be greater than zero.",
                code="INVALID_QUANTITY",
            )

        total_output_qty += qty

    output_qty_in_order_uom = total_output_qty

    if lines[0].uom_id != order.uom_id:
        try:
            output_qty_in_order_uom = convert_quantity(
                item=order.output_item,
                quantity=total_output_qty,
                from_uom=lines[0].uom,
                to_uom=order.uom,
            )
        except Exception as exc:
            raise ProductionOutputError(
                "Production output cannot be converted to the production order UOM.",
                code="UOM_CONVERSION_ERROR",
            ) from exc

    remaining_planned = (
        _as_decimal(order.planned_quantity)
        - _as_decimal(order.produced_quantity)
    )

    if output_qty_in_order_uom > remaining_planned:
        raise ProductionOutputError(
            "Production output exceeds the remaining planned quantity.",
            code="OUTPUT_QTY_EXCEEDS_PLAN",
        )

    # A posted material issue is mandatory before FG receipt.
    material_issue = (
        MaterialIssue.objects
        .filter(
            production_order=order,
            company=company,
            status=ProductionDocumentStatus.POSTED,
        )
        .order_by("-posted_at", "-created_at")
        .first()
    )

    if material_issue is None:
        raise ProductionOutputError(
            "A posted material issue is required before production output.",
            code="MATERIAL_ISSUE_REQUIRED",
        )

    unit_cost = _calculate_production_output_unit_cost(
        order=order,
        output_quantity=output_qty_in_order_uom,
    )

    # The FG lot uses the production output document number as its
    # company-unique source lot identifier.
    lot_number = output.document_number

    if InventoryLot.objects.filter(
        company=company,
        lot_number=lot_number,
    ).exists():
        raise ProductionOutputError(
            "Production output lot already exists.",
            code="DUPLICATE_OUTPUT_LOT",
        )

    item = order.output_item

    if item.qc_required:
        lot_status = LotStatus.QC_HOLD
        qc_status = "HOLD"
    else:
        lot_status = LotStatus.AVAILABLE
        qc_status = "N/A"

    now = timezone.now()

    lot = InventoryLot.objects.create(
        company=company,
        lot_number=lot_number,
        item=item,
        manufacturing_date=output.output_date,
        received_date=output.output_date,
        genealogy_reference=output.document_number,
        warehouse=output.warehouse,
        bin=output.output_bin,
        status=lot_status,
        qc_status=qc_status,
        uom=lines[0].uom,
        initial_quantity=total_output_qty,
        remaining_quantity=total_output_qty,
        purchase_unit_cost=unit_cost,
        landed_unit_cost=None,
        created_by=user,
        updated_by=user,
    )

    receipt_sequence = next_receipt_sequence(
        company,
        item,
    )

    layer = InventoryReceiptLayer.objects.create(
        company=company,
        lot=lot,
        item=item,
        warehouse=output.warehouse,
        bin=output.output_bin,
        received_at=now,
        receipt_sequence=receipt_sequence,
        fifo_rank=receipt_sequence,
        uom=lines[0].uom,
        initial_quantity=total_output_qty,
        remaining_quantity=total_output_qty,
        reserved_quantity=Decimal("0"),
        purchase_unit_cost=unit_cost,
        landed_unit_cost=None,
        currency=None,
        qc_status=qc_status,
        created_by=user,
        updated_by=user,
    )

    append_ledger_entry(
        company=company,
        item=item,
        lot=lot,
        receipt_layer=layer,
        warehouse=output.warehouse,
        bin=output.output_bin,
        txn_type=StockTxnType.GRN_RECEIPT,
        quantity_in=total_output_qty,
        uom=lines[0].uom,
        unit_cost=unit_cost,
        reference_type="PRODUCTION_OUTPUT",
        reference_id=output.id,
        user=user,
        reason=f"Production output {output.document_number}",
        occurred_at=now,
    )

    # Attach the generated FG lot to the output line.
    for line in lines:
        line.lot = lot
        line.updated_by = user
        line.save(
            update_fields=[
                "lot",
                "updated_by",
                "updated_at",
            ]
        )
    if item.qc_required:
        QCInspection.objects.create(
            company=company,
            inspection_number=generate_document_number("QCI"),
            grn=None,
            lot=lot,
            item=item,
            status=QCInspectionStatus.DRAFT,
            created_by=user,
           updated_by=user,
        )

    previous_produced = _as_decimal(order.produced_quantity)
    new_produced = previous_produced + output_qty_in_order_uom

    order.produced_quantity = new_produced

    if new_produced >= _as_decimal(order.planned_quantity):
        order.produced_quantity = _as_decimal(order.planned_quantity)
        order.status = ProductionOrderStatus.COMPLETED
    else:
        order.status = ProductionOrderStatus.IN_PROGRESS

    order.updated_by = user
    order.save(
        update_fields=[
            "produced_quantity",
            "status",
            "updated_by",
            "updated_at",
        ]
    )
    for line in lines:
        _create_production_output_traceability(
            company=company,
            order=order,
            output_line=line,
            output_lot=lot,
            previous_produced=previous_produced,
            new_produced=new_produced,
            user=user,
        )

    output.status = ProductionDocumentStatus.POSTED
    output.posted_at = now
    output.updated_by = user
    output.save(
        update_fields=[
            "status",
            "posted_at",
            "updated_by",
            "updated_at",
        ]
    )

    _audit(
        user=user,
        action=AuditAction.POST,
        obj=output,
        document_number=output.document_number,
        after_data={
            "production_order_id": str(order.id),
            "lot_id": str(lot.id),
            "lot_number": lot.lot_number,
            "quantity": str(total_output_qty),
            "unit_cost": str(unit_cost),
            "lot_status": lot.status,
            "production_order_status": order.status,
        },
    )

    emit(
        PRODUCTION_OUTPUT_POSTED,
        {
            "production_output_id": str(output.id),
            "production_output_number": output.document_number,
            "production_order_id": str(order.id),
            "production_order_number": order.document_number,
            "lot_id": str(lot.id),
            "lot_number": lot.lot_number,
        },
    )

    return output, lot, layer


def _create_production_output_traceability(
    *,
    company,
    order,
    output_line,
    output_lot,
    previous_produced,
    new_produced,
    user=None,
):
    material_lines = list(
        MaterialIssueLine.objects
        .filter(
            material_issue__production_order=order,
            material_issue__company=company,
            material_issue__status=ProductionDocumentStatus.POSTED,
        )
        .select_related(
            "material_issue",
            "item",
            "lot",
            "receipt_layer",
            "uom",
        )
    )

    planned = _as_decimal(order.planned_quantity)

    if planned <= 0:
        raise ProductionOutputError(
            "Production order planned quantity must be positive.",
            code="INVALID_PLANNED_QUANTITY",
        )

    previous_ratio = previous_produced / planned
    new_ratio = new_produced / planned

    for material_line in material_lines:
        consumed_qty = _as_decimal(material_line.quantity)

        already_traced = (
            ProductionLotTraceability.objects
            .filter(
                company=company,
                production_order=order,
                material_issue_line=material_line,
            )
            .aggregate(total=models.Sum("quantity_consumed"))
            .get("total")
            or Decimal("0")
        )

        total_allocated_before = (
            consumed_qty * previous_ratio
        )

        total_allocated_after = (
            consumed_qty * new_ratio
        )

        trace_qty = (
            total_allocated_after
            - total_allocated_before
        )

        # Protect against rounding/repeated output posting.
        trace_qty = max(
            Decimal("0"),
            trace_qty,
        )

        remaining_trace = consumed_qty - already_traced

        trace_qty = min(
            trace_qty,
            remaining_trace,
        )

        if trace_qty <= 0:
            continue

        ProductionLotTraceability.objects.create(
            company=company,
            production_order=order,
            material_issue_line=material_line,
            consumed_lot=material_line.lot,
            consumed_layer=material_line.receipt_layer,
            output_line=output_line,
            output_lot=output_lot,
            quantity_consumed=trace_qty,
            uom=material_line.uom,
            created_by=user,
            updated_by=user,
        )
