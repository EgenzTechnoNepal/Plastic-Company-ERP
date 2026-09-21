from apps.core.record_api import make_record_viewset
from apps.workflow.models import Record

ENTITIES = [('workflow_rules', 'rules')]
MODULE_CODE = "workflow"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
