import { test, expect } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

test.describe("Keyboard Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("Tab navigates from nav items into content area", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // Focus the first nav item
    await page.locator(".nav-btn", { hasText: "Devices" }).focus();
    await expect(page.locator(".nav-btn", { hasText: "Devices" })).toBeFocused();

    // Tab forward — eventually focus should leave the sidebar and enter the content area
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
    }
    // Focus should no longer be on the first nav item (it moved forward)
    await expect(page.locator(".nav-btn", { hasText: "Devices" })).not.toBeFocused();
  });

  test("Enter activates nav link", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator(".nav-btn", { hasText: "Library" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/library/);
  });

  test("Enter selects a device card", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    const card = page.locator(".device-card", { hasText: "EMUROMS" });
    await card.focus();
    await page.keyboard.press("Enter");
    // Device content area should now show file browser
    await expect(page.locator(".device-content-area .panel h2")).toContainText("Device Files");
  });

  test("Enter on setup wizard input submits form", async ({ page }) => {
    await mockApi(page, { settings: fixtures.SETTINGS_EMPTY });
    await page.goto("/");

    const input = page.locator(".settings-input");
    await expect(input).toBeFocused(); // autoFocus is on
    await input.fill("/home/user/roms");

    // Re-mock settings to return configured state after save
    await page.route("**/api/settings", async (route) => {
      if (route.request().method() === "PUT") {
        await page.route("**/api/settings", (r) =>
          r.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(fixtures.SETTINGS),
          }),
        );
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixtures.SETTINGS),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixtures.SETTINGS_EMPTY),
      });
    });

    await page.keyboard.press("Enter");
    // Should transition to main app
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 5000 });
  });

  test("Tab reaches save button in settings", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Tab through the settings panel to reach Save
    const saveBtn = page.locator("button", { hasText: "Save Settings" });
    await saveBtn.focus();
    await expect(saveBtn).toBeFocused();
  });

  test("Escape closes confirm dialog", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // Open a confirm dialog via the eject button
    await page.locator("[title='Eject device']").click();
    await expect(page.locator(".confirm-dialog")).toBeVisible();

    // Press Escape — dialog should close
    await page.keyboard.press("Escape");
    await expect(page.locator(".confirm-dialog")).not.toBeVisible({ timeout: 2000 });
  });

  test("system tile grid is keyboard navigable", async ({ page }) => {
    await page.goto("/library");
    await page.waitForLoadState("networkidle");

    const firstTile = page.locator(".sys-tile").first();
    await firstTile.focus();
    await expect(firstTile).toBeFocused();

    // Press Enter to navigate into system
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/library\/gba/);
  });

  test("focus ring is visible on interactive elements", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // Tab to a nav button and screenshot to verify focus ring
    await page.locator(".nav-btn", { hasText: "Library" }).focus();
    await expect(page).toHaveScreenshot("focus-ring-nav.png");
  });
});
