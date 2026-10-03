"""Phase 2/3 QC APIs + Wave 2 dispose."""

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.inventory.models import InventoryLot
from apps.organization.company_scope import CompanyScopedMixin
from apps.quality.disposition_services import dispose_failed_material
from apps.quality.qc import QCInspection, QCInspectionStatus
from apps.quality.qc_services import fail_inspection, pass_inspection, start_reinspect


class QCInspectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = QCInspection
        fields = [
            "id",
            "company",
            "inspection_number",
            "grn",
            "lot",
            "item",
            "status",
            "fail_disposition",
            "inspected_at",
            "remarks",
            "coa_reference",
            "coa_attachment_url",
            "metrics",
            "ncr_reference",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "fail_disposition",
            "inspected_at",
            "ncr_reference",
            "created_at",
            "updated_at",
        ]

    def update(self, instance, validated_data):
        if instance.status != QCInspectionStatus.DRAFT:
            raise serializers.ValidationError("Only DRAFT inspections can be updated.")
        for key in ("coa_reference", "coa_attachment_url", "metrics", "remarks"):
            if key in validated_data:
                setattr(instance, key, validated_data[key])
        user = self.context["request"].user if self.context.get("request") else None
        if user is not None:
            instance.updated_by = user
        instance.save()
        return instance


class QCInspectionViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "quality"
    company_field = "company"
    queryset = QCInspection.objects.select_related("lot", "item", "grn").all()
    serializer_class = QCInspectionSerializer
    filterset_fields = ["company", "lot", "status", "grn"]
    search_fields = ["inspection_number"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, serializer):
        self._assert_validated_company_access(serializer.validated_data)
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="pass")
    def pass_action(self, request, pk=None):
        inspection = self.get_object()
        ser = self.get_serializer(inspection, data=request.data, partial=True)
        if ser.is_valid() and inspection.status == QCInspectionStatus.DRAFT:
            for key in ("coa_reference", "coa_attachment_url", "metrics", "remarks"):
                if key in ser.validated_data:
                    val = ser.validated_data[key]
                    if key == "coa_attachment_url" and not val:
                        val = ""
                    setattr(inspection, key, val)
            inspection.updated_by = request.user
            inspection.save()
        updated = pass_inspection(inspection=inspection, user=request.user)
        return envelope(QCInspectionSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="fail")
    def fail_action(self, request, pk=None):
        inspection = self.get_object()
        disposition = request.data.get("disposition")
        updated = fail_inspection(inspection=inspection, disposition=disposition, user=request.user)
        return envelope(QCInspectionSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="dispose")
    def dispose_action(self, request, pk=None):
        """After QC Fail: RETURN (PRT+DBN drafts) or SCRAP (write-off)."""
        inspection = self.get_object()
        result = dispose_failed_material(
            action=request.data.get("action") or request.data.get("disposition") or "",
            inspection=inspection,
            ncr_code=request.data.get("ncr") or request.data.get("ncr_code"),
            user=request.user,
            remarks=request.data.get("remarks") or "",
        )
        return envelope(result)

    @action(detail=False, methods=["post"], url_path="reinspect")
    def reinspect_action(self, request):
        lot_id = request.data.get("lot") or request.data.get("lot_id")
        if not lot_id:
            return Response(
                {"error": {"code": "MISSING_LOT", "message": "lot is required", "fields": {}}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        lot = InventoryLot.objects.get(pk=lot_id)
        created = start_reinspect(lot=lot, user=request.user, remarks=request.data.get("remarks") or "")
        out = envelope(QCInspectionSerializer(created).data)
        out.status_code = status.HTTP_201_CREATED
        return out
