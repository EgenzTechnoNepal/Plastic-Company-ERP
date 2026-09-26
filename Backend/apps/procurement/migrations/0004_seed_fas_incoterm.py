"""Seed FAS Incoterm for Phase 2."""

from django.db import migrations


def seed_fas(apps, schema_editor):
    Incoterm = apps.get_model("procurement", "Incoterm")
    Incoterm.objects.get_or_create(
        code="FAS",
        defaults={
            "version": "2020",
            "name": "Free Alongside Ship",
            "description": "Seller delivers alongside vessel at named port.",
            "is_active": True,
        },
    )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("procurement", "0003_phase2_inbound_engine"),
    ]

    operations = [
        migrations.RunPython(seed_fas, noop),
    ]
