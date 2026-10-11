import { FileText, Info, Printer } from "lucide-react";
import { dayDate, duration, statuses } from "../lib/timeline";
import { hourTicks, timestamp } from "../lib/trip";

const LEFT = 112;
const TOP = 38;
const ROW = 36;

export default function DailyLog({
  trip,
  day,
  selectedId,
  onSelect,
  print = false,
}) {
  const selected = day.segments.find((segment) => segment.id === selectedId);
  const HOUR = 648 / day.hours;
  const ticks = hourTicks(day, trip.timezone);
  const activities = day.segments.filter((segment) => !segment.padding);
  const first = activities[0];
  const last = activities.at(-1);
  function coordinates(point) {
    return point
      ? `${point[1].toFixed(3)}, ${point[0].toFixed(3)} (estimated)`
      : "Not supplied";
  }
  return (
    <div className={`daily-log ${print ? "print-log" : ""}`}>
      <div className="log-heading">
        <div>
          <div className="eyebrow">RECORD OF DUTY STATUS · PLANNED</div>
          <h3>Driver’s daily log</h3>
          <p>
            {dayDate(trip.startDate, day.index, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · {trip.timezone}
          </p>
        </div>
        {!print && (
          <button className="button secondary" onClick={() => window.print()}>
            <Printer size={15} /> Print all days
          </button>
        )}
      </div>
      <div className="log-fields">
        <div>
          <span>From</span>
          <strong>
            {day.index === 0
              ? trip.labels.start
              : coordinates(first?.start_coordinates)}
          </strong>
        </div>
        <div>
          <span>To</span>
          <strong>
            {day.index === trip.days.length - 1
              ? trip.labels.end
              : coordinates(last?.end_coordinates)}
          </strong>
        </div>
        <div>
          <span>Total miles driving today</span>
          <strong>{Math.round(day.miles)} mi</strong>
        </div>
        <div>
          <span>Driver / carrier / vehicle</span>
          <strong className="unspecified">Not supplied</strong>
        </div>
      </div>
      <div className="log-graph-wrap">
        {!print && (
          <div className="sticky-duty-labels" aria-hidden="true">
            <svg viewBox="0 0 112 200">
              <rect width="112" height="200" fill="white" />
              {statuses.map((status, row) => (
                <text
                  key={status.id}
                  x="3"
                  y={TOP + row * ROW + 22}
                  className="status-label"
                >
                  {row + 1}. {status.label}
                </text>
              ))}
            </svg>
          </div>
        )}
        <div
          className="log-scroll"
          tabIndex={0}
          role="region"
          aria-label={`${day.hours}-hour duty graph; scroll horizontally on small screens`}
        >
          <svg
            className="duty-graph"
            viewBox="0 0 844 200"
            aria-label={`Day ${day.index + 1} duty graph. ${duration(day.totals.driving)} driving.`}
          >
            <rect
              x={LEFT}
              y={TOP - 24}
              width={648}
              height="24"
              fill="#142338"
            />
            {ticks.map(({ hour, label, time }) => (
              <text
                key={hour}
                x={LEFT + hour * HOUR}
                y={TOP - 8}
                textAnchor="middle"
                className="hour-label"
                fill={hour === 0 || hour === day.hours ? "#526175" : "#fff"}
              >
                <title>{time}</title>
                {label}
              </text>
            ))}
            <text
              x="803"
              y={TOP - 8}
              textAnchor="middle"
              className="graph-total-heading"
            >
              HOURS
            </text>
            {statuses.map((status, row) => (
              <g key={status.id}>
                <rect
                  x={LEFT}
                  y={TOP + row * ROW}
                  width={648}
                  height={ROW}
                  fill={row % 2 ? "#f8fafc" : "#fff"}
                  stroke="#9daaba"
                  strokeWidth="0.8"
                />
                <text x="3" y={TOP + row * ROW + 22} className="status-label">
                  {row + 1}. {status.label}
                </text>
                <text
                  x="803"
                  y={TOP + row * ROW + 22}
                  textAnchor="middle"
                  className="graph-total"
                >
                  {duration(day.totals[status.id])}
                </text>
                {Array.from({ length: day.hours * 4 + 1 }, (_, tick) => (
                  <line
                    key={tick}
                    x1={LEFT + (tick * HOUR) / 4}
                    x2={LEFT + (tick * HOUR) / 4}
                    y1={TOP + row * ROW}
                    y2={
                      TOP +
                      row * ROW +
                      (tick % 4 === 0 ? ROW : tick % 2 === 0 ? 12 : 6)
                    }
                    stroke="#b5bfcb"
                    strokeWidth={tick % 4 === 0 ? 0.8 : 0.5}
                  />
                ))}
              </g>
            ))}
            {day.segments.map((segment, index) => {
              const row = statuses.findIndex(
                (status) => status.id === segment.status,
              );
              const y = TOP + row * ROW + ROW / 2;
              const x1 = LEFT + segment.start * HOUR;
              const x2 = LEFT + segment.end * HOUR;
              const previous = day.segments[index - 1];
              const previousRow = previous
                ? statuses.findIndex((status) => status.id === previous.status)
                : row;
              const isSelected = segment.id === selectedId;
              return (
                <g key={segment.id}>
                  {previous && (
                    <line
                      x1={x1}
                      x2={x1}
                      y1={TOP + previousRow * ROW + ROW / 2}
                      y2={y}
                      stroke="#142338"
                      strokeWidth="2"
                    />
                  )}
                  <line
                    x1={x1}
                    x2={x2}
                    y1={y}
                    y2={y}
                    stroke={isSelected ? "#2457d6" : "#142338"}
                    strokeWidth={isSelected ? 5 : 2.5}
                    strokeDasharray={segment.padding ? "4 3" : undefined}
                  />
                  {!print && !segment.padding && (
                    <line
                      className="graph-hit"
                      x1={x1}
                      x2={x2}
                      y1={y}
                      y2={y}
                      stroke="transparent"
                      strokeWidth="22"
                      role="button"
                      tabIndex="0"
                      aria-label={`${segment.title}, ${timestamp(segment.start_at, trip.timezone)} to ${timestamp(segment.end_at, trip.timezone)}`}
                      aria-pressed={isSelected}
                      onClick={() => onSelect(segment.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(segment.id);
                        }
                      }}
                    >
                      <title>
                        {segment.title}:{" "}
                        {timestamp(segment.start_at, trip.timezone)}–
                        {timestamp(segment.end_at, trip.timezone)}
                      </title>
                    </line>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      {!print && (
        <p className="graph-scroll-hint">
          Scroll to explore the full duty graph →
        </p>
      )}
      {day.clock_changes.length > 0 && (
        <p className="log-note">
          Clock-change day: {day.hours} elapsed hours.{" "}
          {day.clock_changes
            .map(
              (change) =>
                `Clock changes at ${timestamp(change.at, trip.timezone)}.`,
            )
            .join(" ")}{" "}
          {ticks
            .filter((tick) => /[ab]$/.test(tick.label))
            .map((tick) => `${tick.label} = ${tick.time}`)
            .join("; ")}
        </p>
      )}
      <div className="log-totals">
        {statuses.map((status) => (
          <div key={status.id}>
            <span>
              <i style={{ background: status.color }} />
              {status.label}
            </span>
            <strong>{duration(day.totals[status.id])}</strong>
          </div>
        ))}
        <div className="total-hours">
          <span>Total</span>
          <strong>{duration(day.hours)}</strong>
        </div>
      </div>
      {selected && (
        <div className="log-selection" role="status">
          <FileText size={16} />
          <span>
            <strong>{selected.title}</strong> ·{" "}
            {timestamp(selected.start_at, trip.timezone)}–
            {timestamp(selected.end_at, trip.timezone)} · {selected.location}
          </span>
        </div>
      )}
      <div className="remarks">
        <h4>Remarks</h4>
        <div className="remark-grid">
          {day.segments.map((segment) => (
            <button
              key={segment.id}
              className={segment.id === selectedId ? "remark-selected" : ""}
              disabled={segment.padding}
              onClick={() => onSelect(segment.id)}
            >
              <time>{timestamp(segment.start_at, trip.timezone)}</time>
              <span>
                {segment.title}
                <small>{segment.location}</small>
                <small>{segment.detail}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <p className="log-note">
        <Info size={14} />
        <span>
          Dashed segments assume off-duty time outside the trip. This planned
          sheet does not record actual duty; driver identity, signature, and
          actual duty history are not supplied.
        </span>
      </p>
    </div>
  );
}
