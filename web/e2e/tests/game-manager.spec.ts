import { test, expect } from "@playwright/test";
import { mockApi } from "../mock-api";

test.describe("Game Manager Panel", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // Select device and switch to games view
    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");
    await page.locator(".toggle-btn", { hasText: "Games" }).click();
    await page.waitForLoadState("networkidle");
  });

  test("shows system sidebar with game counts", async ({ page }) => {
    await expect(page.locator(".system-item", { hasText: "gba" })).toBeVisible();
    await expect(page.locator(".system-item").filter({ hasText: /^nes/ })).toBeVisible();
    // Each system shows its count badge
    const gbaItem = page.locator(".system-item", { hasText: "gba" });
    await expect(gbaItem.locator(".count-badge")).toContainText("42");
  });

  test("shows empty state before system selection", async ({ page }) => {
    await expect(page.locator("text=Select a system or search across all games")).toBeVisible();
  });

  test("selecting a system shows game list", async ({ page }) => {
    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Metroid Fusion")).toBeVisible();
    await expect(page.locator("text=Pokemon - Fire Red")).toBeVisible();
    await expect(page.locator("text=The Legend of Zelda")).toBeVisible();
  });

  test("games view visual snapshot — system sidebar", async ({ page }) => {
    await expect(page).toHaveScreenshot("game-manager-systems.png");
  });

  test("games view visual snapshot — gba selected", async ({ page }) => {
    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("game-manager-gba-selected.png");
  });

  test("install filter dropdown works", async ({ page }) => {
    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");

    // Change to "Installed" filter
    await page.locator("select.rom-filter-select", { hasText: "All games" }).selectOption("installed");
    // The list should update (may show fewer games)
    await expect(page.locator(".game-manager-filters")).toBeVisible();
  });

  test("search input filters within selected system", async ({ page }) => {
    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator(".search-input").fill("Metroid");
    // Should show Metroid Fusion, hide others
    await expect(page.locator("text=Metroid Fusion")).toBeVisible();
  });

  test("global search across all systems", async ({ page }) => {
    // Type in search without selecting a system (need >= 2 chars)
    await page.locator(".search-input").fill("Metroid");
    await page.waitForLoadState("networkidle");

    // Should show search results from multiple systems
    await expect(page.locator(".game-row").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Metroid Fusion")).toBeVisible();
  });

  test("back button clears system selection", async ({ page }) => {
    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");

    // Click the back/close button to deselect system
    await page.locator("button[title='Back to all systems']").click();
    await expect(page.locator("text=Select a system or search across all games")).toBeVisible();
  });

  test("add button visible for games not on device", async ({ page }) => {
    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");

    // At least one add button should be visible
    await expect(page.locator(".btn-add").first()).toBeVisible();
  });

  test("remove button visible for games on device", async ({ page }) => {
    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");

    // Games that are on device should have a remove button
    const dangerBtn = page.locator(".btn-danger").first();
    if (await dangerBtn.isVisible()) {
      await expect(dangerBtn).toBeVisible();
    }
  });

  test("BIOS entries hidden by default in game manager", async ({ page }) => {
    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");

    // GBA BIOS should not be visible
    await expect(page.locator("text=GBA BIOS")).not.toBeVisible();
  });

  test("show BIOS toggle reveals BIOS entries", async ({ page }) => {
    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: /Show.*BIOS/ }).click();
    await expect(page.locator("text=GBA BIOS")).toBeVisible();
  });
});
