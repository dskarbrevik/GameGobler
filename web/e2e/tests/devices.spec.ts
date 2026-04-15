import { test, expect } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

test.describe("Devices Page", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("shows connected device in sidebar", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".device-card", { hasText: "EMUROMS" })).toBeVisible();
  });

  test("device card shows storage info", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    const card = page.locator(".device-card", { hasText: "EMUROMS" });
    await expect(card).toBeVisible();
    // Storage info should be present (free/total)
    await expect(card).toContainText(/GB/i);
  });

  test("selecting device shows file browser", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    // Should show the file list or content area
    await expect(page.locator(".device-content-area")).toBeVisible();
  });

  test("device selected state visual snapshot", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("devices-selected.png");
  });

  test("file browser shows directories and files", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    // Check the file listing area for our mock entries
    const filePanel = page.locator(".device-content-area");
    await expect(filePanel.locator("text=bios")).toBeVisible();
    await expect(filePanel.locator("text=readme.txt")).toBeVisible();
  });

  test("toggle to games view", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator(".toggle-btn", { hasText: "Games" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("devices-games-view.png");
  });

  test("no devices shows empty state", async ({ page }) => {
    await mockApi(page, { devices: fixtures.DEVICES_EMPTY });
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("devices-empty.png");
  });

  test("volume action buttons visible for volume device", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button", { hasText: "Format exFAT" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Initialize ES-DE" })).toBeVisible();
  });
});
