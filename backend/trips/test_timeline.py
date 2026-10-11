from datetime import UTC, datetime

from django.test import SimpleTestCase

from .services.scheduler import schedule_trip
from .services.timeline import build_route_index, enrich_timeline, planning_metadata, position_on_leg
from .test_scheduler import make_legs


def make_route(first_seconds=3600, second_seconds=3600):
    legs = make_legs(first_seconds, second_seconds)
    legs[0]['geometry'] = {'type': 'LineString', 'coordinates': [[0, 0], [1, 0], [3, 0]]}
    legs[1]['geometry'] = {'type': 'LineString', 'coordinates': [[3, 0], [3, 1], [3, 3]]}
    return {'legs': legs, 'locations': {
        'pickup_location': {'label': 'Pickup', 'coordinates': [3.01, 0]},
        'dropoff_location': {'label': 'Drop-off', 'coordinates': [3, 3.01]},
    }}


class TimelineTests(SimpleTestCase):
    def test_default_date_uses_log_timezone_not_server_date(self):
        planning = planning_metadata(datetime(2026, 10, 12, 1, tzinfo=UTC))
        self.assertEqual(planning['start_at'], '2026-10-12T08:00:00-05:00')
        self.assertEqual(planning['log_timezone'], 'America/Chicago')

    def test_position_uses_segment_lengths_and_leg_offsets(self):
        route = make_route()
        indexes = build_route_index(route)
        first = indexes['drive_to_pickup']
        second = indexes['drive_to_dropoff']
        self.assertEqual(position_on_leg(first, 0), [0, 0])
        self.assertAlmostEqual(position_on_leg(first, 36000)[0], 1.5)
        self.assertEqual(position_on_leg(first, 72000), [3, 0])
        self.assertEqual(position_on_leg(second, 72000), [3, 0])
        self.assertAlmostEqual(position_on_leg(second, 108000)[1], 1.5)
        self.assertEqual(position_on_leg(second, 144000), [3, 3])

    def test_repeated_vertices_and_zero_length_leg(self):
        route = make_route(0, 3600)
        route['legs'][0]['geometry']['coordinates'] = [[0, 0], [0, 0]]
        route['legs'][1]['geometry']['coordinates'] = [[0, 0], [0, 0], [2, 0], [2, 0]]
        indexes = build_route_index(route)
        self.assertEqual(position_on_leg(indexes['drive_to_pickup'], 0), [0, 0])
        self.assertEqual(position_on_leg(indexes['drive_to_dropoff'], 36000), [1, 0])

    def test_enrichment_preserves_schedule_and_snapped_endpoints(self):
        route = make_route(11 * 3600, 3600.25)
        schedule = schedule_trip(route['legs'], 0)
        planning = planning_metadata(datetime(2026, 10, 11, 12, tzinfo=UTC))
        events = enrich_timeline(schedule['events'], route, planning)
        self.assertEqual(len({event['id'] for event in events}), len(events))
        for original, event in zip(schedule['events'], events):
            for key, value in original.items():
                self.assertEqual(event[key], value)
            elapsed = (datetime.fromisoformat(event['end_at']).astimezone(UTC)
                       - datetime.fromisoformat(event['start_at']).astimezone(UTC)).total_seconds()
            self.assertAlmostEqual(elapsed, event['duration_seconds'], places=5)
        pickup = next(e for e in events if e['activity'] == 'pickup')
        self.assertEqual(pickup['start_coordinates'], [3, 0])
        self.assertEqual(pickup['location']['kind'], 'routed_endpoint')
        rest = next(e for e in events if e['activity'] == 'daily_rest')
        self.assertEqual(rest['reason_codes'], ['daily_driving_limit'])
        self.assertIn('11-hour', rest['reason'])

    def test_timestamps_follow_elapsed_time_across_dst(self):
        route = make_route()
        schedule = schedule_trip(route['legs'], 0)
        for start_at, expected_end in [
            ('2026-03-08T01:30:00-06:00', '2026-03-08T03:30:00-05:00'),
            ('2026-11-01T01:30:00-05:00', '2026-11-01T01:30:00-06:00'),
        ]:
            with self.subTest(start_at=start_at):
                events = enrich_timeline(schedule['events'], route, {
                    'start_at': start_at, 'log_timezone': 'America/Chicago',
                })
                self.assertEqual(events[0]['end_at'], expected_end)
