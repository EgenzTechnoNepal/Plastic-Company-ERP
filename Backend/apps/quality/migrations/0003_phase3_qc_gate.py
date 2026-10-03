# Generated manually for Phase 3 QC plant gate

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("quality", "0002_phase2_inbound_engine"),
    ]

    operations = [
        migrations.AddField(
            model_name="qcinspection",
            name="coa_reference",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="qcinspection",
            name="coa_attachment_url",
            field=models.URLField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name="qcinspection",
            name="metrics",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="qcinspection",
            name="ncr_reference",
            field=models.CharField(blank=True, max_length=80),
        ),
    ]
