from rest_framework import serializers

from apps.warehouse.models import Bin, Rack, Warehouse, Zone


class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = [
            "id",
            "company",
            "branch",
            "code",
            "name",
            "address",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by", "updated_by"]


class ZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Zone
        fields = [
            "id",
            "warehouse",
            "code",
            "name",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class RackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rack
        fields = [
            "id",
            "zone",
            "code",
            "name",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class BinSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bin
        fields = [
            "id",
            "warehouse",
            "zone",
            "rack",
            "code",
            "name",
            "bin_type",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by", "updated_by"]
