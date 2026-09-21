from apps.core.record_api import make_record_viewset
from apps.hr.models import Record

ENTITIES = [('employees', 'employees'), ('attendance', 'attendance'), ('leave_requests', 'leaves'), ('payroll_runs', 'payroll-runs'), ('payslips', 'payslips'), ('performance_reviews', 'performance'), ('recruitment', 'recruitment')]
MODULE_CODE = "hr"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
