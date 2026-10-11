# Backend

Django 6.1 and Django REST Framework provide the trip-planning API. The service obtains two heavy-goods-vehicle routes from openrouteservice (ORS), schedules driver activities, then derives map events and planned daily log sheets from one timeline. Python dependencies are pinned in `requirements.txt`; local storage and the shared provider cache use SQLite by default.

## Run locally

Use Python compatible with Django 6.1. From `backend/` in PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
# Set ORS_API_KEY in .env to your openrouteservice API key.
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

`ORS_API_KEY` is required for location search and routing. `LOCATION_CACHE_SECONDS` and `ROUTE_CACHE_SECONDS` default to `86400` (24 hours); `0` disables retention. Django reads `backend/.env`, while already-set environment variables take precedence. The key stays on the server. Migrations create the database-backed `shared_cache` table. Run `python manage.py check` and `python manage.py test trips` from this directory to validate the backend.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health/` | Basic service health response. |
| `GET /api/locations/search/?q=...` | Up to five ORS address suggestions; query length is 3–255 characters. Throttled to 120 requests per minute per user or client IP. |
| `POST /api/trips/plan/` | Generate the route, activity timeline, and daily sheets. |

Example planning request:

```json
{
  "current_location": {"label": "Chicago, IL", "latitude": 41.8781, "longitude": -87.6298},
  "pickup_location": {"label": "Indianapolis, IN", "latitude": 39.7684, "longitude": -86.1581},
  "dropoff_location": {"label": "Atlanta, GA", "latitude": 33.749, "longitude": -84.388},
  "cycle_used_hours": 24
}
```

Locations must include a selected label and valid coordinates; the API does not silently geocode free text at planning time. `cycle_used_hours` accepts 0–70 hours. The response has `route`, `planning`, `events`, `daily_logs`, elapsed duration, and driver state. GeoJSON coordinates use `[longitude, latitude]` order. Invalid input or unsupported routes return HTTP 400; provider/configuration failures return HTTP 503.

## Planning flow

- `trips/serializers.py` validates input; `trips/views.py` exposes the API.
- `trips/services/routing.py` calls ORS autocomplete and the `driving-hgv` GeoJSON directions endpoint once per nonzero route leg. It retains route geometry, instructions, warnings, and attribution. Search and route results use the shared database cache; provider failures are not cached.
- `trips/services/scheduler.py` takes route distances and durations, tracks driving, duty, rest, cycle hours, and fuel range, and emits activities. `trip_planner.py` converts input hours to the scheduler's seconds and coordinates the services.
- `trips/services/timeline.py` adds timestamps, explanations, and estimated positions along the route. `daily_logs.py` splits those same events at local midnight into four duty statuses, mileage, totals, and remarks. The log response preserves actual elapsed time on daylight-saving transition days and marks time outside the planned trip as assumed off duty.

## Assumptions and limits

The planner models a property-carrying driver with 11 driving hours, a 14-hour window, a 30-minute non-driving break after eight driving hours, a 70-hour/8-day cycle, 10-hour daily rest, and a 34-hour restart. Pickup and drop-off take one on-duty hour each; fueling takes 30 on-duty minutes at a 1,000-mile range boundary. It assumes fresh daily allowances, a full fuel range, constant average speed within each leg, and full daily rests. Because prior daily cycle history is unavailable, used cycle hours remain until a 34-hour restart; an exact rolling eight-day recap is not implemented and the plan may include extra rest.

Departure defaults to tomorrow at 08:00 in `America/Chicago`, a fixed demo log timezone. Fuel and rest positions are route estimates, not verified facilities. ORS uses its default HGV profile without vehicle-specific dimensions. The returned sheets are **planned records**, not actual driver logs or a certified ELD. Missing driver, carrier, and vehicle identity details remain blank.

## Deployment

The checked-in Django settings are for development: they hardcode a secret key, enable `DEBUG`, leave `ALLOWED_HOSTS` empty, and use SQLite. Before exposing the API, configure production secret/host/debug settings, HTTPS, a production application server, and a shared database suitable for all workers. Keep `ORS_API_KEY` server-side, run migrations, and route the frontend's same-origin `/api/` requests to this Django service. The Vite development proxy is not a production proxy.
