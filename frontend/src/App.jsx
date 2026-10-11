import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
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
import { dayDate, duration, validateInputs } from "./lib/timeline";

import { requestTrip } from "./lib/api";
import { adaptTrip, timestamp } from "./lib/trip";
const tabs = [
  { id: "itinerary", label: "Stops", icon: List },
  { id: "map", label: "Map", icon: Map },
  { id: "logs", label: "Daily logs", icon: FileText },
];

export default function App() {
  const [inputs, setInputs] = useState({
    current_location: "",
    pickup_location: "",
    dropoff_location: "",
    cycle_used_hours: "0",
  });
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
  const formPosition = useRef(null);
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

  // Move the existing form into its results position, preserving its inputs.
  useLayoutEffect(() => {
    const before = formPosition.current;
    formPosition.current = null;
    if (
      !before ||
      !formRef.current ||
      window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 760px)")
        .matches
    )
      return;
    const after = formRef.current.getBoundingClientRect();
    const animation = formRef.current.animate(
      [
        {
          transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)`,
        },
        { transform: "translate(0, 0)" },
      ],
      { duration: 420, easing: "cubic-bezier(.22, 1, .36, 1)" },
    );
    return () => animation.cancel();
  }, [trip]);

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
    setNotice("Finding your route. This may take a minute.");
    try {
      const result = adaptTrip(await requestTrip(submitted, controller.signal));
      if (!trip)
        formPosition.current = formRef.current?.getBoundingClientRect();
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
      <a
        className="skip-link"
        href={trip ? "#trip-results" : "#current_location"}
      >
        {trip ? "Skip to trip results" : "Skip to trip form"}
      </a>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Spotter trip planner">
          <span className="brand-mark">
            <Route size={24} strokeWidth={2.5} />
          </span>
          spotter<span className="brand-period">.</span>
        </a>
      </header>
      <main className={`app-shell ${trip ? "has-trip" : "landing"}`}>
        {!trip && (
          <>
            <RouteIllustration />
            <div className="page-heading">
              <h1>
                Plan your next <span>trip.</span>
              </h1>
              <p>Your route, stops, and daily logs. All in one go.</p>
            </div>
          </>
        )}
        <div className={`workspace ${mobileEditing ? "mobile-editing" : ""}`}>
          <TripForm
            inputs={inputs}
            setInputs={setInputs}
            errors={errors}
            onSubmit={generate}
            loading={loading}
            formRef={formRef}
            assumptions={trip?.planning.assumptions}
            hasTrip={Boolean(trip)}
            requestError={requestError}
            notice={notice}
            onRetry={generate}
          />
          <div
            className="results"
            id="trip-results"
            ref={resultsRef}
            tabIndex={-1}
            aria-busy={loading}
          >
            {trip && (
              <>
                <div className="route-heading">
                  <div>
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
                {dirty && (
                  <div className="update-banner" role="status">
                    Results are out of date. Plan again to apply your changes.
                  </div>
                )}
                <div
                  className={`result-content ${loading ? "is-loading" : ""}`}
                >
                  <div className="summary-grid">
                    <Summary
                      icon={Route}
                      label="Total distance"
                      value={Math.round(trip.distanceMiles).toLocaleString()}
                      unit="mi"
                    />
                    <Summary
                      icon={Truck}
                      label="Driving time"
                      value={duration(drivingHours)}
                    />
                    <Summary
                      icon={Clock3}
                      label="Total trip"
                      value={duration(trip.elapsedHours)}
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
                          <List size={16} /> Stops
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
                <details className="trip-details">
                  <summary>Trip details &amp; estimates</summary>
                  <p>
                    Fuel and rest locations are estimates, not verified
                    facilities. Locations use the top search match; review the
                    resolved addresses.
                  </p>
                  <p>
                    Delivery complete:{" "}
                    {timestamp(trip.planning.end_at, trip.timezone, {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
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
                </details>
              </>
            )}
          </div>
        </div>
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
      {detail && <div className="summary-detail">{detail}</div>}
    </div>
  );
}

function RouteIllustration() {
  return (
    <div className="route-art" aria-hidden="true">
      <svg viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern
            id="map-grid"
            width="64"
            height="64"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 64 0 L 0 0 0 64"
              fill="none"
              stroke="#dce3ec"
              strokeWidth=".6"
            />
          </pattern>
        </defs>
        <rect width="1440" height="800" fill="url(#map-grid)" />
        <g fill="none" stroke="#e0e7ef" strokeWidth="18">
          <path d="M-40 550 L240 270 Q280 230 280 160 L280 -30 M-30 680 L430 680 Q500 680 500 750 L500 850" />
          <path d="M1040 -40 L1040 180 Q1040 230 1100 230 L1480 230 M1120 850 L1120 520 Q1120 470 1190 470 L1480 470" />
        </g>
        <path
          className="illustrated-route"
          d="M-30 600 L180 600 Q240 600 240 540 L240 410 Q240 350 300 350 L420 350 M1020 350 L1160 350 Q1220 350 1220 290 L1220 150 Q1220 100 1270 100 L1470 100"
          fill="none"
          stroke="#2457d6"
          strokeWidth="3"
          pathLength="1"
        />
        <g fill="white" stroke="#2457d6" strokeWidth="3">
          <circle cx="180" cy="600" r="9" />
          <circle cx="1220" cy="180" r="9" />
        </g>
        <g
          fill="#526175"
          fontSize="12"
          fontFamily="Inter, sans-serif"
          letterSpacing="2"
        >
          <text x="145" y="636">
            DEPARTURE
          </text>
          <text x="1244" y="185">
            ARRIVAL
          </text>
        </g>
      </svg>
    </div>
  );
}
