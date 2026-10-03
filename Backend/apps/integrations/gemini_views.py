"""Gemini status + generic extract endpoints (ready for Gate bill / Phase 3+)."""

from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.integrations.gemini import (
    extract_gate_bill,
    gemini_configured,
    gemini_model,
)
from apps.procurement.lc_services import TradeFinanceError


class GeminiStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        configured = gemini_configured()
        return envelope(
            {
                "configured": configured,
                "provider": "google_gemini",
                "model": gemini_model() if configured else None,
                "ready_for": ["lc_draft_scan", "pre_dispatch_suggest", "gate_bill_extract"],
            }
        )


class GeminiExtractGateBillView(APIView):
    """Upload supplier bill → Gemini JSON (human confirms before Gate/bill save)."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    module_code = "purchase"
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        uploaded = request.FILES.get("file") or request.FILES.get("scan") or request.FILES.get("image")
        if not uploaded:
            raise TradeFinanceError("Upload a bill image or PDF.", code="MISSING_FILE")
        data = uploaded.read()
        if not data:
            raise TradeFinanceError("Uploaded file is empty.", code="EMPTY_FILE")
        extracted = extract_gate_bill(
            file_bytes=data,
            filename=getattr(uploaded, "name", "") or "bill.jpg",
            content_type=getattr(uploaded, "content_type", None),
        )
        return envelope({"extracted": extracted, "provider": "google_gemini", "model": gemini_model()})
