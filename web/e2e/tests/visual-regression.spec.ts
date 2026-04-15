import { test, expect } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

test.describe("Update Banner", () => {
  test("shows update banner when update is available", async ({ page }) => {
    await mockApi(page, { version: fixtures.VERSION_WITH_UPDATE });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const banner = page.locator(".update-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("0.2.0 available");
  });

  test("no update banner when up to date", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".update-banner")).not.toBeVisible();
  });

  test("update banner visual snapshot", async ({ page }) => {
    await mockApi(page, { version: fixtures.VERSION_WITH_UPDATE });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("update-banner.png");
  });
});

test.describe("Responsive Layout", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("minimum window size (800x600)", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("responsive-800x600.png");
  });

  test("large window (1400x900)", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("responsive-1400x900.png");
  });

  test("library at minimum width", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto("/library");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("responsive-library-800x600.png");
  });

  test("setup wizard at minimum width", async ({ page }) => {
    await mockApi(page, { settings: fixtures.SETTINGS_EMPTY });
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto("/");
    await expect(page.locator(".setup-card")).toBeVisible();
    await expect(page).toHaveScreenshot("responsive-wizard-800x600.png");
  });
});
