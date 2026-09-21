from apps.core.record_api import make_record_viewset
from apps.payroll.models import Record

ENTITIES = [('bank_files', 'bank-files')]
MODULE_CODE = "payroll"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
