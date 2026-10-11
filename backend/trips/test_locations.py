from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from trips.serializers import TripInputSerializer
from trips.services.routing import RoutingUnavailable, search_locations


LOCATION = {'label': '100 Main Street', 'latitude': 41.8, 'longitude': -87.6}


class LocationTests(TestCase):
    def setUp(self):
        cache.clear()

    @patch('trips.services.routing.request_ors')
    def test_search_returns_candidates_and_precision_without_selecting(self, provider):
        provider.return_value = {'features': [
            {'geometry': {'coordinates': [-87.6, 41.8]},
             'properties': {'label': '100 Main Street', 'layer': 'address'}},
            {'geometry': {'coordinates': [-86, 40]},
             'properties': {'label': 'Main Street', 'layer': 'street'}},
        ]}
        response = APIClient().get('/api/locations/search/', {'q': '100 Main Street'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0], {**LOCATION, 'precision': 'address'})
        self.assertEqual(response.data['results'][1]['precision'], 'street')
        provider.assert_called_once_with('/geocode/autocomplete', parameters={'text': '100 main street', 'size': 5})

    @patch('trips.views.search_locations')
    def test_search_validates_input_and_throttles(self, search):
        client = APIClient()
        for query in ('', 'ab', 'x' * 256):
            self.assertEqual(client.get('/api/locations/search/', {'q': query}).status_code, 400)
        search.assert_not_called()
        cache.clear()
        search.return_value = []
        for _ in range(120):
            self.assertEqual(client.get('/api/locations/search/', {'q': 'Main Street'}).status_code, 200)
        self.assertEqual(client.get('/api/locations/search/', {'q': 'Main Street'}).status_code, 429)
        self.assertEqual(search.call_count, 120)

    @patch('trips.services.routing.request_ors')
    def test_bad_provider_coordinates_and_labels_are_rejected(self, provider):
        for coordinates, label in (([181, 0], 'Place'), ([0, float('nan')], 'Place'), ([0, 0], None)):
            provider.return_value = {'features': [{'geometry': {'coordinates': coordinates},
                                                  'properties': {'label': label}}]}
            with self.assertRaises(RoutingUnavailable):
                search_locations('Main Street')

    @patch('trips.services.trip_planner.get_trip_route')
    def test_unselected_text_and_invalid_coordinates_never_reach_routing(self, route):
        for location in ('Chicago', {}, {**LOCATION, 'latitude': 91},
                         {**LOCATION, 'longitude': -181}, {**LOCATION, 'label': ''},
                         {**LOCATION, 'latitude': True}):
            response = APIClient().post('/api/trips/plan/', {
                'current_location': location, 'pickup_location': LOCATION,
                'dropoff_location': LOCATION, 'cycle_used_hours': 0,
            }, format='json')
            self.assertEqual(response.status_code, 400)
            self.assertIn('current_location', response.data)
        route.assert_not_called()

    def test_nonfinite_coordinates_rejected_and_zero_accepted(self):
        for latitude, expected in ((float('nan'), False), (float('inf'), False), (0, True)):
            serializer = TripInputSerializer(data={
                'current_location': {**LOCATION, 'latitude': latitude, 'longitude': 0},
                'pickup_location': LOCATION, 'dropoff_location': LOCATION, 'cycle_used_hours': 0,
            })
            self.assertEqual(serializer.is_valid(), expected)
