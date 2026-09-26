from apps.core.documents import DomainRecord
from apps.quality.qc import QCFailDisposition, QCInspection, QCInspectionStatus  # noqa: F401


class Record(DomainRecord):
    class Meta(DomainRecord.Meta):
        abstract = False
        db_table = "quality_record"
        verbose_name = "quality record"
