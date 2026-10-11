"""Prepare planned log data from the same timeline used by the map/itinerary.

Day-relative seconds are elapsed seconds from local midnight, not wall-clock
positions. A DST transition day can have 23 or 25 hours; timestamps and clock
changes let renderers label skipped/repeated clock hours without losing time.
"""
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from .timeline import build_route_index, position_on_leg


STATUSES = ('off_duty', 'sleeper', 'driving', 'on_duty')
METERS_PER_MILE = 1609.344


def clock_changes(start, end, zone):
    changes = []
    cursor = start
    while cursor < end:
        following = min(cursor + timedelta(hours=1), end)
        old_offset = cursor.astimezone(zone).utcoffset()
        new_offset = following.astimezone(zone).utcoffset()
        if old_offset != new_offset:
            # Locate the offset change to the second; timezone transitions have
            # whole-second boundaries. Arithmetic is always on UTC instants.
            low = cursor
            high = following
            while (high - low).total_seconds() > 1:
                middle = low + timedelta(seconds=int((high - low).total_seconds() // 2))
                if middle.astimezone(zone).utcoffset() == old_offset:
                    low = middle
                else:
                    high = middle
            if high < end:
                changes.append({
                    'at': high.astimezone(zone).isoformat(),
                    'second': (high - start).total_seconds(),
                    'offset_change_seconds': (new_offset - old_offset).total_seconds(),
                })
        cursor = following
    return changes


def segment_times(start, end, day_start, zone):
    return {
        'start_second': start, 'end_second': end,
        'duration_seconds': end - start,
        'start_at': (day_start + timedelta(seconds=start)).astimezone(zone).isoformat(),
        'end_at': (day_start + timedelta(seconds=end)).astimezone(zone).isoformat(),
    }


def padding_segment(kind, start, end, day_start, zone, day_date):
    return {
        'id': f'{day_date}-{kind}', 'event_id': None,
        'activity': kind, 'duty_status': 'off_duty', 'assumed': True,
        **segment_times(start, end, day_start, zone),
        'distance_meters': 0.0, 'start_coordinates': None, 'end_coordinates': None,
        'location': None,
        'reason': 'Assumed off duty ' + kind.replace('_', ' ') + '; driver activity outside this trip is unknown.',
    }


def event_segment(event, start, end, day_offset, day_start, zone, day_date, indexes):
    duration = event['duration_seconds']
    start_fraction = (start - event['start_second']) / duration
    end_fraction = (end - event['start_second']) / duration
    start_meters = event['start_route_meters'] + event['distance_meters'] * start_fraction
    end_meters = event['start_route_meters'] + event['distance_meters'] * end_fraction
    start_coordinates = event['start_coordinates']
    end_coordinates = event['end_coordinates']
    if event['duty_status'] == 'driving':
        index = indexes[event['leg']]
        start_coordinates = position_on_leg(index, start_meters)
        end_coordinates = position_on_leg(index, end_meters)
    return {
        'id': f"{day_date}-{event['id']}", 'event_id': event['id'],
        'activity': event['activity'], 'duty_status': event['duty_status'], 'assumed': False,
        **segment_times(start - day_offset, end - day_offset, day_start, zone),
        'distance_meters': end_meters - start_meters,
        'start_route_meters': start_meters, 'end_route_meters': end_meters,
        'start_coordinates': start_coordinates, 'end_coordinates': end_coordinates,
        'location': event['location'], 'reason': event['reason'],
        'continues_from_previous_day': start > event['start_second'],
        'continues_into_next_day': end < event['end_second'],
    }


def build_daily_logs(events, route, planning):
    if not events:
        return []
    zone = ZoneInfo(planning['log_timezone'])
    departure = datetime.fromisoformat(planning['start_at']).astimezone(UTC)
    day_date = departure.astimezone(zone).date()
    trip_end = events[-1]['end_second']
    indexes = build_route_index(route)
    days = []
    while True:
        day_start = datetime.combine(day_date, time.min, zone).astimezone(UTC)
        day_end = datetime.combine(day_date + timedelta(days=1), time.min, zone).astimezone(UTC)
        day_offset = (day_start - departure).total_seconds()
        end_offset = (day_end - departure).total_seconds()
        if day_offset >= trip_end:
            break  # Ending exactly at midnight does not create another sheet.
        day_seconds = (day_end - day_start).total_seconds()
        date_label = day_date.isoformat()
        segments = []
        if day_offset < 0:
            segments.append(padding_segment('before_trip', 0, -day_offset,
                                            day_start, zone, date_label))
        for event in events:
            start = max(day_offset, event['start_second'])
            end = min(end_offset, event['end_second'])
            if end > start:
                segments.append(event_segment(event, start, end, day_offset, day_start,
                                              zone, date_label, indexes))
        if trip_end < end_offset:
            segments.append(padding_segment('after_trip', trip_end - day_offset, day_seconds,
                                            day_start, zone, date_label))
        totals = dict.fromkeys(STATUSES, 0.0)
        distance = 0.0
        remarks = []
        for segment in segments:
            totals[segment['duty_status']] += segment['duration_seconds']
            distance += segment['distance_meters']
            remarks.append({
                'segment_id': segment['id'], 'event_id': segment['event_id'],
                'at': segment['start_at'], 'coordinates': segment['start_coordinates'],
                'location': segment['location'], 'text': segment['reason'],
                'assumed': segment['assumed'],
            })
        days.append({
            'date': date_label, 'timezone': planning['log_timezone'], 'kind': 'planned',
            'start_at': day_start.astimezone(zone).isoformat(),
            'end_at': day_end.astimezone(zone).isoformat(),
            'day_seconds': day_seconds, 'time_axis': 'elapsed_seconds_since_local_midnight',
            'clock_changes': clock_changes(day_start, day_end, zone),
            'segments': segments, 'totals_seconds': totals,
            'distance_meters': distance, 'miles': distance / METERS_PER_MILE,
            'remarks': remarks,
            'identity': {'driver_name': None, 'carrier_name': None, 'vehicle_number': None,
                         'shipment_number': None, 'home_terminal': None, 'signature': None},
            'note': 'Planned log, not a record of actual duty. Outside-trip off-duty periods are assumed. Stop coordinates are estimates; identity details are unspecified.',
        })
        day_date += timedelta(days=1)
    return days
