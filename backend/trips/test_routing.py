import json
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from django.test import SimpleTestCase, override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from trips.services.routing import RoutingUnavailable, geocode_location, request_ors, route_leg
from trips.services.trip_planner import plan_trip


def route_response(distance=120000.25, duration=7200.5):
    return {'features': [{'geometry': {'type': 'LineString',
                                      'coordinates': [[-87.6, 41.8], [-86.1, 39.7]]},
                          'properties': {'summary': {'distance': distance, 'duration': duration},
                                         'segments': [{'steps': [{'instruction': 'Continue'}]}]}}]}


@override_settings(ORS_API_KEY='test-key', ORS_TIMEOUT_SECONDS=20)
class RoutingTests(SimpleTestCase):
    @patch('trips.services.routing.urlopen')
    def test_transport_uses_auth_header_and_lon_lat(self, urlopen):
        urlopen.return_value.__enter__.return_value = BytesIO(json.dumps(route_response()).encode())
        leg = route_leg([-87.6, 41.8], [-86.1, 39.7], 'drive_to_pickup')
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_header('Authorization'), 'test-key')
        self.assertEqual(request.get_header('Accept'), 'application/geo+json')
        self.assertNotIn('test-key', request.full_url)
        self.assertEqual(json.loads(request.data)['coordinates'], [[-87.6, 41.8], [-86.1, 39.7]])
        self.assertEqual(leg['distance_meters'], 120000.25)
        self.assertEqual(leg['duration_seconds'], 7200.5)

    @patch('trips.services.routing.request_ors', return_value={'features': []})
    def test_unknown_location_is_field_error(self, request):
        with self.assertRaises(ValidationError) as caught:
            geocode_location('unknown', 'pickup_location')
        self.assertIn('pickup_location', caught.exception.detail)

    @patch('trips.services.routing.request_ors')
    def test_malformed_routes_never_reach_scheduler(self, request):
        for response in ({}, route_response(distance=float('nan')), route_response(duration=-1)):
            with self.subTest(response=response):
                request.return_value = response
                with self.assertRaises(RoutingUnavailable):
                    route_leg([1, 2], [3, 4], 'drive_to_pickup')

    @patch('trips.services.routing.request_ors')
    def test_identical_locations_do_not_request_directions(self, request):
        leg = route_leg([1, 2], [1, 2], 'drive_to_pickup')
        self.assertEqual(leg['duration_seconds'], 0)
        self.assertEqual(leg['distance_meters'], 0)
        request.assert_not_called()

    @patch('trips.services.routing.urlopen')
    def test_provider_failures_are_sanitized(self, urlopen):
        for status in (401, 403, 429, 500, 503):
            with self.subTest(status=status):
                urlopen.side_effect = HTTPError('secret-url', status, 'secret-body', {}, None)
                with self.assertRaises(RoutingUnavailable) as caught:
                    request_ors('/geocode/search')
                self.assertNotIn('secret', str(caught.exception.detail))
        for error in (URLError('secret-url'), TimeoutError()):
            urlopen.side_effect = error
            with self.assertRaises(RoutingUnavailable):
                request_ors('/geocode/search')

    @override_settings(ORS_API_KEY='')
    @patch('trips.services.routing.urlopen')
    def test_missing_key_does_not_make_network_request(self, urlopen):
        with self.assertRaises(RoutingUnavailable):
            request_ors('/geocode/search')
        urlopen.assert_not_called()

    @patch('trips.services.routing.request_ors')
    def test_planner_preserves_route_totals_and_converts_cycle_hours(self, request):
        location = {'features': [{'geometry': {'coordinates': [-87.6, 41.8]},
                                  'properties': {'label': 'Chicago, IL, USA'}}]}
        pickup = {'features': [{'geometry': {'coordinates': [-86.1, 39.7]},
                                'properties': {'label': 'Indianapolis, IN, USA'}}]}
        request.side_effect = [location, pickup, route_response(), route_response()]
        result = plan_trip({'current_location': 'Chicago', 'pickup_location': 'Indianapolis',
                            'dropoff_location': 'Chicago', 'cycle_used_hours': Decimal('24.25')})
        driving = [event for event in result['events'] if event['duty_status'] == 'driving']
        self.assertAlmostEqual(sum(e['end_second'] - e['start_second'] for e in driving), 14401)
        self.assertAlmostEqual(sum(e['end_route_meters'] - e['start_route_meters'] for e in driving), 240000.5)
        self.assertAlmostEqual(result['driver']['cycle_used'], 24.25 * 3600 + 14401 + 7200)
        self.assertEqual(result['route']['source'], 'openrouteservice')
        self.assertEqual(len(result['route']['geometry']['coordinates']), 2)

    @patch('trips.services.trip_planner.get_trip_route')
    def test_api_validates_before_provider_and_returns_provider_errors(self, route):
        client = APIClient()
        response = client.post('/api/trips/plan/', {}, format='json')
        self.assertEqual(response.status_code, 400)
        route.assert_not_called()
        route.side_effect = RoutingUnavailable()
        response = client.post('/api/trips/plan/', {
            'current_location': 'Chicago', 'pickup_location': 'Indianapolis',
            'dropoff_location': 'Atlanta', 'cycle_used_hours': 24,
        }, format='json')
        self.assertEqual(response.status_code, 503)
