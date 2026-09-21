from collections import defaultdict

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.accounting.models import Record
from apps.core.pagination import envelope
from apps.core.record_api import make_record_viewset

ENTITIES = [('accounts', 'accounts'), ('vouchers', 'vouchers'), ('expenses', 'expenses'), ('cost_centres', 'cost-centres'), ('assets', 'assets')]
MODULE_CODE = "accounting"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}


class StatementsView(APIView):
    """GET /api/v1/accounting/statements/ — TB / P&L / BS / cash-flow from CoA balances."""

    permission_classes = [IsAuthenticated]
    module_code = "accounting"

    def get(self, request, *args, **kwargs):
        groups = defaultdict(float)
        rows = []
        for acc in Record.objects.filter(entity="accounts", is_active=True):
            fields = acc.fields or {}
            group = str(fields.get("group") or "Other")
            balance = float(fields.get("balance") or 0)
            groups[group] += balance
            debit = balance if group in {"Asset", "Expense"} else 0
            credit = balance if group in {"Liability", "Equity", "Income"} else 0
            rows.append(
                {"code": acc.code, "title": acc.title, "group": group, "debit": debit, "credit": credit}
            )
        income = groups["Income"]
        expense = groups["Expense"]
        return envelope(
            {
                "trial_balance": rows,
                "profit_and_loss": {"income": income, "expense": expense, "profit": income - expense},
                "balance_sheet": {
                    "assets": groups["Asset"],
                    "liabilities": groups["Liability"],
                    "equity": groups["Equity"],
                    "retained": income - expense,
                },
                "cash_flow": {"operating": income - expense, "investing": 0, "financing": 0},
            }
        )
