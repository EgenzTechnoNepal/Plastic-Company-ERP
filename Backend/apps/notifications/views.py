from apps.core.record_api import make_record_viewset
from apps.notifications.models import Record

ENTITIES = [('notifications', 'notifications')]
MODULE_CODE = "notifications"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
