from apps.core.record_api import make_record_viewset
from apps.quality.models import Record

ENTITIES = [('quality_plans', 'plans'), ('qc_inspections', 'inspections'), ('ncrs', 'ncrs'), ('capas', 'capas'), ('instruments', 'instruments'), ('certificates', 'certificates'), ('quarantine', 'quarantine')]
MODULE_CODE = "quality"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
