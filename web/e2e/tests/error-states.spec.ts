import { test, expect } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

test.describe("API Error States", () => {
  test("settings save failure shows error", async ({ page }) => {
    await mockApi(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Override PUT to fail
    await page.route("**/api/settings", (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({ status: 500, contentType: "text/plain", body: "Internal server error" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixtures.SETTINGS),
      });
    });

    await page.locator("button", { hasText: "Save Settings" }).click();
    // The mutation error state should display
    await expect(page.locator(".error-msg")).toBeVisible({ timeout: 5000 });
  });

  test("game copy failure shows error toast", async ({ page }) => {
    await mockApi(page, { errors: { gameCopy: true } });
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // Select device and switch to games view
    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");
    await page.locator(".toggle-btn", { hasText: "Games" }).click();
    await page.waitForLoadState("networkidle");

    // Select gba system
    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");

    // Try to add a game not on device
    const addBtn = page.locator(".btn-add").first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      // Should show error toast
      await expect(page.locator(".toast-error")).toBeVisible({ timeout: 5000 });
      await expect(page.locator(".toast-error")).toContainText("Copy failed");
    }
  });

  test("game remove failure shows error toast", async ({ page }) => {
    await mockApi(page, { errors: { gameRemove: true } });
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");
    await page.locator(".toggle-btn", { hasText: "Games" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");

    // Try to remove an installed game
    const removeBtn = page.locator(".btn-danger").first();
    if (await removeBtn.isVisible()) {
      await removeBtn.click();
      // Confirm the removal in the dialog
      const dialog = page.locator(".confirm-dialog");
      if (await dialog.isVisible()) {
        await dialog.locator("button.btn-danger").click();
      }
      await expect(page.locator(".toast-error")).toBeVisible({ timeout: 5000 });
      await expect(page.locator(".toast-error")).toContainText("Remove failed");
    }
  });

  test("empty library path shows setup wizard not crash", async ({ page }) => {
    await mockApi(page, { settings: fixtures.SETTINGS_EMPTY });
    await page.goto("/");
    // Should gracefully show wizard, not an error page
    await expect(page.locator(".setup-wizard")).toBeVisible();
    await expect(page.locator("h1")).toHaveText("Welcome to GameGobler");
  });

  test("error state visual snapshot — settings save error", async ({ page }) => {
    await mockApi(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await page.route("**/api/settings", (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({ status: 500, contentType: "text/plain", body: "Internal server error" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixtures.SETTINGS),
      });
    });

    await page.locator("button", { hasText: "Save Settings" }).click();
    // Wait for error state to render
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("settings-save-error.png");
  });
});
