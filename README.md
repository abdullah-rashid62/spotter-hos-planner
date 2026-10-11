# Spotter HOS Trip Planner

A full-stack trip-planning assessment project: Django routes and schedules a
property-carrying driver's trip, and a React workspace presents the result as a
map, an explainable itinerary, and printable daily logs.

> **Planning prototype, not a compliance or ELD product.** The schedule is
> based on assessment rules and documented defaults. It does not replace
> current FMCSA guidance, a carrier's compliance process, or a driver's actual
> record of duty status. Estimated route positions are not confirmed truck
> stops or parking locations.

## At a glance

- **Backend:** Django 6.1 / Django REST Framework, Python 3.13, OpenRouteService.
- **Frontend:** React 19, Vite 7, Leaflet, OpenStreetMap raster tiles.
- **One planning response:** ORS route legs feed the scheduler; the resulting
  event timeline is enriched with dates and estimated coordinates, then used
  to build map, itinerary, and daily-log data.
- **Inputs:** current location, pickup, drop-off, and cycle hours already used.
- **Outputs:** route distance and geometry, planned stops and activity events,
  plus one calendar-based log sheet per trip day.
- **No trip persistence or accounts:** generated plans are returned to the
  browser and are not saved as driver records.

## Try it locally

### 1. Start the Django API

In PowerShell:

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Add your own ORS_API_KEY to backend/.env.
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

OpenRouteService credentials are required for location suggestions and route
generation. Keep the key in the backend environment; never put it in the
frontend or commit it.

### 2. Start the React app

In another PowerShell window:

```powershell
cd frontend
npm ci
if (-not (Test-Path .env.local)) {
  Set-Content .env.local 'VITE_API_BASE_URL=http://127.0.0.1:8000'
}
# If .env.local already exists, preserve it and ensure it contains the value above.
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173), choose **Try an example**,
then generate the trip. The example fills the four inputs; submitting it still
calls the configured Django API. When editing the API base URL, restart Vite.

For the exact API contract, configuration, architecture, and caveats, see the
[backend guide](backend/README.md) and [frontend guide](frontend/README.md).

## How a plan is produced

```text
React form
    ├── location suggestions ──> Django ──> ORS geocoding
    └── selected coordinates ─> Django ──> ORS HGV route legs
                                              │
                               HOS scheduler (seconds/meters)
                                              │
                           shared activity timeline
                                ├── calendar log sheets
                                └── React adapter
                                     ├── itinerary
                                     ├── Leaflet map
                                     └── printable daily logs
```

The frontend adapts names and units for display; it does not schedule a trip.
Route geometry from ORS uses `[longitude, latitude]`. The frontend converts it
to Leaflet's `[latitude, longitude]` order.

## Planning model and known limitations

The current implementation models the assessment's ordinary property-carrier
case: an 11-hour driving limit, 14-hour duty window, a qualifying 30-minute
non-driving break after eight hours of driving, 10-hour daily rest, and a
70-hour/8-day cycle threshold. Pickup and drop-off each reserve one hour;
fueling is scheduled at a 1,000-mile route-distance boundary and takes 30
minutes. Non-driving work contributes to cycle usage.

These are **not all verified facts about a specific driver's history or
vehicle**. In particular:

- Daily allowances start fresh after qualifying rest. Cycle usage is retained
  until a 34-hour restart; exact rolling eight-day recap is not implemented.
- The planner uses full daily rests, constant average speed per route leg, and
  a full 1,000-mile initial fuel range.
- Departure is a demo default of tomorrow at 08:00 in `America/Chicago`.
  Daily-log time is shown in that fixed timezone, not a supplied home-terminal
  timezone.
- Hours in each generated sheet that fall outside the planned trip are marked
  as assumed off duty; they are not known driver history.
- Fuel/rest positions are interpolated estimates along route geometry, not
  verified facilities. HGV routing uses ORS defaults; vehicle dimensions and
  other vehicle-specific settings are not supplied.
- The endpoint currently returns `status: "prototype"`. Plans are not saved,
  signed, or certified; driver/carrier/vehicle identifiers are left blank.

Review the [FMCSA hours-of-service materials](https://www.fmcsa.dot.gov/regulations/hours-service)
and [49 CFR Part 395](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395)
before making operational decisions. See the service-specific guides for
implementation details and test commands.

## Validation

Backend, from `backend/`:

```powershell
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test trips
```

Frontend, from `frontend/`:

```powershell
npm test
npm run build
npm run test:browser
```

The opt-in live browser test calls Django and ORS and can consume provider
quota. Set `ROUTTER_LIVE_TEST=1` only when both services and the ORS key are
ready. The regular browser suite uses controlled test responses.

## Repository map

| Path | Responsibility |
| --- | --- |
| `backend/config/` | Django settings and URL configuration. |
| `backend/trips/serializers.py` | Input and location-query validation. |
| `backend/trips/views.py` | Health, location-search, and planning HTTP endpoints. |
| `backend/trips/services/routing.py` | ORS geocoding, HGV routes, caching, and provider errors. |
| `backend/trips/services/scheduler.py` | Provider-independent driving/work/rest event scheduling. |
| `backend/trips/services/timeline.py` | Calendar timestamps, event explanations, and estimated coordinates. |
| `backend/trips/services/daily_logs.py` | Calendar-day segmentation, status totals, mileage, and remarks. |
| `frontend/src/App.jsx` | Form submission, result state, selection, and responsive views. |
| `frontend/src/lib/` | API requests, response adaptation, input validation, and display-time helpers. |
| `frontend/src/components/` | Trip form, location picker, route map, itinerary, and daily-log UI. |
| `playground/` | Learning prototype and its tests; separate from the Django API. |

## Useful references

- [Django documentation](https://docs.djangoproject.com/en/6.1/)
- [Django deployment checklist](https://docs.djangoproject.com/en/6.1/howto/deployment/checklist/)
- [Django REST Framework serializers](https://www.django-rest-framework.org/api-guide/serializers/)
- [React Learn](https://react.dev/learn)
- [Vite guide](https://vite.dev/guide/)
- [OpenRouteService API](https://openrouteservice.org/dev/#/api-docs)
- [Leaflet quick start](https://leafletjs.com/examples/quick-start/)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [FMCSA hours-of-service resources](https://www.fmcsa.dot.gov/regulations/hours-service)
- [49 CFR Part 395](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395)
