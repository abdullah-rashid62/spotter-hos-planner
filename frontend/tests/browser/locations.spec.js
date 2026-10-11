import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/trip.json", import.meta.url)),
);

for (const width of [1280, 390]) {
  test(`suggestions overlay the form without moving fields at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let release;
    await page.route("**/api/locations/search/**", async (route) => {
      await new Promise((resolve) => {
        release = resolve;
      });
      await route.fulfill({
        json: {
          results: Array.from({ length: 5 }, (_, index) => ({
            label: `Washington ${index + 1}, DC, USA`,
            latitude: 38.9,
            longitude: -77,
            precision: "locality",
          })),
        },
      });
    });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const panel = page.locator(".planner-panel");
    const pickup = page.getByLabel("Pickup location", { exact: true });
    const input = page.getByLabel("Current location", { exact: true });
    const panelBefore = await panel.boundingBox();
    const pickupBefore = await pickup.boundingBox();
    await input.fill("washing");
    await expect(page.locator(".location-loading")).toBeVisible();
    expect((await panel.boundingBox()).height).toBeCloseTo(
      panelBefore.height,
      1,
    );
    expect((await pickup.boundingBox()).y).toBeCloseTo(pickupBefore.y, 1);
    await expect.poll(() => Boolean(release)).toBe(true);
    release();
    await expect(page.locator(".location-dropdown")).toBeVisible();
    expect((await panel.boundingBox()).height).toBeCloseTo(
      panelBefore.height,
      1,
    );
    expect((await pickup.boundingBox()).y).toBeCloseTo(pickupBefore.y, 1);
    expect(
      await page
        .locator(".location-results")
        .evaluate((list) => list.scrollHeight > list.clientHeight),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.preview/autocomplete-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("heading", { name: "Plan your next trip." }).click();
    await expect(page.locator(".location-dropdown")).toHaveCount(0);
    await input.focus();
    await expect(page.locator(".location-dropdown")).toBeVisible();
    await input.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(input).toBeFocused();
    await expect(page.locator(".location-dropdown")).toHaveCount(0);
  });
}

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});

test("automatic suggestions require selection and confirmation, then send exact coordinates", async ({
  page,
}) => {
  let searches = 0;
  let submitted;
  const chosen = {
    label: "100 Main Street, Chicago, IL",
    latitude: 41.8781,
    longitude: -87.6298,
  };
  await page.route("**/api/locations/search/**", (route) => {
    searches++;
    return route.fulfill({
      json: {
        results: [
          { ...chosen, precision: "address" },
          {
            label: "Main Street, Springfield, IL",
            latitude: 39.8,
            longitude: -89.6,
            precision: "street",
          },
        ],
      },
    });
  });
  await page.route("**/api/trips/plan/", (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: fixture });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try an example" }).click();
  await page
    .getByLabel("Current location", { exact: true })
    .fill("100 Main Street");
  expect(searches).toBe(0);
  expect(submitted).toBeUndefined();
  await expect(page.getByRole("button", { name: "Find address" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: /Main Street, Springfield/ }),
  ).toContainText("Approximate match");
  await page.getByLabel("Current location", { exact: true }).press("ArrowDown");
  await expect(
    page.getByRole("button", { name: /100 Main Street, Chicago/ }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("41.878100, -87.629800");
  await page.getByRole("button", { name: "Use this location" }).click();
  await expect(page.locator("#current_location-error")).toBeEmpty();
  await page.getByRole("button", { name: "Plan route", exact: true }).click();
  await expect(page.locator(".route-heading")).toBeVisible();
  expect(submitted.current_location).toEqual(chosen);
  expect(searches).toBe(1);
  await page
    .getByLabel("Current location", { exact: true })
    .fill("100 Other Street");
  await expect(
    page.locator(".location-field").first().locator(".location-selected"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Update route", exact: true }).click();
  await expect(page.locator("#current_location-error")).toContainText(
    "Find your address",
  );
});

test("coordinates bypass search; malformed pairs remain editable", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/locations/search/**", (route) => {
    calls++;
    return route.abort();
  });
  await page.goto("/");
  const input = page.getByLabel("Current location", { exact: true });
  await input.fill("91, -87");
  await input.press("Enter");
  await expect(
    page.getByText("Latitude must be between", { exact: false }),
  ).toBeVisible();
  await input.fill("41.8781, -87.6298");
  await input.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Use this location" }).click();
  await expect(page.locator(".location-selected")).toContainText(
    "41.878100, -87.629800",
  );
  expect(calls).toBe(0);
});

test("no match and service failure preserve input; map fallback works with keyboard on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/locations/search/**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.goto("/");
  const input = page.getByLabel("Pickup location", { exact: true });
  await input.fill("Unlisted warehouse");
  await expect(
    page.getByText("Address not found.", { exact: false }),
  ).toBeVisible();
  await expect(input).toHaveValue("Unlisted warehouse");
  await expect(page.locator("#pickup_location-error")).toHaveText(
    "Address not found. Try a more complete address or choose on the map.",
  );
  await expect(
    page.locator(".location-field").nth(1).getByRole("status"),
  ).toHaveCount(1);
  await page.unroute("**/api/locations/search/**");
  await page.route("**/api/locations/search/**", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Address service unavailable." },
    }),
  );
  await input.press("Enter");
  await expect(page.getByText("Address service unavailable.")).toBeVisible();
  await page
    .locator(".location-field")
    .nth(1)
    .getByRole("button", { name: "Choose on map" })
    .click();
  await expect(
    page.getByRole("button", { name: "Use this location" }),
  ).toBeDisabled();
  await page.locator(".location-picker-canvas").focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Use this location" }),
  ).toBeEnabled();
  await page.screenshot({
    path: ".preview/location-picker-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Use this location" }).click();
  await expect(input).toHaveValue(/^Map point:/);
  await expect(input).toBeFocused();
  await page
    .locator(".location-field")
    .nth(1)
    .getByRole("button", { name: "Review / adjust pin" })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(input).toHaveValue(/^Map point:/);
});

test("editing during a search ignores its stale response", async ({ page }) => {
  let release;
  await page.route("**/api/locations/search/**", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("q") === "New address"
    ) {
      return route.fulfill({
        json: {
          results: [
            { label: "New address match", latitude: 41, longitude: -81 },
          ],
        },
      });
    }
    await new Promise((resolve) => {
      release = resolve;
    });
    await route.fulfill({
      json: {
        results: [{ label: "Old address", latitude: 40, longitude: -80 }],
      },
    });
  });
  await page.goto("/");
  const input = page.getByLabel("Current location", { exact: true });
  await input.fill("Old address");
  await expect.poll(() => Boolean(release)).toBe(true);
  await input.fill("New address");
  release();
  await expect(
    page.getByRole("button", { name: /New address match/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Old address/ })).toHaveCount(
    0,
  );
  await expect(input).toHaveValue("New address");
});

test("autocomplete debounces typing, skips short queries, and dismisses with Escape", async ({
  page,
}) => {
  const queries = [];
  await page.route("**/api/locations/search/**", (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("q"));
    return route.fulfill({
      json: {
        results: [
          { label: "Chicago, Illinois", latitude: 41.8, longitude: -87.6 },
        ],
      },
    });
  });
  await page.goto("/");
  await page.clock.install();
  const input = page.getByLabel("Current location", { exact: true });
  await input.fill("Ch");
  await page.clock.fastForward(600);
  expect(queries).toEqual([]);
  await input.fill("Chi");
  await page.clock.fastForward(300);
  await input.fill("Chicago");
  await page.clock.fastForward(499);
  expect(queries).toEqual([]);
  await page.clock.fastForward(1);
  await expect(
    page.getByRole("button", { name: /Chicago, Illinois/ }),
  ).toBeVisible();
  expect(queries).toEqual(["Chicago"]);
  await input.press("Escape");
  await expect(page.locator(".location-results")).toHaveCount(0);
  await expect(input).toHaveValue("Chicago");
});
