from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.core.record_api import make_record_viewset
from apps.organization.company_scope import CompanyScopedMixin, assert_company_allowed, company_pk
from apps.workflow.approval_services import (
    approve_request,
    cancel_request,
    reject_request,
    request_approval,
)
from apps.workflow.models import ApprovalRequest, Record

ENTITIES = [("workflow_rules", "rules")]
MODULE_CODE = "workflow"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}


class ApprovalRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApprovalRequest
        fields = [
            "id",
            "company",
            "module_code",
            "target_type",
            "target_id",
            "document_number",
            "title",
            "status",
            "requested_by",
            "requested_at",
            "decided_by",
            "decided_at",
            "comments",
            "decision_reason",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "requested_by",
            "requested_at",
            "decided_by",
            "decided_at",
            "decision_reason",
            "created_at",
            "updated_at",
        ]


class ApprovalRequestViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    """
    Typed approval inbox foundation.

    POST create = request approval
    POST /{id}/approve/ | reject/ | cancel/
    """

    permission_classes = [HasModulePermission]
    module_code = MODULE_CODE
    company_field = "company"
    queryset = ApprovalRequest.objects.select_related(
        "company", "requested_by", "decided_by"
    ).all()
    serializer_class = ApprovalRequestSerializer
    filterset_fields = ["company", "status", "module_code", "target_type"]
    search_fields = ["document_number", "title"]
    ordering_fields = ["requested_at", "created_at"]
    http_method_names = ["get", "post", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        company = data.pop("company")
        assert_company_allowed(request.user, company_pk(company))
        req = request_approval(
            company=company,
            module_code=data.pop("module_code"),
            target_type=data.pop("target_type"),
            target_id=data.pop("target_id"),
            user=request.user,
            document_number=data.get("document_number", ""),
            title=data.get("title", ""),
            comments=data.get("comments", ""),
        )
        return Response(ApprovalRequestSerializer(req).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        reason = request.data.get("reason", "") or request.data.get("comment", "")
        return envelope(
            ApprovalRequestSerializer(
                approve_request(approval=self.get_object(), user=request.user, reason=reason)
            ).data
        )

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        reason = request.data.get("reason", "") or request.data.get("comment", "")
        return envelope(
            ApprovalRequestSerializer(
                reject_request(approval=self.get_object(), user=request.user, reason=reason)
            ).data
        )

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        reason = request.data.get("reason", "") or request.data.get("comment", "")
        return envelope(
            ApprovalRequestSerializer(
                cancel_request(approval=self.get_object(), user=request.user, reason=reason)
            ).data
        )
