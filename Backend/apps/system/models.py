"""
System-wide configuration: numbering series config, feature flags and
key/value settings that must be data (editable by authorised users) rather
than a code change, per the proposal's "configuration over customisation"
principle.
"""

from django.db import models

from apps.core.models import BaseModel


class SystemSetting(BaseModel):
    key = models.SlugField(max_length=100, unique=True)
    value = models.JSONField()
    description = models.CharField(max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ["key"]

    def __str__(self):
        return self.key


class FeatureFlag(BaseModel):
    key = models.SlugField(max_length=100, unique=True)
    is_enabled = models.BooleanField(default=False)
    description = models.CharField(max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ["key"]

    def __str__(self):
        return f"{self.key} ({'on' if self.is_enabled else 'off'})"


class NumberingSeriesConfig(BaseModel):
    """Declares which prefix/padding a document type should use; consumed by apps.core.services.numbering."""

    document_type = models.SlugField(max_length=60, unique=True)  # e.g. "sales_order"
    prefix = models.CharField(max_length=10)  # e.g. "SO"
    padding = models.PositiveSmallIntegerField(default=6)
    is_branch_aware = models.BooleanField(default=True)
    is_fiscal_year_aware = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        ordering = ["document_type"]

    def __str__(self):
        return f"{self.document_type} -> {self.prefix}"
