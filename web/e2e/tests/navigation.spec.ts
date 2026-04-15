import { test, expect } from "@playwright/test";
import { mockApi } from "../mock-api";

test.describe("App Shell & Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("redirects / to /devices", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/devices/);
  });

  test("shows sidebar with brand and nav items", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar-brand")).toContainText("GameGobler");
    await expect(page.locator(".nav-btn", { hasText: "Devices" })).toBeVisible();
    await expect(page.locator(".nav-btn", { hasText: "Library" })).toBeVisible();
    await expect(page.locator(".nav-btn", { hasText: "Settings" })).toBeVisible();
  });

  test("devices page renders with sidebar active state", async ({ page }) => {
    await page.goto("/devices");
    await expect(page.locator(".nav-btn.active")).toContainText("Devices");
    await expect(page).toHaveScreenshot("devices-page.png");
  });

  test("navigates to library", async ({ page }) => {
    await page.goto("/");
    await page.locator(".nav-btn", { hasText: "Library" }).click();
    await expect(page).toHaveURL(/\/library/);
    await expect(page.locator(".nav-btn.active")).toContainText("Library");
  });

  test("navigates to settings", async ({ page }) => {
    await page.goto("/");
    await page.locator(".nav-btn", { hasText: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator(".nav-btn.active")).toContainText("Settings");
  });

  test("full app layout screenshot — devices", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("app-layout-devices.png");
  });

  test("full app layout screenshot — library", async ({ page }) => {
    await page.goto("/library");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("app-layout-library.png");
  });

  test("full app layout screenshot — settings", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("app-layout-settings.png");
  });
});
