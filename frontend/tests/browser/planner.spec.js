import { test, expect } from "@playwright/test";

test("desktop preview connects itinerary, map, logs, validation and printing", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A better plan. A smoother journey." }),
  ).toBeVisible();
  // Allow a real tile response or the explicit offline state before visual QA.
  await expect(
    page.locator(".leaflet-tile-loaded, .map-offline").first(),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Overnight rest 5h 30m" }).click();
  await expect(page.locator(".map-selection")).toContainText("Chattanooga");
  await page
    .locator(".desktop-tabs")
    .getByRole("button", { name: "Daily logs" })
    .click();
  await expect(page.locator(".schedule-panel .log-selection")).toContainText(
    "Overnight rest",
  );
  await page.getByRole("button", { name: "Day 2" }).click();
  await expect(page.locator(".schedule-panel .log-heading")).toContainText(
    "Tuesday",
  );
  await expect(page.locator(".schedule-panel .log-fields")).toContainText(
    "118 mi",
  );
  await page.getByLabel("Current cycle used").fill("71");
  await page.getByRole("button", { name: "Generate trip plan" }).click();
  await expect(
    page.getByText("Enter a number between 0 and 70 hours."),
  ).toBeVisible();
  await page.getByLabel("Current cycle used").fill("24");
  await page.getByRole("button", { name: "Generate trip plan" }).click();
  await expect(
    page.getByText("Preview refreshed.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: ".preview/desktop.png", fullPage: true });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-sheets")).toBeVisible();
  await expect(page.locator(".print-sheets .daily-log")).toHaveCount(2);
  await page.pdf({
    path: ".preview/sample-logs.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(errors).toEqual([]);
});

test("mobile keeps views readable and confines horizontal scrolling to the log", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".map-section")).not.toBeVisible();
  await page.getByRole("button", { name: "Edit trip" }).click();
  await expect(page.getByLabel("Current location")).toBeVisible();
  await page.getByRole("button", { name: "Generate trip plan" }).click();
  await expect(
    page.getByText("Preview refreshed.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".planner-panel")).not.toBeVisible();
  await page.screenshot({ path: ".preview/mobile.png", fullPage: true });
  await page
    .locator(".mobile-tabs")
    .getByRole("button", { name: "Map", exact: true })
    .click();
  await expect(page.locator(".map-section")).toBeVisible();
  await page.getByRole("button", { name: "Expand map", exact: true }).click();
  await expect(page.locator(".map-expanded")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".map-expanded")).toHaveCount(0);
  await page
    .locator(".mobile-tabs")
    .getByRole("button", { name: "Daily logs" })
    .click();
  await expect(page.locator(".schedule-panel .duty-graph")).toBeVisible();
  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.viewport);
  await page.screenshot({ path: ".preview/mobile-logs.png", fullPage: true });
});

test("map tile failure preserves controls and explains the fallback", async ({
  page,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/");
  await expect(
    page.getByText("Map tiles unavailable.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fit entire route" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overnight rest 5h 30m" }).click();
  await expect(page.locator(".map-selection")).toContainText("Chattanooga");
});

test("keyboard access and small-phone/tablet layouts remain usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to trip results" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#trip-results")).toBeFocused();
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, `page overflow at ${width}px`).toBe(false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".mobile-tabs")
    .getByRole("button", { name: "Daily logs" })
    .click();
  const labels = page.locator(".sticky-duty-labels");
  const before = await labels.boundingBox();
  await page.locator(".schedule-panel .log-scroll").evaluate((element) => {
    element.scrollLeft = 300;
  });
  const after = await labels.boundingBox();
  expect(after.x).toBe(before.x);
});
