import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  FlaskConical,
  List,
  Map,
  MapPinned,
  Moon,
  Route,
  SlidersHorizontal,
  Truck,
} from "lucide-react";
import TripForm from "./components/TripForm";
import RouteMap from "./components/RouteMap";
import Itinerary from "./components/Itinerary";
import DailyLog from "./components/DailyLog";
import { exampleInputs } from "./data/mockTrip";
import { dayDate, duration, validateInputs } from "./lib/timeline";

import { requestTrip } from "./lib/api";
import { adaptTrip, timestamp } from "./lib/trip";
const tabs = [
  { id: "itinerary", label: "Itinerary", icon: List },
  { id: "map", label: "Map", icon: Map },
  { id: "logs", label: "Daily logs", icon: FileText },
];

export default function App() {
  const [inputs, setInputs] = useState({ ...exampleInputs });
  const [submittedInputs, setSubmittedInputs] = useState(null);
  const [trip, setTrip] = useState(null);
  const [requestError, setRequestError] = useState("");
  const days = trip?.days || [];
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("itinerary");
  const [dayIndex, setDayIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState("");
  const [mobileEditing, setMobileEditing] = useState(true);
  const formRef = useRef(null);
  const resultsRef = useRef(null);
  const mapSection = useRef(null);
  const request = useRef(null);
  const dirty =
    trip && JSON.stringify(inputs) !== JSON.stringify(submittedInputs);
  const drivingHours = (trip?.events || [])
    .filter((event) => event.status === "driving")
    .reduce((sum, event) => sum + event.end - event.start, 0);
  const day = days[dayIndex];

  useEffect(() => () => request.current?.abort(), []);

  async function generate(event) {
    event.preventDefault();
    if (request.current) return;
    const nextErrors = validateInputs(inputs);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus();
      return;
    }
    const submitted = { ...inputs };
    const controller = new AbortController();
    request.current = controller;
    const deadline = setTimeout(() => controller.abort(), 120000);
    setLoading(true);
    setRequestError("");
    setNotice(
      "Finding your route and preparing the schedule. This may take a minute.",
    );
    try {
      const result = adaptTrip(await requestTrip(submitted, controller.signal));
      setTrip(result);
      setSubmittedInputs(submitted);
      setDayIndex(0);
      setSelectedId(null);
      setTab("itinerary");
      setMobileEditing(false);
      setNotice("Trip plan ready.");
      requestAnimationFrame(() =>
        resultsRef.current?.focus({ preventScroll: true }),
      );
    } catch (error) {
      setErrors(error.fields || {});
      setRequestError(
        error.name === "AbortError"
          ? "Planning took too long. Please try again."
          : error instanceof TypeError
            ? "Cannot reach the planning service. Check your connection and try again."
            : error.message,
      );
      setNotice("");
      setMobileEditing(true);
      const field = Object.keys(error.fields || {})[0];
      if (field)
        requestAnimationFrame(() => document.getElementById(field)?.focus());
    } finally {
      clearTimeout(deadline);
      request.current = null;
      setLoading(false);
    }
  }

  function showMap(id) {
    selectEvent(id);
    setTab("map");
    mapSection.current?.scrollIntoView({
      block: "center",
      behavior: "instant",
    });
  }

  function changeTab(nextTab) {
    setTab(nextTab);
  }

  function selectEvent(id) {
    setSelectedId(id);
    if (!id || day.segments.some((segment) => segment.id === id)) return;
    const matchingDay = days.find((item) =>
      item.segments.some((segment) => segment.id === id),
    );
    if (matchingDay) setDayIndex(matchingDay.index);
  }

  return (
    <>
      <a className="skip-link" href="#trip-results">
        Skip to trip results
      </a>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Spotter trip planner">
          <span className="brand-mark">
            <Route size={24} strokeWidth={2.5} />
          </span>
          spotter<span className="brand-period">.</span>
        </a>
        <span className="header-divider" />
        <span className="product-name">Trip planner</span>
        <div className="header-right">
          <span className="preview-pill">
            <FlaskConical size={13} /> Trip planner
          </span>
          <span className="avatar" aria-label="Demo workspace">
            S
          </span>
        </div>
      </header>
      <main className="app-shell">
        <div className="page-heading">
          <div>
            <div className="breadcrumb">
              WORKSPACE <ChevronRight size={12} /> TRIP PLANNER
            </div>
            <h1>A better plan. A smoother journey.</h1>
            <p>Map the miles. Plan the stops. See the whole trip.</p>
          </div>
          <span className="rule-badge">
            <Truck size={16} /> Property-carrying <span /> 70 hrs / 8 days
          </span>
        </div>
        <div className={`workspace ${mobileEditing ? "mobile-editing" : ""}`}>
          <TripForm
            inputs={inputs}
            setInputs={setInputs}
            errors={errors}
            onSubmit={generate}
            loading={loading}
            formRef={formRef}
            assumptions={trip?.planning.assumptions}
          />
          <div
            className="results"
            id="trip-results"
            ref={resultsRef}
            tabIndex={-1}
            aria-busy={loading}
          >
            {requestError && (
              <div className="update-banner request-error" role="alert">
                {requestError} {trip && "The previous plan remains below."}
                <button
                  className="button secondary"
                  disabled={loading}
                  onClick={generate}
                >
                  Retry trip plan
                </button>
              </div>
            )}
            {!trip && (
              <div className="empty-state">
                <MapPinned size={40} />
                <h2>Where are you headed?</h2>
                <p>
                  Enter your trip details to generate a route, planned stops,
                  and daily logs.
                </p>
                <p role="status">{notice}</p>
              </div>
            )}
            {trip && (
              <>
                <div className="route-heading">
                  <div>
                    <div className="eyebrow">
                      YOUR TRIP OVERVIEW{" "}
                      <span className="trip-id">/ PLANNED</span>
                    </div>
                    <h2>
                      {trip.labels.start} <ArrowRight size={20} />{" "}
                      {trip.labels.end}{" "}
                      <span className="via-city">via {trip.labels.pickup}</span>
                    </h2>
                  </div>
                  <button
                    className="button secondary export-button"
                    onClick={() => {
                      setTab("logs");
                      window.print();
                    }}
                  >
                    <ArrowDownToLine size={16} /> Print logs
                  </button>
                  <button
                    className="button secondary mobile-edit"
                    onClick={() => {
                      setMobileEditing(!mobileEditing);
                      requestAnimationFrame(() =>
                        formRef.current?.querySelector("input")?.focus(),
                      );
                    }}
                  >
                    <SlidersHorizontal size={16} />{" "}
                    {mobileEditing ? "Close" : "Edit trip"}
                  </button>
                </div>
                <div className="sample-banner">
                  <FlaskConical size={15} />
                  <span>
                    <strong>Planned trip.</strong> Fuel and rest positions are
                    estimates, not verified facilities. Locations use the top
                    search match; review the resolved addresses above.
                  </span>
                </div>
                {dirty && (
                  <div className="update-banner" role="status">
                    Results are out of date. Generate a new trip plan to apply
                    your changes.
                  </div>
                )}
                <div className="notice" role="status">
                  {notice}
                </div>
                <div
                  className={`result-content ${loading ? "is-loading" : ""}`}
                >
                  <div className="summary-grid">
                    <Summary
                      icon={Route}
                      label="Total distance"
                      value={Math.round(trip.distanceMiles).toLocaleString()}
                      unit="mi"
                      detail="Across 2 route legs"
                    />
                    <Summary
                      icon={Truck}
                      label="Driving time"
                      value={duration(drivingHours)}
                      detail="With planned breaks"
                    />
                    <Summary
                      icon={Clock3}
                      label="Total trip"
                      value={duration(trip.elapsedHours)}
                      detail="Including stops & rest"
                    />
                    <Summary
                      icon={FlagIcon}
                      label="Delivery complete"
                      value={
                        timestamp(trip.planning.end_at, trip.timezone, {
                          timeZoneName: undefined,
                        }).split(" ")[0]
                      }
                      unit={
                        timestamp(trip.planning.end_at, trip.timezone, {
                          timeZoneName: undefined,
                        }).split(" ")[1]
                      }
                      detail={timestamp(trip.planning.end_at, trip.timezone, {
                        month: "short",
                        day: "numeric",
                      })}
                    />
                  </div>
                  <div className="mobile-tabs" aria-label="Trip views">
                    {tabs.map((item) => (
                      <button
                        key={item.id}
                        aria-pressed={tab === item.id}
                        onClick={() => changeTab(item.id)}
                      >
                        <item.icon size={16} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div
                    ref={mapSection}
                    className={`map-section ${tab === "map" ? "mobile-visible" : ""}`}
                  >
                    <RouteMap
                      trip={trip}
                      selectedId={selectedId}
                      onSelect={selectEvent}
                      visible={
                        tab === "map" ||
                        !window.matchMedia("(max-width: 760px)").matches
                      }
                    />
                    <div className="route-key">
                      <span>
                        <i className="key-dot start" /> Start
                      </span>
                      <span>
                        <i className="key-dot pickup" /> Pickup / drop-off
                      </span>
                      <span>
                        <i className="key-dot fuel" /> Fuel
                      </span>
                      <span>
                        <i className="key-dot rest" /> Rest
                      </span>
                      <span className="route-key-distance">
                        <MapPinned size={13} />{" "}
                        {Math.round(trip.distanceMiles).toLocaleString()} miles
                      </span>
                    </div>
                  </div>
                  <section
                    className={`schedule-panel ${tab === "map" ? "mobile-hidden" : ""}`}
                  >
                    <div className="schedule-toolbar">
                      <div className="desktop-tabs" aria-label="Schedule views">
                        <button
                          aria-pressed={tab !== "logs"}
                          onClick={() => changeTab("itinerary")}
                        >
                          <List size={16} /> Trip itinerary
                        </button>
                        <button
                          aria-pressed={tab === "logs"}
                          onClick={() => changeTab("logs")}
                        >
                          <FileText size={16} /> Daily logs{" "}
                          <span className="count">{days.length}</span>
                        </button>
                      </div>
                      <span className="timezone">
                        <Clock3 size={13} /> {trip.timezone}
                      </span>
                    </div>
                    <div className="day-toolbar">
                      <div className="day-buttons">
                        {days.map((item) => (
                          <button
                            key={item.index}
                            aria-pressed={dayIndex === item.index}
                            onClick={() => setDayIndex(item.index)}
                          >
                            Day {item.index + 1}
                            <span>{dayDate(trip.startDate, item.index)}</span>
                          </button>
                        ))}
                      </div>
                      <div className="day-navigation">
                        <button
                          aria-label="Previous day"
                          disabled={dayIndex === 0}
                          onClick={() => setDayIndex(dayIndex - 1)}
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <button
                          aria-label="Next day"
                          disabled={dayIndex === days.length - 1}
                          onClick={() => setDayIndex(dayIndex + 1)}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    </div>
                    <div className="day-summary">
                      <span>
                        <CalendarDays size={15} />
                        {dayDate(trip.startDate, dayIndex, {
                          weekday: "long",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <div>
                        <span>
                          <Truck size={14} /> {duration(day.totals.driving)}{" "}
                          driving
                        </span>
                        <span>
                          <Route size={14} /> {Math.round(day.miles)} mi
                        </span>
                        <span>
                          <Moon size={14} /> {duration(day.totals.off_duty)} off
                          duty
                        </span>
                      </div>
                    </div>
                    {tab === "logs" ? (
                      <DailyLog
                        trip={trip}
                        day={day}
                        selectedId={selectedId}
                        onSelect={selectEvent}
                      />
                    ) : (
                      <Itinerary
                        trip={trip}
                        day={day}
                        selectedId={selectedId}
                        onSelect={selectEvent}
                        onMap={showMap}
                      />
                    )}
                  </section>
                </div>
                <div className="results-footer">
                  <span>
                    Departure:{" "}
                    {timestamp(trip.planning.start_at, trip.timezone, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <span>
                    Planned duty, not actual records · Not a certified ELD
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        <footer className="page-footer">
          <span>
            spotter<span className="brand-period">.</span>
          </span>
          <p>A little planning goes a long way.</p>
          <span>TRIP PLANNER</span>
        </footer>
      </main>
      <div className="print-sheets">
        {days.map((printDay) => (
          <DailyLog
            key={printDay.index}
            trip={trip}
            day={printDay}
            selectedId={null}
            onSelect={() => {}}
            print
          />
        ))}
      </div>
    </>
  );
}

function FlagIcon(props) {
  return <MapPinned {...props} />;
}
function Summary({ icon: Icon, label, value, unit, detail }) {
  return (
    <div className="summary-card">
      <div className="summary-label">
        <Icon size={15} />
        <span>{label}</span>
      </div>
      <div className="summary-value">
        {value}
        <span>{unit}</span>
      </div>
      <div className="summary-detail">{detail}</div>
    </div>
  );
}
