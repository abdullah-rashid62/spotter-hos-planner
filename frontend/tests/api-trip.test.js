import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adaptTrip, hourTicks, timestamp } from "../src/lib/trip.js";
import { requestTrip } from "../src/lib/api.js";

function fixture(name = "trip") {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)),
  );
}

test("adapter preserves backend segments, IDs, totals and coordinates", () => {
  const body = fixture();
  const trip = adaptTrip(body);
  assert.deepEqual(trip.geometry[0][0], [41.8781, -87.6298]);
  assert.equal(trip.days.length, body.daily_logs.length);
  for (const [index, day] of trip.days.entries()) {
    assert.equal(day.miles, body.daily_logs[index].miles);
    assert.equal(
      day.totals.driving * 3600,
      body.daily_logs[index].totals_seconds.driving,
    );
    for (const segment of day.segments.filter((segment) => !segment.padding)) {
      assert.ok(trip.events.some((event) => event.id === segment.id));
      assert.equal(
        segment.start_at,
        body.daily_logs[index].segments.find((s) => s.id === segment.segmentId)
          .start_at,
      );
    }
  }
  assert.equal(
    trip.waypoints.find((point) => point.letter === "B").eventId,
    trip.events.find((event) => event.activity === "pickup").id,
  );
});

test("DST graphs retain 23/25 hours and distinguish repeated wall times", () => {
  for (const [name, hours] of [
    ["fall-back", 25],
    ["spring-forward", 23],
  ]) {
    const trip = adaptTrip(fixture(name));
    const day = trip.days.find((day) => day.hours === hours);
    const ticks = hourTicks(day, trip.timezone);
    assert.equal(ticks.length, hours + 1);
    assert.equal(day.segments.at(-1).end, hours);
    if (hours === 25) {
      assert.ok(
        ticks.some((tick) => tick.label === "1a" && tick.time.includes("CDT")),
      );
      assert.ok(
        ticks.some((tick) => tick.label === "1b" && tick.time.includes("CST")),
      );
    } else assert.ok(!ticks.some((tick) => tick.localHour === 2));
  }
  assert.equal(
    timestamp("2026-10-12T08:00:00-05:00", "America/Chicago"),
    "8:00 AM CDT",
  );
});

test("request sends inputs and exposes field, provider and malformed errors", async (context) => {
  const inputs = fixture().inputs;
  const fetchMock = context.mock.method(
    globalThis,
    "fetch",
    async (url, options) => {
      assert.equal(url, "/api/trips/plan/");
      assert.deepEqual(JSON.parse(options.body), inputs);
      return new Response(
        JSON.stringify({ pickup_location: ["Location not found."] }),
        { status: 400 },
      );
    },
  );
  await assert.rejects(
    requestTrip(inputs),
    (error) => error.fields.pickup_location === "Location not found.",
  );
  fetchMock.mock.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({ detail: "Routing is temporarily unavailable." }),
        { status: 503 },
      ),
  );
  await assert.rejects(
    requestTrip(inputs),
    /Routing is temporarily unavailable/,
  );
  fetchMock.mock.mockImplementation(
    async () => new Response("<html>Proxy error</html>", { status: 502 }),
  );
  await assert.rejects(requestTrip(inputs), /unreadable response/);
});
