import {
  ArrowUpRight,
  Coffee,
  Flag,
  Fuel,
  MapPin,
  Moon,
  Package,
  Truck,
} from "lucide-react";
import { duration } from "../lib/timeline";
import { timestamp } from "../lib/trip";

export const activityIcons = {
  drive: Truck,
  pickup: Package,
  fuel: Fuel,
  daily_rest: Moon,
  cycle_restart: Moon,
  dropoff: Flag,
  driving_break: Coffee,
};

export default function Itinerary({ trip, day, selectedId, onSelect, onMap }) {
  const segments = day.segments.filter((segment) => !segment.padding);
  return (
    <div className="itinerary">
      <div className="event-list">
        {segments.map((event, index) => {
          const Icon = activityIcons[event.activity] || Coffee;
          const selected = event.id === selectedId;
          return (
            <article
              key={event.id}
              className={`event-row ${selected ? "selected" : ""} status-${event.status}`}
            >
              <div className="event-time">
                <strong>{timestamp(event.start_at, trip.timezone)}</strong>
                <span>{timestamp(event.end_at, trip.timezone)}</span>
              </div>
              <div className="event-track">
                <span className="event-icon">
                  <Icon size={17} />
                </span>
                {index < segments.length - 1 && <span className="track-line" />}
              </div>
              <div className="event-content">
                <button
                  className="event-title"
                  aria-expanded={selected}
                  onClick={() => onSelect(selected ? null : event.id)}
                >
                  {event.title}
                  <span className="event-duration">
                    {duration(event.end - event.start)}
                  </span>
                </button>
                <p>{event.location}</p>
                {selected && (
                  <div className="event-detail">
                    <p>{event.detail}</p>
                    {event.continues_from_previous_day && (
                      <p>Continued from the previous day.</p>
                    )}
                    {event.continues_into_next_day && (
                      <p>Continues into the next day.</p>
                    )}
                    <button onClick={() => onMap(event.id)}>
                      <MapPin size={13} /> View on map{" "}
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                )}
              </div>
              <span className="event-mileage">
                {event.miles > 0
                  ? `${Math.round(event.miles)} mi`
                  : event.status === "off_duty"
                    ? "Off duty"
                    : "On duty"}
              </span>
            </article>
          );
        })}
      </div>
      <div className="day-end">
        <span className="small-dot" />
        {day.index < trip.days.length - 1
          ? "The trip continues on the next daily sheet. Logs split at local midnight."
          : "Trip complete after unloading. Remaining daily-log time is assumed off duty."}
      </div>
    </div>
  );
}
