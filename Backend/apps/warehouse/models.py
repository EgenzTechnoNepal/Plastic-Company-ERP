from apps.core.documents import DomainRecord


class Record(DomainRecord):
    class Meta(DomainRecord.Meta):
        abstract = False
        db_table = "warehouse_record"
        verbose_name = "warehouse record"
