"""Gemini adapter unit tests — no live API calls."""

from django.test import SimpleTestCase, override_settings

from apps.integrations.gemini import (
    GeminiNotConfiguredError,
    _parse_json_loose,
    gemini_configured,
    generate_json,
)


class GeminiAdapterTests(SimpleTestCase):
    @override_settings(ERP_INTEGRATIONS={"GOOGLE_GEMINI_API_KEY": "", "OCR_PROVIDER_API_KEY": "", "GEMINI_MODEL": "gemini-2.0-flash"})
    def test_not_configured(self):
        self.assertFalse(gemini_configured())
        with self.assertRaises(GeminiNotConfiguredError):
            generate_json(prompt="x", file_bytes=b"abc", mime_type="image/jpeg")

    def test_parse_json_fence(self):
        raw = 'Here you go:\n```json\n{"amount": "1000", "currency": "USD"}\n```'
        data = _parse_json_loose(raw)
        self.assertEqual(data.get("amount"), "1000")
        self.assertEqual(data.get("currency"), "USD")

    @override_settings(ERP_INTEGRATIONS={"GOOGLE_GEMINI_API_KEY": "test-key", "GEMINI_MODEL": "gemini-2.0-flash"})
    def test_configured_flag(self):
        self.assertTrue(gemini_configured())
