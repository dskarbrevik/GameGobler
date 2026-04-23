import { test, expect, type Route } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

test.describe("File Browser Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);

    // Override file listing to be path-aware (returns subdir files for non-root paths)
    await page.route("**/api/devices/files?*", (route: Route) => {
      if (route.request().method() === "DELETE") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"status":"ok"}',
        });
      }
      const url = new URL(route.request().url());
      const path = url.searchParams.get("path") ?? "";
      // Non-root paths: return subdir files
      if (path && !path.startsWith("/Volumes/") && path !== "/sdcard" && path !== "/") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixtures.DEVICE_FILES_SUBDIR),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixtures.DEVICE_FILES),
      });
    });

    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // Select device
    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");
  });

  test("navigate into subdirectory shows subdir files", async ({ page }) => {
    // Root should show directories (gba, nes, snes, bios) and files (readme.txt)
    await expect(page.locator(".file-row", { hasText: "gba" })).toBeVisible();
    await expect(page.locator(".file-row", { hasText: "readme.txt" })).toBeVisible();

    // Click into gba directory
    await page.locator(".file-row-dir .btn-link", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");

    // Should now show subdir files
    await expect(page.locator(".file-row", { hasText: "Metroid Fusion" })).toBeVisible();
    await expect(page.locator(".file-row", { hasText: "Pokemon - Fire Red" })).toBeVisible();
    // Root files should no longer be visible
    await expect(page.locator(".file-row", { hasText: "readme.txt" })).not.toBeVisible();
  });

  test("navigate up returns to root", async ({ page }) => {
    // Navigate into gba
    await page.locator(".file-row-dir .btn-link", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".file-row", { hasText: "Metroid Fusion" })).toBeVisible();

    // Click ".." to navigate up
    await page.locator(".btn-link", { hasText: ".." }).click();
    await page.waitForLoadState("networkidle");

    // Should be back at root
    await expect(page.locator(".file-row", { hasText: "gba" })).toBeVisible();
    await expect(page.locator(".file-row", { hasText: "readme.txt" })).toBeVisible();
  });

  test("breadcrumb shows path segments after navigation", async ({ page }) => {
    // At root, breadcrumb should show "/"
    const breadcrumb = page.locator(".breadcrumb");
    await expect(breadcrumb).toBeVisible();

    // Navigate into gba
    await page.locator(".file-row-dir .btn-link", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");

    // Breadcrumb should now show the path with "gba" segment
    await expect(breadcrumb.locator(".btn-link", { hasText: "gba" })).toBeVisible();
  });

  test("breadcrumb root click navigates to root", async ({ page }) => {
    // Navigate into gba
    await page.locator(".file-row-dir .btn-link", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".file-row", { hasText: "Metroid Fusion" })).toBeVisible();

    // Click root "/" breadcrumb
    await page.locator(".breadcrumb .btn-link").first().click();
    await page.waitForLoadState("networkidle");

    // Should be back at root
    await expect(page.locator(".file-row", { hasText: "gba" })).toBeVisible();
    await expect(page.locator(".file-row", { hasText: "readme.txt" })).toBeVisible();
  });

  test("empty directory shows placeholder", async ({ page }) => {
    // Override to return empty directory for any subdir
    await page.route("**/api/devices/files?*", (route: Route) => {
      if (route.request().method() !== "GET") return route.continue();
      const url = new URL(route.request().url());
      const path = url.searchParams.get("path") ?? "";
      if (path && !path.startsWith("/Volumes/") && path !== "/sdcard" && path !== "/") {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixtures.DEVICE_FILES),
      });
    });

    // Navigate into a directory
    await page.locator(".file-row-dir .btn-link", { hasText: "bios" }).click();
    await page.waitForLoadState("networkidle");

    // Should show empty state
    await expect(page.locator("text=Empty directory")).toBeVisible();
  });

  test("file browser navigation visual snapshot", async ({ page }) => {
    // Navigate into gba to capture breadcrumb + subdir state
    await page.locator(".file-row-dir .btn-link", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("file-browser-subdir.png");
  });
});
