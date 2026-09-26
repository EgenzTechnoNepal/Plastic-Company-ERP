from rest_framework import serializers

from apps.procurement.models import Incoterm, Supplier, SupplierDocument


class IncotermSerializer(serializers.ModelSerializer):
    class Meta:
        model = Incoterm
        fields = [
            "id",
            "code",
            "version",
            "name",
            "description",
            "default_named_place",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SupplierDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierDocument
        fields = [
            "id",
            "supplier",
            "title",
            "document_type",
            "reference_number",
            "file_url",
            "issued_on",
            "expires_on",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SupplierSerializer(serializers.ModelSerializer):
    documents = SupplierDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = Supplier
        fields = [
            "id",
            "company",
            "code",
            "legal_name",
            "trading_name",
            "country",
            "address",
            "contact_name",
            "email",
            "phone",
            "tax_id",
            "currency",
            "payment_terms",
            "preferred_incoterm",
            "quality_status",
            "quality_rating",
            "notes",
            "documents",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by", "updated_by"]
