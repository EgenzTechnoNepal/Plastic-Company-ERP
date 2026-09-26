from apps.core.documents import DomainRecord


class Record(DomainRecord):
    class Meta(DomainRecord.Meta):
        abstract = False
        db_table = "sales_record"
        verbose_name = "sales record"


# Phase 3 Slice A typed commercial models
from apps.sales.commercial import (  # noqa: E402
    DispatchNote,
    DispatchNoteLine,
    DispatchNoteStatus,
    SalesInvoice,
    SalesInvoiceLine,
    SalesInvoiceStatus,
    SalesOrder,
    SalesOrderLine,
    SalesOrderStatus,
)
