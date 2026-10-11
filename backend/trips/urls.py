from django.urls import path
from .views import HealthCheckView, TripPlanView

urlpatterns = [
    path("health/", HealthCheckView.as_view()),

    path("trips/plan/",
        TripPlanView.as_view(),
        name="trip-plan"
    ),
]
