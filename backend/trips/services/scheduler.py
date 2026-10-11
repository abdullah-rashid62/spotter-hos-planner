"""Learning scheduler using fractional seconds and meters.

Assumptions: fresh daily allowances, full fuel range, 30-minute fueling,
approximately constant speed per leg, and full daily rests (no split sleeper).
Initial cycle history is unknown: supplied seconds are retained until a
34-hour restart. This conservative policy can overestimate rest; exact
rolling-eight-day recap and calendar log rendering are not implemented.
"""
from math import isfinite

# Keep fractional seconds/meters during calculations; round only for display.
# Tolerances handle tiny floating-point leftovers at time/distance boundaries.
TIME_EPSILON = 0.000001
DISTANCE_EPSILON = 0.000001
FUEL_RANGE_METERS = 1_609_344  # Exactly 1,000 miles.
FUEL_SECONDS = 1800  # 30 minutes; planning assumption.
BREAK_SECONDS = 1800
DAILY_REST_SECONDS = 10 * 3600
RESTART_SECONDS = 34 * 3600
CYCLE_LIMIT_SECONDS = 70 * 3600
DRIVING_LIMIT_SECONDS = 11 * 3600
WINDOW_LIMIT_SECONDS = 14 * 3600
BREAK_LIMIT_SECONDS = 8 * 3600


def initialize_driver(cycle_used):
    # Reject infinity/NaN as well as inputs outside the assessment's range.
    # Input is seconds, including any fractional part.
    if not isfinite(cycle_used) or not 0 <= cycle_used <= CYCLE_LIMIT_SECONDS:
        raise ValueError("Initial cycle seconds must be between 0 and 252000.")
    return {
        # All on-duty work, INCLUDING driving, counts toward the cycle.
        "cycle_used": cycle_used,
        # Driving accumulated since the last qualifying daily rest.
        "driving_used": 0,
        # Elapsed time in the current driving window, including short breaks.
        "window_elapsed": 0,
        # Driving accumulated since a continuous 30-minute non-driving period.
        "driving_since_break": 0,
        # Includes work and rest, but any driving interrupts this streak.
        "non_driving_streak": 0,
        # Includes only uninterrupted rest; on-duty work interrupts it too.
        "rest_streak": 0,
    }


def drive(driver, seconds):
    # This function records an activity; it does not decide if it is allowed.
    # schedule_trip() checks the available allowance before calling it.
    driver["cycle_used"] += seconds
    driver["driving_used"] += seconds
    driver["window_elapsed"] += seconds
    driver["driving_since_break"] += seconds
    # Driving ends both a non-driving break and a continuous rest period.
    driver["non_driving_streak"] = 0
    driver["rest_streak"] = 0
    return driver


def record_non_driving(driver, seconds):
    # Adjacent non-driving activities can qualify together for a break.
    # Example: 15 minutes of work + 15 minutes off duty qualifies, provided
    # no driving happens between them. Only the break-driving counter resets.
    driver["non_driving_streak"] += seconds
    if driver["non_driving_streak"] >= BREAK_SECONDS - TIME_EPSILON:
        driver["driving_since_break"] = 0


def on_duty(driver, seconds):
    # Here "on_duty" specifically means on-duty NOT driving (fuel/handling).
    # Work consumes cycle time and window time, but not driving allowance.
    driver["cycle_used"] += seconds
    driver["window_elapsed"] += seconds
    driver["rest_streak"] = 0
    # Loading can satisfy a short driving break, but cannot be daily rest.
    record_non_driving(driver, seconds)
    return driver


def off_duty(driver, seconds):
    # An ordinary short break does not pause the 14-hour window.
    # Rest does not add cycle seconds or driving seconds.
    driver["window_elapsed"] += seconds
    driver["rest_streak"] += seconds
    record_non_driving(driver, seconds)
    if driver["rest_streak"] >= DAILY_REST_SECONDS - TIME_EPSILON:
        # Full daily rest restores daily allowances, not the cycle allowance.
        driver["driving_used"] = 0
        # Fresh window ready to begin when duty resumes.
        driver["window_elapsed"] = 0
    if driver["rest_streak"] >= RESTART_SECONDS - TIME_EPSILON:
        # This longer rest also satisfied the 10-hour condition above.
        driver["cycle_used"] = 0
    return driver


def available_driving_seconds(driver):
    # The smallest remaining allowance decides how long we can drive.
    cycle_remaining = CYCLE_LIMIT_SECONDS - driver["cycle_used"]
    driving_remaining = DRIVING_LIMIT_SECONDS - driver["driving_used"]
    window_remaining = WINDOW_LIMIT_SECONDS - driver["window_elapsed"]
    break_remaining = BREAK_LIMIT_SECONDS - driver["driving_since_break"]

    available = min(
        cycle_remaining, driving_remaining, window_remaining, break_remaining
    )
    return max(0, available)


def validate_legs(legs):
    # Keep input checking separate so the scheduling loop is easier to read.
    if len(legs) != 2:
        raise ValueError("Supply exactly two route legs.")
    if legs[0]["type"] != "drive_to_pickup":
        raise ValueError("The first leg must go to pickup.")
    if legs[1]["type"] != "drive_to_dropoff":
        raise ValueError("The second leg must go to drop-off.")

    for leg in legs:
        seconds = leg["duration_seconds"]
        meters = leg["distance_meters"]
        if not isfinite(seconds) or seconds < 0:
            raise ValueError("Duration must be finite and nonnegative.")
        if not isfinite(meters) or meters < 0:
            raise ValueError("Distance must be finite and nonnegative.")
        if seconds == 0 and meters != 0:
            raise ValueError("A zero-duration leg must have zero distance.")
        if meters == 0 and seconds != 0:
            raise ValueError("A zero-distance leg must have zero duration.")


def add_event(trip, activity, duty_status, seconds, leg_type, distance=0, reason_codes=None):
    # All trip progress lives in one dictionary. No nested function/nonlocal.
    # Updating its contents changes the same dictionary the caller holds.
    if seconds <= 0:
        raise ValueError("Scheduled activities must advance time.")

    driver = trip["driver"]
    if duty_status == "driving":
        drive(driver, seconds)
    elif duty_status == "on_duty":
        on_duty(driver, seconds)
    else:
        off_duty(driver, seconds)

    start_second = trip["elapsed_seconds"]
    start_distance = trip["distance_meters"]
    event = {
        "activity": activity,
        "duty_status": duty_status,
        "leg": leg_type,
        "reason_codes": reason_codes or [],
        "start_second": start_second,
        "end_second": start_second + seconds,
        "start_route_meters": start_distance,
        "end_route_meters": start_distance + distance,
        # Save a snapshot so later changes do not rewrite previous events.
        "driver_after": driver.copy(),
    }
    trip["events"].append(event)
    trip["elapsed_seconds"] += seconds
    trip["distance_meters"] += distance


def required_rest(driver):
    # Return the reason and remaining rest duration, or (None, 0).
    # Check the longest rest first because it also satisfies shorter breaks.
    if driver["cycle_used"] >= CYCLE_LIMIT_SECONDS - TIME_EPSILON:
        seconds = RESTART_SECONDS - driver["rest_streak"]
        return "cycle_restart", seconds

    driving_limit_reached = driver["driving_used"] >= DRIVING_LIMIT_SECONDS - TIME_EPSILON
    window_limit_reached = driver["window_elapsed"] >= WINDOW_LIMIT_SECONDS - TIME_EPSILON
    if driving_limit_reached or window_limit_reached:
        seconds = DAILY_REST_SECONDS - driver["rest_streak"]
        return "daily_rest", seconds

    if driver["driving_since_break"] >= BREAK_LIMIT_SECONDS - TIME_EPSILON:
        seconds = BREAK_SECONDS - driver["non_driving_streak"]
        return "driving_break", seconds

    return None, 0


def schedule_trip(legs, cycle_used):
    """Schedule route legs with cycle_used in seconds; return seconds and meters.

    Fractional values are preserved using an average speed for each leg.
    """
    # Read this function first: it describes the journey in order.
    validate_legs(legs)
    driver = initialize_driver(cycle_used)
    trip = {
        "driver": driver,
        "events": [],
        "elapsed_seconds": 0,
        "distance_meters": 0,
    }
    # Fuel range is shared across both legs; pickup does not refill the tank.
    meters_since_fuel = 0

    for leg in legs:
        leg_type = leg["type"]
        # Keep the original precision of route inputs.
        remaining_seconds = leg["duration_seconds"]
        # Assume a constant average speed for this leg, in meters per second.
        speed = 0
        if remaining_seconds > 0:
            speed = leg["distance_meters"] / remaining_seconds

        while remaining_seconds > TIME_EPSILON:
            # 1. Fuel if due. Fueling is work, so do it before a long rest.
            if meters_since_fuel >= FUEL_RANGE_METERS - DISTANCE_EPSILON:
                add_event(trip, "fuel", "on_duty", FUEL_SECONDS, leg_type)
                meters_since_fuel = 0
                continue

            # 2. If a driving limit blocks us, take the appropriate rest.
            # continue means restart this loop and recheck the updated state.
            rest_reason, rest_seconds = required_rest(driver)
            if rest_reason is not None:
                # Capture the blocking allowances before rest resets them.
                reason_codes = []
                for field, limit, code in (
                    ('cycle_used', CYCLE_LIMIT_SECONDS, 'cycle_limit'),
                    ('driving_used', DRIVING_LIMIT_SECONDS, 'daily_driving_limit'),
                    ('window_elapsed', WINDOW_LIMIT_SECONDS, 'duty_window_limit'),
                    ('driving_since_break', BREAK_LIMIT_SECONDS, 'driving_break_limit'),
                ):
                    if driver[field] >= limit - TIME_EPSILON:
                        reason_codes.append(code)
                add_event(trip, rest_reason, "off_duty", rest_seconds, leg_type,
                          reason_codes=reason_codes)
                continue

            # 3. Drive until arrival, a driving limit, or a fueling stop.
            # Speed is meters per second. Validation ensures positive distance
            # whenever there is driving time remaining.
            distance_until_fuel = FUEL_RANGE_METERS - meters_since_fuel
            seconds_until_fuel = distance_until_fuel / speed
            allowed_seconds = available_driving_seconds(driver)
            driving_seconds = min(remaining_seconds, allowed_seconds, seconds_until_fuel)
            # Time already respects the fuel boundary, so no distance cap or
            # integer rounding is needed. Distance = speed multiplied by time.
            distance = speed * driving_seconds

            add_event(trip, "drive", "driving", driving_seconds, leg_type, distance)
            remaining_seconds = max(0, remaining_seconds - driving_seconds)
            meters_since_fuel += distance

        # 4. We arrived. Work can continue even when driving is blocked.
        # This uninterrupted hour also satisfies the 30-minute break.
        if leg_type == "drive_to_pickup":
            add_event(trip, "pickup", "on_duty", 3600, leg_type)
        else:
            add_event(trip, "dropoff", "on_duty", 3600, leg_type)

    return trip
