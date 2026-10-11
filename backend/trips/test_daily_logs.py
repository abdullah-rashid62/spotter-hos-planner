from datetime import UTC, datetime
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from .services.daily_logs import build_daily_logs
from .services.scheduler import schedule_trip
from .services.timeline import enrich_timeline
from .test_timeline import make_route


def make_logs(start_at, first_seconds=3600, second_seconds=3600, cycle_used=0):
    route = make_route(first_seconds, second_seconds)
    planning = {'start_at': start_at, 'log_timezone': 'America/Chicago'}
    schedule = schedule_trip(route['legs'], cycle_used)
    events = enrich_timeline(schedule['events'], route, planning)
    return events, build_daily_logs(events, route, planning)


class DailyLogTests(SimpleTestCase):
    def assert_logs_match_events(self, events, days):
        segments = [segment for day in days for segment in day['segments']]
        for event in events:
            slices = [segment for segment in segments if segment['event_id'] == event['id']]
            self.assertAlmostEqual(sum(s['duration_seconds'] for s in slices), event['duration_seconds'])
            self.assertAlmostEqual(sum(s['distance_meters'] for s in slices), event['distance_meters'])
            self.assertEqual(slices[0]['start_at'], event['start_at'])
            self.assertEqual(slices[-1]['end_at'], event['end_at'])
        for day in days:
            self.assertAlmostEqual(sum(day['totals_seconds'].values()), day['day_seconds'])
            self.assertEqual(day['totals_seconds']['sleeper'], 0)
            self.assertEqual(day['segments'][0]['start_second'], 0)
            previous_end = 0
            for segment in day['segments']:
                self.assertAlmostEqual(segment['start_second'], previous_end)
                self.assertGreater(segment['duration_seconds'], 0)
                previous_end = segment['end_second']
                start = datetime.fromisoformat(segment['start_at']).astimezone(UTC)
                end = datetime.fromisoformat(segment['end_at']).astimezone(UTC)
                self.assertAlmostEqual((end - start).total_seconds(), segment['duration_seconds'], places=5)
            self.assertAlmostEqual(previous_end, day['day_seconds'])

    def test_full_day_padding_and_unspecified_identity(self):
        events, days = make_logs('2026-10-12T08:00:00-05:00')
        self.assertEqual(len(days), 1)
        self.assert_logs_match_events(events, days)
        self.assertEqual(days[0]['totals_seconds'], {
            'off_duty': 20 * 3600, 'sleeper': 0, 'driving': 2 * 3600, 'on_duty': 2 * 3600,
        })
        self.assertEqual([s['activity'] for s in days[0]['segments'] if s['assumed']],
                         ['before_trip', 'after_trip'])
        self.assertTrue(all(value is None for value in days[0]['identity'].values()))

    def test_midnight_split_preserves_event_identity_distance_and_positions(self):
        events, days = make_logs('2026-12-31T23:30:00-06:00')
        self.assertEqual([day['date'] for day in days], ['2026-12-31', '2027-01-01'])
        self.assert_logs_match_events(events, days)
        before = days[0]['segments'][-1]
        after = days[1]['segments'][0]
        self.assertEqual(before['event_id'], after['event_id'])
        self.assertTrue(before['continues_into_next_day'])
        self.assertTrue(after['continues_from_previous_day'])
        self.assertEqual(before['end_coordinates'], after['start_coordinates'])
        self.assertAlmostEqual(before['distance_meters'], events[0]['distance_meters'] / 2)
        self.assertAlmostEqual(before['end_coordinates'][0], 1.5)

    def test_exact_midnight_end_does_not_create_empty_day(self):
        events, days = make_logs('2026-10-12T20:00:00-05:00')
        self.assertEqual(len(days), 1)
        self.assertEqual(days[0]['segments'][-1]['activity'], 'dropoff')
        self.assert_logs_match_events(events, days)

    def test_long_fractional_trip_and_restarts_preserve_all_totals(self):
        events, days = make_logs('2026-10-12T08:00:00-05:00', 150000.2, 200000.7, 70 * 3600)
        self.assertGreater(len(days), 4)
        self.assert_logs_match_events(events, days)
        self.assertAlmostEqual(sum(day['distance_meters'] for day in days),
                               sum(event['distance_meters'] for event in events))
        middle_days = days[1:-1]
        self.assertFalse(any(s['assumed'] for day in middle_days for s in day['segments']))

    def test_dst_days_preserve_elapsed_rest_and_report_clock_changes(self):
        for start_at, transition_date, hours, offset_change in [
            ('2026-03-07T08:00:00-06:00', '2026-03-08', 23, 3600),
            ('2026-10-31T08:00:00-05:00', '2026-11-01', 25, -3600),
        ]:
            with self.subTest(start_at=start_at):
                events, days = make_logs(start_at, cycle_used=70 * 3600)
                self.assert_logs_match_events(events, days)
                day = next(day for day in days if day['date'] == transition_date)
                self.assertEqual(day['day_seconds'], hours * 3600)
                self.assertEqual(len(day['clock_changes']), 1)
                self.assertEqual(day['clock_changes'][0]['offset_change_seconds'], offset_change)
                self.assertEqual(day['clock_changes'][0]['second'], 2 * 3600)

    def test_zero_distance_trip_only_contains_handling_and_padding(self):
        events, days = make_logs('2026-10-12T08:00:00-05:00', 0, 0)
        self.assert_logs_match_events(events, days)
        self.assertEqual(days[0]['distance_meters'], 0)
        self.assertEqual(days[0]['totals_seconds']['on_duty'], 7200)

    @patch('trips.services.trip_planner.get_trip_route')
    def test_api_returns_serializable_logs_and_matching_timeline(self, route):
        route.return_value = make_route(11 * 3600, 11 * 3600)
        response = APIClient().post('/api/trips/plan/', {
            'current_location': 'Chicago', 'pickup_location': 'Indianapolis',
            'dropoff_location': 'Atlanta', 'cycle_used_hours': 24,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertGreater(len(body['daily_logs']), 1)
        self.assertEqual(body['planning']['end_at'], body['events'][-1]['end_at'])
        self.assert_logs_match_events(body['events'], body['daily_logs'])
