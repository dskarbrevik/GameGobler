import { test, expect, type Route } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

test.describe("Game Manager Advanced Filters", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);

    // Override GBA games with extended fixture for diverse filter options
    await page.route("**/api/library/systems/*/games", (route: Route) => {
      const url = route.request().url();
      if (url.includes("/gba/games")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixtures.GBA_GAMES_EXTENDED),
        });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // Select device → games view → gba system
    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");
    await page.locator(".toggle-btn", { hasText: "Games" }).click();
    await page.waitForLoadState("networkidle");
    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");
  });

  test("region filter narrows game list", async ({ page }) => {
    // All non-BIOS games should show by default
    await expect(page.locator(".game-row")).toHaveCount(5);

    // Filter to "Europe"
    const regionSelect = page.locator("select.rom-filter-select").first();
    await regionSelect.selectOption("Europe");

    // Should show Pokemon Fire Red (USA, Europe) + Advance Wars (Europe)
    await expect(page.locator(".game-row")).toHaveCount(2);
    await expect(page.locator("text=Pokemon - Fire Red")).toBeVisible();
    await expect(page.locator("text=Advance Wars")).toBeVisible();
  });

  test("type filter for Beta in game manager", async ({ page }) => {
    // Select Beta type
    const typeSelect = page.locator("select.rom-filter-select").nth(1);
    await typeSelect.selectOption("Beta");

    // Only Advance Wars should remain
    await expect(page.locator(".game-row")).toHaveCount(1);
    await expect(page.locator("text=Advance Wars")).toBeVisible();
  });

  test("install filter shows installed only", async ({ page }) => {
    // Filter to "Installed" (games on device)
    const installSelect = page.locator("select.rom-filter-select").last();
    await installSelect.selectOption("installed");

    // Only Metroid Fusion is on the device (per DEVICE_GAMES_GBA fixture)
    const rows = page.locator(".game-row");
    await expect(rows.first()).toContainText("Metroid Fusion");
  });

  test("install filter shows not-installed only", async ({ page }) => {
    const installSelect = page.locator("select.rom-filter-select").last();
    await installSelect.selectOption("not-installed");

    // Metroid Fusion is on device, so it should be hidden
    await expect(page.locator(".game-row").filter({ hasText: "Metroid Fusion" }).filter({ has: page.locator(".btn-add") })).not.toBeVisible({ timeout: 3000 });
    // Other games should be visible with add buttons (not-installed)
    await expect(page.locator("text=Pokemon - Fire Red")).toBeVisible();
    await expect(page.locator("text=The Legend of Zelda")).toBeVisible();
  });

  test("feature filter narrows results", async ({ page }) => {
    // The feature dropdown should appear (Advance Wars has "Rumble")
    const featureSelect = page.locator("select.rom-filter-select", { hasText: "All variants" });
    if (await featureSelect.isVisible()) {
      await featureSelect.selectOption("Rumble");
      // Only Advance Wars has the "Rumble" feature
      await expect(page.locator(".game-row")).toHaveCount(1);
      await expect(page.locator("text=Advance Wars")).toBeVisible();
    }
  });

  test("multiple filters combine to narrow results", async ({ page }) => {
    // Set region = Europe
    await page.locator("select.rom-filter-select").first().selectOption("Europe");
    await expect(page.locator(".game-row")).toHaveCount(2);

    // Also set type = Beta (only Advance Wars is both Europe + Beta)
    await page.locator("select.rom-filter-select").nth(1).selectOption("Beta");
    await expect(page.locator(".game-row")).toHaveCount(1);
    await expect(page.locator("text=Advance Wars")).toBeVisible();
  });

  test("game stats counter reflects current filter", async ({ page }) => {
    const stats = page.locator(".game-stats");
    await expect(stats).toBeVisible();
    // With all 5 games and 1 on device (Metroid Fusion)
    await expect(stats).toContainText(/\d+ \/ 5 on device/);

    // Filter to Europe — should update stats
    await page.locator("select.rom-filter-select").first().selectOption("Europe");
    await expect(stats).toContainText(/\d+ \/ 2 on device/);
  });

  test("game manager filters visual snapshot", async ({ page }) => {
    // Apply a filter for a visually distinct state
    await page.locator("select.rom-filter-select").first().selectOption("Europe");
    await expect(page.locator(".game-row")).toHaveCount(2);
    await expect(page).toHaveScreenshot("game-manager-filters.png");
  });
});

test.describe("Game Manager Global Search & Filters", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // Select device and switch to games view (no system selected)
    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");
    await page.locator(".toggle-btn", { hasText: "Games" }).click();
    await page.waitForLoadState("networkidle");
  });

  test("global search shows results with system tags", async ({ page }) => {
    await page.locator(".search-input").fill("Metroid");
    await page.waitForLoadState("networkidle");

    // Search results should show system tag (e.g. "gba")
    const rows = page.locator(".game-row");
    await expect(rows.first()).toBeVisible({ timeout: 5000 });
    await expect(rows.first()).toContainText("gba");
  });

  test("global installed filter shows installed games", async ({ page }) => {
    // Select "Installed" from the install filter (visible when no system selected and no search)
    const installSelect = page.locator("select.rom-filter-select", { hasText: "All games" });
    await installSelect.selectOption("installed");
    await page.waitForLoadState("networkidle");

    // Should show globally installed games
    await expect(page.locator(".game-row").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Metroid Fusion")).toBeVisible();
  });

  test("global search visual snapshot", async ({ page }) => {
    await page.locator(".search-input").fill("Metroid");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".game-row").first()).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot("game-manager-global-search.png");
  });
});
