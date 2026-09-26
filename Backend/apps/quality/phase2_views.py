"""Phase 2 QC APIs."""

from rest_framework import serializers, viewsets
from rest_framework.decorators import action

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.organization.company_scope import CompanyScopedMixin
from apps.quality.qc import QCInspection
from apps.quality.qc_services import fail_inspection, pass_inspection


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
            "created_at",
        ]
        read_only_fields = ["id", "status", "fail_disposition", "inspected_at", "created_at"]


class QCInspectionViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "quality"
    company_field = "company"
    queryset = QCInspection.objects.select_related("lot", "item", "grn").all()
    serializer_class = QCInspectionSerializer
    filterset_fields = ["company", "lot", "status", "grn"]
    search_fields = ["inspection_number"]

    def perform_create(self, serializer):
        self._assert_validated_company_access(serializer.validated_data)
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="pass")
    def pass_action(self, request, pk=None):
        inspection = self.get_object()
        updated = pass_inspection(inspection=inspection, user=request.user)
        return envelope(QCInspectionSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="fail")
    def fail_action(self, request, pk=None):
        inspection = self.get_object()
        disposition = request.data.get("disposition", "QUARANTINED")
        updated = fail_inspection(inspection=inspection, disposition=disposition, user=request.user)
        return envelope(QCInspectionSerializer(updated).data)
