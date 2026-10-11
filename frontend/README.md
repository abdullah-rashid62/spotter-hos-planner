# Spotter frontend

React preview using a fixed Chicago → Indianapolis → Atlanta trip. The backend
is being developed separately: this application makes **no API requests** and
does not calculate routes or HOS schedules from submitted inputs.

## Run

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173).
Node 22.12+ is supported. `npm run build` creates `dist/`.

## Preview behavior

- The example is loaded immediately to make visual review easy.
- The form validates four inputs and demonstrates submission/loading behavior.
  Submissions preserve the fixed sample and explicitly explain that limitation.
- The map uses Leaflet and attributed OpenStreetMap tiles. Tiles require internet
  access; mock geometry and stop selection still work if tiles fail.
- Desktop shows the map with itinerary/log tabs. Mobile starts with the itinerary
  and offers Map / Daily logs views and Edit Trip.
- Itinerary selection highlights a map marker when that event has a stop marker;
  the selection also persists in the log view. Driving events pan to a sample
  location when needed. Day selection exposes the corresponding calendar sheet.
- Print logs opens the browser print dialog for both days, suitable for Save as PDF.

## Mock data and integration

`src/data/mockTrip.js` owns the illustrative route, stop coordinates, and events.
`src/lib/timeline.js` splits that timeline into daily display segments and prorates
driving miles at midnight. It is a rendering utility, not a scheduler.

The fixture starts October 12, 2026, at 06:00 in fixed CDT (UTC−05:00), independent
of browser timezone. Before/after-trip off-duty padding is explicitly assumed and
drawn with dashed lines. Missing driver/carrier/vehicle information is labeled.
These are mock presentation choices, not approved production time defaults.

When the API is ready, replace the fixture boundary with an adapter for backend
events, geometry, locations, timestamps, and log metadata. Replace fixed summary
and route labels at the same time. Do not move routing or HOS scheduling into React.
Real geocoding, timezone/DST handling, identity fields, and regulatory verification
remain backend/integration work. The city suggestions here are a small local list.

## Validation

```powershell
npm test
npm run build
npm run test:browser
```

Browser checks use installed Google Chrome through Playwright and start Vite
automatically. Screenshots and a sample PDF are written to ignored `.preview/`.
Tests cover midnight splitting, mileage/totals, form validation, linked selection,
mobile overflow, printing, and map tile failures. They do not establish compliance.
