
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .serializers import TripInputSerializer
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
