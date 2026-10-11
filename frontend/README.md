# Frontend

The React 19 and Vite 7 client turns the Django planning response into a route map, stop itinerary, and printable multi-day log sheets. It uses Leaflet with OpenStreetMap tiles, Lucide icons, and Inter. The backend owns routing, HOS scheduling, timestamps, and daily log calculations; the browser adapts units and renders the response.

## Run locally

Start the [backend](../backend/README.md) on `127.0.0.1:8000`, including its `ORS_API_KEY`. Then, from `frontend/`:

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. `vite.config.js` proxies `/api` to Django on port 8000. The frontend has no required environment variables; never put the ORS key in a `VITE_` variable. Node 22.12+ is suitable for this Vite version.

## User flow and architecture

The form asks for current location, pickup, drop-off, and cycle hours used. Users can select address suggestions, choose a point on a map, or enter coordinates; the example action fills sample city points. Submitting calls `POST /api/trips/plan/`. Results show route and elapsed-time summaries, a map, scheduled activities with reasons, and daily sheets. Stops, map markers, and log segments share event IDs for selection. On mobile, the workspace switches among Stops, Map, and Daily logs. Input edits mark previous results out of date; errors preserve entered values for retry.

| Code | Responsibility |
| --- | --- |
| `src/App.jsx` | Form/result state, tabs, selected event, and responsive workflow. |
| `src/components/TripForm.jsx`, `LocationField.jsx`, `LocationPicker.jsx` | Input validation, ORS-backed suggestions, and map point selection. |
| `src/lib/api.js`, `src/lib/locations.js` | Same-origin API requests and location lookup. |
| `src/lib/trip.js`, `src/lib/timeline.js` | Response-to-display adaptation, unit conversion, and time formatting. |
| `src/components/RouteMap.jsx` | ORS route geometry and estimated event markers on Leaflet/OpenStreetMap. |
| `src/components/Itinerary.jsx`, `DailyLog.jsx` | Activity explanations and printable paper-style daily sheets. |

The map fits the returned route and shows ORS and OpenStreetMap attribution. Estimated fuel/rest markers are not verified truck stops. Logs show four duty-status rows, totals, mileage, and remarks, with day navigation and print styling. They handle 23- and 25-hour daylight-saving days using backend timestamps and the configured log timezone. Printed sheets are plans, not actual duty records or a certified ELD.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite with the local API proxy. |
| `npm test` | Run Node unit tests. |
| `npm run test:browser` | Run Playwright browser tests (requires an installed browser). |
| `npm run build` | Create a production build in `dist/`. |
| `npm run preview` | Preview the production build locally. |

## Deployment

Build with `npm run build` and serve `dist/` as static files. Configure the host or reverse proxy to send same-origin `/api/` requests to the deployed Django backend; Vite's proxy only runs during local development. The browser also needs access to OpenStreetMap tiles. Hosting and public URLs are not configured in this repository.
