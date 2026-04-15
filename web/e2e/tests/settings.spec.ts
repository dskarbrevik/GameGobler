import { test, expect } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

test.describe("Settings Panel", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("shows current library path", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const input = page.locator(".settings-input[type='text']");
    await expect(input).toHaveValue(fixtures.SETTINGS.library_path!);
  });

  test("shows unzip toggle", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Unzip games on transfer")).toBeVisible();
    await expect(page.locator(".toggle")).toBeVisible();
  });

  test("save button enabled after changing path", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const input = page.locator(".settings-input[type='text']");
    await input.fill("/new/path/to/roms");

    const saveBtn = page.locator("button", { hasText: "Save Settings" });
    await expect(saveBtn).toBeEnabled();
  });

  test("settings page visual snapshot", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("settings-page.png");
  });

  test("saving shows success message", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Save Settings" }).click();
    await expect(page.locator(".success-msg")).toBeVisible();
    await expect(page.locator(".success-msg")).toContainText("Saved");
  });
});
