from rest_framework import viewsets

from apps.accounts.permissions import HasModulePermission
from apps.core.record_api import make_record_viewset
from apps.warehouse.models import Bin, Rack, Record, Warehouse, Zone
from apps.warehouse.serializers import BinSerializer, RackSerializer, WarehouseSerializer, ZoneSerializer

ENTITIES = [
    ("warehouses", "warehouses"),
    ("bins", "bins"),
    ("stock_transfers", "transfers"),
    ("bin_transfers", "bin-transfers"),
    ("stock_counts", "counts"),
]
MODULE_CODE = "warehouse"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}


class WarehouseMasterViewSet(viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = MODULE_CODE

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.updated_by = self.request.user
        instance.save(update_fields=["is_active", "updated_by", "updated_at"])


class FacilityViewSet(WarehouseMasterViewSet):
    """Typed warehouse at /facilities/ — DomainRecord /warehouses/ remains for UI."""

    queryset = Warehouse.objects.select_related("company", "branch").all()
    serializer_class = WarehouseSerializer
    filterset_fields = ["company", "branch", "is_active"]
    search_fields = ["code", "name"]
    ordering_fields = ["code", "name", "created_at"]


class ZoneViewSet(WarehouseMasterViewSet):
    queryset = Zone.objects.select_related("warehouse").all()
    serializer_class = ZoneSerializer
    filterset_fields = ["warehouse", "is_active"]
    search_fields = ["code", "name", "warehouse__code"]


class RackViewSet(WarehouseMasterViewSet):
    queryset = Rack.objects.select_related("zone", "zone__warehouse").all()
    serializer_class = RackSerializer
    filterset_fields = ["zone", "is_active"]
    search_fields = ["code", "name"]


class StorageBinViewSet(WarehouseMasterViewSet):
    queryset = Bin.objects.select_related("warehouse", "zone", "rack").all()
    serializer_class = BinSerializer
    filterset_fields = ["warehouse", "zone", "rack", "bin_type", "is_active"]
    search_fields = ["code", "name", "warehouse__code"]
    ordering_fields = ["code", "bin_type", "created_at"]
