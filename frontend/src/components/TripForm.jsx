import {
  ArrowRight,
  ChevronDown,
  CircleHelp,
  LoaderCircle,
  MapPin,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { exampleInputs, places } from "../data/mockTrip";

const fields = [
  {
    name: "current_location",
    label: "Current location",
    letter: "A",
    hint: "Your journey starts here",
  },
  { name: "pickup_location", label: "Pickup location", letter: "B" },
  { name: "dropoff_location", label: "Drop-off location", letter: "C" },
];

export default function TripForm({
  inputs,
  setInputs,
  errors,
  onSubmit,
  loading,
  formRef,
  assumptions,
}) {
  function change(event) {
    setInputs({ ...inputs, [event.target.name]: event.target.value });
  }
  return (
    <aside className="planner-panel" ref={formRef}>
      <div className="panel-title">
        <div className="eyebrow">THE ROAD STARTS HERE</div>
        <h2>Plan your trip</h2>
        <p>A few details. A clearer road ahead.</p>
      </div>
      <form noValidate onSubmit={onSubmit}>
        <div className="location-fields">
          {fields.map((field) => (
            <div className="field" key={field.name}>
              <label htmlFor={field.name}>{field.label}</label>
              <div className="input-wrap">
                <span className={`location-letter letter-${field.letter}`}>
                  {field.letter}
                </span>
                <input
                  id={field.name}
                  name={field.name}
                  value={inputs[field.name]}
                  onChange={change}
                  list="cities"
                  placeholder="City, state or address"
                  autoComplete="off"
                  maxLength={255}
                  aria-invalid={Boolean(errors[field.name])}
                  aria-describedby={
                    errors[field.name] ? `${field.name}-error` : undefined
                  }
                />
                <MapPin size={16} aria-hidden="true" />
              </div>
              {errors[field.name] && (
                <p className="field-error" id={`${field.name}-error`}>
                  {errors[field.name]}
                </p>
              )}
            </div>
          ))}
        </div>
        <datalist id="cities">
          {places.map((place) => (
            <option key={place} value={place} />
          ))}
        </datalist>
        <div className="field cycle-field">
          <label htmlFor="cycle_used_hours">
            Current cycle used <CircleHelp size={14} aria-hidden="true" />
          </label>
          <div className="input-wrap">
            <input
              id="cycle_used_hours"
              name="cycle_used_hours"
              type="number"
              min="0"
              max="70"
              step="0.01"
              inputMode="decimal"
              value={inputs.cycle_used_hours}
              onChange={change}
              aria-invalid={Boolean(errors.cycle_used_hours)}
              aria-describedby="cycle-help cycle-error"
            />
            <span className="input-unit">/ 70 hrs</span>
          </div>
          <p className="field-hint" id="cycle-help">
            On-duty hours used in your current 8-day cycle.
          </p>
          {errors.cycle_used_hours && (
            <p className="field-error" id="cycle-error">
              {errors.cycle_used_hours}
            </p>
          )}
        </div>
        <button
          className="button primary generate"
          type="submit"
          disabled={loading}
        >
          {loading ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Sparkles size={17} />
          )}{" "}
          {loading ? "Planning your trip…" : "Generate trip plan"}
          {!loading && <ArrowRight size={18} />}
        </button>
        <button
          className="example-button"
          type="button"
          onClick={() => setInputs({ ...exampleInputs })}
          disabled={loading}
        >
          <RotateCcw size={14} /> Load example trip
        </button>
      </form>
      <details className="assumptions">
        <summary>
          Planning assumptions <ChevronDown size={15} />
        </summary>
        {!assumptions && (
          <ul>
            <li>Property-carrying · 70-hour / 8-day cycle</li>
            <li>Fresh daily driving allowances</li>
            <li>1 hour each for pickup and drop-off</li>
            <li>30-minute fueling; full initial fuel range</li>
            <li>Full daily rests, without split sleeper</li>
          </ul>
        )}
        {assumptions ? (
          <ul>
            {assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>
            Departure: tomorrow at 8:00 AM in America/Chicago, a fixed demo log
            timezone. Constant average speed per leg; conservative 34-hour cycle
            restarts without rolling recap. Outside-trip log hours are assumed
            off duty. Stop positions are estimated.
          </p>
        )}
      </details>
      <div className="sidebar-note">
        <span className="note-icon">
          <MapPin size={19} />
        </span>
        <div>
          <strong>One trip. The whole picture.</strong>
          <p>
            Your route, stops, and daily logs.
            <br />
            All connected in one place.
          </p>
        </div>
      </div>
      <div className="sidebar-footer">
        <span className="small-dot" /> Built for the road ahead
      </div>
    </aside>
  );
}
