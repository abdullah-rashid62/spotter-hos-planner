import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/trip.json", import.meta.url)),
);
const fallBack = JSON.parse(
  readFileSync(new URL("../fixtures/fall-back.json", import.meta.url)),
);

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});
async function generate(page, body = fixture) {
  await page.route("**/api/trips/plan/", (route) =>
    route.fulfill({ json: body }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(
    page.getByRole("heading", { name: "Plan your next trip." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^(Plan route|Update route)$/ })
    .click();
  await expect(page.locator(".route-heading")).toBeVisible();
}

test("public landing centers the form and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/trips/plan/", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.goto("/");
  await expect(page.getByLabel("Current location")).toHaveValue("");
  await expect(page.locator(".avatar, .breadcrumb, .preview-pill")).toHaveCount(
    0,
  );
  const form = await page.locator(".planner-panel").boundingBox();
  expect(Math.abs(form.x + form.width / 2 - 720)).toBeLessThan(2);
  await page.screenshot({
    path: ".preview/planner-landing.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Plan route", exact: true }).click();
  await expect(page.getByLabel("Current location")).toBeFocused();
  await page.getByRole("button", { name: "Try an example" }).click();
  await page.getByRole("button", { name: "Plan route", exact: true }).click();
  await expect(page.locator(".route-heading")).toBeVisible();
  const results = await page.locator(".results").boundingBox();
  const moved = await page.locator(".planner-panel").boundingBox();
  expect(moved.x).toBeGreaterThan(results.x + results.width);
  expect(
    await page
      .locator(".planner-panel")
      .evaluate((element) => element.getAnimations().length),
  ).toBe(0);
  await page.screenshot({
    path: ".preview/planner-results.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Plan route", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".preview/planner-landing-mobile.png",
    fullPage: true,
  });
});

test("response drives desktop map, itinerary, daily logs and print", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await generate(page);
  await expect(page.locator(".summary-grid")).toContainText("684");
  await page.getByRole("button", { name: /^Daily rest/ }).click();
  await expect(page.locator(".map-selection")).toContainText("Daily rest");
  await page
    .locator(".desktop-tabs")
    .getByRole("button", { name: "Daily logs" })
    .click();
  await expect(page.locator(".schedule-panel .log-selection")).toContainText(
    "Daily rest",
  );
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.locator(".schedule-panel .log-selection")).toContainText(
    "Daily rest",
  );
  await expect(page.locator(".schedule-panel .log-fields")).toContainText(
    `${Math.round(fixture.daily_logs[1].miles)} mi`,
  );
  await page.getByLabel("Current cycle used").fill("71");
  await page
    .getByRole("button", { name: /^(Plan route|Update route)$/ })
    .click();
  await expect(
    page.getByText("Enter a number between 0 and 70 hours."),
  ).toBeVisible();
  await expect(
    page.getByText("Results are out of date.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: ".preview/connected-desktop.png",
    fullPage: true,
  });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-sheets .daily-log")).toHaveCount(
    fixture.daily_logs.length,
  );
  await expect(page.locator(".print-sheets")).toBeVisible();
  await page.pdf({
    path: ".preview/planned-logs.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(errors).toEqual([]);
});

test("mobile form, map and graph remain readable without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await generate(page);
  await expect(page.locator(".planner-panel")).not.toBeVisible();
  await expect(page.locator(".map-section")).not.toBeVisible();
  await page.getByRole("button", { name: "Edit trip" }).click();
  await expect(page.getByLabel("Current location")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .locator(".mobile-tabs")
    .getByRole("button", { name: "Map", exact: true })
    .click();
  await expect(
    page.getByText("Map tiles unavailable.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand map", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".map-expanded")).toHaveCount(0);
  await page
    .locator(".mobile-tabs")
    .getByRole("button", { name: "Daily logs" })
    .click();
  const labels = page.locator(".sticky-duty-labels");
  const before = await labels.boundingBox();
  await page.locator(".schedule-panel .log-scroll").evaluate((element) => {
    element.scrollLeft = 300;
  });
  expect((await labels.boundingBox()).x).toBe(before.x);
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow at ${width}`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(labels).toBeVisible();
  const container = await page
    .locator(".schedule-panel .log-graph-wrap")
    .boundingBox();
  expect((await labels.boundingBox()).x).toBe(container.x);
  await page.screenshot({
    path: ".preview/connected-mobile.png",
    fullPage: true,
  });
});

test("one pending submission; edits stay stale and retry preserves inputs", async ({
  page,
}) => {
  let release;
  let calls = 0;
  await page.route("**/api/trips/plan/", async (route) => {
    calls += 1;
    expect(route.request().postDataJSON().current_location.latitude).toBe(
      41.8781,
    );
    await new Promise((resolve) => {
      release = resolve;
    });
    await route.fulfill({ json: fixture });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try an example" }).click();
  await page
    .getByRole("button", { name: /^(Plan route|Update route)$/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Planning route" }),
  ).toBeDisabled();
  await page.getByLabel("Current location").fill("Dallas, TX");
  await expect.poll(() => calls).toBe(1);
  release();
  await expect(
    page.getByText("Results are out of date.", { exact: false }),
  ).toBeVisible();
  await page.unroute("**/api/trips/plan/");
  await page.route("**/api/trips/plan/", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Routing is temporarily unavailable." },
    }),
  );
  await page.route("**/api/locations/search/**", (route) =>
    route.fulfill({
      json: {
        results: [
          {
            label: "Dallas, TX",
            latitude: 32.7767,
            longitude: -96.797,
            precision: "locality",
          },
        ],
      },
    }),
  );
  await page
    .locator(".location-field")
    .first()
    .getByRole("button", { name: "Search / locate" })
    .click();
  await page.getByRole("button", { name: /Dallas, TX Approximate/ }).click();
  await page.getByRole("button", { name: "Use this location" }).click();
  await page
    .getByRole("button", { name: /^(Plan route|Update route)$/ })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Routing is temporarily unavailable.",
  );
  await expect(page.getByLabel("Current location")).toHaveValue("Dallas, TX");
  await expect(page.locator(".route-heading")).toContainText("Chicago");
  await page.unroute("**/api/trips/plan/");
  const updated = structuredClone(fixture);
  updated.route.locations.current_location.label = "Dallas, TX";
  await page.route("**/api/trips/plan/", (route) =>
    route.fulfill({ json: updated }),
  );
  await page.getByRole("button", { name: "Retry trip plan" }).click();
  await expect(page.locator(".route-heading")).toContainText("Dallas");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("field validation and network errors are recoverable", async ({
  page,
}) => {
  await page.route("**/api/trips/plan/", (route) =>
    route.fulfill({
      status: 400,
      json: {
        pickup_location: [
          "Location not found. Include a city, state, or full address.",
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Try an example" }).click();
  await page
    .getByRole("button", { name: /^(Plan route|Update route)$/ })
    .click();
  await expect(page.locator("#pickup_location-error")).toContainText(
    "Location not found",
  );
  await expect(page.getByLabel("Pickup location")).toBeFocused();
  await page.unroute("**/api/trips/plan/");
  await page.route("**/api/trips/plan/", (route) => route.abort());
  await page.getByRole("button", { name: "Retry trip plan" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Cannot reach the planning service",
  );
});

test("fall-back logs show 25 elapsed hours and keyboard selection", async ({
  page,
}) => {
  await generate(page, fallBack);
  await page
    .locator(".desktop-tabs")
    .getByRole("button", { name: "Daily logs" })
    .click();
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.locator(".schedule-panel .total-hours")).toContainText(
    "25h",
  );
  await expect(page.locator(".schedule-panel")).toContainText(
    "1a = 1:00 AM CDT; 1b = 1:00 AM CST",
  );
  await page.locator(".schedule-panel .graph-hit").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".schedule-panel .log-selection")).toBeVisible();
});
