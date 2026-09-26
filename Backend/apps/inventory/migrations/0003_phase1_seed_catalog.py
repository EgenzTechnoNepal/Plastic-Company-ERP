"""Seed Phase 1 catalog data: currencies, UOMs, conversions, Incoterms 2020."""

from decimal import Decimal

from django.db import migrations


def seed_phase1_catalog(apps, schema_editor):
    Currency = apps.get_model("organization", "Currency")
    UnitOfMeasure = apps.get_model("inventory", "UnitOfMeasure")
    UomConversion = apps.get_model("inventory", "UomConversion")
    Incoterm = apps.get_model("procurement", "Incoterm")

    currencies = [
        ("NPR", "Nepalese Rupee", "Rs", 2),
        ("USD", "US Dollar", "$", 2),
        ("CNY", "Chinese Yuan", "¥", 2),
        ("EUR", "Euro", "€", 2),
        ("INR", "Indian Rupee", "₹", 2),
    ]
    for code, name, symbol, decimals in currencies:
        Currency.objects.get_or_create(
            code=code,
            defaults={"name": name, "symbol": symbol, "decimal_places": decimals, "is_active": True},
        )

    uom_defs = [
        ("KG", "Kilogram", "kg", True),
        ("G", "Gram", "g", False),
        ("TON", "Metric Ton", "t", False),
        ("PCS", "Pieces", "pcs", False),
        ("M", "Meter", "m", False),
        ("L", "Litre", "L", False),
    ]
    uoms = {}
    for code, name, symbol, is_base_weight in uom_defs:
        obj, _ = UnitOfMeasure.objects.get_or_create(
            code=code,
            defaults={
                "name": name,
                "symbol": symbol,
                "is_base_weight": is_base_weight,
                "is_active": True,
            },
        )
        uoms[code] = obj

    conversions = [
        ("KG", "G", Decimal("1000")),
        ("TON", "KG", Decimal("1000")),
        ("G", "KG", Decimal("0.001")),
        ("KG", "TON", Decimal("0.001")),
    ]
    for from_code, to_code, factor in conversions:
        UomConversion.objects.get_or_create(
            from_uom=uoms[from_code],
            to_uom=uoms[to_code],
            defaults={"factor": factor, "is_active": True},
        )

    incoterms = [
        ("EXW", "Ex Works", "Seller makes goods available at premises."),
        ("FCA", "Free Carrier", "Seller delivers to carrier nominated by buyer."),
        ("FOB", "Free On Board", "Seller delivers on board vessel at named port."),
        ("CFR", "Cost and Freight", "Seller pays freight to named port."),
        ("CIF", "Cost, Insurance and Freight", "Seller pays freight and insurance."),
        ("CIP", "Carriage and Insurance Paid To", "Seller pays carriage and insurance."),
        ("CPT", "Carriage Paid To", "Seller pays carriage to named place."),
        ("DAP", "Delivered At Place", "Seller delivers ready for unloading at place."),
        ("DPU", "Delivered at Place Unloaded", "Seller delivers unloaded at place."),
        ("DDP", "Delivered Duty Paid", "Seller delivers cleared for import, duty paid."),
    ]
    for code, name, description in incoterms:
        Incoterm.objects.get_or_create(
            code=code,
            defaults={
                "version": "2020",
                "name": name,
                "description": description,
                "is_active": True,
            },
        )


def unseed_phase1_catalog(apps, schema_editor):
    # Do not delete — masters may already be referenced. No-op reverse.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("organization", "0002_phase1_masters"),
        ("inventory", "0002_phase1_masters"),
        ("procurement", "0002_phase1_masters"),
    ]

    operations = [
        migrations.RunPython(seed_phase1_catalog, unseed_phase1_catalog),
    ]
