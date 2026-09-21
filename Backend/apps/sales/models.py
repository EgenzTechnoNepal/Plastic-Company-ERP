from apps.core.documents import DomainRecord


class Record(DomainRecord):
    class Meta(DomainRecord.Meta):
        abstract = False
        db_table = "sales_record"
        verbose_name = "sales record"
