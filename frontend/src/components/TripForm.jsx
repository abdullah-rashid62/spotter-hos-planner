import { ArrowRight, ChevronDown, CircleHelp, RotateCcw } from "lucide-react";
import LocationField from "./LocationField";
import { exampleInputs } from "../data/mockTrip";

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
  setErrors,
  onSubmit,
  loading,
  formRef,
  assumptions,
  hasTrip,
  requestError,
  notice,
  onRetry,
}) {
  function change(event) {
    setInputs({ ...inputs, [event.target.name]: event.target.value });
    setErrors((previous) => ({ ...previous, [event.target.name]: undefined }));
  }
  return (
    <aside className="planner-panel" ref={formRef}>
      {hasTrip && (
        <div className="panel-title">
          <h2>Your trip</h2>
        </div>
      )}
      <form noValidate onSubmit={onSubmit}>
        <div className="location-fields">
          {fields.map((field) => (
            <LocationField
              key={field.name}
              field={field}
              value={inputs[field.name]}
              onChange={(value) => {
                setInputs((previous) => ({ ...previous, [field.name]: value }));
                setErrors((previous) => ({
                  ...previous,
                  [field.name]: undefined,
                }));
              }}
              error={errors[field.name]}
            />
          ))}
        </div>
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
          {loading && (
            <span className="route-loader" aria-hidden="true">
              <span />
            </span>
          )}
          {loading
            ? "Planning route…"
            : hasTrip
              ? "Update route"
              : "Plan route"}
          {!loading && <ArrowRight size={18} />}
        </button>
        <div className={`form-secondary ${loading ? "is-planning" : ""}`}>
          <button
            className="example-button"
            type="button"
            onClick={() => {
              setInputs({ ...exampleInputs });
              setErrors({});
            }}
            disabled={loading}
          >
            <RotateCcw size={14} /> Try an example
          </button>
          <p className={loading ? "planning-status" : "sr-only"} role="status">
            {notice}
          </p>
        </div>
      </form>
      {requestError && (
        <div className="update-banner request-error" role="alert">
          <p>{requestError}</p>
          <button
            className="button secondary"
            disabled={loading}
            onClick={onRetry}
          >
            Retry trip plan
          </button>
        </div>
      )}
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
    </aside>
  );
}
