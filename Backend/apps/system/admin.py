from django.contrib import admin

from apps.system.models import FeatureFlag, NumberingSeriesConfig, SystemSetting

admin.site.register(SystemSetting)
admin.site.register(FeatureFlag)
admin.site.register(NumberingSeriesConfig)
