"""Attach calendar and estimated geographic information to scheduler events."""
from bisect import bisect_right
from datetime import UTC, datetime, time, timedelta
from math import asin, cos, radians, sin, sqrt
from zoneinfo import ZoneInfo


LOG_TIMEZONE = 'America/Chicago'
ASSUMPTIONS = [
    'Departure is tomorrow at 08:00 in America/Chicago, a fixed demo log timezone.',
    'Fresh daily allowances after qualifying daily rest; initial fuel range is 1,000 miles.',
    'Fueling takes 30 minutes on duty; pickup and drop-off each take one hour.',
    'Speed is constant at the average for each route leg.',
    'Full daily rests are used; split-sleeper pairings are not scheduled.',
    'Cycle usage is retained until a 34-hour restart; rolling-cycle recap is not implemented and extra rest may result.',
    'Before and after the trip, uncovered daily-log hours are assumed off duty, not known driver history.',
    'Fuel and rest coordinates are estimates along the route, not verified facilities.',
]
REASONS = {
    'drive': 'Travel along the planned route.',
    'pickup': 'One hour of on-duty pickup work; this also satisfies the driving break.',
    'dropoff': 'One hour of on-duty unloading work; this also satisfies the driving break.',
    'fuel': 'Refuel at the planned 1,000-mile range boundary; 30 minutes on duty also satisfies the driving break.',
    'driving_break': 'Take 30 continuous minutes without driving after eight hours of driving.',
    'cycle_restart': 'The cycle allowance is exhausted. The planner chooses a 34-hour restart because rolling recap is not implemented.',
}
LIMIT_LABELS = {
    'daily_driving_limit': '11-hour driving allowance',
    'duty_window_limit': '14-hour duty window',
}


def planning_metadata(now=None):
    zone = ZoneInfo(LOG_TIMEZONE)
    now = now or datetime.now(UTC)
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError('Planning time must be timezone-aware.')
    tomorrow = now.astimezone(zone).date() + timedelta(days=1)
    departure = datetime.combine(tomorrow, time(8), zone)
    return {
        'start_at': departure.isoformat(),
        'log_timezone': LOG_TIMEZONE,
        'departure_policy': 'tomorrow_at_08:00_in_log_timezone',
        'timezone_source': 'fixed_demo_default_not_supplied_home_terminal',
        'assumptions': list(ASSUMPTIONS),
    }


def geographic_distance(first, second):
    """Great-circle meters used only to locate points on the route polyline."""
    longitude_delta = radians(second[0] - first[0])
    latitude_delta = radians(second[1] - first[1])
    value = (sin(latitude_delta / 2) ** 2
             + cos(radians(first[1])) * cos(radians(second[1]))
             * sin(longitude_delta / 2) ** 2)
    return 2 * 6371008.8 * asin(sqrt(min(1, max(0, value))))


def build_route_index(route):
    indexes = {}
    route_offset = 0
    for leg in route['legs']:
        coordinates = leg['geometry']['coordinates']
        cumulative = [0.0]
        for first, second in zip(coordinates, coordinates[1:]):
            cumulative.append(cumulative[-1] + geographic_distance(first, second))
        indexes[leg['type']] = {
            'coordinates': coordinates, 'cumulative': cumulative,
            'route_offset': route_offset, 'distance_meters': leg['distance_meters'],
        }
        route_offset += leg['distance_meters']
    return indexes


def position_on_leg(index, route_meters):
    coordinates = index['coordinates']
    distance = index['distance_meters']
    if distance == 0:
        return list(coordinates[0])
    fraction = min(1, max(0, (route_meters - index['route_offset']) / distance))
    if fraction == 0:
        return list(coordinates[0])
    if fraction == 1:
        return list(coordinates[-1])
    cumulative = index['cumulative']
    if cumulative[-1] == 0:
        return list(coordinates[0])
    # Provider distance and measured polyline length can differ. Normalize per
    # leg so its scheduled distance still lands exactly at the routed endpoint.
    target = fraction * cumulative[-1]
    segment = min(bisect_right(cumulative, target) - 1, len(coordinates) - 2)
    start, end = coordinates[segment:segment + 2]
    ratio = (target - cumulative[segment]) / (cumulative[segment + 1] - cumulative[segment])
    longitude_delta = (end[0] - start[0] + 180) % 360 - 180
    longitude = (start[0] + longitude_delta * ratio + 180) % 360 - 180
    return [longitude, start[1] + (end[1] - start[1]) * ratio]


def event_reason(event):
    if event['activity'] == 'daily_rest':
        limits = [label for code, label in LIMIT_LABELS.items()
                  if code in event['reason_codes']]
        return 'Take 10 consecutive hours off duty after reaching the ' + ' and '.join(limits) + '.'
    return REASONS[event['activity']]


def enrich_timeline(events, route, planning):
    indexes = build_route_index(route)
    zone = ZoneInfo(planning['log_timezone'])
    departure = datetime.fromisoformat(planning['start_at']).astimezone(UTC)
    enriched = []
    for number, event in enumerate(events, start=1):
        index = indexes[event['leg']]
        start = departure + timedelta(seconds=event['start_second'])
        end = departure + timedelta(seconds=event['end_second'])
        start_coordinates = position_on_leg(index, event['start_route_meters'])
        end_coordinates = position_on_leg(index, event['end_route_meters'])
        activity = event['activity']
        if activity in ('pickup', 'dropoff'):
            # Handling happens at the routed endpoint, which can be snapped
            # away from the original geocoded address by the route provider.
            start_coordinates = end_coordinates = list(index['coordinates'][-1])
            label = route['locations'][activity + '_location']['label']
            location_kind = 'routed_endpoint'
        else:
            destination = 'pickup' if event['leg'] == 'drive_to_pickup' else 'drop-off'
            label = 'Estimated route position toward ' + destination
            location_kind = 'estimated_route_position'
        enriched.append({
            **event, 'id': f'event-{number:04d}',
            'start_at': start.astimezone(zone).isoformat(),
            'end_at': end.astimezone(zone).isoformat(),
            'duration_seconds': event['end_second'] - event['start_second'],
            'distance_meters': event['end_route_meters'] - event['start_route_meters'],
            'start_coordinates': start_coordinates, 'end_coordinates': end_coordinates,
            'location': {'label': label, 'kind': location_kind,
                         'verified_facility': False},
            'reason': event_reason(event),
        })
    return enriched
