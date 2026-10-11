
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from rest_framework.throttling import UserRateThrottle
from .serializers import TripInputSerializer, LocationSearchSerializer
from .services.routing import search_locations
from .services import plan_trip


class HealthCheckView(APIView):
    def get(self, request):
        return Response({
            "status": "ok",
            "service": "spotter-hos"
        })


class TripPlanView(APIView):

    def post(self, request):
        serializer = TripInputSerializer(
            data=request.data
        )

        serializer.is_valid(raise_exception=True)

        result = plan_trip(serializer.validated_data)

        return Response(
            result,
            status=status.HTTP_200_OK
        )


class LocationSearchThrottle(UserRateThrottle):
    scope = 'location_search'
    rate = '20/min'


class LocationSearchView(APIView):
    throttle_classes = [LocationSearchThrottle]

    def get(self, request):
        serializer = LocationSearchSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response({'results': search_locations(serializer.validated_data['q'])})
