"""Inbound journey API: PO → Gate (LC gate) → GRN (QC_HOLD) → QC → Landed cost → Putaway, server-enforced."""

from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.models import Action, Module, Role, RolePermission, User, UserRole
from apps.inventory.ledger import StockLedgerEntry, StockTxnType
from apps.inventory.models import InventoryLot, InventoryReceiptLayer, LotStatus
from apps.organization.models import Branch, Company
from apps.procurement.commercial import PurchaseOrder, PurchaseOrderStatus
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptNote
from apps.quality.qc import QCInspection, QCInspectionStatus
from apps.system.management.commands import seed_m2_demo_chain as seed
from apps.warehouse.models import BinType

API = "/api/v1"
LANDED_COMPONENTS = [
    {"category": "INTERNATIONAL_FREIGHT", "amount": "12000"},
    {"category": "INSURANCE", "amount": "3000"},
    {"category": "CUSTOMS_DUTY", "amount": "8000"},
    {"category": "CLEARING", "amount": "2000"},
    {"category": "NEPAL_TRANSPORT", "amount": "3000"},
]


class InboundJourneyAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        seed.run(interactive=True)
        cls.admin = User.objects.get(email="admin@ecowrap.com")
        cls.live_po = PurchaseOrder.objects.get(document_number=seed.LIVE_PO_DOC)
        cls.blocked_po = PurchaseOrder.objects.get(document_number=seed.BLOCKED_PO_DOC)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def _journey(self, po):
        response = self.client.get(f"{API}/purchase/purchase-orders/{po.id}/inbound-journey/")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["data"]

    def _record_gate(self, po):
        return self.client.post(
            f"{API}/purchase/inbound-gates/record/",
            {"purchase_order": str(po.id), "vehicle_number": "Ko 2 Kha 1357", "driver_name": "Shyam"},
            format="json",
        )

    def _receive(self, gate_id, po, qty="100"):
        line = po.lines.get()
        return self.client.post(
            f"{API}/purchase/inbound-gates/{gate_id}/receive/",
            {"lines": [{"purchase_order_line": str(line.id), "accepted_quantity": qty}]},
            format="json",
        )

    def _gate_and_grn(self, po):
        gate = self._record_gate(po)
        self.assertEqual(gate.status_code, 201, gate.content)
        grn = self._receive(gate.json()["data"]["id"], po)
        self.assertEqual(grn.status_code, 201, grn.content)
        return grn.json()["data"]

    def test_journey_read_model_shows_names_terms_and_rules_based_lc(self):
        data = self._journey(self.live_po)
        po = data["purchase_order"]
        self.assertEqual(po["supplier"]["code"], seed.SUP_CN)
        self.assertEqual(po["currency"], "NPR")
        self.assertEqual(po["payment_terms"], "LC 30 Days")
        self.assertEqual(po["incoterm"], "FOB")
        self.assertEqual(po["lines"][0]["item_sku"], seed.SKU_PLA)
        self.assertEqual(po["lines"][0]["uom"], "KG")
        self.assertEqual(po["total"], "100000.00")
        self.assertEqual(data["letter_of_credit"]["status"], "DOCS_CLEARED")
        self.assertEqual(data["letter_of_credit"]["match"]["engine_kind"], "rules")
        self.assertNotIn("AI", data["letter_of_credit"]["status_label"])
        self.assertTrue(data["letter_of_credit"]["checklist"])
        self.assertTrue(data["actions"]["can_record_gate"])
        self.assertEqual(data["gates"], [])
        self.assertEqual(data["lots"], [])

    def test_full_inbound_journey_receiving_is_not_available(self):
        grn = self._gate_and_grn(self.live_po)
        self.assertEqual(grn["status"], "POSTED")

        gate = GateEntry.objects.get(purchase_order=self.live_po)
        self.assertEqual(gate.status, GateEntryStatus.LINKED_TO_GRN)
        lot = InventoryLot.objects.get(source_grn_id=grn["id"])
        self.assertEqual(lot.status, LotStatus.QC_HOLD)
        self.assertEqual(lot.bin.bin_type, BinType.QC_HOLD)
        self.assertEqual(lot.warehouse.code, seed.WH_CODE)
        self.assertTrue(InventoryReceiptLayer.objects.filter(lot=lot).exists())
        self.assertTrue(
            StockLedgerEntry.objects.filter(lot=lot, txn_type=StockTxnType.GRN_RECEIPT, quantity_in=Decimal("100")).exists()
        )
        self.live_po.refresh_from_db()
        self.assertEqual(self.live_po.status, PurchaseOrderStatus.RECEIVED)

        journey = self._journey(self.live_po)
        lot_view = journey["lots"][0]
        inspection_id = lot_view["actions"]["qc_inspection_id"]
        self.assertTrue(inspection_id)
        self.assertFalse(lot_view["actions"]["can_putaway"], "QC_HOLD stock cannot be put away")
        self.assertFalse(journey["actions"]["can_record_gate"], "fully received PO cannot take another gate")

        # Putaway is refused server-side while QC holds the lot, whatever the UI sends.
        rm_bin = next(b for b in journey["putaway_bins"] if b["code"] == seed.BIN_RM)
        blocked = self.client.post(
            f"{API}/warehouse/putaways/for-lot/", {"lot": str(lot.id), "to_bin": rm_bin["id"]}, format="json"
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.json()["error"]["code"], "QC_REQUIRED")

        passed = self.client.post(
            f"{API}/quality/lot-inspections/{inspection_id}/pass/", {"coa_reference": "COA-LIVE-1"}, format="json"
        )
        self.assertEqual(passed.status_code, 200, passed.content)
        lot.refresh_from_db()
        self.assertEqual(lot.status, LotStatus.AVAILABLE)

        landed = self.client.post(
            f"{API}/inventory/lots/{lot.id}/landed-cost/", {"components": LANDED_COMPONENTS}, format="json"
        )
        self.assertEqual(landed.status_code, 200, landed.content)
        self.assertEqual(Decimal(landed.json()["data"]["landed_total"]), Decimal("128000"))
        lot.refresh_from_db()
        self.assertEqual(lot.purchase_unit_cost, Decimal("1000"))
        self.assertEqual(lot.landed_unit_cost, Decimal("1280"))
        self.assertTrue(
            StockLedgerEntry.objects.filter(lot=lot, txn_type=StockTxnType.LANDED_COST_REVALUE).exists()
        )
        again = self.client.post(
            f"{API}/inventory/lots/{lot.id}/landed-cost/", {"components": LANDED_COMPONENTS}, format="json"
        )
        self.assertEqual(again.status_code, 400)

        put = self.client.post(
            f"{API}/warehouse/putaways/for-lot/", {"lot": str(lot.id), "to_bin": rm_bin["id"]}, format="json"
        )
        self.assertEqual(put.status_code, 200, put.content)
        lot.refresh_from_db()
        self.assertEqual(lot.bin.code, seed.BIN_RM)

        final = self._journey(self.live_po)["lots"][0]
        self.assertEqual(final["status"], "AVAILABLE")
        self.assertEqual(final["landed_costs"][0]["landed_total"], "128000.00")
        self.assertEqual(final["landed_costs"][0]["purchase_value"], "100000.00")
        txn_types = [e["txn_type"] for e in final["ledger"]]
        self.assertIn(StockTxnType.GRN_RECEIPT, txn_types)
        self.assertIn(StockTxnType.LANDED_COST_REVALUE, txn_types)
        self.assertFalse(final["actions"]["can_putaway"])

    def test_lc_gate_blocks_gate_entry_without_side_effects(self):
        data = self._journey(self.blocked_po)
        self.assertFalse(data["actions"]["can_record_gate"])
        self.assertTrue(data["actions"]["gate_blocked_by_lc"])
        self.assertTrue(data["actions"]["gate_blocked_reason"])

        gates_before = GateEntry.objects.count()
        response = self._record_gate(self.blocked_po)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "LC_GATE_BLOCKED")
        self.assertEqual(GateEntry.objects.count(), gates_before, "blocked gate must roll back")

    def test_qc_fail_quarantines_or_rejects_and_blocks_landed_and_putaway(self):
        for disposition, lot_status, bin_type in (
            ("QUARANTINED", LotStatus.QUARANTINED, BinType.QUARANTINE),
            ("REJECTED", LotStatus.REJECTED, BinType.REJECTED),
        ):
            with self.subTest(disposition=disposition):
                po = seed._ensure_open_po(
                    document_number=f"PO-QC-{disposition}",
                    notes="qc fail test",
                    company=self.live_po.company,
                    supplier=self.live_po.supplier,
                    item=self.live_po.lines.get().item,
                    uom=self.live_po.lines.get().uom,
                    warehouse=self.live_po.destination_warehouse,
                    incoterm=self.live_po.incoterm,
                    currency=self.live_po.currency,
                    user=self.admin,
                )
                grn = self._gate_and_grn(po)
                lot = InventoryLot.objects.get(source_grn_id=grn["id"])
                inspection = QCInspection.objects.get(lot=lot, status=QCInspectionStatus.DRAFT)

                failed = self.client.post(
                    f"{API}/quality/lot-inspections/{inspection.id}/fail/",
                    {"disposition": disposition},
                    format="json",
                )
                self.assertEqual(failed.status_code, 200, failed.content)
                lot.refresh_from_db()
                self.assertEqual(lot.status, lot_status)
                self.assertEqual(lot.bin.bin_type, bin_type)

                landed = self.client.post(
                    f"{API}/inventory/lots/{lot.id}/landed-cost/", {"components": LANDED_COMPONENTS}, format="json"
                )
                self.assertEqual(landed.status_code, 400)
                lot_view = self._journey(po)["lots"][0]
                self.assertFalse(lot_view["actions"]["can_landed_cost"])
                self.assertFalse(lot_view["actions"]["can_putaway"])
                self.assertIsNone(lot_view["actions"]["qc_inspection_id"])

    def test_receive_rejects_foreign_po_line_and_bad_quantity(self):
        gate = self._record_gate(self.live_po)
        gate_id = gate.json()["data"]["id"]
        foreign_line = PurchaseOrder.objects.get(document_number=seed.PO_DOC).lines.get()
        foreign = self.client.post(
            f"{API}/purchase/inbound-gates/{gate_id}/receive/",
            {"lines": [{"purchase_order_line": str(foreign_line.id), "accepted_quantity": "10"}]},
            format="json",
        )
        self.assertEqual(foreign.status_code, 400)
        zero = self._receive(gate_id, self.live_po, qty="0")
        self.assertEqual(zero.status_code, 400)
        self.assertFalse(GoodsReceiptNote.objects.filter(gate_entry_id=gate_id).exists())

    def test_viewer_cannot_record_gate(self):
        viewer = User.objects.create_user(email="viewer-inbound@ecowrap.com", password="Str0ng!Passw0rd")
        UserRole.objects.create(user=viewer, role=Role.objects.get(code="viewer"), branch=None)
        self.client.force_authenticate(viewer)
        self.assertEqual(self._record_gate(self.live_po).status_code, 403)
        self.assertEqual(
            self.client.get(f"{API}/purchase/purchase-orders/{self.live_po.id}/inbound-journey/").status_code, 200
        )

    def test_other_company_user_cannot_see_or_act_on_journey(self):
        other = Company.objects.create(name="Other Plastics", legal_name="Other Plastics Ltd")
        branch = Branch.objects.create(company=other, code="OTH", name="Other Branch")
        role = Role.objects.create(code="other_ops", name="Other Ops")
        for code in ("purchase", "procurement", "inventory", "warehouse", "quality"):
            module, _ = Module.objects.get_or_create(code=code, defaults={"name": code.title()})
            for action in (Action.VIEW, Action.CREATE, Action.EDIT):
                RolePermission.objects.create(role=role, module=module, action=action, is_allowed=True)
        outsider = User.objects.create_user(email="outsider@other.example", password="Str0ng!Passw0rd")
        UserRole.objects.create(user=outsider, role=role, branch=branch)
        self.client.force_authenticate(outsider)

        journey = self.client.get(f"{API}/purchase/purchase-orders/{self.live_po.id}/inbound-journey/")
        self.assertEqual(journey.status_code, 404)
        self.assertEqual(self._record_gate(self.live_po).status_code, 404)
        lot = InventoryLot.objects.get(lot_number=seed.LOT_DOC)
        landed = self.client.post(
            f"{API}/inventory/lots/{lot.id}/landed-cost/", {"components": LANDED_COMPONENTS}, format="json"
        )
        self.assertEqual(landed.status_code, 404)
        self.assertFalse(GateEntry.objects.filter(purchase_order=self.live_po).exists())
