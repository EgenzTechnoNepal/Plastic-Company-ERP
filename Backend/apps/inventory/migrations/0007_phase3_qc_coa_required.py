# Generated manually for Phase 3 QC plant gate

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0006_phase2_hardening_integrity"),
    ]

    operations = [
        migrations.AddField(
            model_name="item",
            name="coa_required",
            field=models.BooleanField(
                default=False,
                help_text="When True and REQUIRE_COA_BEFORE_QC_PASS, Pass needs CoA reference/attachment.",
            ),
        ),
    ]
