from apps.core.record_api import make_record_viewset
from apps.sales.models import Record

ENTITIES = [('sales_orders', 'orders'), ('deliveries', 'deliveries'), ('invoices', 'invoices'), ('payments', 'payments'), ('sales_returns', 'returns'), ('credit_notes', 'credit-notes')]
MODULE_CODE = "sales"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
