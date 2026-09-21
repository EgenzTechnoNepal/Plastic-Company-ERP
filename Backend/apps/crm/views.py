from apps.core.record_api import make_record_viewset
from apps.crm.models import Record

ENTITIES = [('customers', 'customers'), ('contacts', 'contacts'), ('leads', 'leads'), ('opportunities', 'opportunities'), ('activities', 'activities'), ('dealers', 'dealers'), ('territories', 'territories'), ('tickets', 'tickets'), ('quotations', 'quotations')]
MODULE_CODE = "crm"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
