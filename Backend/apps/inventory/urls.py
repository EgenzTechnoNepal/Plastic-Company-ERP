from rest_framework.routers import DefaultRouter

from apps.inventory import views

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

# Phase 1 typed masters (DomainRecord routes above remain for frontend compatibility)
router.register("uoms", views.UnitOfMeasureViewSet, basename="uom")
router.register("uom-conversions", views.UomConversionViewSet, basename="uom-conversion")
router.register("items", views.ItemViewSet, basename="item")
router.register("item-uoms", views.ItemUomViewSet, basename="item-uom")
router.register("supplier-item-prices", views.SupplierItemPriceViewSet, basename="supplier-item-price")
router.register("lots", views.InventoryLotViewSet, basename="inventory-lot")
router.register("receipt-layers", views.InventoryReceiptLayerViewSet, basename="receipt-layer")
router.register("landed-cost-documents", views.LandedCostDocumentViewSet, basename="landed-cost-document")
router.register("landed-cost-components", views.LandedCostComponentViewSet, basename="landed-cost-component")
router.register("landed-cost-allocations", views.LandedCostAllocationViewSet, basename="landed-cost-allocation")

urlpatterns = router.urls
