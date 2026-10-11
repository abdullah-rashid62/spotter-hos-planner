import { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import {
  locationText,
  parseCoordinates,
  searchLocations,
  validLocation,
} from "../lib/locations";
import LocationPicker from "./LocationPicker";

export default function LocationField({ field, value, onChange, error }) {
  const [results, setResults] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(null);
  const request = useRef(null);
  const input = useRef(null);
  const selected = validLocation(value);
  const text = locationText(value);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setResults(null);
    setMessage("");
    setPicker(null);
    return () => request.current?.abort();
  }, [value]);

  function closePicker() {
    setPicker(null);
    // Wait until the modal is removed; the rest of the page is inert while open.
    requestAnimationFrame(() => input.current?.focus());
  }

  async function search() {
    if (request.current) return;
    setMessage("");
    setResults(null);
    try {
      const coordinates = parseCoordinates(text);
      if (coordinates) {
        setPicker({ initial: coordinates });
        return;
      }
      if (text.trim().length < 3) {
        setMessage("Enter at least 3 characters, or choose on the map.");
        return;
      }
    } catch (error) {
      setMessage(error.message);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const deadline = setTimeout(() => controller.abort(), 25000);
    setBusy(true);
    try {
      const matches = await searchLocations(text.trim(), controller.signal);
      if (request.current !== controller) return;
      setResults(matches);
      setMessage(
        matches.length
          ? "Select a match, then verify its map pin."
          : "No matching address. Add a ZIP code, city or state, enter coordinates, or choose on the map.",
      );
    } catch (error) {
      if (request.current !== controller) return;
      setMessage(
        error.name === "AbortError"
          ? "Address search timed out. Try again or choose on the map."
          : error instanceof TypeError
            ? "Cannot reach address search. Check your connection or choose on the map."
            : error.message,
      );
    } finally {
      clearTimeout(deadline);
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <div className="field location-field">
      <label htmlFor={field.name}>{field.label}</label>
      <div className="input-wrap">
        <span className={`location-letter letter-${field.letter}`}>
          {field.letter}
        </span>
        <input
          ref={input}
          id={field.name}
          name={field.name}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (!selected) search();
            }
          }}
          placeholder="Full address or latitude, longitude"
          autoComplete="off"
          maxLength={255}
          aria-invalid={Boolean(error)}
          aria-describedby={`${field.name}-hint ${field.name}-error`}
        />
      </div>
      <p className="field-hint" id={`${field.name}-hint`}>
        Street number, city, state and ZIP, or decimal coordinates.
      </p>
      <div className="location-actions">
        {!selected && (
          <button
            className="button secondary"
            type="button"
            disabled={busy || !text.trim()}
            onClick={search}
          >
            <Search size={14} />
            {busy ? "Searching…" : "Search / locate"}
          </button>
        )}
        <button
          className="location-map-button"
          type="button"
          onClick={() => setPicker({ initial: selected ? value : null })}
        >
          <MapPin size={14} />
          {selected ? "Review / adjust pin" : "Choose on map"}
        </button>
      </div>
      {selected && (
        <p className="location-selected">
          Selected: {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}
        </p>
      )}
      <p id={`${field.name}-error`} className="field-error">
        {error}
      </p>
      <p className="location-search-status" role="status">
        {busy ? "Searching addresses…" : message}
      </p>
      {results?.length > 0 && (
        <ul className="location-results" aria-label={`${field.label} matches`}>
          {results.map((result, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => setPicker({ initial: result })}
              >
                <strong>{result.label}</strong>
                <span>
                  {result.precision === "address"
                    ? "Address match — verify the entrance"
                    : result.precision === "venue"
                      ? "Place match — verify the entrance"
                      : "Approximate match — exact address not confirmed"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picker && (
        <LocationPicker
          initial={picker.initial}
          title={field.label}
          onClose={closePicker}
          onConfirm={(point) => {
            onChange({
              label: point.label,
              latitude: point.latitude,
              longitude: point.longitude,
            });
            closePicker();
          }}
        />
      )}
    </div>
  );
}
