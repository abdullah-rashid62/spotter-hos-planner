from django.test import SimpleTestCase

from .services.scheduler import FUEL_RANGE_METERS, schedule_trip


def make_legs(first_seconds, second_seconds, first_meters=None, second_meters=None):
    return [
        {'type': 'drive_to_pickup', 'duration_seconds': first_seconds,
         'distance_meters': first_seconds * 20 if first_meters is None else first_meters},
        {'type': 'drive_to_dropoff', 'duration_seconds': second_seconds,
         'distance_meters': second_seconds * 20 if second_meters is None else second_meters},
    ]


class SchedulerTests(SimpleTestCase):
    def test_long_fractional_trip_preserves_totals_and_limits(self):
        legs = make_legs(150000.2, 200000.7, 2500000.4, 3500000.8)
        trip = schedule_trip(legs, 69 * 3600 + 0.2)
        elapsed = distance = driving = fuel_distance = 0
        for event in trip['events']:
            self.assertAlmostEqual(event['start_second'], elapsed)
            self.assertAlmostEqual(event['start_route_meters'], distance)
            self.assertGreater(event['end_second'], elapsed)
            elapsed = event['end_second']
            distance = event['end_route_meters']
            if event['activity'] == 'fuel':
                self.assertAlmostEqual(distance - fuel_distance, FUEL_RANGE_METERS)
                fuel_distance = distance
            self.assertLessEqual(distance - fuel_distance, FUEL_RANGE_METERS + 1e-6)
            if event['duty_status'] == 'driving':
                driving += event['end_second'] - event['start_second']
                counters = event['driver_after']
                for field, hours in [('cycle_used', 70), ('driving_used', 11),
                                     ('window_elapsed', 14), ('driving_since_break', 8)]:
                    self.assertLessEqual(counters[field], hours * 3600 + 1e-6)
        self.assertAlmostEqual(driving, sum(leg['duration_seconds'] for leg in legs))
        self.assertAlmostEqual(distance, sum(leg['distance_meters'] for leg in legs))
        self.assertAlmostEqual(elapsed, trip['elapsed_seconds'])

    def test_pickup_satisfies_break_at_arrival(self):
        trip = schedule_trip(make_legs(8 * 3600, 3600), 0)
        self.assertEqual([e['activity'] for e in trip['events']],
                         ['drive', 'pickup', 'drive', 'dropoff'])

    def test_handling_at_cycle_limit_then_restart_without_short_break(self):
        trip = schedule_trip(make_legs(3600, 3600), 69 * 3600)
        self.assertEqual([e['activity'] for e in trip['events']],
                         ['drive', 'pickup', 'cycle_restart', 'drive', 'dropoff'])
        self.assertEqual(trip['events'][1]['driver_after']['cycle_used'], 71 * 3600)

    def test_daily_limit_at_arrival_allows_handling_before_rest(self):
        trip = schedule_trip(make_legs(11 * 3600, 3600), 0)
        activities = [e['activity'] for e in trip['events']]
        self.assertEqual(activities[-4:], ['pickup', 'daily_rest', 'drive', 'dropoff'])

    def test_fuel_range_continues_across_pickup(self):
        trip = schedule_trip(make_legs(3600, 3600, FUEL_RANGE_METERS * .75,
                                      FUEL_RANGE_METERS * .5), 0)
        fuel = [e for e in trip['events'] if e['activity'] == 'fuel']
        self.assertEqual(len(fuel), 1)
        self.assertAlmostEqual(fuel[0]['start_route_meters'], FUEL_RANGE_METERS)

    def test_zero_length_legs_still_have_handling(self):
        trip = schedule_trip(make_legs(0, 0), 70 * 3600)
        self.assertEqual([e['activity'] for e in trip['events']], ['pickup', 'dropoff'])
        self.assertEqual(trip['driver']['cycle_used'], 72 * 3600)
