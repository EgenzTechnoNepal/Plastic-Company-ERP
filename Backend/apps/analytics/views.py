from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.analytics.models import Record
from apps.core.pagination import envelope
from apps.core.record_api import make_record_viewset

ENTITIES = [('insights', 'insights')]
MODULE_CODE = "analytics"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}


class AskView(APIView):
    """POST /api/v1/analytics/ask/ — advisory NL enquiry. Nothing posts until Accept."""

    permission_classes = [IsAuthenticated]
    module_code = "analytics"

    def post(self, request, *args, **kwargs):
        query = (request.data.get("query") or "").strip()
        hint = (
            "Suggestion is advisory. Review stock, open PRs and the latest MRP run before posting. "
            f"Query: {query or '(empty)'}"
        )
        return envelope({"query": query, "answer": hint, "requires_accept": True})
