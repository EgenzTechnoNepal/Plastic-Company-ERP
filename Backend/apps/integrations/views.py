from apps.core.record_api import make_record_viewset
from apps.integrations.models import Record

ENTITIES = [('whatsapp_templates', 'whatsapp-templates'), ('rfid_tags', 'rfid-tags'), ('iot_sensors', 'iot-sensors'), ('backups', 'backups')]
MODULE_CODE = "integrations"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
