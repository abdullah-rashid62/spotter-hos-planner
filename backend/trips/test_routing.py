import json
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from django.core.cache import cache
from django.core.cache.backends.db import DatabaseCache
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from trips.services.routing import RoutingUnavailable, search_locations, request_ors, route_leg, provider_cache_key
from trips.services.trip_planner import plan_trip


def route_response(distance=120000.25, duration=7200.5):
    return {'features': [{'geometry': {'type': 'LineString',
                                      'coordinates': [[-87.6, 41.8], [-86.1, 39.7]]},
                          'properties': {'summary': {'distance': distance, 'duration': duration},
                                         'segments': [{'steps': [{'instruction': 'Continue'}]}]}}]}


@override_settings(ORS_API_KEY='test-key', ORS_TIMEOUT_SECONDS=20)
class RoutingTests(TestCase):
    def setUp(self):
        cache.clear()

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
    def test_unknown_location_returns_no_candidates(self, request):
        self.assertEqual(search_locations('unknown'), [])

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
        location = {'label': 'Chicago', 'latitude': 41.8, 'longitude': -87.6}
        pickup = {'label': 'Indianapolis', 'latitude': 39.7, 'longitude': -86.1}
        request.side_effect = [route_response(), route_response()]
        result = plan_trip({'current_location': location, 'pickup_location': pickup,
                            'dropoff_location': location, 'cycle_used_hours': Decimal('24.25')})
        self.assertEqual(request.call_count, 2)
        self.assertTrue(all('/directions/' in call.args[0] for call in request.call_args_list))
        self.assertEqual(request.call_args_list[0].kwargs['body']['coordinates'],
                         [[-87.6, 41.8], [-86.1, 39.7]])
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
            'current_location': {'label': 'Chicago', 'latitude': 41.8, 'longitude': -87.6},
            'pickup_location': {'label': 'Indianapolis', 'latitude': 39.7, 'longitude': -86.1},
            'dropoff_location': {'label': 'Atlanta', 'latitude': 33.7, 'longitude': -84.4},
            'cycle_used_hours': 24,
        }, format='json')
        self.assertEqual(response.status_code, 503)

    @patch('trips.services.routing.request_ors')
    def test_autocomplete_cache_normalizes_query_and_is_shared(self, request):
        request.return_value = {'features': []}
        self.assertEqual(search_locations('  Main   STREET '), [])
        self.assertEqual(search_locations('main street'), [])
        request.assert_called_once()
        # A separate backend instance reads the same database, like another worker.
        other_worker = DatabaseCache('shared_cache', {})
        key = provider_cache_key('/geocode/autocomplete', {'text': 'main street', 'size': 5})
        self.assertEqual(other_worker.get(key), [])
        other_worker.delete(key)
        search_locations('main street')
        self.assertEqual(request.call_count, 2)

    @patch('trips.services.routing.request_ors', return_value=route_response())
    def test_cycle_change_reuses_route_but_recalculates_schedule(self, request):
        location = {'label': 'Chicago', 'latitude': 41.8, 'longitude': -87.6}
        pickup = {'label': 'Indianapolis', 'latitude': 39.7, 'longitude': -86.1}
        inputs = {'current_location': location, 'pickup_location': pickup,
                  'dropoff_location': location, 'cycle_used_hours': 0}
        first = plan_trip(inputs)
        second = plan_trip({**inputs, 'cycle_used_hours': 69})
        self.assertEqual(request.call_count, 2)
        self.assertEqual(first['route'], second['route'])
        self.assertGreater(second['elapsed_seconds'], first['elapsed_seconds'])
        self.assertNotEqual(first['events'], second['events'])
        # Changing just the dropoff reuses the current-to-pickup leg.
        plan_trip({**inputs, 'dropoff_location': {**location, 'longitude': -88}})
        self.assertEqual(request.call_count, 3)

    @patch('trips.services.routing.request_ors', return_value=route_response())
    def test_route_cache_preserves_direction_type_and_isolation(self, request):
        first = route_leg([1, 2], [3, 4], 'drive_to_pickup')
        first['geometry']['coordinates'][0][0] = 0
        second = route_leg([1, 2], [3, 4], 'drive_to_dropoff')
        self.assertEqual(request.call_count, 1)
        self.assertEqual(second['type'], 'drive_to_dropoff')
        self.assertEqual(second['geometry']['coordinates'][0][0], -87.6)
        route_leg([3, 4], [1, 2], 'drive_to_pickup')
        self.assertEqual(request.call_count, 2)
        self.assertNotEqual(provider_cache_key('/directions/hgv', {'units': 'm'}),
                            provider_cache_key('/directions/hgv', {'units': 'km'}))
        self.assertNotEqual(provider_cache_key('/directions/hgv', {}),
                            provider_cache_key('/directions/car', {}))

    @override_settings(LOCATION_CACHE_SECONDS=0, ROUTE_CACHE_SECONDS=0)
    @patch('trips.services.routing.request_ors')
    def test_expired_results_are_requested_again(self, request):
        request.return_value = {'features': []}
        search_locations('Main Street')
        search_locations('Main Street')
        self.assertEqual(request.call_count, 2)
        request.return_value = route_response()
        route_leg([1, 2], [3, 4], 'drive_to_pickup')
        route_leg([1, 2], [3, 4], 'drive_to_pickup')
        self.assertEqual(request.call_count, 4)

    @patch('trips.services.routing.request_ors')
    def test_provider_failures_are_not_cached(self, request):
        request.side_effect = RoutingUnavailable()
        with self.assertRaises(RoutingUnavailable):
            search_locations('Main Street')
        with self.assertRaises(RoutingUnavailable):
            route_leg([1, 2], [3, 4], 'drive_to_pickup')
        request.side_effect = None
        request.return_value = {'features': []}
        self.assertEqual(search_locations('Main Street'), [])
        request.return_value = route_response()
        self.assertGreater(route_leg([1, 2], [3, 4], 'drive_to_pickup')['duration_seconds'], 0)
        self.assertEqual(request.call_count, 4)
