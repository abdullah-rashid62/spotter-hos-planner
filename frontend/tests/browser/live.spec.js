import { test, expect } from "@playwright/test";

test("live Django and ORS trip flows through the Vite proxy", async ({
  page,
}) => {
  test.skip(
    process.env.SPOTTER_LIVE_TEST !== "1",
    "Opt in with Django running and an ORS key; consumes provider quota.",
  );
  test.setTimeout(150000);
  await page.goto("/");
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/trips/plan/"),
    { timeout: 125000 },
  );
  await page.getByRole("button", { name: "Generate trip plan" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.route.source).toBe("openrouteservice");
  await expect(page.getByText("Trip plan ready.")).toBeVisible();
  await expect(page.locator(".summary-grid")).toContainText(
    Math.round(body.route.distance_meters / 1609.344).toLocaleString(),
  );
  await page
    .locator(".desktop-tabs")
    .getByRole("button", { name: "Daily logs" })
    .click();
  await expect(page.locator(".print-sheets .daily-log")).toHaveCount(
    body.daily_logs.length,
  );
  await expect(page.locator(".schedule-panel .log-fields")).toContainText(
    `${Math.round(body.daily_logs[0].miles)} mi`,
  );
  await page.screenshot({
    path: ".preview/live-connected.png",
    fullPage: true,
  });
});
