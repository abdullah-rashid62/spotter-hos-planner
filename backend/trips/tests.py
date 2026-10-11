from django.test import TestCase

# Create your tests here.

from rest_framework.test import APITestCase
from rest_framework import status


class HealthCheckTests(APITestCase):

    def test_health_endpoint_returns_success(self):
        response = self.client.get("/api/health/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK
        )

        self.assertEqual(
            response.data["status"],
            "ok"
        )

        self.assertEqual(
            response.data["service"],
            "routter-hos"
        )

    def test_health_endpoint_rejects_post(self):
        response = self.client.post("/api/health/")

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED
        )
