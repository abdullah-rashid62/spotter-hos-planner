# Backend

Install `requirements.txt` in a Python virtual environment. Copy `.env.example`
to `.env`, set `ORS_API_KEY`, then run `python manage.py runserver` from this
directory. `.env` is ignored by Git. Deployment environment variables override
the local file.

## Plan a trip

`POST /api/trips/plan/` with JSON:

```json
{
  "current_location": "Chicago, IL",
  "pickup_location": "Indianapolis, IN",
  "dropoff_location": "Atlanta, GA",
  "cycle_used_hours": 24
}
```

The backend geocodes each distinct location with OpenRouteService, then requests
each leg with the `driving-hgv` profile. Use full addresses or city/state/country
to reduce ambiguity. The first geocoding match is used and returned under
`route.locations` so callers can display the resolved locations.

The response includes:

- `route.source`, `profile`, `attribution`, resolved `locations`, and `note`.
- Two `route.legs` with meters, seconds, GeoJSON LineString geometry,
  provider navigation `steps`, and provider `warnings`.
- Combined `route.geometry` as a GeoJSON MultiLineString; coordinates are
  **[longitude, latitude]**, not Leaflet's latitude/longitude order.
- Route distance and driving duration totals. `elapsed_seconds` also includes
  handling, breaks, and rest from the scheduler.
- A shared `events` timeline with elapsed seconds and route meters, IDs,
  offset-aware `start_at` / `end_at`, start/end coordinates in longitude/latitude
  order, location descriptions, and reasons for scheduled activities.
- `planning` metadata with departure, log timezone, and disclosed assumptions.
  Departure defaults to tomorrow at 08:00 in America/Chicago. This is a fixed
  demo log timezone, not a supplied or inferred home-terminal timezone.
  Event IDs are stable within a generated plan and its derived logs, not global
  identifiers across different trips.
- `daily_logs` derived from those events: dates, segments, status totals,
  distance/miles, remarks, and blank identity fields. These are planned sheets,
  not records of actual driver activity.

Event positions use distance along each route leg's polyline, normalized to its
provider distance. Handling uses the routed endpoint, which may differ from the
geocoded address. Rest/fuel positions are estimates, not verified facilities.
Calendar timestamps advance in UTC before conversion to the log timezone, so
elapsed driving/rest durations remain correct across daylight-saving changes.

## Daily-log response contract

Each sheet includes `date`, `timezone`, `start_at`, `end_at`, `day_seconds`,
`segments`, `totals_seconds`, `distance_meters`, `miles`, and `remarks`.
The four totals use `off_duty`, `sleeper`, `driving`, and `on_duty`; the scheduler
currently classifies full rests as off duty, so sleeper totals remain zero.
Missing driver/carrier/vehicle/shipment/home-terminal/signature fields are null.

Timeline event `start_second` / `end_second` values are relative to departure.
Log segment values with those names are **elapsed seconds since that day's local
midnight**, as stated in `time_axis`. Segments carry offset-aware timestamps,
distance and coordinates at the split boundaries, and an `event_id` linking to
the original timeline event. Multiple days can reference the same event.
Fractional seconds/meters are preserved; timestamps have microsecond precision.

Uncovered time before departure and after completion is marked `assumed: true`,
with `event_id: null` and explicit off-duty remarks. Padding is for daily sheets
only: it does not change scheduler allowances, trip duration, or map events.
There is no extra sheet when the trip ends exactly at midnight.

Totals sum to `day_seconds`, normally 86,400. America/Chicago daylight-saving
transition days contain 82,800 or 90,000 elapsed seconds. `clock_changes` gives
each offset transition's timestamp, day-relative elapsed second and offset
change. A renderer must label skipped/repeated hours explicitly, using the
timestamps/offsets and elapsed axis; it must not stretch these days onto a
normal 24-hour axis or silently drop/duplicate an hour. The current mock frontend
does not consume this contract yet.

Requests have a 20-second timeout per provider call. Validation and unsupported
routes return 400; unavailable/configuration/quota failures return 503 with a
safe message. Provider bodies and authentication values are not returned.

## Remaining limitations

`status` remains `prototype`. Backend log data is implemented; real-data frontend
rendering and printable sheets still need integration. Fuel/rest events
are not verified truck facilities. HGV routing uses provider defaults without
specific vehicle dimensions; no claim of vehicle-specific clearance is made.
The scheduler assumes fresh daily allowances, a full fuel range, 30-minute
fueling, constant average leg speed, full rests, and a conservative cycle
restart policy rather than exact rolling recap.

The frontend is not connected by this backend integration. Render the returned
attribution alongside route information when connecting the map.

## Validation

Run `python manage.py test trips` and `python manage.py check`. Automated tests
mock the provider and do not consume API quota. Coverage includes scheduler
limits, fuel boundaries across legs, fractional totals, route interpolation,
calendar splits, assumed padding, event links, and both DST transitions.
Live verification of the earlier routing integration on 2026-10-11
used Chicago → Indianapolis → Atlanta: the full endpoint returned HTTP 200,
1,111,748.1 meters, 58,966.6 driving seconds and 102,166.6 elapsed seconds.
Provider routes and times may change.

References: https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/requests-and-return-types
and https://openrouteservice.org/restrictions/ . Hosted driving requests are
currently limited to 6,000 km per request; provider restrictions may change.
