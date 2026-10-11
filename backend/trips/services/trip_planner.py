from .scheduler import schedule_trip
from .routing import get_trip_route


def plan_trip(validated_input):
    """Resolve real route legs before generating the shared activity timeline."""
    route = get_trip_route(validated_input)
    route_legs = route['legs']

    # DRF gives us Decimal hours; the scheduler uses fractional seconds.
    cycle_used_seconds = float(validated_input["cycle_used_hours"] * 3600)
    schedule = schedule_trip(route_legs, cycle_used_seconds)

    return {
        "status": "prototype",
        "inputs": dict(validated_input),
        "route": route,
        "events": schedule["events"],
        "elapsed_seconds": schedule["elapsed_seconds"],
        "driver": schedule["driver"],
        # Calendar-based log sheets will be generated in a later step.
        "daily_logs": [],
    }
