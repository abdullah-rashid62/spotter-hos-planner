export async function requestTrip(inputs, signal) {
  const response = await fetch("/api/trips/plan/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
    signal,
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The planning service returned an unreadable response. Please try again.",
    );
  }
  if (!response.ok) {
    const error = new Error(
      body.detail ||
        body.route?.[0] ||
        "Could not generate this trip. Check the details and try again.",
    );
    error.fields = {};
    for (const name of [
      "current_location",
      "pickup_location",
      "dropoff_location",
      "cycle_used_hours",
    ]) {
      if (body[name])
        error.fields[name] = Array.isArray(body[name])
          ? body[name].join(" ")
          : body[name];
    }
    throw error;
  }
  return body;
}
