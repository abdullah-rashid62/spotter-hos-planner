# Frontend: React trip-planning workspace

The React application collects the assessment inputs, requests a plan from the
Django API, and lets a user inspect the returned route through an itinerary,
interactive map, and calendar-based daily log sheets. It is a presentation and
interaction layer: the backend owns route planning, HOS scheduling, event
timestamps, and log segmentation.

> The interface presents **planned prototype output**, not actual driver
> activity, a certified record of duty status, or a legal-compliance result.
> Estimated rest/fuel locations do not identify verified facilities.

## Stack

- React 19 and React DOM 19
- Vite 7 with the React plugin
- Leaflet 1.9 and OpenStreetMap standard raster tiles
- Lucide icons and Inter font package
- Node's built-in test runner for unit tests; Playwright for browser tests

Exact JavaScript dependencies and scripts are declared in
[package.json](package.json) and locked in `package-lock.json`.

## Run locally

Start the Django API first; follow the [backend setup](../backend/README.md)
and keep it listening at `http://127.0.0.1:8000`.

In a separate PowerShell window, from `frontend/`:

```powershell
npm ci
if (-not (Test-Path .env.local)) {
  Set-Content .env.local 'VITE_API_BASE_URL=http://127.0.0.1:8000'
}
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). If `.env.local` already
exists, preserve any unrelated local settings and ensure it contains the
`VITE_API_BASE_URL` value above. Restart Vite after changing environment
values.

`VITE_API_BASE_URL` is read by `src/api/config.js` and is required; the current
local example points directly to Django. Configure the corresponding Django
CORS allow-list when the frontend and API use different origins.

### Example-trip flow

1. Choose **Try an example** to prefill Chicago, Indianapolis, Atlanta, and
   cycle-used hours.
2. Submit **Plan route**. The browser calls the API configured above; with the
   local backend, ORS credentials are required for uncached search/routing.
3. Inspect the generated itinerary, map, and daily logs. The example-input
   action does not use the test fixture as a generated production result.
4. Change an input to see that existing results are stale, then re-plan. The
   form keeps its values on recoverable errors.

## Product behavior

- **Trip form:** current location, pickup, drop-off, and cycle-used hours.
  Location search returns selectable city/address suggestions; plain text is
  not treated as a confirmed coordinate.
- **Request lifecycle:** inline validation, one in-flight request, cancellation
  on unmount, a timeout, visible service errors, and retry without clearing
  entered values.
- **Results:** route and elapsed-time summaries, a stop itinerary with
  explanations, an interactive route map, and a day-by-day log selector.
- **Selection:** event selection is carried across itinerary, map, and daily
  logs; the selected stop can also move the log view to its day.
- **Responsive layout:** desktop planning workspace and mobile
  Itinerary/Map/Logs tabs, with mobile results defaulting to the itinerary.
- **Daily logs:** 24-hour duty-status graph (23/25 elapsed-hour days are
  represented when a DST transition occurs), status totals, mileage, remarks,
  keyboard-accessible day navigation, full-sheet/print presentation, and
  color-independent labels.
- **Accessibility and motion:** semantic controls, visible focus, skip link,
  reduced-motion checks, keyboard event selection, and map labels/attribution.

These views use backend events and daily-log segments. The frontend adapter
maps API names and units into component props; it does not invent a different
schedule. ORS provides route geometry in `[longitude, latitude]` order; Leaflet
receives `[latitude, longitude]`.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/App.jsx` | Form/result lifecycle, tabs, day and event selection, status, and print view. |
| `src/components/TripForm.jsx` | Four required inputs and example-trip action. |
| `src/components/LocationField.jsx`, `LocationPicker.jsx` | Location text, suggestions, and explicit selection. |
| `src/lib/api.js`, `src/lib/locations.js` | Planning and location-search HTTP requests. |
| `src/api/config.js` | Required `VITE_API_BASE_URL` handling. |
| `src/lib/trip.js` | Backend-response adaptation, coordinate-order conversion, and calendar display helpers. |
| `src/lib/timeline.js` | Input checks and date/duration helpers. |
| `src/components/RouteMap.jsx` | Leaflet route, markers, selection, map controls, and attribution. |
| `src/components/Itinerary.jsx` | Activity timeline and event explanation. |
| `src/components/DailyLog.jsx` | Daily sheet graph, totals, navigation, and print layout. |
| `src/data/mockTrip.js` | Deterministic fixture used by unit tests; not the source of live plans. |
| `tests/` | Unit and Playwright browser tests. |

## Configuration and external services

### API base URL

Set `VITE_API_BASE_URL` to the origin where Django is reachable, for example:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Vite exposes `VITE_*` values to the browser bundle. They are public
configuration, **not secrets**. Never place `ORS_API_KEY`, Django secrets, or
other credentials in frontend environment variables. Keep ORS calls and its
key on the backend.

### Map tiles and attribution

Leaflet renders OpenStreetMap tiles from
`https://tile.openstreetmap.org/{z}/{x}/{y}.png`; the map includes visible
OpenStreetMap attribution and route-provider attribution. The standard
OpenStreetMap tile service is best-effort, has no availability SLA, and has a
usage policy. It is appropriate for this assessment's preview; evaluate a
dedicated tile provider or self-hosting before production or high-traffic use.
See the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Scripts and tests

Run commands from `frontend/`:

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the exact lockfile dependency set. |
| `npm run dev` | Start Vite at `127.0.0.1:5173`. |
| `npm test` | Run Node unit tests in `tests/*.test.js`. |
| `npm run test:browser` | Run the Playwright browser suite. |
| `npm run build` | Create the production bundle in `dist/`. |
| `npm run preview` | Serve the built bundle locally for inspection. |

The ordinary browser suite uses controlled API responses. There is also an
opt-in live flow that needs Django running, a working ORS key, and can consume
provider quota:

```powershell
$env:ROUTTER_LIVE_TEST = "1"
npm run test:browser
Remove-Item Env:ROUTTER_LIVE_TEST
```

The tests cover the browser workflow, location selection, stale results and
retry, event synchronization, print rendering, mobile layout, and DST clock
changes. To validate a frontend change with the smaller checks, run `npm test`
and `npm run build`; use the browser suite for interaction or layout changes.

## Build and deployment notes

`npm run build` emits static files. Serve `dist/` from a static host configured
for SPA entry-point fallback as appropriate, set the production
`VITE_API_BASE_URL` at build time, and configure the Django host/CORS settings
for that origin. The backend must separately receive ORS credentials. Review
the backend production checklist before publishing; the checked-in Django
settings are development settings.

The browser does not save trips or provide login. Keep the route's estimated
fuel/rest markers visibly distinct from verified facilities, and preserve
provider attribution and OSM tile usage requirements if changing map
infrastructure.

## References

- [React Learn](https://react.dev/learn)
- [Vite guide](https://vite.dev/guide/)
- [Vite environment variables](https://vite.dev/guide/env-and-mode)
- [Vite static deployment](https://vite.dev/guide/static-deploy)
- [Leaflet quick start](https://leafletjs.com/examples/quick-start/)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [OpenRouteService API documentation](https://openrouteservice.org/dev/#/api-docs)
- [Backend API and scheduler guide](../backend/README.md)
