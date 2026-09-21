"""
Bikram Sambat (BS) date support.

Gregorian DateTime remains the canonical technical value stored in the
database (see apps.core.models.BaseModel/DocumentModel). This module only
computes a BS *representation* for display/reporting — it is never used as
a storage or query type.
"""

from datetime import date

import nepali_datetime


def gregorian_to_bs(value: date) -> str:
    """Return the BS calendar representation of a Gregorian date as 'YYYY-MM-DD'."""
    bs_date = nepali_datetime.date.from_datetime_date(value)
    return f"{bs_date.year:04d}-{bs_date.month:02d}-{bs_date.day:02d}"


def bs_to_gregorian(bs_year: int, bs_month: int, bs_day: int) -> date:
    bs_date = nepali_datetime.date(bs_year, bs_month, bs_day)
    return bs_date.to_datetime_date()


def fiscal_year_bounds_for_bs_year(bs_year: int) -> tuple[date, date]:
    """
    Nepali fiscal year runs Shrawan 1 -> Ashadh end (BS months 4 through 3 of
    the following BS year). Returns the Gregorian (start, end) bounds.
    """
    start = bs_to_gregorian(bs_year, 4, 1)
    next_year_ashadh_end_day = 32
    end = None
    for day in range(28, 0, -1):
        try:
            end = bs_to_gregorian(bs_year + 1, 3, day)
            break
        except ValueError:
            continue
    if end is None:
        raise ValueError(f"Could not resolve Ashadh-end for BS year {bs_year + 1}")
    return start, end
