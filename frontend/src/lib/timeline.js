import { validLocation } from "./locations.js";
export const statuses = [
  { id: "off_duty", label: "Off duty", short: "OFF", color: "#167568" },
  { id: "sleeper", label: "Sleeper berth", short: "SB", color: "#7450b5" },
  { id: "driving", label: "Driving", short: "D", color: "#2457d6" },
  { id: "on_duty", label: "On duty", short: "ON", color: "#a65b00" },
];

export function duration(hours) {
  const minutes = Math.round(hours * 60);
  const remainder = minutes % 60;
  if (minutes > 0 && minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${remainder ? ` ${remainder}m` : ""}`;
}

export function clockTime(hour) {
  const minutes = Math.round(hour * 60) % 1440;
  const wholeHour = Math.floor(minutes / 60);
  return `${wholeHour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${wholeHour < 12 ? "AM" : "PM"}`;
}

export function dayDate(
  startDate,
  dayIndex,
  options = { month: "short", day: "numeric" },
) {
  // Calendar arithmetic stays independent of the viewer's local timezone.
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayIndex);
  return date.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

export function buildDays(trip) {
  const endHour = trip.startHour + trip.elapsedHours;
  const count = Math.ceil(endHour / 24);
  const days = [];
  for (let index = 0; index < count; index += 1) {
    const dayStart = index * 24;
    const segments = [];
    // Padding is explicitly illustrative, not observed driver history.
    if (index === 0 && trip.startHour > 0) {
      segments.push({
        id: "before-trip",
        title: "Before trip (assumed off duty)",
        status: "off_duty",
        start: 0,
        end: trip.startHour,
        miles: 0,
        padding: true,
      });
    }
    for (const event of trip.events) {
      const eventStart = trip.startHour + event.start;
      const eventEnd = trip.startHour + event.end;
      const overlapStart = Math.max(dayStart, eventStart);
      const overlapEnd = Math.min(dayStart + 24, eventEnd);
      if (overlapEnd <= overlapStart) continue;
      segments.push({
        ...event,
        start: overlapStart - dayStart,
        end: overlapEnd - dayStart,
        miles:
          (event.miles * (overlapEnd - overlapStart)) / (eventEnd - eventStart),
      });
    }
    if (index === count - 1 && endHour < dayStart + 24) {
      segments.push({
        id: "after-trip",
        title: "After trip (assumed off duty)",
        status: "off_duty",
        start: endHour - dayStart,
        end: 24,
        miles: 0,
        padding: true,
      });
    }
    const totals = Object.fromEntries(statuses.map((status) => [status.id, 0]));
    for (const segment of segments)
      totals[segment.status] += segment.end - segment.start;
    days.push({
      index,
      segments,
      totals,
      miles: segments.reduce((total, segment) => total + segment.miles, 0),
    });
  }
  return days;
}

export function validateInputs(inputs) {
  const errors = {};
  for (const name of [
    "current_location",
    "pickup_location",
    "dropoff_location",
  ]) {
    if (!validLocation(inputs[name]))
      errors[name] =
        "Search and select a location, or choose a point on the map.";
  }
  const cycle = Number(inputs.cycle_used_hours);
  if (
    inputs.cycle_used_hours === "" ||
    !Number.isFinite(cycle) ||
    cycle < 0 ||
    cycle > 70
  ) {
    errors.cycle_used_hours = "Enter a number between 0 and 70 hours.";
  }
  return errors;
}
