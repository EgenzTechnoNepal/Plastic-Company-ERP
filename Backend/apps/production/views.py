from apps.core.record_api import make_record_viewset
from apps.production.models import Record

ENTITIES = [('boms', 'boms'), ('production_plans', 'plans'), ('mrp_runs', 'mrp'), ('work_orders', 'orders'), ('material_issues', 'issues'), ('operations', 'operations'), ('machines', 'machines'), ('machine_schedules', 'schedules')]
MODULE_CODE = "production"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
