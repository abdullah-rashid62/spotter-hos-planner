# Backend: Django planning API

The backend validates trip inputs, asks OpenRouteService (ORS) for locations
and two heavy-goods-vehicle route legs, schedules driver activity, and returns
the enriched timeline and daily logs in one response. Routing, scheduling,
calendar enrichment, and log preparation are separate services so the
scheduler can operate on route data without depending on HTTP or ORS.

> **Scope:** this is a planning prototype, not an ELD, legal-compliance
> determination, or record of actual driver activity. The response deliberately
> uses `status: "prototype"` and identifies assumptions and estimated
> locations.

## Stack and runtime

- Python 3.13
- Django 6.1.2
- Django REST Framework 3.18.3
- SQLite as Django's configured local database; trip plans are not persisted.
- Django local-memory cache for ORS location and route responses.
- ORS geocoding and `driving-hgv` directions for real route data.

Pinned and bounded Python package versions are listed in
[requirements.txt](requirements.txt). There are no authentication or saved-trip
models in the current API.

## Local setup (Windows PowerShell)

From the repository root:

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `backend/.env` and add an ORS key:

```dotenv
ORS_API_KEY=your_own_key
LOCATION_CACHE_SECONDS=86400
ROUTE_CACHE_SECONDS=86400
```

Then initialize Django and start the development server:

```powershell
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

The frontend must use `VITE_API_BASE_URL=http://127.0.0.1:8000` while this
server is running. The backend reads `backend/.env`; an environment variable
already defined by the process takes precedence over values loaded from that
file. Keep `.env` private. `ORS_API_KEY` is sent only from the backend to ORS.

### Configuration

| Setting | Default | Meaning |
| --- | --- | --- |
| `ORS_API_KEY` | Empty | Required for uncached geocoding and routing requests. |
| `LOCATION_CACHE_SECONDS` | `86400` | Location-suggestion cache retention; `0` disables retention. |
| `ROUTE_CACHE_SECONDS` | `86400` | Route cache retention; `0` disables retention. |
| `ORS_TIMEOUT_SECONDS` | `20` (in settings) | Per-request provider timeout; currently configured in code. |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated Django host allow-list. |

The Django cache backend is `LocMemCache`: its entries are process-local and
are not shared between workers or deployments. SQLite is configured for local
Django development, but the planner does not write trips to it.

## HTTP API

All endpoints are under `/api/`. The planning endpoint accepts JSON; location
search accepts a query parameter.

| Method and path | Purpose | Typical response |
| --- | --- | --- |
| `GET /api/health/` | Basic process health check. | `200` with `{"status":"ok","service":"routter-hos"}`. |
| `GET /api/locations/search/?q=Chicago` | Return up to five ORS autocomplete matches for explicit user selection. | `200` with a `results` array. |
| `POST /api/trips/plan/` | Route and schedule a trip, then return events and daily logs. | `200` with route, planning, events, and `daily_logs`. |

Location queries must be 3–255 characters. Search is throttled at 120 requests
per minute. A suggestion is a candidate for the user to choose; the planning
endpoint receives the selected label and coordinates and does not geocode
free-form text again.

### Example request

```json
{
  "current_location": {
    "label": "Chicago, IL",
    "latitude": 41.8781,
    "longitude": -87.6298
  },
  "pickup_location": {
    "label": "Indianapolis, IN",
    "latitude": 39.7684,
    "longitude": -86.1581
  },
  "dropoff_location": {
    "label": "Atlanta, GA",
    "latitude": 33.749,
    "longitude": -84.388
  },
  "cycle_used_hours": 24
}
```

Each location needs a non-empty label, finite latitude from -90 through 90,
and finite longitude from -180 through 180. `cycle_used_hours` accepts 0
through 70 with at most two decimal places. The API accepts hours and explicitly
converts them to fractional seconds at the scheduler boundary.

### Response shape

The full response is generated for each request. The following is an
orientation, not a complete serialized response:

```json
{
  "status": "prototype",
  "inputs": {},
  "route": {
    "source": "openrouteservice",
    "profile": "driving-hgv",
    "locations": {},
    "legs": [],
    "geometry": {"type": "MultiLineString", "coordinates": []},
    "distance_meters": 0,
    "duration_seconds": 0
  },
  "planning": {
    "start_at": "ISO-8601 timestamp",
    "log_timezone": "America/Chicago",
    "departure_policy": "tomorrow_at_08:00_in_log_timezone",
    "assumptions": []
  },
  "events": [],
  "elapsed_seconds": 0,
  "daily_logs": []
}
```

Important details:

- Route coordinates are GeoJSON order: `[longitude, latitude]`.
- Scheduler event times are continuous elapsed seconds; the enriched event also
  contains ISO-8601 start/end timestamps, coordinates, reason text, and a
  stable response-local ID.
- Daily logs include calendar date, timezone, graph segments, status totals,
  miles, remarks, and unspecified driver/carrier/vehicle identity fields.
- A day may contain 23 or 25 elapsed hours at daylight-saving transitions.
  The log representation includes clock-change metadata rather than pretending
  every calendar day is exactly 24 hours.
- `400` indicates invalid input or a route that could not be supported;
  provider unavailability and request limits are surfaced as `503` responses.
  Provider response bodies and credential-bearing URLs are not forwarded to
  callers.

## Request-to-response flow

1. `TripInputSerializer` validates coordinates, labels, and cycle hours.
2. `get_trip_route` requests the current-to-pickup and pickup-to-drop-off legs
   separately using ORS `driving-hgv`. Each leg preserves its own geometry,
   duration, distance, steps, and warnings.
3. `schedule_trip` receives only route-leg totals and cycle usage in seconds.
   Its calculations use fractional seconds and meters.
4. `enrich_timeline` adds the fixed demo calendar, explanations, and estimated
   event positions along each route leg.
5. `build_daily_logs` splits those same enriched events at local midnight,
   calculates status totals and mileage, and adds assumed off-duty padding for
   uncovered portions of each trip day.
6. The React adapter converts units and coordinate order for rendering; it
   does not recalculate the schedule.

## Scheduler model and defaults

These describe the current implementation, not extra regulatory guarantees.
The root README summarizes the project scope and links to the public
regulatory references. Local assessment notes are intentionally Git-ignored
and are not required to understand or run the backend.

| Modeled behavior | Current implementation |
| --- | --- |
| Driver and cycle | Property-carrying case; 70-hour/8-day cycle limit. |
| Driving | Up to 11 hours since qualifying daily rest and within a 14-hour window. |
| Driving break | After eight hours of driving, require 30 continuous minutes without driving. On-duty pickup/drop-off/fueling can satisfy this period. |
| Daily rest | Ten consecutive hours off duty restore daily allowances. Midnight alone does not reset them. |
| Cycle availability | Supplied cycle usage is retained until a 34-hour restart. Exact rolling eight-day recap and earlier duty history are unavailable, so extra rest may be scheduled. A restart is the implementation's strategy, not a claim that it is the only way to regain cycle availability. |
| Work | Pickup and drop-off are each one hour on duty. Work counts toward cycle usage; work may still be recorded after the driving threshold blocks additional driving. |
| Fuel | A 30-minute on-duty stop is scheduled at the 1,000-mile boundary shared across both route legs; the initial range is assumed full. |
| Speed | Constant average speed is derived independently for each ORS leg. Segment distance is speed multiplied by driving time. |
| Rest strategy | Full daily rests; split-sleeper pairings are not scheduled. |
| Calendar | Departure defaults to tomorrow at 08:00 in `America/Chicago`, independent of a supplied home terminal. |

The planner does not model adverse conditions, vehicle-specific dimensions,
confirmed truck stops, actual prior daily logs, or a complete rolling-cycle
recap. Scheduled fuel/rest coordinates are interpolated positions on the route
geometry, not verified services or safe stopping locations. Outside-trip log
segments are clearly marked as assumed off duty; they are not evidence of
actual duty status.

## Code map

| File | Responsibility |
| --- | --- |
| `config/settings.py` | Local Django settings, ORS environment values, cache, and host configuration. |
| `config/urls.py`, `trips/urls.py` | API URL routing. |
| `trips/serializers.py` | Request validation. |
| `trips/views.py` | HTTP views and location-search throttle. |
| `trips/services/routing.py` | ORS HTTP requests, response validation, caching, and provider-error mapping. |
| `trips/services/scheduler.py` | HOS event scheduler, counters, limits, and route-distance fueling boundaries. |
| `trips/services/timeline.py` | Timezone-aware event timestamps, explanations, and route-position interpolation. |
| `trips/services/daily_logs.py` | Calendar segmentation, clock changes, totals, miles, and remarks. |
| `trips/services/trip_planner.py` | Orchestrates routing, scheduling, and log generation. |
| `trips/test_*.py` | Scheduler, routing, timeline, location, and daily-log tests. |

## Tests and local checks

From `backend/`:

```powershell
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test trips
```

The backend suite exercises fractional time/distance conservation, fuel range
across the pickup boundary, break-credit handling, arrivals at exhausted
limits, zero-distance legs, ORS errors and response validation, DST/calendar
splitting, and daily-log totals. Tests do not establish full legal compliance.

## Production readiness

The checked-in settings are for development and **must not be deployed as-is**.
In particular, Django `DEBUG` is on and a development `SECRET_KEY` is present
in source. Before deployment, configure a unique secret outside version
control, disable debug, set production hosts and allowed origins, enable HTTPS
and secure-cookie/HSTS settings, use a production application server and
deployment-grade database/cache, and monitor/limit external-provider usage.
Review Django's [deployment checklist](https://docs.djangoproject.com/en/6.1/howto/deployment/checklist/).

The app currently has no user authentication, durable trip storage, background
job queue, or operational audit trail. Do not store real driver records or
treat generated plans as certified logs.

## Further reading

- [Django 6.1 documentation](https://docs.djangoproject.com/en/6.1/)
- [Django REST Framework serializer guide](https://www.django-rest-framework.org/api-guide/serializers/)
- [OpenRouteService API documentation](https://openrouteservice.org/dev/#/api-docs)
- [FMCSA hours-of-service resources](https://www.fmcsa.dot.gov/regulations/hours-service)
- [49 CFR Part 395](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395)
