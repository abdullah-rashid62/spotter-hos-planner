
from math import isfinite
from rest_framework import serializers


class CoordinateField(serializers.FloatField):
    def to_internal_value(self, data):
        if isinstance(data, bool):
            self.fail('invalid')
        return super().to_internal_value(data)


class LocationSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=255)
    latitude = CoordinateField(min_value=-90, max_value=90)
    longitude = CoordinateField(min_value=-180, max_value=180)

    def validate(self, attrs):
        for field in ('latitude', 'longitude'):
            if not isfinite(attrs[field]):
                raise serializers.ValidationError({field: 'Enter a finite coordinate.'})
        return attrs


class LocationSearchSerializer(serializers.Serializer):
    q = serializers.CharField(min_length=3, max_length=255)


class TripInputSerializer(serializers.Serializer):
    current_location = LocationSerializer()
    pickup_location = LocationSerializer()
    dropoff_location = LocationSerializer()

    cycle_used_hours = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=0,
        max_value=70,
    )
