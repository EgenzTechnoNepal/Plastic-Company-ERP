"""Factory for domain Record ViewSets that speak the frontend ErpRecord JSON shape."""

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import Action
from apps.accounts.permissions import HasActionPermission, HasModulePermission
from apps.audit.services import AuditService
from apps.core.pagination import envelope


def make_record_serializer(record_model):
    class RecordSerializer(serializers.ModelSerializer):
        class Meta:
            model = record_model
            fields = [
                "id",
                "entity",
                "code",
                "title",
                "date",
                "status",
                "fields",
                "lines",
                "history",
                "links",
                "created_at",
                "updated_at",
            ]
            read_only_fields = ["id", "created_at", "updated_at"]

    RecordSerializer.__name__ = f"{record_model._meta.app_label.title()}RecordSerializer"
    return RecordSerializer


def make_record_viewset(record_model, *, module_code: str, entity: str):
    Serializer = make_record_serializer(record_model)

    class RecordViewSet(viewsets.ModelViewSet):
        permission_classes = [HasModulePermission]
        serializer_class = Serializer
        search_fields = ["code", "title", "status"]
        filterset_fields = ["status", "entity"]
        ordering_fields = ["date", "code", "created_at", "status"]
        action_permission_map = {
            "submit": Action.SUBMIT,
            "approve": Action.APPROVE,
            "reject": Action.REJECT,
            "cancel": Action.CANCEL,
            "post": Action.POST,
            "reverse": Action.REVERSE,
        }

        def __init_subclass__(cls, **kwargs):
            super().__init_subclass__(**kwargs)

        def get_permissions(self):
            if getattr(self, "action", None) in self.action_permission_map:
                return [HasActionPermission()]
            return [HasModulePermission()]

        def get_queryset(self):
            return record_model.objects.filter(entity=entity, is_active=True)

        def retrieve(self, request, *args, **kwargs):
            return envelope(self.get_serializer(self.get_object()).data)

        def create(self, request, *args, **kwargs):
            payload = {**request.data, "entity": entity}
            serializer = self.get_serializer(data=payload)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            return envelope(serializer.data)

        def update(self, request, *args, **kwargs):
            return self._write(request, partial=False)

        def partial_update(self, request, *args, **kwargs):
            return self._write(request, partial=True)

        def _write(self, request, *, partial):
            instance = self.get_object()
            before = self.get_serializer(instance).data
            payload = {**request.data, "entity": entity}
            serializer = self.get_serializer(instance, data=payload, partial=partial)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            AuditService.log(
                user=request.user,
                action="update",
                module=module_code,
                model_name=entity,
                object_id=str(instance.id),
                document_number=instance.code,
                before_data=before,
                after_data=serializer.data,
            )
            return envelope(serializer.data)

        def destroy(self, request, *args, **kwargs):
            instance = self.get_object()
            before = self.get_serializer(instance).data
            instance.is_active = False
            instance.save(update_fields=["is_active", "updated_at"])
            AuditService.log(
                user=request.user,
                action="delete",
                module=module_code,
                model_name=entity,
                object_id=str(instance.id),
                document_number=instance.code,
                before_data=before,
                reason=request.data.get("reason", "") if isinstance(request.data, dict) else "",
            )
            return Response(status=status.HTTP_204_NO_CONTENT)

        def perform_create(self, serializer):
            instance = serializer.save(
                entity=entity,
                created_by=self.request.user,
                updated_by=self.request.user,
            )
            AuditService.log(
                user=self.request.user,
                action="create",
                module=module_code,
                model_name=entity,
                object_id=str(instance.id),
                document_number=instance.code,
                after_data=serializer.data,
            )

        def perform_update(self, serializer):
            serializer.save(updated_by=self.request.user)

        def _transition(self, request, new_status: str, action: str):
            instance = self.get_object()
            before = self.get_serializer(instance).data
            comment = ""
            if isinstance(request.data, dict):
                comment = request.data.get("comment") or request.data.get("reason") or ""
            history = list(instance.history or [])
            history.append(
                {
                    "id": f"h-{len(history) + 1}",
                    "status": new_status,
                    "by": getattr(request.user, "email", ""),
                    "at": instance.updated_at.isoformat() if instance.updated_at else "",
                    "comment": comment,
                }
            )
            instance.status = new_status
            instance.history = history
            instance.updated_by = request.user
            instance.save(update_fields=["status", "history", "updated_by", "updated_at"])
            data = self.get_serializer(instance).data
            AuditService.log(
                user=request.user,
                action=action,
                module=module_code,
                model_name=entity,
                object_id=str(instance.id),
                document_number=instance.code,
                before_data=before,
                after_data=data,
                reason=comment,
            )
            return envelope(data)

        @action(detail=True, methods=["post"])
        def submit(self, request, pk=None):
            return self._transition(request, "pending_approval", "submit")

        @action(detail=True, methods=["post"])
        def approve(self, request, pk=None):
            return self._transition(request, "approved", "approve")

        @action(detail=True, methods=["post"])
        def reject(self, request, pk=None):
            return self._transition(request, "rejected", "reject")

        @action(detail=True, methods=["post"])
        def cancel(self, request, pk=None):
            return self._transition(request, "cancelled", "cancel")

        @action(detail=True, methods=["post"])
        def post(self, request, pk=None):
            return self._transition(request, "posted", "post")

        @action(detail=True, methods=["post"])
        def reverse(self, request, pk=None):
            return self._transition(request, "reversed", "reverse")

    RecordViewSet.module_code = module_code
    RecordViewSet.screen_code = entity
    RecordViewSet.__name__ = f"{entity.title().replace('_', '')}ViewSet"
    RecordViewSet.__qualname__ = RecordViewSet.__name__
    return RecordViewSet
