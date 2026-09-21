"""Abstract transactional record matching the frontend ErpRecord shape."""

from django.db import models

from apps.core.models import BaseModel


class DomainRecord(BaseModel):
    """
    One row per ERP document/master in a domain app.

    Field names match eco-craft-flow ErpRecord so the React screens can swap
    mock data for this serializer without renaming props.
    """

    entity = models.CharField(max_length=64, db_index=True)
    code = models.CharField(max_length=40)
    title = models.CharField(max_length=255, blank=True)
    date = models.DateField()
    status = models.CharField(max_length=32, default="draft", db_index=True)
    fields = models.JSONField(default=dict, blank=True)
    lines = models.JSONField(default=list, blank=True)
    history = models.JSONField(default=list, blank=True)
    links = models.JSONField(default=list, blank=True)

    class Meta(BaseModel.Meta):
        abstract = True
        constraints = [
            models.UniqueConstraint(fields=["entity", "code"], name="%(app_label)s_record_entity_code"),
        ]
        indexes = [
            models.Index(fields=["entity", "status"]),
            models.Index(fields=["entity", "date"]),
        ]
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.entity}:{self.code}"
