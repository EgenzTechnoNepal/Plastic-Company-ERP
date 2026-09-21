from rest_framework.decorators import action

from apps.core.pagination import envelope
from apps.core.record_api import make_record_viewset
from apps.inventory.models import Record

ENTITIES = [('products', 'products'), ('batches', 'batches'), ('stock_movements', 'movements'), ('stock_adjustments', 'adjustments')]
MODULE_CODE = "inventory"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}


class BatchViewSet(VIEWSETS["batches"]):
    @action(detail=True, methods=["get"])
    def genealogy(self, request, pk=None):
        obj = self.get_object()
        fields = obj.fields or {}
        return envelope(
            {
                "batch": self.get_serializer(obj).data,
                "work_order": fields.get("workOrder") or fields.get("wo"),
                "bom": fields.get("bom"),
                "source_lot": fields.get("rmBatch") or fields.get("sourceBatch"),
                "parents": obj.links or [],
            }
        )


VIEWSETS["batches"] = BatchViewSet
