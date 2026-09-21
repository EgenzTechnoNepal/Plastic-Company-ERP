from apps.core.record_api import make_record_viewset
from apps.procurement.models import Record

ENTITIES = [('suppliers', 'suppliers'), ('purchase_requisitions', 'requisitions'), ('rfqs', 'rfqs'), ('purchase_orders', 'orders'), ('gate_entries', 'gate-entries'), ('grns', 'receipts'), ('purchase_bills', 'bills'), ('purchase_returns', 'returns'), ('debit_notes', 'debit-notes'), ('vendor_payments', 'payments'), ('ocr_bills', 'ocr-bills')]
MODULE_CODE = "procurement"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}
