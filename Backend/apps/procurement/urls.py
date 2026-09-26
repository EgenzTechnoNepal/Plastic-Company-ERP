from rest_framework.routers import DefaultRouter

from apps.procurement import views

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

router.register("vendors", views.VendorViewSet, basename="vendor")
router.register("incoterms", views.IncotermViewSet, basename="incoterm")
router.register("supplier-documents", views.SupplierDocumentViewSet, basename="supplier-document")

from apps.procurement import phase2_views, phase3_views

router.register("import-shipments", phase2_views.ImportShipmentViewSet, basename="import-shipment")
router.register("inbound-gates", phase2_views.GateEntryViewSet, basename="inbound-gate")
router.register("goods-receipts", phase2_views.GoodsReceiptViewSet, basename="goods-receipt")
router.register("goods-receipt-lines", phase2_views.GoodsReceiptLineViewSet, basename="goods-receipt-line")
router.register("purchase-orders", phase3_views.PurchaseOrderViewSet, basename="purchase-order-typed")
router.register("supplier-bills", phase3_views.SupplierBillViewSet, basename="supplier-bill-typed")

urlpatterns = router.urls
