"""
Cross-cutting organization helpers used by every transactional module once
Phase B+ starts posting documents.
"""

from apps.core.exceptions import PeriodClosedError
from apps.organization.models import FiscalPeriod, FiscalYearStatus


def assert_period_open(fiscal_period: FiscalPeriod) -> None:
    if fiscal_period.status != FiscalYearStatus.OPEN:
        raise PeriodClosedError(
            f"Fiscal period '{fiscal_period.code}' ({fiscal_period.fiscal_year.code}) is {fiscal_period.status} "
            "and cannot accept new postings.",
        )
    if fiscal_period.fiscal_year.status != FiscalYearStatus.OPEN:
        raise PeriodClosedError(
            f"Fiscal year '{fiscal_period.fiscal_year.code}' is {fiscal_period.fiscal_year.status} "
            "and cannot accept new postings.",
        )


def fiscal_period_for_date(company, target_date):
    return (
        FiscalPeriod.objects.filter(
            fiscal_year__company=company,
            start_date__lte=target_date,
            end_date__gte=target_date,
        )
        .select_related("fiscal_year")
        .first()
    )
