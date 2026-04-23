/**
 * Product-gap regression tests — one test per finding from the product audit.
 * These capture behaviors that were previously untested or broken and ensure
 * they don't regress.
 */
import { test, expect } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

// ─── Volume format label prompt ──────────────────────────────────────────────

test.describe("Volume Format Label Dialog", () => {
  test("format shows in-app label dialog, not browser prompt", async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    const formatBtn = page.locator("button", { hasText: "Format exFAT" });
    await expect(formatBtn).toBeVisible();
    await formatBtn.click();

    // An in-app prompt dialog should appear with a text input
    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible({ timeout: 2000 });
    await expect(dialog.locator("input[type='text']")).toBeVisible();
    await expect(dialog.locator("input[type='text']")).toHaveValue("EMUROMS");
  });

  test("format label dialog can be cancelled without formatting", async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Format exFAT" }).click();
    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible({ timeout: 2000 });

    // Cancel — no format API call should be made
    let formatCalled = false;
    await page.route("**/api/devices/volumes/format", () => { formatCalled = true; });
    await dialog.locator("button", { hasText: "Cancel" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 2000 });
    expect(formatCalled).toBe(false);
  });

  test("format label dialog accepts custom label", async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Format exFAT" }).click();
    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible({ timeout: 2000 });

    // Type a custom label and confirm
    const input = dialog.locator("input[type='text']");
    await input.fill("MYGAMES");

    // Track that the confirm dialog appears next (with danger warning)
    await dialog.locator("button", { hasText: "OK" }).click();

    // A second confirm dialog should appear asking to confirm the destructive action
    const confirmDialog = page.locator(".confirm-dialog");
    await expect(confirmDialog).toBeVisible({ timeout: 2000 });
    await expect(confirmDialog).toContainText("FORMAT");
  });
});

// ─── Game removal confirmation ───────────────────────────────────────────────

test.describe("Game Removal Confirmation", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");
    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");
    await page.locator(".toggle-btn", { hasText: "Games" }).click();
    await page.waitForLoadState("networkidle");
    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");
  });

  test("clicking remove shows confirmation dialog", async ({ page }) => {
    const removeBtn = page.locator(".btn-small.btn-danger").first();
    await expect(removeBtn).toBeVisible({ timeout: 5000 });
    await removeBtn.click();

    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible({ timeout: 2000 });
    await expect(dialog).toContainText("Remove");
  });

  test("cancelling remove keeps game on device", async ({ page }) => {
    const removeBtn = page.locator(".btn-small.btn-danger").first();
    await expect(removeBtn).toBeVisible({ timeout: 5000 });
    await removeBtn.click();

    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible({ timeout: 2000 });

    // Track that no DELETE API call is made
    let apiCalled = false;
    await page.route("**/api/devices/games*", (route) => {
      if (route.request().method() === "DELETE") apiCalled = true;
      return route.continue();
    });

    await dialog.locator("button", { hasText: "Cancel" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 2000 });
    expect(apiCalled).toBe(false);

    // Remove button should still be visible (game still on device)
    await expect(removeBtn).toBeVisible();
  });

  test("confirming remove executes deletion", async ({ page }) => {
    const removeBtn = page.locator(".btn-small.btn-danger").first();
    await expect(removeBtn).toBeVisible({ timeout: 5000 });
    await removeBtn.click();

    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible({ timeout: 2000 });

    await dialog.locator("button.btn-danger").click();
    await expect(dialog).not.toBeVisible({ timeout: 2000 });
  });
});

// ─── Scrape cancel ───────────────────────────────────────────────────────────

test.describe("Cover Scrape Cancel Button", () => {
  test("Cancel button appears while scraping is in progress", async ({ page }) => {
    await mockApi(page);
    // Override to be slow so we can test the cancel state
    await page.route("**/api/library/systems/*/scrape-covers", async (route) => {
      await new Promise((r) => setTimeout(r, 10_000));
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"status":"done","downloaded":0,"skipped":0,"not_found":0,"errors":0,"total":0}\n\n',
      });
    });

    await page.goto("/library/gba");
    await page.waitForLoadState("networkidle");

    const scrapeBtn = page.locator(".btn-scrape");
    await expect(scrapeBtn).toBeVisible();
    await scrapeBtn.click();

    // The button should now read "Cancel Scrape"
    await expect(page.locator(".btn-scrape", { hasText: /Cancel Scrape/i })).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".btn-scrape", { hasText: /Scrape Box Art/i })).not.toBeVisible();
  });

  test("clicking Cancel Scrape stops the operation", async ({ page }) => {
    await mockApi(page);
    await page.route("**/api/library/systems/*/scrape-covers", async (route) => {
      await new Promise((r) => setTimeout(r, 10_000));
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"status":"done","downloaded":0,"skipped":0,"not_found":0,"errors":0,"total":0}\n\n',
      });
    });

    await page.goto("/library/gba");
    await page.waitForLoadState("networkidle");

    await page.locator(".btn-scrape").click();
    await expect(page.locator(".btn-scrape", { hasText: /Cancel/i })).toBeVisible({ timeout: 2000 });

    // Click cancel — button reverts to "Scrape Box Art"
    await page.locator(".btn-scrape").click();
    await expect(page.locator(".btn-scrape", { hasText: /Scrape Box Art/i })).toBeVisible({ timeout: 2000 });
  });
});

// ─── DeviceFilesPanel error state ────────────────────────────────────────────

test.describe("Device Files Error State", () => {
  test("shows error message when file listing fails", async ({ page }) => {
    await mockApi(page);
    // Override files endpoint to fail
    await page.route("**/api/devices/files?*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Internal server error"}' }),
    );

    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    // Should show error state with retry link (not an empty directory)
    await expect(page.locator("text=Failed to load files")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("button", { hasText: "Retry" })).toBeVisible();
  });

  test("retry button re-fetches files", async ({ page }) => {
    await mockApi(page);
    // Always fail initially — react-query retries by default, so we need consistent failure
    await page.route("**/api/devices/files?*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"err"}' }),
    );

    await page.goto("/devices");
    await page.waitForLoadState("networkidle");
    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    // Wait for all retries to exhaust and error state to show
    await expect(page.locator("text=Failed to load files")).toBeVisible({ timeout: 15000 });
    const retryBtn = page.locator("button", { hasText: "Retry" });
    await expect(retryBtn).toBeVisible();

    // Now make the route succeed for the retry
    await page.route("**/api/devices/files?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixtures.DEVICE_FILES),
      }),
    );

    await retryBtn.click();

    // After retry, files should appear
    await expect(page.locator("text=readme.txt")).toBeVisible({ timeout: 5000 });
  });
});

// ─── Update banner ───────────────────────────────────────────────────────────

test.describe("Update Banner", () => {
  test("shows banner with version and link when update is available", async ({ page }) => {
    await mockApi(page, { version: fixtures.VERSION_WITH_UPDATE });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const banner = page.locator(".update-banner");
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText("0.2.0");
    await expect(banner).toHaveAttribute("href", fixtures.VERSION_WITH_UPDATE.release_url!);
  });

  test("no banner when already on current version", async ({ page }) => {
    await mockApi(page);  // VERSION fixture has update_available: false
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".update-banner")).not.toBeVisible();
  });
});

// ─── Accessibility attributes ────────────────────────────────────────────────

test.describe("Accessibility Attributes", () => {
  test("toast container has role=status and aria-live", async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    const container = page.locator(".toast-container");
    await expect(container).toHaveAttribute("role", "status");
    await expect(container).toHaveAttribute("aria-live", "polite");
  });

  test("confirm dialog has role=dialog and aria-modal", async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator("[title='Eject device']").click();
    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toHaveAttribute("role", "dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  test("eject and remove device icons are keyboard-focusable buttons", async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // These should be <button> elements, not <span>
    const ejectBtn = page.locator("[title='Eject device']");
    await expect(ejectBtn).toHaveJSProperty("tagName", "BUTTON");

    const removeBtn = page.locator("[title='Remove device']");
    await expect(removeBtn).toHaveJSProperty("tagName", "BUTTON");
  });

  test("library game search input has aria-label", async ({ page }) => {
    await mockApi(page);
    await page.goto("/library/gba");
    await page.waitForLoadState("networkidle");

    const searchInput = page.locator(".search-bar input[type='text']");
    await expect(searchInput).toHaveAttribute("aria-label", "Search games");
  });

  test("prompt dialog input dialog has role=dialog and aria-modal", async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Format exFAT" }).click();
    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible({ timeout: 2000 });
    await expect(dialog).toHaveAttribute("role", "dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});
