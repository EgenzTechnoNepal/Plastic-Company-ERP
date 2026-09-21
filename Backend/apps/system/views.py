from rest_framework import viewsets

from apps.accounts.permissions import HasModulePermission
from apps.system.models import FeatureFlag, NumberingSeriesConfig, SystemSetting
from apps.system.serializers import (
    FeatureFlagSerializer,
    NumberingSeriesConfigSerializer,
    SystemSettingSerializer,
)


class SystemModuleViewSet(viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "system"


class SystemSettingViewSet(SystemModuleViewSet):
    queryset = SystemSetting.objects.all()
    serializer_class = SystemSettingSerializer
    search_fields = ["key", "description"]


class FeatureFlagViewSet(SystemModuleViewSet):
    queryset = FeatureFlag.objects.all()
    serializer_class = FeatureFlagSerializer
    search_fields = ["key", "description"]


class NumberingSeriesConfigViewSet(SystemModuleViewSet):
    queryset = NumberingSeriesConfig.objects.all()
    serializer_class = NumberingSeriesConfigSerializer
    search_fields = ["document_type", "prefix"]
