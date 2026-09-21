from django.db import models

from apps.core.dates import gregorian_to_bs
from apps.core.models import BaseModel


class Company(BaseModel):
    name = models.CharField(max_length=200)
    legal_name = models.CharField(max_length=255)
    pan_vat_number = models.CharField(max_length=30, blank=True)
    address = models.CharField(max_length=255, blank=True)
    base_currency = models.CharField(max_length=3, default="NPR")
    logo = models.ImageField(upload_to="company/logos/", null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name_plural = "Companies"

    def __str__(self):
        return self.name


class Branch(BaseModel):
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="branches")
    code = models.CharField(max_length=10)
    name = models.CharField(max_length=150)
    address = models.CharField(max_length=255, blank=True)
    is_head_office = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        constraints = [models.UniqueConstraint(fields=["company", "code"], name="uq_branch_company_code")]

    def __str__(self):
        return f"{self.code} — {self.name}"


class Department(BaseModel):
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="departments")
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=150)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")

    class Meta(BaseModel.Meta):
        constraints = [models.UniqueConstraint(fields=["company", "code"], name="uq_department_company_code")]

    def __str__(self):
        return self.name


class CostCentre(BaseModel):
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="cost_centres")
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=150)

    class Meta(BaseModel.Meta):
        constraints = [models.UniqueConstraint(fields=["company", "code"], name="uq_costcentre_company_code")]

    def __str__(self):
        return self.name


class ProfitCentre(BaseModel):
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="profit_centres")
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=150)

    class Meta(BaseModel.Meta):
        constraints = [models.UniqueConstraint(fields=["company", "code"], name="uq_profitcentre_company_code")]

    def __str__(self):
        return self.name


class Project(BaseModel):
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="projects")
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=150)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [models.UniqueConstraint(fields=["company", "code"], name="uq_project_company_code")]

    def __str__(self):
        return self.name


class FiscalYearStatus(models.TextChoices):
    OPEN = "open", "Open"
    CLOSED = "closed", "Closed"
    LOCKED = "locked", "Locked"


class FiscalYear(BaseModel):
    """Nepali fiscal year runs Shrawan -> Ashadh; `code` is the BS label e.g. '2082-83'."""

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="fiscal_years")
    code = models.CharField(max_length=10)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=10, choices=FiscalYearStatus.choices, default=FiscalYearStatus.OPEN)

    class Meta(BaseModel.Meta):
        constraints = [models.UniqueConstraint(fields=["company", "code"], name="uq_fiscalyear_company_code")]
        ordering = ["-start_date"]

    def __str__(self):
        return self.code

    @property
    def start_date_bs(self) -> str:
        return gregorian_to_bs(self.start_date)

    @property
    def end_date_bs(self) -> str:
        return gregorian_to_bs(self.end_date)


class FiscalPeriod(BaseModel):
    fiscal_year = models.ForeignKey(FiscalYear, on_delete=models.CASCADE, related_name="periods")
    code = models.CharField(max_length=20)  # e.g. "Shrawan"
    month_number = models.PositiveSmallIntegerField()  # 1-12, BS month order starting Shrawan
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=10, choices=FiscalYearStatus.choices, default=FiscalYearStatus.OPEN)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["fiscal_year", "month_number"], name="uq_fiscalperiod_year_month")
        ]
        ordering = ["fiscal_year", "month_number"]

    def __str__(self):
        return f"{self.fiscal_year.code} — {self.code}"


class ExchangeRate(BaseModel):
    currency_code = models.CharField(max_length=3)
    rate_to_base = models.DecimalField(max_digits=14, decimal_places=6)
    as_of_date = models.DateField()

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["currency_code", "as_of_date"], name="uq_exchangerate_currency_date")
        ]
        ordering = ["-as_of_date"]

    def __str__(self):
        return f"{self.currency_code} @ {self.as_of_date} = {self.rate_to_base}"
