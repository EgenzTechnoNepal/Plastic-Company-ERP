from rest_framework import serializers

from apps.system.models import FeatureFlag, NumberingSeriesConfig, SystemSetting


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = ["id", "key", "value", "description"]


class FeatureFlagSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeatureFlag
        fields = ["id", "key", "is_enabled", "description"]


class NumberingSeriesConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = NumberingSeriesConfig
        fields = ["id", "document_type", "prefix", "padding", "is_branch_aware", "is_fiscal_year_aware"]
