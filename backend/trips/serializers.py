
from decimal import Decimal
from rest_framework import serializers


class TripInputSerializer(serializers.Serializer):
    current_location = serializers.CharField(
        max_length=255
    )

    pickup_location = serializers.CharField(
        max_length=255
    )

    dropoff_location = serializers.CharField(
        max_length=255
    )

    cycle_used_hours = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=0,
        max_value=70,
    )