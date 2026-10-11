import { apiUrl } from "../api/config";
export function locationText(value) {
  return typeof value === "string" ? value : value?.label || "";
}

export function validLocation(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.label === "string" &&
    Boolean(value.label.trim()) &&
    value.label.length <= 255 &&
    Number.isFinite(value.latitude) &&
    Math.abs(value.latitude) <= 90 &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.longitude) <= 180
  );
}

// Decimal latitude first. Never guess or silently swap coordinate order.
export function parseCoordinates(text) {
  const value = text.trim();
  if (!/^[+\-\d.\s,]+$/.test(value)) return null;
  const match = value.match(
    /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/,
  );
  if (!match)
    throw new Error(
      "Use decimal latitude, longitude, for example 41.8781, -87.6298.",
    );
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  const location = { label: `${latitude}, ${longitude}`, latitude, longitude };
  if (!validLocation(location))
    throw new Error(
      "Latitude must be between -90 and 90; longitude between -180 and 180.",
    );
  return location;
}

export async function searchLocations(query, signal) {
  const response = await fetch(
    apiUrl(`/api/locations/search/?q=${encodeURIComponent(query)}`),
    { signal },
  );
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The address service returned an unreadable response. Try again.",
    );
  }
  if (!response.ok)
    throw new Error(
      body.detail ||
        body.q?.[0] ||
        "Address search is unavailable. Try again or choose on the map.",
    );
  if (!Array.isArray(body.results) || !body.results.every(validLocation))
    throw new Error(
      "The address service returned invalid locations. Try again.",
    );
  return body.results;
}
