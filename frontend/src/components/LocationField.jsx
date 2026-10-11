import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
import {
  locationText,
  parseCoordinates,
  searchLocations,
  validLocation,
} from "../lib/locations";
import LocationPicker from "./LocationPicker";

export default function LocationField({ field, value, onChange, error }) {
  const [expanded, setExpanded] = useState(false);
  const [results, setResults] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(null);
  const request = useRef(null);
  const debounce = useRef(null);
  const suggestions = useRef(null);
  const input = useRef(null);
  const selected = validLocation(value);
  const text = locationText(value);
  const selectionError = Boolean(error && results?.length);
  const feedback = busy
    ? "Finding addresses…"
    : selectionError
      ? error
      : message || error;
  const feedbackIsError = Boolean(
    !busy && (selectionError || (message ? !results?.length : error)),
  );
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setResults(null);
    setMessage("");
    setPicker(null);
    if (!selected && text.trim().length >= 3) {
      debounce.current = setTimeout(() => search(true), 500);
    }
    return () => {
      clearTimeout(debounce.current);
      request.current?.abort();
      request.current = null;
    };
  }, [value]);

  function closePicker() {
    setPicker(null);
    // Wait until the modal is removed; the rest of the page is inert while open.
    requestAnimationFrame(() => input.current?.focus());
  }

  async function search(automatic = false) {
    clearTimeout(debounce.current);
    if (request.current) return;
    setMessage("");
    setResults(null);
    try {
      const coordinates = parseCoordinates(text);
      if (coordinates) {
        if (automatic)
          setMessage("Press Enter to verify these coordinates on the map.");
        else setPicker({ initial: coordinates });
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
          : "Address not found. Try a more complete address or choose on the map.",
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
    <div
      className="field location-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setExpanded(false);
      }}
    >
      <label htmlFor={field.name}>{field.label}</label>
      <div className="location-anchor">
        <div className="input-wrap">
          <span className={`location-letter letter-${field.letter}`}>
            {field.letter}
          </span>
          <input
            ref={input}
            id={field.name}
            name={field.name}
            value={text}
            onFocus={() => setExpanded(true)}
            onChange={(event) => {
              setExpanded(true);
              onChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (!selected) search();
              }
              if (event.key === "ArrowDown" && results?.length) {
                event.preventDefault();
                setExpanded(true);
                requestAnimationFrame(() =>
                  suggestions.current?.querySelector("button")?.focus(),
                );
              }
              if (event.key === "Escape") {
                clearTimeout(debounce.current);
                request.current?.abort();
                request.current = null;
                setBusy(false);
                setExpanded(false);
                setMessage("");
              }
            }}
            placeholder="Enter full address"
            autoComplete="off"
            maxLength={255}
            aria-invalid={feedbackIsError}
            aria-describedby={`${field.name}-error`}
            aria-controls={
              expanded && results?.length ? `${field.name}-matches` : undefined
            }
          />
          {busy && (
            <LoaderCircle
              className="location-loading"
              size={16}
              aria-hidden="true"
            />
          )}
        </div>
        {expanded && !picker && results?.length > 0 && (
          <div className="location-dropdown">
            <div className="location-dropdown-heading" aria-hidden="true">
              Select a match to verify its map pin
            </div>
            <ul
              ref={suggestions}
              id={`${field.name}-matches`}
              className="location-results"
              aria-label={`${field.label} matches`}
              onKeyDown={(event) => {
                const buttons = [
                  ...suggestions.current.querySelectorAll("button"),
                ];
                const index = buttons.indexOf(document.activeElement);
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const next = index + (event.key === "ArrowDown" ? 1 : -1);
                  if (next < 0) input.current?.focus();
                  else buttons[Math.min(next, buttons.length - 1)]?.focus();
                }
                if (event.key === "Escape") {
                  setMessage("");
                  input.current?.focus();
                  setExpanded(false);
                }
              }}
            >
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
            <button
              type="button"
              className="location-map-button location-dropdown-map"
              onClick={() => setPicker({ initial: null })}
            >
              <MapPin size={14} /> Can't find it? Choose on map
            </button>
          </div>
        )}
      </div>
      <div className="location-actions">
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
      <p
        id={`${field.name}-error`}
        className={
          busy || (results?.length && !selectionError)
            ? "sr-only"
            : feedbackIsError
              ? "field-error"
              : "location-search-status"
        }
        role="status"
      >
        {feedback}
      </p>
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
