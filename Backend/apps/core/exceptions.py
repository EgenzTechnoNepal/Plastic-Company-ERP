"""
Global DRF exception handler producing a single consistent error envelope:

    { "error": { "code": "...", "message": "...", "fields": {...} } }

Never lets a Django/Python traceback leak to the client.
"""

import logging

from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework import exceptions as drf_exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_default_handler

logger = logging.getLogger("apps")


class ERPError(drf_exceptions.APIException):
    """Base class for business-rule errors with a stable machine-readable code."""

    status_code = 400
    default_code = "ERP_ERROR"

    def __init__(self, message: str, code: str | None = None, fields: dict | None = None, status_code: int | None = None):
        self.code = code or self.default_code
        self.fields = fields or {}
        if status_code is not None:
            self.status_code = status_code
        super().__init__(detail=message, code=self.code)


class InsufficientStockError(ERPError):
    default_code = "INSUFFICIENT_STOCK"


class CreditLimitExceededError(ERPError):
    default_code = "CREDIT_LIMIT_EXCEEDED"


class PeriodClosedError(ERPError):
    default_code = "PERIOD_CLOSED"


class ApprovalRequiredError(ERPError):
    default_code = "APPROVAL_REQUIRED"


class InvalidStatusTransitionError(ERPError):
    default_code = "INVALID_STATUS_TRANSITION"


class ThreeWayMatchFailedError(ERPError):
    default_code = "THREE_WAY_MATCH_FAILED"


class PaymentExceedsOutstandingError(ERPError):
    default_code = "PAYMENT_EXCEEDS_OUTSTANDING"


class DebitCreditMismatchError(ERPError):
    default_code = "DEBIT_CREDIT_MISMATCH"


def erp_exception_handler(exc, context):
    if isinstance(exc, ERPError):
        return Response(
            {"error": {"code": exc.code, "message": str(exc.detail), "fields": exc.fields}},
            status=exc.status_code,
        )

    if isinstance(exc, Http404):
        exc = drf_exceptions.NotFound()
    elif isinstance(exc, PermissionDenied):
        exc = drf_exceptions.PermissionDenied()

    response = drf_default_handler(exc, context)

    if response is None:
        # Unhandled exception: log the real error server-side, tell the client nothing internal.
        logger.exception("Unhandled exception in %s", context.get("view"))
        return Response(
            {"error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred.", "fields": {}}},
            status=500,
        )

    code = "PERMISSION_DENIED" if response.status_code == 403 else getattr(exc, "default_code", "ERROR")
    fields = response.data if isinstance(response.data, dict) else {"detail": response.data}
    message = fields.pop("detail", None) or str(exc)
    response.data = {"error": {"code": code, "message": str(message), "fields": fields}}
    return response
