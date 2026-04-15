import { test, expect } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

test.describe("Library Panel", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("shows system grid with all systems", async ({ page }) => {
    await page.goto("/library");
    await page.waitForLoadState("networkidle");

    // Verify total count of system tiles matches
    await expect(page.locator(".sys-tile")).toHaveCount(fixtures.SYSTEMS.length);
  });

  test("system tiles show game counts", async ({ page }) => {
    await page.goto("/library");
    await page.waitForLoadState("networkidle");
    // gba has 42 games
    const gbaTile = page.locator(".sys-tile", { hasText: "gba" });
    await expect(gbaTile).toContainText("42");
  });

  test("system grid visual snapshot", async ({ page }) => {
    await page.goto("/library");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("library-system-grid.png");
  });

  test("clicking a system navigates to game list", async ({ page }) => {
    await page.goto("/library");
    await page.waitForLoadState("networkidle");
    await page.locator(".sys-tile", { hasText: "gba" }).click();
    await expect(page).toHaveURL(/\/library\/gba/);
  });

  test("game list shows ROM details", async ({ page }) => {
    await page.goto("/library/gba");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Metroid Fusion")).toBeVisible();
    await expect(page.locator("text=Pokemon - Fire Red")).toBeVisible();
    await expect(page.locator("text=The Legend of Zelda")).toBeVisible();
  });

  test("game list shows BIOS entries when toggled", async ({ page }) => {
    await page.goto("/library/gba");
    await page.waitForLoadState("networkidle");

    // BIOS entries are hidden by default — click the toggle to show them
    await page.locator("button", { hasText: /Show.*BIOS/ }).click();
    await expect(page.getByText("GBA BIOS")).toBeVisible();
  });

  test("game list visual snapshot", async ({ page }) => {
    await page.goto("/library/gba");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("library-game-list-gba.png");
  });

  test("back button returns to system grid", async ({ page }) => {
    await page.goto("/library/gba");
    await page.waitForLoadState("networkidle");
    await page.locator(".btn-back").click();
    await expect(page).toHaveURL(/\/library$/);
  });

  test("empty systems shows placeholder", async ({ page }) => {
    await mockApi(page, { systems: [] });
    await page.goto("/library");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("library-empty.png");
  });
});
