import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDays,
  clockTime,
  dayDate,
  validateInputs,
} from "../src/lib/timeline.js";
import { exampleInputs, mockTrip } from "../src/data/mockTrip.js";

test("calendar sheets preserve trip mileage and split overnight rest at midnight", () => {
  const days = buildDays(mockTrip);
  assert.equal(days.length, 2);
  assert.equal(
    days.reduce((sum, day) => sum + day.miles, 0),
    726,
  );
  assert.equal(days[0].totals.driving, 11);
  assert.equal(days[1].totals.driving, 2.5);
  const rest = days
    .flatMap((day) => day.segments)
    .filter((segment) => segment.id === "rest");
  assert.deepEqual(
    rest.map((segment) => [segment.start, segment.end]),
    [
      [18.5, 24],
      [0, 4.5],
    ],
  );
  for (const day of days) {
    assert.equal(
      Object.values(day.totals).reduce((sum, value) => sum + value, 0),
      24,
    );
    assert.equal(day.segments[0].start, 0);
    assert.equal(day.segments.at(-1).end, 24);
    day.segments
      .slice(1)
      .forEach((segment, index) =>
        assert.equal(segment.start, day.segments[index].end),
      );
  }
});

test("a trip ending at midnight does not create an empty extra day", () => {
  const trip = {
    ...mockTrip,
    startHour: 23,
    elapsedHours: 1,
    events: [{ id: "drive", status: "driving", start: 0, end: 1, miles: 50 }],
  };
  const days = buildDays(trip);
  assert.equal(days.length, 1);
  assert.equal(days[0].segments.at(-1).end, 24);
  assert.equal(days[0].miles, 50);
});

test("fractional driving across midnight preserves distance", () => {
  const trip = {
    ...mockTrip,
    startHour: 23.5,
    elapsedHours: 1.25,
    events: [
      { id: "drive", status: "driving", start: 0, end: 1.25, miles: 62.5 },
    ],
  };
  const days = buildDays(trip);
  assert.equal(days[0].miles, 25);
  assert.equal(days[1].miles, 37.5);
});

test("form validates required locations and cycle boundaries", () => {
  assert.deepEqual(validateInputs(exampleInputs), {});
  for (const value of ["", "-1", "71", "NaN"])
    assert.ok(
      validateInputs({ ...exampleInputs, cycle_used_hours: value })
        .cycle_used_hours,
    );
  for (const value of ["0", "70", "24.25"])
    assert.deepEqual(
      validateInputs({ ...exampleInputs, cycle_used_hours: value }),
      {},
    );
  assert.ok(
    validateInputs({ ...exampleInputs, pickup_location: "  " }).pickup_location,
  );
});

test("display times and dates do not depend on the browser timezone", () => {
  assert.equal(clockTime(24), "12:00 AM");
  assert.equal(clockTime(18.5), "6:30 PM");
  assert.equal(dayDate("2026-12-31", 1), "Jan 1");
});
