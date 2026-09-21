from datetime import date

from django.test import TestCase

from apps.core.exceptions import PeriodClosedError
from apps.organization.models import Company, FiscalPeriod, FiscalYear, FiscalYearStatus
from apps.organization.services import assert_period_open


class FiscalPeriodControlTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Ecowrap Nepal", legal_name="Ecowrap Nepal Pvt. Ltd.")
        self.fiscal_year = FiscalYear.objects.create(
            company=self.company, code="2082-83", start_date=date(2025, 7, 17), end_date=date(2026, 7, 16)
        )
        self.period = FiscalPeriod.objects.create(
            fiscal_year=self.fiscal_year,
            code="Shrawan",
            month_number=1,
            start_date=date(2025, 7, 17),
            end_date=date(2025, 8, 16),
        )

    def test_open_period_passes(self):
        assert_period_open(self.period)  # should not raise

    def test_closed_period_raises(self):
        self.period.status = FiscalYearStatus.CLOSED
        self.period.save(update_fields=["status"])
        with self.assertRaises(PeriodClosedError):
            assert_period_open(self.period)

    def test_closed_fiscal_year_raises_even_if_period_open(self):
        self.fiscal_year.status = FiscalYearStatus.CLOSED
        self.fiscal_year.save(update_fields=["status"])
        with self.assertRaises(PeriodClosedError):
            assert_period_open(self.period)

    def test_bs_representation_is_computed(self):
        self.assertTrue(self.fiscal_year.start_date_bs)
        self.assertRegex(self.fiscal_year.start_date_bs, r"^\d{4}-\d{2}-\d{2}$")
