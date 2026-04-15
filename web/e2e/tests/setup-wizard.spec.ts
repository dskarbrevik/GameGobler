import { test, expect } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

test.describe("Setup Wizard", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { settings: fixtures.SETTINGS_EMPTY });
  });

  test("shows wizard when library_path is empty", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Welcome to GameGobler");
    await expect(page.locator(".setup-wizard")).toBeVisible();
  });

  test("wizard is centered on the page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".setup-card")).toBeVisible();
    await expect(page).toHaveScreenshot("setup-wizard.png");
  });

  test("has browse button and path input", async ({ page }) => {
    await page.goto("/");
    const input = page.locator(".settings-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("placeholder", "/path/to/roms");
  });

  test("Get Started is disabled with empty path", async ({ page }) => {
    await page.goto("/");
    const btn = page.locator("button", { hasText: "Get Started" });
    await expect(btn).toBeDisabled();
  });

  test("Get Started enables when path is typed", async ({ page }) => {
    await page.goto("/");
    await page.locator(".settings-input").fill("/home/user/roms");
    const btn = page.locator("button", { hasText: "Get Started" });
    await expect(btn).toBeEnabled();
  });

  test("submitting wizard navigates to main app", async ({ page }) => {
    // After submitting, re-mock settings to return a configured state
    await page.goto("/");
    await page.locator(".settings-input").fill("/home/user/roms");

    // Intercept the PUT to return configured settings, then re-mock GET
    await page.route("**/api/settings", async (route) => {
      if (route.request().method() === "PUT") {
        // After save, subsequent GETs should return configured settings
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

    await page.locator("button", { hasText: "Get Started" }).click();
    // Should transition to main app with sidebar
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 5000 });
  });
});
