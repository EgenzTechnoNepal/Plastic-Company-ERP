"""Phase 1 — Proforma Invoice + Letter of Credit APIs."""

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.integrations.gemini import gemini_configured, gemini_model
from apps.organization.company_scope import CompanyScopedMixin, assert_company_allowed, company_pk
from apps.procurement.commercial import PurchaseOrder
from apps.procurement.gemini_lc import ai_extract_and_attach_draft_lc, ai_suggest_pre_dispatch
from apps.procurement.lc_services import (
    attach_draft_lc_scan,
    create_letter_of_credit,
    create_proforma_invoice,
    issue_final_lc,
    lc_allows_gate_entry,
    mark_manufacturing,
    record_seller_draft_ok,
    run_draft_lc_match,
    start_pre_dispatch_review,
    verify_pre_dispatch_packet,
)
from apps.procurement.trade_finance import LetterOfCredit, ProformaInvoice

class ProformaInvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProformaInvoice
        fields = [
            "id",
            "company",
            "document_number",
            "purchase_order",
            "supplier",
            "status",
            "seller_pi_number",
            "currency_code",
            "total_amount",
            "payment_terms",
            "lead_time_days",
            "expected_delivery_date",
            "notes",
            "attachment_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "document_number", "created_at", "updated_at"]


class LetterOfCreditSerializer(serializers.ModelSerializer):
    gate_allowed = serializers.SerializerMethodField()
    gate_message = serializers.SerializerMethodField()

    class Meta:
        model = LetterOfCredit
        fields = [
            "id",
            "company",
            "document_number",
            "purchase_order",
            "proforma_invoice",
            "supplier",
            "status",
            "bank_name",
            "lc_number",
            "currency_code",
            "amount",
            "expiry_date",
            "latest_shipment_date",
            "notes",
            "draft_scan_url",
            "draft_extracted",
            "match_result",
            "seller_approved_at",
            "seller_approval_note",
            "final_issued_at",
            "final_lc_number",
            "document_checklist",
            "pre_dispatch_message",
            "gate_allowed",
            "gate_message",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "document_number",
            "status",
            "match_result",
            "seller_approved_at",
            "final_issued_at",
            "pre_dispatch_message",
            "gate_allowed",
            "gate_message",
            "created_at",
            "updated_at",
        ]

    def get_gate_allowed(self, obj):
        ok, _ = lc_allows_gate_entry(obj)
        return ok

    def get_gate_message(self, obj):
        _, msg = lc_allows_gate_entry(obj)
        return msg


class ProformaInvoiceViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "purchase"
    company_field = "company"
    queryset = ProformaInvoice.objects.select_related("purchase_order", "supplier").all()
    serializer_class = ProformaInvoiceSerializer
    filterset_fields = ["company", "supplier", "purchase_order", "status"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        assert_company_allowed(request.user, company_pk(data["company"]))
        po = data.pop("purchase_order")
        if not isinstance(po, PurchaseOrder):
            po = PurchaseOrder.objects.get(pk=po)
        pi = create_proforma_invoice(
            company=data.pop("company"),
            purchase_order=po,
            user=request.user,
            **data,
        )
        out = envelope(ProformaInvoiceSerializer(pi).data)
        out.status_code = status.HTTP_201_CREATED
        return out


class LetterOfCreditViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "purchase"
    company_field = "company"
    queryset = LetterOfCredit.objects.select_related(
        "purchase_order", "proforma_invoice", "supplier"
    ).all()
    serializer_class = LetterOfCreditSerializer
    filterset_fields = ["company", "supplier", "purchase_order", "status"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        assert_company_allowed(request.user, company_pk(data["company"]))
        po = data.pop("purchase_order")
        if not isinstance(po, PurchaseOrder):
            po = PurchaseOrder.objects.get(pk=po)
        pi = data.pop("proforma_invoice", None)
        lc = create_letter_of_credit(
            company=data.pop("company"),
            purchase_order=po,
            proforma_invoice=pi,
            user=request.user,
            **data,
        )
        out = envelope(LetterOfCreditSerializer(lc).data)
        out.status_code = status.HTTP_201_CREATED
        return out

    @action(
        detail=True,
        methods=["post"],
        url_path="ai-scan-draft",
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def ai_scan_draft(self, request, pk=None):
        """Upload Draft LC image/PDF → Gemini extract → attach (human still runs match)."""
        lc = self.get_object()
        uploaded = request.FILES.get("file") or request.FILES.get("scan") or request.FILES.get("image")
        lc = ai_extract_and_attach_draft_lc(lc=lc, uploaded=uploaded, user=request.user)
        return envelope(LetterOfCreditSerializer(lc).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="ai-suggest-pre-dispatch",
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def ai_suggest_pre_dispatch(self, request, pk=None):
        """Upload doc photos → Gemini suggests present_keys (does NOT clear gate; human verifies)."""
        self.get_object()  # auth + company scope
        uploads = list(request.FILES.getlist("files") or [])
        if not uploads:
            single = request.FILES.get("file") or request.FILES.get("scan")
            if single:
                uploads = [single]
        suggestion = ai_suggest_pre_dispatch(uploads=uploads)
        return envelope(
            {
                **suggestion,
                "gemini_configured": gemini_configured(),
                "gemini_model": gemini_model() if gemini_configured() else None,
            }
        )

    @action(detail=True, methods=["post"], url_path="scan-draft")
    def scan_draft(self, request, pk=None):
        lc = self.get_object()
        lc = attach_draft_lc_scan(
            lc,
            extracted=request.data.get("extracted") or request.data.get("draft_extracted") or {},
            draft_scan_url=request.data.get("draft_scan_url") or request.data.get("scan_url") or "",
            user=request.user,
        )
        return envelope(LetterOfCreditSerializer(lc).data)

    @action(detail=True, methods=["post"], url_path="run-match")
    def run_match(self, request, pk=None):
        lc = self.get_object()
        lc = run_draft_lc_match(lc, user=request.user)
        return envelope(LetterOfCreditSerializer(lc).data)

    @action(detail=True, methods=["post"], url_path="seller-ok")
    def seller_ok(self, request, pk=None):
        lc = self.get_object()
        lc = record_seller_draft_ok(
            lc,
            note=request.data.get("note") or "",
            user=request.user,
        )
        return envelope(LetterOfCreditSerializer(lc).data)

    @action(detail=True, methods=["post"], url_path="issue-final")
    def issue_final(self, request, pk=None):
        lc = self.get_object()
        lc = issue_final_lc(
            lc,
            final_lc_number=request.data.get("final_lc_number") or request.data.get("lc_number") or "",
            user=request.user,
        )
        return envelope(LetterOfCreditSerializer(lc).data)

    @action(detail=True, methods=["post"], url_path="mark-manufacturing")
    def manufacturing(self, request, pk=None):
        lc = self.get_object()
        lc = mark_manufacturing(lc, user=request.user)
        return envelope(LetterOfCreditSerializer(lc).data)

    @action(detail=True, methods=["post"], url_path="start-pre-dispatch")
    def start_pre_dispatch(self, request, pk=None):
        lc = self.get_object()
        lc = start_pre_dispatch_review(lc, user=request.user)
        return envelope(LetterOfCreditSerializer(lc).data)

    @action(detail=True, methods=["post"], url_path="verify-pre-dispatch")
    def verify_pre_dispatch(self, request, pk=None):
        lc = self.get_object()
        keys = request.data.get("present_keys") or request.data.get("keys") or []
        lc = verify_pre_dispatch_packet(lc, present_keys=list(keys), user=request.user)
        return envelope(LetterOfCreditSerializer(lc).data)
