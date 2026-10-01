"""Milestone 2 dashboard KPIs — read-only queries over typed domain tables."""

from decimal import Decimal

from django.db.models import Count, Sum
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.crm.models import Customer
from apps.inventory.ledger import StockReservation, ReservationStatus
from apps.inventory.models import InventoryLot, Item, LotStatus
from apps.organization.company_scope import assert_company_allowed, company_pk
from apps.organization.models import Company
from apps.procurement.commercial import PurchaseOrder, PurchaseOrderStatus, SupplierBill
from apps.procurement.inbound import GoodsReceiptNote, GrnStatus
from apps.procurement.models import Supplier
from apps.quality.qc import QCInspection, QCInspectionStatus
from apps.sales.commercial import (
    DispatchNote,
    DispatchNoteStatus,
    SalesInvoice,
    SalesInvoiceStatus,
    SalesOrder,
    SalesOrderStatus,
)
from apps.warehouse.models import Bin, Warehouse
from apps.workflow.models import ApprovalRequest, ApprovalStatus


class DashboardSummaryView(APIView):
    """
    GET /api/v1/system/dashboard-summary/?company=<uuid>

    Real DB aggregates for M2 demo — no hardcoded KPIs.
    """

    permission_classes = [IsAuthenticated, HasModulePermission]
    module_code = "system"

    def get(self, request):
        company_id = request.query_params.get("company")
        if not company_id:
            company = Company.objects.order_by("created_at").first()
            if company is None:
                return Response({"detail": "No company configured."}, status=400)
            company_id = str(company.id)
        assert_company_allowed(request.user, company_pk(company_id))
        company = Company.objects.get(pk=company_id)

        open_po_statuses = [
            PurchaseOrderStatus.SUBMITTED,
            PurchaseOrderStatus.APPROVED,
            PurchaseOrderStatus.SENT,
            PurchaseOrderStatus.PARTIALLY_RECEIVED,
        ]
        open_so_statuses = [
            SalesOrderStatus.CONFIRMED,
            SalesOrderStatus.PARTIALLY_RESERVED,
            SalesOrderStatus.RESERVED,
            SalesOrderStatus.PARTIALLY_DISPATCHED,
        ]

        lot_counts = {
            row["status"]: row["c"]
            for row in InventoryLot.objects.filter(company=company)
            .values("status")
            .annotate(c=Count("id"))
        }

        reserved_qty = (
            StockReservation.objects.filter(company=company, status=ReservationStatus.OPEN).aggregate(
                t=Sum("quantity")
            )["t"]
            or Decimal("0")
        )

        invoice_total = (
            SalesInvoice.objects.filter(company=company, status=SalesInvoiceStatus.POSTED).aggregate(
                t=Sum("total")
            )["t"]
            or Decimal("0")
        )
        po_open_value = (
            PurchaseOrder.objects.filter(company=company, status__in=open_po_statuses)
            .prefetch_related("lines")
        )
        # Approximate open PO value from lines
        po_value = Decimal("0")
        for po in po_open_value:
            for line in po.lines.all():
                po_value += (line.ordered_quantity or Decimal("0")) * (line.unit_price or Decimal("0"))

        payload = {
            "company_id": str(company.id),
            "company_name": company.name,
            "masters": {
                "customers": Customer.objects.filter(company=company, is_active=True).count(),
                "suppliers": Supplier.objects.filter(company=company, is_active=True).count(),
                "items": Item.objects.filter(company=company, is_active=True).count(),
                "warehouses": Warehouse.objects.filter(company=company, is_active=True).count(),
                "bins": Bin.objects.filter(warehouse__company=company, is_active=True).count(),
            },
            "inventory": {
                "lots_available": lot_counts.get(LotStatus.AVAILABLE, 0),
                "lots_qc_hold": lot_counts.get(LotStatus.QC_HOLD, 0),
                "lots_quarantined": lot_counts.get(LotStatus.QUARANTINED, 0),
                "lots_rejected": lot_counts.get(LotStatus.REJECTED, 0),
                "reserved_quantity": str(reserved_qty),
            },
            "purchase": {
                "open_purchase_orders": PurchaseOrder.objects.filter(
                    company=company, status__in=open_po_statuses
                ).count(),
                "posted_grns": GoodsReceiptNote.objects.filter(
                    company=company, status=GrnStatus.POSTED
                ).count(),
                "open_po_line_value": str(po_value.quantize(Decimal("0.01"))),
                "supplier_bills": SupplierBill.objects.filter(company=company).count(),
            },
            "sales": {
                "open_sales_orders": SalesOrder.objects.filter(
                    company=company, status__in=open_so_statuses
                ).count(),
                "posted_dispatches": DispatchNote.objects.filter(
                    company=company, status=DispatchNoteStatus.POSTED
                ).count(),
                "posted_invoices": SalesInvoice.objects.filter(
                    company=company, status=SalesInvoiceStatus.POSTED
                ).count(),
                "posted_invoice_total": str(invoice_total.quantize(Decimal("0.01"))),
            },
            "quality": {
                "open_inspections": QCInspection.objects.filter(
                    company=company, status=QCInspectionStatus.DRAFT
                ).count(),
                "passed": QCInspection.objects.filter(
                    company=company, status=QCInspectionStatus.PASSED
                ).count(),
                "failed": QCInspection.objects.filter(
                    company=company, status=QCInspectionStatus.FAILED
                ).count(),
            },
            "workflow": {
                "pending_approvals": ApprovalRequest.objects.filter(
                    company=company, status=ApprovalStatus.PENDING
                ).count(),
            },
        }
        return envelope(payload)
