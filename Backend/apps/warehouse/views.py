from apps.core.record_api import make_record_viewset
from apps.warehouse.models import Record

ENTITIES = [('warehouses', 'warehouses'), ('bins', 'bins'), ('stock_transfers', 'transfers'), ('bin_transfers', 'bin-transfers'), ('stock_counts', 'counts')]
MODULE_CODE = "warehouse"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
