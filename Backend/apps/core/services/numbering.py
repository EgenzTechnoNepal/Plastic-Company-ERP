"""
Transaction-safe, fiscal-year- and branch-aware document numbering.

Always call generate_document_number() inside the same transaction.atomic()
block as the document create/save so a numbering failure rolls the whole
operation back rather than leaving a gap or a duplicate.
"""

from django.db import transaction

from apps.core.models import DocumentNumberSequence


def generate_document_number(prefix: str, *, fiscal_year=None, branch=None) -> str:
    with transaction.atomic():
        sequence, _ = DocumentNumberSequence.objects.select_for_update().get_or_create(
            prefix=prefix,
            fiscal_year=fiscal_year,
            branch=branch,
            defaults={"last_number": 0},
        )
        sequence.last_number += 1
        sequence.save(update_fields=["last_number"])

        year_segment = fiscal_year.code if fiscal_year else "0000"
        branch_segment = f"-{branch.code}" if branch else ""
        return f"{prefix}-{year_segment}{branch_segment}-{str(sequence.last_number).zfill(sequence.padding)}"
