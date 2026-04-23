import { test, expect, type Route } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

test.describe("Library Filtering & Sorting", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);

    // Override GBA games with extended fixture for diverse filtering
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

    await page.goto("/library/gba");
    await page.waitForLoadState("networkidle");
  });

  test("search filters game list by title", async ({ page }) => {
    // All non-BIOS games should be visible initially (5 games)
    await expect(page.locator(".rom-row")).toHaveCount(5);

    // Type "Metroid" in search
    await page.locator("input[placeholder='Search titles...']").fill("Metroid");

    // Only Metroid Fusion should remain
    await expect(page.locator(".rom-row")).toHaveCount(1);
    await expect(page.locator("text=Metroid Fusion")).toBeVisible();
  });

  test("region filter shows matching games", async ({ page }) => {
    // Select "Europe" from region dropdown
    await page.locator("select.rom-filter-select").first().selectOption("Europe");

    // Should show only games with Europe region: Pokemon Fire Red + Advance Wars
    await expect(page.locator("text=Pokemon - Fire Red")).toBeVisible();
    await expect(page.locator("text=Advance Wars")).toBeVisible();
    // USA-only and Japan-only games should not be visible
    await expect(page.locator(".rom-row", { hasText: "Metroid Fusion" })).not.toBeVisible();
    await expect(page.locator(".rom-row", { hasText: "Mario Kart" })).not.toBeVisible();
  });

  test("type filter for Beta shows only beta games", async ({ page }) => {
    // Select "Beta" from type dropdown
    const typeSelect = page.locator("select.rom-filter-select").nth(1);
    await typeSelect.selectOption("Beta");

    // Only Advance Wars should remain
    await expect(page.locator(".rom-row")).toHaveCount(1);
    await expect(page.locator("text=Advance Wars")).toBeVisible();
  });

  test("type filter for Normal shows only normal releases", async ({ page }) => {
    const typeSelect = page.locator("select.rom-filter-select").nth(1);
    await typeSelect.selectOption("normal");

    // Normal games: Metroid Fusion, Pokemon Fire Red, Zelda, Mario Kart (4 games, no Beta, no BIOS)
    await expect(page.locator(".rom-row")).toHaveCount(4);
    await expect(page.locator(".rom-row", { hasText: "Advance Wars" })).not.toBeVisible();
  });

  test("column sort by size reorders games", async ({ page }) => {
    // Click the "Size" column header to sort
    await page.locator(".rom-th", { hasText: "Size" }).click();

    // Get all size cells
    const rows = page.locator(".rom-row");
    const firstTitle = await rows.first().locator(".rom-td-title").textContent();
    // After ascending sort, smallest game (Advance Wars 4MB) should be first
    expect(firstTitle).toContain("Advance Wars");

    // Click again to reverse sort
    await page.locator(".rom-th", { hasText: "Size" }).click();
    const firstTitleDesc = await rows.first().locator(".rom-td-title").textContent();
    // After descending sort, largest games (16MB) should be first
    expect(firstTitleDesc).toContain("Pokemon");
  });

  test("BIOS toggle shows and hides BIOS entries", async ({ page }) => {
    // BIOS should be hidden by default
    await expect(page.locator(".rom-row", { hasText: "GBA BIOS" })).not.toBeVisible();

    // Show BIOS
    await page.locator(".rom-filter-toggle", { hasText: /Show.*BIOS/ }).click();
    await expect(page.locator("text=GBA BIOS")).toBeVisible();
    await expect(page.locator(".rom-row")).toHaveCount(6); // 5 + 1 BIOS

    // Hide BIOS again
    await page.locator(".rom-filter-toggle", { hasText: /Hide BIOS/ }).click();
    await expect(page.locator(".rom-row", { hasText: "GBA BIOS" })).not.toBeVisible();
    await expect(page.locator(".rom-row")).toHaveCount(5);
  });

  test("filter count reflects visible games", async ({ page }) => {
    // Counter shows "X / Y" at full list
    const counter = page.locator(".rom-count");
    await expect(counter).toContainText("5 / 6");

    // Filter to Europe — should update
    await page.locator("select.rom-filter-select").first().selectOption("Europe");
    await expect(counter).toContainText("2 / 6");
  });

  test("library filters visual snapshot", async ({ page }) => {
    // Apply a filter so the filter controls are visible
    await page.locator("select.rom-filter-select").first().selectOption("Europe");
    await expect(page).toHaveScreenshot("library-filters-active.png");
  });
});

test.describe("Cover Scraping", () => {
  test("scrape button triggers progress and shows completion", async ({ page }) => {
    await mockApi(page);
    await page.goto("/library/gba");
    await page.waitForLoadState("networkidle");

    // Click scrape button
    const scrapeBtn = page.locator(".btn-scrape");
    await expect(scrapeBtn).toBeVisible();
    await expect(scrapeBtn).toContainText("Scrape Box Art");
    await scrapeBtn.click();

    // Scrape progress should appear with stats (mock SSE completes instantly)
    await expect(page.locator(".scrape-progress")).toBeVisible({ timeout: 3000 });
    // Should show completion stats: "Done: 1 downloaded, 1 skipped, 1 not found"
    await expect(page.locator(".scrape-stats")).toContainText("Done");
    await expect(page.locator(".scrape-stats")).toContainText("1 downloaded");
    await expect(page.locator(".scrape-stats")).toContainText("1 skipped");
    await expect(page.locator(".scrape-stats")).toContainText("1 not found");
  });

  test("cover scrape progress visual snapshot", async ({ page }) => {
    await mockApi(page);
    await page.goto("/library/gba");
    await page.waitForLoadState("networkidle");

    await page.locator(".btn-scrape").click();
    await expect(page.locator(".scrape-progress")).toBeVisible({ timeout: 3000 });
    await expect(page).toHaveScreenshot("cover-scrape-done.png");
  });
});
