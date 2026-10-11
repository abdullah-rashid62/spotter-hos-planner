from .scheduler import schedule_trip
from .routing import get_trip_route
from .timeline import enrich_timeline, planning_metadata
from .daily_logs import build_daily_logs


def plan_trip(validated_input, *, now=None):
    """Resolve real route legs before generating the shared activity timeline."""
    planning = planning_metadata(now)
    route = get_trip_route(validated_input)
    route_legs = route['legs']

    # DRF gives us Decimal hours; the scheduler uses fractional seconds.
    cycle_used_seconds = float(validated_input["cycle_used_hours"] * 3600)
    schedule = schedule_trip(route_legs, cycle_used_seconds)
    events = enrich_timeline(schedule['events'], route, planning)
    planning['end_at'] = events[-1]['end_at']

    return {
        "status": "prototype",
        "inputs": dict(validated_input),
        "route": route,
        "planning": planning,
        "events": events,
        "elapsed_seconds": schedule["elapsed_seconds"],
        "driver": schedule["driver"],
        "daily_logs": build_daily_logs(events, route, planning),
    }
