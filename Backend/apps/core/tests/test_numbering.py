from datetime import date

from django.test import TestCase

from apps.core.services.numbering import generate_document_number
from apps.organization.models import Branch, Company, FiscalYear


class DocumentNumberingTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Ecowrap Nepal", legal_name="Ecowrap Nepal Pvt. Ltd.")
        self.branch = Branch.objects.create(company=self.company, code="ITH", name="Itahari Plant")
        self.fiscal_year = FiscalYear.objects.create(
            company=self.company, code="2082-83", start_date=date(2025, 7, 17), end_date=date(2026, 7, 16)
        )

    def test_sequence_increments_and_formats(self):
        first = generate_document_number("SO", fiscal_year=self.fiscal_year, branch=self.branch)
        second = generate_document_number("SO", fiscal_year=self.fiscal_year, branch=self.branch)

        self.assertEqual(first, "SO-2082-83-ITH-000001")
        self.assertEqual(second, "SO-2082-83-ITH-000002")

    def test_sequences_are_isolated_per_prefix(self):
        so_number = generate_document_number("SO", fiscal_year=self.fiscal_year, branch=self.branch)
        po_number = generate_document_number("PO", fiscal_year=self.fiscal_year, branch=self.branch)

        self.assertTrue(so_number.startswith("SO-"))
        self.assertTrue(po_number.startswith("PO-"))
        self.assertIn("000001", so_number)
        self.assertIn("000001", po_number)
