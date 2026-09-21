from apps.core.record_api import make_record_viewset
from apps.planning.models import Record

ENTITIES = [('capacity_plans', 'capacity')]
MODULE_CODE = "planning"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
