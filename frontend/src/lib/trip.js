const MILES = 1609.344;
const titles = {
  drive: "Drive",
  pickup: "Pickup",
  dropoff: "Drop-off",
  fuel: "Fuel stop",
  daily_rest: "Daily rest",
  cycle_restart: "Cycle restart",
  driving_break: "Driving break",
  before_trip: "Before trip (assumed off duty)",
  after_trip: "After trip (assumed off duty)",
};
const latLng = ([longitude, latitude]) => [latitude, longitude];

function displayEvent(event) {
  return {
    ...event,
    id: event.event_id || event.id,
    segmentId: event.id,
    title: titles[event.activity] || event.activity,
    status: event.duty_status,
    start: event.start_second / 3600,
    end: event.end_second / 3600,
    miles: event.distance_meters / MILES,
    padding: Boolean(event.assumed),
    location: event.location?.label || "Outside planned trip",
    detail: event.reason,
    position: event.start_coordinates ? latLng(event.start_coordinates) : null,
  };
}

// Adapt units and names only. The backend owns scheduling and calendar splitting.
export function adaptTrip(body) {
  if (
    !body.planning ||
    !body.events?.length ||
    !body.daily_logs?.length ||
    !body.route?.geometry
  ) {
    throw new Error(
      "The planning service returned an incomplete trip. Please try again.",
    );
  }
  const events = body.events.map(displayEvent);
  const days = body.daily_logs.map((day, index) => ({
    ...day,
    index,
    hours: day.day_seconds / 3600,
    segments: day.segments.map(displayEvent),
    totals: Object.fromEntries(
      Object.entries(day.totals_seconds).map(([key, seconds]) => [
        key,
        seconds / 3600,
      ]),
    ),
  }));
  const locations = body.route.locations;
  const stops = events.filter((event) => event.status !== "driving");
  const waypoints = [
    {
      kind: "start",
      letter: "A",
      label: locations.current_location.label,
      position: latLng(body.route.legs[0].geometry.coordinates[0]),
      eventId: events[0].id,
    },
    ...stops.map((event, index) => ({
      kind: ["pickup", "dropoff"].includes(event.activity)
        ? "pickup"
        : event.activity === "fuel"
          ? "fuel"
          : "rest",
      letter:
        event.activity === "pickup"
          ? "B"
          : event.activity === "dropoff"
            ? "C"
            : String(index + 1),
      label: `${event.title}: ${event.location}`,
      position: event.position,
      eventId: event.id,
    })),
  ];
  return {
    ...body,
    events,
    days,
    waypoints,
    startDate: days[0].date,
    timezone: body.planning.log_timezone,
    distanceMiles: body.route.distance_meters / MILES,
    elapsedHours: body.elapsed_seconds / 3600,
    geometry: body.route.geometry.coordinates.map((line) => line.map(latLng)),
    labels: {
      start: locations.current_location.label,
      pickup: locations.pickup_location.label,
      end: locations.dropoff_location.label,
    },
  };
}

export function timestamp(value, timezone, options = {}) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...options,
  }).format(new Date(value));
}

export function hourTicks(day, timezone) {
  const ticks = Array.from({ length: day.hours + 1 }, (_, hour) => {
    const instant = new Date(Date.parse(day.start_at) + hour * 3600000);
    const localHour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hourCycle: "h23",
      }).format(instant),
    );
    return {
      hour,
      localHour,
      label:
        localHour === 0 ? "M" : localHour === 12 ? "N" : String(localHour % 12),
      time: timestamp(instant, timezone),
    };
  });
  // Distinguish repeated fall-back clock hours in both the graph and its legend.
  for (const tick of ticks.slice(1, -1)) {
    const repeats = ticks
      .slice(1, -1)
      .filter((item) => item.localHour === tick.localHour);
    if (repeats.length > 1)
      tick.label += String.fromCharCode(97 + repeats.indexOf(tick));
  }
  return ticks;
}
