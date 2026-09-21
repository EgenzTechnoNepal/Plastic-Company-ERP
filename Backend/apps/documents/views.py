from apps.core.record_api import make_record_viewset
from apps.documents.models import Record

ENTITIES = [('attachments', 'attachments')]
MODULE_CODE = "documents"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
