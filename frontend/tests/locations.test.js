import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCoordinates,
  validLocation,
  searchLocations,
} from "../src/lib/locations.js";
import { validateInputs } from "../src/lib/timeline.js";
import { exampleInputs } from "../src/data/mockTrip.js";

test("coordinates preserve latitude/longitude order and reject invalid numeric input", () => {
  assert.deepEqual(parseCoordinates(" 41.8781, -87.6298 "), {
    label: "41.8781, -87.6298",
    latitude: 41.8781,
    longitude: -87.6298,
  });
  assert.equal(parseCoordinates("100 Main St, Chicago, IL"), null);
  assert.equal(parseCoordinates("0,0").latitude, 0);
  for (const input of ["91, 0", "0, -181", "41.8 -87.6", "41,8,-87,6"])
    assert.throws(() => parseCoordinates(input));
});

test("plain text never counts as a selected location", () => {
  assert.ok(
    validateInputs({ ...exampleInputs, pickup_location: "Chicago" })
      .pickup_location,
  );
  assert.equal(
    validLocation({ label: "Point", latitude: NaN, longitude: 0 }),
    false,
  );
  assert.equal(
    validLocation({ label: "Point", latitude: 0, longitude: Infinity }),
    false,
  );
});

test("address search handles empty, unavailable and malformed responses", async (context) => {
  const mock = context.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "/api/locations/search/?q=100%20Main");
    return new Response(JSON.stringify({ results: [] }));
  });
  assert.deepEqual(await searchLocations("100 Main"), []);
  mock.mock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ detail: "Try later" }), { status: 429 }),
  );
  await assert.rejects(searchLocations("100 Main"), /Try later/);
  mock.mock.mockImplementation(
    async () => new Response(JSON.stringify({ results: [{}] })),
  );
  await assert.rejects(searchLocations("100 Main"), /invalid locations/);
});
