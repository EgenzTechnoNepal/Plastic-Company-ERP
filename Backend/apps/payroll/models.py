from apps.core.documents import DomainRecord


class Record(DomainRecord):
    class Meta(DomainRecord.Meta):
        abstract = False
        db_table = "payroll_record"
        verbose_name = "payroll record"



