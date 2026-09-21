from apps.core.record_api import make_record_viewset
from apps.reports.models import Record

ENTITIES = [('saved_reports', 'saved')]
MODULE_CODE = "reports"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
