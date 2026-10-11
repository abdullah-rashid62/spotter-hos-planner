from django.urls import path
from .views import HealthCheckView, TripPlanView, LocationSearchView

urlpatterns = [
    path("locations/search/", LocationSearchView.as_view(), name="location-search"),
    path("health/", HealthCheckView.as_view()),

    path("trips/plan/",
        TripPlanView.as_view(),
        name="trip-plan"
    ),
]
