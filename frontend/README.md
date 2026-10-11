# Spotter frontend

React trip planner connected to Django's `POST /api/trips/plan/`. The backend
owns routing, scheduling, timestamps and daily-log splitting. The frontend
adapts the response for display; it does not recalculate the duty schedule.

## Run locally

Start Django in one terminal (set `ORS_API_KEY` in ignored `backend/.env`):

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Start React in another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` requests to Django on port 8000.
The example action fills the four inputs; Generate trip plan requests a real
route. No trip is generated automatically on page load.

`npm run build` creates `dist/`. Production hosting must serve the frontend and
proxy `/api/` to Django on the same origin; Vite's development proxy is not part
of the static build. Keep the ORS key on the backend, never in a `VITE_` variable.
Node 22.12+ is supported. Production hosting/configuration is separate work.

## Behavior and data

- `src/lib/api.js` handles the request, provider errors and field validation.
  Duplicate submissions are blocked and requests time out after two minutes.
- Inputs survive errors/retries. Editing inputs marks an existing result stale;
  edits during a pending request also remain stale when its result arrives.
- `src/lib/trip.js` maps units, GeoJSON longitude/latitude coordinates, and
  backend log segments into display fields. Event IDs link map, itinerary and
  daily-log selection. Daily totals and mileage come from the backend.
- Leaflet renders both route legs and estimated stop positions over attributed
  OpenStreetMap tiles. Provider attribution is displayed too. Tile failures
  retain route overlays, selection and fit controls with a visible explanation.
- The resolved search matches appear above the route. Stops are estimates, not
  verified truck facilities. City suggestions remain a small local list.
- Times use the backend log timezone, independent of the browser's timezone.
  DST sheets use their actual 23/25 elapsed hours. Repeated hours have distinct
  graph labels with an explanation showing CDT/CST; spring's skipped hour is
  omitted. Off-duty padding is dashed and labeled as assumed.
- Mobile opens with the form, then switches to Itinerary after generation.
  Logs keep a contained horizontal graph and fixed duty labels.
- Print logs prints every returned day, including remarks and missing identity
  fields, and supports the browser's Save as PDF. These are planned sheets,
  not records of actual duty or a certified ELD.

The old `mockTrip` and `buildDays` remain as isolated historical unit-test
fixtures; the application no longer uses them for results or daily sheets.

## Validation

```powershell
npm test
npm run build
npm run test:browser
```

Browser tests use installed Google Chrome through Playwright and start Vite
automatically. Normal tests intercept the API with fixtures produced by the real
backend with mocked routing. They cover selection, desktop/mobile layouts,
printing, pending edits, retries, provider/network errors and DST rendering.
Screenshots and a printable PDF are written to ignored `.preview/`.

Regenerate fixtures from the repository root:

```powershell
.\backend\.venv\Scripts\python.exe frontend/tests/fixtures/generate.py
```

Optional live browser check (Django must be running; consumes ORS quota):

```powershell
$env:SPOTTER_LIVE_TEST = '1'
npm run test:browser -- tests/browser/live.spec.js
Remove-Item Env:SPOTTER_LIVE_TEST
```

Live verification on 2026-10-11 successfully generated Chicago → Indianapolis
→ Atlanta through the browser/Vite/Django/ORS path and matched API mileage and
daily sheets to the displayed results. Tests do not establish full compliance.
